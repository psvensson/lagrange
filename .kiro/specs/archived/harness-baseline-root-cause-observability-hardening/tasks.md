# Implementation Plan: Harness Baseline Root Cause Observability Hardening

## Overview

This plan executes in strict order. Do not start a task before the previous task
is complete and marked done.

## P0 - Contracts, Taxonomy, and Tests

- [x] 1. Add failing unit tests for root-cause taxonomy and bundle schema
  - [x] Assert strict preflight failure emits `rootCauseBundle` with stable fields.
  - [x] Assert taxonomy codes are owned by one constants module.
  - _Requirements: 4.1, 6.1, 8.1, 8.2_

- [x] 2. Implement taxonomy constants and root-cause bundle schema
  - [x] Add `ROOT_CAUSE_CODE` and `ROOT_CAUSE_CLASS` constants.
  - [x] Add a single bundle formatter that produces stable, compact output.
  - _Requirements: 4.1, 4.2, 6.1, 8.1, 8.2_

## P1 - Critical-Path Snapshot Capture

- [x] 3. Add failing tests for `PreflightCriticalPathSnapshot` capture on strict failure
  - [x] Assert per-node snapshot fields are present and bounded.
  - [x] Assert missing-data reasons are stable and machine-readable.
  - _Requirements: 1.1, 1.2, 1.4_

- [x] 4. Implement preflight snapshot collection and report wiring
  - [x] Add one admin-facing snapshot endpoint/provider per node.
  - [x] Wire snapshots into `rootCauseBundle.snapshotsByNodeId`.
  - [x] Emit playback pointers (manifest dir) when available.
  - _Requirements: 1.1, 1.2, 1.3, 4.1, 4.2_

## P2 - Invariant-Based Attribution

- [x] 5. Add failing tests for invariant evaluation and dominant invariant selection
  - [x] Assert invariant results are derived solely from snapshots (no fallback probes).
  - [x] Assert dominant invariant drives `rootCauseCode` selection deterministically.
  - _Requirements: 3.1, 3.2, 3.3, 8.3_

- [x] 6. Implement invariant evaluator and root-cause classifier
  - [x] Add one invariant evaluator module with stable codes.
  - [x] Map invariants to `ROOT_CAUSE_CODE`/`ROOT_CAUSE_CLASS`.
  - _Requirements: 3.1, 3.2, 4.2, 6.1, 8.1_

## P3 - Causal Correlation (`causeId`)

- [x] 7. Add failing tests for `causeId` presence across control-plane mutation path
  - [x] Assert service/endpoint mutations log/emit one `causeId`.
  - [x] Assert CDC forwarding and cache apply preserve `causeId`.
  - _Requirements: 2.1, 2.2, 2.3_

- [x] 8. Implement `causeId` propagation and surfacing in root-cause snapshots
  - [x] Reuse existing operation/assignment IDs where present; generate only when absent.
  - [x] Thread `causeId` through CDC forwarding/apply telemetry.
  - [x] Surface last-seen `causeId` per table in snapshots when available.
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

## P4 - Hop-Level Integration Coverage

- [x] 9. Add targeted integration tests for each critical-path hop
  - [x] Service registration produces discoverable `sys-postgres-wire` rows.
  - [x] CDC forwarding advances cache watermarks on all required nodes.
  - [x] Discovery returns endpoints once rows and cache are healthy.
  - _Requirements: 5.1, 5.2, 5.3_

## P5 - Compare Tooling and Deterministic Debug Mode

- [x] 10. Add failing tests for compare-script root-cause output
  - [x] Assert latest-vs-prior output prints `rootCauseCode` and key deltas.
  - _Requirements: 6.2_

- [x] 11. Implement compare-script root-cause sections
  - [x] Print root-cause code/class per run.
  - [x] Print compact deltas for snapshot missingness, cache staleness, CDC retries,
        and service row counts.
  - _Requirements: 6.2_

- [x] 12. Add failing tests for deterministic debug mode configuration
  - [x] Assert seed and sampling intervals are pinned and recorded in report metadata.
  - _Requirements: 7.1, 7.2_

- [x] 13. Implement deterministic debug mode in harness runner/config
  - [x] Add CLI/config flag and wire to scheduling/seed usage.
  - [x] Record deterministic settings in report metadata for reproducibility.
  - _Requirements: 7.1, 7.2, 7.3_

## P6 - Validation and Closeout

- [x] 14. Run targeted unit/integration suites for touched components
  - [x] Run only directly affected tests first.
  - _Requirements: 5.2_

- [x] 15. Run strict 3-node and 7-node baseline benchmarks (diagnostics validation)
  - [x] On failure: confirm `rootCauseBundle` is present and identifies one dominant hop.
  - [x] On success: confirm overhead is minimal and bundles are empty/absent.
  - _Requirements: 1.1, 4.1, 6.2_

- [x] 16. Record outcomes and residual gaps
  - [x] Update `results.md` with evidence and next root-cause targets.
  - _Requirements: 4.2, 6.2_

## Post-Closeout Remediation (2026-02-27)

- [x] R1. Make `register-service` cache-visibility timeout retryable end-to-end
  - [x] Seed API now returns typed retryable error
        `SERVICE_REGISTRATION_CACHE_VISIBILITY_TIMEOUT` with `503`.
  - [x] Join retry classifier now retries this code instead of treating it as terminal.
  - [x] Added regression tests in bootstrap/join suites.

- [x] R2. Fix preflight cache freshness null coercion and read-only cache accessor gaps
  - [x] Preflight snapshot no longer coerces `null` watermark to `0`.
  - [x] Read-only cache now forwards `getLastAppliedAtMs`,
        `getLastAppliedCauseId`, and `getAppliedSchemaVersion`.
  - [x] Added regression tests for null watermark and wrapper forwarding.

- [x] R3. Fix probe-timeout budget composition in harness reachability diagnostics
  - [x] `NodeHandle.getReachabilityDiagnostics` now uses one shared deadline
        across bootstrap/admin/ws/sql probes.
  - [x] Added regression test asserting downstream probes use remaining budget.
