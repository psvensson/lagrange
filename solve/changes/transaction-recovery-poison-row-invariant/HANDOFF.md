# HANDOFF — transaction-recovery-poison-row-invariant

_Last updated: 2026-08-01. Written so another agent can resume without re-deriving any of the below._

## 1. Where the Quest stands

- **Quest state: SOLVED.** Deterministic guard green 4/4 across consecutive
  runs; audit **pass** (0 problems); independent verifier **APPROVE**
  (fingerprint `sha256:d86a2689a0cd07b1de0f242df0cf4ade6a65f9ead5dd3c1ce66070ec111f512f`
  recomputed exactly; 4 attack templates pass; no candidate defects).
- **Not yet landed** (`solve land` not run). Blocking item is the sealed
  constraint `live-validation-bound` (controlled live A/B), which is
  **environmentally blocked** — see §3.
- Working tree holds the full fix, uncommitted, on top of `main`. src
  fingerprint `8468ea3fef3edd6b`. Base commit `77b93bfa`. The aggregate
  fingerprint above is over the diff vs `77b93bfa` for the 9-path union.

## 2. What the change is (the sealed contract, implemented)

- `src/query/distributed/distributed-transaction-recovery.js` —
  `validateRecoveredTransactionDecision` attributes
  `TRANSACTION_RECOVERY_INCOMPLETE` with the exact failed `decisionDimension`
  (snake_case) + `transactionId`/`sessionId` via
  `buildTransactionRecoveryIncompleteError`.
- `src/bootstrap/owners/startup-runtime-handoff-owner.js` — records/publishes
  `transactionRecoveryOutcome {kind, errorCode, decisionDimension,
  routeSource}` on replay failure, clears on completion; snapshot carries
  `outcome`.
- `src/bootstrap/shared/startup-sql-runtime-handoff.js` +
  `owners/bootstrap-readiness-owner-probe-details.js` — surface
  `transactionRecoveryOutcome` on the readiness API.
- `src/bootstrap/node-joining-owner-construction.js` — wires `getRouteSource`
  from contact-seed diagnostics `authoritySource`.
- New guards: `test/bootstrap/transaction-recovery-handoff-outcome.test.js`,
  `test/query/transaction-recovery-poison-row-attribution.test.js`, runner
  `scripts/run-transaction-recovery-poison-row-invariant-scenarios.js`.
- `test/bootstrap/cold-node-authority-reacquisition-pressure.test.js` extended
  with `transactionRecoveryOutcome: null` (witness-shape assertion).

## 3. The live A/B blocker (the open work)

**Sealed constraint `live-validation-bound`** requires a controlled live A/B
(N≥2 fixed vs N≥2 reverted, poisoned durable transaction row, comparing the
readiness observable). This **could not run** and the reason is NOT yet fully
diagnosed — this is the resume point.

### Established facts (all verified this session)

1. The main working tree **reliably FAILS** the minimal live scenario
   `admin-query-smoke` (3-node `local.json`, fast-local) with "Seed node
   bootstrap API did not become join-ready … BOOTSTRAP_PHASE_INCOMPLETE,
   SQL_ENGINE_UNAVAILABLE,
   priority_control_plane_recovery_diagnostics_unavailable".
2. This is **NOT caused by the src change**: base src (`0cb2c672`, 5 files
   checked out from `77b93bfa`) fails identically; and a clean worktree of
   HEAD **plus the exact fixed src patch** (`8468ea3f`) **PASSES**.
3. A **minimal copy** of the main tree (`src/`, `package.json`,
   `package-lock.json`, `Dockerfile`, `.dockerignore`, `test/distributed`,
   `test/bootstrap`, `test/query`, `scripts/`, `dist/`, `data/`, `solve/`,
   `tools/`, `ci/`, `.gitignore`, real `node_modules`, `.opencode`,
   `opencode.json`, `eslint.config.js`) at `/tmp/opencode/bisect-min`
   **PASSES** the same scenario.
4. So: **main tree FAILS, but a copy containing essentially all of main's
   content PASSES.** The cause is a property of the main tree NOT captured by
   copying files — the prime remaining suspects are (a) the **directory path
   itself** (see §4), or (b) the `.git` directory (a real dir in main, absent
   / pointer in copies and worktrees).

### The A/B vehicle (ready to run once env is fixed)

