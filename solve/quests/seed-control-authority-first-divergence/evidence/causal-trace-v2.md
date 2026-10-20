# Seed control authority: first-divergence investigation v2

Product: `be25caa5f0c3612feec662d4feaa9ba28f8f34df`.
Execution base: `58c505788a7ca1106b5409723140218f2bcb27fc`.
Status: diagnostic investigation; no production repair or acceptance.

This corrects causal-trace.md without changing that preserved checkpoint.
Independent review corrected selected-route versus actual dispatch, recovery
prerequisites, the application commit boundary and proof ceilings. See log.ndjson.

## Candidate and scope

Live remote refs were read before selection. The U1 branch still names be25caa5;
the planning head adds eleven epic documentation/evidence paths only. Its plan
commit tree matches `55c95798af4faae2a558c9663edc01ea46f96509`.
The isolated investigation branch is
`investigate/rsraft-control-authority-20261020`. The shared integration checkout
at `2b863e4f300fc8ebdfb80e2752606187eed1436c` retains its eighteen staged paths.
No fixture PR, mutation branch or newer main was merged into this candidate.

The existing native-startup census seal supplies the passive-observation
discipline. Its superseded applied-position repair has narrower source scope
and is not reopened here. This child is sealed red for diagnosis only.
The static module-cycle-removal Quest does not establish removal of a runtime
readiness cycle.

## Actual historical and current entry

The original candidate Actions run 39393585693 first retains this wrapper at
`single-path-partition-cutover.test.js`: service_endpoints-p1, ordinal 33 of
46, 32 complete, 3001 ms elapsed against the original 3000 ms shared budget.
It names sql_transactions-p1, a control node, and nested
`release_fact_unavailable`. See input-manifest.json and the exact original
log-line excerpt. The artifact's NDJSON retains test verdicts, not nested
protocol replies; the Actions log supplies the original outer observation.

An unchanged first lab measurement on locked adam-laptop uses execution base
58c505788 with retries disabled. The protocol file passes 14 assertions.
The single-path file remains red, five assertions, including the seed failure
at sql_write_operations-p1, ordinal 43 of 46, 42 complete, 3000 ms elapsed.
The later standalone write and restart cases also fail their existing admission
expectations. They are separate obligations, not evidence about this nested
control refusal. The two files shared the classified ordinary lane; this is
not an isolated latency benchmark or a cross-host formation.

Both seed observations reached the selected-control-request failure branch.
They exclude the no-node-hint branch for these particular outer answers.
Actual control dispatch remains unproven: participant-release-client.js:107-121
can return RELEASE_DEADLINE before calling messageRouter.deliver. Neither
observation retains the nested missing fact. Their different ordinals
do not prove a regression, identical internal causes, or recovery progress.

## Construction and blocking prerequisites

All paths below are relative to the repository, at the product candidate.
The independent read-only trace review confirmed this construction order.

| Edge | Evidence and classification |
| --- | --- |
| Construct physical partition | `src/bootstrap/phases/seed-partitions-phase.js:250-301` constructs and initializes actual PartitionService objects with genesis/durable-record identity and transport, then retains them in the partition registry. Authoritative physical/runtime prerequisite. |
| Construct early SQL bridge | `src/bootstrap/owners/seed-runtime-bridge-owner.js:41-65` supplies the early SQL engine and topology owner. Main startup attaches the topology owner before bootstrap at `src/lagrange-runtime-startup.js:437-465`. |
| Register actual objects and route | `src/bootstrap/bootstrap-service-replica-registration-methods.js:272-293` acquires the deferred handler and attaches actual services to localServices. `src/bootstrap/shared/replica-handler-setup.js:268-279` registers the release route before cache hydration. Object registry is routing/lifetime evidence, not durable OPEN permission. |
| Select seed work | `src/bootstrap/bootstrap-service-seed-workflow.js:278-349` orders sql_transactions first, selects one intent per partition cohort and uses one shared deadline. Selection is not an admission proof. |
| Select control destination | `src/node/replica-handler-participant-cutover.js:151-164` exempts sql_transactions itself, prefers an initialized live local control leader, otherwise consults a topology hint. Missing hint refuses. |
| Obtain control permission | The same file `:137-148,166-180` requires actual CUT_OVER, exact build/release identity and a nonempty enforced current census. An invalid nested answer becomes current_control_owner_fact with only its outcome retained. |
| Invoke actual recipient | `src/node/participant-release-client.js:107-140` can refuse an expired original deadline before dispatch; otherwise it uses original router delivery and at most one canonical leader redirect. A destination hint grants nothing. |
| Later publication | `src/bootstrap/bootstrap-service-seed-workflow.js:405-445` acquires engine/handler, releases cohorts, then registration, cache hydration and control-plane readiness. Those later phases are not prerequisites for local control selection. |

