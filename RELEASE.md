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
| Push to `main` | `.github/workflows/repository-health.yml` | Whole-repository structural analysis (`test:owner-debt:prepare` → `test:static` → `model:contracts`). **Not** a required check: structural debt on `main` is work to schedule, not a reason unrelated changes cannot land. |
| Nightly / manual | `.github/workflows/formation-health.yml` | `npm run health:formation -- --gcp`: the MovieLens formation-only phase with one node per GCP VM, its formation verdict appended to the trend and uploaded with the node logs. A standing signal, never a gate. |
| Manual | `.github/workflows/full-gate.yml` | `npm run check:release` — the whole system, on demand. No longer nightly: a scheduled whole-system proof is a standing veto, and an unchanged tree cannot grow new behavioural debt. |
| Push of a `v*` tag | `.github/workflows/release.yml` | The controlled GCP producer checks the annotated tag, version and notes, runs `npm ci` → `npm run check:release` → `npm run build:all`, packages Helm, builds and smokes the distroless image, and builds and clean-installs one commit-bound npm tarball. A GitHub-hosted publisher verifies the exact-run artifact handoff, repeats image smoke and asks the publication owners, then publishes those same bytes to npm, Docker Hub and GitHub Releases. Docker Hub overview update remains best-effort. |

## Artifact producer/publisher boundary

`scripts/release-artifact-handoff.js` owns the artifact names, canonical modes,
identity and byte manifest. The producer uploads a fresh directory containing
the two SEA executables, Helm chart, verified npm tarball, saved Docker image,
release notes, Docker Hub overview, public checksums and manifest. The hosted
job downloads only the immutable artifact ID emitted by its producer in the
same workflow run, into another fresh directory. There is no cross-run lookup,
repack, project dependency install or image rebuild in the publisher.

The separately passed manifest SHA-256 binds the manifest before parsing. The
consumer checks repository, workflow, run, tag, commit and version; every file's
size and SHA-256; the exact file allowlist; and standalone regular-file status.
Artifact transfer strips modes, so only after all validation succeeds does the
owner restore `0755` for the SEA executables and `0644` for data. After loading
the verified image, both declared image references must resolve to the producer's
immutable image ID and matching OCI version, revision and creation labels.
These checks and publication authorization precede npm publishing and Docker
credentials. The hosted job independently rechecks annotated-tag/main/latest
identity and rendered notes from the tagged checkout.

The public `SHA256SUMS` covers only the four public payloads, using flat basenames.
After downloading them beside that file, run `sha256sum --strict --check SHA256SUMS`.
The saved image and internal handoff metadata are not GitHub Release assets.

A publisher-only retry uses the same producer artifact ID and run identity;
the producer attempt is recorded, but need not equal the retry attempt. A full
rerun produces a new attempt-qualified immutable artifact. Handoffs expire after
seven days; missing or expired artifacts fail closed. Partial-channel conflicts
still require a forward patch release, never a moved tag.

## Release exit

A head may be tagged when, and only when, five checks hold. `npm run
release:preflight` evaluates them and prints the two commands that perform
the release; it never tags.

1. The release content is clean (porcelain status outside `solve/`).
2. HEAD is exactly `origin/main`.
3. The full corpus is green on the exact SHA: the `ci` workflow's `gate` job
   concluded success for that commit.
4. Every version literal agrees (`package.json`, the root package in
   `package-lock.json`, `CLI_VERSION`, `ENTRYPOINT_VERSION`, Helm chart
   `version` and `appVersion`) and `CHANGELOG.md` carries a non-empty, dated
   section for the version.
5. No tag exists for the version yet.

Everything after the tag is proven by `release.yml` on the tagged SHA (the
full pre-release proof, the SEA binaries, the Docker image and its smoke
test, the Helm chart, the npm package, the GitHub Release). The tag workflow
is the only artifact publisher; nothing it proves is re-run locally. Five-node
formation timing is a measured number quoted in the notes from the formation
health trend (below), never a gate. Decided 2026-09-05 after the 0.2 program
(`solve/epics/release-0-2.md`) had coupled the tag to a live convergence
result the shipped bytes had not met since 2026-08-30.

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
3. **Land it through the ordinary publish gate** (`npm run publish`) and wait
   for `ci / gate` on that SHA.
