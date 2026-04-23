# Node-Join Real Convergence Timeout Follow-Up

## Status

Superseded on 2026-04-21 by
[Startup-rejoin priority-recovery under load closure](./superseded-20260421-startup-rejoin-priority-recovery-under-load-closure.md).

This package originally isolated the first real `node-join-under-load`
convergence symptom after the harness blocker was removed.

Later scenario evidence showed that the node-join timeout is not an independent
runtime bug. It shares one startup/rejoin priority-recovery-under-load boundary
with `rolling-restart`.

No further work proceeds here independently.
