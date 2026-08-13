---
epicContractVersion: 2
id: release-0-2
roadmapRow: null
graduatesTo: null
---

# Release 0.2

## Intent

Turn the four Phase 0.2 roadmap rows into one narrow, evidence-bound release
program. The claim is stable core cluster operation plus integrated snapshot
catch-up. Phase 0.5 operator UX, automatic data affinity, distributed-reduce
certification, OCI execution, backup/PITR, and broad production readiness stay
outside the release.

## Verified starting point (2026-08-13)

- `node scripts/solve.js trace --row RM-0.2-...` reports zero directly linked
  Quests for all four rows. Roadmap symbols are not release closure.
- `public-path-multinode-baseline` is open and uses three nodes. It is a
  prerequisite, not the required cold five-node proof.
- The named topology set is not terminal SOLVED:
  `operation-ledger-quorum-authoritative-release` and
  `priority-surplus-remove-authoritative-placement-fence` are open/parked;
  `ordinary-placement-ready-lease-candidate-admission` is open.
- Snapshot S1-S6 Quests are terminal, including independently verified
  compacted-follower catch-up and an old N=15 live-rebuild certification. That
  receipt is provenance only: snapshot production files changed afterward, so
  exact-candidate replay and aggregate review remain mandatory.
- `local-memory-soak.json` asks for a five-minute warmup and fifteen-minute
  analysis window, but `sustained-write-throughput` hardcodes 120 seconds.
  Present-but-insufficient analysis can also be reported as deferred without
  failing `requireSamples`. The current path cannot certify leak freedom.
- Package, tag, and chart state remains `0.1.0`; no `0.2.0` changelog section
  exists, and the working tree is not a clean release candidate.

## Ordered gate plan

### G0 — Create release truth and candidate identity

Author four release-gate Quests with direct `links.roadmapRow` values:

1. `release-0-2-topology-safety`
2. `release-0-2-five-node-convergence`
3. `release-0-2-snapshot-integration`
4. `release-0-2-verification`

Add one machine-generated release-content digest over every shipped source,
package, chart, workflow, and release-metadata input while excluding only
Solver evidence/projections. The four row Quests remain open while G1-G4 close
prerequisites and collect provisional evidence. After freeze, every gate records
the same digest; any release-content change invalidates all approvals. The four
row traces must resolve before implementation proceeds.

### G1 — Close topology safety

Resolve authoritative operation-ledger release, surplus removal from complete
owner evidence without count/diversity loss, and ordinary ready-lease admission
while preserving startup authority. Old open, parked, or EXHAUSTED work is
provenance only. Close prerequisite Quests with fresh real-owner-path,
red-on-revert, current-production engagement, and independent aggregate
evidence, but keep the release-row Quest open for final-digest replay. Any
unresolved in-scope safety case blocks release.

### G2 — Certify cold five-node convergence

After G1 and formation prerequisites are SOLVED, add or select one release-owned
five-node scenario covering cold formation, user-table creation/readiness, and
initial runtime-service placement through production owners. Prove engagement
deterministically first and collect a provisional streak, keeping the row Quest
open. Final closure requires three consecutive fresh-container PASS reports with
no formation, table, placement, or safety stall. This is a release exit check,
not a general bounded-latency or pass-rate promise.

### G3 — Re-certify snapshot integration

Replay compacted-follower catch-up guards and the production wiring/live safety
proof provisionally. Verify the S1-S6 lineage, but keep the row Quest open until
the frozen-digest replay and independent aggregate review. Release notes may
claim integrated compacted-follower catch-up, not backup/PITR or an unrestricted
recovery envelope.

### G4 — Repair and execute enforcing memory soak

First land a prerequisite `memory-soak-enforcement-cutover` Quest that makes the
workload honor a duration long enough for warmup plus analysis and makes deferred
or insufficient analysis fail when `requireSamples` is true. Its oracle requires
every node to report `analyzed: true`, at least 30 samples, no `insufficient-*`
reason, and no detected leak.

After that prerequisite is SOLVED, collect provisional soak evidence with:

```sh
node test/distributed/run.js \
  --config test/distributed/config/local-memory-soak.json \
  --scenario sustained-write-throughput --no-fast-local \
  --output test-output/reports/release-0-2-memory-soak.report.json
```

Do not use this run as an iteration loop; route a red result to an owner-level
deterministic reproduction before another soak.

### G5 — Freeze 0.2.0 metadata, then verify the exact candidate

Before final gates, set `0.2.0` in root `package.json` and root-package entries
in `package-lock.json`, `CLI_VERSION`, `ENTRYPOINT_VERSION`, and Helm chart
`version`/`appVersion`; create the dated changelog section and compare links.
Run `npm run release:notes -- --mode check --version 0.2.0`, then freeze the
release-content digest.

On a clean checkout of the final committed HEAD:

1. require `github-release-workflow-cutover` terminal SOLVED;
2. preflight GitHub release permissions, Docker Hub variables/token, and npm
   trusted-publisher or bootstrap-token state before creating a tag;
3. run `npm run test:gate` and `npm run test:ci`, release workflow contract
   tests, `npm run package:npm`, `npm run build:all`, Docker build/smoke, and
   Helm render/package;
4. rerun the G1, G2, G3, and G4 binding probes on final HEAD; every live report
   must fail closed unless its boot `SRC_FINGERPRINT` matches the frozen
   candidate/source digest;
5. independently review and SOLVE all four release-row Quests on that digest;
6. publish that HEAD and require GitHub `ci / gate` green for its exact SHA.

### G6 — Tag without further content changes

With no post-verification edits, push annotated tag `v0.2.0`. The tag workflow
is the only artifact publisher. Verify npm, Docker, chart/binaries/checksums, and
GitHub Release all resolve to the tagged SHA; record any partial-channel failure
instead of retrying an unverified tree.

## Release exit

Release only when the four directly linked Quests are SOLVED, share one frozen
release-content digest, final-HEAD gates and remote CI are green, publication
preflight passes, the worktree is clean, and version/changelog/tag identity is
consistent. Parked or EXHAUSTED prerequisites remain blockers, never waivers.

## Decision log

- 2026-08-13 — Put topology before five-node certification; required current
  snapshot replay; made soak enforcement a prerequisite; moved release metadata
  before exact-candidate verification; and added channel preflight plus one
  digest binding all release gates.
