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

- **W0 — Falsify the psql path (HIGHEST RISK).** pgwire is a *gated runtime service*
  (`PgWireStartupSafetyGate.guardedSetup`, `src/bootstrap/bootstrap-service-control-plane-runtime-methods.js:121-143`)
  whose failure is isolated — a node can report bootstrap-complete with **no 5432 listener**.
  Accept: a bare `docker run` seed opens 5432 and `psql -h 127.0.0.1 -p 5432 -c 'SELECT 1'`
  returns `1` with no extra step; OR the required service-deploy step is documented and the
  round-trip works after it. *Everything that mentions "psql" depends on this answer.*
- **W1 — Image published.** Tagged build pushes multi-arch `ghcr.io/<org>/lagrange`; a CI job
  pulls it and `docker run --rm <img> --version` prints the version, `--dry-run` exits clean.
- **W2 — Compose cluster.** `docker compose up -d` ⇒ all three `/readyz` 200; `psql` to the seed
  runs `CREATE TABLE / INSERT / SELECT` round-trip; after `docker compose restart` data and
  NODE_IDs are unchanged and the cluster re-converges. Verified by `scripts/verify-compose-quickstart.sh`.
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
  carrying a reader from zero to a psql round-trip (+ WASM deploy) — the Phase 0.5 exit criterion.

Cross-cutting: standardize new artifact names on `lagrange` (image/chart) and the `lagrange-admin`
bin alias in docs (R9); document the 8081-hardcode and dead `NODE_WS_PORT` env (R6/R7) as known
constraints rather than fake knobs.

## Sequencing & dependencies

`W0` (no deps) → `W1` (Dockerfile EXPOSE fix, optional multi-stage, naming) → `W2` (needs W0+W1)
‖ `W3` (render-only, needs W1 image name; parallel with W2) → `W4` (needs W2 patterns + W3 chart + W0)
→ `W5` (docs are the green W2/W4 scripts narrated).

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
