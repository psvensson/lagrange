---
audience: agent
last_reviewed: 2026-09-06
---

# Quest workflow

Conditional: read when starting, recording, scoping or landing a unit of
work. The invariants themselves are rules R15 to R23; this page says only how
they are carried out here. The command reference is generated at
[`solve-commands.md`](../generated/solve-commands.md); it is the authority on what
the CLI offers, and nothing here restates it.

## Choosing the unit

Work likely to need more than one measured attempt, or that changes an owner
boundary, is a quest (R15). A single-sitting change with an obvious proof is
committed directly, and its commit message names the witness.

## What a quest is

A directory holding the sealed record, an append-only log, and while open the
evidence its probe reads. The record fixes the statement, the owning epic and
one binary `doneWhen` probe. Sealing measures that probe and refuses to seal
unless it is red, so a quest can never be born already satisfied.

## The four owner decisions

Automation stops, and a person decides, at exactly four points: judgment about
what to do next, independent verification of source changes, repair of an
audit the work cannot resolve, and terminal landing. Everything between those
is recorded, not decided.

## Recording

Findings, attempts, verifications and one terminal entry are appended. An
attempt records the head it was made against and the change set it covers.
Nothing recorded is ever edited (R21); a correction is a new entry.

## Verification

A change under `src/` lands only behind an independent verification newer
than the last attempt, recorded with the verifier's identity and verdict. A
standing rejection blocks landing until an attempt answers it.

## Landing and publishing

Landing proves the tree that will be committed: it refuses unless the probe is
green, the scope holds, the interaction guard and the changed-path audits
pass, and the change proof succeeds. It commits and records the terminal
entry. It never pushes. Publishing is separate, runs the gate against the
exact head, and is the only thing that moves the shared branch (R22, R23).

## When a quest cannot finish

An honest stop is better than a false success. A quest that cannot proceed
records why and who must decide; a quest whose premise is gone is superseded.
Neither is a failure to hide.
