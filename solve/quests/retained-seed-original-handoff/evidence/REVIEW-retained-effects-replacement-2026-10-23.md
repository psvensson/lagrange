---
audience: development
documentClass: evidence
---

# Independent replacement retained-effect design review

Reviewer: `subagent:/root/retained_effects_review`. Date: 2026-10-23.

Initial verdict: **REVISE**, for the three finite contract corrections below.
The proposed read-only partial observation is useful and safe as a bounded
increment when these corrections are incorporated and both startup holds stay
in place. Missing MG source-occurrence authority must remain UNAVAILABLE. This
is not rejection of the preserved native/origin foundation and not a request
to restart rs-raft or design another recovery controller.

## Reviewed inputs and execution limits

- Worktree: `/mnt/data/peter/projects/.worktrees/retained-effects-replacement-20261023`.
- Base and source HEAD: `f5fb317bebc3dc074f3d8d4102122ba4ddb94ecc`.
- Initial contract: `CONTRACT-retained-effects-replacement-2026-10-23.md`,
  SHA256 `c935bffdc2b22cae700d7b9bd05b4442b4e37a1553d487955e657bf82e40b760`.
- Approved direction: `pre-source-r1-r2-correction-2026-10-21.md:101-205` and
  `independent-r1-r2-correction-review-2026-10-21.md:98-154,216-229`.
- Local AGENTS, rules, router, authority-and-recovery and quest-subagents were
  read. The changes to rules/router/quest-subagents at current-main
  `240dfaaac22402f5ba8f80dbe5df520e8a450644` were read directly by Git diff.
  One interaction writer, bounded independent review, and evidence applicability
  remain required. Current steering does not grant missing source capabilities.
- The nine requested checklists were supplied in
  `/tmp/retained-effects-replacement-review-request.md`; their index and the
  Quest's sealed receipt/constraint set were read. This response covers every
  item, distinguishing design requirements from measured implementation proof.
- No source, tests, Quest log, seal, receipt or commit was changed by this
  reviewer. No tests, native runs or lab jobs were launched. The earlier
  14-file/221-assertion result is not evidence for new classifier bytes.

## Material findings, grouped by category

### Recovery/replay and owner interaction: F1, high

**The expected source-obligation census and applied ACK provenance must be
bidirectional.** Initial contract lines 99-104 bind each observed source event
and pending ACK, but do not explicitly require every event-producing applied
statement to have its obligation, or every delivered row to name its actual
first applied ACK. A classifier can otherwise accept an empty/short ledger or
a fabricated delivered flag after checking every row it happened to read.

The application owner records outcome, CDC and generation together
(`src/partition/partition-service-entry-apply-base.js:649-658`). The CDC owner
defines whether a statement produces an event and its exact key/index/term/
ordinal/payload (`src/partition/partition-cdc-obligation.js:123-134`). The
ledger records delivered position only on its first successful transition;
later ACK repeats leave it unchanged (`:206-224,240-278`).

Required correction: derive the finite expected event set from each distinct
permitted applied statement using the existing generator and outcome identity;
require exact correspondence both ways with owed and delivered rows. Bind each
delivered index/term to the earliest actually applied canonical ACK covering
that exact event position and digest, with the source occurrence ordered before
the ACK. Repeated ACKs do not rewrite first delivery. Missing, extra, duplicated,
wrong-position or payload-mismatched readable obligations are CONTRARY. Missing
read authority is UNAVAILABLE. The observer never clears debt.

Required proof: one real applied foundation mutation, one deduplicated replay,
one distinct repeat, owed and delivered variants; delete an expected obligation,
inject an extra one, change its payload/key/position, falsify a delivered flag
or delivered position, and repeat an actual ACK. Each mutation must engage the
named census/first-ACK assertion on the same positive fixture.

### Admission/gating and recovery/replay: F2, medium

**Lazy ledger absence is not absence of a required initialized owner table.**
Initial contract line 91 needs a precise exception for the existing CDC ledger
lifecycle. `ensureCdcObligationLedger` creates it only when an event is first
recorded (`src/partition/partition-cdc-obligation.js:146-154`;
`partition-cdc-obligation-ledger.js:35-52`). Initial outcome/participant and
application tables instead open before consensus
(`src/partition/partition-service-raft-init-base.js:384-387`).

Required correction: a missing lazy ledger is legitimate only when the complete
observed applied history has no expected emitted event; it cannot establish
zero debt after an emitting effect. Absent required outcome/origin/participant/
application schema remains UNAVAILABLE, without running initialization DDL.
Explicitly distinguish legitimately absent original rows from unreadable rows.

Required proof: complete pre-origin/ENABLE-only history with no lazy ledger;
the same history after a real emitting foundation application with its ledger
removed; and separately a missing required owner table. Retain the distinct
typed answers, and compare database bytes and frontiers before/after inspection.

### Recovery/replay and concurrency: F3, medium

**Pending SQL followed by pending ACK may legitimately precede the local ledger
row.** Initial contract lines 103-104 must not read "known obligations" as
"already materialized in this member's application tables". A follower can
retain the source command and its later ACK while both are committed-pending;
the leader applied and delivered the earlier command before the follower caught
up. The ledger is written only during source application and read during ACK
application (`partition-cdc-obligation.js:123-151,206-224`). Approved R2
explicitly permits committed-pending source work instead of commit==applied.

Required correction: classify pending ACK dependencies by retained native order
and exact identity, without executing SQL or inventing a ledger row. If this
increment cannot establish the dependency from available authoritative input,
return UNAVAILABLE and retain both commands. Missing not-yet-applied obligation
alone is not CONTRARY. An actually unknown/wrong-key/wrong-position/forward
reference remains CONTRARY when complete evidence establishes that contradiction.
Full classification must eventually handle legitimate pending dependencies;
temporary UNAVAILABLE does not fulfill that full positive extent.

Required proof: real retained pending SQL then pending ACK and no local source
row; unchanged pending bytes, ledger and applied frontier after observation;
normal application later creates the obligation then applies its ACK in order.
Use actual native retention/application holds, not a hand-populated cache.

## Exact remaining producer/recipient identity correction

This is a named follow-on gate, not permission to make the observer a delivery
owner and not a fourth blocker to the partial observer.

1. The source ledger already owns eventKey, entryId, source index/term/ordinal,
   payload and first acknowledgment. `eventOf` supplies eventKey/entryId/
   sourceLogIndex/sourceOrdinal (`partition-cdc-obligation-delivery.js:170-180`).
   `cdc-event-envelope.js:4-35` already owns metadata copying; use that boundary.
   `cdc-event-buffer.js:38-46,62-65` already binds durable identity to
   sourcePartition/eventKey and forbids content coalescing for durable events.
2. MG normalization currently filters malformed members, invents timestamps and
   drops source metadata (`message-group-service-cdc-propagation-runtime-methods.js:251-274`).
   Its single-event Raft command drops it again
   (`message-group-service-cdc-replication-runtime-methods.js:220-234`). Committed
   single/batch apply also projects fields and can invent a timestamp
   (`message-group-service-raft-timing.js:53-79`). Source-origin identity must
   survive each real producer/relay/normalization/command/apply boundary through
   the existing envelope owner. Strict retained inspection must reject malformed
   batches, not reuse filtering normalization.
3. Retaining fields alone does not establish recipient commitment.
   `cdc-delivery-outcome.js:20-61,89-118` already owns the content binding and
   committed receipt, including recipient group/index/term and the transport
   noHandler distinction. Yet `partition-cdc-delivery.js:452-461` accepts a
   subscriber's undefined or ordinary successful answer, and
   `partition-cdc-obligation-delivery.js:457-475` acknowledges unless the answer
   was explicitly provisional. The existing outcome must be wired from actual
   recipient committed application back through the caller and source delivery
   ACK eligibility. Transport receipt, local cache application, operationLedger
   projection or absence of an error cannot substitute for that outcome.
4. Cross-member classification then matches the retained recipient occurrence
   against the exact source native entry/outcome/obligation and complete original
   declaration. `cdc-source-scope-evidence.js:22-58` binds logical partition/
   table/version/range; it does not itself prove the allocation, measured build,
   physical incarnation or recipient runtime. Those remain the original
   preparation/native owners' facts. Do not mint a second identity schema or
   infer incarnation from matching row content. Repeated legitimate delivery
   occurrences can exist; each must bind the same source occurrence, and no
   content match discharges source debt. An absent original identity cannot be
   backfilled into old retained bytes.
5. Cross-owner proof must include single and batch paths, lost answers, duplicate
   delivery, changed payload at the same source key, two different source keys
   with identical content, source/recipient restart, stale source scope/member,
   wrong recipient group, ACK with noHandler, and recipient application still
   pending. UNKNOWN/provisional outcomes preserve source debt and use existing
   backpressure/retry ownership. Native indexes that cannot be represented by an
   existing Number-valued wire contract must be rejected or held exactly; never
   rounded into a matching receipt. This increment does not silently change
   that wire contract to strings.

## Category-complete checklist dispositions

All references below are current-source/design inspections, not new test results.
"Required" means an implementation/proof obligation, not a pass claim.

### Admission/gating (seven items)

1. Same-state precheck/enforcement: the preparation owner already re-reads at the
   final native cut (`raft-rs-original-allocation-preparation.js:395-412`). Keep
   the new observation a value, not HISTORY_ACCEPTED authority; any later consumer
   must re-enter this owner and compare exact current facts.
2. Transient/terminal: ACCEPTED/CONTRARY/UNAVAILABLE are observations under contract
   lines 24-29,114-116, not new public errors. Both existing startup refusals stay
   at `seed-original-allocation-startup.js:49-54,94-99`. Do not add fail-fast
   recovery policy or claim temporary missing metadata is a terminal contradiction.
3. Budget: no waits added (contract 114-116); existing issued 30000ms release
   deadline remains the Quest constraint. This review proves no latency margin.
4. Reason shape: the new typed result must be consistent, immutable and preserve
   actual member/reason fields (contract 24-29,130-136). Source consumer tests must
   test exact shape; no String(object) matching or alternate boolean authority.
5. Hold release: this increment intentionally leaves startup blocked. Reassessment
   reads owners anew; MG metadata loss is not cured by time or cache convergence.
   The follow-on above names the owner correction required to resolve it. Actual
   startup continuation/latency remains unproved, not silently abandoned.
6. Freshness: a synchronous application/native snapshot is required; existing
   origin observation uses a read transaction (`partition-participant-transaction-store.js:185-199`).
   No cached assessment may outlive reinspection at the final construction cut.
7. Message honesty: return the examined member/frontiers and exact blocking event,
   outcome or table. The contract requires these identities; proof must make a
   different input/member fail to exclude misleading admitted-member diagnostics.

### Recovery/replay (five items)

1. No stale clobber: contract 118-126 introduces no recovered registry or setter.
   Required byte/row/frontier equality tests must cover every exit, including
   errors, not only ACCEPTED. No open hook, DDL or repair callback is allowed.
2. Restart/live discriminator: preparation's COLD_RECOVERY mode and exact opening
   identity remain at `raft-rs-original-allocation-preparation.js:375-391`;
   the observer itself never installs live state. Existing startup hold remains.
