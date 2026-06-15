---
scope: boot
status: manual-pack
always_load: true
source_of_truth: self
canonical_rules: steering/workflow/solver-quests.md
last_reviewed: 2026-06-01
---

> **Manual pack - edit here directly.** Load order is owned by
> [`AGENTS.md`](../../AGENTS.md). This file covers authority order, Quest
> vocabulary, first commands, and conflict resolution.

# LLM Boot Contract

## Authority Order

When sources appear to disagree at execution time, follow this order:

1. **User and developer instructions, and safety limits.**
2. **Quest workflow canon.** `AGENTS.md`,
   `steering/workflow/solver-quests.md`, and the active Quest
   file define the current task and rules of engagement.
3. **Domain packs under `steering/packs/*.md`.** Apply only rules whose
   scope intersects the touched owner boundary.

The source-vs-pack distinction is a generator concern, not an execution-time
override path. If cited source detail shows the pack is wrong or stale, fix the
source and regenerate with `npm run steering:llm:pack`.

## Quest Vocabulary

| Term | Meaning |
| --- | --- |
| Quest | One sealed unit of work under `solve/quests/<id>.json`. |
| `doneWhen` | Binary terminal predicate measured by a probe. |
| Frontier | Independent attack surface with its own metric. |
| Attempt | One measured try against a frontier. |
| Finding | Durable knowledge or a ruled-out approach. |
| Theory | System-level or frontier-level causal explanation tested by evidence. |
| Report | Projection of the event log and terminal state. |

## First Commands

For a new task:

```sh
node tooling/solve.js new --id <id> --statement "<sealed result>"
node tooling/solve.js step --id <id>
```

When a frontier stalls or the dossier says theory is required:

```sh
node tooling/solve.js theory list --id <id>
node tooling/solve.js health --id <id>
node tooling/solve.js theory system --id <id> ...
node tooling/solve.js theory option --id <id> --frontier <frontier> ...
node tooling/solve.js theory select --id <id> --frontier <frontier> --theory <theory-id>
```

For an existing Quest:

```sh
node tooling/solve.js status --id <id>
node tooling/solve.js step --id <id>
```

To commit a supervised attempt:

```sh
node tooling/solve.js step --id <id> --commit \
  --changeRef diff:<path> --summary "<what changed>"
```

To run autonomously:

```sh
node tooling/solve.js run --id <id> --executor agent --yes --max 20
```

To close or inspect:

```sh
node tooling/solve.js report --id <id>
```

## Conflict Rule And Escape Hatch

If two steering files or instructions appear to disagree at execution time, do
not average them or compromise. Follow the Authority Order above.

When a Level 1 user instruction explicitly overrides or contradicts Quest or
domain-pack constraints:

1. State the contradiction in the chat or the Quest finding log.
2. Ask for confirmation before weakening safety bounds, deleting guardrails, or
   bypassing validation.
3. If a domain pack rule is outdated, edit its source under `steering/`
   and run `npm run steering:llm:pack`.
