# lagrange-node Helm chart

Deploys a Lagrange cluster: **1 seed node + N joiners** (default N=2 → a
3-node cluster). Experimental / alpha, like the release it ships with.

```sh
helm install lagrange charts/lagrange-node \
  --set image.tag=0.1.0 --set joiners.replicas=2
```

The default `image.repository` (`codeberg.org/psvensson/lagrange`) is the
published release image on the Codeberg container registry. The same image is
published to Docker Hub as
[`psvensson/lagrange`](https://hub.docker.com/r/psvensson/lagrange) (the
primary registry) — select it with `--set image.repository=psvensson/lagrange`.
For local builds, build and push your own image and pass
`--set image.repository=<your-registry>/lagrange --set image.tag=<tag>`.

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
  directory (rejoin hints) on restart. Identity rides the PVC.
- **Ports**: REST `node.restPort` (default 8080), transport WS restPort+2;
  admin WS is a hardcoded runtime constant `8081` that does not move with
  restPort. The pgwire SQL endpoint is a managed service started on demand —
  no 5432 boot listener.
- **Probes**: liveness `/health`, readiness `/readyz` on the REST port.
- **Storage**: one PVC per pod mounted at `/data`, passed as `--data-dir`.

## Key values

| Value | Default | Meaning |
| --- | --- | --- |
| `joiners.replicas` | `2` | Non-seed nodes; cluster size = this + 1 |
| `image.repository` / `image.tag` | `codeberg.org/psvensson/lagrange` / appVersion | Runtime image |
| `node.restPort` | `8080` | REST port; transport WS = +2, admin WS fixed at 8081 |
| `node.maxOldSpaceSizeMb` | `1536` | V8 heap cap; keep under the memory limit |
| `node.extraEnv` | `[]` | Extra env (see `ENV_MAPPINGS` in `src/config/config-constants.js`) |
| `persistence.size` | `10Gi` | Per-pod volume |
| `resources` | 1 CPU / 2Gi | Per-pod resources |

## Caveats (0.1)

- Rolling-restart convergence is statistical, not bounded-time — see the
  repository `CHANGELOG.md` Known limitations before operating this in
  anything load-bearing.
- Scaling `joiners.replicas` up adds nodes; scale-down drains are subject to
  the same convergence caveat.
- The seed StatefulSet is a single replica by design. Fresh joiners need it up
  to bootstrap; already-joined nodes keep their own peer mesh, but seed
  availability during simultaneous full-cluster restarts has not been
  k8s-exercised in 0.1.
