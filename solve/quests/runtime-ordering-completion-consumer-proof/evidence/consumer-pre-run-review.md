# Independent consumer pre-run review

Reviewer: subagent:/root/ordering_companion. Static inspection only; no native test executed.
Verdict: APPROVE exact bytes for the first locked native execution. This is not approval of F1 supersession, complete consumer coverage, source correction, or landing.

Base worktree HEAD: 96985eb2ba0720b7f5e3b36c63ce10e3a2ff71b3; frozen source 4aa8780cfec6f2718b86b4d1e27ee9711492be59.

All paths below with short names are under test/raft/raft-rs-backend/:

| File | SHA256 |
| --- | --- |
| runtime-completion-consumers-fixture.js | 55c85301d2f37cc0b582c4e0f9181e6c6e2dc81edcd431b6bebe608e2a27145c |
| runtime-completion-consumers-partition.test.js | 26ac2af22d1da5f85790aedc1d43a194e53fb04d09c8ca453d6b7497352b1cd9 |
| runtime-completion-consumers-transfer-fixture.js | e1d442d787dfa1f18852be5a018342b1dec168503f92d9152e77c824d906c7fa |
| runtime-completion-consumers-transfers.test.js | 3c97bbd95f5ecc1a87cb80fe42230dd882996e3b87457b561495b7f7997e9eea |

No required pre-run code correction found. Native success is unmeasured. Setup failure, timeout or missing-seam failure is not a semantic RED. The tests assert existing positive behavior and require native engagement before their acceptance/completion assertions.

## Harness fidelity

1. Right reason: partition.test.js:62-78 demands the exact proposal in the real leader log, two distinct native follower ACKs, actual dispatch completion, commit/applied below proposal. Transfers.test.js:78-99,142-145,184-194 requires actual held messages and accepted real handler answers. Failure before those seams is non-proof.
2. Seam honesty: fixture.js:29-61 holds transport then invokes the original recipient with original receiver and complete args. No CORE_OK/ACK is manufactured. Loopback transport is an existing direct handler fixture, not wire deadline/noHandler certification.
3. Time: existing fixture 20/150/300ms settings remain, no compressed new budget. Scheduling is stopped before measured cuts, existing inbound timers run. Status-based post-heal progress is explicit. Test 40s guard is not production timing proof.
4. Fields: transfer-fixture.js:33-47 supplies immutable operation intent and route fields to real decision functions. It explicitly is not a persisted workflow. Native-derived cache projection at51-67 and stabilized caller premise at75-87 are test composition, not canonical CDC publication.
5. Nonvacuity: partition test verifies RF3 follower ACK identities plus exact uncommitted entry. Transfer tests hold Append/vote reply messages and assert target not leader. D2 requires two real legs and later spread. Initial native formation/release are prerequisite assertions.
6. Live binding: actual PartitionService, registered ReplicaHandler, real rs-raft operation ports, real SQL/result owners. Execution remains pending. No mock successful authoritative result.

## Owner interaction

1-2. Sole semantic owners: partition completion at src/partition/partition-service-raft-write-commit.js:329-405; exact result at partition-committed-statement-outcome.js; named transfer decision at src/rebalancer/operation-workflow-replace-handoff-attempt.js:218-257; corroborated read at operation-workflow-replace-surviving-membership.js. Tests invoke these owners rather than deriving removal from service.role. Local role fields are diagnostic/anti-vacuity only.
3. Paired invariants: partition.test.js:92-117 pairs pending after acceptance with applied success/exact replay; transfers.test.js:83-117 pairs accepted handoff with actual later LEADERSHIP_SAFE. No behavioral mutation is supplied; these are positive controls, not source RED/GREEN certification.
4. Stale then fresh: REPLACE pending authority then new actual corroborated read; D2 refreshed native-derived census and actual cure call. No persistent stale veto is invented.
5. Pressure/backoff: quotas, repeated urgency and retry storms are not exercised or certified. Tests add no bypass to runtime admission.
6. Wake: measured transport release permits existing inbound owner to progress. Explicit completion read is behavior under test, not passive runtime observer. Status reads after healing are declared drivers; no natural background liveness claim.
7. Projection: cache rows route D2 and its existing census owner; tests cannot prove the production publication path. REPLACE cache is route only, real read supplies authority.
8. Treatments: exact hashes above; no source reversion/mutation control in this subpacket. Parent must preserve first execution identities.
9. No escape hatch: no source changes, direct row deletion, fake commit, local verdict repair, forced success or parallel retry driver. Test composition still limits the end-to-end claim.
10. Registry: principal must add exact files to impact/classification metadata before execution checkpoint. No semantic contract supersession by these tests.

