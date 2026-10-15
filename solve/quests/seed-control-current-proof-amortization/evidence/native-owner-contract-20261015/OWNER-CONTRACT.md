# Native release-fencing owner contract and implementation gate

Evidence-only packet, 2026-10-15. Base: `bde70cec74b8eb8e8db17d0d50a432102947d6d4`.
The user accepted **REJECT** for that specification/model. Its source is a
measurement baseline, not an implementation contract. This branch inherits
rejected PR #122 source and must not be merged wholesale.

The decisions below carry the user's accepted semantics. Proposed storage,
capacity and witness details remain **HOLD for design/owner closure** where
explicitly marked. No production source changes, successor seal/activation,
main publication or protocol certification are part of this packet.

## One owner for each decision and communication

Retain D0 preparation, D1 Raft commitment, D2 deterministic application,
D3 local serving eligibility, and D4 caller observation. These are distinct
facts, not five authorities over the same question.

| Question | Sole semantic owner | Boundary and supplied evidence |
| --- | --- | --- |
| Which release request and exact prerequisites are being proposed? | Existing release coordinator/recipient (`replica-handler-participant-cutover.js`, `replica-handler-participant-release.js`, `partition-participant-release-contract.js`) | D0 captures immutable intent through command admission; transport delivery is not an application result. |
| What is ordered, at which actual position? | `raft-rs-runtime-owner.js`, through the frozen operation port | D1 supplies actual committed index/term. Request/submission counters supply neither. |
| Does this ordered release transition authorize new partition work? | Partition committed application, with release semantics owned by the existing release contract | D2 evaluates replicated state and canonical command inputs inside `raft-rs-application-transaction-owner.js`. One durable release-state record, not an additional invalid/spent-epoch authority. |
| Which transaction exists and how does it settle? | TX1 request/session/bytes/apply/store owners | First durable PREPARE is admission; durable participant outcome is replay/settlement authority. Global COMMIT/ROLLBACK remains query coordinator-owned. |
| Can this live replica serve? | `partition-participant-transaction-pause.js` | D3 combines applied authorization with current local build/lifetime/membership eligibility. Local failure closes serving; it does not rewrite another replica's D2 outcome. |
| What happened to this exact request? | Existing partition durable-result path, extended with a typed release result | D4 reads the immutable request result; current release state and local eligibility are separate observations. It never reads disposition from submitted intent or borrows a winner's approval. |

The existing release contract owns the release-fencing invariant across
admission and TX1. The named subsystem owners retain their decisions and
enforce the explicit communication contracts between them. No diagnostic,
census cache, retry driver, test fixture or recovery scanner may independently
adjudicate release authority. The registered partition operation-port, runtime application
transaction, and distributed transaction interaction contracts must change
together with the eventual complete implementation.

## Minimal source-to-contract map

Paths below are relative to `src/`; functions and behavior refer to the exact
base above. Every proposed new field, command or durable obligation is named
as a change, not described as existing behavior.

The ordinary-write communication path also includes
`partition/partition-write-kernel.js:buildPartitionWriteEntry` and
`partition/partition-service-write-metrics-base.js:applyWrite`: entry
construction, pending/result replay and admission must preserve the same
binding supplied by the query delivery owner. These are existing owners of
that path, not permission to add another retry or authorization authority.

