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
W0 confirmed this empirically: a bare node opens 8080/8081/8082 but **not 5432** —
the Postgres-wire service ships *registered but not started* (by design, see
`docs/convergence`/W0 below). The onboarding embraces that fact instead of hiding
it. The guided path is:

1. Bring up the cluster (compose or Helm).
2. **Manage services through a service-management API** (list / start / stop /
   scale / deploy). The admin-WebSocket message contract already supports this
   (`docs/wasm-services-user-guide.md` §3–6); it needs a clean, documented verb
   surface (CLI/HTTP), since `ddb-admin` has no deploy/scale verb today.
3. **Start the built-in `pgsql` service** (it exists, stopped) → 5432 opens.
4. Connect with `psql`, run SQL.
5. **Deploy a small hello-world service** — the same API path, teaching how to run
   *your own* services on Lagrange.

The "psql isn't on by default" moment is reframed from a bug into the first
teaching moment about what Lagrange actually is.

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

### docker-compose (3-node)
- `seed`: `NODE_ID=lagrange-seed`, `NODE_ADDRESS=seed:8080`, `NODE_ADVERTISED_WS_ADDRESS=ws://seed:8082`, `TRANSPORT_WS_HOST=0.0.0.0`, `DATA_DIR=/data`, **no** `SEED_NODE_ADDRESS`, volume `seed-data:/data`. Publish host `8080`, `5432`, `8081`.
- `node-2`/`node-3`: same shape + `SEED_NODE_ADDRESS=seed:8080`, distinct id/address/volume. Do not publish 5432 from all three (clash) — publish seed's, or map 5433/5434.
- 8082 stays inside the compose network. `healthcheck` = `GET :8080/readyz`; joiners `depends_on: { seed: { condition: service_healthy } }` (mitigates the first-boot race).

### Helm chart (`charts/lagrange/`, StatefulSet)
- Headless `Service` (`clusterIP: None`, name `lagrange`) ⇒ stable DNS `lagrange-0.lagrange.<ns>.svc.cluster.local`.
- `StatefulSet` `serviceName: lagrange`, `podManagementPolicy: OrderedReady` (so `lagrange-0` is the seed and Ready before joiners start).
- Per-pod identity via entrypoint wrapper deriving ordinal from `$HOSTNAME`/`POD_NAME`:
  `NODE_ID=$POD_NAME`, `NODE_ADDRESS=$POD_NAME.lagrange.$NS.svc:8080`, `NODE_ADVERTISED_WS_ADDRESS=ws://$POD_NAME.lagrange.$NS.svc:8082`, `TRANSPORT_WS_HOST=0.0.0.0`, `DATA_DIR=/data`; `SEED_NODE_ADDRESS=lagrange-0.lagrange.$NS.svc:8080` **only for ordinal>0**.
- `volumeClaimTemplates` (one PVC per pod at `/data`) ⇒ restart re-binds same PVC ⇒ same NODE_ID + raft log ⇒ auto-rejoin, not fresh identity.
- Client services: `lagrange-sql` (5432), `lagrange-admin` (8081, optional). Probes from `docs/bootstrap-readiness-probes.md:52-74` (startup `/startupz`, readiness `/readyz`, liveness `/livez`, all 8080) so client services route only to Ready nodes.
- Configurable: `replicas`, `resources`, `securityContext` (non-root), `storageClassName`, `image`/`tag`.

### Image publish
- GitHub Actions buildx → `ghcr.io/<org>/lagrange:<semver>` + `:latest`, `linux/amd64`+`linux/arm64`. AGPL license labels. Consider multi-stage to drop the `python3/make/g++` build toolchain.

## Workstreams & sealed acceptance (doneWhen)

Each is independently verifiable. `W0` is a prerequisite falsification and runs first.

- **W0 — Falsify the psql path. RESOLVED 2026-06-28.** Verdict: a bare node does **NOT** open
  5432. Ran a single seed → ready (`/readyz`+`/bootstrap/ready`=200), listening on 8080/8081/8082,
  **never 5432** (psql refused, even after 3 min). pgwire is a *runtime-managed replicated service*
  (`src/runtime/pgwire-cutover-guard.js`: only path to a listener is the replicated runtime module);
  the Postgres-wire meta-service *definition* is registered at seed boot
  (`registerBuiltInMetaServiceDefinitions`, `src/bootstrap/phases/seed-registration-phase.js:283`,
  port 5432) and the gate passes ("Runtime service handler setup completed for PG wire") — but a
  registered definition is **not** a started replica, so no socket opens. This is now a *designed
  feature* of the onboarding (pgsql exists-but-stopped), not a defect. Consequence: the quickstart
  MUST include an explicit "start the pgsql service" step (WS-API below) before psql works.
