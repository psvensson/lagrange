# BEGIN uncertain insert resolution design review

**Verdict: REVISE.** The proposal correctly separates a confirmed primary-key
collision from an uncertain INSERT, retains the six immutable creation fields,
and requires wrong-key/incomplete readback to fail closed. It does not yet define
a production-capable same-attempt proof, safe quarantine of the retained
descriptor, or restart behavior consistent with its own `MISSING` rule. Seven
category-complete findings remain. The first four are safety or liveness
blockers.

This verdict is narrow. It does not reopen the accepted PREPARE/reply binding,
approve any transaction source, or make a startup/crash-recovery claim.

## Exact subject and evidence

- Review worktree: `/mnt/data/peter/projects/.worktrees/tx1-work-20261010`,
  HEAD/base `e7c89f4b5114c0238312d3831b65889a4622f4e9`; pre-existing dirty and
  untracked work was preserved.
- Subject:
  `solve/quests/replicated-transaction-decision-and-apply/design-query-begin-uncertain-insert-resolution-2026-10-11.md`,
  SHA-256 `eb52b743ac44514150fdcba2f0df3f73e1464818b93d89b0af56e3979a959a02`.
- Diagnostic manifest:
  `c56-transaction-evidence-matrix/round4-diagnostic/evidence-manifest.sha256`,
  SHA-256 `9cddb866431a74eb444b839cdce0a022b9b3baeddde37e2b0cdeac8a7779dfbb`.
- Diagnostic summary:
  `c56-transaction-evidence-matrix/round4-diagnostic/diagnostic-summary.json`,
  SHA-256 `82f08d7ee657115136c26cf04d3debd736429c97299eed614ecaefdca5aa1d06`.
  It records the two semantic reds (wrong-ID and incomplete readback remint),
  two descriptor-loss reds (generic constraint/unavailable and timeout/
  unavailable), and the exact-initial, advanced, confirmed-PK-collision and
  complete-conflict controls.
- The ten verification templates under
  `docs/development/verification-templates/` were applied as the 63 specialized
  A/Y/T/S/R/C/F/H/O/J items below.
- Documentation review only: no source, test, Quest log, commit, publication,
  or runtime action was performed. Only this report was created.

Key source fingerprints:

| Path | SHA-256 |
| --- | --- |
| `src/query/sql-query-engine-transaction-persistence-methods.js` | `f514a4445521b846457818f54e3fcd05268688d8469f612d4e5e1fcf57f4a031` |
| `src/query/distributed/distributed-transaction-coordinator.js` | `c4a1ff872a4b2a3766cefe8fbd06768a62b96f1574602a592a3bcd7c65b29314` |
| `src/query/distributed/distributed-transaction-recovery.js` | `788befbd180bbb70679eae78f201ecf916d88316027770f7dff571a2a6deb98d` |
| `src/query/distributed/distributed-transaction-statement.js` | `3d60e0479dd681a0a304740bf804187b003a6aad9fae0a4aefcef505e3158297` |
| `src/query/sql-query-engine-statement-admission.js` | `fc398002ff8b19e2e34681006917112613f232ac73fd0e5aa8d21f08b24f3055` |
| `src/workflow/durable-workflow-coordinator.js` | `ba683bea66935c573158dedab2fe387af4e8f14bda4b25aa9a475b47ec9dec73` |
| `src/control-plane/control-plane-system-table-gateway-mutation-contracts.js` | `e07d2b4c81da638dccb4a44fdf670a8cb7ffbcefa9aa09c597e3ee296c833acc` |
| `src/control-plane/control-plane-system-table-gateway-mutation-submission.js` | `4c7553da2e6b58f750c1f796c5ad0aff2b0c20a82309f98ca1ce8624f99c04de` |
| `src/control-plane/control-plane-write-identity.js` | `d8a79c43e47cc9d0c2e49398b6043c20414c67454b8b7ed1089e5b83459d36ee` |
| `src/control-plane/control-plane-mutation-outcome-classifier.js` | `079ceb4af4ba8d1c3498fff960d0112a2767b97bdf321a8f222ffa579f6eeac6` |

## Findings

