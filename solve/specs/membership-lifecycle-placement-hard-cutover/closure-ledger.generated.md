# Closure ledger — generated board (do not edit)

Projection by `node scripts/closure-ledger-state.js --write`. Status + concern
come from the authored `closure-ledger.md` index (the current rollup);
`lastGate` and the drift flag come from each `closure-ledger/CL-*.md` record.
The DRIFT list is the WS8.1 worklist: records whose own top `- Status:` line
lags the index and need a normalized `### STATE` block.

Records: 43 · active frontier: 13 · drifted: 0

## Active frontier (needs attention)

| Id | Status | Last gate | Concern |
| --- | --- | --- | --- |
| CL-001 | narrowed | 20260616T071019Z | membership-publication |
| CL-002 | narrowed | — | harness-control-snapshot |
| CL-004 | narrowed | — | readiness-projection |
| CL-005 | narrowed | — | readiness-projection |
| CL-008 | narrowed | 20260611T061307Z | placement-planning-feedback |
| CL-022 | narrowed | 20260612T085908Z | readiness-projection |
| CL-023 | narrowed | — | placement-priority-spread |
| CL-024 | narrowed | — | restart-rejoin-identity |
| CL-025 | narrowed | — | harness-control-snapshot |
| CL-028 | narrowed | — | placement-priority-spread |
| CL-029 | narrowed | — | placement-priority-spread (operation workflow liveness) |
| CL-039 | open | 20260615T205549Z | membership-publication write-substrate / control-plane raft leadership placement |
| CL-044 | open | — | bootstrap joining-readiness (operation-ledger formation barrier) |

## Status drift — record STATE vs index

_(none — every record STATE agrees with the index)_

## Status tally (all records)

- closed: 4
- fix-landed: 2
- guarded: 24
- narrowed: 11
- open: 2

