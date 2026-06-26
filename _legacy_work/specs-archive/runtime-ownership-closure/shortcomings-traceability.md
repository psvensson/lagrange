# Shortcoming Traceability Matrix

This matrix links each audited shortcoming to closure requirements, design
decisions, and implementation workstreams.

## Legend

- **S#**: Shortcoming ID from audit baseline.
- **R#**: Requirement number from `requirements.md`.
- **D#**: Decision ID from `design.md`.
- **W#**: Workstream number from `tasks.md`.

| Shortcoming | Description | Requirements | Design Decisions | Workstreams |
|---|---|---|---|---|
| S1 | `service_definitions` schema/model contradiction | R1, R11 | D1 | W1, W11 |
| S2 | Stage/plan dispatch documented but not production-wired | R3 | D3 | W3 |
| S3 | Admin ingress still owns direct SQL path in live wiring | R4 | D4 | W4 |
| S4 | Unified runtime lifecycle not active in startup wiring | R5 | D5 | W5 |
| S5 | Callback runtime uses parallel selector ownership | R6 | D6 | W6 |
| S6 | Callback runtime-kind propagation has implicit default sharp corner | R7 | D7 | W7 |
| S7 | Runtime descriptor validator not enforced where required | R8 | D8 | W8 |
| S8 | SQL-engine runtime-kind mapping inconsistent | R2, R9 | D2, D9 | W2, W9 |
| S9 | Docs drift from implementation state | R9 | D9 | W9 |
| S10 | Completion status can be detached from production evidence | R10 | D10 | W10 |

## Closure Evidence Requirements

For each `S#`, closure requires:

1. code change reference(s)
2. test reference(s)
3. documentation reference(s)
4. checkpoint result in `tasks.md` verification section

No shortcoming may be marked resolved without all four evidence types unless an
explicit defer rationale is recorded.
