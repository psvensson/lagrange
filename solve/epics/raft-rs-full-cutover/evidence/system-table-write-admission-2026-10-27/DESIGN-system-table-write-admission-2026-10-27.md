---
audience: development
documentClass: planning
---

# Design: system-table write admission at client SQL ingress (2026-10-27)

Lineage head H = `b3dc6141a4fe0caf9d16069dbe8aaf186005e06d`; every file:line below is measured at H.
Origin: D2 verification finding F1 (raw `UPDATE tables SET table_policies` is admitted at every client
ingress). No code and no commit have been made; this is the design the owner rules on.

Status keys used below:

- **DECISION-FREE** means the design follows from existing owners and contracts.
- **OWNER DECISION** means there is no owner or contract today. A default is proposed, but it must be
  ruled before implementation.

## 0. Measured facts the design rests on

- **The client contract.** Admin WS, pgwire, `InternalSqlAdapter`, the debug store and runtime-service
  `executeRequest` all enter through the canonical SqlRequest.
  - The path is `executeRequest` → `dispatchSqlRequest` SQL_STATEMENT → `this.executeQuery(...)`
    (`src/query/sql-query-engine-request-dispatch.js:77,113-153`).
  - The embedded application facade calls `sqlCore.executeQuery` directly, with frozen options
    carrying `APPLICATION_DATABASE_SESSION` (`src/query/application-database.js:184`;
    `src/query/application-database-statement-policy.js:6,20-39`).
- **The owner route.** The gateway reaches the engine only through in-process `executeQuery`:
  - `submitMutation` → `cdcIntegrationService.*SystemTableRow`
    (`control-plane-system-table-gateway-mutation-submission.js:242-310`);
  - → `executeSQL` → `writeRouter.execute` (`cdc-integration-service-lifecycle.js:284-309`);
  - → `sqlQueryEngine.executeQuery` (`cdc-routed-mutation-readiness.js:599`).
  - The gateway's SQL fallback (`control-plane-system-table-gateway-query-execution.js:372`) and
    `gateway.executeQuery` (`:411`) take the same route.
- **Runtime services already cannot write system tables.** A system-table grant is refused
  (`runtime-access-policy-owner.js:25-27,211`), and `authorizeStatement` denies any write without a grant
  (`:643-668`). This is the existing precedent for refusing a system-table write at a client ingress.
- **No system-table write admission exists on the engine write path.** `isSystemTable`
  (`sql-query-engine-table-routing-methods.js:482`) does an exact match only, and is used for retry
  classification and delivery priority.

## 1. Owner-shaped admin operations for the raw-SQL production writers

Shared shape for every operation:

- **Surface.** Each operation is an admin REST route on the existing fastify server, next to the
  debug and test-run routes (`src/admin/admin-websocket-api-base.js:405-470`; routes are declared in
  `ADMIN_ROUTE`, `src/admin/admin-constants.js:9-37`).
  - The CLI already connects to that server's host:port for `/api/admin/stream`
    (`src/cli/core/connection-manager.js:141-174`).
  - The distributed harness already issues HTTP to the same port
    (`test/distributed/harness/cluster-node-handle-layer.js:1028-1030`, `httpRequest`).
  - Routes pass through the same admin auth middleware as the debug routes.
- **Answer.** One envelope: `{success, outcome, errorCode?, error?, retryAfterMs?, ...ownerFields}`.
  `outcome` is a named state (R07): `applied | refused | owner_not_ready`.
- **Owner availability.** The admin API receives each owner as a *provider* function, resolved at
  call time, in the same pattern as `partitionServicesProvider`
  (`src/entrypoint-runtime-admin-composition.js:178-181`).
  - Owners are created after the admin API; for example, `TablePolicyService` is created during
    join (`node-joining-publication-activation.js:198`).
  - Dynamic-config wiring can fail with only a warning
    (`entrypoint-runtime-shutdown-lifecycle.js:164-170`).
  - An absent owner answers `outcome: owner_not_ready`, `errorCode: ADMIN_OWNER_NOT_READY` (HTTP 503,
    retryable). It never falls back to SQL.
- **Typed owner errors.** The owners below throw untyped `Error(message)`. Each operation needs the
  owner to throw a coded error (`error.code`). That is a small owner change, listed per operation.
  The admin route maps codes to HTTP status and never parses messages.

