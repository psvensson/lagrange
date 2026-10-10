---
audience: development
documentClass: planning
---

# TX1 owner decisions and bounded continuation

Current continuation: see [Implementation follow-up after design acceptance](#implementation-follow-up-after-design-acceptance).
The earlier checkpoint and review instructions below remain the historical
basis; they do not require repeating the now-accepted design review.

Decision date: 2026-10-10. Reviewed published head
`6d24e3b4f0b64212e05ce0b66668d67dc82ba812`. The operator asked the cloud lead
to resolve the local client's blockers. **The cloud/query lane agrees the seam
below.** These decisions replace the corresponding open choices in
[seam revision 6](seam-2026-10-10.md) and qualify
[design revision 6](design-leg-a-v6-2026-10-10.md). They do not approve that
rejected design, the unseen revision 7, participant source, or Quest landing.
The eight-receipt seal is unchanged. Local and query source ownership stays split.

## Decisions

| Question | Decision |
| --- | --- |
| Single-participant transactions | Prepare-first. Every coordinator-managed transaction prepares before the immutable COMMIT decision, including a single participant. Retire the old ONE_PHASE_COMMIT fast path and its incompatible assertions/documentation. DIRECT_AUTOCOMMIT remains the existing separate ordinary-write path. |
| L5 conflicts and L3 reservation lifetime | Accept partition-granular generation validation and conservative reservation for Leg A. This is an availability/concurrency trade-off, not an R12 exception. A deadline bounds a caller's wait, not the life of a PREPARED obligation or repeated-request starvation. |
| Rowid remedy | Choose owned admission/eligibility guards for the supported SQL population. Defer WITHOUT ROWID conversion. The guard contract below must close the demonstrated paths; a request-entry ceiling check alone does not. |
| Seed migration persistence | S4c option 1: connect the seed SQL engine to the CDC service it creates or upgrades through the existing setter. Preserve migration wiring and recovery activation order. Land with the narrowed S4b refusal. |
| Receipt 8 | Retain the seal. Query owns coordinator decision recovery; local partition CDC producer/delivery and atomic apply owners own the durable notification obligation, replay identity and retention. After-commit emission alone is insufficient. |
| Intentional reds | Preserve the mixed takeover branch. Construct separate FreshMG integration and TX1 work branches with explicit dependency inventories. No generic red-test exemption. Retire obsolete runnable test revisions only with a reviewed replacement map; retain their original bytes and red evidence. |

## Agreed coordinator seam

This is agreement to the following behavior and implementation ownership. The
existing seam contains the detailed fields and named falsifiers; these decisions
control where its earlier alternatives disagree. Actual source still needs the
accepted design and the existing independent verification gates.

| Items | Agreed query obligation and falsifier |
| --- | --- |
| A | Carry canonical transaction/participant identity, mode and applicable epoch/digest fields on every request and response, including session QUERY; bind delivery keys to the exact transaction and operation. S5. |
| B/S | Allocate a random 128-bit transaction ID; insert its initial sql_transactions row once, through the canonical gateway without a coalescing key, before participant fanout. Re-mint only for a confirmed transaction-ID primary-key collision. Resolve uncertain insertion by the exact durable identity/content, never by adopting an unrelated row or inferring absence from a cache. W10a/W10c. |
| C, C' | Keep one insert-once immutable coordinator decision in the existing coordinator persistence owner. Retain all positive PREPARE evidence before COMMIT. Persist a bound ROLLBACK before its fanout; a concurrent winner is read and followed. Uncertain decision persistence is resolved before incompatible fanout. After durable COMMIT, timeouts/failures yield an in-doubt answer and forward recovery, never rollback. Unbound cancellation remains limited to volatile ACTIVE work for which PREPARE was never sent. S1/S8. |
| D, E | Retain exact PREPARE digest/index/term before deciding. Read exact durable terminal outcomes; an absent session/row or PREPARED state is UNKNOWN, never proof of COMMITTED or definitive noncommitment. S2/S6. |
| F | Select prepare-first for the single-participant case and explicitly supersede the old fast-path tests and ONE_PHASE_COMMIT contract. The seal still covers both single- and multi-participant workloads. S7. |
| G, U | Concurrent engines recovering the same transaction converge on the single durable decision. COMMITTING cannot become FAILED/reprepared; recovery also finishes legacy FAILED rows with a durable decision. Cached observations are discovery hints; the authoritative decision owner resolves uncertainty. S3/S4a/S8. |
| S4b, S4c | Explicit BEGIN and multi-partition statement BEGIN require persistence before participant work. Preserve DIRECT_AUTOCOMMIT. Repair seed composition using its existing service/setter, with a positive migration witness as well as refusal coverage. S4b/S4c. |
| V | Retry an entire statement-autocommit attempt only after definitive conflict/noncommitment and completion of any required prior-attempt abort disposition. Use the existing statement owner, one original end-to-end budget and bounded attempt/backoff policy. No fresh transaction retry from UNKNOWN or after COMMIT. Explicit transactions return the typed conflict. W16 plus query-owned retry/recovery witnesses. |
| T/AD | May-have-committed kernel outcomes are UNKNOWN with their underlying cause retained. Definitive pre-admission refusals remain distinguishable. Redelivery retains the same entry identity. The inventoried AD kernel correction may land independently with its own valid bounded acceptance and source verification; it does not close TX1. W11e/f and ordinary-write counterparts. |
| H | Register the coupled coordinator/participant interaction and its discriminating witness through the existing impact-contract owner; update generated metadata through its producers. No second protocol, coordinator or retry framework. |

Decision records are authoritative through the existing trusted coordinator
route. A self-computed digest establishes content identity, not authentication
or proof that an arbitrary caller owns the global decision. Do not add a second
decision lookup during committed apply. Preserve this trust boundary explicitly.

## Bound the SQL claim before extending the classifier

The seven layers and 115 observed opcodes in revision 6 are not, by themselves,
a determinism proof. SQLite's [bytecode is not an application API](https://www.sqlite.org/opcode.html),
and [EXPLAIN does not suppress prepare-time PRAGMA effects](https://www.sqlite.org/lang_explain.html).
Keep one owner with default refusal and a stated supported SQL population.
An opcode check may enforce that contract; observing another opcode must not
silently expand it. Pin the execution compatibility envelope for all replicas,
including restored followers, rather than checking only a leader connection.

Leg A may explicitly refuse unproved raw statement forms before admission.
Document those restrictions in the query contract and inventory their existing
consumers. The positive supported core must retain the ordinary explicit-key,
frozen-value mutations and the actual migration backfill and cutover. Prove
backfill's rowid-range reads/updates remain functional under the guard, as well
as the persisted cutover; a recorded refusal is not a remedy for disabling
that existing consumer. Broader forms need an
explicit argument for identical effects/results on supported replica states;
neither an opcode union nor a count of examples supplies it. If a required form
cannot meet that boundary simply, name the exact consumer and the needed effect
representation decision instead of growing an unbounded SQL-analysis project.

The selected rowid remedy has these acceptance conditions:

1. Resolve schema semantics for rowid, _rowid_, oid, shadowing columns and true
   INTEGER PRIMARY KEY aliases. Preserve a normal explicit, non-null,
   materialized integer key within a declared exact range. Refuse uncontrolled
   alias assignments, omitted/NULL alias allocation and unsafe expressions as
   specified by the supported contract. A blanket keyword ban is insufficient.
2. Exclude random rowid allocation throughout each admitted statement/batch,
   including hidden keys in TEXT-primary-key tables. Existing maximum
   `9223372036854775806` followed by two automatic insertions is a required
   counterexample: checking only for an existing maximum of
   `9223372036854775807` misses it. Use exact integer comparisons and a proved
   allocation bound, or refuse the unbounded form before admission. An operation
   count does not bound INSERT SELECT's number of inserted rows.
3. Cover existing/restored state and every mutation ingress that can invalidate
   the precondition, through the same owner. Do not silently rekey old data.
   Preserve or validate physical-row identity where supported SQL depends on it;
   otherwise refuse that form with an explicit consumer disposition. The guard
   must not convert a valid PREPARE plus global COMMIT into a later local ABORT.
4. Close sessionless as well as session connection-state mutation before
   db.prepare, including the reproduced reverse_unordered_selects PRAGMA.
   Internal storage-owner initialization remains explicit and separate.
5. Show that the reproduced row-order-dependent mutation is refused before
   proposal or yields identical logical effects and durable results on replicas
   with equal logical rows but different physical order. A ceiling guard alone
   does not establish this. Retain positive normal-transaction controls.

SQLite documents [the NULL/ceiling allocation behavior](https://www.sqlite.org/autoinc.html).
WITHOUT ROWID has [observable key and result differences](https://www.sqlite.org/withoutrowid.html).
The current migration owner also reads and updates rowid ranges in
[migration-coordinator-stage-methods.js](../../../src/migration/migration-coordinator-stage-methods.js),
and committed statement results retain lastInsertRowid. A schema-wide conversion
therefore needs its own migration/result decision and is not the TX1 shortcut.
Do not promise a 50 ms bound on arbitrary synchronous SQL from a check performed
only after the statement finishes; either bound admitted work or use an actual
existing execution/interruption owner.

## Availability, seed composition and CDC

Keep L5's typed predecision conflict; do not introduce row MVCC or predicate
locking for this durability correction. W16's conflict-rate measurement needs
uncontended success and success after bounded interference ends. An
always-conflicting implementation must fail a positive witness. Repeated
requests can starve under continuous writes. Finer granularity is a measured
future performance choice, not an automatic TX2 requirement.

Accept blocking while the recovery owner or required quorum is unavailable.
Never expire a PREPARED promise into permission. Retain its discovery/reentry
obligation; prove that an eligible recovering engine returns and releases it by
the authoritative decision. A request deadline is not a finite reservation
release guarantee. Preserve the existing tracked startup recovery handoff.

For S4c, call setCDCIntegrationService on the seed SQL engine after either CDC
creation or upgrade and before migration execution or publication of the
completed composition. The engine's existing gateway resolves that service
through a closure; the normal startup handoff already uses the setter. Do not
flip autoStartDistributedTransactionRecovery as a wiring shortcut. Keep S4c's
refusal case, and prove both construction branches plus a successful persisted
two-participant migration through actual production composition. Mocked UPDATEs
and a typed refusal alone cannot prove that the chosen remedy preserves cutover.

Receipt 8 requires crash-surviving CDC obligations, not an unscoped promise of
globally exactly-once transport. Local owners are committed-entry atomic apply,
partition-cdc-generator, partition-service-cdc-stream-base and
partition-cdc-delivery, coordinated with retention/snapshot owners. At this
head CDC runs after application commit and its buffer/progress are in memory.
Specify one recoverable durable obligation with stable event identity before
calling receipt 8 green. Recovery must not rerun SQL to reconstruct notification,
read a later row version as an old event, or truncate a still-owed event. Lost
delivery acknowledgments may cause replay, handled through the existing
consumer deduplication contract. Snapshots retain the selected durable state.
The mirror replay cursor is not automatically this CDC owner. No seal
supersession is selected by this decision.

## Branches, evidence and landing

Preserve takeover/rs-raft-safety-first-20261010 and all evidence. The first TX1
witness stack starts at 0a25d29bd, after df51b799a. Build FreshMG integration
from an appropriate compatible pre-TX1 base and replay only reviewed FreshMG
changes plus their actual dependencies; inspect generated metadata separately.
Do not blindly cherry-pick mixed inventory files. Keep current TX1 work on its
own work branch. This is branch composition, not a filtered whole-corpus run or
permission to remove pre-existing regression coverage.

Revision 6 section 9.2 incorrectly proposes keeping the original P1-P3 file
permanently red in the executable corpus. At TX1 cutover, map P1/P2/P3 and both
controls to stronger live witnesses and explicitly retire the obsolete runnable
revision. Preserve original bytes in Git/evidence, first red TAP and append-only
history. Inventory all four current files: original/v2 participant, v3
participant, seam falsifiers and replay-cursor sibling. Do not skip a still-valid
unresolved red. Counts 38/12/6 are current inventories, not new seal thresholds;
keep exact selection checks and the eight behavioral receipt IDs.

Seam agreement, accepted design, source checkpoints, Quest landing and release
are distinct milestones. Query and local owners may implement in isolated
worktrees once their design delta is accepted; serialize shared owner edits.
Integrate one compatible protocol cutover candidate, not necessarily one
development commit. Before activation, prove the no-in-flight upgrade
precondition and disposition of retained legacy protocol work/log entries;
do not discard an old committed obligation or assume mixed-version safety.
The agreed AD exception remains bounded as above.

Revision 6 section 11.3's exception for receipts still red by design does not
apply to Quest landing. TX1 remains OPEN until all sealed receipts, real
three-replica witnesses and the applicable exact-candidate source/gate checks
pass. Non-main preservation remains available under the existing runbook.
Inherited failures still fail their gate. Repair or explicitly supersede them
through their existing owners; keep baselines unchanged and avoid rerunning the
whole corpus merely to rediscover the same blocking list.

The FreshMG report supports no new regression confirmed by the reported cone
classification, not an unconditional zero-regression claim. Five serial passes
establish pass-after-retry; slow-host causality is not proved by retry alone.
The seven UNCLASSIFIED historical rows remain a separate evidence set. The
published a9d45cf50 package predates the 045c9130e review/cone records; retain
those newer outputs through the existing evidence owner. Resolve historical
attribution from retained material first, measuring only a necessary missing
comparison. Final-candidate canonical/changed-discovery proof remains required.

## Immediate local instruction

1. Finish the current revision 7 without disrupting its author's work. Apply
   these decisions to its affected sections; replace stale all-unagreed status
   with this seam agreement. Do not regenerate a full design for wording nits.
2. Obtain one bounded independent review of R6's rowid/order/PRAGMA repair,
   production-shaped self-check fixture, and the decision-dependent delta.
   Reopen prior findings only when this delta changes their basis. A new blocker
   must name a reachable supported path, consequence and missing obligation;
   a real new correctness counterexample still blocks its affected claim.
3. After design acceptance, start local participant/Raft and seed/CDC work on
   the TX1 work branch under existing owners. Query implements the agreed
   coordinator/persistence/wire/recovery/retry half in its own lane. Record
   bounded source attempts and independent reviews; integrate the protocol
   together. The local owner need not await another choice among these options.
4. Independently continue FreshMG's next bounded prerequisite. Before a new
   promotion/abandonment branch is selected from LEARNER_COMMITTED, consume
   recordedLearnerFactIsValid, then retain settlement, exact permit, live owner/
   boot and CAS checks. Preserve the separate idempotent selected-branch path;
   do not apply a LEARNER_COMMITTED-only predicate unconditionally to it.
5. Keep exact unresolved receipt/gate lists and push coherent checkpoints.
   Continue CREATE, ordered successor, transfer/promotion/cleanup, then TX2,
   RS2/SN1 and physical acceptance in the existing dependency order. This record
   does not turn design review or preservation into completion of those units.

## Implementation follow-up after design acceptance

Reviewed published TX1 head `ae708f353d3f16494a8eb80c23c4e14a60cea87a` and
FreshMG head `be466cdc3d10b5f5abf2883e2990d232036434dd` against the operator's
latest report. Revision 10's bounded ACCEPT is recorded at `31a08a7ba`;
AD is committed at `f5d538139`, S4c merged at `ba5417535`, and FreshMG B1
committed at `6046cdf81`. Those approvals retain their recorded limits. The
reported admission increment 2 and CREATE B2 are not published at these heads;
this follow-up is not their verification. Continue those two active units.

### F-DET/L11: close the state-divergence dependency

**Do not accept ordinary-write nondeterminism as an exposure for a completed
TX1 claim.** Revision 10's L11 explicitly admits that it invalidates the
equal-state premise of PREPARE/COMMIT. An inherited origin explains why AD did
not repair it; it does not discharge the transaction dependency.

The query lane owns evaluating supported generated values once into the exact
logical operation carried to replicas and retained across retries. Preserve
their specified SQL semantics: replacing an arbitrary per-row random expression
with one scalar is not a valid general remedy. The local statement-admission
owner refuses unsupported stateful, replica-local or otherwise unrepresentable
raw forms before proposal. Do not introduce a replica-local semantic refusal
after a valid PREPARE/global COMMIT. No second SQL compiler, state mirror or
coordinator is authorized by this ruling.

Keep the existing FDET witness and prove the composed path: an ordinary write
cannot seed different replica rows followed by a transaction that reads or
constrains those rows and splits its participant disposition. Prospective guards
also do not repair already-divergent data. Use a demonstrably coherent initial
or restored state for the proof; retain any existing-state repair obligation.

### Execution envelope: diagnostics and the supported release boundary

Accept diagnostic handling of a classifier-list difference only insofar as
committed apply does not reclassify and execution semantics are unchanged.
**A diagnostic plus an unimplemented release obligation is not proof of
cross-build compatibility.** Do not restore the permanent apply stall to
paper over this gap.

For this implementation, prove the supported behavior on the same approved
SQLite build, compile options and apply semantics on every replica. Do not
claim an execution-changing rolling upgrade is supported until its release
owner has measured the necessary boundary or proved semantic compatibility.
The release sequence is pause admission first, drain accepted work and replay,
switch, verify the eligible replica population, then resume. For incompatible
SQLite/compile-option/apply-rule changes, the pause covers all application
mutation ingress, not only BEGIN: ordinary writes in a mixed-build window can
leave divergent rows for later transactions. Include retained logs, snapshots
and offline/rejoining replicas in the compatibility disposition. If the
existing deployment machinery cannot establish this, keep that rolling-upgrade
mode unsupported; do not build a new upgrade orchestrator inside TX1.

### Two retained obligations from AD need their existing owners

The source verification measured a host-failure UNKNOWN being re-driven under
two participant entryIds through the real engine/coordinator/CDC path on both
baseline and candidate (revision 10 section 0.0.11). Preserve AD's bounded
approval and route the repair through query, identity and CDC consumers now.
Retain typed outcome and logical identity end to end; uncertainty must not
silently become a fresh logical mutation. A discriminating witness should
exercise the full caller chain, a committed write with a lost answer and a
non-idempotent effect, then assert one effect across retry/restart. The existing
two-ID measurement alone does not prove that a duplicate data effect occurred.

Returning COMMITTED after a post-commit side-effect failure is the truthful
write answer. Logging a failed split/merge mirror enqueue does not complete
that remaining obligation. The existing mirror/replay/retention owner must
retain a replayable source and prevent cutover/source retirement from outrunning
it; recover under backpressure without re-executing the original SQL. Treat
this as a required topology-safety dependency before claiming that path, not as
a reason to reclassify an already-applied write as uncommitted. Receipt 8's CDC
obligation remains separately required under its existing owners.

### Finish admission increment 2, then exercise the participant lifecycle

Let the current independent review finish. Its committed-state precheck must
not bypass the durable store's USER_TRANSACTION_OPEN protection, commit or
rollback another session, or become a second authoritative state model. Early
observations remain hints where the authoritative committed-apply check decides.
Retire temporary staging accommodations as the accepted isolation owner lands.

The last_insert_rowid rollback discovery concerns durable results as well as
rows: SQLite [retains that connection value after rollback](https://www.sqlite.org/c3ref/last_insert_rowid.html),
and the current committed outcome owner records and replays it. Require the
intended stable result contract after both ceiling rollback and speculative
replay rollback, including subsequent UPDATE/DELETE, ignored/no-op INSERT and
successful INSERT. Do not green the witness by discarding every insert result.

After this bounded admission unit, advance the accepted ACTIVE isolation,
durable generation/reservation, replicated PREPARE, and atomic decision/apply
path toward a real three-replica transaction. The query lane should implement
the already-agreed identity, initial persistence, immutable decision, wire and
forward recovery half concurrently if it is not already active. S4c's query
half remains outstanding. Do not let local admission hardening substitute for
the missing coordinator implementation or receipt 8.

### FreshMG B2 and proof scheduling

The [published B1 design](https://github.com/psvensson/lagrange/blob/be466cdc3d10b5f5abf2883e2990d232036434dd/solve/quests/message-group-fresh-identity-membership/design-create-b1-2026-10-10.md)
deliberately stops before production learner install/open. B2 must install
validated existing-group learner state through the current snapshot/consensus
owners, never wrap the lone-founder/genesis/campaign path. Order removal and
ordinary terminal settlement against install/open after MATERIALIZED; an
earlier re-read alone cannot close that race. A positive production-composition
witness ends with the exact non-voting learner applying a subsequent committed
group entry. Preserve entity-scoped recovery, exact generation and one worker
under retry/restart. ACTIVE publication, promotion, source retirement and full
replacement keep their existing later proofs.

Keep concurrent dependency installations isolated. Use existing focused and
impact-selected proof for bounded attempts; run broad required proof at a
coherent integration boundary or when the changed owner requires it, without
weakening the landing/publisher gate. Regenerate shared metadata from the
combined source. Log-only commits do not require repeating unchanged-input
component proof; the canonical pass at `6bceca1a2` predates B1/B2 source and
cannot certify them. Attribute each red to its particular branch, selection
and measured parent; serial success alone leaves causality unresolved. There
is no branch-independent count of twelve remaining failures.