| Surface / existing authority | Current behavior | Required change and immutable inputs | Persistent result / replay | Native witness |
| --- | --- | --- | --- | --- |
| HOLD/release: `node/replica-handler-participant-cutover.js:runCutoverAttempt`; `node/replica-handler-participant-release.js:receiveParticipantRelease`; `partition/partition-participant-release-contract.js:releaseIdentityOf` | Distributed local PAUSE/ENABLE/RESUME; no committed HOLD/release version family | **New** canonical release/HOLD command via existing release request and committed-command admission owners. Bind partition, expected complete release state, request identity/content digest, exact release identity, committed membership/origin and D0 evidence position. | **New** release state/version and exact result, atomic with applied position. Accepted transition alone increments version. Refusal leaves authority unchanged. | Existing late-loss witnesses preserved; actual committed HOLD/conflicting-release races presently unavailable. |
| Local session to first PREPARE: `partition/partition-participant-transaction-request.js:beginParticipantSession,sealSession,prepareSession`; `...-session.js:openParticipantSession`; `...-bytes.js:buildPrepareCommand` | BEGIN is a WeakMap session; PREPARE seals operations/validation/digest. No release binding exists. | **New** immutable admission binding captured at local admission and retained in session, canonical PREPARE bytes/digest and all retries. No replicated BEGIN. An old sealed request cannot be retagged after unknown outcome or rerouting. | Existing participant row remains authoritative once present; any new binding columns/format compatibility are an explicit schema/bytes change. | RF3 leader-only staging/no durable BEGIN; first PREPARE sent after actual local PAUSE. Already-sealed delayed bytes across committed HOLD remain a gap. |
| Ordinary write / first PREPARE enforcement: `partition/partition-service-raft-write-commit.js:startAdmittedPartitionWrite`; `partition/partition-service-entry-apply-base.js:applyCommittedEntry`; `partition/partition-participant-transaction-apply.js:applyParticipantPrepare` | Ordinary new requests check local PAUSE. PREPARE calls the commit owner directly; fresh deterministic apply checks reservation/generation/validation, not release version. | **New** binding on ordinary command bytes too. D2: after exact durable replay, new work requires the bound current APPROVED state. HELD or stale binding refuses new effect/PREPARED even if D3 elsewhere was open. | Fresh deterministic refusal must have a stable exact result in the existing applicable outcome owner, committed with position; environment failure still rolls back and holds application. | Paused ordinary write is the exclusion control beside first-PREPARE RED. Ordinary already-proposed write vs committed HOLD cannot be witnessed before that command exists. |
| Request delivery/reroute: `query/query-executor-partition-request-builders.js:createDefaultPartitionRequestBuilder`; `query/sql-query-engine-participant-wire.js:participantTransactionRequestOf`; `query/query-executor-partition-delivery.js:executeOnPartition` | Builders copy selected identity/options fields; redirect rebuilds the request. Stable entryId alone cannot carry a new release binding. | **New** binding field must be captured once and forwarded unchanged through initial delivery, redirect, unknown-outcome recovery and retries. Its capture point and canonical query/partition handoff are an explicit open decision; absent binding on an uncertain retry cannot be silently filled with current authority. | Existing request/outcome owner must retain or recover the original binding; no query cache or retry driver may reauthorize it. | Direct native partition messages do not exercise query transport/redirect. Require a real cross-owner delivery witness in the complete implementation unit. |
| PREPARED and terminal replay: `...transaction-request.js:prepareParticipant,decisionOverRow`; `...transaction-apply.js:prepareOverRow,applyParticipantDecision`; `...transaction-store.js:readParticipantTransactionRow` | Existing row precedes fresh PREPARE. Applied replay checks content digest; the request fast path keys the row by transaction/participant without comparing the incoming epoch. First terminal decision is immutable. | Preserve precedence, but exact identity/content validation is an explicit change where missing: validate against the durable record before applying the new-admission fence. Unknown absent row is not proof of noncommit. | Participant outcome and original prepare/decision index/term persist. No new conflict annotation per replay. | Exact PREPARE/terminal request replay while paused; opposite decision refused. These request fast paths do not prove duplicate committed-command application. |
| Authoritative DECISION under HELD: `query/distributed/distributed-transaction-decision.js:recordTransactionDecision`; `...settlement.js:applyTransactionSettlement`; `partition/partition-coordinator-settlement.js:applyCoordinatorSettlement`; TX1 decision apply | Query owns immutable global decision; participant validates its binding. Fixed freeze/rollback/progress can settle existing coordinator lineage while ordinary admission is closed. | Release must not gain decision authority. Preserve recorded COMMIT/ROLLBACK settlement irrespective of new-admission state, with existing digest/identity verification. | Global record, exact coordinator settlement result, participant terminal row and effects stay with their existing owners. | Real committed coordinator ROLLBACK supplies bytes to RF3 PREPARED participant while local PAUSE remains closed. Full QueryEngine routing and COMMIT-after-HOLD remain additional witnesses. |
| Exact release outcome/conflict: `partition/partition-committed-statement-outcome.js:recordCommittedStatementOutcome,readCommittedStatementOutcome`; coordinator adapter `retainedResult,recordedAnswer` | Statement outcomes already retain owner-result text for fixed coordinator commands. Generic settled SQL answers alone cannot represent release disposition/identity conflict. | Extend this existing durable-result mechanism with a **typed release-result adapter and canonical identity/content binding**, or justify a release-owned schema under the same application transaction if the SQL schema is unsuitable. Storage location is not decided by a no-new-table slogan. | Record requested identity/digest, applied disposition/reason, actual position and original conflict winner identity/digest/position when retained, otherwise explicit unavailable attribution. Exact replay allocates nothing. Reuse of an ID with different bytes is a conflict, never the old approval. | No current release result record/command seam. Native losing-request/D4 conflict schedules blocked until this owner extension exists. |
| Snapshot/retention: TX1 store, statement-outcome store; `raft/snapshot-checkpoint-store.js:prepareRaftRsCheckpointCopy,scrubRaftRsCopy`; `raft/snapshot-retention.js` | One nonterminal participant; terminal rows and statement results have no retirement here. Current rs-raft checkpoint scrub keeps peer identity and drops application tables. Checkpoint-generation retention is not transaction-result retirement. | **New** release state/outcome/retirement watermark must survive a supported application snapshot and recovery. Release may not delete query/TX1 outcomes on its own. Pin and byte budgets require explicit policy below. | Retired means historical result unavailable; it must not mean never committed. Old expected versions cannot authorize again. Current-version refusals remain pinned until version advances or equivalent owner-proven anti-replay protection exists. | Native sequential outcomes and one pinned PREPARED measured. No application-image recovery claim; current snapshot boundary is an explicit blocker. |