### B1 — HIGH — the existing gateway cannot produce the promised terminal/no-effect proof

The proposal assigns attempt completion and no-effect evidence to the existing
gateway (D:39-43, 95-100, 114-118), but its public result does not carry the
needed fact:

- `control-plane-write-identity.js:194-230` privately distinguishes SETTLED,
  NOT_PROPOSED and UNKNOWN and retains an unresolved named instance. That
  verdict is not returned as a canonical producer disposition.
- The transaction INSERT supplies neither `idempotencyKey` nor `writeIdentity`
  (`sql-query-engine-transaction-persistence-methods.js:186-193`), so
  `runControlPlaneWrite` mints a new per-call key
  (`control-plane-write-identity.js:389-396`). There is no stable attempt handle
  for a later BEGIN to query or redeliver.
- The owner envelope substitutes `unknown_attempt_key` and a new wall-clock
  deadline when the result lacks them
  (`control-plane-system-table-gateway-mutation-contracts.js:320-340`); those
  synthesized diagnostics cannot prove that the INSERT is no longer retained
  or in flight.
- The current completion resolver is not strict enough for this grant. An empty
  plain object is inferred as APPLIED, while an invalid result is mapped to
  REJECTED (`control-plane-mutation-outcome-classifier.js:338-383` and
  `control-plane-system-table-gateway-mutation-contracts.js:46-67`). Thus
  “canonical APPLIED/REJECTED” is not presently the asserted accepted/effected/
  terminal-no-effect contract.

Define an exact gateway contract expansion: a stable attempt identity bound to
the INSERT content and expected transaction ID, strict own-data terminal states
such as APPLIED / NOT_PROPOSED / UNKNOWN, retained-or-in-flight state, and a
same-attempt read-after-settlement operation. It must expose the private
write-identity verdict without accepting caller booleans or synthesized
defaults. Until then, neither definitive rejection nor no-effect-plus-MISSING
is implementable from the named existing producers.

### B2 — HIGH — retaining the descriptor in the generic maps does not quarantine it from ordinary transaction execution

D:67-70 and 158-160 say the retained record cannot execute transaction work,
but the named minimal changes cover only statement admission, COMMIT and
ROLLBACK. Current reachable consumers use map presence or ordinary `status`:

- `runRecoverySweep` selects every nonterminal workflow whose budget expired
  (`distributed-transaction-recovery.js:245-266`). An unresolved candidate is
  currently `status: ACTIVE` (`distributed-transaction-coordinator.js:343-364`),
  and `redriveRecoveredTransaction` rolls every undecided non-COMMIT status back
  (`distributed-transaction-recovery.js:73-99`). Expiry would therefore emit a
  decision/rollback for a creation that D:128-133 says must remain a
  reconciliation hold.
- `hasActiveTransaction` is raw map presence
  (`distributed-transaction-coordinator.js:550-556`), while `getTransaction`
  also reads the same map (:525-547). Hiding uncertainty from `getTransaction`
  but calling it “non-ACTIVE” is insufficient: absent expected identity passes
  `admitExpectedTransaction` (`sql-query-engine-statement-admission.js:53-70`),
  and read/write paths can then run as nontransactional/autocommit or fetch the
  raw retained record (`distributed-transaction-statement.js:46-70,83-99`).
- service-lifecycle SQL and other callers use `hasActiveTransaction`
  (`sql-query-engine-service-lifecycle-execution.js:109-117`), so changing that
  projection alone can either expose the record as active or permit unrelated
  session work through it.

Specify one creation-state gate used by BEGIN, parsed statement admission,
read/write helpers, enlistment, write-operation recording, COMMIT, ROLLBACK,
`hasActiveTransaction`, recovery sweep, recovery replay, lifecycle shutdown and
diagnostics. While uncertain, every non-BEGIN operation for the session must
return one typed creation-uncertain refusal; it must not become autocommit,
rollback, decision, participant work, or an ordinary recovered transaction.
The recovery sweep may invoke only the creation classifier for this state.

### B3 — HIGH — the proposal names a retry/wake that does not reach the classifier or preserve the same INSERT attempt

