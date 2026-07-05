# Playback artifacts archived (2026-07-05)

The `.playback/` replay-viewer directories under `benchmarks/` and
`throughput-probing/` (~194M of 2026-02-18 benchmark replay logs, timelines,
and snapshots) were archived to slim the working tree:

- Tracked files: removed at commit `58bec29d`'s successor; recoverable via
  `git checkout 58bec29d -- solve/specs/raft-logic-migration/reports`.
- Untracked files (large raw logs): preserved in
  `../playback-archive-2026-07-05.tar.gz` (extract with
  `tar xzf playback-archive-2026-07-05.tar.gz` from
  `solve/specs/raft-logic-migration/`).

The summary reports beside the `.playback/` dirs are untouched.
