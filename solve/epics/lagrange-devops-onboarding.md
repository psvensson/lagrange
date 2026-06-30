# Epic: Lagrange DevOps Onboarding (Docker + Kubernetes try-it path)

Status: active
Roadmap: Phase 0.5 — External Usability › Cluster Deployment Experience
Primary roadmap row: `RM-0.5-cde-helm-chart` (also advances `RM-0.5-cde-docker-compose`,
`RM-0.5-cde-dockerfile` image-publish, and `RM-0.5-dw-getting-started`)
Quest: `lagrange-devops-onboarding`

This page is the **deployment description** the roadmap requires before the
Kubernetes Helm chart row (`🔧`) expands into tasks: it covers the values
surface, networking, storage, bootstrap flow, and upgrade/restart behavior.

## Intent

A DevOps-savvy person can stand up a real multi-node Lagrange cluster — locally
with one `docker compose up`, or on Kubernetes via a Helm chart — and reach a
working `psql` SQL round-trip within ~30 minutes, satisfying the Phase 0.5 exit
criterion. Today there is **no path to run Lagrange itself on Docker Compose or
Kubernetes**: the Dockerfile image is published nowhere, and the only k8s artifact
(`examples/kubernetes-endpoint-sync-controller/`) is a *sidecar* that projects
endpoints and presupposes an already-running cluster it cannot create.

## Onboarding mental model (operator-set 2026-06-28)

Lagrange is a distributed **data + service platform** — think "a tiny Kubernetes
and Postgres in one process group." The cluster (compose/Helm) brings up the
*platform*; everything else, **including SQL, is a service the platform runs**.
W0 confirmed empirically that a bare single seed opens 8080/8081/8082 but **not
5432**. CORRECTION (post-review, see W0/W0b below): the pgsql service does **not**
ship "stopped". `createPostgresWireDefinition()` seeds it with `replica_count=3`
and `serializeServiceDefinition` defaults `status='active'`
(`src/wasm-service/meta-service-factory.js:85-102`, `src/wasm-service/wasm-service-models.js:156-173`)
— so the definition is **active and wants 3 replicas**. 5432 is closed on the
single seed because **no runtime replica was placed**, not because of a status
flag. The listener opens only when the rebalancer places a `RUNTIME_SERVICE`
replica and `RuntimeServiceHandler` materializes it via
`pgwire-runtime-module.start()` (`src/runtime/pgwire-runtime-module.js:256-270`)
behind `PgWireStartupSafetyGate`. **DECISION D2 (below): the SQL service ships
not-started; the operator starts it explicitly.** W0b pins the placement mechanism
so `start` can drive it. The teaching arc is:

1. Bring up the cluster (compose or Helm) — **≥3 nodes** (the replica floor; see Risks).
2. **Manage services through the `lagrange service` API** (list / status / start /
   stop / scale / deploy). Today the only surface is raw SQL on
   `service_definitions` over the admin-WS `query` channel
   (`docs/wasm-services-user-guide.md` §3–6); there is **no clean verb surface**
   and **no `start`/`stop` mechanism at all** — that gap is the WS-API workstream.
3. **`lagrange service list`** shows `sys-postgres-wire` present but **not placed**;
   **`lagrange service start sys-postgres-wire`** places its replica → 5432 opens.
4. Connect with `psql`, run SQL.
5. **Deploy a small hello-world service** — the same API path, teaching how to run
   *your own* services on Lagrange.

The honest version of the "psql isn't on by default on one node" moment is a
teaching moment about Lagrange being a placement-driven service platform.

## Ground-truth wiring (verified against source — do not regress)

Authoritative env→config map: `src/config/config-constants.js:285-322` (`ENV_MAPPINGS`).
Proven seed/join wiring to transcribe: `test/distributed/harness/cluster-class-lifecycle-base.js:270-319` (`_buildNodeEnv`).

