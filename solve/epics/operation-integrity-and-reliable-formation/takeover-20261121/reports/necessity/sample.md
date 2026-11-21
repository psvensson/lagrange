# Necessity audit: sanity sample of 40 census sites

Head: `b638284d1`. Census: `data/fallback-census/census.json` (joined at `6a240d3de`, runs from `f3e9b011c` and `6a240d3de`).
Selection (VERIFIED, reproducible): for N1, N3, N4 and N5 a seeded draw (`sha256("necessity-2026-11-21|" + file + range)`, ascending),
quota per row (two-source 4-5, typeof 2, catch 1-2), one directory per bucket where possible, deferred-writer files excluded.
N2 has only 33 still-valid sites; all 33 were read (list at the end) and 8 diverse ones are in the table.
Every line below was read at the head (`git show b638284d1:<file>`) at the detector's range. Kinds are my reading of the
local code (VERIFIED as read); callers were traced only where the line says so, so production reachability is INFERRED.

Kinds: **a** same decision from a second source of truth (must go) · **b** default/absent-value substitution hiding a missing or
unavailable input (must become a typed outcome or a required input) · **c** capability probe or injection seam kept alive for
reduced fixtures (migrate fixtures, delete) · **d** legacy/second shape or name (delete after proving no producer) · **e** legitimate
second trigger or genuine optional feature (keep only with the named witness) · **f** detector false positive.

"P" = lanes where the primary side executed, "A" = lanes where the alternate side executed (from `sidesByRun`).
For the two-source row "primary executed" only means the expression was evaluated (see README, section 2).

## The 40 sites

