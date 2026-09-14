import asyncio
import hashlib
import json
import math
import re

import numpy as np
from PIL import Image, ImageDraw

from .media import font
from .renderer import RENDERER_VERSION, Renderer


class Inspection:
    def __init__(self, service):
        self.service = service
        self.store = service.store
        self.lock = asyncio.Lock()
        self.lifecycle = asyncio.Lock()

    async def preview(self, project_id, revision=None):
        async with self.lifecycle:
            return await self._preview(project_id, revision)

    async def _preview(self, project_id, revision=None):
        project = self.service.get(project_id, revision)
        if not project.duration_ms:
            raise ValueError("Timeline is empty")
        for job in self.service.jobs(project_id):
            if (
                job["status"] == "completed"
                and job["revision"] == project.revision
                and job["request"]["from_ms"] == 0
                and job["request"]["to_ms"] is None
            ):
                rendered = self.store.path(f"renders/{job['id']}.mp4")
                if rendered.exists():
                    return project, rendered
        output = self.store.path(f"cache/preview-{project.id}-r{project.revision}-v{RENDERER_VERSION}.mp4")
        async with self.lock:
            if not output.exists():
                temp = output.with_suffix(".partial.mp4")
                await Renderer(self.service).render(project, temp, quality="preview")
                temp.replace(output)
        return project, output

    def target(self, project_id, revision=None, job_id=None):
        """Resolve a pinned job before considering the caller's current revision."""
        if job_id:
            job = self.store.job(job_id)
            if job["project_id"] != project_id or job["status"] != "completed":
                raise ValueError("Completed render from this project required")
            project = self.service.get(project_id, job["revision"])
            video = self.store.path(f"renders/{job_id}.mp4")
            if not video.is_file():
                raise ValueError("Completed render file is unavailable")
            return project, video, job["request"]["from_ms"], job["request"]["to_ms"] or project.duration_ms
        project = self.service.get(project_id, revision)
        return project, None, 0, project.duration_ms

    async def frame(self, project_id, time_ms, revision=None, job_id=None):
        async with self.lifecycle:
            return await self._frame(project_id, time_ms, revision, job_id)

    async def _frame(self, project_id, time_ms, revision=None, job_id=None):
        project, video, start, end = self.target(project_id, revision, job_id)
        if not start <= time_ms < end:
            raise ValueError(f"Frame timestamp outside inspected range [{start}, {end}) ms")
        if video is None:
            project, video = await self._preview(project_id, project.revision)
        stat = video.stat()
        media_key = hashlib.sha256(f"{video}:{stat.st_size}:{stat.st_mtime_ns}".encode()).hexdigest()[:12]
        output = self.store.path(f"cache/frame-{project.id}-r{project.revision}-{media_key}-{time_ms}.png")
        if not output.exists():
            # Seek to the frame containing the requested time, including the last
            # frame interval. Seeking after its PTS can succeed without writing an image.
            frame_index = (time_ms - start) * project.profile.fps // 1000
            seek = max(0, frame_index / project.profile.fps - 0.000001)
            await Renderer(self.service).run(
                ["-ss", str(seek), "-i", str(video), "-frames:v", "1", str(output)]
            )
            if not output.is_file():
                raise ValueError("No video frame available at this timestamp")
        return {
            "project_id": project_id,
            "revision": project.revision,
            "job_id": job_id,
            "from_ms": start,
            "to_ms": end,
            "time_ms": time_ms,
            "output_time_ms": time_ms - start,
            "url": f"/media/{output.relative_to(self.store.root)}",
            "path": str(output),
        }

    def points(self, project_id, revision=None):
        project = self.service.get(project_id, revision)
        points = set()
        for t in project.tracks:
            if t.kind in ("video", "text"):
                for c in t.clips:
                    points.add(min(project.duration_ms - 1, c.start_ms + c.duration_ms // 2))
                    if c.transition.type != "cut":
                        points.add(c.start_ms + c.transition.duration_ms // 2)
        return {"revision": project.revision, "timestamps_ms": sorted(points)[:24]}

    async def sheet(self, project_id, timestamps=None, revision=None, job_id=None):
        async with self.lifecycle:
            return await self._sheet(project_id, timestamps, revision, job_id)

    async def _sheet(self, project_id, timestamps=None, revision=None, job_id=None):
        project, _, start, end = self.target(project_id, revision, job_id)
        times = timestamps or [
            ms for ms in self.points(project_id, project.revision)["timestamps_ms"] if start <= ms < end
        ]
        if not times and job_id and end > start:
            times = [start + (end - start) // 2]
        if any(not start <= ms < end for ms in times):
            raise ValueError(f"Frame timestamp outside inspected range [{start}, {end}) ms")
        if not times or len(times) > 24:
            raise ValueError("Choose between 1 and 24 frames")
        frames = [await self._frame(project_id, ms, project.revision, job_id) for ms in times]
        width = 240
        height = round(width * project.profile.height / project.profile.width)
        cols = min(4, len(frames))
        image = Image.new("RGB", (cols * width, math.ceil(len(frames) / cols) * (height + 36)), "#111616")
        d = ImageDraw.Draw(image)
        for i, frame in enumerate(frames):
            x, y = (i % cols) * width, (i // cols) * (height + 36)
            with Image.open(frame["path"]) as f:
                image.paste(f.resize((width, height)), (x, y))
            d.text(
                (x + 10, y + height + 8),
                f"{frame['time_ms'] / 1000:06.2f}s · r{project.revision}",
                font=font(15),
                fill="#d8fb76",
            )
        digest = hashlib.sha256(json.dumps([f["path"] for f in frames]).encode()).hexdigest()[:12]
        output = self.store.path(f"cache/sheet-{project_id}-r{project.revision}-{digest}.jpg")
        image.save(output, quality=90)
        return {
            "revision": project.revision,
            "job_id": job_id,
            "from_ms": start,
            "to_ms": end,
            "timestamps_ms": times,
            "url": f"/media/{output.relative_to(self.store.root)}",
            "path": str(output),
        }

    async def audio(self, project_id, revision=None, job_id=None):
        async with self.lifecycle:
            return await self._audio(project_id, revision, job_id)

    async def _audio(self, project_id, revision=None, job_id=None):
        project, video, offset, end = self.target(project_id, revision, job_id)
        if video is None:
            project, video = await self._preview(project_id, project.revision)
        renderer = Renderer(self.service)
        stats = await renderer.measure(video, project.profile)
        # EBU R128 is measured, never inferred from RMS.
        log = await renderer.run(
            ["-loglevel", "info", "-i", str(video), "-vn", "-af", "ebur128=peak=true", "-f", "null", "-"]
        )
        measurements = []
        for match in re.finditer(r"t:\s*([\d.]+).*?M:\s*([-\d.]+)\s+S:\s*([-\d.]+)", log):
            t, momentary, short = map(float, match.groups())
            if not measurements or t - measurements[-1]["time_ms"] / 1000 >= 0.45:
                measurements.append(
                    {"time_ms": round(t * 1000), "momentary_lufs": momentary, "short_term_lufs": short}
                )
        audio_out = self.store.path(f"cache/audio-{project.id}-r{project.revision}-{job_id or 'preview'}.wav")
        await renderer.run(
            ["-i", str(video), "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(audio_out)]
        )
        import wave

        with wave.open(str(audio_out), "rb") as wav:
            samples = (
                np.frombuffer(wav.readframes(wav.getnframes()), dtype=np.int16).astype(np.float32) / 32768
            )
        windows = []
        for i in range(0, len(samples), 8000):
            part = samples[i : i + 8000]
            rms = float(20 * np.log10(max(1e-9, np.sqrt(np.mean(part**2)))))
            peak = float(20 * np.log10(max(1e-9, np.max(np.abs(part)))))
            ms = round(i / 16000 * 1000) + offset
            active = [
                t.name
                for t in project.tracks
                if not t.muted
                and t.kind in ("voiceover", "music", "sound", "ambient")
                and any(c.start_ms < ms + len(part) / 16 and c.start_ms + c.duration_ms > ms for c in t.clips)
            ]
            windows.append(
                {
                    "time_ms": ms,
                    "duration_ms": round(len(part) / 16),
                    "rms_dbfs": round(rms, 2),
                    "sample_peak_dbfs": round(peak, 2),
                    "active_tracks": active,
                    "silence": rms < -50,
                    "clipping": peak >= -0.05,
                }
            )

        def number(key):
            n = float(stats[key])
            return round(n, 2) if math.isfinite(n) else None

        warnings = []
        loudness, peak = number("input_i"), number("input_tp")
        if loudness is None:
            warnings.append(
                {
                    "type": "unmeasurable_audio",
                    "message": "Audio is silent or too short to measure integrated loudness",
                }
            )
        if peak is not None and peak > project.profile.true_peak + 0.2:
            warnings.append(
                {
                    "type": "true_peak_high",
                    "message": f"True peak {peak} dBTP exceeds {project.profile.true_peak} dBTP target",
                }
            )
        if loudness is not None and abs(loudness - project.profile.target_lufs) > 1.5:
            warnings.append(
                {
                    "type": "loudness_off_target",
                    "message": f"Measured {loudness} LUFS; target {project.profile.target_lufs} LUFS",
                }
            )
        im = Image.new("RGB", (1280, 480), "#111717")
        d = ImageDraw.Draw(im)
        d.text((32, 22), f"AUDIO INSPECTION  /  r{project.revision}", font=font(22, True), fill="#d8fb76")
        d.text((32, 60), f"{loudness} LUFS  ·  {peak} dBTP  ·  500 ms windows", font=font(18), fill="white")
        for db in (0, -12, -24, -36, -48, -60):
            yy = 120 + (-db / 60) * 260
            d.line((60, yy, 1248, yy), fill="#2c3936")
            d.text((8, yy - 8), str(db), font=font(14), fill="#81938c")
        step = 1180 / max(1, len(windows))
        for i, window in enumerate(windows):
            x = 64 + i * step
            y = 120 + min(60, -window["rms_dbfs"]) / 60 * 260
            color = "#fa7373" if window["clipping"] else "#68849a" if window["silence"] else "#d8fb76"
            d.rectangle((x, y, x + max(1, step - 2), 380), fill=color)
        d.text(
            (32, 426),
            "RMS dBFS by window · LUFS / true peak measured independently with FFmpeg",
            font=font(16),
            fill="#9caea7",
        )
        output = audio_out.with_suffix(".png")
        im.save(output)
        result = {
            "job_id": job_id,
            "from_ms": offset,
            "to_ms": end,
            "revision": project.revision,
            "integrated_lufs": loudness,
            "true_peak_dbtp": peak,
            "loudness_range": number("input_lra"),
            "target_lufs": project.profile.target_lufs,
            "windows": windows,
            "ebu_r128": measurements,
            "warnings": warnings,
            "map_url": f"/media/{output.relative_to(self.store.root)}",
            "audio_url": f"/media/{audio_out.relative_to(self.store.root)}",
            "map_path": str(output),
        }
        output.with_suffix(".json").write_text(json.dumps(result, ensure_ascii=False, indent=2))
        return result
