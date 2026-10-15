# Release linearization: one committed decision, consumed by every replica (design v2)

Status: PROPOSAL, revision 2. This document is the response to the independent
architecture review verdict "REVISE, no implementation authorization" against
[design v1](release-linearization-design-20261015.md) (preserved at
`3f86af040`). Supersedes v1 as text; v1's verdict history remains immutable.
**No production change, no landing, no lab campaign, no sealed-record edit
accompanies this document.** Main and the active implementation worktrees are
untouched; this revision is published only on the authorized non-main
preservation route (`continue/rs-raft-control-pause-census-20261014`), beside
v1.

The v1 defect the review named first is real and this revision is built around
correcting it: v1 section 5 (steps 3-4) required each replica to *freshly read
local facts* inside the application transaction and refuse on local
lifecycle/runtime/membership divergence. That makes the durable disposition a
function of when and where the entry happens to be applied — two replicas
applying the same committed entry could persist different dispositions. That
clause is **withdrawn**. The remainder of v1 (commit-of-one-entry as the
linearization point, forward-only supersession, durable disposition row,
RESUME demoted to a wake/report consumer) survives, with its semantics made
deterministic and precisely separated below.

## 0. What changed from v1, mapped to the review

| Review point | v1 treatment | v2 treatment |
| --- | --- | --- |
| 1. Deterministic replicated application, field classification | §5 applied live local reads inside apply | §2: disposition is a pure function of command bytes + prior replicated state; local observations gate only serving eligibility (D3); §2 table classifies every field |
| 2. Precise decision point | §2 named four instants loosely | §3: decision points D0-D4 named as separate states; a command may commit and deterministically evaluate to REFUSED |
| 3. Ingress/proposal path trace | §7-8 partially | §4: every ingress enumerated; committed-HOLD fence theorem proven from log-order application; no retroactive undo |
| 4. `admissionProofMatchesStatus` reconciliation | §6 kept the mechanism, ambiguous | §5: the proof check becomes a *cache-invalidation trigger* for deterministic re-derivation; term/leaderId leave the invalidating proof set; restart/replay/new-leader/catch-up spelled out |
| 5. TX1 rule | §8 held any outstanding TX1 work after open as a HOLD cause | §6: ordinary new TX1 work after AUTHORIZED is normal operation; HOLD only for a new cutover/supersession, whose existing precondition orders and settles outstanding work |
| 6. Identity vs epoch idempotency | one epoch, extend the row | §7: `releaseId` (stable identity) distinct from `releaseEpoch` (unique committed instance); per-epoch immutable rows; snapshot-carried; compaction semantics named |
| 7. Committed success vs failed pre-decision | §7 mostly right, mixed ack uncertainty | §8: outcome classification keyed by committed fact; a decided epoch is never reported aborted because an acknowledgement disappeared |
| 8. Formation circularity and cost | §9 liveness prose | §9: proposal-path independence from the write gate shown concretely; the unchanged 1000/5000 ms seed gates identified for re-measurement |

## 1. Ownership map (unchanged; R01/R03, plus the one R02 unit)

Owners are exactly v1 §1's owners; none moves. The release owner does **not**
acquire TX1 coordinator authority (PREPARE/DECISION proposal and custody stay
with the transaction apply owner and the coordinator handlers) and does **not**
acquire membership authority (term, configuration, joint-consensus stay with
the raft operation port and liferaft). The single new interaction — R02, one
change unit — remains:

`participant-release` × `participant-transaction-apply`: the release decision
becomes two new members of the existing `PARTICIPANT_TRANSACTION_COMMAND`
family, applied by the existing appliers, recorded in the release owner's
existing durable row, gate-read by the existing write-gate owner.

Concretely (owners named, none new):

