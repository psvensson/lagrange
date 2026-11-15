---
audience: evidence
recorded: 2026-11-15
quest: comparative-campaign-explicit-provisioning
---

# Post-Closure Applicability & Repair Record (`2026-11-15`)

- **Branch:** `wip/order1-comparative-provisioning-20261115`
- **Scope:** Post-closure hardening and review repairs following the initial closure of `comparative-campaign-explicit-provisioning` (`d406588e45c42a492e759773e87e2277f5077c32` / `4301d9b6ba8ef0c9cd93d2d5d7e3b46aa9a82716`).

## 1. Concurrent Joiner/Standby Startup Ownership Before Cleanup

- **Files:**
  - `test/distributed/harness/real-product-deployer-lagrange.js`
  - `test/distributed/harness/real-product-deployer-postgres.js`
  - `test/distributed/harness/__tests__/comparative-benchmark-generated-commands.test.js`
- **Contract:**
  - Every joiner (`formLagrangeCluster`) and standby (`startStandbys` / `formPostgresCluster`) records its container role into the shared `roles` array immediately upon `docker run -d` container creation.
  - Concurrent joiner startup uses `Promise.allSettled` with a shared `cancelled` flag so no in-flight `docker run -d` can complete after `deployCluster` returns to `runComparativeCampaign`'s `finally { removeCampaignContainers(...) }` block.
  - Any startup failure attaches the complete `roles` ledger to the thrown error before rethrowing, guaranteeing zero orphaned campaign containers on partial startup failure.

## 2. Explicit Cohort-Preserving Dataset Reset & Canonical Schema + Index Validation

- **Files:**
  - `test/distributed/reference-client/lagrange-oltp-adapter.js`
  - `test/distributed/harness/__tests__/benchmark-cohort-preserving-dataset-reset.test.js`
- **Contract:**
  - Removed the `DROP TABLE` -> `TRUNCATE TABLE` error-substring fallback (`Unsupported statement type: DROP_TABLE`) and removed fabricated `PROVISIONING_OUTCOME.ROUTABLE` entries with `states: []`.
  - Canonical OLTP schema expectations (`CANONICAL_TABLE_COLUMNS`, `CANONICAL_TABLE_PRIMARY_KEYS`, and `CANONICAL_REQUIRED_INDEXES`, including `idx_orders_customer_latest` on `orders (warehouse_id, district_id, customer_id, order_id)`) and `CANONICAL_SCHEMA_SHA256` are derived directly from `CREATE_SCHEMA`.
  - Dataset preparation branches explicitly on `lockingReadMode`:
    - Native PostgreSQL (`native-for-update`): drops existing tables via `DROP TABLE IF EXISTS`, executes `CREATE_SCHEMA`, validates all 9 canonical tables and `idx_orders_customer_latest` in `pg_indexes`, and loads the baseline dataset.
    - Lagrange (`snapshot-write-conflict`):
      - `0` existing tables (fresh cohort): executes `CREATE_SCHEMA`, validates all 9 canonical tables and `idx_orders_customer_latest` in `indices`, and loads the baseline dataset.
      - `9` existing tables (retained cohort): validates all 9 canonical tables (`SELECT <canonical_cols> FROM <table> LIMIT 1`) AND validates `idx_orders_customer_latest` in `indices` (`index_name`, `table_name = 'orders'`, `column_names = ['warehouse_id', 'district_id', 'customer_id', 'order_id']`, non-failed `state`) BEFORE executing `TRUNCATE TABLE` across all 9 tables, observing real `TABLE_PRESENT` states, and recording `OLTP_DATASET_RESET_OUTCOME.RESET_AND_ROUTABLE` with `schemaSha256: CANONICAL_SCHEMA_SHA256`.
      - Partial table presence (`1..8` tables), missing/mismatched columns, or missing/mismatched `idx_orders_customer_latest` (such as an interrupted initial `CREATE_SCHEMA` that stopped after creating the 9 tables and before `CREATE INDEX`) fails closed with `error.code = OLTP_DATASET_RESET_OUTCOME.SCHEMA_MISMATCH` (`'schema-mismatch'`) without executing any `TRUNCATE TABLE`.

## 3. Readiness Budget, Shared Formation Deadline & Cold-Formation Constants

