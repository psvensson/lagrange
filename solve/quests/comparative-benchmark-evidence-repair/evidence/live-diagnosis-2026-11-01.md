# Live diagnosis 2026-11-01: one operation at a time against a real Lagrange 0.4.0 cluster on the lab

Quest `comparative-benchmark-evidence-repair`, owner brief section G. Investigator: `claude:live-diagnosis`
(controller `peter-System-Product-Name`, 192.168.86.210). Worktree
`/mnt/data/peter/projects/.worktrees/lagrange-benchmark-repair-20261101` (HEAD `6dce1bbc2` when the locks were
taken; `69a26626d` by 19:55Z, another agent committed meanwhile). No product code was changed; nothing was
optimised away; no node was excluded, no quorum bypassed, no durability or workload changed, no deadline raised.
Every command, output and envelope is retained under
`/tmp/claude-1000/-mnt-data-peter-projects-lagrange/c6ec814b-3c4a-4df4-b6a1-319dfe73b9bc/scratchpad/live-diagnosis/`
(`command-log.txt` is the timestamped command log; `out/<topology>/` holds the raw JSON, health, inspect and
node-log captures; `scripts/` holds the probe scripts). Paths below are relative to that directory.

Questions asked by the brief and the short answers (evidence in the numbered sections):

| | Question | Answer |
| --- | --- | --- |
| (a) | Does the admin-stream UPDATE answer within 5 s on a ready 3-node cluster, and what does the envelope contain? | **Not on the 3-node (or 4-node) cluster as deployed; yes once a partition is routable (seen only on the 5-node cluster, ~2 min 41 s after CREATE).** On clusters that satisfy the deployer's readiness predicate, every Scenario A UPDATE (3-node: 12/12 on the seed, 1/1 on each joiner; 4-node: 12/12 + 3/3) answered after **29.7-30.0 s** with `type:"query_result"`, `error:"Distributed operation failed due to participant failures"`, `errorCode:"DISTRIBUTED_PARTICIPANT_FAILURE"`, `participantFailures[0].error:"Partition service not found"`, `durationMs:~29 740`, no `affectedRows`, no `writeReceipt` (1 032-1 033 B). The harness's 5 s timer fires ~25 s before that answer, so a 5 s client sees 100 % timeouts (D01) while the product is returning typed failures. On the 5-node cluster, after the partition converged, the same UPDATE answered in **0.17-1.6 s** with `operation:"UPDATE"`, `affectedRows:1`, `writeReceipt` (no durable commit witness), `results:[]` (737 B), and ten acknowledged updates advanced balance/version by exactly ten (§7.3). |
| (b) | What did the 4-node 153-byte answers most plausibly contain? | The admin envelope for the Scenario A UPDATE issued when the table does not exist: `{"type":"query_result","queryId":"op-<idx>-<13-digit ts>","timestamp":<13 digits>,"error":"Table not found: bench_accounts","errorCode":"TABLE_NOT_FOUND"}`. Measured live: 152 B with an 18-character queryId; with the driver's `op-<idx>-<ts>` ids over 160 ops the mean is **153.31 B** (200 ops: 153.45 B), min 152 / max 154 (`out/envelope-size-reproduction.txt`). It answers in 84 ms over the LAN (35-65 ms on the GCP VLAN is consistent). The 4-node run therefore most plausibly never had the `bench_*` tables registered on the nodes it queried (see §3.5). |
| (c) | Does the public PG wire path work end to end for a write + readback? | **Scaling, discovery, connection and authentication work on every topology; SQL fails exactly as the admin stream does while the partition is unroutable (3-node: `XX000 Partition service not found` / `Distributed operation failed due to participant failures`, UPDATE 29.97 s). On the 5-node cluster with a routable partition: **yes, end to end** - `pg` connected to the seed's endpoint (node 1, 192.168.86.32:5432, discovered healthy after 3 polls) in 543 ms; `SELECT 1` → `{"p1":"1"}`; two Scenario A UPDATEs of `acct-0` → `command:"UPDATE"`, `rowCount:1` in 592 ms and 289 ms; readback → `{"account_id":"acct-0","balance":"100012","version":"13"}` (exactly +2 over the admin-stream state 100010/11), `COUNT(*)` → `"4"`. Numeric values arrive as text strings (§7.4).** |
| (d) | Does the canonical adapter's dataset preparation succeed on 0.4.0, and which transaction families commit with invariants held? | **3-node: no, and none.** `createLagrangeOltpAdapter` with the smallest workload failed after 150.6 s in `prepareDataset`: the first `CREATE TABLE warehouse` was answered `55P03 Schema provisioning remains active` (job `schema-job-f1a2cd0a…`, `retry_after_ms 1000`) and the table never became visible within the adapter's 120 s provisioning budget; no transaction could be issued (§5). **5-node (routable cluster): **still no.** Setup failed after 33.7 s: `CREATE TABLE warehouse` → `55P03 Schema provisioning remains active` (~30 s), then the adapter's first `tableExists` poll (`SELECT COUNT(*) AS row_count FROM warehouse`) was answered `XX000 Distributed operation failed due to participant failures` instead of `Table not found`, which the adapter does not classify as "not yet", so it re-threw; no transaction family was exercised on any topology (§7.4).** |
| (e) | Image identity across hosts | Five different "0.4.0" artifacts exist; the three registered lab hosts' tagged image **cannot start a seed at all** (§1.2). The GCP campaign's digest is **not retrievable** from Docker Hub. The live diagnosis ran on the Docker Hub `psvensson/lagrange:0.4.0` tag pulled by digest (`sha256:c0fcc0d3…`, image id `sha256:18aeffc9…`, label revision `07206ba1c8…`), the only reproducible 0.4.0 artifact. |

Classification of the published three-/five-node 100 % timeouts, in one sentence: **client handling hid a
product failure** - the driver's 5 s timer resolved every request as a 64-byte "completed" op (D01) ~25 s
before the product answered with `DISTRIBUTED_PARTICIPANT_FAILURE / Partition service not found`, and the
product failure itself is that user-table partitions created on a `/health`-ready cluster are not routable for
minutes (3-node and 4-node: never within 13-21 min; 5-node: `bench_accounts` after 2 min 41 s, two of four
tables still not after 6 min), because the serve lane is blocked by control-plane priority recovery
(`PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`, then `planning_snapshot_refresh_pending` / `config_safe_mode`),
provisioning keeps failing its cohort (`required=2, provisionable=0/1`) and the rebalancer stays
`topology_settling_blocked` on `node_ready_lease_incomplete`. The deployer's readiness predicate (`/health`
`"ready":true`) only means "a SQL engine object exists" (§1.3) and is not a serve-eligibility signal, so
"verified-ready" was never established by the harness. Once a partition is routable the product answers the
Scenario A statement in well under a second (§7.3), which also shows that the published 4-node "35-65 ms"
figure is not a measurement of that path either: its 153 B/op is the `TABLE_NOT_FOUND` envelope (§3.5).

## 0. Hosts, locks, thermal admission, images

### 0.1 Host identity (recorded before any container started)

| Host | IP | hostname | kernel | Docker | nproc | RAM | boot_id |
| --- | --- | --- | --- | --- | --- | --- | --- |
| tv-dator (seed) | 192.168.86.32 | peter-RB102 | 6.8.0-138-generic (Ubuntu 22.04) | 29.9.2 | 12 | 15 GiB | 1ec87088-2652-4439-9aee-f4daefc92b46 |
| adam-laptop | 192.168.86.34 | adam-Aspire-A515-52G | 7.0.0-34-generic (Ubuntu 24.04) | 29.1.3 | 8 | 15 GiB | a60faf43-3629-4ec0-8c83-cae6cf186de3 |
| adams-gamla | 192.168.86.41 | peter-All-Series | 6.14.0-37-generic (Ubuntu 24.04) | 29.1.3 | 4 | 15 GiB | d7288037-0a8a-4144-a3c4-80101d565062 |
| lenovo-laptop | 192.168.86.27 | peter-Lenovo-Y50-70 | 6.8.0-64-generic (Ubuntu 22.04) | 29.1.3 | 8 | 15 GiB | c005f9d2-2695-4547-a855-2707350080dd |
| carinas-windows | 192.168.86.26 | Carinasdator | 6.18.33.2-microsoft-standard-WSL2 | 29.1.3 | 12 | 7 GiB | 25c13b9d-0be1-4801-a5df-2be3ae81bae1 |

