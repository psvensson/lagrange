# Rolling-Restart Recovery-Ready Timeout Follow-Up

## Status

Superseded on 2026-04-21 by
[Startup-rejoin priority-recovery under load closure](./superseded-20260421-startup-rejoin-priority-recovery-under-load-closure.md).

This package originally isolated the first real `rolling-restart`
recovery-ready symptom after the stop/start and learner-promotion blockers were
removed.

Later scenario evidence showed that the restart recovery stall is not an
independent runtime bug. It shares one startup/rejoin priority-recovery-under-
load boundary with `node-join-under-load`.

No further work proceeds here independently.