D:122-126 promises same-session BEGIN, expected-ID retry, and the existing
transaction recovery wake. The current routes do not implement that ownership:

- `begin()` obtains its implicit expected ID from `getTransaction`, then
  `beginOwned()` performs ordinary admission and answers TRANSACTION_ACTIVE on
  raw map presence before minting (`distributed-transaction-coordinator.js:
  230-280`). If `getTransaction` hides the uncertain record as proposed, this
  path has no explicit retained-descriptor lookup/classifier branch.
- The periodic recovery timer calls `runRecoverySweep` and decision recovery,
  not INSERT-attempt reconciliation
  (`distributed-transaction-recovery.js:204-340,352-376`). Gateway completion
  and authoritative-read availability have no subscriber that enqueues this
  descriptor.
- Recalling `persistWorkflow` would submit another INSERT. Because the current
  INSERT has no stable gateway write identity, it is a distinct attempt rather
  than a query of the first one.

Define the single reentry method, its session-FIFO position, and its exact
actions per descriptor state. A retained attempt must first query/redeliver the
same gateway attempt and then perform the authoritative exact-key read; it must
never issue a fresh INSERT. Name real gateway-settlement/read-availability
events, subscriber, coalescing key `(sessionId, transactionId)`, shutdown fence,
and unref timer fallback. If the design intentionally relies only on a later
client BEGIN, remove the nonexistent recovery-wake claim and state the liveness
ceiling.

### B4 — HIGH — restart MISSING contradicts the proposal's own no-effect rule and permits a second identity

D:114-118 correctly says MISSING alone cannot prove a timed-out or retained
mutation will not later apply. D:136-143 then loses the volatile descriptor and
says an exact MISSING after restart merely finds no durable transaction to
adopt. The gateway's held attempt records are also process-local
(`control-plane-write-identity.js:93,247-258`). A request delivered to a remote
partition before the coordinator process died can still apply after the new
process observes MISSING. Once the bound retry gets NO_TRANSACTION, an unbound
BEGIN can mint a replacement, recreating the duplicate-identity defect.

The design must choose a coherent restart rule. Either the gateway exposes a
durable/reconstructible attempt disposition for the original idempotency key,
or the restarted owner cannot authorize a replacement identity from MISSING.
If no client-supplied proof can safely reconstruct the old attempt, return a
typed unrecoverable/uncertain result and keep new identity creation closed for
that bound creation domain; do not call the lost request safely absent. Required
witness: request engaged remotely, coordinator exits before answer, restart
sees MISSING, late original applies, and no replacement was minted.

### B5 — HIGH — the original transaction deadline is retained as data but is not applied to gateway work or reentry

D:59-60, 104-105 and 122-134 preserve the deadline, but the current INSERT
options carry only work class (`sql-query-engine-transaction-persistence-
methods.js:186-193`). `buildDistributedTransactionMutationOptions` does not
copy the transaction budget (`sql-query-engine-transaction-recovery-methods.js:
188-223`), although the gateway supports it
(`control-plane-system-table-gateway-options.js:71-111`). The readback likewise
uses a fresh default gateway query budget (:305-319 of the persistence owner).
No proposed rule says whether an expired hold may still spend bounded control
time to learn disposition, or how that time differs from permission to start
transaction work.

Pass the original frozen budget/deadline through the first INSERT and every
foreground reconciliation wait. After expiry, ordinary work remains refused;
if reconciliation is allowed as recovery, give it an explicitly bounded owner
budget that cannot renew the transaction deadline or authorize a new ID.
Validate `createdAt + configuredBudget`, deadline subtraction and gateway
timeout conversion for safe-integer overflow and exact-boundary behavior.

### B6 — MEDIUM — the readback/collision rules are internally inconsistent and under-specify the hostile row boundary

D:88-94 says a complete expected-key row with any of the six immutable fields
different is a collision, including a different `transaction_id`. D:101-112
says a wrong-key row is INVALID/uncertain and must never become a complete
conflicting row. State the precedence explicitly: the reader first proves one
dense row whose own primitive `transaction_id` exactly equals the requested
key; a wrong ID is INVALID. Only then may differences in the other five
immutable fields establish a foreign creation collision.

