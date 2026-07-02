---
scope: governance
status: canonical
always_load: false
source_of_truth: self
compiled_pack: docs/steering/llm/governance.md
parent_index: ../workflow-guidelines/INDEX.md
last_reviewed: 2026-06-01
---

> **Canonical source.** Quest closure and failure migration policy. Index:
> [`INDEX.md`](INDEX.md).

# Quest Closure

## SOLVED

A Quest is SOLVED only when `doneWhen` is satisfied by live probe evidence.

Before claiming SOLVED:

1. rerun the relevant harness or probe;
2. record the final attempt through the Solver;
3. regenerate the report with `node scripts/solve.js report --id <id>`;
4. cite the report and evidence path in the final response.

## EXHAUSTED

A Quest is EXHAUSTED only when every frontier has parked **as `exhausted`** — each
had at least one honestly-measured sample and no honest remaining move exists. A
frontier that parked as `cannot_measure` (it could not be measured at all) is
**not** EXHAUSTED: it is a resumable measurement park and does not count toward the
terminal, so a Quest with any `cannot_measure` park is still open (see
solver-quests.md "resumable measurement park").

EXHAUSTED is a real terminal result, not a request to keep patching locally.
Use findings to explain what was ruled out and author a new Quest only if the
desired outcome or frontiers have changed.

## MAX_CYCLES

MAX_CYCLES is not closure. It means the runner hit a safety bound. It is a
resume point, not a handoff: re-run with `--keep-alive` (which survives this
gate via the supervisor) or raise `--max` and resume. Switch to a supervised
`step` only when the work is genuinely human-paced (see core.md "Default
Posture: Autonomy").

## Failure Migration

When a fix changes the dominant failure without satisfying `doneWhen`, record a
finding that names:

- the previous dominant failure;
- the new dominant failure;
- the evidence path proving the shift;
- whether the current frontier still owns the next attempt.

If the frontier no longer owns the next attempt, park it or author a new Quest
with corrected frontiers. Do not treat symptom movement as SOLVED.