3. Lost enlistment: participant census must be empty in this bounded original
   extent (contract 96-98); PREPARED and every terminal participant row are
   contrary, not only current reservations (`partition-participant-transaction-store.js:51-58,258-289`).
4. Replay: existing statement entry key and first outcome remain authoritative
   (`partition-service-cdc-stream-base.js:419-436`;
   `partition-service-entry-apply-base.js:622-658`). No new in-memory dedup state.
   Origin resets generation at its first application, repeats do not
   (`partition-participant-transaction-apply.js:551-579`). Required actual replay,
   origin-before/after-statement and duplicate-key controls remain unmeasured.
5. Absence: F1-F3 distinguish missing expected debt, legitimate pre-application
   absence and unreadable authority. No missing row is completion evidence.

### Owner interaction (ten items)

1. Single question owner: the classifier answers only bounded retained-effect
   correspondence; original preparation alone grants opening under complete
   declaration/native checks (contract 24-29; preparation :149-169,395-412).
2. Typed boundary: native, participant, SQL producer, outcome, ledger and MG
   owners supply observations/canonical production; classifier composes them.
   F1 requires no copied CDC generator/dedup rule, and F3 no local replay engine.
3. Paired invariant: required same-fixture canonical pending replay versus
   nonoriginal/contradictory refusal (contract 140-150; R2 correction 201-206).
   Refusing all pending work is not a valid green result. No new measured witness.
4. Stale then fresh: change a missing observation to complete exact evidence and
   re-enter the observer; an old UNAVAILABLE must not persist. Snapshot freshness
   is mandated at preparation :401-412. Missing metadata in immutable old bytes
   cannot itself be healed by presenting a newer cache.
5. Pressure: read-only finite retained scan, no retry/force flag (contract 114-126).
   Repeated observer calls must not schedule CDC work. Existing delivery retry
   owner remains `partition-cdc-obligation-delivery.js:429-451,590-613`.
6. Wake/release: no observer-owned queue or retry introduced. The explicit MG
   follow-on and eventual original startup owner must supply reachable
   continuation; unchanged CLASSIFICATION/CONTINUATION holds are honest partial
   state, not a liveness completion claim.
7. Projection authority: bootstrap hydration (`seed-registration-phase.js:375-393`),
   MG operationLedger (`message-group-service-cdc-replication-runtime-methods.js:239-241`)
   and MG applied cache (`message-group-service-raft-timing.js:35-47`) cannot
   certify source identity, delivery, publication rights or obligation discharge.
8. Treatment fidelity: contract 144-150 requires engaged targeted semantic
   negatives. Preserve exact source fingerprints and assertion output; a missing
   method/setup failure is not a red-on-revert kill. Unmeasured in this review.
9. No escape hatch: observed source paths contain ordinary normalization and
   Number-valued readers that are unsuitable for strict retained observation
   (`partition-committed-statement-outcome.js:109-126`;
   `partition-cdc-obligation-ledger.js:74-82,123-145`). Add exact read-only owner
   APIs and do not quietly reuse those conversions or execute SQL to classify it.
10. Registry alignment: current pairs `original-preparation-native-history` and
    `participant-origin-native-history` end at native/origin observation
    (`test/shards/impact-contracts.json:2650-2701`). New producer/classifier/
    outcome/CDC/MG interaction endpoints and primary witness tests must be in
    the same Quest's registry before source acceptance; current pairs alone do
    not cover the added semantics.

### Harness fidelity (six items)

1. Right red reason: F1-F3 list exact semantic assertions; both positive and
   mutation must reach them. The old preserved witness cannot measure new bytes.
2. Stub honesty: use actual SQLite/native/apply owners, not a fake SQL result or
   normalizing MG stub (contract 140-150). Strict malformed-batch controls must
   demonstrate that no bad event was filtered out before the assertion.
3. Time fidelity: no new timeout in observer. Existing native fixture uses
   30000ms test/10000ms formation and explicit heartbeat/election bounds
   (`test/partition/participant-origin-retained-history.integration.test.js:33-36`).
   Reuse applicable budgets; do not treat those as public startup proof.
4. Fields: construct canonical foundation rows and actual commands via the
   producer; bind declaration time/node/schema, source stamp/proposer/key and
   native index/term. Contract 77-98 requires negative identity perturbations.
5. Non-vacuity: assert at least one actual emitting statement, owed row, delivered
   row/ACK, pending legitimate entry and malformed/contrary event as appropriate.
   The existing native fixture asserts pending count and frontier inequality
   (`participant-origin-retained-history.integration.test.js:93-107`).
6. Live binding: locked lab exact-candidate native replay and the existing
   regression cone remain required (contract 148-150). The full actual cold
   public startup and eight receipts remain unproved; no local DT substitution.

### Transport/delivery (five items)

1. ACK is not processed: the observer issues no transport ACK. MG source identity
   remains unavailable; the next identity correction must consume
   `cdc-delivery-outcome.js:109-118`, not acknowledged alone. Current plain
   subscriber success is insufficient proof of recipient commitment.
2. Late answers: observer has no waiter or cancellation. Source debt and pending
   ACK rows are retained through unknown results (contract 99-113). Future
   recipient-commit wiring needs the lost-answer controls above.
3. Response classification: no new transport response is introduced. Do not
   reinterpret observer ACCEPTED as a cdcCommitted outcome; that shape already
   belongs to `cdc-delivery-outcome.js:55-61,89-96`.
4. Bounded undeliverable: no network await in observer; existing delivery owner
   handles retries. Missing MG authority returns UNAVAILABLE immediately and
   cannot hang awaiting future delivery or silently start a driver.
5. Stub fidelity: no transport stub is needed for pure observation; the later
   delivery seam proof must use the message-router contract, including noHandler,
   rather than a callback that always returns success.

### Concurrency/serialization (five items)

1. Synchronous gate: no create/dispatch mutation is added. Original preparation
   retains synchronous currentness/reentrancy checks (:355-372) and one snapshot
   governs native/application facts. Observation cannot replace an effect gate.
2. TOCTOU: no await inside a snapshot, and no cross-database atomicity claim
   (contract 118-126). Native construction revalidates; schema/row/outcome/ledger
   reads must be inside that same member transaction, not separate snapshots.
3. Single winner: no claim CAS is added or consumed by the observer. Original
   R1 claim/ACTIVE/TRANSFERRED implementation remains separate and unproved.
4. Timer reentrancy: no timer is added (contract 114-116). Returning an observation
   must neither invoke subscribers nor queue a native application effect.
5. Lock scope: existing exact directory/member custody remains the preparation
   owner (:355-360); no new lock or logical-name lookup is justified. Final
   construction must inspect the exact physical member, not its successor.

### Formation circularity (five items)

1. Self-dependencies: only readonly native/application SQLite owner reads are
   needed; no live TABLES cache, service registry, leader route or new DDL
   (contract 31-68,118-126). Missing schema is typed UNAVAILABLE, not repaired.
2. Re-drive starvation: observer does not rely on CDC/cache to find retained
   commands. Startup continuation remains held explicitly; a cache wake cannot
   repair immutable metadata loss or grant native opening.
3. Formation clients: `seed-original-allocation-startup.js:49-54,94-99` preserves
   both holds; no client ingress or internal write route is opened by this unit.
4. Window arithmetic: bounded scan is proposed, not a measured performance
   guarantee. Existing public 30000ms deadline is unchanged; complete-cohort scan
   and later composed startup margin still need lab measurement.
5. No bypass: existing SQL/application/ledger owners remain the only writers.
   Exact statement comparison is permissible; executing retained SQL against a
   copied DB to invent permission or using a cache to replace an unavailable
   source owner is excluded by contract 87-92,118-136.

### Retry/re-drive (seven items)

1. Retry-must-fire: no retry registration is added; the observer never suppresses
   the existing CDC owner (`partition-cdc-obligation-delivery.js:429-451`).
2. Frozen bound: observation is a finite native snapshot; no unreadable-row loop
   exists. UNAVAILABLE is explicit (contract 114-116).
3. Loud stops: every observation returns a named result and examined identity;
   startup keeps typed refusals. Implementation proof must cover catch/early
   return paths, including missing tables and malformed native history.
4. Mutual suppression: no two new retry owners are introduced. The deliberate
   partial hold is not claimed as resumed recovery. Existing work/debt stays
   with source CDC/native and the named later startup owner.
5. Storm ceiling: zero scheduled retries or delivery attempts per observation;
   each caller does one finite retained read. Whole-cohort scheduling/performance
   remains outside this partial increment's proof.
6. Duplicate safety: repeated inspection is read-only; repeated application uses
   first durable statement outcome and first ACK provenance, as F1 requires.
7. Reset semantics: inspection never resets counters, delivered flags, origin or
   generation. Transport ACK cannot reset retained debt; future wiring must
   enforce committed acceptance at the existing source delivery owner.

### Sweep/timer (five items)

1. Clock injection: no sweep or timer is introduced; foundation constructors
   consume explicit declaration.declaredAt (contract 40-44), never a fresh clock.
2. Role/authority: no rollback, proposal or role-gated mutation is added. Read-only
   observations have identical meaning for leader/follower; pending phases are
   exact native facts, not permission inferred from current role.
3. Crash equivalence: no JS dedup or repaired state is created. Actual replay
   remains the application transaction owner's work; F1 preserves its durable
   outcomes/CDC obligations and first-origin generation behavior.
4. Detection windows: no timeout detector is added or changed. Original public
   and native-test budgets stay literal; no elapsed-time inference classifies
   pending native work as contradictory or completed.
5. Sweep starvation: no sweep introduced; all observation paths use retained
   physical storage without live readiness (contract 31-39,118-126).

## Required disposition and remaining gates

Append F1-F3 to the contract, then bind a bounded approval to those exact bytes.
No broader redesign or repeated search for the missing draft is necessary.
Implementation acceptance still requires independent source review, the matched
semantic tests, actual native replay, exact read-only observations, unchanged
startup holds and current registry/static/locked-lab evidence.

Full classification additionally requires exact MG source-occurrence and
recipient-commit correspondence, legitimate pending dependency treatment,
configuration/checkpoint interpretation where applicable, complete-cohort
aggregation and final native-cut revalidation. Protected activation, R1 durable
handoff/uncertainty/shutdown custody, R2 callback/sink fencing, the composed two-
start public witness, all eight receipts, full rs-raft integration/certification
and publication remain separate unsatisfied gates. This review grants none.

## Bounded correction review and superseding design verdict

Reviewed the appended contract correction at lines 169-204. Its complete SHA256
is `a5bd7534797a56f5bcbacdff2db55e25f766e6576ff8ef398ba7d6954dee037c`.
Source HEAD remains `f5fb317bebc3dc074f3d8d4102122ba4ddb94ecc`; the status check
showed only the author-owned Quest log and these two new evidence documents.

Verdict: **APPROVE this corrected bounded design for implementation.** This
supersedes only the three initial design findings in this record, not its
evidence/proof limitations or the approved R1/R2/sealed acceptance.

- F1 is resolved by lines 173-181: exact expected/observed obligation census,
  no debt for deduplicated retries, and first applied ACK provenance. Wrong or
  missing readable debt remains contrary and the observer never discharges it.