- Command command family, apply, idempotent replay: `partition-participant-transaction-constants.js`, `partition-participant-transaction-apply.js` (the `applyGenerationOrigin` precedent at line 554 is the exact idempotent-replay shape).
- Durable record: the release/generation row the transaction store already owns (`partition-participant-transaction-store.js` — extended with release columns, `.withReleaseColumns` DDL precedent).
- Disposition evaluation inputs at proposal time (D0): the existing `releaseIdentityValid`, `releaseCensusDefect`, `isReleaseDrained`, `transactionReleaseProofValid`, `readParticipantReleaseFacts` — read once, committed into the command; **not re-read at apply**.
- Serving gate and its lifecycle state: `partition-participant-transaction-pause.js` (`participantCutoverPauseOf`, `pausedWriteAnswerOf`, ADMISSIONS WeakMap) — derives eligibility, never decides the disposition.
- Census of outstanding transaction obligations: `distributed-transaction-release-census.js` and the rebalancer recovery owners — unchanged owners of settlement.

## 2. Field classification (review point 1)

One sentence governs everything: **the disposition a replica persists is a
pure function of the committed command bytes and the replicated state it
already applied — nothing local, nothing live, nothing timed can change it.**

### 2.1 Replicated authority (bound in the command; sole inputs to the disposition)

Everything below is fixed when the coordinator proposes and immutable once
committed. Applying it is mechanical.

- Identity fields (the existing `releaseIdentityOf` five-tuple, hashed into `releaseId`): `partitionId`, `protocolVersion`, `targetBuildDigest`, `configurationKey`, `membershipGenerationIndex`.
- `releaseEpoch` — the monotonic per-partition release instance number (§7).
- `disposition` — `APPROVED` | `REFUSED(reason)` (committed refusals are decisions too; §3).
- Census binding: `censusDigest` over the committed census inputs — `rowGenerationDigest`, `schemaVersion`, `semanticVersion`, `recoverableTransactionIds`, enforcement digests — i.e. exactly what `releaseCensusDefect` validated at decision time.
- Provenance, recorded but not gating: `leaderReplicaId`, `attemptTerm` (the term *at proposal*; committed and therefore deterministic, unlike live term at apply), canonical `entryId`.
- HOLD-only: `supersedesEpoch`.

### 2.2 Deterministic apply inputs (the complete list)

For the applied entry at `(term, index)`:

1. The command bytes above.
2. The prior persisted release state at that log position: `lastAppliedReleaseEpoch` and the disposition rows for epochs already applied in log order.

Both are identical on every replica applying the same prefix. No other input is
read inside the application transaction.

### 2.3 Local lifecycle observations (D3 eligibility only; never the disposition)

`lifecycleIncarnation`, `runtimeGeneration`, `ownerIncarnation`,
`connectionGeneration`, `admissionGeneration`, local applied-index lag,
restart state, the process-local ADMISSIONS cache. These decide whether *this
serving replica* is currently eligible to execute the (already committed)
disposition. They are never written back into the disposition record and never
re-derive it. Where they diverge from the binding, the replica is locally HELD
with a typed reason (§5) and the epoch is consumed for it; convergence to
service is the recovery/re-release owners' obligation, exactly as an
unavailable or stale node is repaired today.

### 2.4 Prohibited from influencing deterministic apply

Any of these read inside apply is a defect of this design:

- live term / live `leaderId` at apply time;
- live membership or configuration state beyond the committed binding;
- live work/census/drain observations;
- wall clock, event timing, transport answers, cached status, local error or
  availability states.

A test asserting byte-identity of the persisted disposition across replicas in
different lifecycle, leadership and load states is the ratchet for this (P-D,
§11).

## 3. Decision points (review point 2)

Five distinguishable states; conflating any two is what the witnesses exposed.

- **D0 — proposal evaluation (coordinator, pre-commit, local):** run the
  existing owners once — identity recompute, committed-read census of each
  current member, `isReleaseDrained`, query-drain proof — and select the
  typed disposition `APPROVED` or `REFUSED(reason)` it yields. Output only;
  the coordinator's observation is not authority by itself.
