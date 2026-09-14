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
| PR / push to `main` | `.github/workflows/ci.yml` | `npm ci` → `npm run check`: fast static analysis over the changed paths, then the safety spine plus the subsystems this change obliges. It proves the change, not the corpus, and fails closed — an unclassifiable change refuses with `MODULAR PROOF NOT SAFE` rather than proving a convenient subset. The statistical rolling-restart convergence gate is **not** blocking here — it is a variance-bounded property, tracked as a trend, not a pass/fail gate on every push. |
| Push to `main` | `.github/workflows/ci.yml` (health steps) | Whole-repository structural analysis (`test:owner-debt:prepare` → `test:static` → `model:contracts`). **Not** a required check: structural debt on `main` is work to schedule, not a reason unrelated changes cannot land. |
| Nightly / manual | `.github/workflows/formation-health.yml` | `npm run health:formation -- --gcp`: the MovieLens formation-only phase with one node per GCP VM, its formation verdict appended to the trend and uploaded with the node logs. A standing signal, never a gate. |
| Push of `release-publishability/**` | `.github/workflows/release.yml` | Fast GitHub-hosted, non-publishing preflight. It checks current npm package/version state, GitHub OIDC claims for npm trusted publishing, and the current Docker Hub pull+push credential scope. These are freshness-bound external facts and are deliberately **not** permanent proof receipts. |
| Manual / `release-proof/**` branch | `.github/workflows/full-gate.yml` | First asks the durable proof authority whether `release-full-v1` already proves this exact SHA. If yes, GCP is not woken and the proof is reused. If not, the controlled GCP runner executes the complete release proof once; after success a separate GitHub-hosted recorder persists the proof receipt. |
| Push of a `v*` tag | `.github/workflows/release.yml` | Rechecks freshness-bound publication prerequisites → requires the durable `release-full-v1` receipt for the tagged SHA → builds and publishes the npm package **first** → builds SEA/Helm/Docker artifacts and smoke-tests the image → pushes Docker tags → updates the Docker Hub overview (best-effort) → publishes release assets and notes. The application proof is never rerun by the tag workflow. |

The durable proof design is specified in
[`docs/development/durable-proof-receipts.md`](docs/development/durable-proof-receipts.md).

## Release exit

A head may be tagged when, and only when, five checks hold. `npm run
release:preflight` evaluates them and prints the two commands that perform the
release; it never tags.

1. The release content is clean (porcelain status outside `solve/`).
2. HEAD is exactly `origin/main`.
3. The proof authority reports a valid durable `release-full-v1` receipt for
   this exact 40-character commit SHA.
4. Every version literal agrees (`package.json`, the root package in
   `package-lock.json`, `CLI_VERSION`, `ENTRYPOINT_VERSION`, Helm chart
   `version` and `appVersion`) and `CHANGELOG.md` carries a non-empty, dated
   section for the version.
5. No tag exists for the version yet.

Workflow history is **not** proof authority. A remembered green run, a branch
name, an Actions status, or a local report cannot substitute for the durable
receipt. The workflow that establishes a missing proof records the receipt once;
all later consumers ask the same authority.

Everything after the tag consumes the already-established content proof. The
tag workflow proves only facts that can have changed since that proof — for
example registry availability and credentials — plus the release artifacts it
constructs from the immutable tagged tree. Five-node formation timing is a
measured number quoted in the notes from the formation health trend (below),
never a release gate.

## Cutting a release

Landing velocity is several commits a day, so releases are small and frequent
instead of frozen. A patch release for one fix follows the same steps.

1. **Keep notes under `[Unreleased]`** as work lands; `test:fast` refuses an
   empty `[Unreleased]` while `package.json`'s version is uncut.
2. **Cut the version in one commit.** Re-head the `[Unreleased]` items as
   `## [x.y.z] — YYYY-MM-DD` with today's date and refresh the compare/tag
   links; bump `package.json` and the root package in `package-lock.json`,
   `version` and `appVersion` in `charts/lagrange-node/Chart.yaml`, and the
   `--version` literals in `src/cli/cli-constants.js` and
   `src/constants/entrypoint.js` (kept as literals so the SEA binary, which
   has no `package.json` on disk, reports the right version; the guard in
   `test/release/version-single-source.test.js` enforces agreement); quote
   the current `npm run health:formation -- --summary` line in the notes.
   Keep the _Known limitations_ section honest about convergence (below).
3. **Land it through the ordinary publish gate** (`npm run publish`). Then
   point `release-publishability/<version>` at that exact main SHA. This fast
   hosted check must be green before the expensive release proof is attempted.
4. **Establish or reuse the release proof.** Run `full-gate` for that exact SHA
   (manual dispatch or a `release-proof/**` ref). `full-gate` asks
   `ProofAuthority` first. If `release-full-v1` is already recorded, it exits
   without waking GCP. Otherwise GCP runs the proof once and the hosted recorder
   stores the receipt after success.
5. **Preflight, then tag:**
   ```sh
   npm run release:preflight
   git tag -a vx.y.z -m "lagrange-server x.y.z" <sha>
   git push origin vx.y.z
   ```
   `release.yml` consumes that same durable proof receipt; it does not repeat
   the corpus. npm publication is deliberately the first mutating release
   channel so a trusted-publisher problem is discovered before SEA/Helm/Docker
   build work. The workflow serializes releases and refuses to publish an older
   tag after a newer `v*` tag exists, preventing a rerun from moving `latest`
   backward. A partial-channel failure is repaired forward with a new patch
   version; a tag is never moved.