Controller: 192.168.86.210 (`eno1`, same LAN). lenovo-laptop's checkout (`/home/peter/projects/lagrange`, HEAD
`83a81f49b`) runs **node v14.17.5**, which cannot execute the quest-branch ESM harness, so every client probe
ran from the controller over the LAN (`scripts/ws-probe.mjs`, `scripts/pg-probe.mjs`, `scripts/adapter-smoke.mjs`,
using the worktree's `ws` and `pg` packages). carinas-windows became reachable mid-run (owner update) and was
added for the 5-node topology; with five cluster hosts no lab host is left as a separate load generator, so the
5-node probes also ran from the controller.

### 0.2 Lab locks and thermal admission

Each host's machine-wide lock was taken with the four-line recipe of `docs/development/home-lab.md`
(`flock -w 600 9`, holder record purpose `bench:live-diagnosis-20261101`, agent `claude:live-diagnosis`,
expectedMinutes 240) by a detached holder shell (`scripts/live-diagnosis-lockholder.sh`, bounded to 4 h, released
by removing `~/.lab/live-diagnosis-20261101.keep`; records removed on exit). HELD at 19:37:35Z (.32), 19:37:38Z
(.34), 19:37:41Z (.41), 19:37:44Z (.27), 19:55:55Z (.26). No host was busy; carinas-windows carried a stale record
(`lagrange:peter-System-Product-Name:1972926`, started 12:22Z, pid 1109595 dead) which `flock` superseded.
Thermal (the `wait-for-thermal-headroom` sources: coretemp package / NVMe): tv-dator package 47 °C, NVMe
27.9 °C (its `acpitz temp1` reads a constant 95 °C, which the thermal owner does not consume); adam-laptop 41 °C /
18.9 °C; adams-gamla 32 °C; lenovo-laptop 40 °C; carinas-windows (WSL2) exposes no sensors. All under the
75 °C / 78 °C hold thresholds; load averages ≤ 0.2 before start. Ports 8080-8082 were free on all hosts.

### 0.3 Image identity (answer e)

| Where | Reference | Image id | RepoDigest | Starts a seed? |
| --- | --- | --- | --- | --- |
| tv-dator, adam-laptop, adams-gamla, carinas-windows | `psvensson/lagrange:0.4.0` (local tag) | `sha256:d5b7b3684260faf94df1965dc5a88ea87ac09cf4239dc34a5643a571c6b531c3` | `psvensson/lagrange@sha256:d5b7b368…` (equals the id) | **No** - exits 1 in 1.7 s (§1.2) |
| lenovo-laptop | `psvensson/lagrange:0.4.0` (local tag) | `sha256:1ccf95e8921f8d5e97de70dfde150dc24795112766b97f47bce98b881092a411` | none | not tried; same layer structure, different layer sizes (src 21.0 vs 25.6 MB, node_modules 194 vs 214 MB), same `revision` label |
| controller | `psvensson/lagrange:0.4.0` (local tag) | `sha256:d830c94fc513efd52c47fcd0f7b53bd22b5ba51fed32777c82a4247554796055` (built 2026-11-01T17:09+01:00, label `created: unknown`) | none | not used |
| GCP campaign (`data/tidb-comparison/raw-observations.ndjson`, 154 receipts) | `psvensson/lagrange@sha256:5437366ac5c934ed775ddfeb117b626b96725c1988444b8bfa972162d672ed92` | unknown | **`docker manifest inspect` → "no such manifest"** on Docker Hub | not reproducible |
| Docker Hub tag today | `psvensson/lagrange:0.4.0` → manifest `sha256:c0fcc0d3df37e3b1c4760edea289ac5fb9ad9fd745e489b0f1b44b4e31da46fb` (26 layers, 177 MB compressed) | `sha256:18aeffc977a27fc3b365d29364c4c8a34c1f366ff94ede07d61c432fa8dc4a0c` | as left | **Yes** - used for all live steps |

The lab hosts' `d5b7b368…` image is not a build of the repository `Dockerfile`: `docker history` shows the
0.2.5 release image (ARG `VERSION=0.2.5`, `VCS_REF=0d66b0cb6…`, `BUILD_DATE=2026-09-13`, its
`COPY /app/node_modules` layer of 214 MB) with five layers stacked on top (`COPY package.json package-lock.json`,
`COPY src/`, `COPY wit/`, `COPY vendor/raft-rs-wasm/`, `LABEL version=0.4.0 revision=07206ba1c8…`) and **no
`npm ci`** (`out/image-inspect-192.168.86.32.txt`). Its `/app/node_modules/@bytecodealliance/` holds only
`jco-transpile`, `preview2-shim`, `preview3-shim`; `componentize-js` (a production dependency in the image's own
`package.json`, lockfile mentions it 10 times) is absent (`out/image-contents-192.168.86.32.txt`). The GCP
campaign image was `docker load`ed from a controller tarball (`test/distributed/harness/gcp-provisioner.js:572-600`),
which is why its digest never existed on the registry. carinas-windows pulled the Hub digest directly;
lenovo-laptop's Docker daemon is logged in to a Hub account that refuses pulls ("unauthorized: your account must
log in with a Personal Access Token", `out/lenovo-pull-error.txt`), so the Hub image was transferred
`docker save` (tv-dator) → controller → `docker load` (lenovo-laptop) in 50 s; the image id `18aeffc9…` is
preserved, the RepoDigest is not.

## 1. Step 1 - deployment of the 3-node cluster (tv-dator seed, adam-laptop, adams-gamla)

### 1.1 Commands

`scripts/deploy-cluster.sh` replays `deployLagrangeCluster` (`test/distributed/harness/real-product-cluster-deployers.js:211-309`)
command for command over `ssh -o BatchMode=yes` (host keys at their default): the same `docker run -d --name
bench-lagrange-N --network host -e NODE_ID=00000000-0000-4000-8000-00000000000N -e DATA_DIR=/tmp/lagdata-<ts>-N
-e REST_API_PORT=8080 -e ADMIN_WS_PORT=8081 -e TRANSPORT_WS_PORT=8082 -e TRANSPORT_WS_HOST=0.0.0.0
-e ADMIN_WS_HOST=0.0.0.0 -e ADMIN_ALLOW_INSECURE_EXTERNAL_BIND=true -e LAGRANGE_TRANSPORT_MESSAGE_TIMEOUT_MS=30000
-e PGWIRE_AUTH_USER=lagrange-harness-user -e PGWIRE_AUTH_PASSWORD=lagrange-harness-password
-e PGWIRE_AUTH_DATABASE=lagrange_harness -e NODE_ADDRESS=<ip>:8080 [-e SEED_NODE_ADDRESS=<seed>:8080] <image>`,
plus only `--label lagrange.bench.campaign=live-diagnosis-20261101`, and the same readiness predicate
(`curl -sf http://<ip>:8080/health` contains `"ready":true` or `"status":"healthy"` AND `:8081/health` contains
`healthy`), polled once a second. Differences from the base deployer, deliberately: readiness polling does not
fall through after 60 polls (it reports the time to the predicate), the `name=bench-` force-removal is replaced
by a report of pre-existing containers (none existed), and the image reference is a parameter (see 1.2). Every
ssh command is in `out/<topology>/deploy-commands.log`.

### 1.2 First attempt, registered lab image `psvensson/lagrange:0.4.0` (`sha256:d5b7b368…`): the seed cannot start

19:39:26.750Z `bench-lagrange-1` started on tv-dator; 19:39:28.493Z exited, `ExitCode 1`, `OOMKilled false`
(`out/3node/seed-exit-logs.txt`). The readiness poll never saw a ready answer (connection refused). Complete
fatal record:

```
2026-11-01T19:39:28.464Z main   version 0.4.0 bootedSrcFingerprint 5db1fda9254f8261 "Distributed Database System starting"
2026-11-01T19:39:28.466Z main   state fresh_seed mode seed "Resolved startup auto-rejoin decision"
2026-11-01T19:39:28.477Z Fatal error: Error: original-allocation-observation-unavailable
    at originalAllocationError (file:///app/src/raft/raft-rs-original-allocation-constants.js:55:24)
    at initializeOriginalSeedAttempt (file:///app/src/bootstrap/seed-original-allocation-startup.js:91:11)
    at async awaitStartupAcquisition (file:///app/src/lagrange-runtime-startup.js:86:18)
    at async startSeedNode (file:///app/src/lagrange-runtime-startup.js:441:3)
  code: 'ORIGINAL_ALLOCATION_HOLD', reason: 'original-allocation-observation-unavailable',
  detail: "ENOENT: no such file or directory, stat '/app/node_modules/@bytecodealliance/componentize-js'"
```

Owner path: `initializeOriginalSeedAttempt` (`src/bootstrap/seed-original-allocation-startup.js:85-91`) requires
`runtimeBuildProvenance()` to be `measured`; `measureBoot` (`src/diagnostics/runtime-build-provenance.js:68-85`)
measures `measureRuntimeContent(root)` → `productionDependencyRecords(root, lock)`
(`src/diagnostics/runtime-content-fingerprint.js:68-85`), which `stat`s every production dependency named by the
lockfile; the overlay image lacks one, so the boot measurement is `unavailable` and the seed refuses to allocate
the original cohort. The product fails closed on an inconsistent build, by design; the image is the defect
(setup). Under the base deployer this would have gone unnoticed: 60 polls, fall-through (D05), joiners started
against a dead seed, semantic proofs `33` (D04), measurement against `/health` of a dead port (D02).

The exited container was removed after its logs were saved; the three cluster hosts then pulled the Docker Hub
tag by digest (`out/hub-image-inspect-*.txt`), leaving the local `:0.4.0` tag untouched.

### 1.3 Second attempt, Docker Hub image (`psvensson/lagrange@sha256:c0fcc0d3…`, id `18aeffc9…`)

`out/3node-hub/deploy.log`:

```
19:50:31.750Z starting seed bench-lagrange-1 on 192.168.86.32 (DATA_DIR=/tmp/lagdata-1793562629814-1)  cid 4dac74b03c89…
19:51:03.444Z 192.168.86.32 READY (deployer predicate) after 10 polls   seed readiness wall time: 31 s
19:51:03.446Z starting join node bench-lagrange-2 on 192.168.86.34          cid d88f6dc7d3e0…
19:51:04.011Z starting join node bench-lagrange-3 on 192.168.86.41          cid 1c963fc4ff9f…
19:51:06.557Z 192.168.86.32 READY after 1 poll; 19:51:19.175Z 192.168.86.41 READY after 8; 19:51:19.313Z 192.168.86.34 READY after 10
19:51:19.314Z all-node readiness wall time: 15 s
```

Full `/health` bodies (identical shape on all three nodes; `out/3node-hub/health-808{0,1}-*.json`):
`{"status":"healthy","nodeId":"00000000-0000-4000-8000-00000000000N","ready":true}` on :8080 and
`{"status":"healthy","nodeId":"…","connectedClients":0}` on :8081. The body carries **no member count and no
leader information**. `ready:true` is produced by `src/bootstrap/bootstrap-api-server-methods.js:153-171` and
means only `this.getSqlQueryEngine()` is non-null. Membership was therefore read over the admin stream
(§2.1): three `nodes` rows, all `status:"active"`, `connection_state:"ready"`, `boot_incarnation:1`,
`ready_lease_expires_at` = heartbeat + 15 s; six `service_endpoints` rows (sys-wasm-meta, sys-admin-meta per
node, all `healthy`). Running containers: image `sha256:c0fcc0d3…`, `running`, started 19:50:32Z / 19:51:03Z /
19:51:04Z (`out/3node-hub/container-inspect-*.txt`).

## 2. Step 2 - admin WebSocket: `SELECT 1`, the schema statements, time-to-usable

Probe: `scripts/ws-probe.mjs`, the driver's exact message `{type:'query', queryId, sql}` on
`ws://192.168.86.32:8081/api/admin/stream?lane=bench`, statements sent strictly one at a time, 90 s client wait,
every envelope retained (`out/3node-hub/step2*.json`, transcript `out/3node-hub/step2b-envelopes.txt`). Note on
the lane: the product's load lane is literally `load` (`src/admin/admin-websocket-api-shared.js:137`); `bench`
is an unknown lane name and is treated as a default-lane client, so none of the load-lane admission or the 15 s
load-lane cap applies to the harness's connections. On connect the server pushes a 247-253 KB `cache_dump` and
then a `cdc_event` per system-table change (2668 pushes during the 4.6-minute schema probe, 1014 during the
6-minute UPDATE probe, ~2.8/s) to every admin client; the driver parses all of them.

### 2.1 Results

WS `ws://192.168.86.32:8081/api/admin/stream?lane=bench` opened 2026-11-01T19:51:47.135Z in 200.9 ms; unsolicited server pushes during the probe: 12 (cache_dump, cdc_event)

| # | statement | sent (UTC) | RTT ms | bytes | type | error / errorCode | affectedRows | other envelope fields |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `SELECT * FROM nodes;` | 19:51:47.336 | 168.9 | 2283 | query_result |  |  | `{"count":3,"partitions":["nodes-p1"],"tableName":"nodes","results":"[{\"node_id\": \"00000000-0000-4000-8000-000000000001\", \"node_address\": \"192.168.86.32:8080\", \"cpu_cores\": 12, \"memory_mb\": 15750, \"disk_gb\": 100, \"cpu_usage_perce"}` |
| 2 | `SELECT control_snapshot_local();` | 19:51:47.505 | 274.6 | 160 | query_result | no such function: control_snapshot_local / INTERNAL_ERROR |  | `{}` |
| 3 | `SELECT * FROM service_endpoints;` | 19:51:47.780 | 83.9 | 3029 | query_result |  |  | `{"count":6,"partitions":["service_endpoints-p1"],"tableName":"service_endpoints","results":"[{\"endpoint_id\": \"sys-wasm-meta-ep-00000000-0000-4000-8000-000000000001\", \"service_id\": \"sys-wasm-meta\", \"node_id\": \"00000000-0000-4000-8000-000000000001\", \"pro"}` |

WS `ws://192.168.86.32:8081/api/admin/stream?lane=bench` opened 2026-11-01T19:52:15.118Z in 284.7 ms; unsolicited server pushes during the probe: 2668 (cache_dump, cdc_event)

| # | statement | sent (UTC) | RTT ms | bytes | type | error / errorCode | affectedRows | other envelope fields |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `SELECT 1 AS p1;` | 19:52:15.404 | 318.4 | 147 | query_result | Partition service not found / INTERNAL_ERROR |  | `{}` |
| 2 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 19:52:15.722 | 83.7 | 152 | query_result | Table not found: bench_accounts / TABLE_NOT_FOUND |  | `{}` |
| 3 | `CREATE TABLE IF NOT EXISTS bench_accounts (account_id TEXT PRIMARY KEY` | 19:52:15.806 | 12190.8 | 304 | query_result |  | 0 | `{"partitions":[],"tableName":null,"contractState":"pending","nextAction":"retry","reasonCodes":["schema_replica_convergence_pending"],"jobId":"schema-job-2a17c56aee81c7aece43b7331512674c","retryAfterMs":1000}` |
| 4 | `CREATE TABLE IF NOT EXISTS bench_orders (order_id TEXT PRIMARY KEY, ac` | 19:52:27.997 | 9234.3 | 304 | query_result |  | 0 | `{"partitions":[],"tableName":null,"contractState":"pending","nextAction":"retry","reasonCodes":["schema_replica_convergence_pending"],"jobId":"schema-job-b2c5264ea8d94a2206bc3c9cc7a37afb","retryAfterMs":1000}` |
| 5 | `CREATE TABLE IF NOT EXISTS bench_risk_events (event_id TEXT PRIMARY KE` | 19:52:37.231 | 14279.6 | 304 | query_result |  | 0 | `{"partitions":[],"tableName":null,"contractState":"pending","nextAction":"retry","reasonCodes":["schema_replica_convergence_pending"],"jobId":"schema-job-4c73732481350005ec0d58398668881c","retryAfterMs":1000}` |
| 6 | `CREATE TABLE IF NOT EXISTS bench_feature_rollups (account_id TEXT PRIM` | 19:52:51.511 | 29910.7 | 303 | query_result |  | 0 | `{"partitions":[],"tableName":null,"contractState":"pending","nextAction":"retry","reasonCodes":[],"jobId":"schema-job-f1ad3b1341b200b04c125e71e2f0c1e9","retryAfterMs":1000,"provisioningDeadlineExpired":true}` |
| 7 | `INSERT INTO bench_accounts (account_id, balance, version) VALUES ('acc` | 19:53:21.422 | 29927.7 | 1030 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":null,"failedTable":"bench_accounts"}}` |
| 8 | `INSERT INTO bench_accounts (account_id, balance, version) VALUES ('acc` | 19:53:51.349 | 29841.6 | 1030 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":null,"failedTable":"bench_accounts"}}` |
| 9 | `INSERT INTO bench_accounts (account_id, balance, version) VALUES ('acc` | 19:54:21.191 | 29872.4 | 1030 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":null,"failedTable":"bench_accounts"}}` |
| 10 | `INSERT INTO bench_accounts (account_id, balance, version) VALUES ('acc` | 19:54:51.064 | 29795.7 | 1031 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":null,"failedTable":"bench_accounts"}}` |
| 11 | `INSERT INTO bench_feature_rollups (account_id, rollup_sum, rollup_coun` | 19:55:20.859 | 29856.7 | 1045 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-f1ad3b1341b200b04c125e71e2f0c1e9-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":null,"failedTable":"bench_feature_rollups"}}` |
| 12 | `INSERT INTO bench_feature_rollups (account_id, rollup_sum, rollup_coun` | 19:55:50.716 | 29773.2 | 1045 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-f1ad3b1341b200b04c125e71e2f0c1e9-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":null,"failedTable":"bench_feature_rollups"}}` |
| 13 | `INSERT INTO bench_risk_events (event_id, account_id, risk_score, paylo` | 19:56:20.489 | 29754.2 | 1037 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-4c73732481350005ec0d58398668881c-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":null,"failedTable":"bench_risk_events"}}` |

WS `ws://192.168.86.32:8081/api/admin/stream?lane=bench` opened 2026-11-01T19:58:17.195Z in 218.7 ms; unsolicited server pushes during the probe: 32 (cache_dump, cdc_event)

| # | statement | sent (UTC) | RTT ms | bytes | type | error / errorCode | affectedRows | other envelope fields |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `SELECT * FROM tables;` | 19:58:17.414 | 236.6 | 82624 | query_result |  |  | `{"count":50,"partitions":["tables-p1"],"tableName":"tables","results":"50 rows"}` |
| 2 | `SELECT * FROM partitions;` | 19:58:17.651 | 83.6 | 23422 | query_result |  |  | `{"count":50,"partitions":["tables-p1","nodes-p1","latency_groups-p1","inter_group_latencies-p1","message_groups-p1","partitions-p1","services-p1","indices-p1","logs-p1","config-p1","live_queries-p1","contexts-p1","code-p1","control_plane_publications-p1","replica_operations-p1","node_endpoints-p1","service_definitions-p1","service_instances-p1","service_bindings-p1","service_endpoints-p1","service_timers-p1","service` |
| 3 | `SELECT * FROM replica_operations;` | 19:58:17.735 | 137.9 | 333125 | query_result |  |  | `{"count":29,"partitions":["replica_operations-p1","control_plane_publications-p1","schema_operations-p1","tbl-2a17c56aee81c7aece43b7331512674c-p1","sql_transaction_participants-p1","sql_transactions-p1","sql_write_operations-p1","tbl-b2c5264ea8d94a2206bc3c9cc7a37afb-p1","tbl-4c73732481350005ec0d58398668881c-p1","tbl-f1ad3b1341b200b04c125e71e2f0c1e9-p1"],"tableName":"replica_operations","results":"29 rows"}` |
| 4 | `SELECT COUNT(*) AS cnt FROM bench_accounts;` | 19:58:17.873 | 3272.1 | 1006 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":3238,"failedTable":null}}` |

Observations:

- `SELECT 1 AS p1;` is not answerable on the admin stream: `Partition service not found / INTERNAL_ERROR`
  (147 B, 318 ms). The 33 "semantic proofs" of the base deployer start with such statements.
- The Scenario A UPDATE before the schema exists answers in 84 ms with `Table not found: bench_accounts /
  TABLE_NOT_FOUND`, 152 B (the 4-node reference envelope, answer b).
- `CREATE TABLE` is asynchronous: each answered after 9.2-29.9 s with `affectedRows:0`, `contractState:"pending"`,
  `nextAction:"retry"`, `reasonCodes:["schema_replica_convergence_pending"]`, a `jobId` and `retryAfterMs:1000`;
  the fourth answered at the 30 s admin query timeout with `provisioningDeadlineExpired:true`. The base deployer's
  DDL runner waits 12 s per CREATE and 3 s per INSERT and ignores the answer
  (`real-product-cluster-deployers.js:157-173`), so in the published runs at least two of four CREATEs and all
  seven INSERTs were abandoned client-side while still running server-side.
- Every INSERT (7/7) answered after 29.75-29.93 s with `DISTRIBUTED_PARTICIPANT_FAILURE`, participant
  `{partitionId:"tbl-<tableId>-p1", participantNodeId:null, error:"Partition service not found"}`. No seed row
  was ever written; `acct-0..3` never existed.
- Time until the table was usable: **never within the observation window.** `SELECT COUNT(*) FROM bench_accounts`
  failed at 19:58:17 (6 min after CREATE, 3.3 s) and the readback at 20:05:10 (13 min, 197 ms) with the same
  participant failure; the joiners answered identically at 20:06 (§3.2). The `tables` system table held 50 rows
  including the four `bench_*` tables; `replica_operations` held the schema-job ADD operations for every bench
  partition with `membership_publication_epoch:null`.

### 2.2 What the nodes logged (seed `out/3node-hub/node-logs-192.168.86.32.txt`, 20 566 lines 19:50-19:57Z, 8 045 at warn/error)

The schema job for `bench_accounts` (`tbl-2a17c56aee81c7aece43b7331512674c-p1`), in order:

```
19:52:16.010Z table-creation-service  "Creating table" bench_accounts replicaCount 3
19:52:17.460Z cdc-integration  wait CACHE_WAIT_TIMEOUT_MS 750 ms spent: routed system-table write (partitions row) not visible in the local cache
19:52:27.764Z sql-query-engine  wait table_partition_target_node_wait 10 000 ms spent: "Timed out waiting for active provisioning target nodes"
                 polls 74, classification cache_visibility_timeout, requiredReplicaCount 2, resolvedNodeCount 0, activeNodeRowCount 3
19:52:27.764Z table-creation-service  "Initial table partition provisioning failed": Unable to satisfy minimum routable provisioning cohort: required=2, provisionable=0, target=3
19:52:35.667Z sql-query-engine  "Using degraded provisioning target-node fallback" selectedNodeIds [node1,node3] usedDegradedFallback true
19:52:35.735Z rebalance-coordinator  Creating operation ADD → node1; 19:52:36.877Z ADD → node3 (storage reservations 11 534 336 B)
19:52:39-46Z   operations PENDING→SENDING→CREATING→SYNCING; replica-handler on node1 and node3: pending→creating→syncing
19:52:50.416Z partition  "Became leader" (node1);  19:52:52.380Z replica-state-machine syncing→active (node1); 19:52:52.628Z (node3)
19:52:53.148Z replica-handler  "[replica-create] … stage=active peers=1/1 status=ok" "Replica creation completed"
19:52:52.698Z rebalance-coordinator  "Terminal transition persist not committed; retry ownership kept and repair armed"
19:53:00.035Z rebalance-coordinator  "Failed to query operations from system table": Authoritative replica operation not confirmed … "repair scheduled"
19:53:01.346Z table-creation-service  "Initial table partition provisioning failed": required=2, provisionable=1, target=3
19:53:21.555Z query-executor  "Partition routing candidates filtered by readiness" reasonCode all_services_filtered_by_readiness, dimension serveEligible,
                 serviceRowCount 2, routableServiceCount 0, canonicalLeaderNodeId node1,
                 deniedByNodeId[node1].reasonCodes ["PRIORITY_CONTROL_PLANE_RECOVERY_PENDING"],
                 projectionReadinessContract state recovery_open, lanes.serve blocked ["publication_stream_not_ready","priority_recovery_active"]
19:53:35.462Z table-creation-service  "Timed out waiting for routable partition service for partition tbl-2a17…-p1"
19:53:48.292Z table-creation-service  provisioning failed again: required=2, provisionable=0  (19 such failures for the four bench tables by 19:53:48)
19:57:34.074Z query-executor  routing denied, reasonCodes ["planning_snapshot_refresh_pending"] (165 later denials carry reasonCode config_safe_mode)
19:57:35.394Z rebalancer  planningState topology_settling_blocked, blockerReason node_ready_lease_incomplete, unreadyNodeIds [node1,node3,node2], delayMs 120000
```

The replicas exist and are `active` as Raft services on node 1 and node 3 at 19:52:53, yet the SQL routing
layer never obtains a routable service for the partition: the node's **serve** readiness lane is blocked by
priority control-plane recovery, the terminal replica-operation transition is never confirmed as authoritative,
and provisioning keeps restarting ("required=2, provisionable=0/1"). The control plane itself is churning the
whole time: `CDC obligation delivery held by a subscriber; retry scheduled` 4 845×, `Readiness planning admission
transition` 4 727×, `No row found for CDC update` 1 501×, `Out-of-order CDC event detected` 497×, `Waiting for
transitional cluster membership to settle before planning critical system rebalancing` 338×, `Critical rebalancing
state detected` 60× (`control_plane_replicas_not_spread: 1/2` then `2/3`), `Distributed write failed due to
participant failures` 45× on `replica_operations-p1` (participant node 3, `ROUTER_MESSAGE_TIMEOUT`,
`partition_write_outcome_unknown`), `No handler registered for address …/partition/replica_operations-p1-r2`
71×, `Learner promotion deferred: learner_address_unresolvable` (node 3, 104×). One event-loop gap of 2 111 ms on
the seed at 19:50:38Z (48.6 % blocked of wall at that moment); seed CPU 139 % while serving one serial client
(`out/3node-hub/docker-stats-during-step3.txt`: node2 44 %, node3 65 %).

## 3. Step 3 - the Scenario A statement, one at a time, 90 s client wait

### 3.1 Seed (192.168.86.32), `acct-0`, `acct-17`, then `acct-0` × 10, then readback

WS `ws://192.168.86.32:8081/api/admin/stream?lane=bench` opened 2026-11-01T19:59:12.944Z in 58.7 ms; unsolicited server pushes during the probe: 1014 (cache_dump, cdc_event)

| # | statement | sent (UTC) | RTT ms | bytes | type | error / errorCode | affectedRows | other envelope fields |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 19:59:13.003 | 29792.8 | 1032 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":29742,"failedTable":"bench_accounts"}}` |
| 2 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 19:59:42.796 | 29787.9 | 1032 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":29770,"failedTable":"bench_accounts"}}` |
| 3 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:00:12.584 | 29820.4 | 1032 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":29733,"failedTable":"bench_accounts"}}` |
| 4 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:00:42.404 | 29841.3 | 1032 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":29765,"failedTable":"bench_accounts"}}` |
| 5 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:01:12.246 | 29758.5 | 1032 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":29720,"failedTable":"bench_accounts"}}` |
| 6 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:01:42.004 | 29791.2 | 1032 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":29757,"failedTable":"bench_accounts"}}` |
| 7 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:02:11.795 | 29748.1 | 1032 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":29711,"failedTable":"bench_accounts"}}` |
| 8 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:02:41.544 | 29757.4 | 1032 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":29743,"failedTable":"bench_accounts"}}` |
| 9 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:03:11.301 | 29753.8 | 1032 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":29727,"failedTable":"bench_accounts"}}` |
| 10 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:03:41.055 | 29805.2 | 1033 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":29710,"failedTable":"bench_accounts"}}` |
| 11 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:04:10.860 | 29728.3 | 1033 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":29704,"failedTable":"bench_accounts"}}` |
| 12 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:04:40.589 | 29754.1 | 1033 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":29721,"failedTable":"bench_accounts"}}` |
| 13 | `SELECT * FROM bench_accounts WHERE account_id = 'acct-0';` | 20:05:10.343 | 197.4 | 1005 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":161,"failedTable":null}}` |

Every UPDATE answered in 29 728-29 841 ms (participant `durationMs` 29 704-29 770; the 30 s is the
`LAGRANGE_TRANSPORT_MESSAGE_TIMEOUT_MS=30000` / admin query budget) with the participant failure above; no
`affectedRows`, no `writeReceipt`, no `partitions`. The readback failed in 197 ms with the same participant error,
so there is no row to compare: 0 acknowledged, 0 applied (consistent). Seeded and unseeded keys behave identically
because the partition - not the row - is unreachable. No answer ever arrived late (none of the 90 s waits
expired), so the published "timeouts" were not lost answers but answers the client stopped waiting for.

### 3.2 Joiners (cross-node check)

WS `ws://192.168.86.34:8081/api/admin/stream?lane=bench` opened 2026-11-01T20:05:37.963Z in 26.4 ms; unsolicited server pushes during the probe: 254 (cache_dump, cdc_event)

| # | statement | sent (UTC) | RTT ms | bytes | type | error / errorCode | affectedRows | other envelope fields |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:05:37.989 | 29754.4 | 1032 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":29729,"failedTable":"bench_accounts"}}` |
| 2 | `SELECT COUNT(*) AS cnt FROM bench_accounts;` | 20:06:07.744 | 127.7 | 1004 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":113,"failedTable":null}}` |

WS `ws://192.168.86.41:8081/api/admin/stream?lane=bench` opened 2026-11-01T20:06:10.407Z in 45.1 ms; unsolicited server pushes during the probe: 276 (cache_dump, cdc_event)

| # | statement | sent (UTC) | RTT ms | bytes | type | error / errorCode | affectedRows | other envelope fields |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:06:10.453 | 29778.5 | 1032 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":29727,"failedTable":"bench_accounts"}}` |
| 2 | `SELECT COUNT(*) AS cnt FROM bench_accounts;` | 20:06:40.231 | 144.6 | 1004 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":118,"failedTable":null}}` |

Both joiners hold the table metadata (no `TABLE_NOT_FOUND`) and fail the same way, so the published
round-robin over all endpoints (`ENDPOINTS[opIdx % n]`, drivers `:369`) would have seen the same 29.8 s on every
node.

### 3.3 Full envelope (statement #1 of §3.1), unabridged

```
{"type":"query_result","queryId":"ld-1-1793563153003","timestamp":1793563182788,
 "error":"Distributed operation failed due to participant failures","errorCode":"DISTRIBUTED_PARTICIPANT_FAILURE",
 "participantFailures":[{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","participantNodeId":null,"participantAddress":null,
   "errorCode":null,"failureCode":null,"committed":false,"outcome":null,"disposition":null,"logIndex":null,"entryId":null,
   "error":"Partition service not found","durationMs":29742,"retryAfterMs":null,"deferRetry":false,"backpressured":false,
   "failedTable":"bench_accounts"}],
 "participantFailuresOmittedCount":0,
 "firstFailedParticipant":{…same object…}}
```

### 3.4 Answer (a) restated against the published rows

With the driver's 5 000 ms timer (`real-product-workload-drivers.js:139-154`) every one of these requests is
resolved `{ok:false, bytes:64}` at 5 000 ms and counted `completed` (D01); the 4999-5003 ms latencies of the
published three-/five-node rows are the timer, not the product. The product answered ~29.8 s later with a typed
failure that the driver had already stopped listening for (`pendingByQueryId.delete`), so even the error class was
lost.

### 3.5 Answer (b): the 4-node 153-byte answers

The only admin-stream envelope the Scenario A UPDATE produces in 35-65 ms is `TABLE_NOT_FOUND` (84 ms here
including two LAN hops; §2.1 #2). Its size with the driver's query ids is 152-154 B, mean 153.3-153.5 B
(`out/envelope-size-reproduction.txt`); every other envelope the statement can produce is ≥ 300 B
(`contractState` answers) or ≥ 1 000 B (participant failures), and a successful write carries `affectedRows`,
`writeReceipt`, `partitions`. In the 4-node run the deployer ran with `verifyProofs=false`; its DDL runner still
issues the `CREATE TABLE`s (`:174-176`) but gives each 12 s and never checks the answer, over a WebSocket it waits
at most 8 s to open (`:150`); the live run shows a `CREATE TABLE` takes 9-30 s to be *acknowledged as pending*, and
a table is registered cluster-wide only when the job's `tables` row is published. The 4-node "35-65 ms, 153 B,
0 timeouts" row therefore measured ~160-200 `Table not found: bench_accounts` errors, counted as completed
operations (D03). The live 3-node run did register the tables (the first CREATE's pending answer arrived at
12.2 s), so this cluster produced the participant-failure class instead; which of the two the 4-node run hit
depends only on whether its DDL runner's CREATE reached the seed before the runner moved on, and either way no
bench row ever existed.

## 4. Step 4 - the public PostgreSQL wire path

### 4.1 Scale and discovery (as `oltp-scenario-a-lagrange-public-pg-context.js` does it)

`POST http://192.168.86.32:8081/api/admin/services/sys-postgres-wire/scale` with
`{"replicaCount":1,"runtimeConfig":{"host":"0.0.0.0","authMode":"password","tlsMode":"disable"}}` (the admin HTTP
owner route `src/admin/admin-owner-operations.js:37`; the harness's `PORTS.ADMIN_API` is the admin WS port) →
HTTP 200 in 184 ms:
`{"success":true,"outcome":"applied","serviceId":"sys-postgres-wire","scaleState":"desired_state_persisted","desiredState":{…},"mutationOutcome":"applied"}`
(`out/3node-hub/step4a-scale-response.txt`). `SELECT service_id, node_id, protocol, address, port, health_status
FROM service_endpoints WHERE service_id = 'sys-postgres-wire'` returned no row at 20:06:5x (2 polls) and at the
third poll (~15 s) `{"service_id":"sys-postgres-wire","node_id":"00000000-0000-4000-8000-000000000002",
"protocol":"postgresql","address":"0.0.0.0","port":5432,"health_status":"healthy"}` → endpoint 192.168.86.34:5432
(`out/3node-hub/step4b-endpoints-poll.log`). The row's `address` is the bind address `0.0.0.0`, which is why the
harness maps `node_id` to the node's IP.

### 4.2 SQL over `pg` (`scripts/pg-probe.mjs`, user `lagrange-harness-user`, db `lagrange_harness`, ssl false, 90 s query_timeout)

| # | statement | sent (UTC) | RTT ms | outcome | SQLSTATE | message | rowCount |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `SELECT 1 AS p1;` | 20:07:36.238 | 136.2 | error | XX000 | Partition service not found |  |
| 2 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:07:36.374 | 29965.1 | error | XX000 | Distributed operation failed due to participant failures |  |
| 3 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:08:06.339 | 29969 | error | XX000 | Distributed operation failed due to participant failures |  |
| 4 | `SELECT * FROM bench_accounts WHERE account_id = 'acct-0';` | 20:08:36.308 | 121.7 | error | XX000 | Distributed operation failed due to participant failures |  |
| 5 | `SELECT COUNT(*) AS cnt FROM bench_accounts;` | 20:08:36.430 | 122.8 | error | XX000 | Distributed operation failed due to participant failures |  |

Answer (c): connection, authentication and the wire protocol work (21 ms connect, errors arrive as proper
`ErrorResponse`s with SQLSTATE `XX000`, `severity ERROR`, no detail/hint); the write + readback does **not** work
because the same partition is unroutable: both UPDATEs took 29.97 s and failed, the SELECTs failed in ~120 ms,
`SELECT 1` fails with `Partition service not found` exactly like the admin stream. The public path adds nothing to
and hides nothing of the product state; it maps the admin `errorCode` to a generic `XX000`.

## 5. Step 5 - the canonical adapter (`createLagrangeOltpAdapter`) on the public PG wire

`scripts/adapter-smoke.mjs` imports the quest branch's `test/distributed/reference-client/lagrange-oltp-adapter.js`
and `oltp-baseline-workload.js` unchanged and calls `createLagrangeOltpAdapter({endpoint:{host:'192.168.86.34',
port:5432}, connection:{user:'lagrange-harness-user', password:…, database:'lagrange_harness', ssl:false},
workload:{workers:1, warmupOperationsPerWorker:0, measurementOperationsPerWorker:200, warehouseCount:1,
districtsPerWarehouse:1, customersPerDistrict:1, itemCount:15, seed:1}})` - the smallest configuration the
workload owner accepts (`itemCount` ≥ `MAX_NEW_ORDER_LINES` = 15). It then intended one `executeTransaction`
per kind (`new_order`, `payment`, `order_status`, `delivery`, `stock_level`) from `buildOltpBaselinePlan`.

Result (`out/3node-hub/step5-adapter-smoke.json`): **dataset preparation failed after 150 598 ms; no
transaction was executed.** The first statement of `CREATE_SCHEMA` (`CREATE TABLE warehouse (id INTEGER PRIMARY
KEY, ytd_cents BIGINT NOT NULL)`) was answered by the wire handler with SQLSTATE **`55P03`** `Schema provisioning
remains active`, detail `{"provisioning_job_id":"schema-job-f1a2cd0a335da6d113bb8540278218a6","retry_after_ms":1000}`
(~30 s after issue); the adapter's provisioning contract (`lagrange-oltp-adapter.js:380-434`) then polled
`tableExists('warehouse')` every 1 000 ms for its 120 000 ms budget and the table never became visible, so it
re-threw the 55P03 error and cleaned up. The failure is identical in kind to §2 (a CREATE TABLE job that never
converges into a routable partition on this cluster), reached through the documented public contract.

Answer (d): on this 0.4.0 cluster the canonical dataset preparation does **not** succeed; no transaction family
could be exercised, so no invariant claim is possible. This is a product finding (schema provisioning does not
converge), not an adapter defect: the adapter honoured the 55P03 contract exactly as specified. The base
campaign never reached this point because it did not use the adapter (D06).

## 6. Step 6 - the 4-node topology (tv-dator seed; adam-laptop, adams-gamla, lenovo-laptop)

### 6.1 Deployment

Attempt 1 (20:14Z) used the image id `18aeffc977a2` as the reference; Docker 29's containerd image store on the
three pulled hosts reports the Hub image under its manifest digest (`sha256:c0fcc0d3…`) and does not know the
config id, so `docker run` on .32/.34/.41 failed with "Unable to find image '18aeffc977a2:latest' locally … pull
access denied" while lenovo-laptop (docker-load'ed copy, id `18aeffc9…`) started node 4 alone
(`out/4node/deploy.log`). Node 4 ran for ten minutes as `initializing` / `ready:false` and exited 1 with "Node
joining failed" (`out/4node/attempt1-node4-alone-logs.txt`); it was removed. The one image was then tagged
`lagrange-live-diagnosis:hub-0.4.0` on all five hosts (`docker tag`, removed at cleanup) so that one reference
names the same bytes everywhere (`sha256:c0fcc0d3…` on the pulled hosts, `sha256:18aeffc9…` on lenovo-laptop).

Attempt 2 (`out/4node-b/deploy.log`): seed started 20:29:59.848Z, deployer predicate after 16 polls (26 s);
joiners started 20:30:26.8-28.5Z; predicate on all four after 26 s (20:30:54.68Z). `/health` bodies identical in
shape to §1.3 (`out/4node-b/health-808*.json`). `nodes` rows at 20:31:15Z: four `active`/`ready`, but the
system table already showed the joiners' heartbeats **22.6-38.4 s old and their 15 s ready leases expired
7.6-23.4 s earlier** (node 1: 9.4 s old, lease current); `service_endpoints` 8 rows, all healthy.

### 6.2 Results

#### step2a-membership.json

WS `ws://192.168.86.32:8081/api/admin/stream?lane=bench` opened 2026-11-01T20:31:14.827Z in 415.7 ms; unsolicited server pushes during the probe: 14 (cache_dump, cdc_event)

| # | statement | sent (UTC) | RTT ms | bytes | type | error / errorCode | affectedRows | other envelope fields |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `SELECT * FROM nodes;` | 20:31:15.243 | 118.9 | 3084 | query_result |  |  | `{"count":4,"partitions":["nodes-p1"],"tableName":"nodes","results":"[{\"node_id\": \"00000000-0000-4000-8000-000000000001\", \"node_address\": \"192.168.86.32:8080\", \"cpu_cores\": 12, \"memory_mb\": 15750, \"disk_gb\": 100, \"cpu_usage_perce"}` |
| 2 | `SELECT * FROM service_endpoints;` | 20:31:15.362 | 57.6 | 3972 | query_result |  |  | `{"count":8,"partitions":["service_endpoints-p1"],"tableName":"service_endpoints","results":"[{\"endpoint_id\": \"sys-wasm-meta-ep-00000000-0000-4000-8000-000000000001\", \"service_id\": \"sys-wasm-meta\", \"node_id\": \"00000000-0000-4000-8000-000000000001\", \"pro"}` |

#### step2b-schema.json

WS `ws://192.168.86.32:8081/api/admin/stream?lane=bench` opened 2026-11-01T20:31:17.955Z in 389.7 ms; unsolicited server pushes during the probe: 1625 (cache_dump, cdc_event)

| # | statement | sent (UTC) | RTT ms | bytes | type | error / errorCode | affectedRows | other envelope fields |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `SELECT 1 AS p1;` | 20:31:18.345 | 197.6 | 183 | query_result |  |  | `{"count":1,"partitions":["tables-p1"],"tableName":null,"results":"[{\"p1\": 1}]"}` |
| 2 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:31:18.543 | 115.8 | 152 | query_result | Table not found: bench_accounts / TABLE_NOT_FOUND |  | `{}` |
| 3 | `CREATE TABLE IF NOT EXISTS bench_accounts (account_id TEXT PRIMARY KEY` | 20:31:18.659 | 29875.3 | 303 | query_result |  | 0 | `{"partitions":[],"tableName":null,"contractState":"pending","nextAction":"retry","reasonCodes":[],"jobId":"schema-job-2a17c56aee81c7aece43b7331512674c","retryAfterMs":1000,"provisioningDeadlineExpired":true}` |
| 4 | `CREATE TABLE IF NOT EXISTS bench_orders (order_id TEXT PRIMARY KEY, ac` | 20:31:48.534 | 29970.1 | 303 | query_result |  | 0 | `{"partitions":[],"tableName":null,"contractState":"pending","nextAction":"retry","reasonCodes":[],"jobId":"schema-job-b2c5264ea8d94a2206bc3c9cc7a37afb","retryAfterMs":1000,"provisioningDeadlineExpired":true}` |
| 5 | `CREATE TABLE IF NOT EXISTS bench_risk_events (event_id TEXT PRIMARY KE` | 20:32:18.504 | 29899.1 | 303 | query_result |  | 0 | `{"partitions":[],"tableName":null,"contractState":"pending","nextAction":"retry","reasonCodes":[],"jobId":"schema-job-4c73732481350005ec0d58398668881c","retryAfterMs":1000,"provisioningDeadlineExpired":true}` |
| 6 | `CREATE TABLE IF NOT EXISTS bench_feature_rollups (account_id TEXT PRIM` | 20:32:48.403 | 12887.4 | 304 | query_result |  | 0 | `{"partitions":[],"tableName":null,"contractState":"pending","nextAction":"retry","reasonCodes":["schema_replica_convergence_pending"],"jobId":"schema-job-f1ad3b1341b200b04c125e71e2f0c1e9","retryAfterMs":1000}` |
| 7 | `INSERT INTO bench_accounts (account_id, balance, version) VALUES ('acc` | 20:33:01.291 | 29871.8 | 1030 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":null,"failedTable":"bench_accounts"}}` |
| 8 | `INSERT INTO bench_accounts (account_id, balance, version) VALUES ('acc` | 20:33:31.163 | 29832 | 1030 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":null,"failedTable":"bench_accounts"}}` |
| 9 | `INSERT INTO bench_accounts (account_id, balance, version) VALUES ('acc` | 20:34:00.995 | 29847.8 | 1030 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":null,"failedTable":"bench_accounts"}}` |
| 10 | `INSERT INTO bench_accounts (account_id, balance, version) VALUES ('acc` | 20:34:30.843 | 29820.9 | 1031 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":null,"failedTable":"bench_accounts"}}` |
| 11 | `INSERT INTO bench_feature_rollups (account_id, rollup_sum, rollup_coun` | 20:35:00.664 | 29856 | 1045 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-f1ad3b1341b200b04c125e71e2f0c1e9-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":null,"failedTable":"bench_feature_rollups"}}` |
| 12 | `INSERT INTO bench_feature_rollups (account_id, rollup_sum, rollup_coun` | 20:35:30.520 | 29913.4 | 1045 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-f1ad3b1341b200b04c125e71e2f0c1e9-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":null,"failedTable":"bench_feature_rollups"}}` |
| 13 | `INSERT INTO bench_risk_events (event_id, account_id, risk_score, paylo` | 20:36:00.433 | 29860.9 | 1037 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-4c73732481350005ec0d58398668881c-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":null,"failedTable":"bench_risk_events"}}` |

#### step3-update.json

WS `ws://192.168.86.32:8081/api/admin/stream?lane=bench` opened 2026-11-01T20:36:32.868Z in 260.2 ms; unsolicited server pushes during the probe: 1918 (cache_dump, cdc_event)

| # | statement | sent (UTC) | RTT ms | bytes | type | error / errorCode | affectedRows | other envelope fields |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:36:33.128 | 29968.8 | 1032 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":29878,"failedTable":"bench_accounts"}}` |
| 2 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:37:03.097 | 29901.3 | 1032 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":29772,"failedTable":"bench_accounts"}}` |
| 3 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:37:32.998 | 29852.2 | 1032 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":29783,"failedTable":"bench_accounts"}}` |
| 4 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:38:02.851 | 29926 | 1032 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":29706,"failedTable":"bench_accounts"}}` |
| 5 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:38:32.777 | 29793.6 | 1032 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":29740,"failedTable":"bench_accounts"}}` |
| 6 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:39:02.570 | 29934.7 | 1032 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":29861,"failedTable":"bench_accounts"}}` |
| 7 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:39:32.505 | 29826 | 1032 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":29744,"failedTable":"bench_accounts"}}` |
| 8 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:40:02.331 | 29994 | 1032 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":29796,"failedTable":"bench_accounts"}}` |
| 9 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:40:32.325 | 29952.2 | 1032 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":29789,"failedTable":"bench_accounts"}}` |
| 10 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:41:02.277 | 29887.6 | 1033 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":29746,"failedTable":"bench_accounts"}}` |
| 11 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:41:32.165 | 29754.4 | 1033 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":29708,"failedTable":"bench_accounts"}}` |
| 12 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:42:01.919 | 29936.7 | 1033 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":29775,"failedTable":"bench_accounts"}}` |
| 13 | `SELECT * FROM bench_accounts WHERE account_id = 'acct-0';` | 20:42:31.856 | 447.2 | 1005 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":312,"failedTable":null}}` |

#### step3x-crossnode-192.168.86.27.json

WS `ws://192.168.86.27:8081/api/admin/stream?lane=bench` opened 2026-11-01T20:43:39.803Z in 23.9 ms; unsolicited server pushes during the probe: 310 (cache_dump, cdc_event)

| # | statement | sent (UTC) | RTT ms | bytes | type | error / errorCode | affectedRows | other envelope fields |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:43:39.827 | 29762.7 | 1032 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":29712,"failedTable":"bench_accounts"}}` |
| 2 | `SELECT COUNT(*) AS cnt FROM bench_accounts;` | 20:44:09.590 | 111 | 1004 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":103,"failedTable":null}}` |

#### step3x-crossnode-192.168.86.34.json

WS `ws://192.168.86.34:8081/api/admin/stream?lane=bench` opened 2026-11-01T20:42:34.845Z in 28.7 ms; unsolicited server pushes during the probe: 329 (cache_dump, cdc_event)

| # | statement | sent (UTC) | RTT ms | bytes | type | error / errorCode | affectedRows | other envelope fields |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:42:34.874 | 29743.7 | 1032 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":29716,"failedTable":"bench_accounts"}}` |
| 2 | `SELECT COUNT(*) AS cnt FROM bench_accounts;` | 20:43:04.618 | 151 | 1004 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":103,"failedTable":null}}` |

#### step3x-crossnode-192.168.86.41.json

WS `ws://192.168.86.41:8081/api/admin/stream?lane=bench` opened 2026-11-01T20:43:07.329Z in 37.2 ms; unsolicited server pushes during the probe: 259 (cache_dump, cdc_event)

| # | statement | sent (UTC) | RTT ms | bytes | type | error / errorCode | affectedRows | other envelope fields |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:43:07.367 | 29751.9 | 1032 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":29700,"failedTable":"bench_accounts"}}` |
| 2 | `SELECT COUNT(*) AS cnt FROM bench_accounts;` | 20:43:37.119 | 132.4 | 1004 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":106,"failedTable":null}}` |

Differences from the 3-node run: `SELECT 1 AS p1` was answered (`{"p1":1}`, routed through `tables-p1`, 198 ms,
183 B); three of four `CREATE TABLE`s ran into the 30 s admin budget (`provisioningDeadlineExpired:true`,
`reasonCodes:[]`); otherwise identical - 7/7 INSERTs and 12/12 UPDATEs answered after 29.75-29.99 s with
`DISTRIBUTED_PARTICIPANT_FAILURE / Partition service not found` (participant `durationMs` 29 706-29 878), the
readback failed in 447 ms, and all three joiners (including lenovo-laptop, node 4) answered the same way within
29.74-29.76 s. No answer arrived late; no 90 s wait expired.

### 6.3 Node logs (`out/4node-b/node-logs-*.txt`, 45 323 seed lines 20:04-20:44Z, 15 603 at warn/error)

- `Initial table partition provisioning failed` **153×** between 20:31:51Z and 20:44:09Z for the four bench
  tables, always `required=2, provisionable=0, target=3, rejected=none`; unlike the 3-node run **no bench replica
  was ever created on any node** (zero `[replica-create] … stage=active` lines on all four hosts); the routing
  snapshot for `tbl-2a17c56a…-p1` is `reasonCode:"no_service_rows", serviceRowCount 0, leaderKnown false`
  (`No active service found for partition` 113×).
- Rebalancer: `Critical rebalancing state detected` from 20:30:40Z (`control_plane_replicas_not_spread: 1/3`, then
  `2/4`); `topology_settling_blocked` with `blockerReason:"node_ready_lease_incomplete"` from 20:30:33.861Z
  (nodes 1, 2) and at 20:44:11.808Z still, now naming **all four nodes** as unready - 13.5 min after the deployer
  called them ready. Heartbeat rows were being written throughout (123-158 `nodes` CDC updates per node during
  step 3, one every 2.3-2.9 s), so the leases are refreshed but the planning owner never observes a complete set.
- Control-plane churn: `CDC obligation delivery held by a subscriber; retry scheduled` **11 869×**, `No row found
  for CDC update` 1 821×, `Out-of-order CDC event detected` 497×, `Terminal transition persist not committed;
  retry ownership kept and repair armed` 197×, one event-loop gap of 1 978 ms. Seed CPU 134 % with one serial
  client; joiners 23-42 % (`out/4node-b/docker-stats.txt`).
- Joiner side (node 2): `Failed to apply initial dynamic config setting: Timed out reading startup dynamic config
  key raft.heartbeatIntervalMs after 300ms`; `Terminal transition repair attempt still unconfirmed; rescheduling` 7×.

The 4-node topology therefore reproduces the three-node product state, one stage earlier (provisioning never
selects a cohort, so no replica exists), and shows the same ~29.8 s typed failure for the Scenario A UPDATE on
every node. Nothing in this topology answers in 35-65 ms except `TABLE_NOT_FOUND` before the schema exists
(152 B, 116 ms here), which remains the only candidate for the published 4-node envelope (§3.5).

## 7. Step 7 - the 5-node topology (tv-dator seed; adam-laptop, adams-gamla, lenovo-laptop, carinas-windows)

Added on the owner's update after carinas-windows became reachable. All five lab hosts are cluster members, so
the probes ran from the controller (192.168.86.210) over the LAN; no separate load-generator host existed.

### 7.1 Deployment (`out/5node/deploy.log`)

Seed started 20:45:20.673Z, predicate after 20 polls (31 s); joiners started 20:45:52.3-55.3Z; predicate on all
five after 17 s (20:46:12.689Z). `/health` bodies as before (`out/5node/health-808*.json`). `nodes` at 20:46:44Z:
five `active`/`ready`, joiners' heartbeats already 22-41 s old with ready leases expired 7-26 s earlier (seed
current); `service_endpoints` 10 rows, healthy.

### 7.2 Results of the scripted steps (same statements and order as §2-3)

#### step2a-membership.json

WS `ws://192.168.86.32:8081/api/admin/stream?lane=bench` opened 2026-11-01T20:46:43.897Z in 132.5 ms; unsolicited server pushes during the probe: 5 (cache_dump, cdc_event)

| # | statement | sent (UTC) | RTT ms | bytes | type | error / errorCode | affectedRows | other envelope fields |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `SELECT * FROM nodes;` | 20:46:44.030 | 85.8 | 3641 | query_result |  |  | `{"count":5,"partitions":["nodes-p1"],"tableName":"nodes","results":"[{\"node_id\": \"00000000-0000-4000-8000-000000000001\", \"node_address\": \"192.168.86.32:8080\", \"cpu_cores\": 12, \"memory_mb\": 15750, \"disk_gb\": 100, \"cpu_usage_perce"}` |
| 2 | `SELECT * FROM service_endpoints;` | 20:46:44.116 | 37.5 | 4442 | query_result |  |  | `{"count":9,"partitions":["service_endpoints-p1"],"tableName":"service_endpoints","results":"[{\"endpoint_id\": \"sys-wasm-meta-ep-00000000-0000-4000-8000-000000000001\", \"service_id\": \"sys-wasm-meta\", \"node_id\": \"00000000-0000-4000-8000-000000000001\", \"pro"}` |

#### step2b-schema.json

WS `ws://192.168.86.32:8081/api/admin/stream?lane=bench` opened 2026-11-01T20:46:46.689Z in 185.6 ms; unsolicited server pushes during the probe: 1763 (cache_dump, cdc_event)

| # | statement | sent (UTC) | RTT ms | bytes | type | error / errorCode | affectedRows | other envelope fields |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `SELECT 1 AS p1;` | 20:46:46.875 | 120.1 | 183 | query_result |  |  | `{"count":1,"partitions":["tables-p1"],"tableName":null,"results":"[{\"p1\": 1}]"}` |
| 2 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:46:46.995 | 106.8 | 152 | query_result | Table not found: bench_accounts / TABLE_NOT_FOUND |  | `{}` |
| 3 | `CREATE TABLE IF NOT EXISTS bench_accounts (account_id TEXT PRIMARY KEY` | 20:46:47.102 | 29874.6 | 303 | query_result |  | 0 | `{"partitions":[],"tableName":null,"contractState":"pending","nextAction":"retry","reasonCodes":[],"jobId":"schema-job-2a17c56aee81c7aece43b7331512674c","retryAfterMs":1000,"provisioningDeadlineExpired":true}` |
| 4 | `CREATE TABLE IF NOT EXISTS bench_orders (order_id TEXT PRIMARY KEY, ac` | 20:47:16.976 | 29992.2 | 303 | query_result |  | 0 | `{"partitions":[],"tableName":null,"contractState":"pending","nextAction":"retry","reasonCodes":[],"jobId":"schema-job-b2c5264ea8d94a2206bc3c9cc7a37afb","retryAfterMs":1000,"provisioningDeadlineExpired":true}` |
| 5 | `CREATE TABLE IF NOT EXISTS bench_risk_events (event_id TEXT PRIMARY KE` | 20:47:46.969 | 29965.7 | 303 | query_result |  | 0 | `{"partitions":[],"tableName":null,"contractState":"pending","nextAction":"retry","reasonCodes":[],"jobId":"schema-job-4c73732481350005ec0d58398668881c","retryAfterMs":1000,"provisioningDeadlineExpired":true}` |
| 6 | `CREATE TABLE IF NOT EXISTS bench_feature_rollups (account_id TEXT PRIM` | 20:48:16.935 | 11622.4 | 304 | query_result |  | 0 | `{"partitions":[],"tableName":null,"contractState":"pending","nextAction":"retry","reasonCodes":["schema_replica_convergence_pending"],"jobId":"schema-job-f1ad3b1341b200b04c125e71e2f0c1e9","retryAfterMs":1000}` |
| 7 | `INSERT INTO bench_accounts (account_id, balance, version) VALUES ('acc` | 20:48:28.557 | 30088.4 | 1030 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":null,"failedTable":"bench_accounts"}}` |
| 8 | `INSERT INTO bench_accounts (account_id, balance, version) VALUES ('acc` | 20:48:58.645 | 29843.3 | 1030 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":null,"failedTable":"bench_accounts"}}` |
| 9 | `INSERT INTO bench_accounts (account_id, balance, version) VALUES ('acc` | 20:49:28.489 | 11346.1 | 1559 | query_result |  | 1 | `{"operation":"INSERT","partitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"tableName":"bench_accounts","writeReceipt":{"successfulParticipantCount":1,"witnessedParticipantCount":1,"commitWitnessComplete":true,"missingCommitWitnessPartitions":[],"durableCommitWitnesses":[{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","leaderNodeId":"00000000-0000-4000-8000-000000000002","leaderReplicaId":"schema-job-2a1` |
| 10 | `INSERT INTO bench_accounts (account_id, balance, version) VALUES ('acc` | 20:49:39.835 | 760.1 | 1560 | query_result |  | 1 | `{"operation":"INSERT","partitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"tableName":"bench_accounts","writeReceipt":{"successfulParticipantCount":1,"witnessedParticipantCount":1,"commitWitnessComplete":true,"missingCommitWitnessPartitions":[],"durableCommitWitnesses":[{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","leaderNodeId":"00000000-0000-4000-8000-000000000002","leaderReplicaId":"schema-job-2a1` |
| 11 | `INSERT INTO bench_feature_rollups (account_id, rollup_sum, rollup_coun` | 20:49:40.595 | 29979.1 | 1045 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-f1ad3b1341b200b04c125e71e2f0c1e9-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":null,"failedTable":"bench_feature_rollups"}}` |
| 12 | `INSERT INTO bench_feature_rollups (account_id, rollup_sum, rollup_coun` | 20:50:10.575 | 29789.1 | 1045 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-f1ad3b1341b200b04c125e71e2f0c1e9-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":null,"failedTable":"bench_feature_rollups"}}` |
| 13 | `INSERT INTO bench_risk_events (event_id, account_id, risk_score, paylo` | 20:50:40.364 | 29890.2 | 1037 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-4c73732481350005ec0d58398668881c-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":null,"failedTable":"bench_risk_events"}}` |

#### step3-update.json

WS `ws://192.168.86.32:8081/api/admin/stream?lane=bench` opened 2026-11-01T20:51:12.822Z in 190.3 ms; unsolicited server pushes during the probe: 8 (cache_dump, cdc_event)

| # | statement | sent (UTC) | RTT ms | bytes | type | error / errorCode | affectedRows | other envelope fields |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:51:13.013 | 424.4 | 737 | query_result |  | 0 | `{"operation":"UPDATE","partitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"tableName":"bench_accounts","writeReceipt":{"successfulParticipantCount":1,"witnessedParticipantCount":0,"commitWitnessComplete":false,"missingCommitWitnessPartitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"durableCommitWitnesses":[],"participantReceipts":[{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","acceptingNodeId":nu` |
| 2 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:51:13.437 | 234.8 | 737 | query_result |  | 0 | `{"operation":"UPDATE","partitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"tableName":"bench_accounts","writeReceipt":{"successfulParticipantCount":1,"witnessedParticipantCount":0,"commitWitnessComplete":false,"missingCommitWitnessPartitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"durableCommitWitnesses":[],"participantReceipts":[{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","acceptingNodeId":nu` |
| 3 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:51:13.672 | 385.9 | 737 | query_result |  | 0 | `{"operation":"UPDATE","partitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"tableName":"bench_accounts","writeReceipt":{"successfulParticipantCount":1,"witnessedParticipantCount":0,"commitWitnessComplete":false,"missingCommitWitnessPartitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"durableCommitWitnesses":[],"participantReceipts":[{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","acceptingNodeId":nu` |
| 4 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:51:14.058 | 201.6 | 737 | query_result |  | 0 | `{"operation":"UPDATE","partitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"tableName":"bench_accounts","writeReceipt":{"successfulParticipantCount":1,"witnessedParticipantCount":0,"commitWitnessComplete":false,"missingCommitWitnessPartitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"durableCommitWitnesses":[],"participantReceipts":[{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","acceptingNodeId":nu` |
| 5 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:51:14.260 | 168 | 737 | query_result |  | 0 | `{"operation":"UPDATE","partitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"tableName":"bench_accounts","writeReceipt":{"successfulParticipantCount":1,"witnessedParticipantCount":0,"commitWitnessComplete":false,"missingCommitWitnessPartitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"durableCommitWitnesses":[],"participantReceipts":[{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","acceptingNodeId":nu` |
| 6 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:51:14.428 | 256.5 | 737 | query_result |  | 0 | `{"operation":"UPDATE","partitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"tableName":"bench_accounts","writeReceipt":{"successfulParticipantCount":1,"witnessedParticipantCount":0,"commitWitnessComplete":false,"missingCommitWitnessPartitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"durableCommitWitnesses":[],"participantReceipts":[{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","acceptingNodeId":nu` |
| 7 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:51:14.684 | 168 | 737 | query_result |  | 0 | `{"operation":"UPDATE","partitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"tableName":"bench_accounts","writeReceipt":{"successfulParticipantCount":1,"witnessedParticipantCount":0,"commitWitnessComplete":false,"missingCommitWitnessPartitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"durableCommitWitnesses":[],"participantReceipts":[{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","acceptingNodeId":nu` |
| 8 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:51:14.852 | 161 | 737 | query_result |  | 0 | `{"operation":"UPDATE","partitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"tableName":"bench_accounts","writeReceipt":{"successfulParticipantCount":1,"witnessedParticipantCount":0,"commitWitnessComplete":false,"missingCommitWitnessPartitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"durableCommitWitnesses":[],"participantReceipts":[{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","acceptingNodeId":nu` |
| 9 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:51:15.013 | 211.2 | 737 | query_result |  | 0 | `{"operation":"UPDATE","partitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"tableName":"bench_accounts","writeReceipt":{"successfulParticipantCount":1,"witnessedParticipantCount":0,"commitWitnessComplete":false,"missingCommitWitnessPartitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"durableCommitWitnesses":[],"participantReceipts":[{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","acceptingNodeId":nu` |
| 10 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:51:15.225 | 222 | 738 | query_result |  | 0 | `{"operation":"UPDATE","partitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"tableName":"bench_accounts","writeReceipt":{"successfulParticipantCount":1,"witnessedParticipantCount":0,"commitWitnessComplete":false,"missingCommitWitnessPartitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"durableCommitWitnesses":[],"participantReceipts":[{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","acceptingNodeId":nu` |
| 11 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:51:15.447 | 246.8 | 738 | query_result |  | 0 | `{"operation":"UPDATE","partitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"tableName":"bench_accounts","writeReceipt":{"successfulParticipantCount":1,"witnessedParticipantCount":0,"commitWitnessComplete":false,"missingCommitWitnessPartitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"durableCommitWitnesses":[],"participantReceipts":[{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","acceptingNodeId":nu` |
| 12 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:51:15.694 | 168.1 | 738 | query_result |  | 0 | `{"operation":"UPDATE","partitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"tableName":"bench_accounts","writeReceipt":{"successfulParticipantCount":1,"witnessedParticipantCount":0,"commitWitnessComplete":false,"missingCommitWitnessPartitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"durableCommitWitnesses":[],"participantReceipts":[{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","acceptingNodeId":nu` |
| 13 | `SELECT * FROM bench_accounts WHERE account_id = 'acct-0';` | 20:51:15.862 | 223.6 | 218 | query_result |  |  | `{"count":0,"partitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"tableName":"bench_accounts","results":"[]"}` |

#### step3x-crossnode-192.168.86.26.json

WS `ws://192.168.86.26:8081/api/admin/stream?lane=bench` opened 2026-11-01T20:51:27.070Z in 11.5 ms; unsolicited server pushes during the probe: 4 (cache_dump, cdc_event)

| # | statement | sent (UTC) | RTT ms | bytes | type | error / errorCode | affectedRows | other envelope fields |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:51:27.082 | 119.7 | 737 | query_result |  | 0 | `{"operation":"UPDATE","partitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"tableName":"bench_accounts","writeReceipt":{"successfulParticipantCount":1,"witnessedParticipantCount":0,"commitWitnessComplete":false,"missingCommitWitnessPartitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"durableCommitWitnesses":[],"participantReceipts":[{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","acceptingNodeId":nu` |
| 2 | `SELECT COUNT(*) AS cnt FROM bench_accounts;` | 20:51:27.201 | 49.7 | 226 | query_result |  |  | `{"count":1,"partitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"tableName":"bench_accounts","results":"[{\"cnt\": 2}]"}` |

#### step3x-crossnode-192.168.86.27.json

WS `ws://192.168.86.27:8081/api/admin/stream?lane=bench` opened 2026-11-01T20:51:24.197Z in 80.4 ms; unsolicited server pushes during the probe: 3 (cache_dump, cdc_event)

| # | statement | sent (UTC) | RTT ms | bytes | type | error / errorCode | affectedRows | other envelope fields |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:51:24.277 | 217.9 | 737 | query_result |  | 0 | `{"operation":"UPDATE","partitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"tableName":"bench_accounts","writeReceipt":{"successfulParticipantCount":1,"witnessedParticipantCount":0,"commitWitnessComplete":false,"missingCommitWitnessPartitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"durableCommitWitnesses":[],"participantReceipts":[{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","acceptingNodeId":nu` |
| 2 | `SELECT COUNT(*) AS cnt FROM bench_accounts;` | 20:51:24.495 | 35.8 | 226 | query_result |  |  | `{"count":1,"partitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"tableName":"bench_accounts","results":"[{\"cnt\": 2}]"}` |

#### step3x-crossnode-192.168.86.34.json

WS `ws://192.168.86.34:8081/api/admin/stream?lane=bench` opened 2026-11-01T20:51:18.621Z in 23.1 ms; unsolicited server pushes during the probe: 4 (cache_dump, cdc_event)

| # | statement | sent (UTC) | RTT ms | bytes | type | error / errorCode | affectedRows | other envelope fields |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:51:18.645 | 84.3 | 737 | query_result |  | 0 | `{"operation":"UPDATE","partitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"tableName":"bench_accounts","writeReceipt":{"successfulParticipantCount":1,"witnessedParticipantCount":0,"commitWitnessComplete":false,"missingCommitWitnessPartitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"durableCommitWitnesses":[],"participantReceipts":[{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","acceptingNodeId":nu` |
| 2 | `SELECT COUNT(*) AS cnt FROM bench_accounts;` | 20:51:18.729 | 16.6 | 226 | query_result |  |  | `{"count":1,"partitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"tableName":"bench_accounts","results":"[{\"cnt\": 2}]"}` |

#### step3x-crossnode-192.168.86.41.json

WS `ws://192.168.86.41:8081/api/admin/stream?lane=bench` opened 2026-11-01T20:51:21.288Z in 42.2 ms; unsolicited server pushes during the probe: 7 (cache_dump, cdc_event)

| # | statement | sent (UTC) | RTT ms | bytes | type | error / errorCode | affectedRows | other envelope fields |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:51:21.330 | 283 | 737 | query_result |  | 0 | `{"operation":"UPDATE","partitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"tableName":"bench_accounts","writeReceipt":{"successfulParticipantCount":1,"witnessedParticipantCount":0,"commitWitnessComplete":false,"missingCommitWitnessPartitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"durableCommitWitnesses":[],"participantReceipts":[{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","acceptingNodeId":nu` |
| 2 | `SELECT COUNT(*) AS cnt FROM bench_accounts;` | 20:51:21.613 | 46.9 | 226 | query_result |  |  | `{"count":1,"partitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"tableName":"bench_accounts","results":"[{\"cnt\": 2}]"}` |

#### step7b-followup.json

WS `ws://192.168.86.32:8081/api/admin/stream?lane=bench` opened 2026-11-01T20:52:53.938Z in 144.4 ms; unsolicited server pushes during the probe: 50 (cache_dump, cdc_event)

| # | statement | sent (UTC) | RTT ms | bytes | type | error / errorCode | affectedRows | other envelope fields |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `INSERT INTO bench_accounts (account_id, balance, version) VALUES ('acc` | 20:52:54.084 | 514 | 1561 | query_result |  | 1 | `{"operation":"INSERT","partitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"tableName":"bench_accounts","writeReceipt":{"successfulParticipantCount":1,"witnessedParticipantCount":1,"commitWitnessComplete":true,"missingCommitWitnessPartitions":[],"durableCommitWitnesses":[{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","leaderNodeId":"00000000-0000-4000-8000-000000000002","leaderReplicaId":"schema-job-2a1` |
| 2 | `INSERT INTO bench_accounts (account_id, balance, version) VALUES ('acc` | 20:52:54.598 | 361.8 | 1561 | query_result |  | 1 | `{"operation":"INSERT","partitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"tableName":"bench_accounts","writeReceipt":{"successfulParticipantCount":1,"witnessedParticipantCount":1,"commitWitnessComplete":true,"missingCommitWitnessPartitions":[],"durableCommitWitnesses":[{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","leaderNodeId":"00000000-0000-4000-8000-000000000002","leaderReplicaId":"schema-job-2a1` |
| 3 | `SELECT * FROM bench_accounts WHERE account_id = 'acct-0';` | 20:52:54.960 | 224.5 | 269 | query_result |  |  | `{"count":1,"partitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"tableName":"bench_accounts","results":"[{\"account_id\": \"acct-0\", \"balance\": 100000, \"version\": 1}]"}` |
| 4 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:52:55.185 | 388.2 | 737 | query_result |  | 1 | `{"operation":"UPDATE","partitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"tableName":"bench_accounts","writeReceipt":{"successfulParticipantCount":1,"witnessedParticipantCount":0,"commitWitnessComplete":false,"missingCommitWitnessPartitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"durableCommitWitnesses":[],"participantReceipts":[{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","acceptingNodeId":nu` |
| 5 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:52:55.573 | 1606.5 | 737 | query_result |  | 1 | `{"operation":"UPDATE","partitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"tableName":"bench_accounts","writeReceipt":{"successfulParticipantCount":1,"witnessedParticipantCount":0,"commitWitnessComplete":false,"missingCommitWitnessPartitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"durableCommitWitnesses":[],"participantReceipts":[{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","acceptingNodeId":nu` |
| 6 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:52:57.179 | 268.3 | 737 | query_result |  | 1 | `{"operation":"UPDATE","partitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"tableName":"bench_accounts","writeReceipt":{"successfulParticipantCount":1,"witnessedParticipantCount":0,"commitWitnessComplete":false,"missingCommitWitnessPartitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"durableCommitWitnesses":[],"participantReceipts":[{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","acceptingNodeId":nu` |
| 7 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:52:57.448 | 266.5 | 737 | query_result |  | 1 | `{"operation":"UPDATE","partitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"tableName":"bench_accounts","writeReceipt":{"successfulParticipantCount":1,"witnessedParticipantCount":0,"commitWitnessComplete":false,"missingCommitWitnessPartitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"durableCommitWitnesses":[],"participantReceipts":[{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","acceptingNodeId":nu` |
| 8 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:52:57.714 | 387.3 | 737 | query_result |  | 1 | `{"operation":"UPDATE","partitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"tableName":"bench_accounts","writeReceipt":{"successfulParticipantCount":1,"witnessedParticipantCount":0,"commitWitnessComplete":false,"missingCommitWitnessPartitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"durableCommitWitnesses":[],"participantReceipts":[{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","acceptingNodeId":nu` |
| 9 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:52:58.102 | 276.1 | 737 | query_result |  | 1 | `{"operation":"UPDATE","partitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"tableName":"bench_accounts","writeReceipt":{"successfulParticipantCount":1,"witnessedParticipantCount":0,"commitWitnessComplete":false,"missingCommitWitnessPartitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"durableCommitWitnesses":[],"participantReceipts":[{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","acceptingNodeId":nu` |
| 10 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:52:58.378 | 211.7 | 738 | query_result |  | 1 | `{"operation":"UPDATE","partitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"tableName":"bench_accounts","writeReceipt":{"successfulParticipantCount":1,"witnessedParticipantCount":0,"commitWitnessComplete":false,"missingCommitWitnessPartitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"durableCommitWitnesses":[],"participantReceipts":[{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","acceptingNodeId":nu` |
| 11 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:52:58.590 | 187.9 | 738 | query_result |  | 1 | `{"operation":"UPDATE","partitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"tableName":"bench_accounts","writeReceipt":{"successfulParticipantCount":1,"witnessedParticipantCount":0,"commitWitnessComplete":false,"missingCommitWitnessPartitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"durableCommitWitnesses":[],"participantReceipts":[{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","acceptingNodeId":nu` |
| 12 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:52:58.778 | 167.4 | 738 | query_result |  | 1 | `{"operation":"UPDATE","partitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"tableName":"bench_accounts","writeReceipt":{"successfulParticipantCount":1,"witnessedParticipantCount":0,"commitWitnessComplete":false,"missingCommitWitnessPartitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"durableCommitWitnesses":[],"participantReceipts":[{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","acceptingNodeId":nu` |
| 13 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:52:58.945 | 263.6 | 738 | query_result |  | 1 | `{"operation":"UPDATE","partitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"tableName":"bench_accounts","writeReceipt":{"successfulParticipantCount":1,"witnessedParticipantCount":0,"commitWitnessComplete":false,"missingCommitWitnessPartitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"durableCommitWitnesses":[],"participantReceipts":[{"partitionId":"tbl-2a17c56aee81c7aece43b7331512674c-p1","acceptingNodeId":nu` |
| 14 | `SELECT * FROM bench_accounts WHERE account_id = 'acct-0';` | 20:52:59.209 | 151.8 | 271 | query_result |  |  | `{"count":1,"partitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"tableName":"bench_accounts","results":"[{\"account_id\": \"acct-0\", \"balance\": 100010, \"version\": 11}]"}` |
| 15 | `SELECT COUNT(*) AS cnt FROM bench_accounts;` | 20:52:59.361 | 268.7 | 227 | query_result |  |  | `{"count":1,"partitions":["tbl-2a17c56aee81c7aece43b7331512674c-p1"],"tableName":"bench_accounts","results":"[{\"cnt\": 4}]"}` |
| 16 | `SELECT COUNT(*) AS cnt FROM bench_orders;` | 20:52:59.630 | 144.4 | 225 | query_result |  |  | `{"count":1,"partitions":["tbl-b2c5264ea8d94a2206bc3c9cc7a37afb-p1"],"tableName":"bench_orders","results":"[{\"cnt\": 0}]"}` |
| 17 | `SELECT COUNT(*) AS cnt FROM bench_feature_rollups;` | 20:52:59.774 | 461.8 | 1005 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-f1ad3b1341b200b04c125e71e2f0c1e9-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":351,"failedTable":null}}` |
| 18 | `SELECT COUNT(*) AS cnt FROM bench_risk_events;` | 20:53:00.236 | 399.4 | 1005 | query_result | Distributed operation failed due to participant failures / DISTRIBUTED_PARTICIPANT_FAILURE |  | `{"participantFailuresOmittedCount":0,"firstFailedParticipant":{"partitionId":"tbl-4c73732481350005ec0d58398668881c-p1","participantNodeId":null,"error":"Partition service not found","errorCode":null,"failureCode":null,"durationMs":205,"failedTable":null}}` |
| 19 | `SELECT * FROM nodes;` | 20:53:00.636 | 256.7 | 3788 | query_result |  |  | `{"count":5,"partitions":["nodes-p1"],"tableName":"nodes","results":"[{\"node_id\": \"00000000-0000-4000-8000-000000000001\", \"node_address\": \"192.168.86.32:8080\", \"cpu_cores\": 12, \"memory_mb\": 15750, \"disk_gb\": 100, \"cpu_usage_perce"}` |

#### step7c-pgwire.json: public PG wire (pg Client -> 192.168.86.32:5432, connect 543.3 ms, connectError None)

| # | statement | sent (UTC) | RTT ms | outcome | SQLSTATE | message | rowCount |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `SELECT 1 AS p1;` | 20:54:27.506 | 133.9 | ok |  |  | 1 |
| 2 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:54:27.640 | 592.3 | ok |  |  | 1 |
| 3 | `UPDATE bench_accounts SET balance = balance + 1, version = version + 1` | 20:54:28.233 | 288.6 | ok |  |  | 1 |
| 4 | `SELECT * FROM bench_accounts WHERE account_id = 'acct-0';` | 20:54:28.521 | 148.6 | ok |  |  | 1 |
| 5 | `SELECT COUNT(*) AS cnt FROM bench_accounts;` | 20:54:28.670 | 229.5 | ok |  |  | 1 |

### 7.3 What differed: the `bench_accounts` partition became routable after ~2 min 40 s

- `CREATE TABLE bench_accounts` sent 20:46:47.1Z (answered `pending`, `provisioningDeadlineExpired`, 29.9 s).
  Seed log: provisioning failed at 20:47:19.4Z (`required=2, provisionable=0`), degraded fallback at 20:47:26.3Z,
  ADD operations to node 2 and node 3 (replicas `active` on both at 20:47:38Z), the seed's own replica active at
  20:48:04.9Z, further provisioning failures at 20:47:50, 20:48:22, 20:48:36, 20:48:40, 20:49:12Z (6 in all for
  this table), replica on carinas-windows (node 5) active at 20:49:22.6Z; **first successful write 20:49:39.8Z**
  (INSERT `acct-2`, 11.3 s, `affectedRows:1`, `writeReceipt.commitWitnessComplete:true`, leader node 2, term 1,
  logIndex 5) and INSERT `acct-3` 760 ms later (logIndex 6). The two INSERTs issued before that moment (`acct-0`,
  `acct-1`, 20:48:28Z and 20:48:58Z) had already failed with the participant error after 30.1 s / 29.8 s. Time
  from CREATE to usable: **~2 min 41 s** (172 s), measured by the first statement that could possibly observe it.
- `bench_orders` became routable too (COUNT = 0 at 20:52:59Z); `bench_feature_rollups` and `bench_risk_events`
  were still `Partition service not found` at 20:53:00Z (6 min after their CREATEs; 9 and 5 provisioning failures).
- The scripted Scenario A UPDATEs (20:51:13-15Z) then answered in **161-424 ms** on the seed and 84-283 ms on the
  four joiners, `affectedRows:0` - a "successful" write of zero rows, because `acct-0` had never been inserted
  (D08 observed live: the base driver would have counted these as committed operations). Readback: `results:[]`,
  `count:0`; COUNT(*) = 2 on every node.
- Follow-up (`out/5node/step7b-followup.json`, 20:52:54-20:53:01Z) on the routable table: INSERT `acct-0` 514 ms
  and `acct-1` 362 ms (both `affectedRows:1`, `commitWitnessComplete:true`, leader node 2, term 1, logIndex 23/24);
  readback `{"account_id":"acct-0","balance":100000,"version":1}`; **ten UPDATEs of `acct-0`: 388, 1 607, 268, 267,
  387, 276, 212, 188, 167, 264 ms, each `affectedRows:1`**; readback
  `{"account_id":"acct-0","balance":100010,"version":11}` - balance and version advanced by exactly the ten
  acknowledged updates; COUNT(*) = 4. Every one of these answers is below 5 s.
- The UPDATE write receipt differs from the INSERT receipt: `writeReceipt.commitWitnessComplete:false`,
  `witnessedParticipantCount:0`, `missingCommitWitnessPartitions:["tbl-2a17…-p1"]`,
  `participantReceipts[0].acceptingNodeId:null`, `durableCommitWitness:null`, `complete:false`, while
  `affectedRows:1` and `successfulParticipantCount:1` (full envelope in `step7b-followup.json` #4). The product
  acknowledges the UPDATE without a durable commit witness; the harness's outcome owner must not read an
  incomplete receipt as proof of durable commit. (Observation; no claim about durability is made here.)
- `nodes` at 20:53:01Z: nodes 3 and 4 showed heartbeats **236-242 s old, ready leases expired ~4 min earlier**,
  nodes 2 and 5 19-20 s old / expired 4-5 s, seed current. The rebalancer still reported
  `topology_settling_blocked` / `node_ready_lease_incomplete` for four of five nodes at 20:51:26Z; `Critical
  rebalancing state detected` (`control_plane_replicas_not_spread: 2/5`) at 20:49:51Z. Control-plane churn as
  before: `CDC obligation delivery held by a subscriber; retry scheduled` 11 520×, `Terminal transition persist not
  committed` 740×, `Terminal transition repair abandoned: a different durable terminal state won` 201× (seed,
  27 823 lines, 15 783 at warn/error). Seed CPU 136 %, carinas-windows node 26 % (`out/5node/docker-stats.txt`).

### 7.4 Steps 4 and 5 repeated on the routable 5-node cluster

PG wire (`out/5node/step7c-*`): `POST …/sys-postgres-wire/scale` → HTTP 200 in 309 ms, `success:true,
outcome:"applied", scaleState:"desired_state_persisted"`; the healthy `service_endpoints` row appeared at the third
poll, this time on node 1 (the seed) `0.0.0.0:5432`. `pg` connect 543 ms; results (20:54:27-28Z):

| # | statement | RTT ms | command | rowCount | rows |
| --- | --- | --- | --- | --- | --- |
| 1 | `SELECT 1 AS p1;` | 133.9 | SELECT | 1 | `[{"p1":"1"}]` |
| 2 | `UPDATE bench_accounts … 'acct-0'` | 592.3 | UPDATE | 1 | `[]` |
| 3 | `UPDATE bench_accounts … 'acct-0'` | 288.6 | UPDATE | 1 | `[]` |
| 4 | `SELECT * FROM bench_accounts WHERE account_id = 'acct-0';` | 148.6 | SELECT | 1 | `[{"account_id":"acct-0","balance":"100012","version":"13"}]` |
| 5 | `SELECT COUNT(*) AS cnt FROM bench_accounts;` | 229.5 | SELECT | 1 | `[{"cnt":"4"}]` |

The write + readback round trip works end to end once the partition is routable, and the readback agrees with the
admin-stream state (100010/11 → 100012/13 after exactly two acknowledged UPDATEs). Integer columns are delivered
as text (`"100012"`, `"13"`, `"4"`, `"1"`), i.e. the wire sends the text format without typed OIDs the `pg`
driver would parse; an adapter comparing numbers must coerce.

Adapter (`out/5node/step7d-adapter-smoke.json`): `createLagrangeOltpAdapter` against the same endpoint failed
after **33 695 ms**: `CREATE TABLE warehouse` → `55P03 Schema provisioning remains active` after ~30 s, then the
adapter's provisioning poll `tableExists('warehouse')` issued `SELECT COUNT(*) AS row_count FROM warehouse` and the
product answered `XX000 Distributed operation failed due to participant failures` (the table row exists, its
partition is not yet routable) - a message the adapter's contract (`lagrange-oltp-adapter.js:349-359`) classifies
as fatal because only `Table not found` means "not yet". The adapter therefore re-threw after one poll instead of
waiting its 120 s budget. Two product facts combine here: provisioning of a fresh table takes minutes, and during
that window reads of the table fail with a participant error rather than a provisioning-state error. No
transaction family was exercised.

Answer (a), completed by this topology: once a partition is routable, the admin-stream Scenario A UPDATE answers in
0.17-1.6 s with `operation:"UPDATE"`, `affectedRows:1`, `partitions:["tbl-…-p1"]`, `tableName`, a `writeReceipt`
(without durable commit witness), `results:[]`, `count:0` (737-738 B); while the partition is not routable it
answers in ~29.8 s with the participant failure (1 032 B); when the table does not exist it answers in ~0.1 s
with `TABLE_NOT_FOUND` (152 B); and when the row does not exist it answers in 0.16-0.42 s with `affectedRows:0`.
The published 5 s timer can only distinguish the second case from the other three, and it mislabels all four.

## 8. Classification

Owner vocabulary from the brief: client handling | setup/readiness | routing | transaction execution | product defect.
"First causal divergence" names the earliest point at which the observed run departed from what a correct
measurement would have done.

| # | Observation | First causal divergence | Owner | Evidence file(s) | Confidence |
| --- | --- | --- | --- | --- | --- |
| C1 | Published 3-/5-node Scenario A rows: every latency 4999-5003 ms, 64 B/op, `timeouts: 0`, 100 % "completed". Live: every UPDATE answers at 29.7-29.8 s with `DISTRIBUTED_PARTICIPANT_FAILURE`. | `queryLagrangeWs` resolves `{ok:false, bytes:64}` at 5 000 ms and the worker counts it completed (`real-product-workload-drivers.js:139-154, 453-460`); the product's answer arrives ~25 s later and is discarded (`pendingByQueryId.delete`). | client handling (D01/D03) | `out/3node-hub/step3-update.json`, `step3-envelopes.txt`, `tables-for-evidence.md` §3 | high |
| C2 | On a cluster that passes the deployer's readiness predicate, no user-table partition becomes routable: INSERT/UPDATE/SELECT fail with `Partition service not found` for ≥ 21 min on all nodes and on both public paths; `CREATE TABLE` answers `contractState:"pending"` and never settles. | Seed log 19:52:27Z: provisioning cohort `required=2, provisionable=0`; 19:53:21Z routing denied `serveEligible` by `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING` (projection readiness `recovery_open`, serve lane `publication_stream_not_ready`, `priority_recovery_active`); 20:13Z rebalancer still `topology_settling_blocked`/`node_ready_lease_incomplete`. Replicas themselves reached `active` at 19:52:53Z. | product defect (routing / schema provisioning convergence) | `out/3node-hub/node-logs-192.168.86.32.txt`, `logs-late/`, `step2b-schema.json`, `step2c-tables.json`, `step5b-final-usability.json` | high (reproduced on every statement; the cause chain is the product's own diagnostics) |
| C3 | The harness called the cluster "ready" 15 s after the joiners started. | `/health` `ready:true` means only that the SQL engine object exists (`src/bootstrap/bootstrap-api-server-methods.js:153-171`); the deployer tests that substring (`real-product-cluster-deployers.js:237-249, 271-285`) and never reads serve-eligibility, membership, ready leases or the schema job's `contractState`. | setup/readiness (D05 class) | `out/3node-hub/deploy.log`, `health-808*.json`, `step2a-membership.json` | high |
| C4 | 4-node published row: 35-65 ms, ~153 B/op, 0 timeouts. | The only ≤ 100 ms admin answer the Scenario A UPDATE produces is `Table not found: bench_accounts / TABLE_NOT_FOUND`, 152-154 B with the driver's `op-<idx>-<ts>` ids (mean 153.3 B over 160 ops). Tables were never registered on the queried nodes; the DDL runner's 12 s/3 s per-statement waits and 8 s WS-open race (`:150-173`) make a silently abandoned CREATE the likely path. | client handling (D03) over a setup failure (schema never created) | `out/envelope-size-reproduction.txt`, `step2b-schema.json` #2 | high for the envelope identity; medium for which abandonment path the 4-node run took |
| C5 | Seed INSERT seeds (`acct-0..3`) never existed in any run. | Each INSERT answers after ~29.9 s with the participant failure; the deployer's runner waits 3 s per INSERT and ignores the answer (`:157-173`). Even a converged cluster would have had its seeds abandoned client-side. | client handling + product (C2) | `step2b-schema.json` #7-13 | high |
| C6 | Public PG wire: scale + discovery OK, SQL fails `XX000`. | Same partition unroutability as C2; the wire maps `DISTRIBUTED_PARTICIPANT_FAILURE`/`Partition service not found` to generic `XX000` with no detail. | product defect (C2); minor: SQLSTATE fidelity | `step4a-scale-response.txt`, `step4b-endpoints-poll.log`, `step4c-pgwire.json` | high |
| C7 | Canonical adapter dataset preparation fails: first `CREATE TABLE warehouse` → `55P03 Schema provisioning remains active`, table never visible in 120 s. | C2 reached through the documented provisioning contract. | product defect (schema provisioning convergence) | `step5-adapter-smoke.json`, `step5b-final-usability.json` | high |
| C8 | The registered lab image `psvensson/lagrange:0.4.0` (`sha256:d5b7b368…`, on 4 of 5 hosts) cannot start a seed: `ORIGINAL_ALLOCATION_HOLD`, `stat '/app/node_modules/@bytecodealliance/componentize-js'` ENOENT, exit 1 in 1.7 s. | The image is 0.2.5's runtime + node_modules with 0.4.0 sources layered on top and no `npm ci`; the product's boot measurement fails closed on the inconsistent dependency set. | setup (image provenance); product behaved as designed | `out/3node/seed-exit-logs.txt`, `image-inspect-*.txt`, `image-contents-*.txt` | high |
| C9 | "0.4.0" names five different artifacts; the GCP campaign's digest (`sha256:5437366a…`) is not on Docker Hub. | Campaign images were `docker load`ed from a controller tarball; the harness records the tag plus one RepoDigest of whatever image the tag resolved to (D18). | setup (identity) | `out/hub-manifest-*.txt`, `hub-image-inspect-*.txt`, `lenovo-pull-error.txt` | high |
| C10 | `?lane=bench` has no product meaning; `SELECT 1` is unanswerable on the admin stream; each admin client receives a ~250 KB `cache_dump` on connect plus ~2.8 `cdc_event`/s. | Harness assumptions about the admin stream were never checked against the owner (`admin-websocket-api-shared.js:136-139`). | client handling (measurement surface) | `step2b-schema.json` (unsolicited), `step2a-membership.json` | high |
| C11 | 5-node: `bench_accounts` became routable ~2 min 41 s after CREATE (6 provisioning failures, degraded fallback, replicas active on nodes 2/3 at +51 s, seed +78 s, node 5 +155 s; first commit +172 s); `bench_feature_rollups`/`bench_risk_events` still unroutable at +6 min. 3-/4-node: never within 13-21 min. | Schema provisioning convergence is non-deterministic and far slower than every client-side wait in the base harness (12 s DDL, 3 s INSERT, 5 s op) and than the adapter's 120 s provisioning budget. | product defect (schema provisioning / placement convergence); setup/readiness for the harness waits | `out/5node/node-logs-192.168.86.32.txt`, `step2b-schema.json`, `step7b-followup.json` | high |
| C12 | 5-node scripted UPDATEs answered in 0.16-0.42 s with `affectedRows:0` (row never inserted), `results:[]`; readback empty. | The base driver treats any `query_result` as a completed business operation and never reads `affectedRows` (D03/D08); seeds `acct-0..3` are inserted with a 3 s wait and never verified. | client handling (D08 observed live) | `out/5node/step3-update.json`, `step3x-crossnode-*.json` | high |
| C13 | Successful UPDATE receipts carry `commitWitnessComplete:false`, `witnessedParticipantCount:0`, `participantReceipts[0].acceptingNodeId:null`, while INSERT receipts carry a durable commit witness (leader, term, logIndex). | Product write-receipt shape differs by statement kind; the outcome owner must not infer durable commit from `affectedRows` alone. | transaction execution (observation for the receipt owner; no durability claim made) | `out/5node/step7b-followup.json` #1 vs #4 | high (observed on 12 UPDATE receipts) |
| C14 | On all three topologies the `nodes` system table shows joiners' heartbeats 20-40 s old and ready leases expired within 20-60 s of the deployer predicate; on the 5-node cluster two nodes reached 4 min stale while still serving writes; the rebalancer reports `node_ready_lease_incomplete` throughout. | Control-plane publication path (`CDC obligation delivery held by a subscriber` 4 845-11 869×, `replica_operations-p1` write timeouts) starves the readiness/lease publication the planner consumes. | product defect (readiness publication / control-plane recovery) | `step2a-membership.json` (all topologies), `step7b-followup.json` #19, seed logs | medium-high (consistent across runs; internal owner not traced to a single line) |
| C15 | 5-node, routable partition: public PG wire write + readback works (UPDATE rowCount 1 in 0.29-0.59 s, readback consistent with the admin stream); integer columns are returned as text strings. | None for correctness; the wire's text-format typing is a fidelity gap for numeric comparison in adapters. | transaction execution (works); minor product (wire typing) | `out/5node/step7c-pgwire.json` | high |
| C16 | Canonical adapter setup fails on the routable 5-node cluster in 33.7 s: 55P03 on CREATE, then `tableExists` gets `XX000 … participant failures` for a table whose partition is provisioning, which the adapter treats as fatal. | Product answers a read of a not-yet-routable table with a participant failure instead of a not-found/provisioning state; the adapter's contract only tolerates `Table not found`. | product defect (provisioning-window error class) + adapter contract gap | `out/5node/step7d-adapter-smoke.json` | high |


## 9. Procedure deviations, blockers, and what was not done

Reported rather than worked around:

1. **The registered lab image cannot run.** `psvensson/lagrange:0.4.0` on tv-dator/adam-laptop/adams-gamla/
   carinas-windows (`sha256:d5b7b368…`) exits 1 at seed start (§1.2). All live steps used the Docker Hub `0.4.0`
   tag pulled by digest (`sha256:c0fcc0d3…`), which is a different artifact from the one the GCP campaign ran
   (`sha256:5437366a…`, no longer on the registry). The deployer's docker command was otherwise unchanged; the
   image argument is the one substitution.
2. **lenovo-laptop cannot pull from Docker Hub** (its daemon is logged in to an account the registry refuses:
   "unauthorized: your account must log in with a Personal Access Token"); the image was moved by
   `docker save | docker load` through the controller (id preserved, RepoDigest not). The first 4-node attempt
   lost ten minutes because the config id is not a valid reference on Docker 29's containerd store; the fix was
   one local tag per host (`lagrange-live-diagnosis:hub-0.4.0`), removed at cleanup.
3. **lenovo-laptop's checkout runs node v14.17.5** and cannot execute the quest-branch harness, so every client
   probe ran from the controller over the LAN (the controller was never used to form a cluster). For the 5-node
   topology all five lab hosts were cluster members, so there was no lab host left for a separate load generator
   either; the probes again ran from the controller (owner update, §7).
4. **No 5 s timer anywhere.** Every probe waited 90 s per statement and recorded the real answer; the only
   deadlines in play were the product's own 30 s admin query budget / transport timeout.
5. **The lock holder record on carinas-windows carries `sha` `69a26626d`** (the worktree HEAD had moved from
   `6dce1bbc2` to `69a26626d` between 19:37Z and 19:55Z through another agent's commit); the other four records
   carry `6dce1bbc2`.
6. **`SELECT control_snapshot_local()` is not a function on 0.4.0** (`no such function`), although the base
   deployer's proof list issues it (p29) and counts the error as a failed proof - or, with the `|| 33` fallback,
   as a pass.
7. **Not done:** the 33 "semantic proofs", Scenario B/C statements, any concurrency, any throughput or quantile
   computation, any `tc` impairment, PostgreSQL/TiDB comparators. Steps 4 and 5 were not repeated on the 4-node
   cluster (identical product state to the 3-node one); they were repeated on the 5-node cluster once a partition
   had become routable (§7.4).
9. **Left on the hosts deliberately:** the untagged Docker Hub image (`psvensson/lagrange@sha256:c0fcc0d3…` on
   .32/.34/.41/.26; dangling id `18aeffc9…` on .27), ~600 MB each, so a re-run needs no pull; remove with
   `docker rmi psvensson/lagrange@sha256:c0fcc0d3df37e3b1c4760edea289ac5fb9ad9fd745e489b0f1b44b4e31da46fb` (and
   `docker rmi 18aeffc977a2` on lenovo-laptop). Everything else of this campaign - containers, the temporary
   `lagrange-live-diagnosis:hub-0.4.0` tag, holder records, lock-holder shells, helper files under `~/.lab` - was
   removed and verified absent on all five hosts (`out/5node/cleanup.txt`). The registered `:0.4.0` tags were not
   touched.
8. **Thermal and load**: all hosts under the hold thresholds throughout; the seed container ran at 134-139 % CPU
   while serving one serial client, which is the product's control-plane churn, not load from the probes.

## 10. Retained files (all under the scratchpad directory named at the top)

| Path | Content |
| --- | --- |
| `command-log.txt` | timestamped command log of every step |
| `scripts/` | `deploy-cluster.sh` (deployer replay), `ws-probe.mjs`, `pg-probe.mjs`, `adapter-smoke.mjs`, `run-steps.sh`, `node-logs.sh`, `teardown.sh`, `cleanup.sh`, `live-diagnosis-lockholder.sh`, `schema-statements.json`, `gen-tables.py`, `assemble.py` |
| `out/step1-locks-*.txt`, `out/step1-identity-192.168.86.26.txt` | lock HELD lines, holder records, thermal sensors per host |
| `out/image-inspect-*.txt`, `out/image-contents-*.txt`, `out/hub-manifest-*.txt`, `out/hub-image-inspect-*.txt`, `out/lenovo-pull-error.txt` | image identity evidence |
| `out/3node/` | first attempt on the lab image: `deploy.log`, `seed-exit-logs.txt` (full fatal log) |
| `out/3node-hub/` | 3-node run: `deploy.log`, `deploy-commands.log`, `health-808{0,1}-*.json`, `container-inspect-*.txt`, `step2a-membership.json`, `step2b-schema.json` (+`step2b-envelopes.txt`), `step2c-tables.json`, `step3-update.json` (+`step3-envelopes.txt`), `step3x-crossnode-*.json`, `step4a-scale-response.txt`, `step4b-endpoints-poll.{json,log}`, `step4c-pgwire.json`, `step5-adapter-smoke.json`, `step5b-final-usability.json`, `node-logs-*.txt` (19:50-19:57Z), `logs-late/node-logs-*.txt` (19:57-20:13Z), `docker-stats-during-step3.txt`, `teardown.txt`, `tables-for-evidence.md` |
| `out/4node/` | failed first 4-node attempt (`deploy.log`, `attempt1-node4-alone-logs.txt`, `attempt1-teardown.txt`) |
| `out/4node-b/` | 4-node run: same file set as 3node-hub for steps 1-3 and 3x, `node-logs-*.txt`, `docker-stats.txt`, `teardown.txt` |
| `out/5node/` | 5-node run: same file set, plus `step7b-followup.json` (seed inserts, 10 UPDATEs, readback, counts, nodes), `step7c-scale-response.txt`, `step7c-endpoints-poll.{json,log}`, `step7c-pgwire.json`, `step7d-adapter-smoke.json`, `logs-late/`, `cleanup.txt` |
| `out/envelope-size-reproduction.txt` | the 153-byte arithmetic |
