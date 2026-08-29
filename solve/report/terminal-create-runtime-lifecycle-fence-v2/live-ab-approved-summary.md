# TEST-0022 controlled live A/B

- Date: 2026-08-20
- Workload: `node examples/service-data-affinity/run-affinity-demo.js`
- Topology: five local nodes, one zone, 100,000 MovieLens ratings
- Fixed source: `sha256:3effd67a45e3798b31251a8fa5b893b4b11bdebf2ff2c77d2cd35467653605be`
- Reverted source: base commit `1dc91ceb647153ec574a4be4122188261b069e99`
- Controlled variables: identical command, topology, workload, configured timeouts, numeric budgets, natural failure schedule, clean data-root archival, and natural teardown.

| Arm | Run | Outer outcome | Failed CREATE | Fence after failure | Post-failure promotion |
| --- | --- | --- | --- | --- | --- |
| fixed | 1 | PASS; converged and quiescent | `sql_transactions-p1-r5`, voter-ready timeout | shutdown completed before failure publication | 0 |
| fixed | 2 | FAIL; split/spread timeout after 600000 ms | `schema_operations-p1-r5`, voter-ready timeout | shutdown completed before failure publication | 0 |
| reverted | 1 | FAIL; distributed participant failure | `schema_operations-p1-r5`, voter-ready timeout | no shutdown until teardown | 1: promotion proof granted 7.844 s after failure, then election timer started |
| reverted | 2 | FAIL; split/spread timeout after 600000 ms | `replace-replica-8381f6dccdbb9b30cfeb38ff5636bb4b`, voter-ready timeout | canonical REMOVE won the race and shut down 3.166 s after failure | 0 |

Both arms observed exactly two logical CREATE failures across two runs, so the candidate did not amplify CREATE failures. The fixed arm eliminated the unsafe interval in both observations: every created runtime was shut down before FAILED publication and no failed learner later promoted. The reverted arm retained the historical race: one observation promoted the failed learner after REMOVE had already been requested; the other escaped only because the asynchronous REMOVE happened to win.

The fixed arm's one split/spread timeout also occurred once on the reverted arm. It is therefore not evidence that the lifecycle fence solved general spread convergence, and it is not attributed to this candidate. The source candidate owns failure-publication/runtime-death ordering; canonical REMOVE, promotion predicates, budgets, retry cadence, and workload timing remained unchanged.

Artifacts are stored beside this summary. Each run has a final report, console log, and gzip archive containing all five finalized node logs. Their hashes are in `live-ab-approved.sha256`.