- F2 is resolved by lines 183-187: lazy ledger absence before any emitting
  application is distinct from required-schema unavailability and erased debt.
- F3 is resolved by lines 189-196: pending source then pending ACK stays an
  explicit unavailable dependency with both commands preserved; absence alone
  is not contrary, but wrong or impossible native correspondence remains so.
- Lines 198-204 preserve the existing envelope/outcome owners for the later MG
  identity and recipient-commit interaction. They do not authorize that larger
  production correction within this observation increment.

All required implementation/native/negative/registry/lab evidence above remains
unmeasured. In particular, ACCEPTED must remain an observation and both startup
holds must remain. No source checkpoint, Quest receipt, startup continuation,
protected activation, durable transfer, serving, merge or publication is approved
by this design verdict. Review future implementation against these exact
contract bytes and retain the category-complete source review boundary.

## Focused implementation questions before frozen source review

Reviewer remained independent while the root authored production and a separate
worker authored tests. This follow-up inspects two explicitly raised seams;
it is not frozen-source approval or a substitute for the category-complete
implementation review. No tests or lab jobs were run by this reviewer.

**MG origin HLC versus envelope HLC.** Exact original row content with a valid
`data.updated_at_hlc` and a different valid envelope timestamp must remain
UNAVAILABLE while source-occurrence correspondence is missing. The source CDC
generator deliberately preserves the origin timestamp in row data because
delivery can remint the envelope timestamp
(`src/partition/partition-cdc-generator.js:239-258` in the implementation tree).
MG normalization uses its clock when the transported timestamp was omitted
(`src/message-group/message-group-service-cdc-propagation-runtime-methods.js:251-274`).
The in-progress equality check in `seed-retained-foundation.js:58-61` would
incorrectly classify that existing behavior as contradictory. Validate each
stamp's owned canonical form independently, retain both unchanged, and do not
infer delivery from their equality either. Invalid stamps or genuinely foreign/
changed row content still refuse. Required discriminators: exact row with equal
valid stamps and with unequal valid stamps both remain UNAVAILABLE; malformed
stamps and altered original row identity remain contrary.

**Empty tables do not prove required schema.** The in-progress
`src/bootstrap/system-table-schema-sql.js:5-6` only reads rows. An empty required
table with an extra column, wrong declared type or changed primary key can
therefore evade row-content comparison. Observe the owner-defined schema in the
same read snapshot, even when row count is zero. Missing required table/columns
or unreadable schema is UNAVAILABLE; readable extra/wrong-type/changed-PK or
otherwise incompatible owner-defined shape is CONTRARY. Compare against the
existing canonical opening/schema contract, including migration-produced shape
and owned constraints/indexes where applicable; do not create a throwaway SQL
replay engine or interpret raw schema text as authority. Existing opening creates
and migrates the application table before native entry
(`partition-service-raft-init-base.js:384-387`;
`partition-service-table-bootstrap.js:148-186`).

For SQL_TRANSACTIONS, consume `readTransactionSchemaEnforcement` in that same
snapshot (`src/query/distributed/distributed-transaction-schema-enforcement.js:57-76`).
The first applied generation origin installs the exact enforcement before
recording origin (`partition-participant-transaction-apply.js:551-572`). Thus:

- No applied origin: REQUIRED can be legitimate before first ENABLE applies;
  its missing not-yet-installed trigger is not itself a contradiction.
- Applied origin: require ENFORCED. A readable complete table with REQUIRED
  because its installed trigger disappeared is contradictory current effects;
  INCOMPATIBLE is contrary. Unavailable schema/read authority stays UNAVAILABLE.
- Do not call the install/migration function from the observer. A normal later
  origin replay can repair enforcement under its existing application owner;
  that possibility does not make the inspector a repair or opening authority.

Required proof includes empty malformed/missing schemas, valid pre-origin
REQUIRED, real applied-origin ENFORCED, missing/modified enforcement trigger and
byte equality across every inspection. These clarify the approved exact-schema,
canonical-origin and content-only-MG requirements; they do not widen the unit to
MG delivery implementation or grant source approval.

### Physical schema production is not retained native-command production

The separate test author found that canonical CREATE TABLE text is not admitted
by the real committed QUERY path. Follow-up source census also finds no
original-startup native producer for canonical index DDL: the only production
call of `generateCreateIndexSQL` is
`src/partition/partition-service-table-bootstrap.js:181-186`, which executes
each index directly with `service.db.exec`. General index QUERY admission
(`partition-statement-admission.js:174-229`) permits later ordinary work; it is
not evidence that the original startup produced such a command. That owner also
distinguishes declared physical indexes from ordinary removable query indexes
at lines 203-217.

Remove both table and index DDL from the bounded original retained-command
eligibility. Under the inspected current-build original producer census, such
retained SQL is nonoriginal work and therefore CONTRARY. A future schema command
whose producer is unproved must stay explicitly UNAVAILABLE, never become
accepted just because the generic query path can execute it. Do not broaden
statement admission or build a native positive fixture for an operation the
original startup does not produce. Physical schema inspection remains required.
The author will append this producer correction to the design; this record
preserves the initially reviewed eligibility rather than silently rewriting it.

An adjacent existing owner discrepancy affects fixture fidelity:
`generateCreateTableSQL` honors `column.unique` and table-level `schema.primaryKey`
(`system-table-schema-sql.js:23-37` at this inspection), while the actual physical
creator's inline CREATE at `partition-service-table-bootstrap.js:152-170` only
handles column-level primaryKey, notNull and default. Current schemas use both
omitted features. A fixture created solely with the former therefore cannot
prove the latter's schema shape. Observe the actual physical schema owner's
contract, require an actual PartitionService-built positive, and route any
broader constraint repair separately; do not silently change physical DDL in
this read-only observation increment. No runtime measurement or source approval
is asserted here.

## Frozen source review, 2026-10-23

Verdict: **REVISE** before an independently approved source checkpoint. There
are three finite repair groups below. This is source/fixture review, not a
runtime test result or a request to discard the WIP. The read-only architecture,
retained startup exclusion, actual application replay and deferred MG interaction
remain the right bounded increment.

Inputs:

- Source base HEAD `f5fb317bebc3dc074f3d8d4102122ba4ddb94ecc`.
- Thirty-file source/test/metadata manifest
  `/tmp/retained-effects-source-review-manifest.json`, SHA256
  `6aebecd19d087dbe3047eb7f83447171ab5a75dbe18068899ac85fcabacac5c9`.
  All 30 files were independently hashed at entry and after source inspection;
  both checks reported zero mismatches. Existing-file diffs and every new
  source/test file were read; generated metadata changes were inspected.
- Complete amended contract SHA256
  `4556a1a610d52f32765c6a3972dd4df2213724335ae73b7c1782bab31baf71c6`.
  Its appended producer/schema/HLC correction is consistent with the focused
  design dispositions above; the original approval's exclusions remain.
- Root is the sole production writer; the separate test worker authored the
  three new fixture/test files. This reviewer has authored neither production
  nor tests, launched no tests/lab jobs, and changed only this review evidence.
  Reported focused lint/import/syntax checks are not independently re-run here.
  All runtime, locked-lab and exact-candidate acceptance gates are unexecuted.

### S1: required internal owner schema and raw types can evade the census

Severity: high. Categories: recovery/replay, owner interaction, admission/gating,
harness fidelity. Failed contract: required schema cannot be inferred from an
empty result, and missing required schema is UNAVAILABLE while readable
contradictory state is CONTRARY (contract 35-39,53-59,87-104,183-187,217-229).

The new physical application-table reader checks its schema, but the other
required application owners do not. The outcome census performs SELECT * then
maps existing rows (`partition-committed-statement-outcome.js:87-99`); the CDC
census does the same after table existence (`partition-cdc-obligation-ledger.js:55-67`);
the participant census selects only three columns
(`partition-participant-transaction-store.js:209-213`). No internal schema
observation precedes `seed-retained-partition-effects.js:178-187`.

Concrete unchecked cases, identifiable directly from these queries:

- An empty `_partition_statement_outcomes` retaining only `entry_key` and
  `log_index` satisfies its SELECT/ORDER BY and yields no rows. Missing outcome,
  term, changes, result and failure columns never get accessed, so an otherwise
  valid ENABLE-only member can be ACCEPTED. The next real SQL apply needs those
  columns and cannot use that empty table as proof of a complete owner.
- An existing empty `_cdc_obligations` with only `log_index` and `ordinal`
  likewise returns `{exists:true, rows:[]}` and is accepted before emitting
  application. Its lazy existence is not proof that the existing table has the
  ledger's complete shape or constraints. CREATE TABLE IF NOT EXISTS later does
  not repair an incompatible existing table.
- An empty participant table with only transaction_id/participant_id/state
  passes the census despite missing the owner's transaction fields. Added
  internal-table triggers or altered generation-table constraints are not
  observed either. The application-table trigger check cannot cover those
  tables' effect surfaces.

The exact readers also call String on raw positions/results/flags without
checking their SQLite storage type. A BLOB containing ASCII `2` in an INTEGER
position can become the accepted string `2`, rather than a typed invalid
observation. safeIntegers prevents legitimate INTEGER rounding; it does not
validate BLOB/TEXT/REAL values stored in a permissive SQLite column. Contrast
the native/origin owners' explicit raw-row validation.

Required correction: each existing internal store must expose and consume its
own read-only required-schema/constraint and raw-row validation in this same
snapshot. Do not copy those schemas into the bootstrap classifier. Preserve the
existing lazy-ledger exception when no table exists and no event is owed, but
do not interpret an incomplete existing ledger as that exception. Missing
required columns/indexes remain unavailable; incompatible readable shapes,
unowned triggers or invalid typed values remain contrary. Validate exact integer
fields before converting legitimate integers to decimal strings.

Required tests: the three empty partial-owner tables above; altered internal
trigger/constraint; malformed raw position/result/delivery types; exact large
INTEGER positions without rounding; real valid owner tables and lazy absence.
For each, assert unchanged bytes/frontiers and the named result. Existing
missing-whole-table tests (`seed-retained-effects.test.js:554-587`) and
application-table mutations (:417-439) do not exercise these cases.

### S2: startup no longer preserves its declared classification hold on all paths

Severity: medium. Categories: admission/gating, recovery/replay, harness fidelity,
owner interaction. Failed contract: both current startup/continuation holds
remain unchanged for this observation-only increment (contract 18-22).

`seed-original-allocation-startup.js:49-54` now calls observeRetainedEffects
before constructing CLASSIFICATION_UNAVAILABLE. The observer calls
inspectColdMember (`raft-rs-original-allocation-preparation.js:294-312`), which
throws HISTORY for a declared member still NEVER_OPENED (:95-101). Therefore
the existing actual BootstrapService prepare-only restart witness
(`test/bootstrap/seed-original-attempt-lifetime.test.js:385-400`) no longer
reaches its asserted CLASSIFICATION_UNAVAILABLE. Its prior attempt only calls
prepareOriginalSeedAttempt and shutdown, so it has a complete declaration but
does not establish native history. This is a source-established changed result,
not a claimed executed test failure.

