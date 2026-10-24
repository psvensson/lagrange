---
scope: governance
status: canonical
always_load: false
source_of_truth: self
last_reviewed: 2026-10-22
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

For `src/` changes, landing requires an independent `subagent:<id>` approval
newer than the last attempt; a current rejection refuses landing. The runtime
checks identity format and log order. The author and reviewer must also bind
the review to the actual changed content and evidence, record a new attempt
after a material repair, and renew review for what that repair invalidates.
Preserve applicable unaffected findings instead of restarting the whole review.

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