### 1a. Config set (DECISION-FREE)

| Item | Value |
| --- | --- |
| Route | `PUT /api/admin/config/:configKey`; body `{value, valueType?}` |
| Owner | `DynamicConfigService.set(key, value, updatedBy)` (`src/config/dynamic-config-service.js:253-323`): it validates (`validateValue`, `:506`), then UPDATE or INSERT through `getControlPlaneSystemTableGateway().submitMutation` (`:270-305`). The instance comes from `createDynamicConfigStartupWiring` (`src/config/dynamic-config-startup-wiring.js:248-258`, called at `entrypoint-runtime-shutdown-lifecycle.js:166`). `updatedBy` = `admin:<authenticated principal>` |
| Answer | `{success:true, outcome:'applied', key, value, requiresRestart}`; this is the owner's own return (`:317-322`) |
| Refusals | `CONFIG_VALUE_INVALID` (400): the owner must code its validation throw at `:256-258`, today `INVALID_VALUE_PREFIX`, `config-constants.js:79`. `CONFIG_KEY_REQUIRED` (400). `ADMIN_OWNER_NOT_READY` (503). Gateway failures pass through with the gateway outcome (`CONTROL_PLANE_MUTATION_OUTCOME`) |
| CLI migration | `executeConfigUpdate` (`src/cli/admin-cli-action-methods.js:345-391`) stops building `UPDATE config SET ...` (`:354-355`, which is also string-interpolated SQL) and calls a new `connectionManager.putConfig(key, value, type)`. The result handler is kept (status line plus `requestCacheDump`) |
| Also migrates | `docs/adaptive-timing-resource-diagnostics-runbook.md:46-137` (about 20 `UPDATE config` statements): rewrite as `PUT /api/admin/config/<key>` calls, or as the CLI config edit |

### 1b. Node drain / activate (OWNER DECISION)

What the code shows:

- **`status='draining'` from the CLI is a bare column write that no owner consumes, and it is
  overwritten within one heartbeat.**
  - The CLI writes `UPDATE nodes SET status = ?1 WHERE node_id = ?2`
    (`src/cli/admin-cli-action-methods.js:471-482`, from `admin-cli-navigation-methods.js:294,297`).
  - The heartbeat owner republishes the node's own row with `status: withholdReadyPromotion ? JOINING
    : ACTIVE` on every beat (`src/control-plane/heartbeat-service-publication-methods.js:128-130`;
    the interval is 5 s, `src/node/node-constants.js:99`). The written `draining` therefore flaps
    back to `active`.
  - The only row reader of `draining` is join mesh connectivity, which skips peers in
    `MESH_INELIGIBLE_NODE_STATES` (`src/bootstrap/join-readiness-evaluator.js:34-39`;
    `join-readiness-mesh-connectivity-methods.js:69-128`).
- **The real drain contract is node-local and owned by the node's lifecycle.**
  - The owner is `MembershipLifecycleController.submitDrainIntent`
    (`src/control-plane/membership-lifecycle-controller.js:185-204,243-253`; delegate
    `onDrainIntent`, wired at `entrypoint-runtime-join-startup-policy.js:81-84`), plus
    `bootstrapAPI.markDraining` → `lifecycle-controller.beginDrain`
    (`src/bootstrap/lifecycle-controller.js:406-420`).
  - The only trigger is shutdown (`src/entrypoint-runtime-shutdown-lifecycle.js:296-309`).
  - Both state machines are one-way: node `READY → DRAINING → STOPPED`
    (`node-lifecycle-state-machine-constants.js:33-38`); membership `DRAINING → REMOVED | PROVISIONING`
    (`membership-lifecycle-constants.js:220-223`).
  - **No "activate" (undrain) contract exists anywhere.**
- **Which owner should own it.** The target node's `MembershipLifecycleController`. A cluster-wide
  `nodes.status` column is the heartbeat owner's publication, not a command input.

Proposed default (needs the owner's ruling):

| Item | Value |
| --- | --- |
| Route | `POST /api/admin/nodes/:nodeId/drain`; body `{drainDeadlineMs?}` |
| Owner | When `nodeId` is the serving node: `membershipLifecycleController.submitDrainIntent({drainDeadlineMs, reasonCode: 'admin_drain'})`, falling back to `bootstrapAPI.markDraining` exactly as the shutdown path selects (`entrypoint-runtime-shutdown-lifecycle.js:300-309`) |
| Answer | `{success:true, outcome:'applied', nodeId, intent}` (the drain intent snapshot) |
| Refusals | `NODE_DRAIN_REMOTE_UNSUPPORTED` (409) when `nodeId` is not the serving node: the CLI must connect to the node it drains. Routing a drain to a remote node would be a new message contract (OWNER DECISION, not proposed here). `NODE_DRAIN_NOT_ALLOWED` (409) when the lifecycle transition is invalid (not READY / PUBLISHED_ACTIVE). `ADMIN_OWNER_NOT_READY` (503) |
| Activate | **Delete the `activate` CLI command** (`admin-cli-navigation-methods.js:297`). No undrain contract exists, and the command writes a value the heartbeat already writes. Inventing an undrain transition is an owner decision |
| CLI migration | `updateNodeStatus` (`admin-cli-action-methods.js:471-482`) becomes `drainNode(nodeId)` → `connectionManager.postNodeDrain(nodeId)`. `executeNodeManagementQuery` (`:398-464`) stops taking SQL and takes a request function; its `affectedRows < 1` "not found" test (`:428-432`) becomes the typed refusal |

### 1c. Node remove (OWNER DECISION on the guard; the route is decision-free)

- `NodeLifecycleService.removeNode` (`src/node/node-lifecycle-service.js:238-270`, gateway DELETE)
  **is not constructed in production**: it is only exported (`src/node/index.js:8`).
- The production-wired owner of the `nodes` rows is `NodesOwner.removeNode` →
  `deleteByPrimaryKey` → gateway (`src/control-plane/owners/nodes-owner.js:47-49`;
  `system-metadata-owner-base.js:510`). It is created by `createSystemMetadataOwners`
  (`create-system-metadata-owners.js:36`) and reachable through the membership publication runtime
  owner (`membership-publication-runtime-owner.js:61-62`).
- Removing the row of a **live** node is inert: its heartbeat re-publishes the row (insert path
  `membership-publication-runtime-owner.js:161-164`). Remove is only meaningful for a terminal node.

| Item | Value |
| --- | --- |
| Route | `DELETE /api/admin/nodes/:nodeId` |
| Owner | `nodesOwner.removeNode(nodeId)`. Before it, the owner reads the row and refuses unless its status is terminal (`stopped`/`failed`, `NODE_STATE`, `src/constants/node-state.js:10-22`) |
| Answer | `{success:true, outcome:'applied', nodeId, affectedRows}` |
| Refusals | `NODE_NOT_FOUND` (404; replaces the CLI's `affectedRows < 1` test). `NODE_REMOVE_NODE_LIVE` (409; non-terminal status. OWNER DECISION: should the guard also require the ready lease to have lapsed?). `ADMIN_OWNER_NOT_READY` (503) |
| Decision to record | Delete `NodeLifecycleService` as dead (no-legacy rule), or wire it as the owner; the default is to delete it and use `NodesOwner` |
| CLI migration | `removeNode` (`admin-cli-action-methods.js:487-497`) → `connectionManager.deleteNode(nodeId)` |

### 1d. Table policy (DECISION-FREE)

| Item | Value |
| --- | --- |
| Route | `PATCH /api/admin/tables/:tableId/policy`; body `{policy}`, merged as overrides |
| Owner | `TablePolicyService.updateTablePolicy(tableId, policyUpdates)` (`src/policy/table-policy-service.js:299-376`): validate, merge, then gateway UPDATE `tables.table_policies` (`:340-353`). The instance is `owner.tablePolicyService` (`entrypoint-runtime-admin-composition.js:397`), passed as a provider |
| Answer | `{success:true, outcome:'applied', tableId, policy}` (the owner's return, `:363-367`) |
| Refusals | `TABLE_ID_REQUIRED` (400). `TABLE_POLICY_INVALID` (400; the owner codes its throws at `:309-311` and `:323-327`). `TABLE_NOT_FOUND` (404; `readTableRow` returns null, `:622-640`). `ADMIN_OWNER_NOT_READY` (503). On the D2 branch, `external_cdc_unsupported` is added by `assertTablePolicyCdcRequestSupported` at `:310`; the route passes it through as 400. Coordination: D2 owns that line, and this unit only adds codes to the existing throws |
| Consumers | Harness (section 4); the CLI tables view only reads (`src/cli/views/tables-view.js:168,341`) |

### 1e. PG-wire listener scale (OWNER DECISION; found during the census)

- `architecture/postgres-wire.md:89-104` documents scaling `sys-postgres-wire` as "raise
  `replica_count` in `service_definitions`". The harness performs it as raw SQL through the admin
  WS (`test/distributed/scenarios/public-seam-durability-client.js:53-55,237`) and through the
  application facade (`test/integration/helpers/public-binding-seam-harness.js:73-75,239`).
- No owner command exists. `SERVICE_LIFECYCLE_COMMAND` is call_binding, configure_service_access,
  create_binding, install, remove, show, upgrade (`src/service/service-lifecycle-command-contract.js:5-14`),
  and `ServiceDefinitionsOwner` has no scale method
  (`src/control-plane/owners/service-definitions-owner.js:26-242`).
- Proposed default: a lifecycle SQL command `SCALE SERVICE $1` (JSON payload
  `{serviceId, replicaCount, runtimeConfig?}`). It joins the existing parameterized lifecycle grammar
  (`service-lifecycle-sql-contract.js`) and is handled by `tryExecuteServiceLifecycleSql`
  (`request-dispatch.js:119-130`) **before** `executeQuery`, so it is not a system-table write at the
  client ingress. Owner: `ServiceDefinitionsOwner.scaleServiceDefinition` (new) → gateway UPDATE.
  Refusals: `service_lifecycle_invalid_payload`, `SERVICE_NOT_FOUND`, `SERVICE_SCALE_INVALID_COUNT`.
  pgwire authorization adds `PGWIRE_AUTH_ACTION.SERVICE_SCALE`, mapped as at
  `postgres-wire-adapter.js:47-65`.
- The architecture paragraph is rewritten to name the command.

### 1f. Example: affinity demo (DECISION-FREE)

`examples/service-data-affinity/run-affinity-demo.js:146-157,502-560` INSERTs into `config` (a
runtime access policy row) and `service_definitions` through the admin query. Replacement:

- the access policy row → `CONFIGURE SERVICE ACCESS` (lifecycle command `configure_service_access`,
  owner `RuntimeAccessPolicyOwner.configureBindingAccess`, `runtime-access-policy-owner.js:555`);
- the definition row → `INSTALL SERVICE` (lifecycle `install_service`).

## 2. DebugMetadataStore migration to the in-process owner route (DECISION-FREE)

- Today `DebugMetadataStore.executeSql` builds a SqlRequest and calls
  `sqlQueryEngine.executeRequest` (`src/debug-runtime/debug-metadata-service.js:643-669`). Its
  writes are `upsertRow` = `INSERT OR REPLACE` into `debug_sessions`, `debug_breakpoints`,
  `debug_snapshots` (`:162,214,406,533,675-690`). These are system tables
  (`system-table-schema-shared-constants.js:55-57`), so the admission would refuse them.
- Change: the store is the owner of the `debug_*` tables. Its writes go through the gateway
  (`submitMutation` with `UPSERT`; the gateway accepts UPSERT for every table except `services`,
  `control-plane-system-table-gateway-query-execution.js:220-229`). Its reads go through
  `gateway.readAuthoritativeRows` (`:449`).
  - `executeSql` is replaced by two calls: `upsertRow` → `gateway.submitMutation({operation: UPSERT,
    tableName, row})` and reads → `gateway.readAuthoritativeRows(tableName, sql, params)`.
  - Tenant scoping stays in the row (`tenant_id` column) and in the WHERE clause, as today.
  - The store's authorization (`authorizeRequest`, `:182,306`) is unchanged.
- `admin-websocket-api-base.js:145-148`: construct
  `new DebugMetadataStore({controlPlaneSystemTableGateway: this.controlPlaneSystemTableGateway})`.
  `this.controlPlaneSystemTableGateway` is resolved at `:135-138`.
  - The late-binding path `admin-websocket-lifecycle-methods.js:100-112` (`setSqlQueryEngine`)
    becomes `setControlPlaneSystemTableGateway`. The store no longer needs the engine at all.
  - `createSqlRequest` (`debug-metadata-service.js:120`) is deleted.
- Rejected alternative: switching to in-process `executeQuery`. It works, but it keeps a second
  raw-SQL writer outside the gateway, which is what F1 objects to.

## 3. The admission (DECISION-FREE once 1a-1f land)

### 3.1 Placement

- In `executeQuery`, directly after `enforceApplicationDatabaseStatementPolicy` and **before**
  `admitParsedStatement` (`src/query/sql-query-engine-statement-execution.js:448-457`):

  ```
  applicationStatementDecision ... (:448-452)
  const systemTableWriteDecision = admitClientSystemTableWrite(ast, options);   // new
  if (systemTableWriteDecision.state === SYSTEM_TABLE_WRITE_ADMISSION.REFUSED) {
    return systemTableWriteDecision.failure;
  }
  const admission = admitParsedStatement(...)                                    (:453-457)
  ```

- Why before `admitParsedStatement`: the refusal touches no transaction state. It is the same
  position and the same discipline as `TRANSACTION_CONTROL_RESERVED`.
- Coverage: an explicit transaction (each statement passes `executeQuery`), pgwire extended protocol
  (each Execute is a SqlRequest), and the application facade transaction queue
  (`application-database.js:407-425`).
- `EXPLAIN DISTRIBUTED` (`:399-407`) is read-only and is not affected.

### 3.2 Ingress classification (a named state, R07)

New module `src/query/sql-statement-ingress.js`:

- `STATEMENT_INGRESS = {CLIENT: 'client', IN_PROCESS_OWNER: 'in_process_owner'}`.
- `CLIENT_STATEMENT_INGRESS = Symbol('clientStatementIngress')`.
- `resolveStatementIngress(options)` returns `CLIENT` when any of these holds:
  - `options[CLIENT_STATEMENT_INGRESS] === true`, set by the SqlRequest dispatch;
  - `isApplicationDatabaseSession(options)`: a new exported predicate in
    `application-database-statement-policy.js`. It is the one reader of the module-private
    `APPLICATION_DATABASE_SESSION` symbol, so the symbol is never re-exported;
  - `typeof options.issuingServiceId === 'string'`: runtime-service SQL, already refused by the
    runtime policy; classified here so the vocabulary is one.

  Otherwise it returns `IN_PROCESS_OWNER`.

The marker is set at the single SqlRequest dispatch, in the options literal at
`sql-query-engine-request-dispatch.js:140-152`: add `[CLIENT_STATEMENT_INGRESS]: true`. Every
SqlRequest ingress is covered by construction:

- admin WS `admin-websocket-query-execution-methods.js:399`;
- pgwire `src/query/pg/postgres-wire-adapter.js:231`;
- `internal-sql-adapter.js:84`;
- `wasm-call-adapter.js:111` (PARTITION_CALLBACK, SELECT only);
- runtime `request-cell-invocation-owner.js:65` and `lifecycle-and-callback-dispatch.js:444`;
- the debug store, until section 2 removes it.

No caller can set or omit the marker for a SqlRequest.

The admitted route is in-process `SQLQueryEngine.executeQuery` without a client classification. It
is the route the gateway uses (section 0). The marker is set by the engine's own client entry, never
by the caller, so this is not a bypass flag: an in-process owner does not opt in, a client cannot
opt out.

**Residual (named, not solved here).** In-process callers that write system tables through
`executeQuery` without the gateway are admitted by this design:

- `query-system-state-phase.js:682`
- `artifact-payload-store-setup.js:67`
- `call-cell-invocation-setup.js:175,189`
- lifecycle `executeInternal` (`sql-query-engine-lifecycle-and-callback-dispatch.js:438-442`)
- `migration-coordinator.js:353`
- `meta-write-executor.js:31` (no src caller: delete it under the no-legacy rule)

A gateway-only admission requires migrating them first. That is a separate unit and needs an owner
ruling.

### 3.3 Target resolution (fail closed)

- `admitClientSystemTableWrite(ast, options)` returns ADMITTED unless the ingress is CLIENT and
  `ast.type ∈ {INSERT, UPDATE, DELETE}`.
- For those statements, the target is `ast.table` (the field the write path routes on,
  `sql-query-engine-write-execution.js:254,352`).
  - A missing or non-string target is REFUSED (fail closed).
  - The name is canonicalized exactly once: strip `global.`, lower-case. This is the rule of
    `canonicalTableIdentity` (`runtime-access-policy-owner.js:352-362`).
- One version of the logic: extract `canonicalSystemTableName(name)` and
  `isSystemTableName(name)` next to `SYSTEM_TABLE_NAME`
  (`src/bootstrap/system-table-schema-shared-constants.js`). Both of these then consume it:
  - `runtime-access-policy-owner.js` (`SYSTEM_TABLE_IDENTITIES`, `:25-27`, becomes derived from it);
  - `sql-query-engine-table-routing-methods.js:482` (`isSystemTable`, today an exact match).

  No third copy is created.
- `CREATE TABLE` / `ALTER TABLE` naming a system table are out of scope (the brief scopes DML).
  They are recorded as a follow-up finding.

### 3.4 Refusal

- `QUERY_ERROR_CODE.SYSTEM_TABLE_WRITE_REFUSED: 'SYSTEM_TABLE_WRITE_REFUSED'` (`src/query/query-constants.js:51-108`).
- `QUERY_ERROR_MSG.SYSTEM_TABLE_WRITE_REFUSED: 'system tables are written only by their owners'`.
- Answer: `{success:false, errorCode:'SYSTEM_TABLE_WRITE_REFUSED', error, reasonCode:'client_ingress', tableName}`.
  It is frozen, mirroring `enforceApplicationDatabaseStatementPolicy`.
- Per surface:
  - **pgwire.** Add `PG_ERROR_CODE.INSUFFICIENT_PRIVILEGE: '42501'`
    (`src/runtime/pgwire-protocol-constants.js:104-117`), and
    `[QUERY_ERROR_CODE.SYSTEM_TABLE_WRITE_REFUSED, PG_ERROR_CODE.INSUFFICIENT_PRIVILEGE]` in
    `SQLSTATE_BY_ENGINE_ERROR_CODE` (`src/runtime/pgwire-result-mapper.js:120-127`).
  - **Application facade.** It passes the engine code through `translateQueryFailure`
    (`application-database.js:151-178`), so the error's `code` is `SYSTEM_TABLE_WRITE_REFUSED`.
  - **Admin WS.** The `query_result` carries the `errorCode` unchanged.

## 4. Harness, test and example migration list

One owner-provided helper (fixtures.md, System-Table Mutation Test Requirements): a
`ClusterNodeHandle.updateTablePolicy(tableId, policy)` in
`test/distributed/harness/cluster-node-handle-layer.js`. It calls `PATCH /api/admin/tables/:tableId/policy`
with `httpRequest` and returns the typed answer. Every table-policy writer below consumes only this
helper.

| # | Site | Raw write | Replacement |
| --- | --- | --- | --- |
| 1 | `test/distributed/scenarios/table-distribution-helpers-table-bootstrap.js:968-1010` (`prepareBenchmarkPartitioningTable`) | `UPDATE tables SET table_policies` via `queryControl` | `seedNode.updateTablePolicy(ensured.tableId, tablePolicies)`. Drop the re-apply-until-stable loop's SQL. Keep the read-back via the owner's answer plus the existing visibility poll |
| 2 | `table-distribution-helpers-control-query.js:137-139,1119-1121` | SQL constants | delete the constants |
| 3 | `table-distribution-helpers-distribution-query.js:63-65,1234-1236`, `table-distribution-helpers-load-node-planning.js:62-64,1181-1183` | re-export of the constants | delete the re-exports |
| 4 | `user-table-topology-helpers.js:34-36,108-110,220-224` | builds `UPDATE tables SET table_policies` | helper |
| 5 | `postgres-baseline-comparison-constants-and-imports.js:633-641,1403` (`buildBenchmarkTablePolicySql`), consumed at `postgres-baseline-comparison-benchmark-table-load.js:640-646` | table policy | helper |
| 6 | `postgres-baseline-comparison-constants-and-imports.js:623-631,1402` (`buildBenchmarkPartitionRepairSql`), consumed at `postgres-baseline-comparison-benchmark-table-load.js:647-653` | **invented** `UPDATE partitions SET table_name` "repair" (no owner; `partitions.table_name` is written by table creation) | **Delete** the repair and `repairNodeId`. Replace it with a read-back assertion that every `partitions` row for `table_id` carries `table_name`. A missing name is a product finding (fail), never a repair |
| 7 | `test/distributed/scenarios/public-seam-durability-client.js:53-55,237`; `test/integration/helpers/public-binding-seam-harness.js:73-75,239` | `UPDATE service_definitions SET replica_count, runtime_config` | `SCALE SERVICE` (1e); blocked on that ruling |
| 8 | `test/distributed/scenarios/admin-query-smoke.js:13-15` | `INSERT INTO logs` via admin WS | the smoke writes and reads a scenario-created user table (CREATE TABLE + INSERT + SELECT) |
| 9 | `test/distributed/scenarios/network-partition-split-brain.js:61-65` (`INSERT_LOG_QUERY`) | `INSERT INTO logs` as the write probe | same: a scenario user table. Update `__tests__/network-partition-split-brain-scenario.test.js` |
| 10 | `examples/service-data-affinity/run-affinity-demo.js:146-157,502-560` | `INSERT INTO config` / `service_definitions` | lifecycle `CONFIGURE SERVICE ACCESS` / `INSTALL SERVICE` (1f) |
| 11 | `docs/adaptive-timing-resource-diagnostics-runbook.md:46-137` | operator `UPDATE config` | `PUT /api/admin/config/:key` (1a) |
| 12 | `architecture/postgres-wire.md:89-104` | documented raw scale | the 1e command |

Stub-matching unit tests. They change only because the helpers stop emitting SQL: their fake
handles switch from matching SQL text to recording `updateTablePolicy` calls.

- `test/distributed/harness/__tests__/`:
  - `seven-node-table-partition-distribution-scenario.test.js:11,80`
  - `seven-node-read-write-load-transaction-recovery-scenario.test.js:14,84,365,560,738,911,1075,1275`
  - `boundary-transition-scenarios.test.js:297`
  - `user-table-leader-placement-spread-scenario.test.js:69`
  - `public-path-multinode-baseline-scenario.test.js:124,133,435`
  - `table-distribution-helpers-scenario-policy.test.js`
  - `load-generator.test.js`
  - the `postgres-baseline-comparison-*` family (17 files; for `UPDATE partitions SET table_name` the
    stubs are deleted with item 6)
- Integration stubs for the same repair statement, deleted with item 6:
  - `test/integration/benchmark-system-table-read-path.integration.test.js:217,253`
  - `strict-benchmark-local-readiness.integration.test.js:209`
  - `strict-load-lane-table-probe.integration.test.js:162`
  - `strict-preload-pressure-reproducer.integration.test.js:163`
  - `versioned-cdc-readiness-convergence.integration.test.js:186`

Unaffected, because they are in-process owner route or raw SQLite and not client ingress:

- `test/query/sql-query-engine-distributed-transactions.test.js:428,596` (`engine.executeQuery`);
- `message-group-learner-recipient.integration.test.js` (`fx.f.execute` on the fixture partition);
- `test/node/runtime-service-bound-route.test.js` (`metadata.db.prepare`);
- the about 140 other test files that write system tables directly to partition services or through
  in-process `executeQuery`.

## 5. Witnesses (each red on base H, green after)

| Ingress | Witness | Assertion |
| --- | --- | --- |
| Engine, SqlRequest dispatch | `test/query/sql-query-engine-system-table-write-admission.test.js` (new) | For each of INSERT, UPDATE and DELETE on `tables`, plus `TABLES` and `global.nodes` spellings: `executeRequest` answers `errorCode SYSTEM_TABLE_WRITE_REFUSED`. The partition-routed write spy is never called (`executePartitionRoutedWrite` call count 0), and the row read back is unchanged. In an explicit transaction, `BEGIN` → refused UPDATE → the transaction is still open and its state is unchanged |
| Engine, owner route | same file | The same UPDATE through in-process `executeQuery` (no marker) reaches the routed write; `gateway.submitMutation` on `tables` applies and the row changes |
| User table | same file | `executeRequest` INSERT/UPDATE/DELETE on a user table succeed with unchanged results |
| Admin WS | `test/admin/admin-websocket-api-http-and-debug-routes.test.js` (extend) | WS `query` `UPDATE tables SET table_policies ...` → `query_result` carries `SYSTEM_TABLE_WRITE_REFUSED` and the cache row is unchanged. `PATCH /api/admin/tables/:id/policy` → applied, with exactly one `submitMutation` on `tables` |
| Admin owner routes | same file + `test/cli/index.test.js` | config PUT → `DynamicConfigService.set` (1 gateway mutation); invalid value → `CONFIG_VALUE_INVALID`, 0 mutations. Drain on the local node → `submitDrainIntent` called; remote → `NODE_DRAIN_REMOTE_UNSUPPORTED`. Remove a live node → `NODE_REMOVE_NODE_LIVE`, 0 mutations; terminal node → applied. CLI commands send REST requests and **no** `sendQuery` SQL |
| pgwire | `test/runtime/pgwire-result-mapper.test.js` (extend) + `pgwire-protocol-handler.test.js` | `SYSTEM_TABLE_WRITE_REFUSED` maps to SQLSTATE `42501`; an end-to-end simple query `DELETE FROM nodes` gives ErrorResponse 42501 and no CommandComplete |
| Application facade | `test/query/application-database.test.js` (extend) | `db.query('UPDATE tables ...')` rejects with `code SYSTEM_TABLE_WRITE_REFUSED`; in `transaction(cb)` the refusal fails the callback and leaves no write |
| Debug store | `test/debug-runtime/*debug-metadata*` (extend) | `upsertRow` performs exactly one gateway UPSERT and no `executeRequest` call |
| Table policy, fixtures.md item 2 | integration test on a 3-node formation | the admin-route policy update becomes visible through `SystemTableCache` on every node |
| Harness helper | `test/distributed/harness/__tests__/table-distribution-helpers-scenario-policy.test.js` | `prepareBenchmarkPartitioningTable` calls `updateTablePolicy` once per apply and issues no SQL write |

## 6. Staging into reviewable commits

Every commit keeps the tree green and the CLI working.

| # | Commit | Content | Estimated size |
| --- | --- | --- | --- |
| C1 | admin owner operations + CLI migration | `ADMIN_ROUTE` additions; 3-4 handlers (config, table policy, node remove, local drain); owner providers in `entrypoint-runtime-admin-composition.js:165-182`; typed codes in `DynamicConfigService.set` and `TablePolicyService.updateTablePolicy`; CLI `connection-manager` REST calls; CLI action rewrite and `activate` deletion; `NodeLifecycleService` deletion (if ruled); tests | src ~350, test ~300 |
| C2 | DebugMetadataStore through the gateway | `debug-metadata-service.js`, `admin-websocket-api-base.js:145-148`, `admin-websocket-lifecycle-methods.js:100-112`; tests | src ~80, test ~80 |
| C3 | consumers off raw SQL | harness helper `updateTablePolicy`; items 1-6, 8-11 of section 4; stub updates; affinity demo; runbook | test ~400 (net negative from item 6), docs ~60 |
| C3b | PG-wire scale command (only after the 1e ruling) | lifecycle grammar + owner + pgwire auth action + item 7 + architecture doc | src ~150, test ~150 |
| C4 | the admission | `sql-statement-ingress.js`; `canonicalSystemTableName`/`isSystemTableName` (with both consumers moved onto it); the check at `statement-execution.js:448-457`; marker at `request-dispatch.js:140-152`; `isApplicationDatabaseSession`; `SYSTEM_TABLE_WRITE_REFUSED` + SQLSTATE 42501; witnesses (section 5) | src ~120, test ~350 |

- Order: C1 → C2 → C3 (→ C3b) → C4. The admission lands last, so no intermediate commit refuses a
  write that a production path or the harness still issues.
- C4 alone is the owner-boundary contract change. C1-C3 are each reviewable without it.
- Total ≈ 0.7k src, 1.3k test (about 1.6k net after deletions), one Quest
  (owner-boundary contract), five owner rulings:
  1. remote drain and activate deletion (1b);
  2. the node-remove guard and the `NodeLifecycleService` deletion (1c);
  3. the PG-wire scale command (1e);
  4. client-ingress vs gateway-only admission (3.2 residual);
  5. CREATE/ALTER on system tables (3.3 follow-up).
- Proof per commit: owning tests before and after with leaves; eslint and `node --check`; scoped
  complexity; ratchets (unused-exports: `NodeLifecycleService` and `meta-write-executor` deletions
  lower it); metadata and shards (`test/shards/*.json` list both scenario files); lab on a free host
  with `--base-sha` H.
- Coordination:
  - D2 touches `table-policy-service.js:310`; C1 adds codes only to the existing throws. Merge after
    D2, or rebase onto it.
  - No CDC files are touched.
  - No query/distributed recovery files are touched (the TX1 area).