## Concurrency / serialization

1. Write pending gate precedes proposal in source raft-write-commit.js:329-380. Dispatch observer at fixture.js:101-117 preserves original metric call; it only identifies completion of handoff, not application.
2. Freshness across awaits: REPLACE completion function is actually invoked and awaited, then re-invoked after heal. The test does not certify every production continuation or cached-view race.
3. Single winner: no new CAS/claim mechanism added. Multi-driver workflow recovery is not covered.
4. Timers: stopScheduling disables election ticks for measured interval; existing inbound wakes still run. No timer callbacks installed as purported production behavior. Runtime replacement/timer interleaving is outside these controls.
5. Lock scope: no test mutex or substitute gate supplies ownership. Per-entry write identity and per-operation handoff attempt are actual owner keys. Pending duplicate concurrency itself is not covered.

## Transport / delivery

1. Actual handler answer, not transport ACK, is consumed. Transfer acceptance is explicitly distinguished from completion. No noHandler race covered.
2. Partition shutdown case releases real late ACKs to retired recipient (partition.test.js:146-148), retaining failures. General late SERVICE_RESPONSE/waiter retirement is not covered.
3. Actual write UNKNOWN and handoff response classifications are checked. Generic transport classification branches are not exhaustively covered.
4. Existing loopback rejects missing handler; no wire disconnection/deadline proof. Test may stop on setup/cleanup gap without semantic classification.
5. Complete argument/receiver forwarding at fixture.js:29-82. Observation adds Promise handlers but does not supply results. This is not latency/deadline certification.

## Recovery / replay

1-2. Real source shutdown and surviving quorum election, not stale cache restoration (partition.test.js:139-158). No same-process rebuild or restart import claim.
3. No enlisted workflow registry is reconstructed. Durable REPLACE workflow and participant historical reopen branch remain uncovered.
4. Exact identity replay after actual applied result checks one row, unchanged outcome and no extra entry (partition.test.js:159-171). First case also checks one effect. No synthetic command application.
5. Outcome absent is asserted UNSETTLED while log index proves possible work; shutdown reports UNKNOWN with same entryId. Absence never grants completion.

## Admission / gating

1. Existing actual initial release and write path are used. Precheck/enforcement equivalence generally not certified.
2. UNKNOWN and real no-eligible-successor refusal checked; complete transient reason catalogue not covered.
3. Existing production waits and inherited fixture budget used, no timeout increase. Wait guards are setup/observation bounds, not availability guarantee.
4. Typed constants and actual owner response shapes used. Assertions print real response on classification failure.
5. Participant remains CLOSED through transfer and later opens via real release (transfers.test.js:128-160). The servedLegacy=true branch is NOT entered.
6. Actual fresh REPLACE read and explicit refreshed D2 projection; source-derived freshness limitations above remain.
7. Evidence names partition/replica, actual exact entry and native held messages. No unrelated entity substituted.

## Retry loops

1-4. No new retry loop or rescheduling owner added. Existing fixture waitFor polls passive predicates before cut; status-driving predicates post-heal are explicit. No claim of production wake fairness, unreadable-row bounds, all typed exits or mutual-suppression freedom.
5. No storm/cadence claim; finite calls only. Existing fixture polls are observation with fixed inherited budget.
6. Same-entry replay uses actual result owner and asserts no second effect/log occurrence. No automatically repeated possible-effect proposal.
7. No transport ACK resets an asserted completion counter. Existing production retry-counter behavior is not exhaustively tested.

## Remaining scope blockers

- REPLACE test invokes actual decision and authority functions, but not a durable workflow or source-removal command (transfers.test.js:118-120).
- Participant test does not enter reopenCohort servedLegacy=true transfer consumer (159-160); merely showing generic PAUSE/transfer/later release cannot certify that branch.
- D2 cache publication is manually refreshed from native observations, so no production CDC provenance or startup/stabilization proof.
- Partition uncertainty case retains follower log occurrences; it does not model complete loss of uncommitted history, snapshot recovery, or generic query delivery.
- These limits preclude treating a green pair as full F1 supersession or complete user packet fulfillment. First native results must stay separately classified.