4. **Preflight, then tag:**
   ```sh
   npm run release:preflight
   git tag -a vx.y.z -m "lagrange-server x.y.z" <sha>
   git push origin vx.y.z
   ```
   `release.yml` builds and publishes every artifact from the tagged tree.
   The workflow serializes all releases and refuses to publish an older tag
   after a newer `v*` tag exists, preventing a rerun from moving `latest`
   backward. It also verifies that the tag is annotated and its commit is
   reachable from `origin/main`. The npm owner records the tarball SHA-512 and
   `gitHead`; a rerun skips npm only when both match, and fails closed on a
   foreign package, immutable-version content conflict, or commit conflict. A
   rerun of the current tag replaces existing GitHub release assets and notes,
   then publishes any draft left by an interrupted first attempt. A
   partial-channel failure is repaired forward with a new patch version; a
   tag is never moved.
5. **Docker Hub overview updates itself.**
   [`docs/dockerhub-overview.md`](docs/dockerhub-overview.md) is a template:
   `release.yml` renders it with a generated per-release "Release notes"
   section (from `CHANGELOG.md`) and PATCHes it to the repository description
   at <https://hub.docker.com/r/psvensson/lagrange> via the Hub API
   (best-effort — a failed description update never sinks a release). Manual
   fallback if the step warns:
   `npm run release:notes -- --mode overview --version x.y.z` and paste the
   output. Edit the template whenever user-facing container behavior changes;
   never hand-edit between the `RELEASE-NOTES` markers.

## Per-head proof, once

Each landed head is proven in full exactly once: the pre-push hook runs the
full test corpus before the push and `ci.yml` runs the impact cone after it.
`npm run check:release` (the corpus plus the project-hardening acceptance)
runs only inside `release.yml` on the tagged SHA, and on demand through
`full-gate.yml`. Release-time re-runs of the corpus, local gate receipts and
digest-bound release row Quests were removed on 2026-09-05.

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

The full release proof and builds use the controlled self-hosted GCP runner;
artifact publication uses GitHub-hosted `ubuntu-24.04`. Configure these values
under **Settings → Secrets and variables → Actions** before pushing a release
tag:

- repository variable `DOCKERHUB_USERNAME`: the Docker Hub account that owns
  `psvensson/lagrange`;
- repository secret `DOCKERHUB_TOKEN`: a Docker Hub personal access token with
  Read/Write permission.

The public npm package `lagrange-server` already exists. In its npm package
settings, configure a GitHub Actions trusted publisher for owner `psvensson`,
repository `lagrange`, and workflow `release.yml`. Leave the hosted publish
job's `id-token: write` permission in place: releases use npm's short-lived OIDC
credentials and generate provenance automatically.

This workflow does not read `NPM_TOKEN` or provide a token-based bootstrap or
fallback path. An existing secret with that name is unused by this workflow;
its removal and the corresponding token's revocation are separate credential
administration, not steps performed by a release.

The workflow pins npm `11.7.0` and Node `22.22.0`, above the trusted-publishing
minimums. npm trusted publishing and provenance require the GitHub-hosted
publisher, not the self-hosted producer. The publish owner checks the live registry
without accepting cached absence and refuses to overwrite or reinterpret an
existing version. A package name can be claimed between releases, so the
repository identity check is a release gate rather than an assumption.

The pre-release gate is clean-checkout safe: it downloads the digest-pinned
MovieLens input, regenerates ignored owner-debt analysis inputs before the
overlapped test readers start, verifies generated test shards, and caps the
fast TAP lane at the measured stable worker budget. The one aggregate-sensitive
evidence projection runs serially before the overlapped lanes. No untracked
developer artifact is required to release.

The hosted publish job requests `contents: write` for GitHub's short-lived
`GITHUB_TOKEN` and `id-token: write` for npm trusted publishing. Repository or
organization policy must allow those permissions. Ordinary CI, repository
health, the release producer, and the manual full gate retain `contents: read` and receive no Docker
Hub or npm publishing credentials.
