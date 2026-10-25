# Package 2 — exact-source harnessd Lab request, queued behind controller pause

**Observation time:** 2026-10-25 15:50 UTC. **Classification:** admitted and queued; **no Lab test execution and no Lab PASS**. The cloud configured seven-file **196-assertion PASS**, source review and original failed attempts remain separately recorded in [Package 2 evidence](PACKAGE2-METRIC-RUNNER-SEVEN-FILE-EVIDENCE.md).

## Execution identity and immutable source

- Lab issue: [psvensson/lagrange-lab #2035](https://github.com/psvensson/lagrange-lab/issues/2035).
- Controller: `b4a2e06c193c44b09f1b67d02e8d80f4`; authenticated principal `github:psvensson`, pool `default`. Installed controller version `0.2.2`, source `53e262450fada3b4e706898201a3c732811ae4d0` (observed, not inferred from a branch).
- Original request: `28f8cf2327564073a9db7d222a08d79c`; logical UUID `28f8cf23-2756-4073-a9db-7d222a08d79c`; `harnessd-lab-work-v1`, one-part delivery digest `b2eefc4814eef126cb931b975a231efe278b0a17726156ad49e1e53208d1f016` over **6,611 canonical bytes**.
- Requested source: `psvensson/lagrange` commit `32a53e4c1b20e326252c420d53c0b98616707f14` on `refs/heads/work/cloud-package2-runner-metric-evidence-20261025`; exact remote tree `a4b234f6156b8d6a732eb8fbaee8e24d25640969`. The pinned SHA, rather than branch head, is the execution identity.
- Work: single Node-capable host, preference `tv-dator`; `npm ci` then the original **seven** metric-script test files through the repository's `npm run test:file`; `TAP_TIMEOUT_FLOOR=120` (established CI setting), `LAGRANGE_LANE_JOBS_CAP=1`, `LAGRANGE_RETRY_FAILED_ONCE=0`, `LAGRANGE_PLACEMENT=local`, 3600-second workload bound. The original evidence collector would stream exact named TAP, stderr and report artifacts into the owned worker log with hashes. No code or test assertion was edited for the Lab.
- Request expiry: **2026-10-25 17:16:26.435 UTC**. An expired queued request must not be described as executed. A later explicit attempt requires a fresh identity after reconciling this one.

The initial part comment in #2035 contained the canonical part but omitted the part-transport identity wrapper. The installed controller ignored it and [status #2036](https://github.com/psvensson/lagrange-lab/issues/2036) reported `WAITING_PARTS`; source was not executed. A subsequent comment supplied the **correct** `harnessd-lab-work-part-v1` wrapper with the same request ID, digest and canonical payload. This was a transport correction of the **same immutable request**, not another execution. The correct part comment has GitHub ID `6399734155`.

## Live controller and worker evidence

| Observation | Source | Original result |
| --- | --- | --- |
| Trusted-pool and controller health at 15:44 | [Ping #2033](https://github.com/psvensson/lagrange-lab/issues/2033) | `COMPLETE`; `paused: true`; `uncertain_execution: true`; general-work enabled. |
| Physical fleet at 15:44 | [Fleet observation #2034](https://github.com/psvensson/lagrange-lab/issues/2034) | `COMPLETE`; `tv-dator`: Node available, machine lock `free`, CPU **51°C**, SSD **25.85°C**, aux SSD **41.85°C**. This is an observation, not reservation or approval to bypass pause. |
| First work status at 15:47 | [Status #2036](https://github.com/psvensson/lagrange-lab/issues/2036) | `WAITING_PARTS`, `executed_source: false`; correct part not yet received. |
| Corrected original request at 15:48 | [Original issue #2035](https://github.com/psvensson/lagrange-lab/issues/2035) | `QUEUED` at 15:48:14.920, reason `WAITING_FOR_CAPACITY`, `source_execution_started: false`. |
| Independently queried work status at 15:48 | [Status #2037](https://github.com/psvensson/lagrange-lab/issues/2037) | `COMPLETE` for the *read-only status query*; target original job still `QUEUED`, `source_execution_started: false`. |
| Refreshed controller health at 15:50 | [Ping #2038](https://github.com/psvensson/lagrange-lab/issues/2038) | `COMPLETE`; controller remains **paused** with uncertain execution. |

The installed owner `upgrades/v0.2.2/current_controller.py` returns before dispatch when `config.paused` is true. The authenticated mailbox has no resume operation: `current_protocol.py` permits `ping`, `lab-fleet-observe`, `lab-work`, `work-status`, `evidence` and other bounded commands, while `resume` is an operator CLI command guarded by the installed config lock and original-journal checks. Do **not** forge a mailbox resume command or change the pause state through unrelated work. The historical [#1362](https://github.com/psvensson/lagrange-lab/issues/1362) physical uncertainty on `adam-laptop` is not closed by today's free-lock observations.

## Completion boundary

After an authorized operator safely restores controller dispatch, re-read **original #2035** and query its original job ID rather than issue a duplicate. Validate the exact source SHA, host, test exit code and worker scope closure. Fetch the full original log through bounded `evidence` requests, verify EOF/byte hashes and emitted TAP/report artifact frames, classify seven-file assertions, and record the terminal verdict. No Lab execution was observed at this checkpoint. If the immutable request expires or is refused, preserve that terminal receipt before preparing one fresh attempt.

This record adds evidence only. Frozen integration `13cdfe4`, independent review, static/corpus blockers, canonical startup and `main` remain unchanged.