## Deterministic transition rules to implement only after closure

1. Resolve an exact retained request first, checking immutable contents.
   A different command using that identity cannot read its approval. Historical
   refusal keeps its original winner; a fresh current-authority observation is
   separately named.
2. A normal transition requires its exact expected release state and canonical
   identity at the actual D2 application prefix. D0's captured prefix is a
   precondition to validate against that prefix, never a replacement index.
   Native actual index/term, membership configuration and generation origin
   are the authoritative inputs. Local term/build/lifetime observations cannot
   silently become replicated application inputs.
3. Proposed HOLD preconditions: a valid release-owner command bound to this
   partition and exact current APPROVED state/identity. It changes to HELD and
   advances the version. It must **not** require drained transactions or free
   ordinary history capacity; those are reasons to close. An already-HELD
   request cannot manufacture another authorization or consume an epoch by
   refusal. Exact original HOLD replay returns its original result. The
   closed-to-closed request disposition must be fixed in the command contract.
4. APPROVE requires exact expected HELD state and owner-produced evidence with
   deterministic membership/origin/schema/prefix checks; an existing PREPARED
   reservation prevents new release admission under the retained drain rule.
   D0 evidence about remote live services and query drain remains supplied by
   their owners. Its canonical binding and which parts D2 can actually verify
   must be specified before approval. D3 alone verifies current local service
   eligibility. A REFUSED request does not close a still-valid APPROVED state.
5. For ordinary work and first PREPARE, a local session is not an obligation.
   Apply exact durable replay first, then enforce HELD/current-binding rules
   on new effects. Settling an existing participant is a different path, with
   query-owned decision bytes, not an exemption based on volatile staging.