The same new consumer path has no test naming observeRetainedEffects or
foundationTimestamp. New tests call the exported low-level classifier directly;
the RF1 fixture explicitly bypasses complete original cohort preparation. That
is honest component proof but does not prove the changed actual consumer.

Required correction: keep startup's promised outward classification hold while
retaining the more precise failed inspection as structured evidence/cause, or
explicitly resolve this owner-contract change before claiming it unchanged.
Do not swallow cleanup failures or lose the primary-plus-cleanup aggregate when
wrapping a diagnostic refusal. Add focused preparation/startup tests covering
the no-native/partial history case, an intact complete observation, contrary and
unavailable member observations, and failed exact read-handle close. Assert no
openingMode/opening grant, no native entry, preserved rows and retained failed
custody. Re-run the existing lifetime cone on the exact repaired candidate.

### S3: accepted source metadata is broader than the actual original producers

Severity: medium. Categories: owner interaction, recovery/replay, harness fidelity.
Failed contract: canonical command/payload identity must be producible by the
original owner, not merely syntactically well formed (contract 77-81,99-104,130-136).
There are two manifestations of this same producer-fidelity gap.

**Timestamp producer identity.** `isRetainedOriginalStamp`
(`seed-retained-foundation.js:45-55`) permits any nonempty HLC nodeId, independent
of proposedBy. Actual PartitionService constructs HLCClockService with its
replicaId (`partition-service-core-base.js:171-173`); its write producer stamps
that clock and its same replicaId (`partition-service-write-metrics-base.js:416-424`).
ENABLE uses that same service clock/replica
(`partition-participant-transaction-request.js:185-187`), as does the CDC ACK
producer (`partition-cdc-obligation-delivery.js:185-190`). HLCClockService.now
retains its own nodeId (`hlc-clock-service.js:63-82`), including after witnessing
another clock. A canonical-looking timestamp naming an unrelated replica is
therefore not exact original producer output, even when proposedBy names a
declared founder.

The new direct fixture currently builds HLCs with NODE_ID, not member.replicaId
(`seed-retained-effects-fixture.js:49-51`). This models the same permissiveness
and cannot detect it. The real RF1 fixture uses the actual producer and remains
the useful positive. Bind native source stamp identity to the existing
producer's replica identity, while preserving legitimate forwarding of the
already stamped command. Do not require physical clock equality to proposedAt
or declaredAt. Add a valid-but-foreign HLC identity negative and make the direct
fixture faithfully stamp its actual producer. MG envelope/origin HLC inequality
remains the separate explicitly unavailable legacy case, not a reason to relax
native source-command identity.

**Invented optional source scope.** `obligationMatches`
(`seed-retained-partition-effects.js:148-170`) creates an expected original scope
only if the observed event happens to carry sourceScope. Source census finds
no current production assignment to service.cdcSourceScopeEvidence; the existing
`eventCdcSourceScope` reads that property and returns null when absent
(`src/cdc/cdc-source-scope-evidence.js:69-72`). Original bootstrap does not
install it. The classifier is the only current caller constructing that
bootstrap-genesis scope outside its validator. Consequently adding a
structurally valid scope to an otherwise canonical stored event currently
passes, despite no proven original producer of that payload.

Remove eligibility derived from the candidate event's optional field. Under
this actual original composition, unproduced extra scope must not be ACCEPTED.
If future composition supplies such source scope, review that owned input and
bind it independently instead of reconstructing it from presence in the
observation. This is not permission to add source-scope production in this
increment. Add an injected-valid-scope discriminator while preserving the real
scope-absent event positive. Keep the broader MG source-occurrence/recipient-
commit correction explicitly deferred.

### Other observations and exact limits

No other material source defect was identified within the inspected frozen
surface. The following parts are supported by source inspection, with runtime
proof still pending:

- The new cohort method never assigns #declaration, #openingMode or
  #inspectApplicationHistory and never calls openingFor. Its currentness checks
  bracket each observation; before/after native reads detect native change;
  exact readonly handles use the existing custody owner and #fail/#finishRead
  cleanup. It does consume the preparation instance's one #begin, which is
  consistent with this one-shot startup observation followed by a hold.
- Registration row extraction preserves original fields/order. The real
  delegate calls preparation.foundationTimestamp; invalid/missing declaration
  throws. Only absent optional test/ordinary delegates use the existing hosted
  clock. Tests at :528-552 distinguish that fallback, but do not yet exercise
  the new preparation method itself.
- The physical creator now derives exactly its former CREATE statement and
  adds IF NOT EXISTS only at execution. Its existing migration/index calls are
  unchanged. The observer compares the creator's stored SQL, known indexes and
  trigger policy; SQL_TRANSACTIONS additionally requires the exact existing
  enforcement and correct trigger count (:198-209). No DDL is executed by the
  observer and no native schema-command eligibility remains.
- First statement outcomes, generation reset at first origin, duplicate entry
  identity, exact expected rows, bidirectional CDC census, first applied ACK and
  pending source-before-ACK dependencies are explicitly composed at
  `seed-retained-partition-effects.js:85-175,211-236`. This is a static reduction
  of canonical effects, not a new SQL executor. S1/S3 still limit the validity
  of those observations' inputs.
- Single/batch MG observation rejects malformed members without normalization,
  preserves both valid stamps and never upgrades content matches to source
  delivery. Ordinary type admission is unchanged. Real MG replay and recipient
  commitment are not supplied by these new tests.
- The amended impact contract and coupled pair name the actual new
  producer/application interaction and both new test entrypoints. Generated
  primary/resource/subsystem censuses add those two tests (2442 total). The
  fixture file is not a third test entrypoint. Metadata validation still has to
  run on the final candidate.

## Source-round category-complete checklist

This section updates every original checklist item against the frozen source.
Statements about tests identify written assertions only; none is a green claim.

### Admission/gating

1. Same-state enforcement: cohort currentness/native before-after checks exist
   at preparation :298-308; no opening is enabled. Internal owner completeness
   is not proven until S1 is fixed. Later opening still needs final-cut checks.
2. Transient/terminal: observer states are explicit; startup's precise outer
   reason changes on inspection exceptions (S2). MG_SOURCE/PENDING_SOURCE stay
   unavailable, not terminal classifications or new retries.
3. Budget: no new timer/wait in source. Existing public 30000ms budget unchanged;
   no complete-cohort scan latency or public-window margin has been measured.
4. Reason shape: pure observation returns frozen state/reason/identity and startup
   attaches observations as detail. S2 requires correct exception/cause handling;
   catch paths retain unavailable instead of success.
5. Hold release: startup and continuation never open. This partial has no release
   event; full original composition/MG producer correction remains its named
   next work, not a claimed permanent recovery solution.
6. Freshness: db.transaction wraps native/application reads at effects :68-69;
   no memoized verdict. Preparation compares current native records, not caches.
7. Message identity: results include exact supplied group/replica; preparation
   independently validates external declaration expectations and physical
   member before the lower-level observer. On read exceptions, only identity,
   typed reason and cause are returned; no stronger full-observation claim is
   made for that unavailable result.

### Recovery/replay

1. No clobber: new read paths contain no mutation/DDL/registry writes; byte
   equality is asserted by both fixture and native tests. Internal malformed
   owner shape remains the S1 acceptance defect.
2. Restart/live: observation sets no openingMode; actual startup holds. The RF1
   test explicitly uses ordinary durableRecordBootstrap outside the original
   opening protocol, and cannot prove complete original cold admission.
3. Enlistment: any participant census row, including terminal rows, refuses
   (:211; unit test :245-250). Missing required fields/schema need S1.
4. Idempotence: the shared committedStatementEntryKey extraction preserves old
   behavior. Actual owner apply retains first outcome/CDC; unit tests :104-139
   and native :207-215 cover repeats without a new in-memory dedup cache.
5. Absence: lazy ledger versus emitted missing debt is distinguished; pending
   source ACK absence is unavailable. Empty incomplete existing owners remain
   the specifically identified S1 exception, not accepted absence proof.

### Owner interaction

1. Semantic owner: observer only answers correspondence; preparation alone owns
   original opening. No cache/diagnostic/store grants opening from ACCEPTED.
2. Typed boundaries: native/participant/outcome/CDC/schema owners supply facts.
   Exact required internal schemas and producer stamp/scope inputs need S1/S3;
   no second ledger or replay algorithm was introduced.
3. Paired invariant: unit tests pair canonical pending work and semantic negatives;
   real RF1 tests hold and replay each foundation table. These are unexecuted
   and not complete original cohort evidence. S2 exposes the actual consumer gap.
4. Stale then fresh: reads are repeated rather than cached. Existing tests check
   unchanged rereads and pending-to-applied reinspection; add missing-authority-
   restored and repaired-consumer controls when addressing S1/S2.
5. Pressure: observer schedules no retries or CDC work. Shared producer extractions
   leave the existing upsert coalescing and delivery backoff paths untouched.
6. Wake/release: no new wake owner. Native test uses actual ordinary replay and
   CDC subscription/campaign; public original hold is intentionally unresolved.
7. Projection: native test's cache subscriber returns actual provisional shape
   and asserts source debt stays owed (:181-206). Cache is observed, never used
   to judge classification or source completion.
8. Treatment fidelity: test mutations touch real database/command fields after
   an accepted positive where appropriate. No source-revert negatives or lab
   source fingerprints/results have been executed yet; those are not waived.
9. No escape hatch: normal entry-key/CDC/SQL/schema producer behavior is shared.
   Candidate optional scope and HLC syntax currently form the S3 local shortcut.
   No force flag, raw application SQL execution or alternate delivery loop exists.
10. Registry: new named impact contract/pair and two primary-classified tests are
    present. Metadata is frozen in the manifest but checks remain pending.

### Harness fidelity

1. Right red: current malformed-row/command assertions are meaningful written
   controls. S1's empty internal schema/type cases and S3's producer fidelity
   are absent; S2's existing regression is source-visible, not a measured kill.
2. Binding seam: storage fixture calls actual apply/table/CDC/outcome owners and
   deliberately queues afterCommit effects without executing them. Native test
   uses real PartitionService and native persistence. Fixture HLC identity is
   inaccurate (S3); its truthfully documented scope does not excuse that field.
3. Time: 30000ms test/10000ms group and existing election geometry remain; 20ms
   provisional retry affects only the native test subscriber. No public deadline
   or product cadence was raised. Runtime ordering still needs lab evidence.
4. Fields: declaration/canonical row/SQL come from real producers; first outcome
   and obligation come from real apply. Fix fixture stamp field as S3 requires.
5. Non-vacuity: tests assert pending callback engagement, native position,
   nonzero outcome/event count, actual DB/handler/port close, original cache row
   and retained debt. Add S1/S2 cases rather than accepting missing test coverage.
6. Live binding: RF1 native tests are actual code paths but unexecuted and not
   original RF3/all-141-member or full startup proof. Source checkpoint approval
   after repairs can precede lab execution; lab/receipts remain separate gates.

### Transport/delivery

1. ACK versus processed: no new ACK submission; observer checks stored source
   ACK only. Native test uses provisional outcome and cannot counterfeit MG
   commit. Actual MG recipient receipt wiring remains outside this increment.
