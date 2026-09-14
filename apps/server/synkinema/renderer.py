"""Typed timeline -> cached clips -> native FFmpeg. No shell or browser runtime."""

import asyncio
import hashlib
import json
import math
import os
from itertools import pairwise
from pathlib import Path

from .exporting import composition_profile, framing_filter, resolved_output
from .media import cached_text_layer
from .models import ANIMATION_BOUNDS, EFFECT_BOUNDS, Project

RENDERER_VERSION = 6

TRANSITIONS = {
    "crossfade": "fade",
    "fade_black": "fadeblack",
    "slide": "slideleft",
    "wipe": "wipeleft",
    "zoom": "custom",
    "blur": "hblur",
}


def transition_filter(kind, seconds, offset):
    result = f"xfade=transition={TRANSITIONS[kind]}:duration={seconds}:offset={offset}"
    if kind == "zoom":
        # Native zoomin collapses the outgoing image into a single pixel. Keep
        # both shots recognizable: at most 18% magnification, with a crossfade.
        # FFmpeg's P runs from 1 (outgoing) to 0 (incoming).
        def sample(source, zoom):
            xy = f"W/2+(X-W/2)/({zoom}),H/2+(Y-H/2)/({zoom})"
            planes = [f"{source}{plane}({xy})" for plane in range(4)]
            return f"if(eq(PLANE,0),{planes[0]},if(eq(PLANE,1),{planes[1]},if(eq(PLANE,2),{planes[2]},{planes[3]})))"

        outgoing = sample("a", "1+0.18*(1-P)")
        incoming = sample("b", "1+0.18*P")
        result += f":expr='{outgoing}*P+{incoming}*(1-P)'"
    return result


CAPABILITIES = {
    "renderer": "ffmpeg",
    "editing_helpers": [
        "append_clip",
        "duplicate_clip",
        "extract_audio",
        "atomic_batch",
        "dry_run",
        "clone_project",
        "preflight",
    ],
    "agent_guide_url": "/api/agent/guide",
    "project_schema_url": "/api/schema/project",
    "operation_reference_url": "/api/schema/operations",
    "effect_bounds": EFFECT_BOUNDS,
    "animation_bounds": ANIMATION_BOUNDS,
    "limits": {
        "batch_operations": 100,
        "primary_video_tracks": 1,
        "tracks": 32,
        "clips_per_track": 500,
        "clips_per_project": 1000,
        "duration_ms": 86400000,
        "inspection_frames": 24,
        "rest_upload_bytes": 2147483648,
        "mcp_upload_decoded_bytes": 12582912,
    },
    "transitions": ["cut", *TRANSITIONS],
    "effects": ["blur", "brightness", "contrast", "saturation", "grayscale", "vignette", "sharpen"],
    "animations": ["scale", "x", "y", "opacity", "gain_db"],
    "easing": ["linear", "ease_in", "ease_out", "ease_in_out"],
    "caption_styles": ["editorial", "bold", "boxed", "minimal"],
    "shapes": ["rectangle", "ellipse", "line"],
    "audio": ["gain", "fade", "ducking", "two_pass_loudnorm"],
    "inspection": ["frame", "contact_sheet", "preview", "audio_map"],
    "notes": [
        "One primary video track; additional visual layers use overlay tracks.",
        "Primary video clips must be ordered; transitions consume an explicit overlap.",
        "Ordinary clips cannot overlap on a single track of any kind, even muted. Use separate same-kind tracks for simultaneous content; all writes reject new/retimed overlaps (422). Legacy snapshots remain readable with preflight warnings.",
        "Video source audio must be placed on an audio track to be included.",
        "Use set_transition to compute overlap/ripple; low-level clip edits do not snap or retime animations.",
        "Splitting animated clips is unsupported; disable animations before split.",
        "Clip placement sets canvas center x/y and width/height in frame fractions; transform.x/y are crop anchors. Overlay tracks also accept assetless rectangle, ellipse and line shapes.",
    ],
}


