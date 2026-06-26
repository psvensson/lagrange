# Design Document: Harness Baseline Root Cause Observability Hardening

## Overview

Strict baseline failures are currently hard to debug because the failure signal
is downstream (preflight/pre-load gate), while the bug is upstream in a multi-hop
control-plane critical path:

1. partition leadership and endpoint health
2. system-table writes (services/endpoints)
3. CDC event creation and forwarding
4. CDC delivery and retry behavior
5. system-cache apply and watermark advancement
6. discovery queries and strict admission

This design adds two things:

1. a bounded, structured snapshot captured at failure time (per node)
2. correlation and taxonomy so the snapshot points to one dominant upstream hop

## Design Principles

1. One code path for classification and formatting (no drift).
2. Bounded overhead: capture only on strict gate failure (and optionally at
   preflight start) rather than continuous high-volume polling.
3. Machine-readable diagnostics: stable codes and stable schemas.
4. Reuse existing IDs and ownership boundaries (no parallel state stores).
5. Leverage existing playback infrastructure; do not embed unbounded logs in
   reports.

## Data Model

### 1) `PreflightCriticalPathSnapshot`

A per-node diagnostic blob captured when strict gating fails.

Fields (minimum contract):

- `capturedAtMs` (epoch ms)
- `nodeId`, `address`
- `routerConnectivity`:
  - `connectedCount`
  - `reconnectingCount`
  - `disconnectedCount`
- `controlPlanePartitions` (summary for partitions required to serve discovery):
  - `nodes`
  - `services`
  - `node_endpoints`
  - `service_endpoints`
  - each entry includes `leaderKnown`, `leaderNodeId`, `isLeaderLocal`,
    and a bounded `lastErrorCode` if unknown
- `cdcHealth`:
  - `bufferDepth`
  - `retryCount`
  - `lastErrorCode`
  - `lastForwardAttemptAtMs`
- `cacheFreshness`:
  - `lastAppliedAtMs`
  - `appliedSchemaVersion` (if tracked)
  - `stalenessMs`
- `rowCounts`:
  - `sysPostgresWireServiceCount`
  - `nodeEndpointsCount`
  - `serviceEndpointsCount`
- `discovery`:
  - `selectedNodeIds[]`
  - `excludedByNodeId` (nodeId -> stable exclusion reasons)

The snapshot shape is intentionally a summary: it favors stable, compact
booleans/counters over verbose table dumps.

### 2) `RootCauseBundle`

A per-failure envelope included in the scenario report.

Fields (minimum contract):

- `rootCauseCode` (stable taxonomy code)
- `rootCauseClass` (broad grouping: transport/cdc/cache/discovery/leadership/etc.)
- `dominantInvariant` (if any)
- `invariants[]` (pass/fail list with stable codes and details)
- `snapshotsByNodeId` (nodeId -> `PreflightCriticalPathSnapshot`)
- `playback` pointers (manifest path / directory, if produced)

## Collection Architecture

### Where the snapshot comes from

Prefer one admin query per node that returns a pre-computed summary rather than
N individual queries from the harness. Concretely:

1. Extend existing admin snapshot/readiness plumbing to expose:
   - router connectivity summary
   - control-plane partition leader/health summary
   - CDC buffer/retry counters (already tracked internally)
   - cache freshness/watermark summary
   - service/endpoints row counts and/or last-applied metadata
2. The harness requests this snapshot only when strict gate failure is imminent
   (timeout reached) or on final failure classification.

### How invariants are evaluated

Invariant evaluation happens in the harness (scenario owner) using the captured
snapshots so:

- strict gate can attribute failures without reaching back into the cluster
- compare tooling can rely on a stable invariant evaluation schema

Example invariant codes:

- `LEADERSHIP_UNKNOWN_ON_CONTROL_PLANE_PARTITION`
- `CDC_RETRY_STORM`
- `CACHE_STALE_WATERMARK`
- `SERVICES_MISSING_SYS_POSTGRES_WIRE`
- `DISCOVERY_EMPTY_WITH_SERVICES_PRESENT`

Each maps to one `ROOT_CAUSE_CODE` and one `rootCauseClass`.

## Correlation IDs (`causeId`)

### Primary rule: reuse existing IDs

When an operation already has an ID (assignment token, operation id, etc.), use
that as `causeId` everywhere.

### Propagation

`causeId` should be present in structured logs/telemetry at:

1. control-plane write initiation (services/endpoints writes)
2. CDC forwarding (send/retry/failure)
3. cache apply (apply start/end, failure)

The root-cause snapshot surfaces “last seen” `causeId` per table when possible.

## Compare Tooling

Extend existing compare scripts to:

- print `rootCauseCode`/`rootCauseClass` for each run
- summarize key deltas from the root-cause bundle:
  - snapshot missingness rates
  - counts like `sysPostgresWireServiceCount`
  - cache staleness
  - CDC retry counts

The compare output should be compact and deterministic.

## Deterministic Debug Mode

Add an opt-in deterministic mode that pins:

- random seed
- preflight poll intervals / sampling jitter
- harness scheduling jitter (if any)

The goal is not to “make it pass”, but to make runs comparable so you can see
one variable change at a time.

## Validation Strategy

1. Unit tests for taxonomy, invariant evaluation, and bundle formatting.
2. Targeted integration tests for each hop (registration, CDC apply, discovery).
3. One strict baseline rerun (3-node and 7-node) to confirm:
   - on failure: bundles are present and actionable
   - on success: bundles are absent or empty and overhead is minimal

