---
audience: development
documentClass: evidence
---

# Classification: six composed-head reds not in recorded base red sets (2026-10-25)

Composed head 124c749ae (work/mg-delivery-resume-r2-20261023 has since advanced to 3583d3bb0, docs-only; classified at 124c749ae exactly). Base a9a5660c7.
Method: lab leaves from lab-composed-124c749ae.log (adams-gamla); local `LAGRANGE_PLACEMENT=local npm run -s test:file -- <file>` in detached scratch worktrees at 124c749ae and a9a5660c7 (node_modules + data/examples symlinked), each run gated on scripts/checks/wait-for-thermal-headroom.js, serial. Integration files ran fine locally (no lab-only infrastructure needed). Local logs: scratchpad/runs/<sha>-<name>.log (worktrees removed afterwards).

Why they were not in the base red sets: none of the six appears in lab-composed-a9a5660c7.log at all. That base cone (lenovo-laptop, 1261 files) never ran them; the 1906-file composed cone selected them. They are new to the cone, not new reds.

No test file among the six changed between a9a5660c7 and 124c749ae (`git diff --stat` is empty).

| # | File | Lab leaf (124c749ae) | Head local | Base local | Verdict |
|---|------|----------------------|-----------|-----------|---------|
| 1 | test/control-plane/core-system-logic-runtime-witness.test.js | not ok 3 phase-owner-handoff-completes: TypeError `this.assertOriginalSeedContinuation is not a function` (bootstrap-service-seed-workflow.js:217 via test :279) | red, same leaf (2 pass / 1 fail) | red, same leaf | pre-existing (base). The test's seed host lacks the method that src gained in 7fa4d79ae "wip: own original seed startup lifetime through native construction" |
| 2 | test/control-plane/replica-dispatch-node-state-update-ready-node-retry-cache-priority.test.js | not ok 6.1, 12.2, 13.2: t.same row diff, actual has extra `target_claim_key: null`, `membership_publication_epoch: null` | red, same 3 leaves, same diff | red, same 3 leaves, same diff | pre-existing (base) |
| 3 | test/control-plane/replica-dispatch-node-state-update-ready-node-retry-dispatch.test.js | not ok 9.3, 10.6: same two-field row-shape diff | red, same | red, same | pre-existing (base) |
| 4 | test/control-plane/replica-dispatch-node-state-update-remote-direct-wakeup.test.js | not ok 1.1, 6.2: same two-field row-shape diff | red, same | red, same | pre-existing (base). Confirms the C2 verifier's record: subtests 1 and 6, row-shape diff target_claim_key / membership_publication_epoch, same leaves |
| 5 | test/integration/convergence-control-snapshot.integration.test.js | not ok 1.1 seed bootstrap should succeed (Bootstrap failed: `original-allocation-directory-custody-unavailable` at raft-rs-original-allocation-preparation.js:395) | red, same leaf and error | red, same leaf and error | pre-existing (base) |
| 6 | test/integration/preflight-critical-path-hops.integration.test.js | not ok 1 (seed bootstrap, same custody error), 3, 4 (joins), 5.1-5.5, 5.7, 5.8, 5.10, 5.11, 6.1-6.9, 7.1; ok 2, 5.6, 5.9, 5.12 | red, identical leaf set | red, identical leaf set | pre-existing (base) |

The per-file ok/not-ok line sequences (time stripped) and the diff `+/-` lines are byte-identical between head and base for files 1-4. For files 5 and 6 the leaf sets match exactly; only random node UUIDs differ.

## C2 suspect (classifyTransportDeliveryOutcome: no default hint, own retryAfterMs kept)
Ruled out for these files. No retryAfterMs or deferRetry leaf fails in any of the three replica-dispatch files at head. The only failing assertions are the row-shape diffs, and those fail the same way at base. C2 caused no new red here.

## Common roots worth noting (not caused by the composition)
- Files 2-4: the dispatched `operationRow` now carries `target_claim_key` and `membership_publication_epoch`, which the hand-written expected rows lack. Per the owner directive that test doubles and expectations consume the owner's builder, the fix is to change the tests, not production.
- Files 5-6, and the many base reds with "seed bootstrap should succeed": seed bootstrap refuses with `original-allocation-directory-custody-unavailable`. This happens locally too, so lab infrastructure is not the cause. The original-allocation custody owner is what to look at for that family.

Caused-by-unit count: 0 of 6.