- **Files:**
  - `test/distributed/harness/real-product-deployment-contract.js`
  - `test/distributed/harness/real-product-readiness.js`
  - `test/distributed/harness/real-product-remote-shell.js`
  - `test/distributed/harness/real-product-sql-clients.js`
  - `test/distributed/harness/real-product-deployer-lagrange.js`
  - `test/distributed/harness/real-product-deployer-postgres.js`
  - `test/distributed/harness/real-product-deployer-tidb.js`
  - `test/distributed/harness/real-product-exhausted-deployment.js`
  - `test/distributed/harness/real-product-campaign-cleanup.js`
  - `test/distributed/harness/comparative-benchmark-campaign-runner.js`
  - `test/distributed/harness/comparative-benchmark-semantic-gate.js`
  - `test/distributed/harness/comparative-benchmark-workload-runner.js`
  - `test/distributed/scenarios/scenario-a-semantic-proof-journey.js`
  - `docs/benchmarks/cloud/run-comparative-benchmarks.mjs`
  - `src/control-plane/node-ready-lease-authority.js`
  - `src/bootstrap/cluster-bootstrap-constants.js`
  - `src/node/node-joining-constants.js`
  - `src/node/node-execution-constants.js`
- **Contract:**
  - `src/control-plane/node-ready-lease-authority.js` is preserved at its canonical `0e46d10fc` contract (`leaseLiveness.alive !== false`), keeping lease-liveness decision-neutrality intact.
  - General `DEFAULT_READINESS.attempts` in `test/distributed/harness/real-product-deployment-contract.js` remains `120` (`120 s` at `1,000 ms` poll interval), while the Lagrange deployer's cold-formation readiness budget (`FORMATION_ATTEMPTS = 420` and `DEFAULT_LAGRANGE_FORMATION_DEADLINE_MS = 420_000` in `test/distributed/harness/real-product-deployment-contract.js` / `test/distributed/harness/real-product-deployer-lagrange.js`) enforces one shared `420,000 ms` (`420 s`, `7 min` at `1,000 ms` poll interval) wall-clock formation deadline across all sequential formation readiness stages (`nodeReady`, `membershipReady`, `publicPgWireReady`, `leadersReady`, `clusterReady`, and `probeWriteReadback`), matching `FORMATION_BOUND_MS = 420_000` in `test/distributed/scenarios/fresh-formation-user-table-routability.js`.
  - `pollReadiness` (`test/distributed/harness/real-product-readiness.js`) checks `deadlineAtMs` and `signal?.aborted` BEFORE invoking `probe({attempt, signal, remainingMs, deadlineAtMs})` and immediately AFTER `await probe(...)` resolves - BEFORE accepting `outcome.ready` or returning `READY` (`consecutive >= stablePolls`). A probe that starts before `deadlineAtMs` and resolves `{ready: true}` after `deadlineAtMs` (or after `signal.aborted`) is rejected as `readiness_exhausted` (`deadlineExpired: true` or `aborted: true`) with `lastObservation` and is never accepted as `READY`.
  - Per-poll `{signal, remainingMs, deadlineAtMs}` is threaded through `nodeReady`, `membershipReady`, `publicPgWireReady`, `leadersReady`, `clusterReady`, and `probeWriteReadback` (`test/distributed/harness/real-product-deployer-lagrange.js`), recomputing the remaining deadline before each remote operation inside multi-step probes and bounding `httpFromHost`, `execWithStatus`, `sql.statement`, `sql.query`, and `createSshRun` (`docs/benchmarks/cloud/run-comparative-benchmarks.mjs`) with `{signal, timeoutMs}`.
  - `deployLagrangeCluster` wraps `sshRun` with `createTrackedSshRun` (`test/distributed/harness/real-product-remote-shell.js`) and awaits `settleInFlight()` (`Promise.allSettled`) in both its `finally` and `catch` paths before `describeExhaustedDeployment` and `removeCampaignContainers` run.
  - Post-abort inspection and cleanup explicitly clear `signal` (`signal: null`, `deadlineAtMs: null`, `deadlineMs: null`) in `postFailureOpts` and `postFailureCtx` across `real-product-deployer-lagrange.js`, `real-product-deployer-postgres.js`, `real-product-deployer-tidb.js`, `real-product-exhausted-deployment.js`, and `real-product-campaign-cleanup.js`. `real-product-remote-shell.js`, `real-product-sql-clients.js`, and `createSshRun` (`docs/benchmarks/cloud/run-comparative-benchmarks.mjs`) inspect `Object.hasOwn(callOpts, 'signal')` so explicit `{signal: null}` never falls back to an aborted `opts.signal`.
  - When a deployment or setup stage is cancelled via `AbortSignal` (`aborted: true` or `WATCHDOG_STOPPED`), `describeExhaustedDeployment` (`test/distributed/harness/real-product-exhausted-deployment.js`) attaches the inspected deployment identity (`roles`, `products`, `storage`, `lastObservation`) while preserving `aborted: true`, and `runComparativeCampaign` (`test/distributed/harness/comparative-benchmark-campaign-runner.js`) records `execution.state = 'interrupted'` and `failureClass = 'interrupted'` (never `'product_error'`) while retaining `identity.products`, `lastObservation`, and `cleanup` (`deployment.closure`).
  - `semanticGateStage` (`test/distributed/harness/comparative-benchmark-campaign-runner.js` and `docs/benchmarks/cloud/run-comparative-benchmarks.mjs`) forwards the campaign watchdog `signal` and `deadlineAtMs` into `createSemanticGateStage` (`test/distributed/harness/comparative-benchmark-semantic-gate.js`), `runRemotePgWireSemanticGate`, `runTiDbSemanticGate`, and `runScenarioASemanticProofJourney` (`test/distributed/scenarios/scenario-a-semantic-proof-journey.js`). Every proof case checks `assertSemanticGateActive` before and after execution, `runRemoteNodeJson` bounds its remote SSH timeout to `Math.min(REMOTE_GATE_ACTION_TIMEOUT_MS, deadlineAtMs - now())` and forwards `signal`, and any abort or deadline expiry throws `WATCHDOG_STOPPED` (`failureClass: 'interrupted'`, `aborted: true`) immediately without starting subsequent proof cases.
  - `createSemanticGateStage` records `EVENT.DATASET_RESET` from `reset(caseId)` only when an outer reset handler (`run.resetDataset` or `run.adapter.resetDataset`) exists and executes, or via `onCaseDatasetPrepared` when cases 2..N in the proof journey actually prepare/reset their canonical adapter dataset (never emitting synthetic `dataset-reset` events from a no-op outer `reset()`).
  - Multi-node cold-formation join/transport constants (`NODE_JOINING_SERVICE_LITERAL`, `BOOTSTRAP_API_WAIT_TIMEOUT_MS = 180000`, `LAGRANGE_TRANSPORT_MESSAGE_TIMEOUT_MS = 30000`, `NODE_JOINING_HTTP_TIMEOUT_MS = 60000`, `NODE_JOINING_LEADERSHIP_WAIT_TIMEOUT_MS = 240000`) are bounded to the bootstrap/joining path so concurrent 5-node cold formation completes deterministically under 4-vCPU Class A host contention.

