# Solve report: autonomy-and-parallel-defaults

**Goal:** Autonomy-by-default and parallel-first norms are encoded in core.md/boot.md/solver-quests.md/lifecycle.md, subagent-verified, and the steering packs regenerate green.

**Class:** process · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: solve/oracle/autonomy-and-parallel-defaults.json

**Attempts:** 0

## Links
- plan: docs/autonomy-and-parallel-defaults-plan.md

## Current Blocker
- Frontier: change-a-autonomy-default
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for change-a-autonomy-default

## Continuation
- Status: allowed
- Next action: continue supervised step for change-b-parallel-first
- Blocker: none

## Scope Pressure
- Changed files: 0
- Owner areas: none
- Categories: none
- Signals: none

## Frontiers
- **change-a-autonomy-default** [open] rung 0, attempts 0, metric ? -> ?
- **change-b-parallel-first** [open] rung 0, attempts 0, metric ? -> ?

## Findings
- **change-a-autonomy-default**: Autonomy-by-default encoded: core.md Default Posture section (4 stop triggers), boot.md+lifecycle.md First Commands lead with run --keep-alive, solver-quests.md Autonomy Default And Stop Triggers -> GOV-0073 (must) + GOV-0074 (must). [GOV-0073,GOV-0074; core.md/boot.md/lifecycle.md/solver-quests.md]
- **change-a-autonomy-default**: Independent subagent verifier CONFIRMED all 8 checks: sections inserted cleanly, 15 must-not + 6 principles intact, manual packs byte-stable under regen, 6 GOV rules ingested at must/must_not/should (not info), no contradiction with must-not #5/#12/#14/#15 or decision-experiments.md/ARCH-0091, steering:check exits 0 once staged. [subagent:a90fca8d11af831e2]
- **change-b-parallel-first**: Parallel-first encoded: core.md Default Posture: Parallelism + solver-quests.md Parallel-First Execution -> GOV-0079 (should), GOV-0080 (should), GOV-0058 (must serialize-on-conflict), GOV-0031 (must_not parallelism-on-proof-path); defers to decision-experiments.md parallel-Quest rule. [GOV-0079,GOV-0080,GOV-0058,GOV-0031]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