Rules 3 and 4 are a proposed precise direction, **not approved new protocol
details**: close-to-close result, initial-state compatibility, D0 proof binding
and recovery format still require content-bound owner review. No INSPECT loop
can make the multi-owner interval atomic. Compensating PAUSE cannot undo
already committed effects.

## Bounded retention proposal and remaining decisions

The native one-nonterminal rule excludes the rejected model's four concurrent
BEGIN-pinned epochs. It does not bound sequential terminal history, refusal
outcomes, conflicting request bytes or undecided release proposals. Existing
TX1 bounds are 256 staged operations and 1 MiB of staged operation bytes
(`partition-participant-transaction-constants.js:PARTICIPANT_TRANSACTION_REPLAY_BOUND`),
not a bound on every identity, decision, result or retained SQLite page.

Propose separate finite **record and encoded-byte** budgets for the release
owner's added state: current authority; unresolved release requests; pinned
participant bindings; retained exact outcomes; replay-retirement watermark;
diagnostics. Count canonical bytes and snapshot contribution, not only rows.
Keep diagnostics outside authority, with their own fixed ring/byte budget.
No numeric production limit is accepted from the model's four-row example.

Let `Q` bound durably possible unresolved release requests, `C` their maximum
canonical bytes, `H/B` the retained outcome count/bytes, and `P` the pinned
binding count with `R` the maximum encoded bytes per pinned binding. Incremental retained release authority must be bounded by
`fixed current + Q*C + min(H*maxOutcomeBytes, B) + P*R + fixed watermark`.
For this TX1 interaction at most one PREPARED obligation is reachable per
partition; do not apply that bound to all coordinator or release obligations.
Existing terminal TX1 history is separately unbounded until its owner adopts
a retirement contract. This proposal does **not** claim a total database cap.

At normal capacity, refuse new ordinary/history admission **before proposal**
with typed retryable backpressure. Exact replay allocates zero. Reserve
independent finite credits/bytes for closure, settlement and recovery under
their existing request owners; priority alone is not a capacity guarantee.
The reservation must account for unapplied/in-flight log work across leader
change, not just a local pending-map size. `Q` must include reserved critical requests
or their finite count/byte budget must be added separately. Preproposal
backpressure is a current admission observation, not a committed exact request
outcome. A committed capacity refusal also
needs a stable outcome; evicting another obligation to record it is forbidden.
Protect the recovery transition that reauthorizes too: HELD(v) can fill its
current-version outcome budget with refusals pinned until version advancement.
If APPROVE is then treated as ordinary admission and closed-to-closed HOLD
cannot advance the version, drain completion still cannot reopen admission.
Reserved recovery capacity or an owner-proven anti-replay retirement rule must
exclude that deadlock, without bypassing the deterministic state checks.
This admission-credit proof and concrete numeric budgets remain open design
obligations; current source supplies no established finite `Q` to substitute.

Retire release history only when the owning obligation is resolved, the
request is below a monotonic persisted retirement/version fence, and exact
outcome retention policy permits unavailable history. A refused request at
the current unchanged version cannot be forgotten and retried as fresh.
An older command is stale regardless of whether its detailed result survives.
Queries return typed historical-unavailable/retired, not NOT_COMMITTED.
A previously unseen stale request arriving after the old winner was retired
cannot reconstruct that winner from the current authority. Its new exact
refusal must explicitly record unavailable historical attribution; it cannot
claim the current winner was the original conflict winner. The exact typed
shape for this case remains a command/result-owner decision. Retained exact
loss replays still reproduce their originally recorded winner without change.
Snapshot recovery must retain current state, pins, exact retained outcomes
and the anti-replay fence atomically. Current metadata-only checkpoint payload
cannot establish this property; application snapshot ownership must close
before claiming restart/learner-transfer completeness.

## Independent-review finding disposition

