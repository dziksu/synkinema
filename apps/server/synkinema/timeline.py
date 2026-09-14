"""Track occupancy rules for writes, with readable legacy snapshots kept intact."""


def lane_overlaps(project):
    """Return ordinary overlaps; explicit primary-video transitions are validated separately."""
    for track in project.tracks:
        if track.kind == "video":
            continue
        clips = sorted(track.clips, key=lambda c: c.start_ms)
        for i, left in enumerate(clips):
            for right in clips[i + 1 :]:
                if right.start_ms >= left.start_ms + left.duration_ms:
                    break
                yield track, left, right


def signature(track, left, right):
    return track.id, tuple(sorted((c.id, c.start_ms, c.duration_ms) for c in (left, right)))


def validate_lane_edits(project, previous=None):
    """Reject every new/retimed overlap, even on muted tracks. Legacy timing can be read/repaired."""
    legacy = {signature(t, a, b) for t, a, b in lane_overlaps(previous)} if previous else set()
    for track, left, right in lane_overlaps(project):
        if signature(track, left, right) not in legacy:
            raise ValueError(
                f"Clips '{left.name}' and '{right.name}' overlap on track '{track.name}'. "
                "Use a free time slot or a separate track of the same type."
            )
