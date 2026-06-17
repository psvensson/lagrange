# Solve report: workflow-linking-and-memory-loop

**Goal:** All five workflow-improvement items (links+trace, FRONTIER.md, epics tier, promote-finding, memory-boundary) are implemented, subagent-verified, and the steering packs regenerate green.

**Class:** process · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: solve/oracle/workflow-linking-and-memory-loop.json

**Attempts:** 0

## Links
- plan: docs/workflow-improvement-plan.md

## Current Blocker
- Frontier: item1-links-and-trace
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for item1-links-and-trace

## Continuation
- Status: allowed
- Next action: continue supervised step for item5-memory-boundary
- Blocker: none

## Scope Pressure
- Changed files: 0
- Owner areas: none
- Categories: none
- Signals: none

## Frontiers
- **item1-links-and-trace** [open] rung 0, attempts 0, metric ? -> ?
- **item2-frontier-md** [open] rung 0, attempts 0, metric ? -> ?
- **item3-epics-tier** [open] rung 0, attempts 0, metric ? -> ?
- **item4-promote-finding** [open] rung 0, attempts 0, metric ? -> ?
- **item5-memory-boundary** [open] rung 0, attempts 0, metric ? -> ?

## Findings
- **item1-links-and-trace**: links field added to questTemplate (additive); report renders ## Links only when present; trace command joins quests by links (row/cl/spec/quest); listQuestIds+loadAllQuests exported. [scripts/solve.js cmdTrace; portfolio/cli/findings tests green]
- **item1-links-and-trace**: Independent subagent verifier confirmed all five items: Item1-5 CONFIRMED, one broken relative link found and fixed (operational-ground-truth.md closure-grammar path). Unit tests 109/109 on touched suites; node --check clean. [subagent:a412dd69311dc7b25]
- **item2-frontier-md**: frontier --write persists solve/FRONTIER.generated.md with a closes column; output is byte-deterministic (no wall-clock). [scripts/solve/frontier.js writeFrontier; diff byte-identical]
- **item3-epics-tier**: epics planning tier added: .kiro/epics/README.md + _template.md; AGENTS.md row points to it; roadmapRow key shared with links for trace join. [.kiro/epics/; AGENTS.md Where-Do-I-Look]
- **item4-promote-finding**: Findings promoted into steering MUST be written as a normative sentence containing MUST, SHOULD, or NEVER, because the steering pack generator infers rule strength from the body text and ignores front-matter strength and domain fields. [scripts/generate-steering-llm-pack.js inferStrength]
- **item5-memory-boundary**: memory-boundary.md defines in-repo-rules vs external-narrative split (rules in governance pack GOV-0003/0028/0029); operational-ground-truth.md is the single canonical home for the six traps; AGENTS.md shrunk to a pointer; steering:check added to test:static. [.kiro/steering/memory-boundary.md; operational-ground-truth.md; package.json test:static]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
