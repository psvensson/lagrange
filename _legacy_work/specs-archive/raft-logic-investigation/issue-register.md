# Issue Register

## Blocker

- None in the latest short-run spike report.

## High

### RL-002: ID model mismatch requires adapter mapping

- Severity: high
- Component: integration surface
- Evidence:
  - raft-logic requires stringified u64 IDs
  - current runtime uses UUID-style service/replica IDs
- Impact:
  - adapter translation layer is mandatory for all integration points

### RL-003: Packet transport model mismatch

- Severity: high
- Component: transport bridge
- Evidence:
  - existing runtime packet handling assumes liferaft packet taxonomy
  - spike succeeded only with raft-logic-native transport harness path
- Impact:
  - direct drop-in replacement is not feasible without transport ownership changes

### RL-005: Verbose per-commit logging in spike runs

- Severity: high
- Component: observability/logging overhead
- Evidence:
  - `raft-worker-controller` emits `waitForCommit` start/resolved logs for each
    commit during workload phases
- Impact:
  - log volume/noise can distort IO overhead measurements and operator signal

## Medium

### RL-004: Runtime timing parity not validated

- Severity: medium
- Component: operations/config control
- Evidence:
  - spike validated startup-time tick configuration only
  - dynamic runtime timing mutation parity was not completed
- Impact:
  - operational behavior under dynamic timing changes remains unknown

## Resolved

### RL-001: sqlite restart term-health false negative in adapter

- Previous severity: blocker
- Component: transport/storage restart path
- Root cause:
  - adapter term update accepted only integer-typed terms; raft-logic status can
    return term as string
- Fix:
  - parse numeric term values in adapter state update path
- Validation:
  - `transport-storage-report.json` now passes `sqlite_restart_recovery` with
    restarted status including non-zero term