The current reader returns `rows[0]` and collapses unavailable and missing to
null (`sql-query-engine-transaction-persistence-methods.js:300-319`). The
proposal adds four states but no bound/cardinality algorithm. Require an own
dense array with bounded length, exactly zero or one own data element, no
accessor/iterator use, and capture the row once before validation. Define exact
primitive domains for ID/session/mode and safe canonical integer domains for
epoch/deadline/createdAt, rejecting `NaN`, infinities, `-0`, unsafe integers,
boxes, symbols, inherited fields, accessors and polluted prototypes before
equality. The current `String(value || '').trim()` coercion at :75-77 cannot be
the boundary.

### B7 — MEDIUM — the generic REMOVE/RETAIN seam lacks an exact owner-bound disposition and atomic replacement contract

`DurableWorkflowCoordinator` serves migration, rebalancing, schema provisioning,
readiness, membership publication and transactions. Its current registration
catch removes the exact installed object by ID (`durable-workflow-coordinator.js:
61-71`), while recovery preserves any live ID and may retain a newer owner-key
binding (`:603-629`). D:147-157 says a typed private disposition comes “from”
the persistence callback, but does not define whether it is an exception field,
a callback return, or an owner policy. An exception property is forgeable by a
gateway/transport error; a generic default can accidentally retain another
owner's failed workflow.

Define an injected coordinator-owner policy that receives the exact candidate
object and a captured strict error classification, and whose default is always
REMOVE. RETAIN must be accepted only for the transaction coordinator's exact
candidate still present in both maps. Later resolution must atomically verify
the same descriptor/state: exact initial changes it to INSERTED; confirmed
no-effect or collision removes that exact object; advanced same-creation removes
it before installing the authoritative recovered row without replacing a newer
owner binding. Every stale/late callback must be a typed no-op diagnostic.

## Complete 63-item matrix

`OK` means the proposal is coherent at design level for that item; it is not an
implementation approval. `REVISE` points to a finding above.