- `test/distributed/scenarios/transaction-recovery-poison-row-live.js` — seeds
  + poisons a durable tx row (multi-participant `ONE_PHASE_COMMIT`, expected
  `decisionDimension=commit_mode`), restarts seed, captures
  `startupRuntimeHandoff.transactionRecoveryOutcome` from tight polls.
- `test/distributed/config/local-poison-row-ab.json` — 7-node config.
- `solve/changes/transaction-recovery-poison-row-invariant/live-ab/run-sample.sh
  <sample-id>` — clean containers + root-owned reuse-data, fast-local, stamps
  fingerprint, harvests report.
- `solve/changes/transaction-recovery-poison-row-invariant/live-ab/summary.md`
  — contract + blocker evidence. A `live-validation` finding is already
  recorded on the Quest pointing at this summary.

## 4. Environment quirks the next agent MUST know

- **Path aliasing**: the repo lives at
  `/media/peter/4509da27-…/peter/projects/lagrange` == physical
  `/mnt/data/peter/projects/lagrange` == logical `/home/peter/projects/lagrange`
  (the shell's `PWD` was the `/home/...` alias). All three are the same ext4
  dir (`stat -c %d` = 2049). Live runs were attempted from all three and all
  FAIL in main, while `/tmp/...` copies PASS. **The path/mount is the leading
  suspect** — e.g. docker may resolve a bind-mount source differently for
  `/mnt/data` vs `/tmp`, or a stale container/network/volume is keyed to the
  main path. Next step: inspect `docker inspect` on a FAILING main run vs a
  PASSING copy run and diff `HostConfig.Binds` / network / labels; and try
  `docker system prune`-style cleanup of stale `ddb-test` volumes.
- **git stash is broken here** (EXDEV cross-device rename because of the
  `/home` vs `/mnt/data` aliasing). Do NOT rely on `git stash`; use targeted
  `git checkout <base> -- <paths>` + `git apply` for arm switches.
  `git worktree add /tmp/...` DOES work.
- **Root-owned reuse-data**: after any container run, `.tmp/reuse-data` has
  root-owned files that defeat the host-side reset (EACCES). Clean between
  runs with `docker run --rm -v "$(pwd)/.tmp:/cleantmp" alpine sh -c 'rm -rf
  /cleantmp/reuse-data' && mkdir -p .tmp/reuse-data` (run-sample.sh does this).
- **audit "fresh probe evidence is not recorded"**: live runs and the guard
  runner write new reports under `test-output/reports/`; after running them,
  re-ingest with `solve.js ingest-evidence --id … --frontier
  transaction-recovery-poison-row-invariant-main [--probe doneWhen] --evidence
  <report>` to keep audit green (both a doneWhen-scope and a frontier-scope
  ingest are needed).

## 5. To resume

1. Read this file, then `node scripts/solve.js start --id
   transaction-recovery-poison-row-invariant`.
2. Finish diagnosing the live main-tree-vs-copy join-ready divergence (§3.4 /
   §4). Likely a stale docker resource keyed to the main path, or the path
   alias. This may itself warrant a small separate Quest.
3. Once a main-tree (or canonical-path) live run passes
   `admin-query-smoke`, run the A/B: `run-sample.sh fixed-1/2` then revert the
   5 src files to `77b93bfa` and `run-sample.sh reverted-1/2`, compare
   `details.handoff.typedOutcomeSample`.
4. Record the `live-validation` finding, then `node scripts/solve.js land --id
   transaction-recovery-poison-row-invariant --verifier <stable-id> --verdict
   approve --fingerprint sha256:d86a2689… --receipt <ref>`.
5. Run the ratchet trio (`npm run test:duplication`,
   `node scripts/check-unused-exports.js`,
   `node scripts/check-circular-dependencies.js`) and commit scoped to the
   Quest's files.

## 6. Do NOT touch (foreign / pre-existing)

- `.gitignore` opencode ignore-entry — local tooling, foreign to this Quest;
  left uncommitted deliberately.
- Other worktrees under `/tmp/cold-node-ab-v4-*`, `/tmp/opencode/wt-baseline-*`
  etc. — pre-date this session.
- `package.json` / `package-lock.json` optionalDependencies (@pulumi) — foreign
  change, shelved during step-commit and restored; not part of this Quest.