- **D1 — commitment (Raft, group-wide, exactly once per epoch):** quorum
  acceptance of the entry at `(term, index)`. This is committed history: it
  happened even if no replica ever applies it, even if the coordinator died
  upon seeing the ack quorum, even if a later epoch supersedes it. It is never
  revised.
- **D2 — applied disposition (deterministic, per replica, identifier across
  replicas):** mechanical execution of §2's rule inside the application
  transaction, persisting `{releaseEpoch, releaseId, disposition}` immutably
  and advancing `lastAppliedReleaseEpoch`. The same entry applies to the same
  value everywhere, including on replay (`REPLAYED`, no-op on already-recorded
  rows). **A command may commit (D1) and deterministically evaluate to
  REFUSED (D2)** — that is a decided release attempt the caller is told about
  by name, not an aborted one.
- **D3 — local serving eligibility (per replica, recomputable at any time):**
  may this replica execute an open release now? Derived from the durable D2
  record + current committed identity status + local §2.3 observations. It
  opens only when D2 recorded APPROVED for the current binding, no later
  applied HOLD supersedes the epoch, appliedIndex ≥ the decision entry's
  index, and the local observations match the binding (§5). It closes and
  re-closes as observations change, and none of that touches D1/D2.
- **D4 — observable coordinator outcome (what the caller is told):** classified
  by D1/D2 facts (§8), never by an ack, a timer, or the absence of one.

Boundary sentence for the seal: *D1 is history; D2 is the persisted decision;
D3 is this replica's current right to execute it; D4 is how the coordinator
names the result. A lost message can gate D3 and slow D4; it can never alter
D1 or D2, and it can never reclassify a committed decision as aborted.*

## 4. Ingress and proposal trace; the committed-HOLD fence (review point 3)

The fence claim: **a committed `PARTICIPANT_RELEASE_HOLD` at log index h
closes admission for every command that commits at an index > h, retroacts on
nothing, and every replica reaches that state in the same log order.** Proof
sketch: application is in strict log order on every replica (existing
applier), so every entry at index > h applies after the HOLD on that replica;
the gate consults the durable record (D2) at execution time, so a write gated
after the HOLD applied sees `lastAppliedReleaseEpoch` ≥ the HOLD epoch and
refuses; entries at indices < h applied (or will apply) first and are settled
committed history — the HOLD carries no operation and rewrites none (this is
the corrective-PAUSE-not-rollback property). Duplicates via reroute/entryId
dedup cannot re-open an epoch: a re-proposed identical entry replays (no-op),
a differing entry with `releaseEpoch ≤ lastAppliedReleaseEpoch` deterministically
evaluates to EPOCH_CONFLICT (§7) and records no disposition change.

Path-by-path:

