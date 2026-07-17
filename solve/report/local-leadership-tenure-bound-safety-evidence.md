# Solve report: local-leadership-tenure-bound-safety-evidence

**Goal:** The remove-safety read's preference for locally-known leadership during durable-publication lag is tenure-bound rather than content-based: the owner-local canonical leader claim carries partition, node, raft term, and the causal version it was minted against, held in the live localCanonicalLeaderObservation state with its demoted and superseded flags exposed to the safety read, and the preference fires only when that live claim is current and revalidated after every authoritative-read await - so an equal-version post-teardown CDC replay of an old tenure can never be preferred over a fresher authoritative successor, the only surviving override window is the irreducible not-yet-noticed-demotion split-brain bounded by the independent quorum, spread, voter-ready, and connectivity floors, and the content-based node-ID preference is retired from the safety path.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/local-leadership-tenure-bound-safety-evidence/local-leadership-tenure-bound-safety-evidence-2026-07-17T10-02-51-385Z.report.json

**Attempts:** 2

## Links
- spec: solve/epics/topology-convergence-hardening.md
- parent quest: formation-priority-spread-without-exclusive-self-move-cost

## Scope Pressure
- Changed files: 12
- Change bytes: 35539
- Owner areas: models, src/constants, src/partition, src/raft, src/rebalancer, test/convergence
- Categories: other, runtime, test
- Action: split by owner area before the next attempt (12 files)
- Action: land or separate 6 owner areas: models, src/constants, src/partition, src/raft, src/rebalancer, test/convergence
- Split plan:
  - models: 4 file(s)
  - src/partition: 3 file(s)
  - src/raft: 2 file(s)
  - src/constants: 1 file(s)
  - src/rebalancer: 1 file(s)
  - test/convergence: 1 file(s)
- Signal: broad-source-scope severity=medium
- Signal: large-diff-stack severity=medium

## Frontiers
- **local-leadership-tenure-bound-safety-evidence-main** [solved] rung 2, attempts 2, metric 0 -> 0 — exact terminal source attempt was rejected

## Findings
- **local-leadership-tenure-bound-safety-evidence-main**: DT red-on-revert proven for test/convergence/dt-local-leader-seed-safety-merge.test.js [dt:solve/changes/dt-prove/dt-local-leader-seed-safety-merge.test.js-2026-07-17T09-47-28-228Z.json]
- **local-leadership-tenure-bound-safety-evidence-main**: Ingested evidence from local-leadership-tenure-bound-safety-evidence-2026-07-17T09-47-33-394Z.report.json. Metric: unknown -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/local-leadership-tenure-bound-safety-evidence/local-leadership-tenure-bound-safety-evidence-2026-07-17T09-47-33-394Z.report.json]
- **local-leadership-tenure-bound-safety-evidence-main**: Ingested evidence from local-leadership-tenure-bound-safety-evidence-2026-07-17T09-47-33-394Z.report.json. Metric: unknown -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/local-leadership-tenure-bound-safety-evidence/local-leadership-tenure-bound-safety-evidence-2026-07-17T09-47-33-394Z.report.json]
- **local-leadership-tenure-bound-safety-evidence-main**: Independent verification REJECTED attempt-1 with an executable refutation: the tenure claim is never minted on the real partition-service election path - PartitionService never extends RaftReplicaBase, its LEADER event flows through replica-leadership-state.js applyReplicaLeadership which calls queueLeaderNodeUpdate with one argument, so raftTerm is undefined, claimActive is always false, every projection writes null claims, and the safety preference never fires in production (verifier repro drove the real applyReplicaLeadership through the real mixin and merge: the lagging authoritative leader wins - the parent quest's 5.5-7.2s recognition fix is silently retired rather than tenure-bound). Every gate stayed green because the DT fabricates claim-stamped rows and never drives an election, red-on-revert reverts the right files without covering the election-to-stamp behavior, and the TLA WinElection-to-runtime mapping is faithful to the design but false of the code. Where wired, the design itself verified sound: no foreign claim writers, durable schema carries no claim columns (the fossil asymmetry is real), the UPDATE-merge hybrid (replay retains stamps while overwriting leader) is killed by the row-leader-equals-claim-node conjunct, teardown ordering is safe. Secondary findings: clearLocalCanonicalLeaderNodeIfOwned's already-named-successor early return leaves harmless residual annotations that should also be nulled; term is carried but never compared to the current term and minted_against is never consulted (data, not enforcement); suite is 12 assertions across 6 top-level tests, not the claimed 18/12. [subagent:a6e010dc6be23f60f]
- **local-leadership-tenure-bound-safety-evidence-main**: DT red-on-revert proven for test/convergence/dt-local-leader-seed-safety-merge.test.js [dt:solve/changes/dt-prove/dt-local-leader-seed-safety-merge.test.js-2026-07-17T10-02-01-621Z.json]
- **local-leadership-tenure-bound-safety-evidence-main**: Ingested evidence from local-leadership-tenure-bound-safety-evidence-2026-07-17T10-02-51-385Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/local-leadership-tenure-bound-safety-evidence/local-leadership-tenure-bound-safety-evidence-2026-07-17T10-02-51-385Z.report.json]
- **local-leadership-tenure-bound-safety-evidence-main**: Ingested evidence from local-leadership-tenure-bound-safety-evidence-2026-07-17T10-02-51-385Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/local-leadership-tenure-bound-safety-evidence/local-leadership-tenure-bound-safety-evidence-2026-07-17T10-02-51-385Z.report.json]
- **local-leadership-tenure-bound-safety-evidence-main**: Independent verification APPROVED attempt-2 and declared the building-block bar MET, demonstrated in the real chain: the verifier independently proved the new production-path regression bites at the exact seam that killed attempt-1 (reverting only replica-leadership-state.js fails precisely the claim-stamp and preference-fires assertions), replayed its own refutation script against the new bytes (claim minted with the real term source, RECOGNITION FIX ALIVE; post-demotion fossil replay REJECTED - both halves of the model invariant pair hold in the actual runtime), verified the raft-event wiring and inheritance chain links the composed test stubs, confirmed no message-group regression (shared helper passes null, mg mints no claim, fail-closed), and swept test/partition plus test/raft at 125/1 with the single failure the known pre-existing child-partition subtest. Ruling on the open notes: carried-not-compared term and carried-not-consulted minted_against are acceptable for this quest because the clearing lifecycle plus the durable-schema asymmetry plus the leader-equals-claim conjunct close every constructible stale-claim path except the out-of-scope not-yet-noticed-demotion window where comparison adds nothing; RECORDED BOUNDARY: any future consumer of the claim term or minted-against version must not assume currency has been enforced - comparison becomes mandatory the moment a claim is trusted across an await longer than the safety read or by a non-safety consumer. [subagent:a6e010dc6be23f60f]
- **local-leadership-tenure-bound-safety-evidence-main**: Independent aggregate verification APPROVED: the regenerated aggregate delta over the 12 quest paths hashes byte-identically to the approved attempt-2 fingerprint with every base blob matching HEAD; the rejected attempt-1's 10 paths are a strict subset from the same base with both rejected-only post-images absent from the tree (supersession complete); terminal honesty holds with 3 consecutive PASS reports postdating the repair at an honestly-counted 28/28; and the working-tree inventory is clean except one identified benign extra (a timestamp-only regeneration of the unrelated active-gate TLC evidence report, standing churn not quest residue). [subagent:a6e010dc6be23f60f]
- **local-leadership-tenure-bound-safety-evidence-main**: Model evidence for the aggregate's model changes: the LocalLeaderTenureClaim TLC pair meets expectations on the final bytes - the tenure-bound configuration converges holding both MergeNeverTrustsDeadTenure and LiveTenureIsPreferred, and the content-based mutant violates MergeNeverTrustsDeadTenure via the fossil replay (reports local-leader-tenure-claim-tenure-bound.model.report.json and local-leader-tenure-claim-content-based.model.report.json); the verifier additionally replayed both invariant halves against the actual runtime chain, so the model-to-runtime mapping in models/local-leader-tenure-claim/abstract-protocol.md is now faithful (the attempt-1 unfaithfulness was the rejection ground and is repaired). [test-output/reports/local-leader-tenure-claim-tenure-bound.model.report.json]

