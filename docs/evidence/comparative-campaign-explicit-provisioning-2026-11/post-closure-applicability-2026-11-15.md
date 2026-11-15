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

## 3. Readiness Budget & Cold-Formation Transport/Join Constants

- **Files:**
  - `test/distributed/harness/real-product-deployment-contract.js`
  - `test/distributed/harness/real-product-deployer-lagrange.js`
  - `src/control-plane/node-ready-lease-authority.js`
  - `src/bootstrap/cluster-bootstrap-constants.js`
  - `src/node/node-joining-constants.js`
  - `src/node/node-execution-constants.js`
- **Contract:**
  - `src/control-plane/node-ready-lease-authority.js` is preserved at its canonical `0e46d10fc` contract (`leaseLiveness.alive !== false`), keeping lease-liveness decision-neutrality intact.
  - General `DEFAULT_READINESS.attempts` in `test/distributed/harness/real-product-deployment-contract.js` remains `120` (`60 s` at `500 ms` poll interval), while the Lagrange deployer's cold-formation readiness budget (`FORMATION_ATTEMPTS = 420` in `test/distributed/harness/real-product-deployer-lagrange.js`) matches the 7-minute multi-node cold-formation bound (`210 s` at `500 ms` poll interval).
  - Multi-node cold-formation join/transport constants (`NODE_JOINING_SERVICE_LITERAL`, `BOOTSTRAP_API_WAIT_TIMEOUT_MS = 180000`, `LAGRANGE_TRANSPORT_MESSAGE_TIMEOUT_MS = 30000`, `NODE_JOINING_HTTP_TIMEOUT_MS = 60000`, `NODE_JOINING_LEADERSHIP_WAIT_TIMEOUT_MS = 240000`) are bounded to the bootstrap/joining path so concurrent 5-node cold formation completes deterministically under 4-vCPU Class A host contention.