| Path | Owner today | Behaviour under HELD (no committed release, or HOLD applied) | Behaviour across the HOLD boundary |
| --- | --- | --- | --- |
| Ordinary protected SQL write (application) | write kernel → `pausedWriteAnswerOf` | `WRITE_CUTOVER_PAUSED` typed refusal (unchanged) | A write proposed before the HOLD's proposal may still commit at an index < h and applies before the HOLD — it remains committed and acknowledged, with its settlement obligation owned as today. A write proposing after h (or gated after the HOLD applied) is refused. No write commits at an index > h with admission opened by the superseded epoch, because gating is checked at execution against the durable record, and log order puts every such execution after the HOLD applied. |
| TX1 BEGIN / staging | transaction coordinator handlers | New protected transaction work refuses under HELD (typed, existing path); an in-flight staging session settles per its own state machine | A PREPARE committed before h applies before the HOLD and stays PREPARED — recovery settles it, not release. A PREPARE ordered after h cannot admit (its upstream write/entry refused). |
| TX1 PREPARE / TX2 DECISION (committed commands) | `PARTICIPANT_PREPARE`, `PARTICIPANT_DECISION` appliers | **These keep applying while HELD.** They are settlement, not protected admission; R12 forbids load on the control plane from abandoning a prepared obligation. | Unchanged semantics; settlement of work committed before the fence proceeds under HELD exactly as the current refusal-witness behavior requires. |
| CDC effects | existing CDC log-command producer | Effects propose as ordinary log commands; application gated only where they carry protected writes | A CDC effect order-dependent on a protected write cannot outrun the fence: it is ordered by its own committed index, which is > h if it was produced after the HOLD's commit. If produced earlier but committed before h, it stays committed. |
| Previously handed-off proposals (leader change; entryId reroute) | reroute + entryId dedup | Re-proposals of the same entryId replay idempotently at their original resolution | Ordering is by committed index, never by submission time, so a hand-off proposal can fabricate no index between h and its consumer: it commits either before h (settled history) or after (fenced). |
| The release/HOLD commands themselves, GENERATION_ORIGIN, membership | operation port | Proposable while write admission is closed (see §9 — no circularity) | HOLD supersedes forward-only; re-proposal idempotent by entryId. |