2. Late answers: native fixture holds one real application then shuts down and
   reopens; delivery debt survives. No new waiter/late-cancel behavior in source.
3. Outcomes: no transport response shape change. ACCEPTED is not cdcCommitted;
   existing buildProvisionalCdcOutcome is used in the test.
4. Undeliverable: observation contains no network await. Existing retry/delivery
   policy is untouched; these tests do not certify the future MG delivery path.
5. Stub fidelity: loopback native transport uses the existing fixture. The direct
   subscriber models provisional cache visibility only and explicitly tests
   retained debt, not noHandler or committed delivery acceptance.

### Concurrency/serialization

1. Sync gate: no create/dispatch path added. Preparation #begin and directory
   currentness remain; observations cannot set openingMode.
2. TOCTOU: one synchronous native/application snapshot plus before/after native
   read in the preparation consumer. No cross-database atomicity claim; final
   construction revalidation remains future composition.
3. Single winner: no claim/CAS/activation authority added. Native/SQL owners keep
   their existing mutation paths; pure observation performs none.
4. Reentrant timers: no timer added; ordinary capture/helper extraction adds no
   callbacks. Tests hold actual application independently of the observer.
5. Lock scope: exact captured member paths/handles use existing custody. Failed
   close retains its exact slot and closes preparation admission; source
   inspection supports that path, but new consumer tests are missing (S2).

### Formation circularity

1. Dependencies: reads use retained physical databases and catalog/schema owners,
   not serving routes, TABLES cache or active workers. Initialization is excluded.
2. Starvation: no cache-triggered rescan/re-drive is introduced. The observation
   explains the held state; it does not claim the full continuation is complete.
3. Clients: continuation remains unconditionally held. Startup observation
   exception reason must be reconciled under S2; it never becomes serving success.
4. Window: finite retained/cohort scan has no added wait, but its synchronous
   duration and memory cost are unmeasured. Preserve public budget and measure
   before eventual composed startup acceptance.
5. No bypass: no direct application writes, owner-table repair, SQL replay,
   current cache permission or second publication store in observer code.

### Retry/re-drive

1. Fire path: no retry registration or suppression added; original CDC owner is
   untouched by observation. Native provisional subscriber engages its real lane.
2. Bound: one finite snapshot per read, with typed unavailable on failure; no
   unreadable-row loop or new deadline.
3. Loud stop: source returns explicit states; S2 concerns the outward reason,
   not a silent success. Exceptions never discharge retained obligations.
4. Suppression: no competing retry owner. The deliberate unimplemented startup
   continuation is reported as such, not presented as eventual recovery proof.
5. Ceiling: zero observer-triggered retry/delivery attempts; repeated caller
   scans are not automatically scheduled or amplified by this code.
6. Duplicate effect: first durable outcome and first ACK maps handle repeated
   inspection/apply; tests assert distinct/repeated command cases and debt count.
7. Reset: no counters, timestamps, generation, dedup state or CDC flags are
   reset by observation. SourceScope/stamp acceptance still needs S3 correction.

### Sweep/timer

1. Clock: none introduced; foundation timestamp is explicit original declaration
   input. Ordinary delegated clock use remains separate and tested in isolation.
2. Authority: no role-based rollback/proposal; all native phases remain exact
   owner observations regardless of current leader/follower.
3. Crash equivalence: no repaired JS state or volatile dedup. Ordinary reopened
   native/application owners replay; the inspector cannot perform that work.
4. Windows: no timeout detector or changed hold threshold; pending work never
   becomes contrary because of age. No new performance guarantee is claimed.
5. Starvation: no sweep added; retained local storage reads do not require the
   subsystem's serving readiness or CDC/cache convergence.

### Next bounded step

Answer S1-S3 together, update the affected tests/metadata, and request a focused
re-review of the repairs plus invalidated risks against a new exact manifest.
No additional architecture review or operator permission is needed for those
repairs within the already approved observation scope. After a current source
approval, preserve the exact non-main candidate for locked lab execution; retain
failed and unexecuted evidence distinctly. Nothing in this review approves
Quest closure, startup opening, activation, durable transfer, MG receipt
completion, merge or publication.

## SOURCE repair review R2, 2026-10-23

Reviewer: `subagent:/root/retained_effects_review`. Root remained the production
writer; other agents authored the tests. This reviewer authored no source or
tests and ran no runtime or lab workload. This addendum answers S1-S3 and their
invalidated risks; the earlier complete attack checklist remains part of this
review, with the dispositions below superseding its unresolved S1-S3 findings.

### Exact scope and verdict

**APPROVE, source only, conditional on subsequent exact-candidate lab proof.**
There are no remaining material source/test findings in this reviewed bounded
increment. This approval permits the non-main preservation checkpoint needed
to execute its exact source in the locked lab. It is not a runtime result,
Quest verification receipt, terminal landing approval, original startup
acceptance, MG receipt completion, protected activation, durable transfer,
composed two-start acceptance, merge or publication approval.

The base remains `f5fb317bebc3dc074f3d8d4102122ba4ddb94ecc`. The complete 33-file
scope is [MANIFEST-retained-effects-replacement-r2-2026-10-23.json](MANIFEST-retained-effects-replacement-r2-2026-10-23.json),
SHA256 `8d3a9f7a542d94d224152a396ced0290e02c022a870582ec38e56fc2d26c8d9b`.
I independently hashed every listed source/test/generated file, checked that
the evidence copy is byte-identical to the supplied `/tmp` manifest, and found
zero mismatches. I also inspected the generated inventory/classification and
impact-contract deltas. The contract reviewed is
[CONTRACT-retained-effects-replacement-2026-10-23.md](CONTRACT-retained-effects-replacement-2026-10-23.md),
SHA256 `ab253a5000f94a4e3030fc10b07c27d6aa2c249bc7d9dc1d138bcac47b63a854`.

Root reports that the third ordinary staged hook passed, targeted static
checks passed and the final source/test tree matches the index. Those reports
are not represented here as reviewer-executed checks or locked-lab evidence.
The generated test census adds three bootstrap test modules (2443 total),
with a separate shared fixture. No ratchet baseline increase is in the scope.
The generated owner-debt inventory retains its existing aggregate debt counts;
this review does not certify that inherited repository debt as resolved.

### Finite finding dispositions

- **S1 addressed.** The existing participant, generation, statement-outcome
  and CDC owners supply their actual full projections, CREATE definitions and
  indexes to `partition-retained-store-observation.js`. The helper requires
  the caller's transaction, distinguishes absent required tables from named
  incompatible objects, checks the owned shape before interpreting empty
  evidence, and rejects extra indexes/triggers or changed constraints. Raw
  integer/text/null values are validated before decimal-string conversion.
  The generation reader observes the entire singleton census; its direct
  history API and the top observer preserve typed contrary causes. Genuine
  lazy CDC absence remains legal only through the separate emitting-statement
  census; a reserved view cannot masquerade as that absence.
- **S1 physical-schema consistency addressed.** The application-table owner
  inspects schema objects before attempting a view's `table_info` or row read.
  A same-name view is contrary even when its body is unreadable. The observer
  reads rows only after COMPLETE physical schema, preserving an already known
  schema contradiction. Missing required schema remains unavailable. Actual
  physical CREATE bytes and the existing SQL_TRANSACTIONS enforcement owner
  remain authoritative; inspection performs no DDL or trigger installation.
- **S1 proof authored, unexecuted here.** The tests cover incomplete empty
  internal tables, missing indexes, injected triggers, wrong stored types,
  exact integers above Number's safe range, reserved views, positive restored
  owner images, and a second persisted singleton under unchanged canonical
  DDL. The singleton case checks both direct origin history and the composed
  observer. Actual old-owner ALTER ADD COLUMN functions are invoked as a
  fixture treatment and their resulting schema is then observed read-only.
  The application-view test proves an unreadable body, contrary observation,
  and restoration of the real applied row/image. These controls engage the
  repaired branches rather than depending only on a widened-schema refusal.
- **S2 addressed.** Startup wraps only the diagnostic observation in
  CLASSIFICATION_UNAVAILABLE, preserving its exact cause, including primary
  plus cleanup AggregateError. Intact observations remain exact hold detail.
  The preparation consumer still installs no opening mode, declaration-based
  grant or continuation right. Failed close retains the exact read handle.
  New preparation tests exercise the actual physical cohort/custody consumer,
  prepare-only and partial-history refusal, accepted/contrary/unavailable
  observations, restored availability, no native entry/opening, and exact
  close-failure custody. They are written evidence, not passing results here.
- **S3 addressed.** Canonical source commands bind HLC node identity to their
  actual `proposedBy` replica within the declared group. The fixture now uses
  that producer identity. Tests cover valid but foreign HLC identities for
  ENABLE, QUERY and CDC_DELIVERED and a legitimate forwarded producer with
  different physical/proposed times. Original CDC obligation matching no
  longer accepts scope injected by the observed payload. A catalog-valid
  injected scope is refused, and restored actual scope-absent debt is reread.
- **Final refactor reviewed.** Named classification, source-ACK binding,
  schema/enforcement, row/obligation census and raw-CDC validators retain the
  same snapshot, ordering and owner boundaries. Explicit census states and
  refusal construction preserve branch priorities. The exported existing CDC
  flag and named persisted null/default values add no new identity or state.
  The MG event-object predicate preserves strict membership without live
  normalization, filtering or timestamp invention.
- **Discarded stale-source finding.** I initially reported that the reserved
  view test's restoration helper used an unconditional DROP TABLE. That was
  the earlier in-progress body, not frozen unit SHA
  `2a048ab4dab3ccd79cf21514c36d7352b5c8aba11b33a87dead1b775d83ca8af`.
  I independently hashed that staged blob and read its helper: it already
  used DROP TABLE IF EXISTS. The finding is withdrawn and is not a defect or
  unperformed repair attributed to the frozen candidate. The final unit SHA
  is `33c6c29e607bf9139301bd84afa88d20d430159179782d40d008168eacff0dcd`.

### Category-complete repair recheck

1. **Authority/observation:** original declaration/member validation, immutable
   identity-bearing observations, fresh snapshots and no opening/publication
   conversion remain intact. S1 closes the internal empty-schema and coercion
   exceptions. Missing authority stays unavailable; contradictory schema/raw
   evidence now has an explicit OWNER_CONTRARY reason and exact cause/table.
2. **Recovery/replay:** the observer performs no mutation, migration, callback
   application, timestamp repair or debt discharge. First outcomes, repeated
   statements/origins, complete expected-versus-observed obligation census and
   the first applied ACK binding survive the reductions. Pending source-to-ACK
   dependency remains unavailable without executing the inspector's source.
3. **Owner interaction:** real producer functions and existing native,
   participant, outcome, CDC, physical-schema and enforcement owners supply
   facts. The shared SQLite helper owns mechanics, not eligibility/schema
   invention. Paired unavailable/contrary-to-restored tests and current impact
   contract/pair metadata cover the corrections. No source-scope producer or
   second identity store has been added.