def expression(clip, prop, variable="t"):
    default = clip.gain_db if prop == "gain_db" else getattr(clip.transform, prop)
    animation = next((a for a in clip.animations if a.property == prop), None)
    if not animation:
        return str(default)
    keys = animation.keyframes
    result = str(keys[-1].value)
    for left, right in reversed(list(pairwise(keys))):
        start, end = left.time_ms / 1000, right.time_ms / 1000
        u = f"clip(({variable}-{start})/{end - start},0,1)"
        if right.easing == "ease_in":
            u = f"pow({u},2)"
        elif right.easing == "ease_out":
            u = f"(1-pow(1-{u},2))"
        elif right.easing == "ease_in_out":
            u = f"({u}*{u}*(3-2*{u}))"
        value = f"({left.value}+({right.value - left.value})*{u})"
        result = f"if(lt({variable},{end}),{value},{result})"
    return f"if(lt({variable},{keys[0].time_ms / 1000}),{keys[0].value},{result})"


def validate_timeline(project):
    videos = [t for t in project.tracks if t.kind == "video" and t.clips]
    if sum(not t.muted for t in videos) > 1:
        raise ValueError("Use one primary video track and overlay tracks for additional layers")
    for track in videos:
        end = 0
        ordered = sorted(track.clips, key=lambda c: c.start_ms)
        for i, c in enumerate(ordered):
            if not i and c.transition.type != "cut":
                raise ValueError("First video clip must use cut")
            overlap = c.transition.duration_ms if i and c.transition.type != "cut" else 0
            if overlap and abs(c.start_ms - (end - overlap)) > 2:
                raise ValueError(
                    f"Transition into '{c.name}' needs {overlap}ms overlap: start at {end - overlap}ms"
                )
            if not overlap and c.start_ms < end:
                raise ValueError(f"Overlapping clip '{c.name}' requires a transition")
            if overlap and overlap >= ordered[i - 1].duration_ms:
                raise ValueError("Transition exceeds preceding clip duration")
            if i > 1 and c.start_ms < ordered[i - 2].start_ms + ordered[i - 2].duration_ms:
                raise ValueError("A video transition cannot overlap more than two clips")
            end = c.start_ms + c.duration_ms