Retroactive-undo clause: no command in this design rewrites, tombstones or
"closes" an earlier committed write or disposition. A refused release attempt
has nothing to undo (nothing committed); a HOLD supersedes forward; recovery
and census owners remain the only settlement authority for work already
committed (witness 1's committed row on r1 stays exactly that obligation).

## 5. Reconciling term-independent authorization with `admissionProofMatchesStatus` (review point 4)

Current code (`partition-participant-transaction-pause.js:218`): an OPEN
admission stores a proof `{term, leaderId, configurationKey,
membershipGenerationIndex, runtimeGeneration, lifecycleIncarnation}`;
`invalidateParticipantReleaseAdmission` compares against `readStatus()` and
re-raises the pause on any mismatch — including a benign leadership flap —
while v1 declared the authorization term-independent. Those two cannot both
hold. Revision:

- **The proof check's role narrows to cache invalidation.** It no longer
  *revokes* anything: on mismatch the ADMISSIONS OPEN entry is degraded to a
  re-derivation trigger — the replica synchronously re-evaluates D3 from the
  durable record (D2) + current committed status. The new evaluation alone
  decides OPEN vs locally-HELD. Term and leaderId leave the invalidating set;
  they are provenance (D0-side), and a leadership change re-derives but never
  by itself re-raises the pause.
- **Validating set for re-derivation (D3):** durable disposition = APPROVED
  for the epoch; no later applied HOLD/supersession; appliedIndex ≥ decision
  entry index; committed identity binding still matches current
  `configurationKey`/`membershipGenerationIndex`/`targetBuildDigest` (from the
  committed status/composition owners, not from a live census); local
  §2.3 generation observations match what this replica last established
  eligibility for (a restart or runtime replacement re-derives from CLOSED and
  finds its incarnations changed → locally HELD, epoch consumed for it).
- **restart:** ADMISSIONS is process-local and starts CLOSED after restart
  (unchanged). The durable disposition row survives (§7). Catch-up re-applies
  the decision entry idempotently (`REPLAYED` — `applyGenerationOrigin`
  precedent, line 554/569); the outcome recorded is byte-identical to the
  original D2. Reopening then follows the D3 rule above; with unchanged
  committed identity but changed local incarnations, the replica stays CLOSED
  and locally HELD with a typed reason — the recovery/re-release owners
  re-drive with a **new epoch** (§7). The restart path never consults a cache,
  a leader's say-so or a transport answer (R10).
- **replay:** Replaying committed entries on catch-up yields the same D2 rows
  and must produce no second effect (idempotency keyed by `releaseEpoch` +
  canonical entryId, same mechanism as GENERATION_ORIGIN).
- **new leader admission:** On regaining leadership (or after a leader change)
  the same derivation runs: durable row + committed status. Because
  term/leaderId are not invalidating, admission that was OPEN and whose
  binding still validates stays OPEN (re-derived, not trusted from the stale
  cache). A *newly released* epoch must be proposed by the current leader;
  supersession needs leadership (Raft), execution does not.
- **catch-up with a changed runtime incarnation:** The disposition is recorded
  identically on the catching-up replica (deterministic D2); its D3 stays
  CLOSED+HELD(reason) because its local generation fields no longer match the
  proposal-time binding. This is the exact, named "epoch consumed locally"
  state: no replica's persisted disposition changed, the group history is
  unchanged, and the re-release owner re-decides at the next epoch. Nothing
  here is inferred from an absent value (R07): HELD reasons are typed
  (`INCARNATION_CHANGED`, `SUPERSEDED`, `IDENTITY_STALE`, `BEHIND_ON_APPLY`).

## 6. Corrected TX1 rule (review point 5)

v1 §8 wrongly made "outstanding TX1 work appears while a release is OPEN" a
HOLD trigger. Corrected:

- **After an APPROVED epoch applies, ordinary new TX1 work is normal
  post-release operation.** The partition serves protected writes again; BEGIN/
  PREPARE/DECISION traffic arising from those writes is ordinary work and is
  never, by itself, a reason to HOLD, re-census-fail or re-close. There is no
  corrective-reopening loop watching for it.
- **Outstanding work during a new cutover** (a later release, e.g. a
  succeeding build or a superseding cohort) is what the existing machinery
  already orders and settles: the drained-census precondition
  (`isReleaseDrained` per member + the query census via
  `transactionReleaseProofValid`) gates the *proposal* (D0); prepared
  obligations are settled by their existing owners (PARTICIPANT_DECISION
  commands apply whether HELD or not, ▸ §4); a precondition that cannot be
  met in the unchanged deadline is a typed refusal with the full existing
  fallback (the sealed `full-fallback` constraint, unmodified). HOLD is one of
  the tools a *new* cutover may use to supersede — proposed because a new
  attempt needs the epoch superseded, never merely because work was observed.
- The coordinators' proposal rights are unchanged: the release owner gates
  *data admission*; it does not take custody of transactions (§1).

## 7. Identity, epoch and idempotency under uncertainty and compaction (review point 6)

- **`releaseId`** (existing hash over the five identity fields) is the *stable
  release identity* of an intent: identical across retry attempts of the same
  cutover against the same build/cohort.
- **`releaseEpoch`** is the *unique committed release instance*: strictly
  increasing per partition, allocated by the proposing coordinator as
  `lastAppliedReleaseEpoch + 1` from a committed read, surfaced for dedup by
  the proposal itself. Two attempts may legitimately carry the **same
  releaseId in different epochs**; a delayed retry carrying an old epoch+id is
  nameable, not ambiguous.
- **Durable record:** a row per epoch — `{releaseEpoch, releaseId,
  disposition, censusDigest, supersededByEpoch?}` — plus the scalar
  `lastAppliedReleaseEpoch`. Rows are written once inside the application
  transaction and never mutated; supersession adds a pointer only. This
  extends the release owner's existing durable row/table (the
  `origin_index`/`origin_term` record); it is **not** a new ledger (R03/R06).
  It is part of the replicated state machine state, so **snapshots carry it:
  log compaction cannot erase a decision.** After compaction, delayed
  questions are answered from the rows, not from the absent log:
  - current epoch, no supersession → the epoch's own typed disposition;
  - superseded epoch → typed `SUPERSEDED(byEpoch)` — never a silent success;
  - unknown epoch (never committed) → typed `UNKNOWN_EPOCH`.
  There is no "already OPEN" answer anywhere in the vocabulary (witness 3's
  defect stays structurally impossible; R07: outcomes are named).