| # | Bucket | Site (head line) | Row | The two arms | Kind | Note |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | N1 | `src/admin/admin-preflight-snapshot.js:390` | two-source | `this.nodeId` / `ADMIN_DEFAULT.NODE_ID` | b | a missing node id silently becomes a constant; P=unit only |
| 2 | N1 | `src/partition/managed-merge-workflow-persistence-methods.js:96` | two-source | `error?.message` / `MANAGED_MERGE_ERROR_MSG.START_FAILED` | b | diagnostic text only; error-path arm never ran |
| 3 | N1 | `src/rebalancer/operation-workflow-transition-persistence.js:632` | two-source | `admission.expectedWorkflowStep` / `operation.workflowStep` | a | two sources for one step, but only inside a `logger.warn` field (diagnostic) |
| 4 | N1 | `src/runtime/wasi-component-cell-runtime.js:360` | two-source | `message.error.message` / `...INVOCATION_FAILED` | b | diagnostic default on a worker error message |
| 5 | N1 | `src/bootstrap/traffic-readiness-utils.js:278` | typeof | `options.buildError` / built-in error builder | b | every caller in every lane passes `buildError`; the default is dead: make the argument required |
| 6 | N1 | `src/control-plane/membership-publication-coordinator-reads.js:274` | typeof | `systemTableCache.getAll(...)` / `[]` | c | probe for a cache that always exists in all lanes; absent cache would read as "no publications" |
| 7 | N1 | `src/message-group/message-group-forwarding-owner-delivery-methods.js:102` | catch | topology repair / warn + cooldown + `false` | b | failure collapsed into "not repaired"; has a cooldown continuation, so typing it is cheap |
| 8 | N1 | `src/query/sql-query-engine-partition-routing-readiness.js:520` | catch | routable-count repair / `return false` | b | any error (not only unavailability) reads as "not routable", silently |
| 9 | N2 | `src/bootstrap/bootstrap-topology-snapshot.js:57` | typeof | `options.now()` / `Date.now()` | c | inverted: the "fallback" is the production clock; the injected clock is used by no lane at all |
| 10 | N2 | `src/bootstrap/join-cleanup-handler.js:709` | typeof | `delegates.getSqlQueryEngine()` / `null` | c | primary dead: no lane wires this delegate, so everything guarded by a non-null engine here is dead code |
| 11 | N2 | `src/control-plane/control-plane-system-table-gateway-read-contracts.js:267` | typeof | infer `BOOTSTRAP_SNAPSHOT` strategy / next inference | b | implicit strategy inference (W4 `implicit_mode_defaults`); the bootstrap-snapshot inference never fires |
| 12 | N2 | `src/rebalancer/move-planner-state-methods.js:491` | typeof | `getPartitionDescriptorEpochSnapshot` / `...Evidence` | d | VERIFIED by `git grep`: no `src` object defines the `...Snapshot` name; the "primary" is a phantom alternate name |
| 13 | N2 | `src/bootstrap/startup-workflow-store.js:176` | typeof | duck-typed `options.storage` / file or memory storage | c | the injected-storage arm is used by no lane |
| 14 | N2 | `src/node/replica-state-machine-recovery.js:393` | typeof | `systemTableCache.get(...)` / `null` | c | inverted the other way: production cache has `get` (VERIFIED `system-table-cache-observation-methods.js:446`) but only a reduced unit fixture reaches this code, so the production arm is untested |
| 15 | N2 | `src/cdc/cdc-confirmation-tracker.js:73` | typeof | `opts.predicate` / `null` | c | optional predicate no lane supplies |
| 16 | N2 | `src/query/sql-query-engine-instance-initializer.js:336` | typeof | injected `tablePartitionProvisioner` / engine-owned provisioner | c | inverted: the default is the production path; the seam is unused (this file has no `f3e9b011c` evidence: formation lane absent) |
| 17 | N3 | `src/runtime/wasm-component-driver.js:390` | two-source | `cause.code` / `WASM_COMPONENT_ERROR.CREATE_REPLICA_FAILED` | b | error-code default feeds the caller's failure classification |
| 18 | N3 | `src/service/service-lifecycle-manager.js:555` | two-source | `captured?.operation_id ?? captured?.operationId ?? row?.operation_id ?? row?.operationId` | d | snake/camel shapes from two objects (also a); only unit fixtures produce the later shapes |
| 19 | N3 | `src/admin/admin-runtime-service-views.js:136` | two-source | `endpoint[EP_COL.ADDRESS] ?? endpoint.address ?? STRING.UNKNOWN` | d | two row shapes plus a display default |
| 20 | N3 | `src/query/query-executor-partition-service-resolution.js:402` | two-source | `answer?.reason` / `...SERVE_ELIGIBILITY_UNAVAILABLE` | b | reason-code default in a routing diagnostic |
| 21 | N3 | `src/rebalancer/operation-workflow-replace-handoff-attempt.js:87` | typeof | `owner.resolveTimeoutCheckNowMs()` / `Date.now()` | c | only reduced owner fixtures lack the method |
| 22 | N3 | `src/logging/wait-bound-spent.js:221` | typeof | passed `logger` / `LoggingService.getInstance()` | c | logger capability probe; the singleton is a second logger source for fixtures |
| 23 | N3 | `src/partition/managed-source-replication-start-delivery.js:88` | catch | delivery / typed `{success:false, retryable, deferRetry, retryAfterMs, sourceStartOutcome}` | f | the catch IS the typed-outcome conversion; the detector counts any returned object literal as a default |
| 24 | N3 | `src/control-plane/membership-publication-coordinator-reconcile.js:570` | catch | owner membership drive / log + trace + `false` | b | error collapsed to a boolean; the decision trace records ERROR, the return value does not |
| 25 | N4c | `src/service/call-cell-routing-contract.js:222` | two-source | `options.classification` / `CALL_CELL_ROUTE_CLASSIFICATION.TERMINAL` | b | decision-bearing: an unclassified routing error silently becomes TERMINAL |
| 26 | N4c | `src/partition/partition-service-split-accessor-base.js:214` | two-source | `this.rebalancer?.controlPlaneSystemTableGateway` / `this.controlPlaneSystemTableGateway` | a | one dependency found through two wiring paths |
| 27 | N4c | `src/bootstrap/bootstrap-api-readiness-methods.js:109` | two-source | 4 locator paths for `controlPlaneReadinessService`, then `null` | a | service locator; the `null` arm ran in bootstrap and integration lanes |
| 28 | N4c | `src/debug-runtime/runtime-introspector.js:36` | two-source | `options.maxMemoryReadBytes` / `DEF.MAX_MEMORY_READ_BYTES` | e | declared default of an optional knob, in one place; witness: a debug-runtime test that omits the option |
| 29 | N4c | `src/transport/transport-query-semantic-outcome.js:67` | typeof | `options.service` with `sendMessage` / `null` | c | capability probe on a transport service |
| 30 | N4c | `src/raft/snapshot-transfer-receiver.js:120` | typeof | function identity source / constant wrapped as function | c | production passes a value (A ran in integration); the function form ran only in unit fixtures |
| 31 | N4c | `src/rebalancer/replica-operation-message-group-membership-permit.js:83` | catch | `JSON.parse` / `null` | b | malformed record collapsed into "absent" for identity, permit and claim decoders; non-JSON input does occur in integration |
| 32 | N4c | `src/node/replica-state-machine-leader-clear.js:72` | catch | canonical leader clear / record clear-debt + error + PERSISTENCE_ERROR event | e | owned continuation (debt map, deferred side effect); witness: a test that fails the clear write and proves the debt settles later |
| 33 | N5 | `src/logging/logs-table-service.js:147` | two-source | `options.retryDelayMs ?? config ?? LOGS_TABLE_DEFAULT.RETRY_DELAY_MS` | e | one precedence algorithm with a declared default; formation uses the default |
| 34 | N5 | `src/rebalancer/operation-lifecycle.js:449` | two-source | `options.term ?? currentProgress.term ?? evidence.ownerLease?.leaseTerm` | a | three sources for one progress term, the last answered in formation |
| 35 | N5 | `src/control-plane/publication-active-gate-handoff-contract-evidence.js:77` | two-source | `convergence[...] ?? publicationObservation[STATE] ?? membershipLifecycleSummary[...]` | a | three objects for one publication observation state |
| 36 | N5 | `src/wasm-service/wasm-service-models.js:113` | two-source | `budget[SERVICE_SIZE_LIMIT_BYTES]` / `DEFAULT_RESOURCE_BUDGET...` | e | declared default of an optional budget field at serialisation |
| 37 | N5 | `src/bootstrap/bootstrap-api.js:237` | two-source | `options.requestCellHttpAdapter` / `requestCellRoutingSurface.httpAdapter` | c | injection seam; VERIFIED no `src` caller passes the option; formation uses the owned adapter |
| 38 | N5 | `src/cdc/cdc-integration-service.js:71` | typeof | provider (Map or function) / `null` | b | a production construction without `partitionServicesProvider` exists (the null arm ran in formation); also two input shapes (d) |
| 39 | N5 | `src/service/call-cell-invoker.js:263` | typeof | `options.onInvocationTelemetry` / `null` | e | optional telemetry hook; passed through `bootstrap/shared/call-cell-invocation-setup.js:227`; whether any production caller supplies it was not traced: if none, it is c |
| 40 | N5 | `src/query/distributed/distributed-write-coordinator.js:452` | catch | write / typed failure answer (`errorCode`, typed write fields, `retryAfterMs`, `deferRetry`) | f | the catch is the typed-outcome conversion |