Port map (the prompt's "8080/8081/9080" framing is WRONG):

| Port | Purpose | Expose to clients? |
|------|---------|--------------------|
| 8080 | REST/HTTP: bootstrap, peer join intake, probes (`/livez /startupz /readyz /bootstrap/ready`) | yes (probes + join) |
| 8082 | WebSocket peer transport (raft/CDC), = REST+2 via `WS_PORT_OFFSET` | **internal only** (pod-to-pod) |
| 8081 | Admin WebSocket (`lagrange-admin` CLI). **Hardcoded, not env-configurable** (`src/admin/admin-websocket-api-base.js:153`) | optional |
| 5432 (5432–5532) | PostgreSQL wire protocol — **this is the `psql` port** (`src/runtime/pgwire-runtime-module.js:40`) | yes |

`Dockerfile:15` `EXPOSE 8080 8081 9080` is stale — correct to `8080 8081 8082 5432`.

Env vars actually wired (only these — others are ignored):
- `NODE_ID` → if unset, a **new uuidv4 every boot** (`src/config/configuration-manager.js:70-71`). MUST be stable per replica.
- `SEED_NODE_ADDRESS` → presence selects join-vs-seed branch (`src/index.js:847`). Unset ⇒ this node is the seed.
- `NODE_ADDRESS` → own advertised `host:port` (default `localhost:8080` — must be the routable DNS name).
- `NODE_ADVERTISED_WS_ADDRESS` → advertised WS (8082) address peers dial.
- `REST_API_PORT` (default 8080), `DATA_DIR` (default `./data`; raft+SQLite live at `{DATA_DIR}/partitions/{partitionId}/{replicaId}.db`), `TRANSPORT_WS_HOST` (set `0.0.0.0` in containers), `LOG_LEVEL`, `LOG_PRETTY_PRINT`.
- Join tuning: `LAGRANGE_JOIN_REATTEMPT_MAX_ATTEMPTS` (default 4), `NODE_JOINING_*_TIMEOUT_MS`.

Known non-knobs (document, do not add dead values): `NODE_WS_PORT` config key exists
but is **not** in `ENV_MAPPINGS` (cannot move WS port via env); admin port 8081 is hardcoded.

## Design

### docker-compose (3-node) — verified working in W0b
- `seed`: `NODE_ID=lseed` (seeds accept any id), `NODE_ADDRESS=seed:8080`, `REST_API_PORT=8080`,
  `TRANSPORT_WS_HOST=0.0.0.0`, `DATA_DIR=/data`, **no** `SEED_NODE_ADDRESS`, volume `seed-data:/data`.
  Publish host `8080`, `5432`, `8081`. **Do NOT set `NODE_ADVERTISED_WS_ADDRESS`** (R15 — crashes boot).
- `node-2`/`node-3`: same shape + `SEED_NODE_ADDRESS=seed:8080`, distinct address/volume, and a
  **valid-UUID `NODE_ID`** (R14 — joiners with a non-UUID id are rejected `HTTP 400`). Do not publish
  5432 from all three (clash) — publish seed's, or map 5433/5434.
- 8082 (WS peer transport) stays inside the compose network — WS advertised address derives from
  `node.address`, so `node-2:8082`/`node-3:8082` resolve on the compose network. `healthcheck` =
  `GET :8080/readyz`; joiners `depends_on: { seed: { condition: service_healthy } }` (first-boot race).

### Helm chart (`charts/lagrange/`, StatefulSet)
- Headless `Service` (`clusterIP: None`, name `lagrange`) ⇒ stable DNS `lagrange-0.lagrange.<ns>.svc.cluster.local`.
- `StatefulSet` `serviceName: lagrange`, `podManagementPolicy: OrderedReady` (so `lagrange-0` is the seed and Ready before joiners start).
- Per-pod identity via entrypoint wrapper: `NODE_ADDRESS=$POD_NAME.lagrange.$NS.svc:8080`,
  `TRANSPORT_WS_HOST=0.0.0.0`, `DATA_DIR=/data`; `SEED_NODE_ADDRESS=lagrange-0.lagrange.$NS.svc:8080`
  **only for ordinal>0**. **`NODE_ID` must be a stable UUID, NOT the pod name** (R14 — joiners are
  rejected unless the id is a UUID). Generate a UUID on first boot and persist it in the PVC
  (`$DATA_DIR/node-id`), reusing it on restart; the seed (ordinal 0) may use any id. **Do NOT set
  `NODE_ADVERTISED_WS_ADDRESS`** (R15). The PVC-persisted UUID is what makes restart = auto-rejoin.
- `volumeClaimTemplates` (one PVC per pod at `/data`) ⇒ restart re-binds same PVC ⇒ same persisted
  NODE_ID + raft log ⇒ auto-rejoin, not fresh identity.
- Client services: `lagrange-sql` (5432), `lagrange-admin` (8081, optional). Probes from `docs/bootstrap-readiness-probes.md:52-74` (startup `/startupz`, readiness `/readyz`, liveness `/livez`, all 8080) so client services route only to Ready nodes.
- Configurable: `replicas`, `resources`, `securityContext` (non-root), `storageClassName`, `image`/`tag`.

### Image publish
- GitHub Actions buildx → `ghcr.io/<org>/lagrange:<semver>` + `:latest`, `linux/amd64`+`linux/arm64`. AGPL license labels. Consider multi-stage to drop the `python3/make/g++` build toolchain.

### Why pgwire is never placed — RESOLVED (W0b follow-up, 2026-06-28). Fake-endpoints hypothesis REFUTED.
The deficit is not 0 because of the seeded endpoints — `sys-postgres-wire` is simply **absent from every
reconciliation set**. There are two reconcilers and pgwire falls through both:
- **Bootstrap/join `ServiceReconciler`** (`src/bootstrap/shared/startup-service-lifecycle-owner.js:55-63`):
  its `desiredStateReader` is an **in-memory Map** populated only with `MESSAGE_GROUP` + `PARTITION`
  descriptors (`seed-message-groups-phase.js:79`, `seed-partitions-phase.js:103`, join equivalents);
  its `actualStateReader` (`seed-infrastructure-phase.js:301-335`) enumerates only message-group +
  partition handles. **Runtime services are never queued** → the planner
  (`service-reconciler-planner.js:206`) never even iterates pgwire. The seeded `service_endpoints` are
  never read here.
- **Per-entity `UnifiedRebalancer`**: instantiated only for `MESSAGE_GROUP`
  (`message-group-service-rebalancer-runtime-methods.js:117`) and `PARTITION`
  (`partition-service-rebalancer-methods.js:257`). **No `entityType: RUNTIME_SERVICE` rebalancer is ever
  constructed**, and nothing discovers RUNTIME_SERVICE entities from `service_definitions`. So 0
  RUNTIME_SERVICE decisions are logged because **no instance bound to pgwire exists**, not because of a
  filter.
The RUNTIME_SERVICE capability itself is **fully built and GREEN in this tree** (verified by running the
tests): `MovePlanner` emits ADD for runtime_service (`move-planner-runtime-service.test.js` 27/27),
the executor CREATE→start path (`runtime-service-handler.test.js` 29/29), and end-to-end planning+node
selection (`pgwire-rebalance.integration.test.js` 8/8). The dispatch chain downstream of an ADD op is
complete: `rebalanceCoordinator.createOperation({type:'add', entityType:'runtime_service', entityId:'sys-postgres-wire', nodeId})`
→ `replica_operations` row → dispatcher CREATE_REPLICA to `runtime-service-handler.js:141` →
`RuntimeServiceAdapter` → `service-runtime-lifecycle` writes the `services` row + `pgwire-runtime-module.start()`
opens 5432. **The ONLY missing piece is the trigger/owner.** Enum values: type `'add'`, entityType
`'runtime_service'`; partitionId defaults to entityId.

### `service start` implementation — two approaches
- **Approach A (minimal trigger):** `service start` computes deficit (desired `replica_count` vs `services`
  rows) and mints one `createOperation` ADD per target node, mirroring initial partition provisioning
  (`sql-query-engine-initial-partition-provisioning.js:386-399`). Gets psql up; **no self-heal** (a lost
  pgwire node is never replaced — no steady-state reconciler).
- **Approach B (durable owner — CHOSEN, operator 2026-06-28):** instantiate a `UnifiedRebalancer` with
  `entityType: RUNTIME_SERVICE` seeded from `service_definitions` (a runtime-service owner analogous to
  `PartitionService`/`MessageGroupService`). Then `start`/`stop`/`scale` ALL become uniform "set
  `replica_count`, let the owner converge" — **self-healing**, and it reuses the already-green planning/
  executor machinery. Missing piece = the owner + entity-discovery-from-`service_definitions`. Combined
  with D2: ship pgwire `replica_count=0` (or status inactive); `start` sets it to 3 → owner places via
  the proven chain; `stop` sets 0 → owner removes. This makes the latent fake-health bug moot (truth
  comes from the `services` table the owner maintains).

## Workstreams & sealed acceptance (doneWhen)

Each is independently verifiable. `W0` is a prerequisite falsification and runs first.

- **W0 — Falsify the psql path. RESOLVED 2026-06-28.** Verdict: a bare **single** seed does **NOT**
  open 5432. Ran a single seed → ready (`/readyz`+`/bootstrap/ready`=200), listening on 8080/8081/8082,
  **never 5432** (psql refused, even after 3 min). pgwire is a *runtime-managed replicated service*
  (`src/runtime/pgwire-cutover-guard.js`: only path to a listener is the replicated runtime module).
  POST-REVIEW CORRECTION: the listener is closed because **no replica was placed**, NOT because the
  service is "stopped" — the definition ships `status='active'`, `replica_count=3`
  (`meta-service-factory.js:85-102`, `wasm-service-models.js:156-173`). The gate logging "Runtime
  service handler setup completed for PG wire" is the *handler* being wired, not a *placed replica*.
- **W0b — Pin the real placement precondition. RESOLVED 2026-06-28 (empirical, Docker 3-node).**
  VERDICT: **psql/5432 never comes up automatically on ANY cluster size.** Built `lagrange:w0b`, ran a
  3-node cluster (1 seed + 2 joiners on a shared docker network); the cluster formed cleanly
  (`expectedNodeCount:3`, `publishedActiveNodeCount:3`, raft-live, settled) yet **no node ever opened
  5432** (checked `/proc/net/tcp` on all 3 after ~6 min). Admin-WS queries pinned the mechanism:
  - `service_definitions` for `sys-postgres-wire`: `status='active'`, `replica_count=3`.
  - `services` (actually-placed replicas): **0 rows** for pgwire.
  - `replica_operations`: **0** pgwire ADD ops ever created; rebalancer logs show **0 RUNTIME_SERVICE
    reconciliation decisions** (it reconciles system *partitions* + message_groups, never the pgwire
    runtime service).
  - `service_endpoints`: **3 rows marked `healthy`** — but these are **seeded at boot** by
    `registerBuiltInMetaServiceEndpoints` (one per node), NOT backed by a real replica/listener.
  ROOT: nothing ever acts on the pgwire desired state to **place a replica**. The desired-vs-actual
  reconciler (`service-reconciler-planner.js:127-131`: ADD when `runningReplicas < desiredReplicaCount`)
  would compute a deficit of 3, but no ADD is planned/dispatched for the built-in — and the
  **fake-healthy seeded endpoints** plausibly suppress deficit/readiness detection (the
  endpoint-visibility check `visiblePostgresWireNodeIds` is satisfied by them). Other system services
  (e.g. message_group) are placed at **bootstrap** (`reason:"bootstrap_message_groups"` via
  service-lifecycle); pgwire (RUNTIME_SERVICE) has **no equivalent bootstrap placement**.
  CONSEQUENCE: D2 is not just a preference — there is currently **no automatic path to a running
  pgsql at all**. The placement chain to drive from `start` is: ServiceReconciler ADD →
  CREATE dispatched to a node's `runtime-service-handler.js:148` → `pgwire-runtime-module.start()`
  (`:256-270`) binds 5432 and writes the `services` row. **First implementation task (cluster still
  reproducible via the recipe below): determine why the reconciler emits no deficit for the built-in
  and whether the fake-healthy endpoints are the suppressor.**
  - **Latent bug surfaced:** a built-in service with `replica_count=3` that is never placed yet
    publishes 3 `healthy` endpoints — the cluster *reports* pgsql healthy while no listener exists.
    Fix as part of WS-API (`list`/`status` must report *placed* truth, not seeded endpoints).
  - **Repro recipe:** `docker build -t lagrange:w0b .`; `docker network create L`; run seed
    (`NODE_ID=lseed NODE_ADDRESS=lseed:8080 REST_API_PORT=8080 TRANSPORT_WS_HOST=0.0.0.0 DATA_DIR=/data`,
    no `SEED_NODE_ADDRESS`, publish 8080/8081/5432); run 2 joiners with **UUID** `NODE_ID`s + 
    `SEED_NODE_ADDRESS=lseed:8080`. Query state via admin-WS `query` on :8081.
- **WS-API — Service-management surface (NEW).** A clean, SQL-free verb surface (list / status /
  start / stop / scale / deploy). Read/scale/create/deploy reuse the existing SQL builders
  (`src/wasm-service/meta-command-handlers.js`); **`start` and `stop` have NO builder today**
  (`UPDATABLE_FIELDS` excludes `status`; `status` does not gate placement) — they require a
  **server-side action** (place / REMOVE a replica), so a slice of "first-class wire ops" is pulled
  forward for those two verbs. Accept: an operator can `list` services and see runtime state (defined
  vs placed/healthy, joining `service_definitions` × `service_endpoints`/`services`), `scale`/`deploy`
  without raw SQL, and (if the decision is ship-not-started) `start sys-postgres-wire` so 5432 opens.
  No flags; no dead knobs.
- **WS-HELLO — Hello-world service example (NEW).** A minimal deployable service + its manifest in
  `examples/`, deployed via WS-API. Accept: following the doc, the operator deploys it and reaches
  its endpoint. Doubles as the canonical "run your own service on Lagrange" lesson.
- **W1 — Image published.** PARTIAL (parallel session, 2026-06-30): the Dockerfile is now multi-stage +
  **distroless** runtime (`gcr.io/distroless/nodejs22-debian12`, `4f1c8b38`/`16df6b24`, 377→287MB) — the
  image-slim half is done. REMAINING W1 = publish multi-arch to `ghcr.io/<org>/lagrange` + a CI job that
  pulls and runs `--version`/`--dry-run`, and **fix the still-stale `EXPOSE 8080 8081 9080`** →
  `8080 8081 8082 5432` (R4). NOTE the distroless runtime has **no shell and no wget/curl** — compose/k8s
  healthchecks and any verification cannot `docker exec ... sh`/`wget`; use HTTP probes hit from the host
  (or a node-based healthcheck). My W0b repro `docker exec ... sh -c` will NOT work on this image.
- **W2 — Compose cluster.** `docker compose up -d` ⇒ all three `/readyz` 200; **start the `pgsql`
  service via WS-API** (5432 opens); `psql` to the seed runs `CREATE TABLE / INSERT / SELECT`
  round-trip; after `docker compose restart` data and NODE_IDs are unchanged and the cluster
  re-converges. Verified by `scripts/verify-compose-quickstart.sh`.
- **W3 — Chart renders/lints.** `helm lint` clean; `helm template` for default + custom
  (`replicas=5`, custom storageClass, non-root) renders the three probes on 8080, headless
  service (`clusterIP: None`), volumeClaimTemplates at `/data`, and `lagrange-sql`/`lagrange-admin`
  services. Gated by `scripts/check-lagrange-chart.js` (modeled on `scripts/check-endpoint-sync-chart.js`),
  added to `test:ci`.
- **W4 — Chart on kind.** `helm install` on kind ⇒ all PVCs `Bound`, all pods pass `/startupz`+`/readyz`,
  `lagrange-0` is seed, others joined; `kubectl port-forward svc/lagrange-sql 5432` + psql round-trip;
  `kubectl delete pod lagrange-1` ⇒ same PVC, same NODE_ID, rejoins with data intact.
  Verified by `scripts/verify-chart-on-kind.sh`.
- **W5 — 30-minute quickstart docs.** `docs/getting-started-compose.md` and
  `docs/getting-started-kubernetes.md` whose command blocks ARE the W2/W4 scripts (narrated),
  following the onboarding mental model end to end: bring up cluster → `list` services (see `pgsql`
  stopped) → `start` pgsql → psql round-trip → `deploy` the hello-world service (WS-HELLO) →
  reach its endpoint. Satisfies the Phase 0.5 exit criterion.

Cross-cutting: standardize new artifact names on `lagrange` (image/chart) and the `lagrange-admin`
bin alias in docs (R9); document the 8081-hardcode and dead `NODE_WS_PORT` env (R6/R7) as known
constraints rather than fake knobs.

## WS-API: service-management surface — design detail

### Reality on the ground (verified, cite before changing)
- Over the admin WebSocket (`ws://<host>:8081/api/admin/stream`) the dispatch switch
  (`src/admin/admin-websocket-message-dispatch-methods.js:132-159`) accepts **only**
  `query`, `partition_callback`, `refresh` (+ live-query sub/unsub). Everything else is
  silently ignored. `isAdminMessageDispatchable` confirms (`src/admin/admin-service-message-adapter.js:52-56`).
- **All service lifecycle is SQL against `service_definitions`** (the desired-state table). The
  `ServiceReconciler` (`src/service/service-reconciler.js:40`) converges actual→desired and
  `ServiceLifecycleManager` (`src/service/service-lifecycle-manager.js`) is the sole owner of
  create/start/stop. There is **no distinct "start" op** — "started" = a row with `status='active'`
  and a valid `replica_count`.
- The meta-verbs (`createService/scaleService/updateService/deleteService/listServices/...`) already
  exist as **pure SQL-builder functions** (`src/wasm-service/meta-command-handlers.js`:
  `handleCreateService:209`, `handleScaleService:378`, `handleDeleteService:414`,
  `handleUpdateService:284`; `handleListServices` in `src/admin/admin-meta-command-handlers.js:119`).
  They return `{success, sql, params}` and are **not wired to any wire message** — they are
  in-process embedder helpers today. Replica-count rule: **odd and ≥ 3** (`isValidReplicaCount`,
  meta-command-handlers.js:197-201).
- **The admin WS is unauthenticated.** `admin-auth-middleware.js` exists (`validateSecurityContext`,
  `authorizeAction`) but is wired only into debug-runtime + pgwire, **not** the admin-WS path.
- The existing CLI (`src/cli/bin/ddb-admin.js`) is a **curses TUI**, not a subcommand CLI; it takes
  only `[node-address]` + `--read-only/--help/--version`. Mutations follow
  `executeNodeManagementQuery` (`src/cli/admin-cli-action-methods.js:400-465`): build queryId →
  `connectionManager.sendQuery(queryId, sql, params)` → await `query:result` → check `affectedRows`
  → `forceRefresh()`. Palette commands register via `CLI_COMMAND`/`CLI_COMMAND_DEFINITIONS`
  (`src/cli/cli-constants.js`).
- The only HTTP server is the bootstrap/health Fastify (`src/bootstrap/bootstrap-api-server-methods.js`);
  `/register-service` there is an **internal** node/replica-handoff mechanism, not a CRUD API.

### Verb surface (the proposed contract)
A SQL-free **`lagrange service`** verb set. Read/scale/create/deploy reuse the existing SQL builders
in `meta-command-handlers.js`; **`start`/`stop` have no builder and need a server-side action**
(status does not gate placement — see W0/W0b):

| Verb | Effect | Backing mechanism |
| --- | --- | --- |
| `service list [--type T] [--json]` | defined vs placed/healthy, replicas, endpoints | `SELECT` joining `service_definitions` × `service_endpoints`/`services` (`health_status`) — **not definitions alone** |
| `service status <id>` | one service: desired vs actual, replicas, endpoints, why-not-placed | `SELECT` joins + safety-gate/topology reason |
| `service start <id>` | ensure a replica is **placed** (open the listener) | **NEW server-side action** (request placement / scale-from-0). No SQL builder exists; `status` is not the lever |
| `service stop <id>` | tear down running replicas | **NEW server-side action** (scale-to-0 / REMOVE replica_operation). `handleDeleteService` only flips `status='inactive'`, which does **not** stop the listener |
| `service scale <id> <n>` | change replica count (odd, ≥3 — user services) | `handleScaleService` → `UPDATE … replica_count=n` (`meta-command-handlers.js:378`) |
| `service deploy <manifest>` | publish + define a new service | `handlePublishModule` (`code`,`module_manifests`) + `handleCreateService` (`service_definitions`); manifest must supply `handlerFunctionId` unless `serviceProfile===SQL_ENGINE` (`meta-command-handlers.js:217-221`) |

`service start sys-postgres-wire` is the intended "turn on psql" step **only if we choose the
ship-not-started model** (Key open decision). It is **not** `UPDATE … status='active'`: that field
is already `active` at boot and is excluded from `UPDATABLE_FIELDS` (`meta-command-handlers.js:266-276`),
and flipping it opens no socket. The real lever is *replica placement* via the rebalancer /
`RuntimeServiceHandler` / `pgwire-runtime-module.start()` — which is what the new server-side
`start`/`stop` actions must drive (pending W0b's pinned precondition).

### Transport decision (the fork, with a recommendation)
- **Option A — CLI-first over the existing `query` channel (RECOMMENDED for this quest).** Add a
  non-interactive `lagrange service …` subcommand mode that connects to :8081 and issues the
  builder-produced SQL via the existing `sendQuery` path (exactly the `executeNodeManagementQuery`
  pattern). **Zero new wire protocol, zero new execution path, no parallel state** — it reuses the
  reconciler and the query socket. SQL stays *inside* the CLI so operators never hand-write it. Fills
  roadmap rows `RM-0.5-cde-cluster-*`/`node-start` and `RM-0.5-dw-cli-wasm-*`. Cons: the current bin
  is TUI-only, so a subcommand router (or a sibling `lagrange` bin) must be added.
- **Option B — first-class wire operations.** Add a `service_command` admin-WS message type wired to
  the meta handlers (and make them execute, not just build SQL), so automation sends
  `{type:"service_command", action:"scale", …}` instead of SQL. Cleaner long-term API; more code, and
  it duplicates a path Option A already covers. **Defer to a follow-on** once the verb shape is proven.
- **Option C — HTTP routes on the admin plane.** Best for language-agnostic automation/CI, easy to
  `curl` in docs; but net-new Fastify routes, sharper auth urgency (network-exposed), and overlaps A.
  **Defer.**

**Recommendation:** ship **A** now (CLI verbs hiding SQL, over the existing query channel) and
**document the admin-WS `query` envelope + the canonical SQL templates** as the automation escape
hatch for v0.1; graduate to **B** (first-class wire ops) as a follow-on quest, and consider **C**
only if operators ask for HTTP. This honors [[avoid-secondary-tertiary-caches]] (reuse the reconciler
+ query path) and [[no-lingering-flags-no-test-flags]] (no flags — the verbs are unconditional).

### Auth (out of scope for this quest; localhost-only + follow-on)
The admin WS is unauthenticated today, and `src/admin/admin-auth-middleware.js` is **policy-only**:
`validateSecurityContext`/`authorizeAction` (`admin-auth-middleware.js:34,72`) have **no token
verification, no credential/identity store, and no source of a `principal`**. So "just wire it in,
token-gated" is not a small seam — real auth needs a credential/token source + an authenticating
handshake + a policy store, none of which exist. DECISION: the quickstart runs the admin plane
**localhost/port-forward only, with a loud "trusted boundary only" warning** in the docs (no
regression — it's already open). **Authentication is its own follow-on quest**, not an acceptance
item here.

### WS-API acceptance (sharpens the sealed criterion)
- `lagrange service list` shows `sys-postgres-wire` and its **placement/health state** (defined vs
  placed/listening) on a fresh ≥3-node cluster.
- A `psql` round-trip succeeds with **no raw SQL typed by the operator** — either automatically once
  the cluster is healthy (if W0b shows placement just needs quorum) or after
  `lagrange service start sys-postgres-wire` (if ship-not-started is chosen).
- `lagrange service scale <id> 3` reflects in `service_definitions` and the reconciler converges;
  `service stop <id>` actually tears down the listener (verified via `service status`, not just a
  `status` flag).
- `lagrange service deploy examples/<hello-world>` (WS-HELLO) brings the service up and its endpoint
  is reachable.
- The admin-WS `query` envelope + canonical SQL templates are documented as the automation surface.

## Key decision — RESOLVED: D2 ship-not-started + real start action (operator, 2026-06-28)

The SQL service ships **not-started** and the operator **explicitly starts it** — this is the
intended teaching arc ("see pgsql defined-but-not-running → `lagrange service start` → psql works").
Concretely D2 requires three coupled pieces:

1. **Built-in pgsql ships not-started.** Change `createPostgresWireDefinition()` (and/or the seed
   registration) so the definition is present but does **not** get a placed replica at boot — by
   shipping `status='inactive'` or `replica_count=0` (W0b decides which actually prevents placement,
   since `status` may not gate it). **Must audit every caller/test that assumes pgsql is active by
   default** and update them (this is a behavior change to a built-in).
2. **A real server-side `service start` (and `stop`) action** that drives *placement*, not a status
   flip — `start` requests/raises placement of a `RUNTIME_SERVICE` replica; `stop` scales-to-0 /
   issues a REMOVE replica_operation. These are net-new server actions (no SQL builder exists).
3. **W0b feeds the implementation** (not the decision): pin exactly what the rebalancer needs to
   place the PG-wire replica so `start` can drive it and ship-not-started can reliably *withhold* it.

D1 (auto-start) is rejected: it loses the lifecycle lesson the onboarding is built around.

## Service scaling model — "a partition IS a service" (operator-refined 2026-06-28)

Services are **first-class replicated entities** that reuse the existing unified machinery — NOT a
parallel mechanism (architecture forbids a parallel planner, `architecture/future/activation-cost-aware-placement.md:98-108`).
The code already grains this way: `UnifiedRebalancer` is entity-agnostic (PARTITION/MESSAGE_GROUP/
RUNTIME_SERVICE) over one `MovePlanner` + one placement kernel. **Partition split/merge (keyspace
resharding) is the ONLY partition-specific piece and the only thing inapplicable to a stateless service.**

Verb-surface change: **NO manual `service scale` command.** Desired count is **policy-driven** and the
rebalancer converges transparently — exactly how tables/message-groups are operated. Keep
`list`/`status`/`deploy` and the lifecycle (`start`/`stop` = policy enable/disable, per D2 ship-not-started).

Resource/load-aware reality (verified, wired vs dormant):
- **CPU% + Memory%: real producers, scored, default-ON.** `node-service.js:356/359` →
  `nodes.cpu_usage_percent`/`memory_usage_percent` (heartbeat) → `placement-owner-decision.js
  calculateScoreDimensions()` (equal-weight sum); `DEFAULT_TABLE_POLICY.placementConstraints` enables
  considerCpuLoad/considerMemoryLoad. **Runtime-service placement already runs the same scorer**
  (`move-planner.js:667`, RUNTIME_SERVICE_SPREAD) → CPU/mem-aware placement is FREE once the owner exists.
- **Disk%: scored but no producer** (always 0; add a statvfs probe in `getNodeStats()` to activate).
  Disk-BYTES budget IS wired (`storage-admission-service.js`, ADD/REPLACE/SPLIT) — storage only.
- **Load-driven MOVEMENT: absent everywhere** (partitions too). MOVE_REASON
  (`rebalancer-constants.js:382-388`) has no hot-node/rebalance-by-load; load only scores the TARGET of
  an already-triggered move. The selection half is shared/free; only the TRIGGER (hot-node detector + a
  load move reason) is missing — build once on the shared planner so partitions benefit too.
- **Network/request-rate per node: absent** from `nodes`/placement; **custom weights/plugin: none**
  (fixed equal-weight sum, 2 score profiles). Both net-new = one score dimension (+ per-node metric for
  network) on the ONE planner.
- **`service_definitions.resource_budget` is a WASM exec-sandbox limit, NOT a placement budget** — do
  not repurpose.
- **Replica-count load autoscaler: does not exist for ANY entity.** "Reuse data-storage transparent
  scaling" = reuse declarative-policy + convergence (real today); load-driven grow/shrink is net-new,
  build generically for partitions + services.

Build order under this model: (1) RUNTIME_SERVICE owner makes services first-class → CPU/mem-aware
placement + policy convergence FREE; (2) service policy accessor/storage (reuse TablePolicyService
pattern) so desired = policy; (3) load-driven movement trigger + network/custom score dimensions =
incremental dimensions on the shared planner, generic (partitions + services), as a follow-on.

## Implementation blueprint — RUNTIME_SERVICE rebalancer owner (Approach B, file-anchored)

Confirmed: the RUNTIME_SERVICE planner/executor/dispatch machinery is fully wired and GREEN; the only
missing piece is a *planning leader* (no `UnifiedRebalancer` is constructed for `entityType RUNTIME_SERVICE`).
- Planner already branches: `getRuntimeServicePolicy()` (`unified-rebalancer-policy-scheduler-methods.js:24-26,53-55`).
- Replica discovery already handles it: `getCurrentReplicas()` (`unified-rebalancer-replica-state.js:238-251`, reads the `services` table).
- Dispatch already routes RUNTIME_SERVICE ops (`replica-dispatch-service-dispatch-observation-methods.js:31-33`).
- Executor handler already built behind the pgwire gate on both paths (`bootstrap-service-control-plane-runtime-methods.js:119`, `node-joining-publication-activation.js:468`).

`UnifiedRebalancer` constructor contract (`unified-rebalancer-lifecycle-base.js:39-284`): required
`entityId, entityType, systemTableCache, cdcIntegrationService, tablePolicyService, nodeId, messageRouter,
rebalanceCoordinator` (others auto-pulled from the coordinator via `syncOwnerDependenciesFromCoordinator`);
the `MovePlanner` is built internally. Mirror the **MESSAGE_GROUP** owner
(`message-group-service-rebalancer-runtime-methods.js:66-154`) — it's the right template because pgwire is
a fixed system service (vs partition's one-per-replica). Reuse the single per-node `rebalanceCoordinator`
(`control-plane-setup.js`); do NOT create a second.

Ordered steps:
1. **Entity-aware policy** — edit `getRuntimeServicePolicy()` (`unified-rebalancer-policy-scheduler-methods.js:53-55`)
   to override `targetReplicaCount` from `service_definitions.replica_count` for `this.entityId` (field
   `replica_count`; NaN/missing → fall back to static default, never 0). This is what makes `scale` work and
   `replica_count=0` mean "place nothing". Testable in isolation.
2. **Owner setup** — new `src/bootstrap/shared/runtime-service-rebalancer-setup.js` mirroring
   `runtime-service-handler-setup.js`: enumerate active RUNTIME_SERVICE defs via
   `systemTableCache.filter(SERVICE_DEFINITIONS, d => serviceType===RUNTIME_SERVICE && status==='active')`;
   construct one `UnifiedRebalancer` per `serviceId`; `initialize()` + leadership-gated `setLeader(...)`;
   return a handle with `quiesceAll()` + a discovery-refresh subscription (refresh per-entity set on
   `service_definitions` cache/CDC change so user services get owners too).
3-5. **Leadership wiring — VALIDATED 2026-06-30 (subagent a8d1a910).** Gate the owner on
   **`service_definitions-p1` partition leadership** (that partition holds the desired-state table;
   its raft leader is the proven cluster-singleton and its local cache is the authoritative
   `getRuntimeServicePolicy` reader). Do NOT wire at the bootstrap RuntimeServiceHandler site (runs on
   every node as a local executor → every-node-planner / ADD-storm risk). Reuse the
   `wireMigrationRecoveryOnLeaderElection` precedent (`src/migration/migration-recovery-trigger.js:49-189`):
   resolve the service via `resolvePartitionServiceByPartitionId(partitionServices, 'service_definitions-p1')`
   (`entrypoint-runtime-admin-composition.js:73-87`), subscribe to `PARTITION_SERVICE_EVENT.LEADER_ELECTED`
   (`partition-service-core-base.js:518`) to `setLeader(true)`/start, and drive `setLeader(service.resolveRebalancerLeadership())`
   from the partition's leadership-transition points (`updateRebalancerLeadership` :477-485, onFollower/
   onCandidate quiesce, `quiesceRebalancing` shutdown) so handoff + shutdown are covered in lockstep with
   the partition's own rebalancer (drain hysteresis inherited).
   CONVERGENCE-SAFE: `service_definitions` is a system table but **NOT** a priority control-plane table
   (`system-partition-classification.js:17-23`) → the owner is already OFF the priority lane the
   rolling-restart work tunes; no explicit non-priority flag needed, and `replica_count=0` plans zero
   moves (safe to land before any non-zero scale).
6. **Teardown** — `setLeader(false)` + `shutdown()` (already shutdown-aware; scheduler clears timers on
   LEADER_STOP) per entity; NO re-arming discovery timer (use cache/CDC subscription, unsubscribe on
   shutdown — avoids the integration-suite hang class).

Risks: keep runtime-service owners NON-priority so they don't compete with the ~1s control-plane-priority
cadence the live convergence work depends on (with `replica_count=0` shipped, pgwire plans zero moves → ~nil
blast radius at ship time); leader-only execution; shutdown-awareness; the seeded `service_endpoints` row is
an endpoint advertisement, not a `services` replica row (rebalancer keys on `services`, no collision) — but
fix `list`/`status` so they don't double-count it.

Red-on-revert DT test (no gate; model on `test/integration/pgwire-rebalance.integration.test.js` +
`test/rebalancer/runtime-service-entity.test.js`): mock `systemTableCache` with a `sys-postgres-wire`
definition (active, replica_count=3), 3 ready nodes, 0 `services` rows → drive one reconcile tick → assert an
ADD/CREATE_REPLICA for `runtime_service`/`sys-postgres-wire`; assert NONE without the owner, and NONE with
`replica_count=0` (proves ship-not-started gating).

## Sequencing & dependencies

`W0` (DONE) → **`W0b` (BLOCKER: pin the placement mechanism so `start` can drive it and
ship-not-started can withhold it)** → **WS-API core** (built-in-not-started change + server-side
`start`/`stop` placement actions + `list`/`status`/`scale`/`deploy` verbs + caller audit).
`W1` (Dockerfile EXPOSE fix, multi-stage, naming) runs in parallel. Then `W2` (needs W1 + WS-API) ‖
`W3` (render-only, needs W1 image name) → `WS-HELLO` (needs WS-API `deploy`) → `W4` (needs W2
patterns + W3 chart + WS-API) → `W5` (docs narrate the green end-to-end flow). **WS-API is firmly on
the critical path** under D2: without the start action there is no psql.

## Reuse vs build-new

Reuse: `test/distributed/harness/cluster-class-lifecycle-base.js` env wiring (transcribe 1:1);
`scripts/check-endpoint-sync-chart.js` (chart-gate template); `docs/bootstrap-readiness-probes.md`
(probe YAML verbatim); existing Dockerfile (fix EXPOSE); `lagrange-admin` bin alias; `--version`/`--dry-run`.
Build new: `docker-compose.yml`; `charts/lagrange/` (StatefulSet, headless + sql + admin services,
entrypoint wrapper for ordinal→identity, NOTES.txt, values.yaml); GHCR publish workflow; the three
verify scripts; two getting-started docs; updated `.env.example`.

## Risks

R1 psql is gated, not a static listener — falsify in W0. R2 unset NODE_ID churns raft identity
each boot — StatefulSet+per-pod NODE_ID is mandatory. R3 seed `bootstrap()` failure is fatal with
no retry, joiners only retry 4× — gate ordering on `/readyz`. R4 WS is 8082 not 9080. R5 advertised
addresses default to `localhost` — inject pod FQDN. R6 admin 8081 hardcoded. R7 `NODE_WS_PORT` env
mapping is dead (needs a small src change if a non-default WS port is required). R8 AGPL image
license obligations. R9 naming drift (`distributed-database-system`/`ddb-admin`/Lagrange). R10 fat
build image — consider multi-stage. **R11 replica floor: user-created services and the `scale` verb
require odd, ≥3 replicas (`isValidReplicaCount`, `meta-command-handlers.js:197-201,222-225,385-387`),
so the quickstart cluster must be ≥3 nodes for WS-HELLO/`scale` to converge — the "1-node try" cannot
run user services. The built-in pgsql runtime min is 1 (`rebalancer-constants.js:137-146`) but the
`scale` verb cannot express <3 (verb/policy mismatch — surface it).** R12 `service stop` via a
`status='inactive'` flip does NOT tear down the listener (placement ignores `status`) — stop must be
a real scale-to-0/REMOVE action. R13 admin WS is unauthenticated and `admin-auth-middleware.js` is
policy-only (no token/principal/credential source) — real auth is a separate quest; quickstart is
localhost-only. **R14 (verified W0b) joiner `NODE_ID` MUST be a valid UUID — the seed `/bootstrap`
rejects non-UUID ids (`HTTP 400 nodeId must be a valid UUID`); seeds themselves accept any id. This
REFUTES the StatefulSet "NODE_ID = $POD_NAME" design for joiners (`lagrange-1` would fail to join).
Joiners need a stable per-pod UUID — persist a generated one in the PVC on first boot, or derive a
deterministic UUIDv5 from the pod name.** **R15 (verified W0b) `NODE_ADVERTISED_WS_ADDRESS` is a
dead/broken env: `ENV_MAPPINGS` maps it to `node.advertisedWsAddress`, but the node config schema is
`additionalProperties:false` and rejects it → setting it crashes boot (`/node must NOT have additional
properties`). Do not set it; WS advertised address derives from `node.address`.**

## Closure

Operator-attested against the workstream acceptance checklist (mirrored in
`solve/oracle/lagrange-devops-onboarding.json`). Quest closes when W0b is resolved (placement
precondition pinned → Key open decision made), WS-API/WS-HELLO/W1–W5 are green, the chart render-gate
(`check-lagrange-chart.js`) is in `test:ci`, and a reviewer can follow either getting-started doc to a
psql round-trip on a ≥3-node cluster.
