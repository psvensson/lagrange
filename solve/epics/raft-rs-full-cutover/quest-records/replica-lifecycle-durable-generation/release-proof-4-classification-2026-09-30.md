# Release proof 4 (full-gate run 36779738975 on main e53854c9e): red classification

Run: `full-gate` workflow_dispatch, GCP runner, 2026-09-30 21:29–22:59 UTC.
Result: the `gate` job failed in "Full release proof, single pass"; `record_proof`
skipped, so e53854c9e carries no `release-full-v1` proof. The job log the API
returns is truncated to its last 5000 lines (first visible line 21:41 UTC) and
the `full-gate-output` artifact is unreachable from the cloud container (blob
storage refused through the proxy), so lanes that ran before 21:41 UTC are not
classified here; the next proof run classifies them.

Every red below was reproduced locally on main and re-run on the pre-merge
base e0b0854f3 (main before #63). The round-8 census (`authority-census.md`,
"Pre-existing reds") had compared the candidate against the WIP branch's own
base (6831054b1 / 752b17715 / 5d6f58f9b), which already carried these
regressions; against main's base they are regressions of the landed history.
`git bisect` over `backup/rs-raft-landed-2026-09-30` (e0b0854f3..95300ff3d)
named the introducing commits.

| Red on the runner | Base e0b0854f3 | Introduced by | Mechanism | Class | Disposition |
| --- | --- | --- | --- | --- | --- |
| `test/rebalancer/dt6-ledger-spread-follow-up-dispatch-arming.test.js` subtest 7 ("a wake whose transport ACK carries noHandler routes into the WARNING retry lane"): `not ok 1 - Message not acknowledged` at `wakeCoordinatorCreatedRemoteOwner` | green | 62140435a "fix: close exact-head authority gaps" | `buildTransportDeliveryOutcome` now fails closed on `noHandler` (an ACK with `noHandler` is not DELIVERED). `wakeCoordinatorCreatedRemoteOwner` tested `isDeliveredTransportDeliveryOutcome` first, so its `noHandler` branch (the dropped-wake deferral lane) became unreachable and the generic not-delivered branch threw | product regression | fixed: the `noHandler` check precedes the not-delivered branch (`operation-workflow-owner-handoff-state.js`) |
| `test/simulation/formation-sim-runner.test.js`, `test/simulation/formation-sim-attribution-isolation.test.js`: process aborts with `formation_execution_node_unbound` (UNBOUND PROVENANCE, refusedOwner raft_protocol, depth 2) | green | 9d3439a6c "WIP: P3 recovery equivalence + BR10 attempt rebuild after restart" | First error (visible once the abort is prevented): `nondeterministic_owner_seam: Date.now read inside undefined dispatch` from `startReplaceOwnerSession` → `sessionClockNowMs` in the `OperationWorkflowRecoveryReconcile` constructor, refused by the simulator's deterministic owner guard during `createSimulatedNodeHosts`. The throw leaves the `OwnerTurnMeter` window open (no `finally`), and the next generation's cohort promote then refuses as unbound, which is what the runner prints | product regression (clock-owner discipline: an owner reading ambient time) | fixed: the session clock reads `owner.resolveTimeoutCheckNowMs()` (the DT6 seam) and `timeSource` is assigned in `OperationWorkflowRecoveryTimeout`'s constructor so constructors above it read the injected clock; production without a TimeSource stays `Date.now()` |
| `test/admin/admin-control-snapshot.test.js`: 5 leaf failures in top-level 26, 30, 78 (published membership from an ACK_PENDING/OPEN row) | green | 64ca50428 "wip: cutover seed parity round-2 prep (... one membership owner with published / pending reads ...)" | Intentional contract change in `active-node-publication-snapshots.js`: "An OPEN or ACK_PENDING row never counts as published"; the previous fallback read the latest pending row's members as durable published membership. The consumer tests (`admin-control-snapshot-publication-convergence-membership-observation-test-cases.js`, `admin-control-snapshot-tail-test-cases.js`) still encode the old contract ("retain the durable published membership while the latest epoch is ack-pending") | contract change with stale consumer tests | OWNER DECISION, not absorbed: either the tests move to the new contract (published = PUBLISHED rows only; ack-pending exposure stays a separate, non-authoritative read) or the snapshot owner keeps the ack-pending fallback. Recorded in `followups-2026-09-30.md` |
| `test/distributed/harness/__tests__/table-distribution-helpers-read-path.test.js` subtests 2 and 7: `timeoutMs 4999 !== 5000`, passed on the runner's retry (counts as failure) | n/a (timing) | the harness's deadline-bound create budget (`resolveBoundedTableBootstrapCandidateTimeoutMs`, `deadlineAtMs - Date.now()`) | one millisecond elapses between deadline resolution and the create call on a real clock | test-side timing flake | fixed: the two subtests freeze `Date.now` (restored in `finally`), as the neighbouring subtest already did |
| `test/simulation/formation-sim-charged-seed-host.test.js`: assertion passes at ~230 s, process never exits, killed at the 600 s budget | (not re-run) | inherited (recorded before this run as the charged-seed-host cap) | the scenario's process does not quiesce after the strict assertion | inherited | unchanged; lab item |

Not covered by this record: any lane that ran before 21:41 UTC (log truncation
above), and the hardening tail, which did not run because `test:all` failed.

## Verification

Independent verifier (subagent, read-only over the diff, 2026-10-01): APPROVE.
It confirmed the `noHandler` branch had been dead since 62140435a and that no
other consumer reads it on that path; that no constructor between
`OperationWorkflowRecoveryTimeout` and `OperationWorkflowOwner` reads or writes
`timeSource`, that the virtual-clock DT6 harnesses keep the same BR10 truth
value, and that the replace harnesses assign `timeSource` after construction;
and it ran the six focused files plus every `test/rebalancer` file matching
handoff / replace-owner / dt6 and the virtual-clock convergence tests, all
green. Its one concern, the same one-millisecond flake in the untouched
subtest 8 of the read-path test, is fixed in the same change (clock frozen).

## Release proof 5 (full-gate run 36802845874 on main 154628eed, 2026-10-01 01:48–03:21 UTC)

The log of this run is complete (checkout through the exclusive lane). The
static suite, the model contracts and every lane of `test:all` are green
except two files, so the three repairs above held on the runner:

| Red on the runner | Class | Disposition |
| --- | --- | --- |
| `test/admin/admin-control-snapshot.test.js` (ordinary lane; fails identically on the standalone retry) | contract change with stale consumer tests (above) | OWNER DECISION, see `followups-2026-09-30.md` |
| `test/simulation/formation-sim-charged-seed-host.test.js` (ordinary lane; the strict assertion passes, the process never exits, killed at 600 s on both runs) | inherited | lab item; it blocks `record_proof` as surely as the admin file does |

`record_proof` skipped, so 154628eed carries no `release-full-v1` proof. The
hardening tail did not run (`test:all` failed first).