| Finding | Classification and disposition |
| --- | --- |
| F1 replicated staging / invented DDL precedent | Model fidelity + contract defect. User resolves semantics: local staging, first PREPARE admission. Native witness addresses real boundary; binding/schema implementation remains absent. |
| F2 invalid/spent epoch and false CLOSED | Specification contradiction. Accepted transitions alone advance version; rejected request outcome is separate. No native new-version command exists to test it yet. |
| F3 silent later-authorization adoption | Model/spec defect. Immutable session/command binding required. Existing local PAUSE witness is narrower; delayed sealed bytes across new committed authorization remain blocked by missing surface. |
| F4 command intent reported as outcome / replay winner changes | Model/spec defect. Typed exact durable result with immutable conflict attribution required. Existing native transaction request replay is a control, not release-outcome proof. |
| F5 unchecked HOLD / submission index prefix | Model/spec defect. HOLD preconditions above require final owner closure; D2 uses actual committed position. Native Raft already supplies it. No fresh native committed-HOLD race is claimed. |
| F6 retention overflow / annotation growth | False unconditional model bound. Native concurrent pins differ; sequential terminal accumulation is reachable. Count+byte capacity/retirement and snapshot extension remain explicit gates. |
| F7 terminal COMMIT overwritten by ROLLBACK | Model fidelity defect. Native first-terminal rules stay authoritative; opposite-decision and exact replay controls exercise the actual owner. |
| F8 foreign identity opens local gate | Model fidelity defect. Existing release identity/cohort/current-generation validation remains required; do not replace it with model state or a second authority. |

An additional source-mapping gap was found independently: the durable PREPARE
request fast path (`prepareParticipant`, lines 390-408) can answer a different
incoming transaction epoch from a row keyed only by transaction/participant.
`prepareOverRow` checks content digest but not every row identity field either.
SessionId remains routing context; it is not promoted to a new transaction
authority. Existing phase-valid commit-mode transitions must also be preserved.
The new release-binding replay exemption must name exactly which immutable
fields match; that is not wholly unchanged current behavior. A native input
witness is included, with coordinator reachability explicitly limited to the
trusted participant request boundary. This is part of the same replay/result
interaction, not authorization for an unrelated TX1 repair.

The historical partial-open/late-loss witnesses and inherited RC1/RC2 F-MIR
failures remain unchanged. This checkpoint changes no production source;
neither it nor a model counterexample establishes a new production regression.

## Exact next implementation scope proposed for approval

One complete partition-level release/HOLD -> ordinary write/first PREPARE ->
durable outcome/replay path, including its communication contracts:

- Release owner captures/validates one immutable request and exact expected
  state; bytes/admission owners admit the new canonical command family.
- TX1 and ordinary write bytes retain their original admission binding through
  sealing, unknown outcome, reroute and retry; no replicated BEGIN.
- Existing committed application atomically applies release version/state,
  exact result and position; enforces new-work fences after durable replay;
  preserves coordinator decision settlement and environment-failure HOLD.
- Existing outcome owner supplies typed D4 release results and immutable
  conflicts; existing local admission owner derives D3 independently.
- The same unit accounts for finite admission/history capacity, pins and
  recovery of new state. Application snapshot format/provenance is an explicit
  owner decision prerequisite, not a hidden downstream follow-up.
- Native RED-first matrix must cover both orderings around HOLD, delayed old
  bytes after reauthorization, exact/conflicting requests, actual committed
  positions, durable PREPARE/terminal replay, recorded COMMIT and ROLLBACK
  settlement, host failure/restart and retained snapshot recovery at capacity.
  Match impact contracts/registered owner pairs and independent verification
  to that entire unit. Focused greens do not authorize partial fragments.

Implementation remains gated on the unresolved design choices above and the
user's required design/owner decision. Successor unsealed/unactivated;
shared-control-wave HELD; Runner/TAP PARKED; PR #122 rejected.

[Comparative precedents](COMPARATIVE-PRECEDENTS.md) map etcd's atomic compares,
LogCabin's response retirement/snapshot behavior and FoundationDB's retry
identity guidance to these same owners. They add concrete witness questions;
they neither supply a missing Lagrange guarantee nor authorize another
session, retry, result or capacity authority.
