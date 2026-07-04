# Release process

Lagrange releases are cut from an annotated `v*` git tag on `main`. CI runs on
[Codeberg](https://codeberg.org/psvensson/lagrange) via **Forgejo Actions**
(`.forgejo/workflows/`); the syntax is GitHub-Actions-compatible.

While the major version is `0`, releases are **experimental / alpha** and carry
no backward-compatibility guarantee (see `CHANGELOG.md`).

## Pipeline overview

| Trigger | Workflow | What runs |
| --- | --- | --- |
| PR / push to `main` | `.forgejo/workflows/ci.yml` | `npm ci` → `npm run test:gate` (fast tests + static analysis + model contracts). The statistical rolling-restart convergence gate is **not** blocking here — it is a variance-bounded property, tracked as a trend, not a pass/fail gate on every push. |
| Push of a `v*` tag | `.forgejo/workflows/release.yml` | `npm ci` → `npm run test:ci` → `npm run build:all` (bundle + SEA) → build the distroless Docker image → push it to Docker Hub (`docker.io/psvensson/lagrange`, required) and the Codeberg registry (`codeberg.org/psvensson/lagrange`, best-effort mirror), tagged `<x.y.z>` + `latest` → `helm package charts/lagrange-node` → publish chart + SEA binaries + `SHA256SUMS` to the Forgejo Release. |

## Cutting a release

1. **Land all release content on `main`** and let `ci.yml` go green.
2. **Bump the version.** Edit `package.json` (and the `version` fields of the
   root package in `package-lock.json`). The user-facing `--version` literals in
   `src/cli/cli-constants.js` and `src/constants/entrypoint.js` must match; the
   guard in `test/release/version-single-source.test.js` enforces this (kept as
   literals, not a `package.json` read, so the SEA binary — which has no
   `package.json` on disk — still reports the right version).
3. **Update `CHANGELOG.md`.** Move `[Unreleased]` items under a new
   `[x.y.z] — YYYY-MM-DD` heading and refresh the compare/tag links. Keep the
   _Known limitations_ section honest about convergence (see below).
4. **Verify on a clean checkout** (the release Quest's `doneWhen`):
   ```sh
   npm ci
   npm run test:ci                       # full gate
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

## Convergence: what the release does and does not promise

This is the one property a distributed release must be candid about.

- **Safety is a hard floor, never relaxed.** Every certified run holds the
  safety invariants (no corruption, no unexpected node exit, no blind/stale
  oracle reads).
- **Bounded-time convergence is not guaranteed.** Rolling-restart convergence is
  statistical: the per-run scenario-PASS rate is ≈25–33%, and the honest bar is
  a Wilson-95 lower bound over a fixed-code window of N ≥ 20 runs
  (`docs/convergence-donewhen-metric.md`), not "converges by time T".
- **Eventual stabilization is proven** for the sole residual head via a
  monotone Φ-fixpoint over the real rebalancer kernel
  (`test/convergence/dt-priority-recovery-followup-stabilization-phi.test.js`).
  The residual is bounded *latency* of a proven-convergent loop, not
  non-termination.

Do not gate ordinary pushes on the statistical convergence rate — it is
satisfiable or violable by variance alone and would make CI flaky. Track it as a
trend and promote only on a sealed N ≥ 20 Wilson bar.

## Runner prerequisite

Codeberg's hosted Forgejo Actions runners must be enabled for this repository
(one-time opt-in), or a self-hosted runner registered, before these workflows
execute. Until then the pipeline is a documented manual runbook (steps 1–5).