4. **Harness fidelity:** direct fixtures still call actual owner apply and
   leave delivery effects queued; preparation tests enter actual read-only
   custody. Native RF1 tests hold a real committed application, close its
   database/port/handler, reopen ordinary replay and assert preserved outcome
   and owed source event for all three foundation tables. They deliberately
   do not certify original RF3/full-cohort admission. All runtime proof remains
   unexecuted in this review; no written assertion is counted as passing.
5. **Transport/delivery:** no transport response or ACK eligibility path changes
   in this increment. Provisional cache visibility in the native witness
   explicitly leaves source debt owed. MG content remains unavailable pending
   source-occurrence/recipient-commit correspondence, including valid unequal
   legacy stamps. Copying metadata or observing a row cannot discharge debt.
6. **Concurrency/serialization:** observation remains one synchronous native
   and application snapshot per member with preparation identity/currentness
   and native-record checks before/after. There is no cross-database atomicity
   claim, opening issuance or new timer. S2 preserves original failure and
   exact cleanup custody rather than releasing a still-open resource.
7. **Formation circularity:** retained reads require physical storage and its
   owners, not a serving route, cache convergence or active delivery. Both
   startup and continuation remain held. No direct application write, repaired
   registry, second publication store or operator bypass resolves the hold.
   Scan cost and composed-startup timing are still unmeasured lab concerns.
8. **Retry/re-drive:** no new retry loop, deadline, wake, suppression owner or
   replacement occurrence is introduced. Repeated reads do not cache verdicts;
   restoration controls re-observe the actual storage. Existing CDC retry and
   deduplication keep ownership, and no debt/generation/ACK flag is reset.
9. **Sweep/timer:** no sweep or age-based authority appears. Declaration time
   remains the explicit original registration input, invalid/missing original
   time refuses without a hosted-clock fallback, and ordinary legacy delegates
   retain their prior clock behavior. Existing witness budgets are unchanged;
   no liveness or performance success is claimed from source inspection.

### Remaining boundary and next proof

No remaining mismatch was found between this bounded observer's final source
and the corrected contract. The intentional incompleteness is substantive:
the original MG relay/proposal/apply path does not yet preserve and return the
source event's committed recipient outcome through the existing
`cdc-event-envelope.js` and `cdc-delivery-outcome.js` owners to source ACK
eligibility. Source occurrence/recipient identity cannot be reconstructed from
content equality, source metadata alone, or ordinary transport success.
Existing source scope also does not itself establish original allocation,
build or incarnation rights. This increment continues to report UNAVAILABLE
at that boundary and grants no replay/opening authority from classification.

Preserve this exact candidate and run the relevant owner/consumer regression
and new witness tests under locked-lab custody. Distinguish measured pass/fail
from unexecuted evidence, and source-bind any subsequent fix and re-review to
its new bytes. Full Quest receipts, actual original cold-start composition,
protected activation, transfer, MG delivery and two-start acceptance remain
separate outstanding work. The final fingerprint recheck follows below.

Final recheck: all 33 manifest files still match, with zero changed bytes;
manifest SHA256 remains
`8d3a9f7a542d94d224152a396ced0290e02c022a870582ec38e56fc2d26c8d9b`
and the contract remains
`ab253a5000f94a4e3030fc10b07c27d6aa2c249bc7d9dc1d138bcac47b63a854`.
The preserved pre-addendum review prefix hashes to
`e29eb60abeb4dfbb21aedba3d09b9c7d0aa7d1dc4e6c3252965ad16d5bcae8b9`,
confirming this reviewer only appended to the existing review evidence.

## Exact-candidate static lab evidence, 2026-10-23

The static evidence condition now has an independently inspected PASS for
source commit `68633168ef17759fec954e6ef66b4ccb0d671bc7`, against base
`f5fb317bebc3dc074f3d8d4102122ba4ddb94ecc`. This supplements the source-only R2
approval; it does not approve runtime behavior, full Quest closure, original
startup, activation, durable transfer, MG delivery, two-start acceptance,
merge or publication. Runtime job #912 is outside this static verdict.

