# Lagrange Lab Cluster Smoke Fixtures

This directory provides project-owned cluster configuration, joiner coordination,
readiness observation, and PostgreSQL wire verification fixtures for Lagrange
cluster smoke testing in Lagrange lab (originally authored in PR #151).

## 1. Objective and Bounded Claims

The fixtures here exercise genuine Lagrange processes formed into a single-host cluster:

- Formation: Three processes (default for release smoke) or five processes (default for
  Scenario A development formation) running on ONE physical host (`logicalNodes: 3`,
  `physicalHosts: 1`, `failureDomains: 1`).
- Execution Model: The fixture launches source processes from the staged tree and may
  reuse shared or installed `node_modules` (`sourceExecutionModel:
  'staged-source-tree-with-shared-or-installed-node-modules'`). Release-profile
  metadata alone does not install or verify a named tarball
  (`tarballInstalledByFixture: false`).
- Bounded Scope: Startup, contact liveness, product readiness probes, and optional
  PostgreSQL wire query smoke (`SELECT 1`), followed by original resource cleanup.
- Non-Claims:
  - This fixture does NOT simulate multiple physical machines or distinct failure domains.
  - Wire and query smoke validates loopback endpoint activation and single-query round-trip only;
    it does NOT certify transaction visibility, durability, replication consensus under partition,
    or performance benchmarking.
  - Passing this smoke test does NOT certify production readiness or satisfy Scenario A admission.

## 2. Fixture Profiles

Two distinct profiles are supported:

### Profile A: `release-0.2.6-smoke`

- Target: Published `lagrange-server@0.2.6` (`gitHead: a1e26f6de84433a3913c2ef855d1b787e926d7eb`).
- Tarball Integrity: SHA-256 `742393020d9229215b1381a0f426ca7c45a19da04df7cd6202a63c73dbddfa74`, 4650101 bytes.
  Note that release-profile metadata alone does not install or verify a named tarball;
  the fixture executes from the staged source tree.
- REST Bind Exposure: Released `lagrange-server@0.2.6` binds REST to `0.0.0.0` (all host interfaces)
  while connect addresses use loopback `127.0.0.1`. The fixture requires explicit caller consent via
  `allowWildcardRestBind: true` before generating this configuration.
- Default Formation: 3 processes (`node-1`, `node-2`, `node-3`).

### Profile B: `scenario-a-dev-formation`

- Target: Scenario A development commit `7f80bcb656e8b3cb5297cb3170b93b8dfeca3b03`.
- Gate Facts: Records explicit facts (`requiredConsecutiveColdFormations: 3`,
  `semanticProofIdsImplemented: 33`, `semanticProofIdsExecutedLive: 3`,
  `semanticProofIdsRequired: 33`, `scenarioAGatesBypassed: false`,
  `comparable: false`).
- Isolation: Does NOT fabricate Scenario A admission JSON and does NOT mix `0.2.6` release
  tarball code with commit `7f80bcb656e8b3cb5297cb3170b93b8dfeca3b03`.
- Default Formation: 5 processes (`node-1` through `node-5`).

## 3. Component Files

All fixture components are self-contained ES modules:

- `examples/lab-cluster-smoke/cluster-config.js`:
  Validates strict caller options and emits C1b `spec.members` with exact 5-key port declarations
  (`name`, `address`, `connectAddress`, `protocol`, `port`), per-member working directories
  (`cwd: "member-data"`), and private environment variables without `NODE_ID`. Emits `auxiliaryPorts`
  for PostgreSQL smoke when enabled.
- `examples/lab-cluster-smoke/wait-seed.js`:
  Bounded pre-exec wrapper for joiners. Polls seed `/livez` for HTTP 200 `{alive: true}` contact
  liveness before executing the genuine release CLI once without retry or restart. Seed `/livez` contact
  liveness is strictly separate from cluster join admission or quorum readiness.
- `examples/lab-cluster-smoke/observe-cluster.js`:
  Finite readiness and diagnostics observer aligned with `0.2.6` schemas. Polls `/livez`, `/startupz`,
  `/readyz`, and admin diagnostic endpoints across all members. Enforces a sustained stability window
  (at least 6 passing samples across at least 10 seconds with maximum inter-sample gap of 3 seconds).
  Enforces a 64 KiB per-response budget and 4 MiB aggregate diagnostic budget with explicit omission records.
- `examples/lab-cluster-smoke/pg-smoke.js`:
  Optional PostgreSQL wire activation verifier. When `enablePg === true`, queries original
  `sys-postgres-wire` definition, validates desired `runtime_config` against descriptor rules,
  scales `sys-postgres-wire` via `POST /api/admin/services/sys-postgres-wire/scale` (never raw
  `UPDATE service_definitions` SQL), polls service discovery for a healthy replica on an active
  node, checks workload readiness status, and runs `SELECT 1` via `pg.Client`.
- `examples/lab-cluster-smoke/build-lab-job.js`:
  CLI and programmatic builder for C1b `driver: "process-cluster"` job request envelopes.
- `examples/lab-cluster-smoke/package.json`:
  Declares pinned dependencies (`pg: 8.18.0`, `ws: 8.18.0`).

## 4. Usage

### Generating a Job Specification

To generate a 3-process release smoke job:

```bash
node examples/lab-cluster-smoke/build-lab-job.js \
  --profile release-0.2.6-smoke \
  --nodes 3 \
  --allow-wildcard-rest-bind \
  --pretty
```

To include PostgreSQL wire verification:

```bash
node examples/lab-cluster-smoke/build-lab-job.js \
  --profile release-0.2.6-smoke \
  --nodes 3 \
  --enable-pg \
  --pg-port 15432 \
  --allow-wildcard-rest-bind \
  --pretty
```

To generate a 5-process Scenario A development formation job:

```bash
node examples/lab-cluster-smoke/build-lab-job.js \
  --profile scenario-a-dev-formation \
  --nodes 5 \
  --pretty
```
