import asyncio
import json
import logging
import time

from .media import probe
from .models import Project
from .renderer import Renderer
from .storage import now

log = logging.getLogger(__name__)


class Worker:
    def __init__(self, service):
        self.service = service
        self.store = service.store
        self.task = None
        self.active_id = None
        self.render_task = None
        self.stopping = False
        self.paused = False
        self.idle = asyncio.Event()
        self.idle.set()
        self.cleanup_lock = asyncio.Lock()

    async def start(self):
        # An interrupted render is never reported as successful after restart.
        for row in self.store.rows("SELECT id FROM jobs WHERE status='running'"):
            self.store.update_job(
                row["id"],
                status="failed",
                phase="Interrupted",
                error="Application restarted during render; retry this job.",
            )
        self.task = asyncio.create_task(self.loop())

    async def stop(self):
        self.stopping = True
        if self.render_task:
            self.render_task.cancel()
        if self.task:
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass

    async def cancel(self, job_id):
        job = self.store.job(job_id)
        if job["status"] in ("completed", "failed", "cancelled"):
            return self.service.public_job(job)
        self.store.update_job(job_id, status="cancelled", phase="Cancelled", finished_at=now())
        if job_id == self.active_id and self.render_task:
            self.render_task.cancel()
        return self.service.public_job(self.store.job(job_id))

    async def cancel_and_wait(self, job_id):
        await self.cancel(job_id)
        if self.active_id == job_id:
            await self.idle.wait()

    async def loop(self):
        maintenance = 0
        while not self.stopping:
            if time.monotonic() - maintenance > 10:
                async with self.cleanup_lock:
                    self.store.cleanup_files()
                maintenance = time.monotonic()
            if self.paused:
                await asyncio.sleep(0.05)
                continue
            rows = self.store.rows(
                "SELECT id,document FROM jobs WHERE status='queued' ORDER BY created_at LIMIT 1"
            )
            if not rows:
                await asyncio.sleep(0.3)
                continue
            job = json.loads(rows[0]["document"])
            self.idle.clear()
            self.active_id = job["id"]
            started = time.monotonic()
            self.store.update_job(job["id"], status="running", phase="Starting", started_at=now())
            output = self.store.path(f"renders/{job['id']}.mp4")
            last = [0.0]

            def progress(value, phase, last=last, job_id=job["id"]):
                if time.monotonic() - last[0] > 0.4 or value == 1:
                    last[0] = time.monotonic()
                    self.store.update_job(job_id, progress=round(value, 4), phase=phase)

            renderer = Renderer(self.service)
            self.render_task = asyncio.create_task(
                renderer.render(
                    Project.model_validate(job["snapshot"]),
                    output,
                    progress=progress,
                    **{
                        ("output_settings" if k == "output" else k): v
                        for k, v in job["request"].items()
                        if k != "expected_revision"
                    },
                )
            )
            try:
                await self.render_task
                if self.store.job(job["id"])["status"] != "cancelled":
                    metadata = await asyncio.to_thread(probe, output)
                    from .exporting import resolved_output

                    expected_output = resolved_output(
                        Project.model_validate(job["snapshot"]),
                        job["request"].get("output"),
                        job["request"]["quality"],
                    )
                    if (metadata["width"], metadata["height"]) != (
                        expected_output.width,
                        expected_output.height,
                    ):
                        raise RuntimeError(
                            "Export verification failed: encoded dimensions differ from requested output"
                        )
                    expected = (
                        job["request"]["to_ms"] or Project.model_validate(job["snapshot"]).duration_ms
                    ) - job["request"]["from_ms"]
                    if (
                        abs(metadata["duration_ms"] - expected) > 150
                        or abs((metadata["audio_duration_ms"] or 0) - expected) > 150
                    ):
                        raise RuntimeError(
                            "Export verification failed: audio/video duration differs from timeline"
                        )
                    if self.store.job(job["id"])["status"] == "cancelled":
                        output.unlink(missing_ok=True)
                        continue
                    self.store.update_job(
                        job["id"],
                        status="completed",
                        progress=1,
                        phase="Complete",
                        output_url=f"/media/renders/{job['id']}.mp4",
                        finished_at=now(),
                        render_seconds=round(time.monotonic() - started, 2),
                        metadata=metadata,
                    )
            except asyncio.CancelledError:
                self.store.update_job(job["id"], status="cancelled", phase="Cancelled", finished_at=now())
                output.unlink(missing_ok=True)
                if self.stopping:
                    raise
            except Exception as exc:
                log.exception("Render failed")
                self.store.update_job(
                    job["id"], status="failed", phase="Failed", error=str(exc)[-6000:], finished_at=now()
                )
                output.unlink(missing_ok=True)
            finally:
                self.active_id = None
                self.render_task = None
                self.idle.set()