- **WS-API — Service-management surface (NEW).** Expose a clean, documented API to list / start /
  stop / scale / deploy services, wrapping the existing admin-WS message contract
  (`docs/wasm-services-user-guide.md` §3–6). Accept: an operator can `list` services and see
  `pgsql` present+stopped, `start` it so 5432 opens, and `deploy` a new service — without writing
  raw SQL inserts. (CLI verb and/or thin HTTP; no dead knobs per constraints.)
- **WS-HELLO — Hello-world service example (NEW).** A minimal deployable service + its manifest in
  `examples/`, deployed via WS-API. Accept: following the doc, the operator deploys it and reaches
  its endpoint. Doubles as the canonical "run your own service on Lagrange" lesson.
- **W1 — Image published.** Tagged build pushes multi-arch `ghcr.io/<org>/lagrange`; a CI job
  pulls it and `docker run --rm <img> --version` prints the version, `--dry-run` exits clean.
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
A first-class, SQL-free **`lagrange service`** verb set, each verb mapping to existing reconciler
state. Verbs reuse the SQL builders in `meta-command-handlers.js` (do not re-author SQL):

| Verb | Effect | Underlying write (existing builder) |
| --- | --- | --- |
| `service list [--type T] [--json]` | show definitions + runtime/endpoint state | `SELECT` `service_definitions` (+ `services`, `service_endpoints`) |
| `service status <id>` | one service: desired vs actual, replicas, endpoints | `SELECT` joins |
| `service start <id>` | bring a registered-but-stopped service up | `UPDATE service_definitions SET status='active'[, replica_count=N]` |
| `service stop <id>` | soft-deactivate (keeps definition) | `handleDeleteService` → `UPDATE … status='inactive'` |
| `service scale <id> <n>` | change replica count (odd, ≥3) | `handleScaleService` → `UPDATE … replica_count=n` |
| `service deploy <manifest>` | publish + define a new service | `handlePublishModule` (`code`,`module_manifests`) + `handleCreateService` (`service_definitions`) |

`service start sys-postgres-wire` is the canonical "turn on psql" step. Minimal effect today:
`UPDATE service_definitions SET status='active', replica_count=3, updated_at=… WHERE service_id='sys-postgres-wire'`
(service id `META_SERVICE_ID.POSTGRES_WIRE`, type `RUNTIME_SERVICE`, runtime `native_js`,
endpoint 5432; `src/wasm-service/meta-service-factory.js:85-102`).

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

### Auth seam (required before exposing 8081 beyond localhost)
Wire the existing-but-unused `src/admin/admin-auth-middleware.js` into the admin-WS handshake
(`handleConnection`, dispatch-methods.js:76), token/config-gated. For the local quickstart
(compose/kind via localhost/port-forward) the channel may stay open **with a loud "trusted boundary
only" warning** in the docs, but the design must land the seam so we are not shipping an
unauthenticated remote control plane. This is a named acceptance item, not an afterthought.

### WS-API acceptance (sharpens the sealed criterion)
- `lagrange service list` shows `sys-postgres-wire` present and **stopped** on a fresh cluster.
- `lagrange service start sys-postgres-wire` causes 5432 to open and a `psql` round-trip to succeed —
  with **no raw SQL typed by the operator**.
- `lagrange service scale <id> 3` and `service stop <id>` reflect in `service_definitions` and the
  reconciler converges (verified via `service status`).
- `lagrange service deploy examples/<hello-world>` (WS-HELLO) brings the service up and its endpoint
  is reachable.
- The admin-WS `query` envelope + SQL templates are documented as the automation surface; the auth
  seam is wired (token-gated) with the localhost-only caveat documented.

## Sequencing & dependencies

`W0` (DONE) → `W1` (Dockerfile EXPOSE fix, optional multi-stage, naming) and `WS-API`
(CLI `lagrange service` verbs over the existing query channel + auth seam) can proceed in parallel;
`WS-API` gates the psql round-trip in `W2`/`W4` and the deploy step in `WS-HELLO`. Then
`W2` (needs W1 + WS-API) ‖ `W3` (render-only, needs W1 image name) → `WS-HELLO` (needs WS-API) →
`W4` (needs W2 patterns + W3 chart + WS-API) → `W5` (docs narrate the green WS-API/W2/W4 flow
end-to-end). Critical insight: **WS-API is now on the critical path** — without `service start`,
there is no psql, so it precedes every psql-dependent acceptance.

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
build image — consider multi-stage.

## Closure

Operator-attested against the W0–W5 acceptance checklist (mirrored in
`solve/oracle/lagrange-devops-onboarding.json`). Quest closes when W1–W5 are green and W0 is
resolved (psql path proven or its required step documented), with the chart render-gate
(`check-lagrange-chart.js`) in `test:ci` and a reviewer able to follow either getting-started doc
to a psql round-trip.
