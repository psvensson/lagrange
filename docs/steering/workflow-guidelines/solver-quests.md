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

Every change under `src/` is a quest and reaches the shared branch only as its
landing (R15), however small: a direct source commit naming one witness once
carried a regression its own change cone would have caught. Work likely to
need more than one measured attempt, or that changes an owner boundary, is a
quest too. Documentation, tests, scripts and generated metadata may be
committed directly, and the commit message names the witness.

The main push gate holds this. Every commit a push brings to `main` over the
remote `main` that changes a path under `src/` (a rename, deletion or type
change included) must be a landing: its own tree appends to a quest log the
terminal entry `land` writes, binding exactly that commit's `src/` change, in a
log recording the seal and a current approving verification. Message trailers
prove nothing. A long-lived branch enters as a merge, admitted with every
commit only it brings when an exact-commit whole-corpus or release receipt
names the merge commit itself and the merge names its governing quest
(`Quest:` trailer) whose log at the merge records a current approving
verification. Commits already on `main` are never judged. The landing guard's
own `admit` command runs the same judgement on any range.

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