class Renderer:
    def __init__(self, service):
        self.service = service
        self.store = service.store
        self.process = None
        self.threads = max(1, min(int(os.environ.get("SYNKINEMA_FFMPEG_THREADS", "4")), 16))

    async def run(self, args, progress=None, duration=0):
        # FFmpeg codec options apply to the next file, not the entire command.
        # Bound every decoder: dozens of layered inputs otherwise each create
        # an automatic CPU-sized pool (over 600 threads in a 27-second reel).
        decoder_threads = max(1, self.threads // max(1, args.count("-i")))
        bounded = []
        for arg in args[:-1]:
            if arg == "-i":
                bounded.extend(["-threads", str(decoder_threads)])
            bounded.append(arg)
        # All renderer commands have one final output, including null analysis.
        bounded.extend(["-threads", str(self.threads), args[-1]])
        self.process = await asyncio.create_subprocess_exec(
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-filter_threads",
            str(self.threads),
            "-filter_complex_threads",
            "1",
            *bounded,
            "-progress",
            "pipe:1",
            "-nostats",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        proc = self.process

        async def errors():
            tail = bytearray()
            while chunk := await proc.stderr.read(8192):
                tail.extend(chunk)
                if len(tail) > 64000:
                    del tail[:-64000]
            return bytes(tail).decode(errors="replace")

        error_task = asyncio.create_task(errors())
        try:
            while line := await proc.stdout.readline():
                decoded = line.decode(errors="replace").strip()
                if progress and duration and decoded.startswith("out_time_us="):
                    try:
                        progress(min(0.99, int(decoded.split("=", 1)[1]) / 1_000_000 / duration))
                    except ValueError:
                        pass
            code = await proc.wait()
            stderr = await error_task
            if code:
                raise RuntimeError(stderr[-6000:] or f"FFmpeg exited with code {code}")
            return stderr
        except BaseException:
            if proc.returncode is None:
                proc.terminate()
                try:
                    await asyncio.wait_for(proc.wait(), 3)
                except TimeoutError:
                    proc.kill()
                    await proc.wait()
            if not error_task.done():
                error_task.cancel()
            raise
        finally:
            self.process = None

    async def visual_clip(self, clip, profile, transparent=False):
        asset = self.service.asset(clip.asset_id)
        key = visual_cache_key(clip, asset["checksum"], profile, transparent)
        suffix = ".mkv" if transparent else ".mp4"
        output = self.store.path(f"cache/clip-{key}{suffix}")
        if output.exists():
            return output
        temp = output.with_suffix(f".partial{suffix}")
        source = self.store.path(asset["path"])
        w, h, fps = profile.width, profile.height, profile.fps
        duration = clip.duration_ms / 1000
        args = (
            ["-loop", "1", "-framerate", str(fps)]
            if asset["kind"] == "image"
            else ["-ss", str(clip.source_in_ms / 1000)]
        ) + ["-i", str(source)]
        filters = [f"setpts=(PTS-STARTPTS)/{clip.speed}", f"fps={fps}"]
        mode = clip.transform.fit
        moving = any(a.property in ("scale", "x", "y") for a in clip.animations)
        # Static footage needs one high-quality resize, not a 2x enlargement
        # followed by zoompan's downsample. Supersample only animated cameras.
        factor = min(2 if moving else clip.transform.scale, 3840 / max(w, h))
        iw, ih = max(w, round(w * factor / 2) * 2), max(h, round(h * factor / 2) * 2)
        if transparent:
            filters += ["format=rgba"]
        if mode == "cover":
            crop_zoom = 1 if moving else clip.transform.scale
            filters += [
                f"crop=w='max(2,min(iw,ih*{w}/{h})/{crop_zoom})':h='max(2,min(ih,iw*{h}/{w})/{crop_zoom})':x='(iw-ow)*{clip.transform.x}':y='(ih-oh)*{clip.transform.y}'",
                f"scale={iw if moving else w}:{ih if moving else h}:flags=lanczos",
            ]
        else:
            filters += [
                f"scale={iw}:{ih}:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos",
                f"pad={iw}:{ih}:(ow-iw)/2:(oh-ih)/2:color={'black@0' if transparent else 'black'}",
            ]
        z = expression(clip, "scale", f"on/{fps}")
        x = expression(clip, "x", f"on/{fps}")
        y = expression(clip, "y", f"on/{fps}")
        if not moving:
            if mode == "contain":
                cw = max(2, round(iw / clip.transform.scale / 2) * 2)
                ch = max(2, round(ih / clip.transform.scale / 2) * 2)
                filters += [f"crop={cw}:{ch}:(iw-ow)*{clip.transform.x}:(ih-oh)*{clip.transform.y}"]
                if (cw, ch) != (w, h):
                    filters += [f"scale={w}:{h}:flags=lanczos"]
            filters += ["setsar=1"]
        elif transparent:
            # Scale/crop keeps the alpha plane; zoompan discards transparency.
            z, x, y = (expression(clip, prop, "t") for prop in ("scale", "x", "y"))
            filters += [
                f"scale=w='{w}*({z})':h='{h}*({z})':eval=frame:flags=lanczos",
                f"crop={w}:{h}:x='(iw-ow)*({x})':y='(ih-oh)*({y})'",
                "setsar=1",
            ]
        else:
            filters += [
                f"zoompan=z='{z}':x='(iw-iw/zoom)*({x})':y='(ih-ih/zoom)*({y})':d=1:s={w}x{h}:fps={fps}",
                "setsar=1",
            ]
        if clip.transform.rotation:
            filters += [
                f"rotate={clip.transform.rotation}*PI/180:fillcolor={'black@0' if transparent else 'black'}"
            ]
        for effect in clip.effects:
            if not effect.enabled:
                continue
            e, v = effect.type, effect.value
            if e == "blur" and v:
                filters += [f"gblur=sigma={v}"]
            elif e in ("brightness", "contrast", "saturation"):
                filters += [f"eq={e}={v}"]
            elif e == "grayscale" and v:
                filters += [f"hue=s={1 - v}"]
            elif e == "vignette" and v:
                filters += [f"vignette=angle={v}*PI/3"]
            elif e == "sharpen" and v:
                filters += [f"unsharp=5:5:{v}"]
        if clip.fade_in_ms:
            filters += [f"fade=t=in:d={clip.fade_in_ms / 1000}"]
        if clip.fade_out_ms:
            filters += [f"fade=t=out:st={duration - clip.fade_out_ms / 1000}:d={clip.fade_out_ms / 1000}"]
        if clip.transform.opacity < 1 or any(a.property == "opacity" for a in clip.animations):
            opacity = expression(clip, "opacity", "T")
            filters += [
                f"geq=lum='lum(X,Y)*({opacity})':cb='128+(cb(X,Y)-128)*({opacity})':cr='128+(cr(X,Y)-128)*({opacity})'"
            ]
        await self.run(
            [
                *args,
                "-vf",
                ",".join(filters),
                "-t",
                str(duration),
                "-an",
                "-c:v",
                "ffv1" if transparent else "libx264",
                "-preset",
                "veryfast",
                "-crf",
                str(min(profile.crf, 14) if profile.crf < 27 else profile.crf),
                "-pix_fmt",
                "bgra" if transparent else "yuv420p",
                "-threads",
                str(self.threads),
                str(temp),
            ]
        )
        temp.replace(output)
        return output

    async def render(
        self,
        project: Project,
        output: Path,
        quality="final",
        progress=lambda p, phase: None,
        from_ms=0,
        to_ms=None,
        output_settings=None,
    ):
        validate_timeline(project)
        target = resolved_output(project, output_settings, quality)
        profile = composition_profile(project, target)
        w, h, fps = profile.width, profile.height, profile.fps
        duration = project.duration_ms / 1000
        active = [t for t in project.tracks if not t.muted]
        visual = [(t, c) for t in active if t.kind in ("video", "overlay") for c in t.clips if not c.shape]
        rendered = {}
        for i, (track, clip) in enumerate(visual):
            progress(0.03 + 0.48 * i / max(1, len(visual)), f"Preparing clip {i + 1}/{len(visual)}")
            visual_source, box_profile = prepare_visual(clip, profile, track.kind == "overlay")
            rendered[clip.id] = await self.visual_clip(
                visual_source, box_profile, transparent=track.kind == "overlay"
            )
        args, graph, index = [], [], 0
        primary = next((t for t in active if t.kind == "video" and t.clips), None)
        sequence = sorted(primary.clips, key=lambda c: c.start_ms) if primary else []
        previous = None
        end = 0.0

        # Every normalized input has identical dimensions, FPS and timebase.
        def blank(seconds):
            nonlocal index
            args.extend(["-f", "lavfi", "-t", str(seconds), "-i", f"color=c=0x080e10:s={w}x{h}:r={fps}"])
            label = f"src{index}"
            graph.append(f"[{index}:v]settb=AVTB,setpts=PTS-STARTPTS[{label}]")
            index += 1
            return label

        def concat(a, b, label):
            graph.append(f"[{a}][{b}]concat=n=2:v=1:a=0[{label}]")
            return label

        for i, clip in enumerate(sequence):
            start, length = clip.start_ms / 1000, clip.duration_ms / 1000
            if start > end + 0.002:
                gap = blank(start - end)
                previous = concat(previous, gap, f"gap{i}") if previous else gap
                end = start
            args += ["-i", str(rendered[clip.id])]
            label = f"src{index}"
            placement = clip.placement
            if placement.width != 1 or placement.height != 1 or placement.x != 0.5 or placement.y != 0.5:
                pw, ph = (
                    max(2, round(w * placement.width / 2) * 2),
                    max(2, round(h * placement.height / 2) * 2),
                )
                px, py = round(w * placement.x - pw / 2), round(h * placement.y - ph / 2)
                graph += [
                    f"color=c=black:s={w}x{h}:r={fps}:d={length}[canvas{index}]",
                    f"[{index}:v]scale={pw}:{ph}:flags=lanczos,setpts=PTS-STARTPTS[placed{index}]",
                    f"[canvas{index}][placed{index}]overlay=x={px}:y={py}:shortest=1,settb=AVTB,setpts=PTS-STARTPTS[{label}]",
                ]
            else:
                graph += [f"[{index}:v]settb=AVTB,setpts=PTS-STARTPTS[{label}]"]
            index += 1
            if previous:
                combined = f"seq{i}"
                if clip.transition.type != "cut":
                    transition = transition_filter(
                        clip.transition.type, clip.transition.duration_ms / 1000, start
                    )
                    graph += [f"[{previous}][{label}]{transition}[{combined}]"]
                    previous = combined
                else:
                    previous = concat(previous, label, combined)
            else:
                previous = label
            end = start + length
        if not previous:
            previous = blank(duration)
        elif duration > end + 0.002:
            previous = concat(previous, blank(duration - end), "tail")
        for track in active:
            if track.kind not in ("text", "overlay"):
                continue
            for clip in track.clips:
                if track.kind == "text" or clip.shape:
                    png = cached_text_layer(clip, w, h, self.store.path("cache"))
                    # Stop producing full-frame PNGs when this layer ends.
                    # An unlimited image loop keeps decoding/fading even after
                    # overlay's enable expression has hidden the caption.
                    args += [
                        "-loop",
                        "1",
                        "-framerate",
                        str(fps),
                        "-t",
                        str(clip.duration_ms / 1000),
                        "-i",
                        str(png),
                    ]
                else:
                    args += ["-i", str(rendered[clip.id])]
                filters = ["format=rgba"]
                px, py = 0, 0
                if track.kind == "overlay" and not clip.shape:
                    p = clip.placement
                    pw, ph = max(2, round(w * p.width / 2) * 2), max(2, round(h * p.height / 2) * 2)
                    px, py = round(w * p.x - pw / 2), round(h * p.y - ph / 2)
                    filters += [f"scale={pw}:{ph}:flags=lanczos"]
                if clip.transform.opacity < 1:
                    filters += [f"colorchannelmixer=aa={clip.transform.opacity}"]
                if any(a.property == "opacity" for a in clip.animations):
                    opacity = expression(clip, "opacity", "T")
                    filters += [f"geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*({opacity})'"]
                fade = clip.fade_in_ms
                if fade:
                    filters += [f"fade=t=in:st=0:d={fade / 1000}:alpha=1"]
                if clip.fade_out_ms:
                    filters += [
                        f"fade=t=out:st={(clip.duration_ms - clip.fade_out_ms) / 1000}:d={clip.fade_out_ms / 1000}:alpha=1"
                    ]
                filters += [f"setpts=PTS-STARTPTS+{clip.start_ms / 1000}/TB"]
                graph += [
                    f"[{index}:v]{','.join(filters)}[layer{index}]",
                    f"[{previous}][layer{index}]overlay=x={px}:y={py}:eof_action=pass:enable='gte(t,{clip.start_ms / 1000})*lt(t,{(clip.start_ms + clip.duration_ms) / 1000})'[over{index}]",
                ]
                previous = f"over{index}"
                index += 1
        length = ((to_ms or project.duration_ms) - from_ms) / 1000
        # Select the range before encoding, retaining the selected quality and
        # avoiding a second lossy video encode with FFmpeg's default CRF 23.
        selection_filter = f"trim=start={from_ms / 1000}:duration={length},setpts=PTS-STARTPTS"
        graph += [f"[{previous}]{selection_filter},{framing_filter(target)},format=yuv420p[vout]"]
        audio_labels, voice_labels, music_labels = [], [], []
        for track in active:
            if track.kind in ("video", "overlay", "text"):
                continue
            for clip in track.clips:
                asset = self.service.asset(clip.asset_id)
                args += ["-i", str(self.store.path(asset["path"]))]
                f = [
                    f"atrim=start={clip.source_in_ms / 1000}:duration={clip.duration_ms / 1000 * clip.speed}",
                    "asetpts=PTS-STARTPTS",
                    "aresample=48000",
                    "aformat=sample_fmts=fltp:channel_layouts=stereo",
                ]
                speed = clip.speed
                while speed > 2:
                    f += ["atempo=2"]
                    speed /= 2
                while speed < 0.5:
                    f += ["atempo=0.5"]
                    speed *= 2
                if speed != 1:
                    f += [f"atempo={speed}"]
                f += ["asetpts=N/SR/TB", f"volume='pow(10,({expression(clip, 'gain_db')})/20)':eval=frame"]
                if track.gain_db:
                    f += [f"volume={track.gain_db}dB"]
                if clip.fade_in_ms:
                    f += [f"afade=t=in:d={clip.fade_in_ms / 1000}"]
                if clip.fade_out_ms:
                    f += [
                        f"afade=t=out:st={(clip.duration_ms - clip.fade_out_ms) / 1000}:d={clip.fade_out_ms / 1000}"
                    ]
                f += [
                    f"adelay={clip.start_ms}:all=1",
                    f"apad=whole_len={round(duration * 48000)}",
                    f"atrim=end_sample={round(duration * 48000)}",
                    "asetpts=N/SR/TB",
                ]
                label = f"aud{index}"
                graph += [f"[{index}:a]{','.join(f)}[{label}]"]
                if track.kind == "voiceover":
                    voice_labels.append(label)
                elif track.kind == "music" and track.ducking:
                    music_labels.append(label)
                else:
                    audio_labels.append(label)
                index += 1

        def mix(labels, out):
            graph.append(
                "".join(f"[{l}]" for l in labels)
                + f"amix=inputs={len(labels)}:duration=longest:normalize=0,asetpts=N/SR/TB[{out}]"
            )
            return out

        if voice_labels:
            voice = mix(voice_labels, "voices")
            if music_labels:
                graph += [f"[{voice}]asplit=2[voiceout][sidechain]"]
                music = mix(music_labels, "musicmix")
                graph += [
                    f"[{music}][sidechain]sidechaincompress=threshold=0.025:ratio=8:attack=20:release=350[ducked]"
                ]
                audio_labels += ["voiceout", "ducked"]
            else:
                audio_labels += [voice]
        else:
            audio_labels += music_labels
        if audio_labels:
            mix(audio_labels, "master")
            graph += [
                f"[master]apad=whole_len={round(duration * 48000)},atrim=start={from_ms / 1000}:duration={length},asetpts=N/SR/TB[aout]"
            ]
        else:
            args += ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"]
            graph += [f"[{index}:a]atrim=duration={length}[aout]"]
        raw = output.with_suffix(".mix.mp4")
        progress(0.53, "Compositing timeline")
        await self.run(
            [
                *args,
                "-filter_complex",
                ";".join(graph),
                "-map",
                "[vout]",
                "-map",
                "[aout]",
                "-t",
                str(length),
                "-c:v",
                "libx264",
                "-preset",
                "veryfast" if quality == "preview" else "medium",
                "-crf",
                str(profile.crf),
                "-threads",
                str(self.threads),
                "-c:a",
                "aac",
                "-b:a",
                "192k",
                "-ar",
                "48000",
                "-movflags",
                "+faststart",
                str(raw),
            ],
            lambda p: progress(0.53 + 0.32 * p, "Compositing timeline"),
            length,
        )
        if profile.normalize and audio_labels:
            progress(0.86, "Measuring loudness · pass 1/2")
            stats = await self.measure(raw, profile)
            progress(0.92, "Normalizing audio · pass 2/2")
            finite = all(
                math.isfinite(float(stats[k]))
                for k in ("input_i", "input_tp", "input_lra", "input_thresh", "target_offset")
            )
            af = f"loudnorm=I={profile.target_lufs}:TP={profile.true_peak}:LRA=11"
            if finite:
                af += f":measured_I={stats['input_i']}:measured_TP={stats['input_tp']}:measured_LRA={stats['input_lra']}:measured_thresh={stats['input_thresh']}:offset={stats['target_offset']}:linear=true"
            await self.run(
                [
                    "-i",
                    str(raw),
                    "-t",
                    str(length),
                    "-c:v",
                    "copy",
                    "-af",
                    af,
                    "-c:a",
                    "aac",
                    "-b:a",
                    "192k",
                    "-ar",
                    "48000",
                    "-movflags",
                    "+faststart",
                    str(output),
                ]
            )
            progress(0.97, "Checking encoded audio peaks")
            await self.protect_audio_peak(output, profile, length)
        else:
            raw.replace(output)
        raw.unlink(missing_ok=True)
        progress(1, "Complete")
        return output

    async def protect_audio_peak(self, output, profile, duration):
        """AAC can overshoot loudnorm's ceiling; check the encoded result itself."""
        safe = output.with_suffix(".peak.mp4")
        try:
            for attempt in range(3):
                stats = await self.measure(output, profile)
                peak = float(stats["input_tp"])
                if not math.isfinite(peak) or peak <= profile.true_peak:
                    return
                if attempt == 2:
                    raise RuntimeError("Encoded audio exceeds the project's true-peak ceiling")
                gain = profile.true_peak - peak - 0.5
                await self.run(
                    [
                        "-i",
                        str(output),
                        "-t",
                        str(duration),
                        "-c:v",
                        "copy",
                        "-af",
                        f"volume={gain}dB",
                        "-c:a",
                        "aac",
                        "-b:a",
                        "192k",
                        "-ar",
                        "48000",
                        "-movflags",
                        "+faststart",
                        str(safe),
                    ]
                )
                safe.replace(output)
        finally:
            safe.unlink(missing_ok=True)

    async def measure(self, path, profile):
        stderr = await self.run(
            [
                "-loglevel",
                "info",
                "-i",
                str(path),
                "-af",
                f"loudnorm=I={profile.target_lufs}:TP={profile.true_peak}:LRA=11:print_format=json",
                "-vn",
                "-f",
                "null",
                "-",
            ]
        )
        return json.loads(stderr[stderr.rfind("{") : stderr.rfind("}") + 1])


def visual_cache_key(clip, checksum, profile, transparent):
    return hashlib.sha256(
        json.dumps(
            {
                "clip": clip.model_dump(),
                "checksum": checksum,
                "profile": profile.model_dump(),
                "renderer": RENDERER_VERSION,
                "transparent": transparent,
            },
            sort_keys=True,
        ).encode()
    ).hexdigest()


def prepare_visual(clip, profile, transparent):
    source = clip
    if transparent:
        source = clip.model_copy(
            update={
                "transform": clip.transform.model_copy(update={"opacity": 1}),
                "animations": [a for a in clip.animations if a.property != "opacity"],
                "fade_in_ms": 0,
                "fade_out_ms": 0,
            }
        )
    box_profile = profile.model_copy(
        update={
            "width": max(2, round(profile.width * clip.placement.width / 2) * 2),
            "height": max(2, round(profile.height * clip.placement.height / 2) * 2),
        }
    )
    return source, box_profile
