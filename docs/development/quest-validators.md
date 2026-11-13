---
scope: governance
status: canonical
always_load: false
source_of_truth: self
last_reviewed: 2026-11-13
---

> **Canonical source.** Quest validation and honesty policy. Reached from the
> [`owner router`](../steering/router.md).

# Workflow Validators

## Owners Of Validation

The current Solver implementation owns executable validation:

| Owner | Validates |
| --- | --- |
| `scripts/solve/schema.js` | Quest and epic shapes, assignment paths and authority references, allowed probes, log entry types, verifier identity/verdict, and status vocabulary. |
| `scripts/solve/probes.js` | Measurements for `test-receipt`, `scenario-harness`, `oracle` and `script`, including an explicit non-measuring result. |
| `scripts/solve/commands.js` | Red sealing measurement, immutable sealed `doneWhen`, current verification, holds, altitude budget, and the landing sequence. |
| `scripts/solve/guards.js` | Changed paths, package assignments and epic scope, review eligibility, interaction guards, static checks, and canonical import-graph checks. |
| `scripts/solve/candidate-review.js` | The candidate digest, acceptance and declared proof-input binding, and applicability of recorded review. |
| `scripts/solve/store.js` | Append-only log reads/writes and derived quest state. |

Consult the generated [`command reference`](../steering/generated/solve-commands.md)
for supported operations. Solver v1 frontier metrics, strategy rungs, diff
response protocols and `run`/`step` gates are historical vocabulary, not current
validation requirements.

## Sealed Acceptance

`start` validates the draft and epic, requires a measuring red probe, records
`sealedAt`, and appends the seal. Before that, the draft may be refined. After
sealing, `doneWhen` is immutable; `land` compares it with the seal and measures
it again. A non-measuring or red probe cannot close the quest. If the premise
has changed, record supersession and author the replacement; do not silently
rewrite acceptance or substitute a weaker test.

Choose the probe for the claim before sealing: a bounded repair needs its
reproducer and affected interaction proof; a distributed service milestone
needs its public scenario proof. `scenario-harness` is terminal evidence only
under a certification epic. These levels must not be exchanged to force a
green result.

## Evidence Applicability And Review

An agent's assertion, an artifact's presence, or a green result from another
revision is insufficient proof. Retain provenance, executed scope, outcome and
limitations. Reuse earlier evidence only when the existing proof-selection and
receipt rules establish applicability to the current change, including relevant
dependencies, callers, configuration and environment. If applicability cannot
be established, run the necessary proof; a prose assurance is no substitute.

The [review policy](../steering/workflow-guidelines/solver-quests.md#recording-and-review)
covers source and proof/acceptance changes. `requiresVerification` preserves
`src/` coverage and requires review for operative steering, test policy,
specifications and Quest acceptance records. Other changed paths require review
unless the existing change taxonomy identifies them as inert and they are
explanatory Markdown, Quest log observations, license text or editor metadata.
An unfamiliar data/configuration surface therefore requires review. Changes to
the owning Quest's acceptance fields or declared proof inputs are checked against
HEAD even when no outside path changed; a missing approval cannot escape through
the Quest-directory exclusion. This includes
executable proof selection, runners, fixtures, thresholds, configuration and
publication machinery. Ordinary explanatory documents retain the direct route.
Review eligibility is conservative path classification, not a claim that code
can establish a reviewer's independence or interpret arbitrary prose.

A required independent `subagent:<id>` approval must be newer than the last
attempt and contain a valid `candidateDigest`. A current rejection refuses
landing. The digest binds HEAD, changed content, the statement, probe,
constraints, verification templates, current assignment, declared retained proof
artifacts and receipt-named witnesses. A changed acceptance input or assignment
invalidates approval. Ordinary notes in the owning Quest log and unreferenced
evidence do not change this digest. A former digest that does not bind the current
candidate requires renewed review; historical entries remain readable and intact.
Declared proof inputs must resolve to readable regular files inside the repository;
absolute paths, traversal and external symlink targets refuse approval and landing.
For a contained symlink, the digest binds the resolved target and the bytes the
probe consumes. Linked proof inputs require review because the link blob alone
does not establish the consumed bytes at HEAD. Ordinary candidate symlinks retain
their Git link identity.

Content binding is not executed-proof admission or complete dependency
selection. Those properties remain with the existing probe, receipt and selector
owners. Record a new attempt after a material repair and renew review for what
it invalidates, preserving applicable unaffected findings.

## Required Conduct And Executable Coverage

Record the causal assignment under the
[workflow owner](../steering/workflow-guidelines/solver-quests.md#causal-scope)
with `note --assignment "<reason>" --paths-file <list> --authority "<reference>"`.
The newline-delimited list contains exact repository-relative paths or directory
prefixes ending in `/`; globs, traversal, absolute paths and `.git` components
are refused. The authority reference identifies the existing authorized task or
scope amendment. Recording that reference does not grant authority.

The assignment is an untyped append-only finding. Its latest entry defines the
package scope; a new assignment explicitly amends it without changing the Quest
seal or clearing a blocked hold. Include required generated outputs in the
assignment and refresh them before requesting content-bound approval. `land`
checks all staged, unstaged and untracked nonignored changes before staging,
preserving exact filenames and both sides of renames. It reloads the Quest and
checks scope, holds, acceptance, proof inputs and review binding after generation,
after commit-time checks and after proof. A generated input that changes after
review requires renewed affected review; generated outputs have no blanket
exception. The staged tree must agree with the measured files and remain unchanged
across proof. The final commit stages only the terminal log entry. The owning log
must remain a regular file with its exact original bytes as a prefix; appended
observations are allowed, rewriting history is not. Unintended paths refuse
landing rather than being silently selected or included. The owning Quest
directory remains available for its record and evidence. Standalone fixes and
historical open Quests must record an assignment before landing; terminal records
are unchanged. The non-legacy epic's `authorizes` remains an additional outer
boundary, not a substitute for the assignment.

An implemented check establishes only the property it measures: artifact presence
or a structural inventory is not execution evidence. The broader immutable
target-selection and executed-receipt continuation retains its own acceptance;
these guards do not close that entire proposal.

Keep executable gaps and their next owners in the existing active work record,
not a second permanent policy ledger. Update this implementation description
when the owning guard changes; a documentation revision alone cannot make an
unimplemented check pass.

The existing landing guard requires an `altitude-check` finding after more
than three attempts since the previous altitude check. Use it to reconsider
the owner, hypothesis, evidence and scope. It is a recorded engineering decision,
not an automatic user stop or a requirement to replace an otherwise valid quest.

## Terminal Truth

Only `land` writes `solved`, after the probe, guards, staged-tree proof and
commit succeed. `note` can record `blocked`, `exhausted` or `superseded` with
the required fields; it cannot assert `solved`. A blocked hold is cleared by a
later attempt or typed finding, so record a clearance only after its reason is
resolved. An unavailable test or reviewer is a pending input, not evidence of
success or exhaustion.

The current epic summary and human reports link these records. They do not
invent attempts, revise terminal history, grant release acceptance, or claim
that unrequested work is running.
