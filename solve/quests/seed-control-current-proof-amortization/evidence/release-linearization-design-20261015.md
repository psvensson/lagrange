# Release linearization: one committed decision, consumed by every replica (design v1)

Status: PROPOSAL. Stops for independent architecture review (owner decision:
explicit supersession of two sealed constraints) before any implementation.
No production change, no landing, no lab campaign accompanies this document.

## 0. What the witnesses establish

- `e15166a62` (old source, RED): publication (dispatching RESUME after the
  second INSPECT) is not atomic with the refusal decision. A member lost
  mid-publication leaves part of the cohort OPEN on a refused release, and the
  leader still routes an ordinary protected write through real Raft. Raft-log
  commitment and application commitment are separately observable.
- `1994870bb` (PR #122, RED): removing the second INSPECT moves the racy
  window earlier (post-PAUSE). Green at old source: the INSPECT refused before
  any RESUME.
- `6a9a522d9` (candidate, defect asserted GREEN): an idempotent-OPEN fast path
  answers from Raft-status proof + releaseId identity alone, so a duplicate
  RESUME reports success (`RESUMED`) over facts the fresh census
  (`releaseCensusDefect`) would refuse.

Common root: **no durable consensus-bound fact is the release decision**. The
decision exists only as a coordinator-side census snapshot plus per-replica
transient `ADMISSIONS` state (`partition-participant-transaction-pause.js:190`)
that RESUME mutates per recipient. Every defect above is a consequence:
answers authorize remotely, a refusal cannot retract what was already opened,
and an "already OPEN" answer can masquerade as a fresh validation.

## 1. Ownership map (existing owners only; R01/R03)

| Concern | Existing owner (unchanged by this design) |
| --- | --- |
| Coordinator cutover attempt, ordered PAUSE→decision→publication | `src/node/replica-handler-participant-cutover.js` (`runCutoverAttempt`, `proveCurrentControlCohort`, `releaseControlOwnerFirst`) |
| Per-replica admission/pause state, write gate | `src/partition/partition-participant-transaction-pause.js` (`participantCutoverPauseOf`, `pausedWriteAnswerOf`, admission generations) |
| Release identity, census defect predicate | `src/partition/partition-participant-release-contract.js` (`releaseIdentityOf`, `releaseCensusDefect`, `isReleaseDrained`, `transactionReleaseProofValid`) |
| Replicated participant state-machine commands (PREPARE, DECISION, GENERATION_ORIGIN), applied transactionally with the applied index | `src/partition/partition-participant-transaction-apply.js`, `partition-participant-transaction-constants.js` (`PARTICIPANT_TRANSACTION_COMMAND`) |
| Durable log-position-bound control row (origin: `originIndex`/`originTerm` recorded inside the application transaction) | `src/partition/partition-participant-transaction-store.js` (`recordPartitionWriteOrigin`, `readPartitionWriteOrigin`) |
| Membership/term/leadership truth, committed reads | raft operation port + liferaft (`readCommittedMembership`, `readStatus`, `RAFT_OPERATION_OUTCOME`) |
| SQL transaction census / recovery obligations | `src/query/distributed/distributed-transaction-release-census.js`; rebalancer recovery owners |
| Reroute/entryId transport of proposals and answers | existing reroute owner (entryId carried per commit `q-reroute`) |

New boundary introduced by this design, to be changed as **one unit** (R02):
`participant-release` × `participant-transaction-apply` — the release decision
becomes a member of the existing command family. No new ledger, cache,
scheduler, service, or INSPECT loop. The census remains what it is today: the
existing one-time ordered per-member facts read that precondition a proposal.

## 2. The authoritative linearization point

**The release decision is the commit of a `PARTICIPANT_RELEASE_DECISION`
entry in the partition's own Raft log** — the same log, proposal path
(operation port), reroute, entryId attribution and application-transaction
semantics the existing `PARTICIPANT_GENERATION_ORIGIN` command family uses
(`partition-participant-transaction-apply.js:549`, design 0.0.13 precedent;
`originIndex/originTerm` already prove this pattern is consumed fail-closed by
the release predicate `ORIGIN_REPLICATION_PENDING`).

Linearization split, stated explicitly (this is the required distinction):

1. **Raft commitment** — quorum acceptance of the entry at `(term, index)`.
   This is the single group-wide decision instant.
2. **Application effect** — each replica opens/closes admission inside the
   entry's own application transaction, together with the applied index and
   the durable decision row. Commitment without local application is *not*
   authorization (replica stays HELD until it applies or observes).
3. **Transaction settlement** — `PARTICIPANT_DECISION` / PREPARE effects,
   independently observable and never implied by (1) or (2). The
   `query_transaction_drain_pending` refusal in witness (1) shows settlement
   already refuses to be conflated; this design keeps that.
4. **External write acknowledgement** — returned by the write kernel only
   after the serving replica applies the admitting entry; a committed-but-
   unapplied entry acknowledges nothing.

Per-replica the decision instant is **the application of the decision entry**;
group-wide it is **the commit index of that entry**. RESUME stops being an
authorization: it becomes (at most) a wake/report consumer whose answer is
derived from the durable row + current proof, never from "already OPEN".

## 3. HELD vs irrevocably authorized

- **HELD**: admission CLOSED through `participantCutoverPauseOf` (today's
  state, unchanged), or a release entry is not the highest decision the
  replica has applied, or its identity/proof fields do not validate at apply
  time. A merely HELD cohort admits no ordinary protected write: the write
  kernel keeps returning `WRITE_CUTOVER_PAUSED`/`CUTOVER_PAUSED` (unchanged).
- **Authorized to OPEN**: exactly one condition — the replica has applied a
  `PARTICIPANT_RELEASE_DECISION` entry whose bound identity matches its
  current owners, no higher-epoch supersession has applied, and every check
  passed inside the application transaction. Irrevocability is Raft's: once
  committed, the decision happened (it is history). Revocation is *forward*,
  by a later committed `PARTICIPANT_RELEASE_HOLD` (corrective PAUSE) at a
  strictly higher epoch — never a reinterpretation of the old entry (the
  corrective-PAUSE/rollback distinction the safety properties require).

Physical OPEN states still converge replica-by-replica as log application
reaches them; the property "they must consume the same authoritative decision"
is met because every OPEN derives from the same committed entry.

## 4. The durable fact and its bindings

One new command type in the existing `PARTICIPANT_TRANSACTION_COMMAND` family:

- `PARTICIPANT_RELEASE_DECISION` — bound fields (all already produced by the
  canonical contract): `partitionId`, `protocolVersion`, `targetBuildDigest`,
  `configurationKey`, `membershipGenerationIndex` (these five compose the
  existing `releaseId` hash), plus `releaseEpoch` (monotonic, per partition),
  `censusDigest` (digest over the existing census input: `rowGenerationDigest`,
  `schemaVersion`, `semanticVersion`, `recoverableTransactionIds`,
  enforcement digests), `leaderReplicaId`, `attemptTerm`.
- `PARTICIPANT_RELEASE_HOLD` — corrective supersession: `supersedesEpoch`,
  same identity fields, next epoch. Proposed by the *current* term's leader
  only; entryId dedup makes re-proposal idempotent.

The durable per-replica record extends the **existing generation row** (the
same row that already stores `origin_index`/`origin_term`, written inside the
application transaction): last applied release epoch, its censusDigest, and
its disposition. This is where authorization survives restart. It is not a
separate ledger — it is the release owner's read of facts it already owns.

Notably: the epoch is deliberately **not** bound to term or leaderId. A
leadership change within the same membership generation must not revoke an
authorization (liveness), and term fencing of corrective actions is provided
by Raft itself (only the current leader can supersede). Reservation of safety
under leadership change comes from the identity binding:
`configurationKey` + `membershipGenerationIndex` + `targetBuildDigest`.

## 5. Recipient eligibility proof (no trust in RESUME)

At apply time (inside the application transaction, fail-closed, replay
identical):

1. Identity recompute: `releaseIdentityValid` over the bound fields.
2. `epoch >= lastAppliedEpoch` and no applied HOLD with a higher epoch for the
   superseded release; else typed `STALE` (refuse to open, record refusal).
3. Local facts, freshly read by the same `readParticipantReleaseFacts` owner:
   `OBSERVED`, membership configuration still the bound configuration
   (`confChangePending === false`), build digest equal, `isReleaseDrained`,
   rowid valid, topology null, census state and digest equal to the bound
   census. Failure → durable, typed disposition `REFUSED(reason)` with
   admission CLOSED; answerProposer carries it back through the entryId path
   so the coordinator sees a nameable outcome, not silence.
4. Node-local generation fields (`replicaGenerationOf`:
   `ownerIncarnation`, `lifecycleIncarnation`, `runtimeGeneration`,
   `connectionGeneration`, `admissionGeneration`) must match the facts the
   census observed; a changed incarnation consumes the epoch as
   `STALE` and the replica stays HELD for the recovery/re-release owners.

Because the OPEN effect lives in the apply transaction, a duplicate RESUME can
no longer answer `RESUMED` from identity alone (witness 3's defect): an answer
names the durable disposition of a definite epoch. No answer ever claims "the
quorum has now been validated" — that claim belonged to the removed census and
does not exist in the vocabulary anymore.

## 6. Restart and leadership-change reconstruction

- Restart (fresh `lifecycleIncarnation`): admission starts CLOSED (existing
  behavior — `ADMISSIONS` is process-local; the durable row is not). On
  catch-up the decision entry re-applies idempotently as `REPLAYED` (existing
  idempotency machinery, cf. `applyGenerationOrigin`). Reopening after restart
  **never** happens from the old epoch alone: the epoch's census bound
  generation fields that changed, so step 5.4 refuses; the replica is
  reconstructed to HELD and a fresh release attempt (proposal at the newer
  generation, same or new releaseId per build/membership) re-decides. This is
  the "reconstruct the decision" path: it reuses catch-up + the committed
  entry; no leader trust, no cached admission (R10).
- Leadership change: the committed entry stays the authority (it is in the
  log). Any new leader's status change invalidates transient admission proofs
  exactly as `invalidateParticipantReleaseAdmission` does today — that
  mechanism continues to run against *transient* proof, while the durable
  row decides reopen eligibility as in step 5. Membership replacement changes
  `configurationKey`/`membershipGenerationIndex`, so the old epoch's entries
  fail step 5 on every replica: a stale release epoch cannot authorize work
  after membership, generation, leadership or lifecycle change.

## 7. Pre-decision failure vs post-decision uncertainty

- **Failure before the entry commits** (coordinator death, member loss,
  deadline expiry within the exact original 1000/5000 ms budgets, census
  refusal): nothing is committed, therefore nothing has applied, therefore
  every admission stays CLOSED. Outcomes are the typed refusals whose full
  fallback path already exists. Protected admission is closed by
  construction (this is what PR #122's falsifiers prove cannot be said of the
  answer-driven design).
- **Uncertainty after commit** (lost coordinator response, coordinator death
  between commit and consumption): distinguishable *by fact*, not by timeout:
  "is epoch E committed/applied, and what disposition did its application
  record?" A retry with the same entryId replays the command idempotently or
  reads the recorded disposition. A partially consumed commit is a named
  state (consumption incomplete) processed by the existing consumption
  continuation — it is never misclassified as an aborted release; aborted
  exists only as a committed HOLD/supersession or a durable REFUSED
  disposition. No post-failure re-PAUSE is advertised as rollback: the pre-
  decision corrective hold is a *new* superseding decision, and writes already
  admitted between the two entries are committed history that remains
  committed (witness 1's committed row stays a settlement obligation for the
  recovery owners, not something release pretends to un-write).

## 8. Reserved TX1/TX2 obligations (no abandonment)

- Proposal precondition (unchanged, gate to commit): the existing drained
  census — `isReleaseDrained` (proposals, pendingOutcomes, prepared
  participants, open sqlite transaction, applied==commit==last) — plus
  `transactionReleaseProofValid` over the query census. Outstanding prepared
  work blocks the *proposal*; it is never cancelled, never settled by release.
- If outstanding TX1 work appears while a release is OPEN (post-decision
  writes are legitimate), any further current-control proof refuses
  (`queryCensus`/`recoverableTransactionIds` change the digest), the corrective
  HOLD entry supersedes, admission re-closes on its application, and the
  existing recovery owners continue to own settlement (`PARTICIPANT_DECISION`
  commands apply while held; nothing is dropped and no obligation is
  abandoned — R12 pressure on the control plane cannot revoke recovery).
- Settlement commands applying while HELD, and decision custody, remain with
  the transaction apply owner exactly as today.

## 9. Safety / liveness matrix

| Property | Mechanism |
| --- | --- |
| No protected write admitted before the decision | Write gate CLOSED by default; opens only on application of the committed entry; commitment-before-opening on every replica in log order |
| Failed pre-decision attempt leaves admission CLOSED | No entry → no apply → no OPEN (by construction); typed refusals, full fallback paid |
| Lost post-decision response never misclassified as aborted | Disposition is a durable, entryId-idempotent record; aborted exists only as committed HOLD/REFUSED |
| Stale epoch cannot authorize after membership/generation/leadership/lifecycle change | Epoch+identity bound to configurationKey/membershipGenerationIndex/build; generation fields consumed at apply; supersession is forward-only |
| Delayed/duplicate RESUME cannot masquerade as fresh validation | RESUME is a wake/report consumer; answers name a durable epoch disposition; no RESUMED-from-identity fast path |
| Recovery progresses after authority returns | Catch-up re-applies; re-release replans at the current generation; retry obligations stay with the existing recovery owners |
| Corrective PAUSE ≠ rollback of a committed entry | HOLD is a new committed command; earlier history remains committed; settlement stays with the recovery owners |
| Honest partial-OPEN on intra-publication member loss | Permissible transient; all members consume the same decision; consumers lagging after the decision converge by catch-up, not by new permission |

| Liveness question | Outcome |
| --- | --- |
| Normal release | Proposal replaces per-member RESUME dispatch: strictly fewer messages than today, within the same deadline budget |
| Member recovers after the decision | Opens from its own log — no coordinator needed |
| Coordinator dies after decision | Any successor reconstructs by committed read; consumers continue |
| Leadership flaps | Authorization survives (not term-bound); only supersession needs a leader, as it should |
| Persistent apply-time refusal | Typed REFUSED surfaces to the coordinator; retry policy unchanged; deadline untouched |

## 10. Adversarial cases mapped

- **Follower loss before decision**: census/INSPECT misses it → typed refusal → CLOSED everywhere → existing fallback. (Today's behavior; unchanged.)
- **Follower loss after decision, before consumption**: it stays HELD (CLOSED), catches up, opens from its own log. Witness 1's partial-OPEN-on-refused-release cannot occur — a refusal without a committed decision has nothing to consume.
- **Leader loss during publication**: same as above on the publication side; the committed entry remains authority for whoever resumes.
- **Lost decision response**: replay/read by entryId (section 7).
- **Restart between commit and local application**: CLOSED until catch-up; reopen follows section 6; no protected write passes before local application.
- **Delayed old-epoch RESUME** (post-replacement): fails identity (new configurationKey/membershipGenerationIndex) → typed STALE; cannot open anything.
- **Membership replacement mid-window**: `confChangePending`/identity refusal keeps the census from proposing; if it happens after commit, the generation binding invalidates on apply.
- **Outstanding TX1 work appearing while release OPEN**: section 8; corrective HOLD + recovery owners.

## 11. RED-first proof plan (smallest meaningful; reuse real-native witnesses)

No deadlines change; no new INSPECT loop; probes stay measuring-only (R27).

1. **P1 (exists, RED today — keep)**: `participant-release-control-partial-open-falsifier` (blob `f6becd95…`) stays the red gate for the answer-driven design; the committed-decision design must make it green *and* keep the old-source green run (identical bytes at 47ceb42e4)
reproducible.
2. **P2 (exists, RED today — keep)**: `participant-release-control-late-follower-loss-witness` (e15166a62). Green under the design: no RESUMED-before-anything, refusal before/after decision never leaves protected admission open; committed write remains committed with its settlement obligation visible.
3. **P3 (exists, asserts the defect)**: `participant-resume-idempotent-open-witness` (6a9a522d9): after the redesign the duplicate RESUME (as wake/report) must answer the durable disposition — a typed
STALE/SUPERSEDED outcome for a superseded epoch — never a success standing for
"fresh validation".
4. **P4 (new RED)**: commit-decision-then-lose-coordinator: after quorum commits the release entry, kill the coordinator before any consumption; a restarted replica opens from its own log and ordinary protected writes flow only after local application; a probe observing *any* OPEN with the entry unapplied, or any refusal misclassified as aborted, stays red until implemented.
5. **P5 (new RED)**: stale-epoch re-authorization: after membership replacement, replay the old RESUME/command; expect typed STALE and CLOSED admission; red while any identity-based fast path remains.
6. **P6 (new RED)**: corrective-hold-not-rollback: after OPEN, a TX1 row appears → HOLD applies → members re-close; the write admitted between the two entries must remain committed and its settlement observable; red while any code claims the PAUSE retracted history.
7. Then the quest's normal gates before any landing: `unchanged-seed-1000-5000-ms-and-transaction-integration`, corpus/static, and the independent composed review — outside this design step.

Each P is written on the real native owners (real ReplicaHandler + liferaft + real Raft consensus, the same fixtures the existing witnesses use), RED on the current candidate source for 4-6 (no such durable fact exists), and their distinctions (commit vs apply vs settlement vs external ack) are separately asserted, as witness 1 already demonstrates is observable.

## 12. Assessment of the current sealed Quest (R09 — supersede, never reinterpret)

The quest's **statement** (idempotent, fail-closed, bounded current-proof
amortization) remains served. Its **constraints** do not fully fit:

- `single-existing-cutover-owner` names the release handler/predicates as the
  only implementation surface; a new command family member is a change to the
  `participant-apply` × `participant-release` interaction (R02) — outside that
  sentence as written.
- `quiescent-current-proof` mandates "Resume only via the existing exact
  identity-checked RESUME owner" — kept as a consumer, but no longer the
  authorization; honoring it literally would preserve the defect.
- The `full-fallback` guarantee is violated by the *current* implementation
  regardless (witnesses 1-2), so the seal is already unsatisfiable as-is.

Required explicit decision (owner's, not mine): supersede the two constraint
statements above with the committed-decision contract (sections 2-8), record
the supersession in this Quest's log (or seal a successor Quest with this one
superseded-by), and only then implement. **Until that decision, nothing is
implemented and the seal is not weakened by implication.**
