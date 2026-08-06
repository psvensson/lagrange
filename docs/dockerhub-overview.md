<!--
  Docker Hub repository overview for docker.io/psvensson/lagrange.

  This file is a TEMPLATE: on every release, release.yml renders it through
  `node scripts/release-notes.js --mode overview` - which injects a
  per-release "Release notes" section (from CHANGELOG.md) between the
  RELEASE-NOTES markers below - and PATCHes the result to Docker Hub's
  repository full_description. Manual fallback: run that command locally and
  paste its output into https://hub.docker.com/r/psvensson/lagrange.

  Docker Hub does not resolve relative links, so every link below is an
  absolute URL into the GitHub repository. Keep it self-contained; the
  renderer enforces Docker Hub's 25,000-character full_description limit.
-->

# Lagrange

Lagrange is a distributed runtime for data-intensive services. A cluster of
equal nodes stores partitioned, Raft-replicated SQL tables; services deploy
as WASM, and Lagrange runs each part of a request on the nodes holding the
relevant data, so only reduced results cross the network.

> Logically one ordinary service. Physically distributed across the data.

> Read [Evaluating Lagrange](https://github.com/psvensson/lagrange/blob/main/docs/evaluate.md)
  before treating the image as more than a local or private-network,
experimental deployment.

> The cluster includes its own partitioned SQL storage. It is not a plug-in
  for an existing PostgreSQL cluster.

 **Experimental / alpha.** `0.x` releases carry no backward-compatibility
  guarantee. See the
  [changelog](https://github.com/psvensson/lagrange/blob/main/CHANGELOG.md)
  and
  [current capabilities](https://github.com/psvensson/lagrange/blob/main/docs/current-capabilities-and-limitations.md)
  before running anything load-bearing.

- **Source:** <https://github.com/psvensson/lagrange>
- **Issues:** <https://github.com/psvensson/lagrange/issues>
- **License:** AGPL-3.0-only

## Tags

| Tag | Meaning |
| --- | --- |
| `latest` | Most recent release |
| `0.1.0`, â€¦ | One tag per `v.Y.Z` release, built from that git tag |

Images are **linux/amd64 only** and built on
[distroless Node.js 22](https://github.com/GoogleContainerTools/distroless) -
there is no shell, package manager, or `npm` inside the container.

## Safe local quick start

Bind exposed ports to host loopback. The admin listener is unauthenticated.
This command is local-host only:

```bash
docker run --rm \
  -e ADMIN_WS_HOST=0.0.0.0 \
  -e ADMIN_ALLOW_INSECURE_EXTERNAL_BIND=true \
  -p 127.0.0.1:8080:8080 \
  -p 127.0.0.1:8081:8081 \
  -p 127.0.0.1:8082:8082 \
  psvensson/lagrange:latest
```

A node started without `SEED_NODE_ADDRESS` becomes the seed of a new cluster.
It opens three ports:

| Port | Purpose |
| --- | --- |
| `8080` | REST API (`/livez` liveness, `/readyz` readiness) |
| `8081` | Admin WebSocket unauthenticated |
| `8082` | Node-to-nod transport WebSocket |

To interact with the node, connect the admin CLI from a checkout of the
repository (the image itself has no shell to exec into):

```bash
git clone https://github.com/psvensson/lagrange && cd lagrange
npm install
npm run cli -- localhost:8081
```

## Multi-node cluster

One container per node is the normal deployment model. Listener ports derive
from each node's REST base unless individually overridden. Joiners point
`SEED_NODE_ADDRESS` at the seed and advertise an address other nodes can reach:

```bash
docker network create lagrange-net

docker run -d --name seed --network lagrange-net \
  -e TRANSPORT_WS_HOST=0.0.0.0 \
  -e ADMIN_WS_HOST=0.0.0.0 \
  -e ADMIN_ALLOW_INSECURE_EXTERNAL_BIND=true \
  -e NODE_ADDRESS=seed:8080 \
  -e NODE_ADVERTISED_WS_ADDRESS=seed:8082 \
  psvensson/lagrange:latest

docker run -d --name node2 --network lagrange-net \
  -e TRANSPORT_WS_HOST=0.0.0.0 \
  -e ADMIN_WS_HOST=0.0.0.0 \
  -e ADMIN_ALLOW_INSECURE_EXTERNAL_BIND=true \
  -e NODE_ADDRESS=node2:8080 \
  -e NODE_ADVERTISED_WS_ADDRESS=node2:8082 \
  -e SEED_NODE_ADDRESS=http://seed:8080 \
  psvensson/lagrange:latest
```

Leave `NODE_ID` unset: join admission requires a UUID identity, which the node mints
on first start and restores from its data directory on restart.

The transport listener is plain WebSocket without cryptographic peer
authentication or encryption. Run a multi-node cluster only on an isolated
private network and restrict port 8082 to known cluster nodes.

## Configuration

Set via environment variables (`-e`):

| Variable | Default | Meaning |
| --- | --- | --- |
| `SEED_NODE_ADDRESS` | unset | Unset â†’ start as seed; set (`http://host:8080`) â†’ join that cluster |
| `NODE_ADDRESS` | localhost | Registration address other nodes reach you at (`host:8080`); the localhost default is rejected at join admission |
| `NODE_ADVERTISED_WS_ADDRESS` | localhost | Advertised transport address (`host:8082`) |
| `TRANSPORT_WS_HOST` | localhost | Transport bind host; use `0.0.0.0` in containers |
| `ADMIN_WS_HOST` | `127.0.0.1` | Admin bind host; external binds require the explicit opt-in below |
| `ADMIN_ALLOW_INSECURE_EXTERNAL_BIND` | `false` | Set `true` only with an external host and a controlled network boundary |
| `REST_API_PORT` | `8080` | REST base port (admin = +1; transport = +2) |
| `ADMIN_WS_PORT` | `REST_API_PORT + 1` | Optional admin WebSocket override |
| `TRANSPORT_WS_PORT` | `REST_API_PORT + 2` | Optional transport WebSocket override |
| `DATA_DIR` | `./data` | Storage directory - `/app/data` inside the container |
| `NODE_ID` | unset | Leave unset (UUID minted and persisted on first start) |
| `LOG_LEVEL` / `LOG_PRE[(WÔ’S•[™›ØÈ˜[ÙXÙÙÚ[™È‚‘\™XØ]Y˜[Y\ÈQRS—ÕÑP”ÓĞÒÑUÒÔÕQRS—ÕÑP”ÓĞÒÑUÔÔ•[™˜“ÑWÕÔ×ÔÔ•\™Hİ[XØÙ\Y
Ú]Hİ\\Ø\›š[™ÊHÚ[ˆHØ[›ÛšXØ[›˜[YH\È[œÙ]‚‚ˆÈÈ\œÚ\İ[˜ÙB‚[İ]HH\][ÛˆİÜ˜YÙK˜YÙÜË[™H›ÙIÜÈ\˜X›HY[]HH]™\Â[™\ˆUWÑT˜
Ø\Ù]X
Kˆ[İ[H›Û[YHÈİ\š]™HÛÛZ[™\ˆ™\XÙ[Y[‚‚˜˜\Ú™ØÚÙ\ˆ[ˆY]ˆYÜ˜[™ÙKY]N‹Ø\Ù]HˆYHQRS—ÕÔ×ÒÔÕLŒŒŒˆYHQRS—ĞSÕ×ÒS”ÑPÕT‘WÑVT“SĞ’S‘]YHˆ\LËŒŒŒNˆ\LËŒŒŒNNHˆ\LËŒŒŒNˆˆİ™[œÜÛÛ‹ÛYÜ˜[™ÙN›]\İ˜‚ˆÈÈİX™\›™]\Â‚•H™\ÜÚ]ÜHÚ\ÈH[HÚ\
HÙYY
Èˆ›Ú[™\ˆİ]Y[Ù]Ë˜[YKYš\œİ˜Y™\ÜÚ[™Ë\‹\ÙÜÊH]\Ş\È\È[XYÙN‚–ØÚ\ËÛYÜ˜[™ÙK[›ÙJÎ‹ËÙÚ]X‹˜ÛÛKÜİ™[œÜÛÛ‹ÛYÜ˜[™ÙKİ™YKÛXZ[‹ØÚ\ËÛYÜ˜[™ÙK[›ÙJK‚•HÚ\X›\Ú\È‘TÕ[™˜[œÜÜÛ›NÈ]È[˜]][XØ]YYZ[ˆ\İ[™\‚œİ^\ÈÙ[ØØ[ÛˆÛÜ˜XÚÈ[™Ø[››İ™H^\›˜[H[˜X›Y›İYÚÚ\˜[Y\Ëˆ]ÈÜ\š]™\Èœ›ÛH›ÙKœ™\İÜ[›\ÜÈ^XÚ]Hİ™\œšY[‹‚‚\HH™]ÛÜšÔÛXŞHÜˆ\]Z]˜[[Üİš\™]Ø[ÈH˜[œÜÜÙ\šXÙKˆB˜Ú\Ù\È›İY[˜Ü\[ÛˆÜˆY\ˆ]][XØ][ÛˆÈH›ÙH˜[œÜÜ‚‚•HÚ\\È\Ş[Y[ØØY™›Û[™Ë›İH›ÙXİ[ÛˆÙ\YšXØ][Û‹ˆ™XY–ÓÜ\˜][ÛœÈ™XY[™\Ü×JÎ‹ËÙÚ]X‹˜ÛÛKÜİ™[œÜÛÛ‹ÛYÜ˜[™ÙKØ›Ø‹ÛXZ[‹ÙØÜËÛÜ\˜][ÛœË\™XY[™\ÜË›Y
B˜™Y›Ü™HH[İ‚‚ˆÈÈY[[ÜB‚•HÛÛZ[™\ˆİ\È›ÙHÚ]K[X^[Û\ÜXÙK\Ú^™OLMLÍ˜ˆÚ]™HHÛÛZ[™\‚›[Ü™H[ˆ]
H[HÚ\Y˜][ÈÈHˆÚPˆ[Z]
KÜˆİ™\œšYHHX\Ø\˜H™\XÚ[™ÈHÛÛ[X[™‚‚˜˜\Ú™ØÚÙ\ˆ[ˆ‹‹ˆİ™[œÜÛÛ‹ÛYÜ˜[™ÙN›]\İK[X^[Û\ÜXÙK\Ú^™OLÌÌˆÜ˜ËÚ[™^šœÂ˜‚ˆÈÈX\›ˆ[Ü™B‚‹HÔ‘PQQHHÚ]YÜ˜[™ÙH\ËY[[[Ù[^[\\×JÎ‹ËÙÚ]X‹˜ÛÛKÜİ™[œÜÛÛ‹ÛYÜ˜[™ÙKØ›Ø‹ÛXZ[‹Ô‘PQQK›Y
B‹HÕXÚšXØ[]˜[X][Û—JÎ‹ËÙÚ]X‹˜ÛÛKÜİ™[œÜÛÛ‹ÛYÜ˜[™ÙKØ›Ø‹ÛXZ[‹ÙØÜËÙ]˜[X]K›Y
B‹HÔÙXİ\š]WJÎ‹ËÙÚ]X‹˜ÛÛKÜİ™[œÜÛÛ‹ÛYÜ˜[™ÙKØ›Ø‹ÛXZ[‹ÙØÜËÜÙXİ\š]K›Y
B‹HÓÜ\˜][ÛœÈ™XY[™\Ü×JÎ‹ËÙÚ]X‹˜ÛÛKÜİ™[œÜÛÛ‹ÛYÜ˜[™ÙKØ›Ø‹ÛXZ[‹ÙØÜËÛÜ\˜][ÛœË\™XY[™\ÜË›Y
B‹HÔ™[X\ÙH›ØÙ\ÜÈ[™İX\˜[Y\×JÎ‹ËÙÚ]X‹˜ÛÛKÜİ™[œÜÛÛ‹ÛYÜ˜[™ÙKØ›Ø‹ÛXZ[‹Ô‘SPTÑK›Y