## 4. Forensic Analysis of Campaign Run `bench-lab-20261115T1604Z`

- **Observed Timeline on 3-Host Lab (`192.168.86.41`, `192.168.86.26`, `192.168.86.32`):**
  - 3-node Lagrange formation succeeded in `35,691 ms` (`nodeReady` in `15,792 ms`, `membershipReady` in `1,304 ms`, `publicPgWireReady` in `1,636 ms`, `leadersReady` in `5,305 ms`, `clusterReady` in `6,969 ms`, and `probeWriteReadback` in `4,685 ms`).
  - At `16:08:58.661Z`, the first remote semantic proof (`read_committed_isolation` / `new-order-contention`) started inside `runRemoteNodeJson(...)` under the inherited `120,000 ms` `sshRun` default timeout.
  - Inside `createLagrangeOltpAdapter` -> `prepareDataset()`, the remote proof sequentially provisioned canonical tables 1..7 at ~15-21 s per table (`warehouse` at `16:08:58.661Z`, `district` at `16:09:13.881Z`, `customer` at `16:09:30.519Z`, `item` at `16:09:49.569Z`, `stock` at `16:10:05.436Z`, `orders` at `16:10:26.711Z`, `new_order` at `16:10:48.513Z`).
  - At `16:10:58.661Z` (`120 s` after `16:08:58.661Z`, ~135-162 s into the run), client-side `sshRun` timed out (`Command timed out after 120000ms`) and killed the remote client process while the 8th table (`order_line`) was being provisioned on the server (`16:11:06Z`-`16:11:58Z`), so the 9th table (`history`) was never submitted by the client.
  - Subsequent semantic proofs observed only 8 of 9 tables (`Lagrange OLTP cohort has partial schema (8 of 9 tables present: warehouse, district, customer, item, stock, orders, new_order, order_line)`) and failed closed with `schema-mismatch`.
  - When `scenario-a-smoke` (`keepDataset: true`) ran against the partial cohort, dataset verification failed immediately (`No partitions available for table: history`, `runStatus: "setup-failed"`), and `executeWorkloadRun` then unconditionally invoked `deployment.operations.observePlacement()`, spending 15 minutes (`900,829 ms`, 66 attempts) in `lagrange-canonical-tables-routable` polling for the missing `history` table.