6. **Docker Hub overview updates itself.**
   [`docs/dockerhub-overview.md`](docs/dockerhub-overview.md) is a template:
   `release.yml` renders it with a generated per-release "Release notes"
   section (from `CHANGELOG.md`) and updates the repository description
   best-effort. A failed description update never sinks a release. Manual
   fallback if the step warns:
   `npm run release:notes -- --mode overview --version x.y.z` and paste the
   output. Edit the template whenever user-facing container behavior changes;
   never hand-edit between the `RELEASE-NOTES` markers.


The release owner's one post-publish action: after a release publishes under
`latest`, move `next` onto it by hand so `lagrange-server@next` never installs
something older than `latest`:

```sh
npm dist-tag add lagrange-server@<version> next
node scripts/checks/release-publication-receipt.js --reobserve-next
git add data/releases/v<version>.json && git commit -m "release: next observed on <version>"
npm run publish
```

The second command reads npm's dist-tags again and records `next` as now
observed in the release receipt; the consolidation budget row "npm next lags
latest" reads that record, so it clears from evidence and never by hand.

Without a local npm login, run the move from the Actions page instead:
workflow `release`, "Run workflow", input `move_next_to` = the version and
`otp` = a fresh code from your npm authenticator (the account enforces 2FA for
a dist-tag change). That job is the only one reading the `NPM_TOKEN` secret
and runs only by hand; the re-observe and commit above still follow locally.

The move stays manual on purpose (owner decision 2026-09-13): a long-lived npm
write token in CI is a larger risk than a lagging `next` at this release
cadence; trusted publishing authenticates `publish` only. The publication
receipt records `next` as observed and `nextLagging: true` when it trails
`latest`, and the consolidation budget reads that flag. Revisit if releases
become weekly.

## Proof once per exact SHA

The release-wide content proof has one semantic owner:
`scripts/proof-authority.js`.

The first registered permanent contract is `release-full-v1`. Its durable key
is the pair:

```text
(release-full-v1, <exact 40-character commit SHA>)
```

A successful receipt is stored outside normal source history under:

```text
refs/lagrange-proofs/release-full-v1/<sha>
```

The ref points to an annotated Git object that targets the proven commit and
contains the versioned receipt. This makes the fact independent of the workflow
or host that happened to establish it and independent of GitHub Actions log or
artifact retention.

Any consumer can ask:

```sh
node scripts/proof-authority.js check release-full-v1 <sha>
```

Exit status `0` means proven and reusable, `1` means authoritatively unproven,
and `2` means the authority is unavailable or stored evidence is malformed.
Only `proven` permits reuse. `npm run check:release` routes through the same
proof-aware runner, so a previously proven SHA skips the expensive work even
when invoked from a different process or machine.

The proof contract is part of identity. If a future release policy deliberately
strengthens the meaning of the full proof in a way that must invalidate old
receipts, introduce `release-full-v2`; never reinterpret `release-full-v1`.

### What is not cached forever

A proof receipt is permanent only when truth is a property of immutable content.
External facts can change while the SHA stays identical. Therefore the following
remain freshness-bound checks and may legitimately run more than once:

- npm registry reachability and candidate-version availability;
- npm trusted-publisher/OIDC configuration;
- Docker Hub credential validity and push scope;
- current availability or policy of another external service.

This distinction is deliberate. "Proof once" must not become "a credential
worked once, therefore it works forever."

## Formation health

Five-node cold formation is a standing signal, not a release gate.

- `npm run check:formation` runs the MovieLens demo's formation-only phase
  with five local node processes and fails unless the formation verdict is
  PASS and the seed's unexplained event-loop blocked time inside the
  formation window stays within the hardware-relative budget
  (`LAGRANGE_TEST_MACHINE_FACTOR`). Run it before landing a control-plane
  change (readiness, rebalancer, membership, raft, transport).
- `npm run health:formation -- --gcp` runs the same phase with one node per
  GCP VM and appends one record to `data/formation-health/trend.ndjson`;
  `npm run health:formation -- --summary` prints the recent records and the
  pass rate. The scheduled `formation-health.yml` workflow runs it nightly on
  the GCP runner and uploads the report, the trend and the node logs.
- Every live demo report carries `formationVerdict`: the seed's event-loop
  gaps inside the formation window with the hottest tagged sites, the
  ready-lease settle waits and their unready sets, the last observed
  critical spread gap and in-flight count, the schema-admission end state
  and an ordered causal chain. A red run explains itself without log
  forensics.

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

Publication and publication preflight use GitHub-hosted `ubuntu-24.04` runners.
Configure these values under **Settings → Secrets and variables → Actions**:

- repository variable `DOCKERHUB_USERNAME`: the Docker Hub account that owns
  `psvensson/lagrange`;
- repository secret `DOCKERHUB_TOKEN`: a Docker Hub personal access token with
  Read/Write permission.

The npm package is public and named `lagrange-server`. npm trusted publishing is
bound to owner `psvensson`, repository `lagrange`, and workflow `release.yml`.
The workflow keeps `id-token: write`; npm receives the GitHub-hosted OIDC
identity at publication time. The fast publishability job verifies the
available OIDC claims before GCP proof work begins. The actual npm-side trusted
publisher decision occurs at publish time, so npm publication remains the first
mutating release operation after the tag.

The full proof runner itself retains `contents: read`. Only the separate hosted
proof-recorder job needs `contents: write`, and it writes through
`ProofAuthority` after the gate has succeeded. Receipt recording is a registered
standing action in `ActionAuthority`; it does not grant permission to rewrite an
existing receipt or invent a different proof identity.

The tag publication job requests `contents: write` for GitHub release assets and
`id-token: write` for npm trusted publishing. Ordinary CI, repository health,
and the self-hosted full-proof execution receive no Docker Hub or npm publishing
credentials.
