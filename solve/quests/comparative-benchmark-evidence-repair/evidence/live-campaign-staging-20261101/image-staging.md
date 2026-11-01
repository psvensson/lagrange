# Image staging for the comparative smoke campaign, 2026-11-01

Operator-only preparation of the planned data hosts tv-dator (192.168.86.32), adams-gamla
(192.168.86.41) and lenovo-laptop (192.168.86.27). Each host's machine-wide lab lock was taken with
the home-lab recipe (`flock -w 600`, holder record purpose `bench:image-staging-20261101`, agent
`claude:bench-live-campaign`) by a detached holder shell. All three were HELD at 22:40:41Z and
released at the end; afterwards there was no holder record and `flock -n` was free (`release.txt`).

## Steps

- Free disk before staging (Docker root on `/`): tv-dator 375G, adams-gamla 64G, lenovo-laptop
  160G. All three are far above the 6.5 GiB data-host minimum, so nothing was refused.
- Pulls (`pull-tv-dator.log`, `pull-adams-gamla.log`): on both daemons, `pingcap/pd:v8.5.8`,
  `pingcap/tidb:v8.5.8` and `postgres:17-alpine` were pulled. `pingcap/tikv:v8.5.8` and
  `psvensson/lagrange@sha256:c0fcc0d3…` were already present.
- lenovo-laptop transfers (`transfer-lenovo.log`): `docker save` on tv-dator piped through the
  controller into `docker load` on lenovo-laptop. Nothing was deleted on lenovo-laptop.

| image | sourceHost | contentIdentity | lenovo image id (overlay2) | duration |
| --- | --- | --- | --- | --- |
| pingcap/pd:v8.5.8 | tv-dator | sha256:1f84139c04e38967bf10598b51becad6c16f4ca83829e462766d9f8c0cc6971f | sha256:e0f80455… | 225 s |
| pingcap/tidb:v8.5.8 | tv-dator | sha256:21c5cb8f7a450221b8dcb67e19dbd90d21ae247079d8097cb3d66e3c35b76ee6 | sha256:11643047… | 166 s |
| postgres:17-alpine | tv-dator | sha256:442e8c2f61eda9635757a8835ec09c8cc52f622281dceb35d17942d10635d5dd | sha256:ab20e934… | 146 s |
| psvensson/lagrange@sha256:c0fcc0d3… | tv-dator | sha256:3c263af6030eea3c663dcd863813bcbcb03acdeb3c7ded8870199f4c251e2270 | sha256:18aeffc9… (untagged, `loaded:`) | 148 s |

lenovo-laptop's existing `pingcap/tikv:v8.5.8` (id `sha256:c7bcabdb…`, no RepoDigest) already has
the same content identity as the other hosts' copy, so it was not transferred.

## Content identities (`identities.txt`)

Content identity = sha256 of `docker image inspect --format '{{json .RootFS.Layers}}' <ref>` with the
trailing newline removed (`| tr -d '\n' | sha256sum`). This is the form the B2 identity owner
computes (`real-product-identity.js` contentIdentityOf, 9210b1cba), and it reproduces the
coordinator's Lagrange pin `3c263af6…`. Piping into `sha256sum` without stripping the newline gives
a different value (Lagrange `4a89da9e…`).

| image | tv-dator | adams-gamla | lenovo-laptop | match |
| --- | --- | --- | --- | --- |
| pingcap/pd:v8.5.8 | 1f84139c… | 1f84139c… | 1f84139c… | yes |
| pingcap/tidb:v8.5.8 | 21c5cb8f… | 21c5cb8f… | 21c5cb8f… | yes |
| pingcap/tikv:v8.5.8 | f04fa6f2… | f04fa6f2… | f04fa6f2… | yes |
| postgres:17-alpine | 442e8c2f… | 442e8c2f… | 442e8c2f… | yes |
| Lagrange Hub 0.4.0 | 3c263af6… | 3c263af6… | 3c263af6… | yes |

Store-specific image ids still differ (containerd store on .32/.41: manifest digest; overlay2 on
.27: config digest). Full values are in `identities.txt`.

## After staging

Free disk: tv-dator 373G, adams-gamla 62G, lenovo-laptop 158G.

Not placed: `mysql:8.4.11` (the TiDB SQL client image, `TIDB_SQL_CLIENT_IMAGE`) is on none of the
three data hosts. It was not in the staging list. If the runner's image check still requires it on
every host, lenovo-laptop will need it transferred from the controller.