The [original static terminal receipt](https://github.com/psvensson/lagrange-lab/issues/913#issuecomment-6359224376)
reports explicit PASS, exit 0, source execution started and the exact source
SHA. Its request `3f3fd0be17bf4128afdee9ed4b3c319f`, controller
`b4a2e06c193c44b09f1b67d02e8d80f4`, envelope digest
`a92dd977d3e8253793ed93edd7eea7e4d89fb48d9ea02f8de9cf9f49937c79b7`
and payload digest
`45193dbd9807ad7accd8d3e1972e65739ff13208b8d598cd32aba3d9dfa280f9`
match the submitted packet. The actual host is `local-workstation`. Both
execution scope flags are closed; its worker reports exit 0 and closed
execution, container and thermal scopes, with no failure reason.

The [complete worker-log retrieval receipt](https://github.com/psvensson/lagrange-lab/issues/916#issuecomment-6359270969)
is a read-only evidence query for that same original job and host, not another
source execution. I independently checked the local log bytes against its
decoded base64 and text, original worker receipt, chunk digest and raw log
digest. All match: 2952 bytes, offset 0, next offset 2952, complete/eof true,
no truncation, SHA256
`da3abe1234685f81059a45a4c05515c0e3c93afad31a0a6d978ae9a1f54de47a`.
The inspected local artifacts are `/tmp/retained-effects-static-worker.log`,
`/tmp/retained-effects-static-evidence0.json` and the filtered original
receipts `/tmp/retained-effects-static-receipts.json`. The digest and durable
receipt links identify the evidence independently of those temporary paths.

The log confirms Node v22.23.2 and npm 10.9.8, metadata refresh and audit for
2443 tests, and 22 subsystem classifications. Primary classification counts
are unit 2114, integration 109, bootstrap 213, convergence-probe 3 and packaging
4. The refreshed primary/resource/subsystem digests are respectively
`fnv1a32-1508ee04`, `fnv1a32-b1441642` and `fnv1a32-48b237b8`, matching the
reviewed generated census. The graph snapshot digest is
`4765461cbc1309ee2b55f3559ab1ff297d37c5e66495695ae06fbaf494cc0546`.

All fourteen fast-static checks explicitly report `ok`:

1. `test:deps`
2. `audit:shards`
3. `test:metrics:scoped`
4. `audit:runtime-grammar`
5. `eslint(27 changed)`
6. `audit:current-capabilities`
7. `audit:doc-ascii`
8. `test:metadata-gateway:audit`
9. `audit:impact-contracts`
10. `audit:roadmap-authority`
11. `audit:doc-audience`
12. `audit:cli-docs`
13. `audit:service-portability-claims`
14. `audit:closure-ledger`

Fast-static reports success in 12029 ms for the stated proof range, with 39
changed paths and 27 JavaScript paths. The final script result explicitly
reports `metadata_refresh_exit: 0`, `metadata_audit_exit: 0`,
`fast_static_exit: 0` and `tracked_tree_exit: 0`. Thus refresh reproduced the
tracked metadata, its audit passed, all selected static checks passed, and
the worker's final `git diff --exit-code HEAD` found no tracked changes.
This is measured static evidence for the exact preserved source, not an
inference from COMPLETE alone and not a substitute for runtime witnesses.

Only this review addendum was written by the reviewer; no source, test,
submission, retry or lab execution was performed during evidence inspection.

## Exact-candidate runtime failure evidence, 2026-10-23

**Runtime verdict: FAIL; acceptance remains open.** I independently inspected
the complete source-bound log and receipt chain for source
`68633168ef17759fec954e6ef66b4ccb0d671bc7`. The source-only R2 review and static
PASS above remain evidence for their stated scopes; neither converts this
runtime failure into acceptance. No moving test repair was reviewed in this
pass, and no production/source/test change or runtime execution was performed
by this reviewer.

### Receipt and full-log custody

The [original runtime terminal receipt](https://github.com/psvensson/lagrange-lab/issues/912#issuecomment-6359304028)
reports FAIL, exit 1, source execution started, and the exact source SHA. Its
request `c139d76b7d274493bfc8103657827173`, controller
`b4a2e06c193c44b09f1b67d02e8d80f4`, request digest
`1fb584d6aaa70376ed22fa6ef31d1df5644779a8e7b9f6248e83334d837aab00`
and payload digest
`dba72b260409181347a90fb7b9ddcfd1a277217f6e11a1043ec729fde38165f0`
match the submitted runtime packet. The actual host is `lenovo-laptop`.
Execution/scope, worker execution, container and thermal cleanup all report
closed. The worker has no separate infrastructure-failure reason and reports
an untruncated original log. SSD thermal measurement is absent; cleanup closure
does not constitute a broader thermal or performance certification.

The inspected full worker log is 157961 bytes, SHA256
`0ebbea165efc53bd6160d746927b1c06810405ddd9702f023308d63fc31bf715`.
I independently hashed the complete file and each of the 21 contiguous chunks
in `/tmp/retained-effects-runtime-log-custody.json`, verifying offset continuity
from 0 through 157961, each returned byte count/raw/chunk digest, one original
job/host/stream identity, final complete/eof and no truncation. The stream is
`26de7bedb37cfa50e2422416e82b8e1dc024bee18719a7b5267b301161f3e0c1`.
This matches the original worker log/output digests in #912; the controller's
short combined worker-tail digest is not substituted for the full log.

The [failed retrieval #921](https://github.com/psvensson/lagrange-lab/issues/921#issuecomment-6359386451)
reports read-only UNAVAILABLE at offset 28037 with COMMAND_FAILED:ssh:255 and
executed_source false. The [reconciled retrieval #939](https://github.com/psvensson/lagrange-lab/issues/939#issuecomment-6359429322)
supplies exactly bytes 28037 through 36037 of the same stream, whose hash I
checked against the assembled file. All successful chunk receipts identify
read-only retrieval of the original worker log with executed_source false.
The failed evidence transport is preserved and was not a duplicate source run.

### Complete classified census

The packet selects 27 files and the complete log contains 27 unique final
file summaries. Its classified-runner totals are:

| Lane | Files | Passed | Failed | Runner-reported assertions |
| --- | ---: | ---: | ---: | ---: |
| ordinary | 19 | 19 | 0 | 576 |
| bootstrap | 7 | 3 | 4 | 215 |
| exclusive | 1 | 1 | 0 | 2 |
| total | 27 | 23 | 4 | 793 |

These are the runner's assertion counts, not 793 successful assertions. The
23 wholly passing files account for 609 reported assertions. The generic
worker driver's `tests:154, pass:5, fail:149` describes only the final failed
Node TAP file, `seed-retained-effects.test.js`; it is not the job census.
`completed_test_files:null` in that generic driver does not erase the 27
explicit final classified file summaries in the complete original log.

The nineteen ordinary passes include the existing origin history, native
durable store/Ready/persistence/restart, committed statement, participant,
CDC obligation/generator and CDC mutation regression files. The bootstrap
passes are `seed-registration-phase-custody.test.js` (1), the new
`seed-retained-effects-preparation.test.js` (9), and
`seed-original-attempt-lifetime.test.js` (21). The exclusive origin-history
integration file reports 2. Their successes are real evidence for their
individual scopes, not proof of the failing new classification/native cuts.

### Failure mechanisms and exact proof gaps

1. **New classification fixture violates native transaction custody.**
   `test/bootstrap/seed-retained-effects.test.js` reports 154, with its Node
   TAP summary pass 5/fail 149. Repeated leaf failures are
   RAFT_RS_STORE_USER_TRANSACTION_OPEN at the shared fixture's
   `retain`/`store.putAppliedState` call. I inspected the immutable source
   fixture at `68633168`: it opens `db.transaction` at lines 123-135 and then
   asks the native store to write its applied state. The native owner's
   `persistenceAdmission`/`admitWrite` at `raft-rs-durable-store.js:385-403`
   intentionally forbids writes under a transaction it did not open. This is
   one systematic fixture/owner-boundary defect across the affected cases,
   not dozens of measured classifier regressions. Most exact classification,
   schema, type, obligation, ACK and restoration assertions never reached their
   intended observation cut. Fixing the fixture must retain the native owner's
   transaction authority; this failure supplies no reason to weaken that guard.
2. **Two older component fixtures omit required continuation authority.**
   `seed-registration-election-scheduling.test.js` reports 16 and
   `seed-registration-phase.test.js` reports 11. Their failures include
   `d.assertOriginalSeedContinuation is not a function`, before intended
   election/writer/registration effects. The expected downstream event/failure
   comparisons consequently also fail. I inspected base `f5fb317b`: both
   production continuation guards already exist there, and both test files
   are unchanged between that base and `68633168`. This establishes the source
   applicability of the fixture omission, not a measured same-host predecessor
   result. The run does not prove those election, activation-deferred or epoch
   registration assertions. The mandatory production guard remains in force.
3. **All three new native SQL witnesses stop before fault engagement.**
   `seed-retained-effects.integration.test.js` reports 3 failures: message_groups,
   tables and partitions each fail the assertion that actual native commit
   reached the held SQL callback at line 137, after their 10000ms wait. The
   log does not show a held native SQL entry, post-crash ordinary SQL replay,
   canonical foundation outcome/event, provisional cache delivery or final
   duplicate-answer assertion. It therefore cannot prove loss at any of those
   later cuts or count them as successful witnesses.

   Subsequent immutable-source inspection supports the identified prerequisite
   error: `partition-participant-transaction-pause.js:191-215` creates CLOSED
   admission for a standalone service, and
   `partition-service-raft-write-commit.js:441-455` returns the typed paused
   answer before proposing an ordinary write. ENABLE uses the separate
   `startPartitionRaftWriteCommit` path in
   `partition-participant-transaction-request.js:724-727`; applying ENABLE is
   not a release grant for ordinary writes. These production owners are
   unchanged from the base. The failed test swallowed the ordinary write
   answer while waiting for a callback, so that typed refusal is a source
   diagnosis here, not a runtime outcome captured by this log.

The successful preparation test supplies the real diagnostic startup/custody
evidence it exercised, including hold behavior and exact failed-close custody.
It does not replace the blocked unit correspondence cases or native SQL replay
witness. The new native cases reached their setup/ENABLE/pre-SQL observation,
but failed before the foundation SQL mechanism under test; that is the literal
engagement boundary for this attempt.

### Required next evidence

Preserve this exact failed attempt. Freeze and independently review the fixture
repairs before rerunning the applicable classified cone on an exact preserved
candidate. A narrowed test that asserts ordinary CUTOVER_PAUSED first and then
uses a real native proposal may prove retained classification/native replay;
it must explicitly remain outside original startup/public-write release proof.
No fabricated admission release, guard change, skipped negative or enlarged
deadline follows from this evidence review. The moving repair and that narrowed
witness have not been approved here.

Re-execution must actually engage the repaired transaction boundary, component
continuation delegates and all three held native SQL callbacks, then prove the
remaining read-only/replay/CDC/outcome/ACK assertions. Compare predecessor on
the same host before attributing a runtime regression when needed; source
inspection alone is not that comparison. Static success and the 23 passing
files do not settle the remaining runtime condition. Full Quest receipts,
MG completion, R1/R2 activation/transfer, composed two-start acceptance and
release gates remain outside this failed candidate's evidence.

## R3 frozen test-repair source review, 2026-10-23

Verdict: **REVISE**, for the single material fixture defect R3-T1 below.
This is a source review of the six frozen test/helper repairs after failed
runtime #912. It neither approves a new runtime candidate nor changes the
earlier production source-only disposition. No production, test, metadata,
runtime or lab work was performed by this reviewer.

The reviewed six-file manifest is
[MANIFEST-retained-effects-test-repair-r3-2026-10-23.json](MANIFEST-retained-effects-test-repair-r3-2026-10-23.json)
(local request `/tmp/retained-effects-test-repair-manifest-r3.json`), SHA256
`c08e24cd7c1310b160b00511d6188e14f69e0d09023758b4971657b33e250ce9`.
All six files matched both at initial inspection and at the final audit before
this append. The full 36-file source/test/generated manifest
[MANIFEST-retained-effects-replacement-r3-2026-10-23.json](MANIFEST-retained-effects-replacement-r3-2026-10-23.json),
SHA256 `fcc07b389328f2fe8ba110e9224076f6d3fa248f37e4e2ca77f976ecd58879b3`,
also matched with zero mismatches at both checks. Production has no diff from
`68633168ef17759fec954e6ef66b4ccb0d671bc7`. The generated changes observed
are import-graph/inventory fingerprints and subsystem observation paths;
their 2443-file census and inherited aggregate debt counts do not grant test
acceptance or clear existing debt. Root reports the normal staged hook passed;
this is not a reviewer-executed runtime or static-lab result.

### Finite material finding

**R3-T1: the registration refusal fixture does not faithfully reach every
guard it claims to prove.** In frozen
`test/bootstrap/seed-registration-phase.test.js:389-413`, the shared negative
loop supplies no `getEpochManager`, while asserting that no logger or clock
dependency may be read before the refusal. Actual
`src/bootstrap/phases/seed-registration-phase.js:201-204` and `:321-324`
read the logger before `ensureSystemTableWriter` consults continuation. Thus
the service/meta cases receive the correct refusal but fail their empty-read
expectation. `persistCurrentEpochIfMissing` at `:563-588` first obtains the
epoch manager, looks for the config leader, serializes the current epoch and
reads the hosted clock. Its new fixture instead throws a missing-delegate
TypeError before it can reach the continuation guard. This is a deterministic
source finding, not a claim that these newly written tests were executed.

Correct the component fixture by providing valid read-only prerequisites for
the actual path and separating allowed prerequisite observations from
protected writer acquisition/publication, mutation, CDC and activation effects.
Keep the exact original typed refusal and guard-call count assertions. The
phase-entry and direct writer cases can still assert that no prerequisites
are read; lower-level methods must reflect their actual guard location. Do
not move or weaken production guards merely to make a fixture expectation true.
Root and the census author independently identified this same defect and are
repairing the one test file plus separately enumerated adjacent fixtures. Those
moving/supplemental files are outside this frozen disposition and require new
fingerprints before approval.

### Unaffected repairs and proof limits

- The shared storage fixture now calls the actual
  `applyCommittedEntryTransaction` with `RaftRsDurableStore.transaction` and
  the actual partition committed-entry callback. The owner at
  `src/raft/raft-rs-application-transaction-owner.js` advances application and
  native applied state in one store-owned transaction. The fixture captures
  the actual deferred callback batch only through that owner's after-commit
  release; it deliberately does not execute delivery/notification callbacks.
  Its MG storage-only fixture continues to have no application callback and
  makes no native MG application claim.
- The new paired storage controls retain USER_TRANSACTION_OPEN under a
  caller-owned BEGIN and verify no native/application bytes change. A trigger
  faults the actual applied-state write after SQL application, then verifies
  rollback of row, statement outcome, lazy CDC ledger and generation, with no
  SQL batch released. Removing the fault and replaying through the same owner
  restores one outcome, one owed occurrence and generation one. This directly
  attacks the transaction boundary that failed #912; a raw caller transaction
  shortcut cannot satisfy the restored positive path. Written assertions
  remain unexecuted in this review.
- `seed-phase-continuation-fixture.js` uses the real
  `createBootstrapServiceSeedDelegateMethods()._buildPhaseExecutionDelegates`
  adapter and explicitly substitutes the component decision. Positive checks
  measure forwarding/call counts; they do not establish original-startup
  authority. The election refusal preserves the exact owner error and starts
  no election or wait. The unchanged real BootstrapService continuation-HOLD
  test in `seed-original-attempt-lifetime.test.js:404-430` remains the separate
  authority witness; it passed in #912. R3-T1 must be repaired before treating
  the new registration negative as equivalent evidence.
- The native RF1 fixture first exercises ordinary `executeQuery`, asserting
  exact CUTOVER_PAUSED/deferRetry and unchanged native/application observation.
  It then uses the existing `buildPartitionWriteEntry` with the actual service
  HLC, replica and clock, and the public native operation port to propose the
  intended retained bytes. It changes no admission/release state. The runtime
  proposal owner drains Ready and returns its application HOST_FAILURE, so the
  held-callback/typed-failure assertions correspond to the actual path rather
  than mistaking an answered proposal for successful application.
- The resulting native witness is narrowly about real persistence, pending
  SQL, cold unchanged storage and ordinary durable-record replay. Its exact
  command/index/term, row/outcome/owed-event, provisional cache delivery and
  durable same-entry answer assertions remain meaningful for each of the three
  foundation tables. The direct native proposal is an explicitly bounded
  fixture entry point; it does not prove public write release, original RF3
  cohort admission, original startup continuation or publication. No later
  assertion is a passed witness until the new preserved candidate runs.

### Category-complete delta coverage

1. **Authority/observation:** production classification and continuation
   authority are unchanged. The real delegate adapter forwards one decision;
   R3-T1 concerns where the fixture observes that decision, not a new grant.
2. **Recovery/replay:** the actual transactional apply owner replaces the
   rejected foreign transaction. Rollback and restored replay are paired;
   native cold replay retains exact occurrences and settled outcomes.
3. **Owner interaction:** native durability, application, participant origin,
   outcome and CDC owners retain their decisions. The test never accepts a
   forged release. Generated observation paths track the changed helper and
   builder imports; the production interaction contract remains unchanged.
4. **Harness fidelity:** R3-T1 is the sole material finding in this six-file
   delta. The remaining fixtures explicitly separate storage/component/native
   proof from complete original-cohort proof and preserve the real fault cut.
5. **Transport/delivery:** deferred storage callbacks are not recipient ACKs;
   the native provisional cache result leaves the exact source debt owed.
   Full MG source-occurrence/recipient proof remains outside the observer.
6. **Concurrency/serialization:** the store owns transaction depth and rollback;
   native callbacks fail inside the actual apply transaction. Shutdown still
   verifies closed database/port/handler before cold reopen, and a failed close
   preserves the directory rather than erasing custody.
7. **Formation circularity:** the direct native proposal is a test-only route
   to retained history with ordinary admission explicitly held. It is not an
   implementation solution to the original release/startup dependency.
8. **Retry/re-drive:** replay follows the ordinary durable opening, and same
   entry retry uses the durable outcome before admission. No new occurrence,
   timer, release loop or production fallback is introduced by these repairs.
9. **Sweep/timer:** existing 30000ms test and 10000ms group budgets remain;
   callback or typed proposal outcome is observed rather than extending a
   timeout. No timing, load or full startup success is inferred from source.

### Preserved lab references and next gate

The prior complete evidence now has repository artifacts:
`LAB-912-retained-effects-runtime-2026-10-23.txt`
is exactly 157961 bytes, SHA256
`0ebbea165efc53bd6160d746927b1c06810405ddd9702f023308d63fc31bf715`;
`LAB-913-retained-effects-static-2026-10-23.txt`
is exactly 2952 bytes, SHA256
`da3abe1234685f81059a45a4c05515c0e3c93afad31a0a6d978ae9a1f54de47a`.
Both preserved files were independently rehashed here. The associated
runtime custody (`LAB-912-retained-effects-log-custody-2026-10-23.json`),
runtime receipts (`LAB-912-retained-effects-receipts-2026-10-23.json`) and
static receipts (`LAB-913-retained-effects-receipts-2026-10-23.json`) preserve the
already reviewed custody chain. #912 remains FAIL with 27 files, 23 passed,
4 failed and 793 runner-reported assertions; #913 remains the exact old
candidate's static PASS. Neither applies as a passing execution of these
new test bytes.

Freeze R3-T1's correction and the separately scoped adjacent test repairs,
regenerate exact metadata, and review that delta before preserving the next
lab candidate. Conditional source approval of the unaffected repairs is not
an approval of this rejected six-file set. New exact-candidate runtime and
static evidence are still required; full Quest, MG completion, activation,
transfer, composed two-start acceptance and merge remain excluded.

At this review boundary all six and all 36 manifest hashes still matched.
The previous 81815-byte review prefix hashes to
`f438bf5a4c37987e34a09c9dedf767fe760ca1e62b9591d634d97787792d2134`;
this addendum is append-only.

Post-append custody check: root had explicitly released only
`seed-registration-phase.test.js` for R3-T1 repair while this addendum was
being written. That file now differs from the rejected R3 manifest; the
other five repair files and other 35 full-manifest files still match, and
production remains byte-unchanged from `68633168`. This is the authorized
next repair, not part of the R3 findings or an approved substitution. Its
new bytes await a new frozen manifest and bounded review.

## R4 frozen repair approval, 2026-10-23

Verdict: **APPROVE, source-only and conditional on fresh exact-candidate lab
evidence.** R3-T1 is resolved in the revised registration fixture. No additional
material source finding remains in the combined eleven test/support files or
their refreshed metadata. This permits preservation of the reviewed non-main
candidate for the proposed lab run. It is not runtime acceptance, Quest
closure, startup/activation/transfer/MG proof, composed two-start acceptance,
publication or merge approval.

I independently verified all eleven files against
[MANIFEST-retained-effects-test-repair-r4-2026-10-23.json](MANIFEST-retained-effects-test-repair-r4-2026-10-23.json),
SHA256 `84fe267689a4cfbc96f7798d7742cf30a8b5cb0126478484ef0803d3801dc0ef`,
before and after inspection. I also verified all 41 source/test/generated
files in
[MANIFEST-retained-effects-replacement-r4-2026-10-23.json](MANIFEST-retained-effects-replacement-r4-2026-10-23.json),
SHA256 `20ed417b3815b092ca2253cce64773bbc913feb1b1f53e93fdad8935e3b14cfe`.
Both repository copies equal the supplied `/tmp` manifests. Production has
zero diff from `68633168ef17759fec954e6ef66b4ccb0d671bc7`; the five unaffected
R3 repair files retain their reviewed hashes. Test working bytes equal staged
bytes. Only this review evidence was written by this reviewer; no source,
tests, metadata, lab submissions or local runtime execution were performed.

### Finite disposition of the correction and adjacent census

- **R3-T1 resolved.** Registration test SHA256
  `d3e479f7aa74ef41745cd6d153392889582783ecac74c99e77a7887ead89b955`
  explicitly separates allowed observations from forbidden effects. Direct
  phase/writer calls read no prerequisites; service/meta registration reads
  its logger. The epoch case supplies the actual leader lookup prerequisites,
  an empty successful epoch SELECT, epoch serialization and a hosted clock.
  Its expected read sequence matches `SeedRegistrationRuntimeOwner` and
  `resolveHostedNodeClock`; it then requires the exact original continuation
  error, one guard consultation and no writer acquisition/publication,
  mutation, CDC acquisition, leadership or activation effect. No production
  guard was moved or weakened.
- **Cluster identity component repaired.** `cluster-identity-mint.test.js`
  uses the previously reviewed real delegate adapter. The missing-identity
  case reaches writer continuation once; the existing-identity case returns
  from the real read path before the writer and consults continuation zero
  times. The tests retain their identity-format, attribution, default-value
  and no-remint assertions. This component decision substitution grants no
  original-startup authority.
- **Storage refusal components repaired.** The managed-split negative and
  durable-generation negative pass frozen identity-only options through the
  real `admitOriginalSeedReplica` delegate adapter to a scoped prior-decision
  double. They assert exact option-object forwarding and one consultation.
  `SeedPartitionsPhase.createBootstrapPartitionReplica:212-223` then invokes
  the unchanged actual storage-admission owner before touching the partition
  map. The tests require the intended CLEANUP_IN_PROGRESS or
  CREATE_OWNER_DEFERRED outcome and zero acquisition. The durable-generation
  case still starts with a real SQLite cleanup row and preserves its token in
  the actual startup snapshot. The double supplies no original opening token,
  membership, database path, current-generation grant or constructed replica;
  its only claimed purpose is reaching the independently owned negative.
- **Replication-policy census remains non-vacuous.** The structural helper
  now includes the actual extracted row owner. The test pins the original
  registration phase to zero inline writes, `seed-foundation-rows.js` to its
  exact two declared-default identifiers, and create-message-group to one.
  It preserves identifier-expression checks, exact per-file sets and total
  three, plus the existing behavioral/schema-drift witnesses. Actual source
  has that distribution, and the registration phase consumes the two row
  constructors. Moving a write or adding an inline override cannot pass by
  merely maintaining the aggregate count.
- **Systematic scope is finite and checked.** I independently searched `test`
  and found the stated sixteen direct constructor occurrences across seven
  files, including the three embedded child-script occurrences. Inspected
  leadership-only scheduling and writer-substituted replication witnesses
  reach no continuation gate; the retained timestamp witness already has its
  explicit spy. The other direct paths are covered by the repaired adapters
  or negatives. Commit `7fa4d79ae` exists for the prior original-lifetime
  guard; the named older supplemental fixtures and SeedPartitionsPhase have
  no diff from base `f5fb317b` to `68633168`. This supports the recorded
  inherited omission diagnosis, not a measured predecessor pass. The
  structural stale-location assertion follows the candidate's row extraction.

The earlier R3 favorable dispositions remain applicable to the unchanged
store-owned apply/rollback fixture, actual delegate adapter, election HOLD and
narrow native RF1 witness. The latter first proves ordinary CUTOVER_PAUSED,
then uses the public native proposal port to create the retained-history cut;
its direct proposal remains explicitly outside original public-write release
and full-cohort startup proof. No test claim silently widens that scope.

### Category-complete final delta check

1. **Authority/observation:** original continuation, original replica opening
   and storage admission remain separate owners. Test doubles name their
   bounded component role and grant no actual opening capability. The exact
   real BootstrapService HOLD witness remains selected.
2. **Recovery/replay:** store-owned application, rollback restoration and
   ordinary native cold replay are unchanged from reviewed R3. Identity
   absence/existence in the cluster-mint component retains its actual path;
   no absence becomes a recovery completion grant.
3. **Owner interaction:** R3-T1 now reaches the genuine guarded seam with
   valid prerequisites. Storage tests retain exact first admission forwarding
   followed by the actual durable refusal, rather than replacing that second
   decision. Producer/consumer extraction remains pinned by the census.
4. **Harness fidelity:** known fixture omissions are repaired without guard
   bypass in production, skipped tests or weakened negative expectations.
   The new component roles, direct native witness scope and no-acquisition
   observations are explicit. All written assertions still need execution.
5. **Transport/delivery:** no transport, recipient receipt or ACK source
   changes occur. Provisional cache visibility still cannot clear owed debt;
   MG source-occurrence authority remains the separately designed increment.
6. **Concurrency/serialization:** actual store transaction ownership and
   failed-frontier rollback stay paired. Supplemental negatives stop before
   resources are acquired. Original shutdown/failed-close custody is unchanged.
7. **Formation circularity:** component doubles are not an alternative startup
   path. The full integration file may still encounter the existing original
   startup HOLD; its other cases remain unproved and must report honestly in
   the next run. No readiness projection or test success grants release.
8. **Retry/re-drive:** no deadlines, production retries, wake mechanisms or
   generation/ACK resets change. Corrected negative setup avoids an earlier
   TypeError while retaining the same owner refusal and later-entry boundary.
9. **Sweep/timer:** no new sweep, timeout increase or age-derived authority
   appears. Existing native/component budgets remain; no runtime latency or
   convergence result is inferred from this source review.

### Metadata, validation and remaining gate

I inspected the refreshed inventory, graph seal and subsystem observation
diffs. The census remains 2443; aggregate inherited debt remains 1811
complexity findings, 47 source-duplication groups/1462 duplicated lines and
701 test-duplication groups/26618 lines. No baseline increase is in this
repair. These unchanged debt counts are not a claim that inherited debt has
passed its ratchets. The preserved
ordinary precommit capture (`STATIC-retained-effects-r4-precommit-2026-10-23.txt`)
shows the normal inventory/metadata regeneration; root reports its exit was
zero. That local hook result is not a fresh locked-lab static receipt.

The proposed `/tmp/retained-effects-runtime-tests-r4.json` contains 31 unique
files, all represented in primary, resource and subsystem metadata. Its
primary census is 9 bootstrap, 20 unit and 2 integration files. It retains
the prior 27-file selection and adds the four complete supplemental executable
test files, not only their newly repaired subcases. Consequently a new run
must reconcile all file and assertion counters, every failure and cleanup
custody; it cannot infer broad success from the local negative repairs.

Preserve the exact reviewed blobs, then obtain fresh runtime and static lab
evidence for that exact commit. Original #912 remains a preserved failed
attempt, and #913 remains static evidence for `68633168`; neither is a pass
for the new test bytes. The approved observer still grants no opening mode
or continuation right, and none of the eight full-Quest receipts, protected
activation, durable transfer, MG completion, composed two-start or merge gates
is satisfied by this source-only verdict. Any subsequent source/test change
requires its own bounded fingerprint and review.

Final R4 recheck after this append: all eleven repair files and all 41
full-manifest files still match, with zero mismatches; production diff from
`68633168` remains empty. The prior 92625-byte review prefix hashes to
`f2275c4680d3bc1a061bf5964d442b317fecca55e46a6c01fd8eccd4be58d61a`,
confirming append-only custody. The 31-file selection hashes to
`6fd941f29e0c21310d2a0c8f273df9802020edee3b798007f5cc2d47a4e08173`;
the 3310-byte precommit capture hashes to
`b68720f950334723199b0a875a06236ce94b715ec6dfdec0fc979da3398609a0`.