- **Confirmed Harness Defects Fixed vs. Unverified Product/Provisioning Completion:**
  - **Confirmed and fixed in harness:**
    1. `runRemoteNodeJson` in `test/distributed/harness/comparative-benchmark-semantic-gate.js` now passes an explicit `REMOTE_GATE_ACTION_TIMEOUT_MS = 15 * 60 * 1000` (`900,000 ms`), bounded by any active campaign `deadlineAtMs` and `signal`, instead of inheriting the `120,000 ms` `sshRun` default timeout.
    2. `executeWorkloadRun` in `test/distributed/harness/comparative-benchmark-workload-runner.js` now skips post-window `deployment.operations.observePlacement()` whenever `setupFailure !== null`, `workloadFailure !== null`, or `productFailure !== null`, avoiding a 15-minute `lagrange-canonical-tables-routable` poll on a failed setup/workload.
  - **Requires campaign rerun to verify:** Full 9-table + index dataset preparation completion under the 15-minute `runRemoteNodeJson` timeout remains unverified until the next 3-host campaign run executes past table 8 (`order_line`) and table 9 (`history`).
- **Why `sql_transactions-p1` Determinism Self-Check Log Has Zero Impact on User SQL / 2PC / Coordinator Recovery:**
  - The server log line at `16:12:27.388Z` (`Participant transaction determinism self-check failed on this leader; every BEGIN is refused` on `sql_transactions-p1`) is emitted because `sql_transactions` defines the `sql_transactions_initial_lineage_v1` `BEFORE INSERT` trigger (`Opcode: 'Program'` in `EXPLAIN`), which the participant determinism self-check flags on leader startup.
  - `sql_transactions` is the internal coordinator ledger table, not a user SQL or 2PC participant table: `coordinatorTableParticipantRefusal` unconditionally bars `sql_transactions` from participant sessions before `beginRefusalOf` is ever consulted, and all coordinator ledger writes and recovery reads use ordinary non-participant Raft commands/queries. Thus this log entry has zero impact on user SQL transactions, 2PC, semantic proofs, or coordinator recovery.

## 5. Retained Lab Job Evidence

- `docs/evidence/comparative-campaign-explicit-provisioning-2026-11/lab-jobs/lab-job-d646f3de-e8a2-425f-b1bf-ebe4e4c9fe11/` (`job.json`, `summary.json`, `tap.txt`): 15-file comparative and deployer harness suite executed on `adam-laptop` (`gen 2593c0f2-96b2-46f6-a031-785eabe87008`), `state: COMPLETE`, `exit_code: 0`, `15/15` test files passed (`138` assertions, including late-response post-deadline rejection, active in-flight probe cancellation + settlement before cohort cleanup, and campaign watchdog cancellation `failureClass: 'interrupted'` witness).
- `docs/evidence/comparative-campaign-explicit-provisioning-2026-11/lab-jobs/lab-job-1034c873-144c-4f88-a6e4-1a85294630c7/` (`job.json`, `summary.json`, `tap.txt`): 15-file comparative and deployer harness suite executed on `adams-gamla` (`gen e1b0571f-c4ea-4346-b4ce-d2d7819463d8`), `state: COMPLETE`, `exit_code: 0`, `15/15` test files passed (`135` assertions).
