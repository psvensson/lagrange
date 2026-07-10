# Solve report: raft-committed-entry-immutability

**Goal:** Every production-usable Raft adapter preserves the index, term, and command identity of committed entries across conflict truncation, append, save, and overwrite paths while retaining ordinary uncommitted-tail replacement, and incoming conflicting AppendEntries is rejected without ACK or commit advancement.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/raft-committed-entry-immutability-2026-07-10T16-43-49-722Z.report.json

**Attempts:** 1

## Links
- spec: solve/specs/owner-boundary-hardening-and-unification/implementation-plan.md#W3
- plan: solve/epics/owner-boundary-hardening-and-unification.md

## Scope Pressure
- Changed files: 17
- Owner areas: scripts/run-raft-committed-entry-immutability-scenarios.js, src/partition, src/raft, test/partition, test/raft
- Categories: other, runtime, test
- Action: split by owner area before the next attempt (17 files)
- Action: land or separate 5 owner areas: scripts/run-raft-committed-entry-immutability-scenarios.js, src/partition, src/raft, test/partition, test/raft
- Split plan:
  - test/raft: 7 file(s)
  - src/raft: 5 file(s)
  - src/partition: 3 file(s)
  - scripts/run-raft-committed-entry-immutability-scenarios.js: 1 file(s)
  - test/partition: 1 file(s)
- Signal: broad-source-scope severity=medium
- Signal: large-diff-stack severity=medium

## Frontiers
- **raft-committed-entry-immutability-main** [solved] rung 0, attempts 1, metric 5 -> 0

## Findings
- **raft-committed-entry-immutability-main**: Independent final-diff verifier approved W3 after adversarial checks of the single SQLite write owner, stale-cache facades, committed prevLogTerm rejection, canonical batches, higher-term preamble ordering, both production adapters, provider bindings, and static ratchets. [subagent:/root/w3_raft_immutability_verify]
- **raft-committed-entry-immutability-main**: Post-attempt verification record: independent final-diff verifier approved the exact sealed W3 change artifact after adversarial single-owner, stale-cache, prevLogTerm, canonical-batch, higher-term-preamble, provider-binding, adjacent-test, and static-ratchet checks. [subagent:/root/w3_raft_immutability_verify]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-10T16:46:13.403Z | raft-committed-entry-immutability-main | observe | 5 -> 0 | progress | no_evidence |  | diff:solve/changes/raft-committed-entry-immutability/attempt-1.diff |
