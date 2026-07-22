---
scope: boot
status: manual-pack
always_load: true
source_of_truth: self
canonical_rules: docs/steering/workflow-guidelines/solver-quests.md
last_reviewed: 2026-07-22
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
override path (see core.md "Pack vs Source Precedence"; drift repair is covered
under "Conflict Rule And Escape Hatch" below).

## Quest Vocabulary

The canonical glossary lives in [`core.md`](core.md) "Vocabulary" — always
loaded and read first. One additional term used here: a **Report** is the
projection of the event log and terminal state.

## First Commands

First apply the Quest threshold in `AGENTS.md`. Below it, do the bounded work,
prove it, and commit it without creating workflow state. Above it, start with
the read-only capability preflight:

Direct work is progressive: a failed measurement, expansion beyond the bounded
owner scope, or a durable finding needed for handoff is the stop signal. Seal a
Quest before a second evidence-bearing intervention; preserve the first result as
provenance rather than backdating it as an attempt.

```sh
node scripts/solve.js doctor
```

For an existing Quest, run the read-only entry point. It combines capability
preflight, lint, and the stable structured next action without sealing or
beginning work:

```sh
node scripts/solve.js start --id <id>
```

For a new Quest, the same command may create and validate the linked draft:

```sh
node scripts/solve.js start --id <id> --statement "<sealed result>" \
  --spec-ref <spec-or-plan-reference>
```

Drive routine supervised work with one verb. It executes only structured
`begin-step` and `commit-step` actions; judgment, verification, checkpoint, and
repair actions stop for the operator. Committing requires an explicit capture
choice and summary—working-tree capture is never implicit:

```sh
node scripts/solve.js continue --id <id>
# make and prove the bounded change
node scripts/solve.js continue --id <id> --auto-diff \
  --summary "<what changed>"
```

`start` writes a versioned draft and stamps `links.draftedAtCommit` when the
Quest is new; it does not seal the goal. The first safe continuation lints and
appends the declaration. A lint failure appends nothing. The lower-level `new`,
`lint`, `next`, `step`, `audit`, and `handoff` commands remain available for
diagnostics and exceptional operations.

`doctor` reports whether a live agent adapter is explicitly enabled and
executable. Supervised mode uses `continue`; a configured autonomous adapter may
still use `run`. The no-op example adapter is never treated as a capability.

Version 2 source attempts accumulate into one landing candidate. `next` keeps
routine work moving; it does not prescribe per-attempt review or checkpoint.
Only at a real durability boundary request the candidate dossier explicitly:

```sh
node scripts/solve.js checkpoint --id <id> --dry-run \
  --reason <handoff|risky-tree|long-running|milestone>
```

At a terminal, `start`/`continue` returns `request-verification` with the exact
fingerprint. After independent review, one command validates the verdict against
current bytes, records the structured receipt, runs the full audit, and on
approval commits only Quest scope. Rejection records the fail-closed verdict and
never commits. No Solver command pushes.

```sh
node scripts/solve.js land --id <id> --verifier <stable-id> \
  --verdict approve --fingerprint sha256:<64hex> --receipt <ref>
```

## Before Verification Or Checkpoint

Before asking an independent verifier to inspect source bytes, run the cheap
mechanical checks and inspect the current typed dossier:

```sh
npm run audit:attempt-preflight
node scripts/solve.js next --id <id> --json
```

Only for an actual mid-Quest durability boundary, also run the explicit
checkpoint simulation with its reason. Routine and terminal work does not add a
checkpoint step.

```sh
node scripts/solve.js checkpoint --id <id> --dry-run \
  --reason <handoff|risky-tree|long-running|milestone>
```

The dossier must say that the candidate is structurally landable after the
required approval. If it does not, record the canonical same-frontier/same-base
replacement and complete path superset it names before spending a verifier turn.

Give the verifier the complete first-pass candidate manifest: common base,
fingerprint, complete current path union, attempt range, unresolved replacement
obligations, aggregate context, and every applicable attack template. After
approval, either perform the named checkpoint immediately or proceed directly
to terminal aggregate review; any intervening change invalidates the receipt.
The canonical details live in solver-quests.md "Source Change
Verification" and "Regular Commit (No Push)."

`report --id <id>` and `overview --write` are optional human views. They write
ignored projections and are never prerequisites for verification or handoff.

## Conflict Rule And Escape Hatch

If two steering files or instructions appear to disagree at execution time, do
not average them or compromise. Follow the Authority Order above.

When a Level 1 user instruction explicitly overrides or contradicts Quest or
domain-pack constraints:

1. State the contradiction in the chat or the Quest finding log.
2. Ask for confirmation before weakening safety bounds, deleting guardrails, or
   bypassing validation. This is the safety-specific instance of the core.md
   "Default Posture: Autonomy" stop-triggers; everything outside that stop-list
   stays autonomous.

Separately — and this is **drift repair, not a runtime override** — if a domain
pack rule is simply outdated (the source and the user agree; the generated pack
lagged), edit its source under `docs/steering/` and run
`npm run steering:llm:pack`. That regenerates the pack; it is not a way to resolve
a live user-vs-canon conflict, which the two steps above govern.