## Kind shares in the sample

| Bucket | n | a | b | c | d | e | f |
| --- | --- | --- | --- | --- | --- | --- | --- |
| N1 | 8 | 1 | 6 | 1 | 0 | 0 | 0 |
| N2 | 8 | 0 | 1 | 6 | 1 | 0 | 0 |
| N3 | 8 | 0 | 3 | 2 | 2 | 0 | 1 |
| N4 | 8 | 2 | 2 | 2 | 0 | 2 | 0 |
| N5 | 8 | 2 | 0 | 1 | 1 | 3 | 1 |
| All | 40 | 5 (13 %) | 12 (30 %) | 12 (30 %) | 4 (10 %) | 5 (13 %) | 2 (5 %) |

Caveat: with 8 sites per bucket, a share has a 95 % interval of roughly plus or minus 30 percentage points.
Treat the table as "which kinds dominate where", not as estimates to plan by. The shapes over the whole population
below are counts, not samples.

## Population shapes behind the sample (VERIFIED counts, INFERRED kind)

These are text classifications of the alternate arm at the head over all 2,596 still-valid sites (`bin/shape.mjs` logic,
regular expressions on the arm text). They support the sample's picture at full scale:

- Two-source N1 (698): the last term is a named constant in 416 (60 %) and a literal in 94 (13 %), for example `x || DEFAULT.Y`.
  These are default substitutions (b), not second sources. Only 184 (26 %) end in another read, the candidates for a, c or d.
  The detector counts `ADMIN_DEFAULT.NODE_ID` as a second "source" because it is a member expression on another object.
- Catch N1 (219): 159 return `null`, a boolean, `[]`, `{}`, `0` or nothing, and 142 of those are silent (no log).
  24 return an object with `success: false` or an outcome field: likely typed conversions (f) like #23 and #40.
- Typeof N1 (188): the alternate is `null` in 48, a stub function in 30 and the ambient clock or timers in 19.
  Clock and timer seams are c (one owned time source should be passed); `null` arms are b or c.
- Typeof N5 (127): 56 alternates are the ambient clock or timers. Formation runs without injected clocks, which is expected.
  These are c-style seams whose production arm is the "fallback".