- **Uncertain submission:** a retry with the same canonical entryId replays
  the command (idempotent, same D2) or reads the recorded row — coordinator
  side can always ask "what did epoch E decide" and get a typed answer. A
  *different* command proposing an epoch ≤ `lastAppliedReleaseEpoch`
  deterministically evaluates to `EPOCH_CONFLICT` (recorded apply-refusal, no
  disposition change) — two racing coordinators cannot fork the history; log
  order picks, and every replica picks the same one (§2.2).

## 8. Outcome classification: committed success ≠ not aborted (review point 7)

The coordinator's outcome (D4) is a function of committed facts only:

- **`NOT_COMMITTED`** — provably no entry for this attempt committed
  (committed read / entryId absence at the decision instant). This is the only
  aborted outcome; it carries the typed pre-decision refusal and the existing
  full fallback. Nothing opened anywhere by construction (no entry → no apply
  → no OPEN; this is what PR #122's falsifiers show an answer-driven design
  cannot claim).
- **`COMMITTED{releaseEpoch, disposition}`** — the epoch committed (D1).
  Whether an ack from a follower was lost, whether the coordinator crashed
  immediately after, whether a member has not yet applied — none of it
  changes the class. Per-replica consumption status (HELD reasons, applied
  positions) is reported as *observations* alongside, not folded into the
  disposition. A quorum-committed APPROVED with one unavailable follower is
  **reported committed**, with that follower's pending application visible —
  never "aborted because r2's ack disappeared", and never "aborted" after a
  timeout (a timer bounds waiting; classification asks the fact).
- Class transitions are monotone: NOT_COMMITTED can later become COMMITTED
  (delayed commit observed by committed read); COMMITTED never reverts
  (history).

## 9. Formation circularity and actual cost (review point 8)

- **Proposability before admission opens:** the release/HOLD commands are
  proposed on the operation port exactly like `PARTICIPANT_GENERATION_ORIGIN`
  (which today is itself proposed during transaction-admission enablement on
  these partitions) and like PREPARE/DECISION. The write gate
  (`pausedWriteAnswerOf`) refuses *application-level protected data writes*
  only; it is not an ingress condition for log-command proposals. So a
  partition that has never opened protected admission can still have its
  release decision proposed, committed and applied: proposal → commit → apply
  → gate opens. No cycle: nothing about *proposing* the decision requires the
  decision's effect.
- **Formation startup:** the seed/formation path (bootstrap → election →
  control release → admission) gains one committed log entry and loses the
  per-member RESUME publication dispatch — a replacement on the same critical
  path, inside the same budget. No new timer exists in this design; the
  sealed `timers-and-shared-deadline` constraint stands verbatim (the exact
  incoming deadline, original 1000/5000 ms seed allowance, expiry within it is
  a regression). The re-measurement obligations are named in §11 (P-G).
- **Application cost:** D2 is one indexed row write + a scalar update inside
  the transaction the applier already runs; D3 derivation is one durable read
  + one committed status read per re-derivation event (no per-write census —
  §5 validating set). No new INSPECT loop, scheduler, or background process.

## 10. Deterministic state-transition table (required proof artifact)

Per-replica deterministic apply. Inputs (per §2.2): command bytes C and prior
replicated state (`lastAppliedReleaseEpoch` = L; already-applied rows).
Outputs: D2 row effect (identical on every replica for identical prefixes)
and the D3 gate action each replica derives afterwards (§2.3 — may differ
across replicas, never persisted into D2).

