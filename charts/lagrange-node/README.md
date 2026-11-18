# lagrange-node Helm chart

Deploys a Lagrange cluster: **1 seed node + N joiners** (default N=2 -> a
3-node cluster). Experimental alpha software under active development.

- **Published Release**: `0.3.3` (latest tagged release on Docker Hub)
- **Active Development**: `0.4.0` (source on `main`)

```sh
helm install lagrange charts/lagrange-node \
  --set image.tag=0.3.3 --set joiners.replicas=2
```

The default `image.repository` (`docker.io/psvensson/lagrange`) is the
published release image on
[Docker Hub](https://hub.docker.com/r/psvensson/lagrange).
For local or custom builds, build and push your own image and pass
`--set image.repository=<your-registry>/lagrange --set image.tag=<tag>`.

For the complete guide on Kubernetes deployment and cloud benchmark automation, see
[Kubernetes Deployment and Cloud Benchmarks Guide](../../docs/kubernetes-and-cloud-benchmarks.md).

## Shape and why

- **Two StatefulSets (seed + joiners), not one.** The node entrypoint has
  distinct seed/joiner startup branches (seed = no `SEED_NODE_ADDRESS`, no
  self-seed guard), and the runtime image is distroless (no shell), so
  ordinal-based "pod-0 is the seed" logic cannot run in-container.
- **Name-first addressing.** Every pod registers (`NODE_ADDRESS`) and
  advertises (`NODE_ADVERTISED_WS_ADDRESS`) its stable headless-service DNS
  name, and binds wide (`TRANSPORT_WS_HOST=0.0.0.0`). Peers re-resolve the
  name on reconnect, so nodes survive pod restarts that change the pod IP.
- **Durable identity.** `NODE_ID` is not set: join admission requires a UUID,
  so the runtime mints one on first boot and restores it from the data
  directory (the durable boot-incarnation store) on restart. Identity rides the PVC.
- **Ports**: REST `node.restPort` (default 8080), admin WS restPort+1, and
  transport WS restPort+2. Set `admin.websocketPort` or `node.wsPort` to
  override either derived WS port. Admin WS remains pod-local on loopback;
  it is absent from Services and container-port declarations. The pgwire SQL
  endpoint is a managed service started on demand; no 5432 boot listener.
- **Probes**: process liveness `/livez`, readiness `/readyz` on the REST port.
  `/health` remains a compatibility endpoint and is not an orchestrator
  readiness or liveness signal.
- **Admin exposure**: none. The chart enforces loopback binding and rejects
  wildcard/insecure values, including `node.extraEnv` overrides. External
  admin access remains unsupported until an authenticated proxy or runtime
  handshake is designed and tested.
- **Storage**: one PVC per pod mounted at `/data`, passed as `--data-dir`.

## Key values

| Value | Default | Meaning |
| --- | --- | --- |
| `joiners.replicas` | `2` | Non-seed nodes; cluster size = this + 1 |
| `image.repository` / `image.tag` | `docker.io/psvensson/lagrange` / appVersion | Runtime image |
| `node.restPort` | `8080` | REST base port; admin WS = +1 and transport WS = +2 by default |
| `admin.websocketPort` / `node.wsPort` | derived | Optional individual admin/transport WS overrides |
| `node.maxOldSpaceSizeMb` | `1536` | V8 heap cap; keep under the memory limit |
| `admin.websocketHost` / `admin.allowInsecureExternalBind` | `127.0.0.1` / `false` | Fixed pod-local admin posture; insecure overrides fail rendering |
| `node.extraEnv` | `[]` | Extra env (e.g. `PGUSER`, `PGPASSWORD`, see `src/config/config-constants.js`) |
| `persistence.size` | `10Gi` | Per-pod volume |
| `resources` | 1 CPU / 2Gi | Per-pod resources |

## Deploying Services to the Cluster

Lagrange services compile to WebAssembly components and deploy by registered immutable
identity over authenticated PostgreSQL wire. Because deployment consumes sealed bytes
from the replicated `ArtifactPayloadStore`, **no container volume mounts, shared NFS
volumes, or custom Kubernetes CRDs are required**.

1. Port-forward the REST and PostgreSQL services:
   ```sh
   kubectl port-forward svc/lagrange-lagrange-node 8080:8080 5432:5432
   ```

2. Configure environment credentials:
   ```sh
   export PGHOST=127.0.0.1
   export PGPORT=5432
   export PGUSER=postgres
   export PGPASSWORD=lagrange-dev-password
   ```

3. Build, publish, and deploy:
   ```sh
   # Build the component locally
   npm run build

   # Publish bytecode to the cluster ArtifactPayloadStore
   npx lagrange service publish .

   # Deploy by registered immutable identity
   npx lagrange service deploy --package-id <package-id> --idempotency-key deploy-k8s-v1
   ```

4. Invoke your endpoint over HTTP:
   ```sh
   curl -fsS -u postgres:lagrange-dev-password \
     -H 'content-type: application/json' \
     -d '{"accountId": 101}' \
     http://127.0.0.1:8080/amounts/summary
   ```

## Operational Considerations and Caveats

- **Admin binding posture:** Values files containing `admin.websocketHost: 0.0.0.0` or
  `admin.allowInsecureExternalBind: true` fail rendering. The chart does not publish
  port 8081; use REST health and readiness endpoints (`/livez`, `/readyz`) for orchestration.
- **Rolling-restart convergence:** Rolling restarts converge via Raft voter consensus;
  see the repository `CHANGELOG.md` Known limitations before operating in high-churn environments.
- **Scaling:** Scaling `joiners.replicas` up adds nodes to the cluster; scale-down drains
  require consensus quorum rebalancing.
- **Seed StatefulSet:** The seed StatefulSet is a single replica by design. Fresh joiners
  need it up to bootstrap; already-joined nodes maintain their peer mesh.