Expected conclusion per bucket (INFERRED from sample plus shapes):
- **N1** is mostly b (silent defaults never needed), then c. Deleting the arm or making the input required is the default action.
  Error-path catches (#7, #8) are unproven rather than unnecessary. Each needs a typed outcome, not deletion alone.
- **N2** is mostly c: an injection seam or probe whose "primary" no lane uses. Delete the unused arm. Where it is inverted, delete
  the seam and keep the production arm (10 of the 33 are clock or timer seams).
- **N3** mixes b, c and d. The alternate exists for unit fixtures. Migrate the fixtures, then delete.
- **N4 and N5** hold most of the a (competing sources) and nearly all the e candidates. The trap experiment is needed here:
  the census cannot tell a legitimate optional default from a competing source answering because the primary failed.

## All 33 N2 sites (read in full)

Verdicts: "primary dead" means the typeof-function arm never ran in any lane, so the guarded capability is unused.
"Inverted" means the non-function arm is the production path and the function arm is an unused seam.

| Site | Verdict |
| --- | --- |
| `bootstrap/bootstrap-topology-snapshot.js:57` | inverted (clock) |
| `bootstrap/join-cleanup-handler.js:709` | primary dead (delegate never wired) |
| `bootstrap/node-joining-message-group-runtime-delegation.js:427` | inverted (timer) |
| `bootstrap/node-joining-owner-construction.js:193` | primary dead (`joinReadinessSnapshotProvider` never supplied) |
| `bootstrap/phases/seed-partitions-phase.js:651` | primary dead (third-tier probe, reached only in the bootstrap lane) |
| `bootstrap/shared/message-group-service-activation.js:73` | inverted (injected predicate unused; router-derived predicate is production) |
| `bootstrap/shared/message-group-service-activation.js:98` | primary dead (`resolveExtraFields` never supplied) |
| `bootstrap/shared/partition-service-activation.js:238` | inverted (default readiness predicate is production) |
| `bootstrap/shared/startup-sql-runtime-handoff.js:124` | primary dead (third term of a `||` chain) |
| `bootstrap/startup-workflow-store.js:176` | primary dead (duck-typed storage) |
| `bootstrap/traffic-readiness-utils.js:288` | inverted (clock) |
| `cache/cache-hydration-service.js:43` | inverted (clock) |
| `cdc/cdc-confirmation-tracker.js:73` | primary dead (optional predicate) |
| `config/dynamic-config-service.js:67` | inverted (clock) |
| `control-plane/control-plane-system-table-gateway-read-contracts.js:267` | primary dead (implicit BOOTSTRAP_SNAPSHOT inference) |
| `control-plane/control-plane-system-table-gateway-read-contracts.js:270` | primary dead (implicit CACHE inference) |
| `control-plane/control-plane-system-table-gateway-read-strategies.js:132` | primary dead (`cachePredicate` never a function) |
| `control-plane/control-plane-system-table-gateway-read-strategies.js:155` | primary dead (follows from :132) |
| `control-plane/control-plane-system-table-gateway-read-strategies.js:542` | primary dead (`readBootstrapSnapshot` hook, unit lane only) |
| `control-plane/membership-publication-coordinator-reconcile.js:651` | inverted (timer) |
| `control-plane/readiness-planning-semantic-currency-methods.js:173` | primary dead in all lanes (the probed service lacks the method; the method exists on the snapshot store: not traced which object `this.service` is) |
| `index-management/global-index-lifecycle-coordinator.js:738` | primary dead (`executeScatterGatherRead` never supplied) |
| `logging/logging-service.js:111` | inverted (clock) |
| `node/node-service.js:77` | inverted (clock) |
| `node/replica-state-machine-recovery.js:393` | production arm untested (only a reduced fixture reaches it) |
| `partition/managed-merge-workflow.js:514` | primary dead (`createExecutionTimeoutBudget` method never present) |
| `partition/partition-service-core-base.js:211` | primary dead at construction (`onSnapshotCatchupNeeded` not passed; the comment names a later construction site, not traced) |
| `query/sql-query-engine-instance-initializer.js:336` | inverted (injected provisioner unused) |
| `rebalancer/move-planner-state-methods.js:491` | primary dead (phantom method name, no definition in `src`) |
| `rebalancer/replica-operation-message-group-removal.js:645` | primary dead (`shutdownSource` never supplied) |
| `runtime/cell-host-call-protocol.js:323` | inverted (clock) |
| `runtime/request-cell-invocation-owner.js:700` | inverted (clock on the invocation) |
| `workflow/epoch-lazy-feature-backfill.js:50` | primary dead (`customAttributeExtractor` never supplied) |

Count: 20 primary dead or untested, 13 inverted (8 clock, 2 timer, 3 injected functions). None is a case where the detector's notion of
which arm is primary is semantically right *and* the primary is needed.