## Theories
- **theory-20260717-live-claim-tenure-binding** [falsified] frontier, frontier local-leadership-tenure-bound-safety-evidence-main, layer ownership, mechanism The content-based preference cannot distinguish a row naming this node because its current live raft tenure seeded it from a fossil of an old tenure (equal-version post-teardown CDC replay), because it consults row content instead of the live localCanonicalLeaderObservation claim the seed maintains (with demoted/superseded flags). Binding the preference to the live claim - partition, node, raft term, and the causal version it was minted against, revalidated after every authoritative-read await - kills the old-tenure replay structurally, leaves only the irreducible not-yet-noticed-demotion window (floor-bounded), and retires content-based trust from the safety path, owner partition service metadata delivery (claim exposure with term and mint version) and priority-publication safety rows (claim-bound preference); floors, interlock, and seed lifecycle byte-unchanged per the sealed constraints, modelGate npm run model:contracts

## Selected Theories
- **local-leadership-tenure-bound-safety-evidence-main**: theory-20260717-live-claim-tenure-binding

## Theory Results
- **theory-20260717-live-claim-tenure-binding**: supported (scenario=done, theory=supported, movement=solved) [test-output/reports/local-leadership-tenure-bound-safety-evidence/local-leadership-tenure-bound-safety-evidence-2026-07-17T09-47-33-394Z.report.json]
- **theory-20260717-live-claim-tenure-binding**: falsified (scenario=done, theory=falsified, movement=solved) [test-output/reports/local-leadership-tenure-bound-safety-evidence/local-leadership-tenure-bound-safety-evidence-2026-07-17T09-47-33-394Z.report.json]
- **theory-20260717-live-claim-tenure-binding**: supported (scenario=done, theory=supported, movement=solved) [test-output/reports/local-leadership-tenure-bound-safety-evidence/local-leadership-tenure-bound-safety-evidence-2026-07-17T10-02-51-385Z.report.json]
- **theory-20260717-live-claim-tenure-binding**: falsified (scenario=done, theory=falsified, movement=solved) [test-output/reports/local-leadership-tenure-bound-safety-evidence/local-leadership-tenure-bound-safety-evidence-2026-07-17T10-02-51-385Z.report.json]

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-17T09:49:09.846Z | local-leadership-tenure-bound-safety-evidence-main | observe | 0 -> 0 | flat | solved | theory-20260717-live-claim-tenure-binding | diff:solve/changes/local-leadership-tenure-bound-safety-evidence/attempt-1.diff |
| 2026-07-17T10:03:14.000Z | local-leadership-tenure-bound-safety-evidence-main | local-fix | 0 -> 0 | flat | solved | theory-20260717-live-claim-tenure-binding | diff:solve/changes/local-leadership-tenure-bound-safety-evidence/attempt-2.diff |
