# Native attempt 1 — retained RED, 2026-10-12

Run: 38228726123; job: 114742605048; submitted head:
`a40630f7c34b85fcb5b7fa38dffc51319cb9416d`.
Baseline metadata/attempt commit created by the canonical producers:
`5b843336ff69874c302c45ea0e5e0297373a37a8`.
Production source was checked byte-identical to the inherited TX1 snapshot
`4151a3ab4cf3859651507d2f575a49754deb8f61`; runtime Git blob:
`54fe5ceed1a390cfacbdcdc20f7b4778937cce07`.

The actual native baseline engaged four integration cases: control passed;
missing-glue, changed-glue and repeated-refusal failed. All three negative
cases reached `recover-from-other-group`: the other group answered
`CORE_REFUSED`, reason `invalid handle`, phase `status`, after a rejected
shared-runtime load. The control recreated both groups and retained old/new
markers in real SQLite files. This is a real operation-port/raft-rs/SQLite
witness with an injected native-boundary trap, not a multi-host or SQL-engine
certification. Suite output: 4 tests, 1 pass, 3 fail, no skipped/todo/cancelled.

Orchestration defect: GitHub ran measurement steps with `bash -e`; the script's
`set -uo pipefail` did not disable inherited errexit. The expected nonzero
baseline therefore stopped the workflow before status capture, candidate,
revert, existing cone or source publication. Correct this by explicitly
capturing expected-failure outcomes with `set +e`; retain the final semantic
proof gate and all test assertions unchanged. No candidate native pass is
claimed by this attempt.

Downloaded artifact `rs-raft-native-load-recovery-38228726123-1`, ID
11737966124, ZIP SHA256
`ca6f76a9cada3c4c2e235273135553574fe9562e7392ed0263c6a87135046d98`
was verified against the upload result. It retains full baseline.log (including
per-case child receipts), exact runtime source, install/metadata logs, Solver
attempt and baseline SHA. The original failed run remains retained.

No independent approval, Quest landing, main integration or release occurred.
