---
scope: boot
status: manual-pack
always_load: true
source_of_truth: self
canonical_rules: docs/steering/workflow-guidelines/solver-quests.md
last_reviewed: 2026-06-19
---

> **Manual pack - edit here directly.** Load order is owned by
> [`AGENTS.md`](../../../AGENTS.md). This file covers authority order, Quest
> vocabulary, first commands, and conflict resolution.

# LLM Boot Contract

## Authority Order

When sources appear to disagree at execution time, follow this order:

1. **User and developer instructions, and safety limits.**
2. **Quest workflow canon.** `AGENTS.md`,
   `docs/steering/workflow-guidelines/solver-quests.md`, and the active Quest
   file define the current task and rules of engagement.
3. **Domain packs under `docs/steering/llm/*.md`.** Apply only rules whose
   scope intersects the touched owner boundary.

The source-vs-pack distinction is a generator concern, not an execution-time
override path. If cited source detail shows the pack is wrong or stale, fix the
source and regenerate with `npm run steering:llm:pack`.

## Quest Vocabulary

The canonical glossary (Quest, `doneWhen`, Frontier, Attempt, Finding, Theory,
park, owner, sealed, proof ladder, subagent, probe, gate states) lives in
[`core.md`](core.md) "Vocabulary" — always loaded and read first. One additional
term used here:

| Term | Meaning |
| --- | --- |
| Report | Projection of the event log and terminal state. |

## First Commands

For a new task, default to an autonomous, self-resuming run (drive to a true
terminal; see core.md "Default Posture: Autonomy"):

```sh
node scripts/solve.js new --id <id> --statement "<sealed result>"
node scripts/solve.js run --id <id> --executor agent --yes --keep-alive
```

`--max <N>` is optional (it caps the cycle count for one invocation; the default
cap applies when omitted, and `--keep-alive` resumes past it), so the canonical
runnable command leaves it off. `--yes` confirms that the `agent` executor may
make real edits — without it,
`--executor agent` refuses to run (it never silently mutates the tree). `--yes`
does **not** advance gates: surviving non-terminal gates (MAX_CYCLES,
THEORY_REQUIRED, recoverable BLOCKED) across restarts is what `--keep-alive` does
via the supervisor. Neither flag overrides the core.md "Default Posture: Autonomy"
stop-triggers (Authorization / Goalpost ambiguity / EXHAUSTED / Safety), which
still pause the run.

For human-paced or exploratory work, drive it step by step instead:

```sh
node scripts/solve.js step --id <id>
```

When a frontier stalls or the dossier says theory is required:

```sh
node scripts/solve.js theory list --id <id>
node scripts/solve.js health --id <id>
node scripts/solve.js theory system --id <id> ...
node scripts/solve.js theory option --id <id> --frontier <frontier> ...
node scripts/solve.js theory select --id <id> --frontier <frontier> --theory <theory-id>
```

For an existing Quest:

```sh
node scripts/solve.js status --id <id>
node scripts/solve.js step --id <id>
```

To commit a supervised attempt:

```sh
node scripts/solve.js step --id <id> --commit \
  --changeRef diff:<path> --summary "<what changed>"
```

To close or inspect:

```sh
node scripts/solve.js report --id <id>
```

Commit completed work by default — committing is durably authorized, so do not
wait to be asked. See core.md "Default Posture: Commit On Completion".

## Conflict Rule And Escape Hatch

If two steering files or instructions appear to disagree at execution time, do
not average them or compromise. Follow the Authority Order above.

When a Level 1 user instruction explicitly overrides or contradicts Quest or
domain-pack constraints:

1. State the contradiction in the chat or the Quest finding log.
2. Ask for confirmation before weakening safety bounds, deleting guardrails, or
   bypassing validation. This is the safety-specific instance of the core.md
   "Default Posture: Autonomy" stop-triggers (Authorization / Safety / scope — see
   core.md for the authoritative four); the default
   posture stays autonomous for everything outside that stop-list.

Separately — and this is **drift repair, not a runtime override** — if a domain
pack rule is simply outdated (the source and the user agree; the generated pack
lagged), edit its source under `docs/steering/` and run
`npm run steering:llm:pack`. That regenerates the pack; it is not a way to resolve
a live user-vs-canon conflict, which the two steps above govern.