| # | Applied entry | Deterministic precondition (command stream only) | D2 effect | D3 gate action |
| --- | --- | --- | --- | --- |
| T1 | `RELEASE_DECISION(E, APPROVED, identity I, census C, entryId i)` | `releaseIdentityValid(I)` ∧ (`E > L` ∨ (`E = L` ∧ exact row bytes match C)) | APPROVED row{E}; L ← E (fresh) | Eligible iff binding matches current committed identity ∧ appliedIndex ≥ entry(E) ∧ local generation observations match: OPEN; else CLOSED + typed HELD reason |
| T2 | `RELEASE_DECISION(E, APPROVED, …)` re-applied / caught up | same bytes as E's existing row ∧ same entryId i | `REPLAYED` (row unchanged, L unchanged) | re-derive D3 as T1 |
| T3 | `RELEASE_DECISION(E, APPROVED, …)` differing bytes | `E ≤ L` ∧ bytes differ from E's row | `EPOCH_CONFLICT` apply-refusal annotation; no row, L unchanged | CLOSED (stays; typed reason) |
| T4 | `RELEASE_DECISION(E, REFUSED(r), I)` | identity valid ∧ `E > L` | REFUSED row{E, r}; L ← E | CLOSED (stays) |
| T5 | `RELEASE_DECISION(E, *)` identity invalid | hash mismatch | REFUSED_APPLY(`identity_invalid`) recorded; L ← E | CLOSED |
| T6 | `RELEASE_HOLD(E, supersedes S)` | `S ≤ L` ∧ `E > L` | HOLD row{E, supersedes S}; L ← E | CLOSED on every replica that applies it (supersession is the fence) |
| T7 | `PARTICIPANT_PREPARE` / `PARTICIPANT_DECISION` / `GENERATION_ORIGIN` / ordinary data write at index k | existing applier rules (unchanged) | unchanged effects, in log order | data write executes only if the gate derived OPEN at this point of the same log order; PREPARE/DECISION settle regardless of HELD |

Fence corollary (review point 3): after T6 at index h, every entry at any
index > h hits T7 with the gate re-derived post-HOLD — a protected write whose
gate check runs there refuses; no entry can apply before the HOLD that commits
after it, because application is in log order. Entries at index < h are
settled history (T7 unchanged effects) and are never undone.

Determinism corollary (review points 1-2): for identical log prefixes, rows
produced by T1-T6 are byte-identical across replicas regardless of lifecycle,
runtime, leadership or load — that is P-D in §11.

## 11. RED-first test plan (review-required scenarios; no new machinery)

Rules: every P is a real-native test on the same fixtures the three preserved
witnesses use (real ReplicaHandler + liferaft + real Raft consensus); RED on
the current candidate source where no committed decision fact exists, RED on
revert for load-bearing behaviour once implemented; no deadline widened, no
assertion loosened, no ratchet raised (R27: probes measure only).

