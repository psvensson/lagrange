# Solve report: fresh-join-multi-peer-contact

**Goal:** A fresh-joining node accepts multiple candidate contact addresses (comma-separated SEED_NODE_ADDRESS / --seed) and probes them for reachability exactly like the durable-rejoin path, so a fresh join succeeds through any live cluster node when a listed candidate is down; guard tests prove candidate-list parsing, probe fallback selection, and an in-process join completed through a non-seed node.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/fresh-join-multi-peer-contact-2026-07-12T14-44-03-698Z.report.json

**Attempts:** 1

## Scope Pressure
- Changed files: 10
- Change bytes: 47603
- Owner areas: scripts/run-fresh-join-multi-peer-scenarios.js, src/bootstrap, src/constants, src/entrypoint-runtime-join-decision.js, src/index.js, test/bootstrap
- Categories: other, runtime
- Action: land or separate 6 owner areas: scripts/run-fresh-join-multi-peer-scenarios.js, src/bootstrap, src/constants, src/entrypoint-runtime-join-decision.js, src/index.js, test/bootstrap
- Split plan:
  - src/bootstrap: 4 file(s)
  - test/bootstrap: 2 file(s)
  - scripts/run-fresh-join-multi-peer-scenarios.js: 1 file(s)
  - src/constants: 1 file(s)
  - src/entrypoint-runtime-join-decision.js: 1 file(s)
  - src/index.js: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **fresh-join-multi-peer-contact-main** [solved] rung 1, attempts 1, metric 0 -> 0

## Findings
- **fresh-join-multi-peer-contact-main**: Subagent verifier approved the source changes against Quest intent, guidelines, and doctrine (verdict APPROVE): single-candidate path proven byte-identical (probe count 0, same URL/log/backoff sequence), formation semantics preserved (all-down selects first candidate, rotation inside the existing retry budget), probe parity with durable-rejoin confirmed (same prober + fn, bounded 2s/candidate), in-proc non-seed join test judged honest; its one minor defect (https:// candidate mangled by HTTP_PREFIX check) was fixed post-verdict with scheme passthrough in resolveSeedContactUrls and probeAutoRejoinPeerAddress plus a guard assertion [subagent:a7862dd39b92aaf89]
- **fresh-join-multi-peer-contact-main**: Scope consolidation to satisfy the owner-area bound: helpers-barrel edit reverted in favor of direct imports from entrypoint-runtime-join-decision, the in-proc non-seed join guard lives in test/bootstrap (it exercises the bootstrap join path in-process), and the mechanical test-shard regeneration is committed separately as a chore; verifier advisories recorded as follow-ups: candidate probe runs before the decision table can discard it (wasted probes on DURABLE_PROBED_PEER), rejoin hints persist only the selected candidate rather than the full list

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-12T14:44:14.279Z | fresh-join-multi-peer-contact-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/fresh-join-multi-peer-contact/attempt-1.diff |