The local fresh-seed route therefore has an enforced structural escape from a
full-readiness prerequisite: control goes first, does not depend recursively on
itself, and is directly registered before metadata publication. This is a source
exclusion of that particular proposed cycle, not a blanket proof of restart or
remote routing availability.

The remote topology owner has additional row/cache prerequisites
(`src/bootstrap/owners/bootstrap-topology-snapshot-owner-leader-identity.js:35-94` and
`src/bootstrap/owners/bootstrap-topology-snapshot-owner-authoritative-rows.js:446-490`). They remain
relevant when no local leader exists. The existing remote protocol fixture
stubs this topology owner and cannot prove its real publication availability.

## Complete operation and remaining obligation

Trigger: seed release at the registration checkpoint, or existing-origin
recovery through the same release owner.

Current facts: exact hosted leader, measured build, existing durable origin or
fresh-storage/operator authorization; committed membership, generation,
accepted-work drain, and coordinator schema/transaction census. A dependent
partition obtains the current control proof both before its own pause and
again after its final census.

Permitted effect: PAUSE closes admission; ENABLE may submit the deterministic
origin only through the existing commit owner; exact recipient RESUME alone
may reopen after fresh checks. `src/partition/partition-participant-transaction-request.js:690-726` reuses recorded origin or proposes it. Committed application installs
coordinator enforcement and records origin in
`src/partition/partition-participant-transaction-apply.js:554-579`. The application callback and applied-state update execute inside
`store.transaction` in `src/raft/raft-rs-application-transaction-owner.js:61-98`;
deferred effects follow commit. The proposer resolves through afterCommit at
`src/partition/partition-participant-transaction-apply.js:116-125`. Source
correspondence is not native crash-atomicity evidence.

Lost response/restart: the durable origin survives independently of volatile
RUNS and OPEN proofs. Retrying reconstructs current facts; an earlier CUT_OVER
answer does not grant a new effect. `src/node/replica-handler-release-recovery.js:190-217` reads current hosted leader/origin/build and re-enters release;
registry and consensus events at `:244-254` are wakes. Automatic recovery
refuses OPERATOR_REQUIRED when origin or measured build is absent; it retries a
failed cutover only after those prerequisites permit entry. This does not prove
automatic continuation for every partially completed fresh-seed startup. The existing recovery
owner retains/refuses work according to its contract; seed request expiry does
not prove cancellation or cleanup of committed native work.

The lexical pause/resume owner remains responsible for OPEN. Runtime/storage
owners retain committed application and physical lifetime obligations.
No diagnostic state feeds any of these decisions.

## Discriminator and limits

Reuse the independently reviewed native-startup trace-v2 observer at the
actual MessageRouter factory. Retain original request/reply identity,
call/completion order, supplied membership/generation/work/origin fields,
nested missing fact, and observational wall times. Call the original transport
once and return its original promise. No new protocol request, owner read,
sleep or extended budget is introduced.

The unchanged startup assertions remain the oracle. The complete bounded
trace is compressed only after bootstrap settles, hashed and emitted to the
runner's retained stderr; oversize is a diagnostic error. Counts expose record
drops, capture failures, incomplete records and cohort truncation. Interpretation
requires complete relevant records; instrumentation adds synchronous capture
and a settlement callback, so elapsed time is instrumented evidence.

Positive and safety-negative controls already exist in
`test/partition/participant-release-protocol.test.js`: current control release and intact
recreation, missing control refusal, and post-ENABLE control shutdown with no
dependent RESUME. Their passing baseline is bounded local/native evidence.
The diagnostic seal still requires engaged targeted negative/positive controls
and independent evidence review. Any subsequent repair retains its separate
semantic regression and whole-operation recovery-progress obligations.

Safety: no new verdict. Progress: startup remains red. Resource/performance:
original shared deadline is exhausted; cleanup certification remains
unproven, including error swallowing inside existing cleanup helpers.
