# Results: Harness Baseline Root Cause Observability Hardening

## Baseline Evidence (Before)

- 3-node baseline:
  - report: `test-output/reports/postgres-baseline-3node-20260227T105400Z.report.json`
  - result: failed at strict preflight/pre-load (`strict_preload_readiness_failed`)
- 7-node baseline:
  - report: `test-output/reports/postgres-baseline-7node-20260227T105550Z.report.json`
  - result: failed at strict preflight/pre-load (`strict_preload_readiness_failed`, stalled progress)
- Compare summary:
  - `scripts/compare-latest-baseline-runs.sh --report-dir test-output/reports`
  - both 3-node and 7-node remained fail -> fail; load did not start (`ops_per_sec=0`)

## Implementation Notes

- Fixed a real raft integration bug in
  `src/raft/liferaft-provider.js`:
  `liferaft.command()` is Promise-based, not callback-based.
  - `propose()` now awaits/returns the Promise and invokes callback
    compatibly.
  - `proposeWithLeaderRouting()` timeout handling now wraps the Promise
    returned by `command()`.
- Added hop-level integration coverage in
  `test/integration/preflight-critical-path-hops.integration.test.js`:
  - service registration -> `sys-postgres-wire` rows
  - CDC forwarding -> cache watermark advancement + `causeId` preservation
  - discovery -> endpoint visibility after readiness
- Expanded compare tooling and tests:
  - `scripts/compare-latest-baseline-runs.sh`
  - `test/scripts/compare-latest-baseline-runs.test.js`
  - now prints `rootCauseCode`/`rootCauseClass` and compact key deltas
    (snapshot missing nodes, cache staleness, CDC retry counts, service row
    counts) when bundle snapshots are present.
- Implemented deterministic debug mode (opt-in) in harness config/runner:
  - config defaults in `test/distributed/harness/constants.js` and
    `test/distributed/harness/config-parser.js`
  - CLI/config wiring + metadata emission in `test/distributed/run.js`
  - tests in `test/distributed/harness/__tests__/run.test.js` and
    `test/distributed/harness/__tests__/config-parser.test.js`.
- Updated raft provider contract tests for Promise semantics:
  `test/raft/raft-provider-contract.test.js`.

## Baseline Evidence (After)

- 3-node strict baseline:
  - report:
    `test-output/reports/postgres-baseline-3node-20260227T154840Z.report.json`
  - result:
    failed in `preflight` (insufficient reachable admin-ready load nodes)
  - rootCauseBundle summary:
    present, `rootCauseCode=cache_stale_watermark`,
    `rootCauseClass=cache`, `dominantInvariant=cache_stale_watermark`,
    snapshots captured for 3/3 nodes
- 7-node strict baseline:
  - report:
    `test-output/reports/postgres-baseline-7node-20260227T155030Z.report.json`
  - result:
    failed in `preflight` (insufficient reachable admin-ready load nodes)
  - rootCauseBundle summary:
    present, `rootCauseCode=cache_stale_watermark`,
    `rootCauseClass=cache`, `dominantInvariant=cache_stale_watermark`,
    snapshots captured for 7/7 nodes
- Compare summary after implementation:
  - `scripts/compare-latest-baseline-runs.sh --report-dir test-output/reports`
  - both profiles remain fail -> fail (load still not started), but latest runs
    now emit root-cause code/class and key snapshot-derived signals.

## Residual Risks / Follow-Ups

- Success-path overhead validation is still pending because both strict baselines
  failed before load start in this run set.
- Preflight failures still surface very long free-form reason strings in some
  reports; reason normalization for `preflight` load-node discovery paths would
  improve compare readability.
- Dominant classified invariant is currently `cache_stale_watermark` in both
  profiles; next root-cause target should trace why cache freshness stalls while
  discovery probes concurrently return timeout/connection-refused on joiners.