Preserved witnesses (unchanged bytes; GLM's three):

- **P1 = `e15166a62`** (inherited late-follower-loss race). Under the design it
  turns structurally unconstructible: the mid-publication loss cannot leave
  part of the cohort OPEN on a refused release, because the "refused" outcome
  is either not committed (nothing opened anywhere) or a committed REFUSED
  (nothing opened anywhere).
- **P2 = `1994870bb`** (stale post-PAUSE census falsifier). The census is spent
  once at D0 and committed; a RESUME can no longer construct a validation
  after the fact.
- **P3 = `6a9a522d9`** (idempotent-OPEN duplicate-RESUME answered RESUMED).
  Under the design the duplicate names the durable row: `SUPERSEDED`/
  `STALE`/current disposition — never a success standing for fresh validation.

New required coverage (RED-first, mapped to the review's list):

- **P-D (deterministic disposition):** apply one identical decision entry to
  replicas in deliberately different local lifecycle states (restarted,
  leadership-flapped, under load, mid-catch-up) and assert the persisted
  disposition rows are byte-identical (§10 corollary) while their D3 gates may
  legitimately differ. RED today: v1-candidate's apply reads local facts.
- **P-E1 (follower loss immediately before commitment):** member down at D0 →
  typed pre-decision refusal, nothing committed, nothing open anywhere.
- **P-E2 (follower loss immediately after commitment):** quorum commits;
  follower's ack lost; D4 class = `COMMITTED`, follower's pending application
  visible as an observation; on its return it opens from its own log with no
  coordinator.
- **P-L (leader loss between commitment and local application):** coordinator
  dies post-commit pre-consumption; any successor reconstructs from committed
  facts by entryId; consumption continues through the existing applier path;
  the outcome is never `NOT_COMMITTED`.
- **P-F (in-flight protected write across a committed HOLD boundary):** a
  write committed at index < h stays committed with a visible settlement
  obligation (no retroactive undo asserted directly against the row); a write
  ordered after h refuses with `WRITE_CUTOVER_PAUSED`; both asserted in one
  run (§4 table). RED on revert if any path un-orders application or claims a
  rollback.
- **P-I (identity vs epoch):** same `releaseId` re-proposed at a later epoch;
  delayed RESUME naming an old epoch with the same id answers
  `SUPERSEDED`/`STALE` by epoch — never confused with the newer epoch's
  disposition (§7). RED while releaseId alone can answer.
- **P-R (restart / catch-up with changed incarnation):** restart mid-window →
  CLOSED until catch-up; disposition re-applies `REPLAYED` byte-identically;
  D3 derives locally-HELD (`INCARNATION_CHANGED` or `BEHIND_ON_APPLY`); no
  protected write passes before local application; recovery/re-release
  re-decides at a new epoch with the same releaseId (linking P-I).
- **P-T (TX1 rule):** two halves — (a) outstanding TX1 work during a *new*
  cutover is ordered by the drained-census precondition and settled by its
  existing owners while HELD (PARTICIPANT_DECISION applies); (b) ordinary new
  TX1 work after an APPROVED release is served normally and triggers no HOLD,
  no re-census-refusal, no corrective reopening. RED on any residual
  "work-observed-after-open ⇒ hold" path.
- **P-G (unchanged seed gates):** the re-measurement of the canonical seed
  scenario under the exact unchanged 1000/5000 ms budgets and the existing
  transaction-integration suites — this gates landing, not this proposal step.

Final landing gates are unchanged and outside this design step: the sealed
receipt's `unchanged-seed-1000-5000-ms-and-transaction-integration`,
corpus/static, independent composed review.

## 12. Quest decision (owner's, prepared per instruction)

The sealed Quest `seed-control-current-proof-amortization` (seal
`68c88fcf…`, probe-receipt evidence) is left perfectly untouched: its
statement, constraints, evidence and the 2026-10-15 REJECT finding remain the
immutably recorded history (R09/R21). The separate
`seed-shared-current-control-wave` investigation stays HELD exactly as the
rejecting finding records it ("must not assume RESUME safety").

Per the review instruction, a **successor-Quest draft** under epic
`raft-rs-full-cutover` is prepared beside this document —
[`participant-release-committed-disposition-quest-draft.json`](participant-release-committed-disposition-quest-draft.json)
— intentionally **unsealed and unactivated**
(no `solve.js start`, no quest directory, no probe measured; the draft
identifies the `doneWhen` probe that must first be red to seal). Its scope:

- owns exactly the `participant-release × participant-transaction-apply`
  interaction: deterministic dispositions, decision-point separation, the
  HOLD fence, epoch/identity separation, outcome classification;
- explicitly does **not** move TX1 coordinator authority or membership
  authority into the release owner (named constraint in the draft);
- explicitly does not widen any timer, add a consensus abstraction, admission
  ledger or corrective reopening loop.

Supersession bookkeeping remains the owner's later decision, exactly as v1
stated: when this successor Quest is approved, the two superseded constraint
sentences of the sealed Quest are superseded explicitly at that moment —
never reinterpreted (R09) — and the supersession is recorded where the
instruction directs.

**Stop: this revision stops for independent review before any implementation
authorization, sealing or activation.** Nothing in `src/` changes under this
commit; main is untouched; the reserved witnesses and the HELD wave Quest are
unmodified.
