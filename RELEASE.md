---
audience: development
documentClass: current
---

# Release process

Lagrange releases are cut from an annotated `v*` git tag on `main`. CI runs on
[GitHub](https://github.com/psvensson/lagrange) via **GitHub Actions**
(`.github/workflows/`).

While the major version is `0`, releases are **experimental / alpha** and carry
no backward-compatibility guarantee (see `CHANGELOG.md`).

## Pipeline overview

| Trigger | Workflow | What runs |
| --- | --- | --- |
| PR / push to `main` | `.github/workflows/ci.yml` | `npm ci` → `npm run test:gate` (fast tests + static analysis + model contracts). The statistical rolling-restart convergence gate is **not** blocking here — it is a variance-bounded property, tracked as a trend, not a pass/fail gate on every push. |
| Nightly / manual | `.github/workflows/full-gate.yml` | Re-runs `npm run test:gate` against the current default branch without path exclusions. |
| Push of a `v*` tag | `.github/workflows/release.yml` | Fail-fast release-notes gate (`node scripts/release-notes.js --mode check`: the tag must match `package.json` and have a non-empty `CHANGELOG.md` section) → `npm ci` → `npm run test:ci` → `npm run build:all` (bundle + SEA) → `helm package charts/lagrange-node` → checksum every release asset → build and smoke-test the distroless `linux/amd64` image with OCI provenance labels → build and clean-install one commit-bound `lagrange-server` tarball → publish that exact tarball to npm → push `<x.y.z>` + `latest` to `docker.io/psvensson/lagrange` → update the Docker Hub overview (best-effort) → publish the chart, SEA binaries, npm tarball, and `SHA256SUMS` to the GitHub Release with notes from the tagged changelog section. |

## Cutting a release

1. **Land all release content on `main`** and let `ci.yml` go green.
2. **Bump the version.** Edit `package.json` (and the `version` fields of the
   root package in `package-lock.json`), plus `version` and `appVersion` in
   `charts/lagrange-node/Chart.yaml`. The user-facing `--version` literals in
   `src/cli/cli-constants.js` and `src/constants/entrypoint.js` must match; the
   guard in `test/release/version-single-source.test.js` enforces this (kept as
   literals, not a `package.json` read, so the SEA binary — which has no
   `package.json` on disk — still reports the right version).
3. **Update `CHANGELOG.md`.** Move `[Unreleased]` items under a new
   `[x.y.z] — YYYY-MM-DD` heading and refresh the compare/tag links. Keep the
   _Known limitations_ section honest about convergence (see below). This is
   not optional bookkeeping: the section is the source of the release-page
   notes and Docker Hub release history, and `release.yml` fails in seconds if
   the tagged version has no non-empty section
   (`npm run release:notes -- --mode check --version x.y.z` runs the same
   gate locally; `test/scripts/release-notes.test.js` also pins it to
   `package.json`'s version in `test:fast`).
4. **Verify on a clean checkout** (the release Quest's `doneWhen`):
   ```sh
   npm ci
   npm run test:ci                       # full gate
   npm run package:npm                   # pack + clean install/import/CLI smoke
   docker build -t lagrange:rc .         # image builds
   docker run --rm -p 8080:8080 lagrange:rc &   # boots, opens 8080/8081/8082
   npm run build:all && ./dist/<binary> --version   # SEA runs, prints version
   helm template charts/lagrange-node    # chart renders
   ```
5. **Tag and push:**
   ```sh
   git tag -a v0.1.0 -m "Lagrange 0.1.0 (alpha)"
   git push origin v0.1.0
   ```
   `release.yml` builds and publishes every artifact from the tagged tree.
   The workflow serializes all releases and refuses to publish an older tag
   after a newer `v*` tag exists, preventing a rerun from moving `latest`
   backward. It also verifies that the tag is annotated and its commit is
   reachable from `origin/main`. The npm owner records the tarball SHA-512 and
   `gitHead`; a rerun skips npm only when both match, and fails closed on a
   foreign package, immutable-version content conflict, or commit conflict. A
   rerun of the current tag replaces existing GitHub release assets and notes,
   then publishes any draft left by an interrupted first attempt.
6. **Docker Hub overview updates itself.**
   [`docs/dockerhub-overview.md`](docs/dockerhub-overview.md) is a template:
   `release.yml` renders it with a generated per-release "Release notes"
   section (from `CHANGELOG.md`) and PATCHes it to the repository description
   at <https://hub.docker.com/r/psvensson/lagrange> via the Hub API
   (best-effort — a failed description update never sinks a release). Manual
   fallback if the step warns:
   `npm run release:notes -- --mode overview --version x.y.z` and paste the
   output. Edit the template whenever user-facing container behavior changes;
   never hand-edit between the `RELEASE-NOTES` markers.

## Convergence: what the release does and does not promise

This is the one property a distributed release must be candid about.

- **Safety is a hard floor, never relaxed.** Every certified run holds the
  safety invariants (no corruption, no unexpected node exit, no blind/stale
  oracle reads).
- **Bounded-time convergence is not guaranteed.** Rolling-restart convergence is
  statistical: the honest bar is a Wilson-95 lower bound over a fixed-code
  window of at least 15 runs
  (`docs/convergence-donewhen-metric.md`), not "converges by time T".
- **Eventual stabilization is proven** for the sole residual head via a
  monotone Φ-fixpoint over the real rebalancer kernel
  (`test/convergence/dt-priority-recovery-followup-stabilization-phi.test.js`).
  The residual is bounded *latency* of a proven-convergent loop, not
  non-termination.

Do not gate ordinary pushes on the statistical convergence rate — it is
satisfiable or violable by variance alone and would make CI flaky. Track it as a
trend and promote only through the sealed Wilson-bar rule.

## GitHub repository configuration

The workflows use GitHub-hosted `ubuntu-24.04` runners. Configure these values
under **Settings → Secrets and variables → Actions** before pushing a release
tag:

- repository variable `DOCKERHUB_USERNAME`: the Docker Hub account that owns
  `psvensson/lagrange`;
- repository secret `DOCKERHUB_TOKEN`: a Docker Hub personal access token with
  Read/Write permission.

The npm package is public and named `lagrange-server`. npm cannot configure a
trusted publisher until the package exists, so bootstrap it once with a
short-lived granular npm access token stored as repository secret `NPM_TOKEN`.
The release workflow passes this token only to the npm publish step. After the
first successful publication:

1. In the npm package settings, add a GitHub Actions trusted publisher for
   owner `psvensson`, repository `lagrange`, and workflow `release.yml`.
2. Delete the `NPM_TOKEN` GitHub secret and revoke the token on npm.
3. Leave the workflow's `id-token: write` permission in place; later releases
   use npm's short-lived OIDC credentials and generate provenance automatically.

The workflow pins npm `11.7.0`, above the trusted-publishing minimum, and runs
on a GitHub-hosted Node 22 runner. The publish owner checks the live registry
without accepting cached absence and refuses to overwrite or reinterpret an
existing version. A package name can be claimed between releases, so the
repository identity check is a release gate rather than an assumption.

The release job requests `contents: write` for GitHub's short-lived
`GITHUB_TOKEN` and `id-token: write` for npm trusted publishing. Repository or
organization policy must allow those permissions. Ordinary CI and nightly jobs
retain `contents: read` and receive no Docker Hub or npm publishing credentials.
