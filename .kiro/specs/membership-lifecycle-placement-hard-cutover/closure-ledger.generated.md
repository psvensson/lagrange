# Closure ledger — generated board (do not edit)

Projection by `node scripts/closure-ledger-state.js --write`. Status + concern
come from the authored `closure-ledger.md` index (the current rollup);
`lastGate` and the drift flag come from each `closure-ledger/CL-*.md` record.
The DRIFT list is the WS8.1 worklist: records whose own top `- Status:` line
lags the index and need a normalized `### STATE` block.

Records: 38 · active frontier: 15 · drifted: 0

## Active frontier (needs attention)

| Id | Status | Last gate | Concern |
| --- | --- | --- | --- |
| CL-001 | narrowed | 085708Z | membership-publication |
| CL-002 | narrowed | — | harness-control-snapshot |
| CL-004 | narrowed | — | readiness-projection |
| CL-005 | narrowed | — | readiness-projection |
| CL-008 | narrowed | 20260611T061307Z | placement-planning-feedback |
| CL-009 | open | 20260611T052934Z | transport-replication-backpressure |
| CL-022 | narrowed | 20260612T085908Z | readiness-projection |
| CL-023 | narrowed | — | placement-priority-spread |
| CL-024 | narrowed | — | restart-rejoin-identity |
| CL-025 | narrowed | — | harness-control-snapshot |
| CL-028 | narrowed | — | placement-priority-spread |
| CL-029 | narrowed | — | placement-priority-spread (operation workflow liveness) |
| CL-030 | open | 20260612T173105Z | harness-oracle (primary) + node-resource-safety (secondary) |
| CL-031 | open | 20260612T223302Z | harness-oracle (blindness) + node-resource-safety (root) |
| CL-039 | open | 20260615T172427Z | membership-publication write-substrate / control-plane raft leadership placement |

## Status drift — record STATE vs index

_(none — every record STATE agrees with the index)_

## Status tally (all records)

- fix-landed: 2
- guarded: 21
- narrowed: 11
- open: 4

