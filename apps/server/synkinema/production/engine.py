"""Durable, bounded production tasks shared by MCP and HTTP. No caller-supplied code."""

import asyncio
import hashlib
import json
import os
import shutil
import sys
import tempfile
import wave
import zipfile
from pathlib import Path

import numpy as np
from sqlalchemy import text

from .. import supertonic_tts
from ..api_contract import Asset, VoiceProvider
from ..models import uid
from ..service import Conflict
from ..storage import now
from ..voices import VoiceRequest
from . import remote, transcription
from .contracts import (
    Delivery,
    NarrationTake,
    ProductionTask,
    TrailerImportError,
    Transcribe,
    TranscriberStatus,
    VerificationReport,
    WordTiming,
)
from .layout import caption_layout

TERMINAL = {"completed", "failed", "cancelled"}


def file_sha256(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


class Production:
    def __init__(self, service, inspection, voices):
        self.service, self.store, self.inspection, self.voices = service, service.store, inspection, voices
        self.runner = None
        self.active = None
        self.cancel_event = asyncio.Event()

    def get(self, id):
        rows = self.store.rows("SELECT document FROM production_tasks WHERE id=:id", id=id)
        if not rows:
            raise KeyError("Production task not found")
        return ProductionTask.model_validate_json(rows[0]["document"])

    def list(self):
        return [
            ProductionTask.model_validate_json(r["document"])
            for r in self.store.rows(
                "SELECT document FROM production_tasks ORDER BY created_at DESC LIMIT 100"
            )
        ]

    def update(self, task, **changes):
        with self.store.transaction() as conn:
            row = conn.execute(
                text("SELECT document FROM production_tasks WHERE id=:id"), {"id": task.id}
            ).first()
            current = ProductionTask.model_validate_json(row[0])
            if current.status in TERMINAL:
                return current
            task.cancel_requested = current.cancel_requested
            for k, v in changes.items():
                setattr(task, k, v)
            if task.status == "completed" and task.cancel_requested:
                task.status, task.phase = "cancelled", "Cancelled"
            task.updated_at = now()
            conn.execute(
                text("UPDATE production_tasks SET status=:status,document=:doc WHERE id=:id"),
                {"status": task.status, "doc": task.model_dump_json(), "id": task.id},
            )
        return task

    def enqueue(self, request):
        payload = request.request.model_dump_json()
        with self.store.transaction() as conn:
            row = conn.execute(
                text("SELECT document FROM production_tasks WHERE request_key=:key"),
                {"key": request.request_key},
            ).first()
            if row:
                existing = ProductionTask.model_validate_json(row[0])
                if existing.request.model_dump_json() != payload:
                    raise Conflict("request_key was already used with a different payload")
                return existing
            project_id = getattr(request.request, "project_id", None)
            if project_id:
                self.service.validate_folder(project_id, getattr(request.request, "folder_id", None))
            task = ProductionTask(
                id=uid(),
                request_key=request.request_key,
                request=request.request,
                status="queued",
                phase="Queued",
                progress=0,
                created_at=now(),
                updated_at=now(),
            )
            conn.execute(
                text("INSERT INTO production_tasks VALUES(:id,:key,:status,:doc,:time)"),
                {
                    "id": task.id,
                    "key": task.request_key,
                    "status": task.status,
                    "doc": task.model_dump_json(),
                    "time": task.created_at,
                },
            )
        return task

    async def start(self):
        # Never repeat an uncertain network/provider mutation after a process restart.
        for row in self.store.rows(
            "SELECT document FROM production_tasks WHERE status IN ('queued','running')"
        ):
            task = ProductionTask.model_validate_json(row["document"])
            self.update(
                task,
                status="failed",
                phase="Interrupted by server restart",
                error="Server restarted. Inspect partial results; submit a new request_key for an intentional retry.",
            )
        self.runner = asyncio.create_task(self.loop())

    async def stop(self):
        if self.runner:
            self.runner.cancel()
            try:
                await self.runner
            except asyncio.CancelledError:
                pass
            self.runner = None

    async def wait(self, id, seconds):
        until = asyncio.get_running_loop().time() + seconds
        while True:
            task = self.get(id)
            if task.status in TERMINAL or asyncio.get_running_loop().time() >= until:
                return task
            await asyncio.sleep(min(0.5, max(0, until - asyncio.get_running_loop().time())))

    def cancel(self, id):
        with self.store.transaction() as conn:
            row = conn.execute(text("SELECT document FROM production_tasks WHERE id=:id"), {"id": id}).first()
            if not row:
                raise KeyError("Production task not found")
            task = ProductionTask.model_validate_json(row[0])
            if task.status in TERMINAL:
                return task
            task.cancel_requested = True
            task.updated_at = now()
            if task.status == "queued":
                task.status, task.phase = "cancelled", "Cancelled before execution"
            # Merge against the latest persisted partial result under the same write lock.
            conn.execute(
                text("UPDATE production_tasks SET status=:status,document=:doc WHERE id=:id"),
                {"id": id, "status": task.status, "doc": task.model_dump_json()},
            )
        if self.active == id:
            self.cancel_event.set()
        return task

    async def run(self, args, timeout=600):
        process = await asyncio.create_subprocess_exec(
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env={**os.environ, "PYTHONPATH": str(Path(__file__).resolve().parents[2])},
        )
        output = asyncio.create_task(process.communicate())
        started = asyncio.get_running_loop().time()
        try:
            while not output.done():
                if asyncio.current_task() is self.runner and self.cancel_event.is_set():
                    raise asyncio.CancelledError
                if asyncio.get_running_loop().time() - started > timeout:
                    raise TimeoutError("Media subprocess exceeded its time limit")
                await asyncio.wait({output}, timeout=0.2)
            stdout, stderr = await output
            if process.returncode:
                raise ValueError("Media processing failed: " + stderr.decode(errors="replace")[-2500:])
            return stdout.decode(errors="replace")
        finally:
            if process.returncode is None:
                process.kill()
                await process.wait()
            if not output.done():
                output.cancel()
                await asyncio.gather(output, return_exceptions=True)

    async def loop(self):
        while True:
            rows = self.store.rows(
                "SELECT id FROM production_tasks WHERE status='queued' ORDER BY created_at LIMIT 1"
            )
            if not rows:
                await asyncio.sleep(0.25)
                continue
            task = self.get(rows[0]["id"])
            self.active = task.id
            self.cancel_event.clear()
            if task.cancel_requested:
                self.update(task, status="cancelled", phase="Cancelled")
                continue
            work = Path(tempfile.mkdtemp(prefix=f"production-{task.id}-", dir=self.store.path("uploads")))
            try:
                task = self.update(task, status="running", phase="Preparing", progress=0.01)
                if task.status != "running":
                    continue
                # Coordinate source lifetime with existing media/project/job deletion.
                async with self.inspection.lifecycle:
                    await self.execute(task, work)
                    await self.tick(task)
                self.update(task, status="completed", phase="Complete", progress=1)
            except asyncio.CancelledError:
                self.update(
                    task,
                    status="cancelled" if self.cancel_event.is_set() else "failed",
                    phase="Cancelled" if self.cancel_event.is_set() else "Interrupted",
                    error=None
                    if self.cancel_event.is_set()
                    else "Server stopped; inspect partial results before retrying.",
                )
                if asyncio.current_task().cancelling() or not self.cancel_event.is_set():
                    raise
            except Exception as exc:  # noqa: BLE001 — isolate task failures and persist their real outcome.
                self.update(task, status="failed", phase="Failed", error=str(exc)[:2500])
            finally:
                shutil.rmtree(work, ignore_errors=True)
                self.active = None

    async def tick(self, task, phase=None, progress=None):
        if self.cancel_event.is_set():
            raise asyncio.CancelledError
        if phase:
            self.update(task, phase=phase, progress=min(0.98, max(task.progress, progress or 0)))
        await asyncio.sleep(0)

    async def recognize(self, request, work):
        rows = transcription.status(self.store.root)
        ready = next(x for x in rows if x["model"] == request.model)
        if not ready["runtime_available"] or not ready["installed"]:
            raise ValueError(
                f"Transcriber {request.model} is not installed. Discover production capabilities and run install_transcriber first."
            )
        if request.asset_id:
            asset = self.service.asset(request.asset_id)
            if not asset["has_audio"]:
                raise ValueError("Asset contains no audio")
            path = self.store.path(asset["path"])
            duration = asset["duration_ms"]
        else:
            job = self.store.job(request.job_id)
            _, path, start, end = self.inspection.target(job["project_id"], job_id=request.job_id)
            duration = end - start
        if not duration or duration > 600_000:
            raise ValueError("Transcription supports nonempty audio up to 10 minutes")
        # Decode under a restricted protocol whitelist before passing PCM to the recognizer.
        pcm = work / "recognition.wav"
        await self.run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-protocol_whitelist",
                "file,pipe",
                "-i",
                str(path),
                "-vn",
                "-ac",
                "1",
                "-ar",
                "16000",
                "-y",
                str(pcm),
            ]
        )
        config = work / "recognition.json"
        config.write_text(
            json.dumps(
                {
                    "model_path": str(self.store.root / "models" / "transcriber" / request.model),
                    "media_path": str(pcm),
                    "language": request.language,
                    "model": request.model,
                }
            )
        )
        raw = await self.run([sys.executable, "-m", "synkinema.production.transcription", str(config)])
        words = [WordTiming.model_validate(w) for w in json.loads(raw)]
        return transcription.align(words, request.reference_text, request.language, request.model)

    async def execute(self, task, work):
        r = task.request
        if r.type == "install_voice_model":
            manifest = supertonic_tts.MANIFEST
            destination = self.voices.local.directory
            await self.tick(task, "Checking pinned Supertonic model", 0.02)
            ready = False
            try:
                await asyncio.to_thread(supertonic_tts.verify_model, destination)
                ready = True
            except ValueError:
                pass
            if not ready:
                downloaded = work / "voice-model"
                downloaded.mkdir()
                for i, (name, meta) in enumerate(manifest["files"].items()):
                    await self.tick(
                        task, f"Downloading Supertonic: {name}", 0.05 + 0.85 * i / len(manifest["files"])
                    )
                    path = downloaded / name
                    path.parent.mkdir(parents=True, exist_ok=True)
                    await remote.download(
                        f"https://huggingface.co/{manifest['repo']}/resolve/{manifest['revision']}/{name}",
                        path,
                        limit=meta["size"],
                        tick=lambda: self.tick(task),
                    )
                await asyncio.to_thread(supertonic_tts.verify_model, downloaded)
                await self.tick(task, "Installing checksum-verified model and license", 0.95)
                async with self.voices.lock:
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    backup = work / "previous-voice-model"
                    if destination.exists():
                        shutil.move(destination, backup)
                    try:
                        shutil.move(downloaded, destination)
                    except OSError:
                        if backup.exists():
                            shutil.move(backup, destination)
                        raise
                    self.voices.local.engine = None
                    self.voices.local.load_error = None
            task.result.voice_model = VoiceProvider.model_validate(self.voices.local.status())
        elif r.type == "install_transcriber":
            repo, revision = transcription.MODELS[r.model]
            destination = self.store.root / "models" / "transcriber" / r.model
            if not next(s for s in transcription.status(self.store.root) if s["model"] == r.model)[
                "installed"
            ]:
                download_dir = work / "model"
                download_dir.mkdir()
                for i, name in enumerate(transcription.FILES):
                    await self.tick(task, f"Downloading pinned model: {name}", 0.05 + i * 0.2)
                    await remote.download(
                        f"https://huggingface.co/{repo}/resolve/{revision}/{name}",
                        download_dir / name,
                        tick=lambda: self.tick(task),
                    )
                manifest = {
                    name: hashlib.sha256((download_dir / name).read_bytes()).hexdigest()
                    for name in transcription.FILES
                }
                (download_dir / "synkinema-model.json").write_text(
                    json.dumps({"repository": repo, "revision": revision, "sha256": manifest})
                )
                destination.parent.mkdir(parents=True, exist_ok=True)
                if destination.exists():
                    shutil.rmtree(destination)
                shutil.move(download_dir, destination)
            task.result.model_status = TranscriberStatus.model_validate(
                next(s for s in transcription.status(self.store.root) if s["model"] == r.model)
            )
        elif r.type in ("import_media", "import_steam_trailer", "import_steam_trailers"):
            selections = (
                r.sources
                if r.type == "import_media"
                else r.trailers
                if r.type == "import_steam_trailers"
                else [r]
            )
            games = {}
            for i, selection in enumerate(selections):
                await self.tick(task, f"Importing source {i + 1}/{len(selections)}", i / len(selections))
                try:
                    provenance = None
                    if r.type == "import_media":
                        candidates = [selection]
                    else:
                        if selection.app_id not in games:
                            games[selection.app_id] = await remote.steam_game(selection.app_id)
                        game, raw = games[selection.app_id]
                        candidates = remote.trailer_sources(game, selection)
                        provenance = {
                            "game": game.model_dump(),
                            "movie_id": selection.movie_id,
                            "steam_response": json.loads(raw),
                        }
                    errors = []
                    for attempt, source in enumerate(candidates):
                        directory = work / f"source-{i}-{attempt}"
                        directory.mkdir()
                        try:
                            path = await remote.import_source(
                                source,
                                directory,
                                self.run,
                                lambda phase=None, progress=None, i=i: self.tick(
                                    task, phase, (i + (progress or 0)) / len(selections)
                                ),
                            )
                            await self.tick(task, "Validating imported media")
                            asset = self.service.import_file(
                                path,
                                str(Path(source.filename).with_suffix(path.suffix)),
                                source.tags,
                                source.source or source.url,
                                source.license,
                                r.project_id,
                                r.folder_id,
                            )
                            break
                        except (ValueError, OSError, TimeoutError, remote.httpx.HTTPError) as exc:
                            errors.append(f"Alternative {attempt + 1}: {str(exc)[:600]}")
                        finally:
                            shutil.rmtree(directory, ignore_errors=True)
                    else:
                        raise ValueError("; ".join(errors))
                    # Persist provenance before advertising the validated asset in task results.
                    record = {
                        "request": source.model_dump(),
                        "asset_id": asset["id"],
                        "checksum": asset["checksum"],
                        "imported_at": now(),
                        "steam": provenance,
                    }
                    provenance_path = self.store.path(f"cache/{asset['id']}-provenance.json")
                    records = json.loads(provenance_path.read_text()) if provenance_path.exists() else []
                    records = records if isinstance(records, list) else [records]
                    provenance_path.write_text(json.dumps([*records, record], ensure_ascii=False))
                    task.result.assets.append(Asset.model_validate(asset))
                    self.update(task)
                except (ValueError, OSError, TimeoutError, remote.httpx.HTTPError) as exc:
                    if r.type != "import_steam_trailers":
                        raise
                    task.result.import_errors.append(
                        TrailerImportError(
                            index=i,
                            app_id=selection.app_id,
                            movie_id=selection.movie_id,
                            error=str(exc)[:2000],
                        )
                    )
                    self.update(task)
            if task.result.import_errors:
                raise ValueError(
                    f"{len(task.result.import_errors)} Steam trailer(s) failed; inspect result.import_errors and reuse result.assets. Other selections were attempted; retry only failed selections with a new key."
                )
        elif r.type == "transcribe":
            await self.tick(task, "Recognizing speech", 0.1)
            task.result.transcript = await self.recognize(r, work)
        elif r.type == "prepare_narration":
            ready = next(s for s in transcription.status(self.store.root) if s["model"] == r.model)
            if not ready["installed"] or not ready["runtime_available"]:
                raise ValueError("Install the requested transcriber before synthesizing a narration batch")
            for i, line in enumerate(r.lines):
                await self.tick(task, f"Synthesizing {line.id}", i / len(r.lines))
                take = await self.voices.generate(
                    VoiceRequest(
                        provider="supertonic",
                        project_id=r.project_id,
                        text=line.text,
                        voice_id=r.voice_id,
                        language=r.language,
                        speed=r.speed,
                        steps=r.steps,
                    )
                )
                asset = take["asset"]
                if r.folder_id:
                    asset = self.service.locate_asset(asset["id"], r.project_id, r.folder_id)
                task.result.assets.append(Asset.model_validate(asset))
                self.update(task)
                await self.tick(task, f"Aligning {line.id}", (i + 0.5) / len(r.lines))
                transcript = await self.recognize(
                    Transcribe(
                        asset_id=asset["id"], language=r.language, model=r.model, reference_text=line.text
                    ),
                    work,
                )
                task.result.narration.append(
                    NarrationTake(id=line.id, text=line.text, asset=asset, transcript=transcript)
                )
                self.update(task)
        elif r.type == "generate_score":
            await self.tick(task, "Generating original score", 0.1)
            path = work / "score.wav"
            await self.score(r, path, lambda: self.tick(task))
            asset = self.service.import_file(
                path,
                f"Original {r.mood} score.wav",
                ["original", "music", r.mood],
                f"Procedural score v1; seed={r.seed}; bpm={r.bpm}",
                "Original generated audio; no third-party samples.",
                r.project_id,
                r.folder_id,
            )
            task.result.assets.append(Asset.model_validate(asset))
        elif r.type == "verify_render":
            await self.tick(task, "Decoding completed export", 0.1)
            job = self.store.job(r.job_id)
            p, path, start, end = self.inspection.target(job["project_id"], job_id=r.job_id)
            metadata = json.loads(
                await self.run(
                    ["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(path)]
                )
            )
            await self.run(
                [
                    "ffmpeg",
                    "-v",
                    "error",
                    "-xerror",
                    "-err_detect",
                    "explode",
                    "-threads",
                    "2",
                    "-i",
                    str(path),
                    "-threads",
                    "2",
                    "-f",
                    "null",
                    "-",
                ]
            )
            pcm_hash = (
                await self.run(
                    [
                        "ffmpeg",
                        "-v",
                        "error",
                        "-i",
                        str(path),
                        "-map",
                        "0:a:0?",
                        "-vn",
                        "-f",
                        "hash",
                        "-hash",
                        "sha256",
                        "-",
                    ]
                )
                if any(s["codec_type"] == "audio" for s in metadata["streams"])
                else None
            )
            await self.tick(task, "Measuring sound and caption layout", 0.65)
            audio = await self.inspection._audio(job["project_id"], job_id=r.job_id) if pcm_hash else None
            layout = caption_layout(self.service, p)
            report = {
                "report_version": 1,
                "job_id": r.job_id,
                "project_id": p.id,
                "revision": p.revision,
                "from_ms": start,
                "to_ms": end,
                "decode_passed": True,
                "sha256": file_sha256(path),
                "audio_pcm_hash": pcm_hash.strip() if pcm_hash else None,
                "metadata": metadata,
                "audio": audio,
                "layout": layout.model_dump(),
                "layout_scope": "Complete project revision in project-profile coordinates; export crop/range requires final-frame review.",
                "passed": layout.passed and (not audio or not audio["warnings"]),
                "visual_review_required": True,
                "browser_playback_tested": False,
            }
            if r.transcribe:
                report["transcript"] = (
                    await self.recognize(
                        Transcribe(
                            job_id=r.job_id,
                            language=r.language,
                            model=r.model,
                            reference_text=r.reference_text,
                        ),
                        work,
                    )
                ).model_dump()
                if r.reference_text and (report["transcript"]["match_ratio"] or 0) < 0.65:
                    report["passed"] = False
            task.result.verification = VerificationReport.model_validate(report)
        elif r.type == "package_delivery":
            verification = self.get(r.verification_task_id)
            report = (
                verification.result.verification.model_dump() if verification.result.verification else None
            )
            if (
                verification.status != "completed"
                or not report
                or report["job_id"] != r.job_id
                or not report["decode_passed"]
            ):
                raise ValueError("A completed verification task for this exact job is required")
            job = self.store.job(r.job_id)
            p, path, start, end = self.inspection.target(job["project_id"], job_id=r.job_id)
            sha = file_sha256(path)
            if sha != report["sha256"]:
                raise ValueError("Export bytes changed after verification; verify again")
            caption_text = self.srt(p, r.caption_track_ids, start, end)
            variant = hashlib.sha256(r.model_dump_json().encode()).hexdigest()[:16]
            prefix = f"delivery-{p.id}-r{p.revision}-{r.job_id}-{variant}"
            captions = self.store.path("cache/" + prefix + ".srt")
            captions.write_text(caption_text)
            target = self.store.path("cache/" + prefix + ".zip")
            source_ids = {c.asset_id for t in p.tracks for c in t.clips if c.asset_id}
            sources = [self.service.asset(id) for id in sorted(source_ids)]
            with zipfile.ZipFile(work / "delivery.zip", "w", compression=zipfile.ZIP_STORED) as archive:
                archive.write(path, "final.mp4")
                archive.writestr("project.json", json.dumps(self.service.summary(p), indent=2))
                archive.writestr("sources.json", json.dumps(sources, indent=2))
                archive.writestr("script.txt", p.script)
                archive.writestr("captions.srt", caption_text)
                archive.writestr("verification.json", json.dumps(report, indent=2))
                for asset in sources:
                    provenance = self.store.path(f"cache/{asset['id']}-provenance.json")
                    if provenance.exists():
                        archive.write(provenance, f"provenance/{asset['id']}.json")
            shutil.move(work / "delivery.zip", target)
            task.result.delivery = Delivery(
                project_id=p.id,
                revision=p.revision,
                job_id=r.job_id,
                video_url=job["output_url"],
                bundle_url=f"/media/cache/{target.name}",
                captions_url=f"/media/cache/{captions.name}",
                sha256=sha,
                size_bytes=path.stat().st_size,
                verification_passed=report["passed"],
            )
        else:
            raise ValueError("Unsupported production task")

    @staticmethod
    async def score(r, path, tick):
        if any(x < 0 or x >= r.duration_ms for x in r.accents_ms):
            raise ValueError("Score accents must be within its duration")
        rate = 48000
        rng = np.random.default_rng(r.seed)
        duration = r.duration_ms / 1000
        with wave.open(str(path), "wb") as wav:
            wav.setnchannels(2)
            wav.setsampwidth(2)
            wav.setframerate(rate)
            for offset in range(0, round(duration * rate), rate):
                await tick()
                t = np.arange(offset, min(offset + rate, round(duration * rate))) / rate
                fundamental = 55 if r.mood == "horror" else 110
                signal = 0.035 * (
                    np.sin(2 * np.pi * fundamental * t) + 0.25 * np.sin(2 * np.pi * fundamental * 1.06 * t)
                )
                if r.mood != "ambient":
                    beat = t % (60 / r.bpm)
                    signal += 0.14 * np.sin(2 * np.pi * 43 * beat) * np.exp(-13 * beat)
                for at in r.accents_ms:
                    u = t - at / 1000
                    env = np.exp(-np.abs(u) * 12)
                    signal += 0.02 * rng.normal(size=len(t)) * env + 0.07 * np.sin(2 * np.pi * 39 * u) * env
                signal *= np.minimum(1, t / 0.025) * np.minimum(1, (duration - t) / 0.7)
                pcm = np.clip(np.column_stack((signal, 0.98 * signal)) * 32767, -32768, 32767).astype("<i2")
                wav.writeframes(pcm.tobytes())

    @staticmethod
    def srt(project, track_ids, start=0, end=None):
        ids = track_ids if track_ids is not None else ["captions"]
        tracks = [t for t in project.tracks if t.id in ids and t.kind == "text" and not t.muted]
        if len(tracks) != len(ids):
            raise ValueError("Choose existing unmuted text track IDs for captions")

        def time(ms):
            return f"{ms // 3600000:02}:{ms // 60000 % 60:02}:{ms // 1000 % 60:02},{ms % 1000:03}"

        clips = sorted(
            (
                c
                for t in tracks
                for c in t.clips
                if c.start_ms + c.duration_ms > start and (end is None or c.start_ms < end)
            ),
            key=lambda c: c.start_ms,
        )
        return (
            "\n\n".join(
                f"{i + 1}\n{time(max(start, c.start_ms) - start)} --> {time(min(end or project.duration_ms, c.start_ms + c.duration_ms) - start)}\n{c.text}"
                + (f"\n{c.subtitle}" if c.subtitle else "")
                for i, c in enumerate(clips)
            )
            + "\n"
        )
