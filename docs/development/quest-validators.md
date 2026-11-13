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
| `scripts/solve/schema.js` | Quest and epic shapes, allowed probes, log entry types, verifier identity/verdict, and status vocabulary. |
| `scripts/solve/probes.js` | Measurements for `test-receipt`, `scenario-harness`, `oracle` and `script`, including an explicit non-measuring result. |
| `scripts/solve/commands.js` | Red sealing measurement, immutable sealed `doneWhen`, current verification, holds, altitude budget, and the landing sequence. |
| `scripts/solve/guards.js` | Changed paths, epic scope, interaction guards, static checks, and canonical import-graph checks. |
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
covers source and proof/acceptance changes. The current automatic trigger in
`requiresVerification` is narrower: paths under `src/` require an independent
`subagent:<id>` approval newer than the last attempt. A current rejection
refuses landing. `note --verification` records a `candidateDigest`, and landing
rejects a mismatch when the recorded and current digests are present. This is
content checking as well as identity and log-order checking; it does not prove
complete acceptance-input coverage or make an absent digest a required-field
failure. The author and reviewer must bind the review to the actual content and
evidence, record a new attempt after a material repair, and renew review for what
that repair invalidates. Preserve applicable unaffected findings.

## Required Conduct And Executable Coverage

Policy applies even where an automatic check is narrower. `epicScopeProblems`
checks a non-legacy epic's `authorizes`, also allowing the Quest directory, epic
record and epic directory; it does not enforce a per-package assignment. Legacy
epics and standalone fixes do not acquire that scope guard. Record and review the
causal assignment under the [workflow owner](../steering/workflow-guidelines/solver-quests.md#causal-scope)
rather than inventing a schema field or claiming a guard exists. Conversely, an
implemented check establishes only the property it measures: artifact presence
or a structural inventory is not execution evidence.

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