| Item | Result and concrete evidence |
| --- | --- |
| A1 | **REVISE B2/B3.** D:72-76 retains one descriptor, but current BEGIN admission (:230-247), statement admission, commit/rollback and recovery sweep do not share a creation-state precheck. |
| A2 | **REVISE B1/B6.** D:83-106 names four branches, but existing completion inference and the wrong-key/conflict overlap do not preserve them in every consumer. |
| A3 | **REVISE B5.** D:59-60/122-134 freezes the deadline as data; INSERT/read options do not consume it. |
| A4 | **REVISE B1/B6.** Existing gateway result/read shapes are looser than the canonical terminal/no-effect and four-state objects asserted by D:78-118. |
| A5 | **REVISE B1/B3.** No exact gateway attempt disposition or event releases the hold; only private `judgeAttempt` has the fact. |
| A6 | **OK with B6 correction.** D:108-112 requires a current exact-key authoritative row captured once; collision precedence must exclude wrong-key data. |
| A7 | **REVISE B6/B7.** D:164-186 requires packet fields, but no runtime diagnostic shape binds attempted ID/session/deadline, attempt key and observed row state. |
| Y1 | **REVISE B3.** Current same-session BEGIN returns ordinary active/refusal and the recovery timer reaches decision recovery, not the classifier. |
| Y2 | **OK.** D:104-106/128-134 retains identity and frozen deadline on unavailable evidence. B5 governs actual budget use. |
| Y3 | **REVISE B2/B3.** Deadline behavior is stated, but shutdown, stale-ID and every terminal stop/wake are not enumerated or typed. |
| Y4 | **REVISE B2/B7.** Generic map retention, cache recovery clobber guard and decision recovery can suppress/terminalize creation reconciliation. |
| Y5 | **OK with B3 ceiling.** One owner-key record and FIFO bound concurrent descriptors in-process (D:72-76); attempt count/cadence and restart lifetime remain unspecified. |
| Y6 | **REVISE B3/B7.** Required case 3 says no second INSERT, but no reentry algorithm prevents `persistWorkflow` from submitting one; late success fencing is absent. |
| Y7 | **OK.** D:122-134 explicitly forbids identity/epoch/deadline refresh. B5 requires plumbing it. |
| T1 | **REVISE B1.** Gateway transport/acceptance/effect are conflated by current inferred APPLIED and synthesized REJECTED. |
| T2 | **REVISE B3/B7.** No current exact-candidate fence prevents a late completion from racing removal/remint or recovered-row installation. |
| T3 | **REVISE B1.** D:95-100 lists outcomes, but current resolver accepts arbitrary completion strings and infers terminal states from incomplete objects. |
| T4 | **REVISE B3/B5.** Unavailable gateway/read has no same-attempt bounded reentry beyond a client retry and default per-call timeouts. |
| T5 | **REVISE B1.** The required fixture must use the real gateway verdict; current public gateway supplies no terminal retained/in-flight/no-effect fact. |
| S1 | **REVISE B3.** The existing sweep timer is injected/unref'd (`distributed-transaction-recovery.js:352-376`) but invokes the wrong recovery path for creation holds. |
| S2 | **REVISE B2.** Current expired ACTIVE workflow is rolled back by `redriveRecoveredTransaction`; the proposal does not name the exclusion gate. |
| S3 | **REVISE B4.** In-process descriptor and restart census are separated, but restart loses an unresolved remote attempt and treats MISSING inconsistently. |
| S4 | **OK with B5.** D:128-133 keeps legal pending insertion across transaction expiry while refusing work; reconciliation needs its separate bounded budget. |
| S5 | **REVISE B2/B3.** Existing recovery is routed through an ordinary workflow/ACTIVE status; creation resolution must establish ACTIVE only after evidence. |
| R1 | **REVISE B7.** Current recovered-row clobber guard and owner-key preservation are known, but exact descriptor removal/replacement ordering is missing. |
| R2 | **REVISE B4.** D:136-143 distinguishes volatile from durable state but cannot distinguish absent effect from a late retained remote effect. |
| R3 | **OK with B7.** D:83-87 preserves advanced matching rows and the existing recovery owner; evidence case 5 requires the legitimate nonempty COMMIT control. |
| R4 | **REVISE B3/B7.** Repeated read and late APPLIED idempotence need a same-attempt key and exact descriptor state CAS. |
| R5 | **FAIL B4.** D:114-118 says MISSING alone never proves no effect; D:136-143 permits restart to forget the attempt on MISSING. |
| C1 | **OK with B7.** Current `registerWorkflow` installs before persistence (:61-71), the intended synchronous descriptor point; retention policy must be owner-bound. |
| C2 | **REVISE B7.** No post-await same-object/state/deadline fence is specified for gateway result, readback, removal or recovered-row install. |
| C3 | **REVISE B3.** Session FIFO exists (`distributed-transaction-statement.js:22-33`), but BEGIN/retry/recovery do not yet converge on one insert attempt. |
| C4 | **REVISE B2/B3.** Recovery timer reentry can currently run rollback work on an uncertain descriptor. |
| C5 | **OK with B7.** Session FIFO plus transaction ID is the right contested identity; the exact candidate check must bind both maps. |
| F1 | **OK.** D:33-43 correctly enumerates coordinator, persistence and gateway dependencies for creation INSERT/readback/census. |
| F2 | **REVISE B3/B4.** Unavailable control retains in-process identity, but no wake exists and restart can forget/replace it. |
| F3 | **REVISE B3/B5.** Expected-ID behavior is stated; actual BEGIN order and inherited budget consumption are not. |
| F4 | **REVISE B5.** INSERT, authoritative read and retries currently receive independent/default control budgets rather than one original deadline. |
| F5 | **OK.** D:31-43/145-160 adds no raw SQL, alternate reader or durable ledger. Required correction must retain this boundary. |
| H1 | **OK.** Frozen diagnostic summary has semantic wrong-ID/incomplete-remint and descriptor-drop reds, plus positive controls. |
| H2 | **OK.** Evidence uses real SQLQueryEngine/DurableWorkflow paths; its diagnostic ceiling explicitly excludes production partition/startup proof. |
| H3 | **OK.** Cases deterministically order response loss/readback/advance and do not infer uncertainty from a pre-engagement setup timeout. |
| H4 | **OK with B6.** D:45-70 binds all six fields and excludes mutable progress; required case 5 carries genuine advanced state. |
| H5 | **OK.** Required packet records durable rows and participant/decision operations before/after, preventing empty-success evidence. |
| H6 | **OK.** D:3-4 and required packet make no normal-startup or crash-proof claim; B4 requires a new restart schedule before acceptance. |
| O1 | **OK.** D:33-43 assigns identity/FIFO, persistence classification and gateway evidence owners without moving PREPARE authority. |
| O2 | **REVISE B1/B6/B7.** Typed insert result, read result and retention disposition are proposed but not defined precisely enough to compose. |
| O3 | **OK with B6.** Required cases 7 and 4/5 pair invalid evidence refusal with legitimate original-row recovery. |
| O4 | **OK.** Required cases 3/5/7 describe stale invalid/unavailable evidence followed by current exact matching recovery under the original ID. |
| O5 | **REVISE B3.** In-process one-per-session prevents an ID storm, but fresh INSERT reentry and absence of a wake/backoff ceiling remain open. |
| O6 | **REVISE B3.** No gateway completion/read availability event is wired to the canonical session FIFO; the asserted recovery wake is dead for this state. |
| O7 | **OK.** D:108-118 keeps caller ID and cached/absent rows from becoming effect authority. |
| O8 | **REVISE B7.** Required before/after rows exist, but exact removal/mismatch control fingerprints and stale callback diagnostics are not specified. |
| O9 | **OK.** D:88-118 prohibits generic collision labels, caller booleans, alternate remint and raw-read fallback. |
| O10 | **REVISE B1-B7.** Required cases name persistence/workflow/coordinator behavior, but impact metadata must also register real gateway attempt, sweep, statement/autocommit, shutdown and restart witnesses. |
| J1 | **REVISE B5/B6.** “Canonical” is not a numeric lattice; safe integer, `-0`, nonfinite and derived-overflow rules are absent. |
| J2 | **REVISE B6.** D:111 requires own six fields, but own requested-key/row-array/cardinality evidence is not fully defined. |
| J3 | **REVISE B6.** D:111 says capture once, but must include array slots, row key and gateway result before any classification. |
| J4 | **REVISE B6.** No null-prototype/frozen-intrinsic rule pins behavior under Object/Array prototype pollution. |
| J5 | **REVISE B6.** Primitive canonical domains for IDs, mode and numbers are not enumerated; boxes/exotics are not explicitly refused. |
| J6 | **REVISE B6.** The design cites strict-own capture conceptually but not the actual intrinsic boundary; current `String(...).trim()` is coercive. |
| J7 | **REVISE B6.** Equality is intended after validation, but exact canonical decimal/primitive representations and any diagnostic digest inputs are unspecified. |
| J8 | **REVISE B6.** Multiple rows are named invalid; dense bounded exact-cardinality validation before indexed access/materialization is absent. |

## Required next design revision

One bounded revision can close the findings by specifying:

1. a real gateway same-attempt identity and strict terminal/effect/no-effect
   result, including read-after-settlement and event wake;
2. a single transaction creation-state admission function covering every map
   consumer and explicitly excluding ordinary recovery/rollback/autocommit;
3. reentry action ordering under the session FIFO with no second INSERT;
4. a restart rule that never converts MISSING into no-effect without the
   original attempt's terminal proof;
5. propagation of the frozen absolute transaction deadline plus a separate
   bounded post-expiry reconciliation budget;
6. exact-key-first, strict-own, dense bounded readback validation; and
7. an injected, transaction-owner-only DWC retention policy with exact-object
   CAS for retain, release and advanced-row replacement.

The next witness should use the actual gateway/write-identity owner, actual
SQLQueryEngine coordinator and periodic sweep. It must include delayed remote
apply across coordinator restart, expired in-process uncertainty, unbound and
expected-ID requests, shutdown, wrong-key/incomplete/accessor/multiple rows,
and the advanced nonempty COMMIT control. No participant or decision operation
may be emitted by an unresolved creation descriptor.
