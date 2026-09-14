# Timeline editing basics

The track header's ellipsis opens rename, move up/down and removal controls.
Populated tracks require confirming the number of clips. Removal is one atomic
`remove_track` operation with explicit `remove_clips=true`, without a clip-count limit. Source media remains available;
Undo restores the prior project revision. A changed clip inventory rejects the
removal, and failed writes restore the optimistic timeline.

Each audio track has a -60 to +12 dB fader. Dragging previews locally; release
saves one revision. Escape cancels an unreleased adjustment. Track gain adds to
clip gain (or its automation) before fades, ducking and final mix normalization.
The default is 0 dB for existing projects. `update_track.changes.gain_db` is shared
by Studio, REST and MCP and is ignored on visual tracks.

Audio clips show a volume envelope. Drag a flat line vertically to change the
clip level. Alt-click the line to add a point; drag points to change their time
and level. Right-click a point or press Delete while it is focused to remove it;
Up/Down adjusts a focused point by 1 dB. The selected-clip toolbar also provides
volume at the playhead, add/clear points and fade-in/out durations. Clearing
points keeps the current playhead level as the clip's constant gain. Time is
clip-local, keyframes are unique and ordered, and other animation properties
are preserved. At most 64 gain points are supported.

The live preview applies gain automation and fades. Web Audio supports positive
gain in browsers that provide AudioContext; the native media fallback caps gain
at unity. Preview is an audition of clip/track levels, not a loudness-normalized
final mix. Existing export normalization and sidechain processing still apply.

Selected clips expose split at playhead, duplicate and delete. Splitting requires
at least 100 ms on each side. Duplication uses the existing backend placement
rules. A fixed-height control area prevents track lanes jumping during selection.

## Reference and next priorities

The initial scope follows common editing controls described by
[Adobe: track volume and keyframes](https://helpx.adobe.com/premiere/desktop/add-audio-effects/adjust-volume-and-levels/adjust-track-volume.html)
and [Blackmagic Design: Edit page](https://www.blackmagicdesign.com/products/davinciresolve/edit).
The next useful additions are actual decoded waveforms, temporary solo audition,
track locking enforced by all editing surfaces, multi-selection, markers and
explicit ripple-delete. These are not implemented by this change. Ripple and
locking need shared backend semantics before UI shortcuts are added.
