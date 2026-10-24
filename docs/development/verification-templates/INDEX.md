# Verification Templates

Attack-surface checklists for adversarial verification subagents (and human
reviewers). When a change touches one of these categories, the verification
prompt MUST include that template's checklist — filled in with the change's
specifics — so review quality does not depend on the prompt author
remembering each classic failure mode.

Every applicable item needs an evidence path (source, contract, test, model,
or immutable run artifact) and the invariant that evidence supports. Mark an
item inapplicable with a concrete scope reason. Label source-derived hypotheses
and unexecuted checks explicitly; neither is measured proof. When the same
causal error survives review repeatedly, the author and independent reviewer
reassess the assumption, witness, and checklist together. Improve an existing
guard when it can catch the error; do not automatically add another approval
stage or delete a useful question because a review missed it.

| Change category | Template |
| --- | --- |
| Admission / gating / hold predicates | [admission-gating.md](admission-gating.md) |
| Retry / re-drive / follow-up loops | [retry-loops.md](retry-loops.md) |
| Transport / delivery / wake semantics | [transport-delivery.md](transport-delivery.md) |
| Sweep / timer / periodic enforcement | [sweep-timer.md](sweep-timer.md) |
| Recovery / replay / reconciliation | [recovery-replay.md](recovery-replay.md) |
| Concurrency / locking / single-flight | [concurrency-serialization.md](concurrency-serialization.md) |
| Formation-vs-steady-state circularity | [formation-circularity.md](formation-circularity.md) |
| Test-harness / fixture fidelity | [harness-fidelity.md](harness-fidelity.md) |
| Registered cross-owner / coupled interaction | [owner-interaction.md](owner-interaction.md) |
| Guard/contract modules validating hostile input | [adversarial-js-intrinsics.md](adversarial-js-intrinsics.md) |

Usage in a verification prompt: paste the relevant checklist, replace each
placeholder with the change's specifics, and require the verifier to return
a verdict per item with an evidence path. For a cross-category diff, include the
union of every matching template in the verifier's initial prompt and deduplicate
overlapping questions. Do not include unrelated templates merely to make the
checklist longer, and do not defer an already-applicable template until after the
first verdict.

## Review scope and verdict

The author identifies the causal repair, candidate, changed contract, affected
callers, and relevant categories before review. The independent reviewer checks
that scope against the actual diff and its reachable consequences. A category
list guides coverage; it never excuses a concrete safety defect introduced by
the candidate. Use the current Quest findings and verification entry described
in [`solver-runbook.md`](../solver-runbook.md), not retired v1 review-bar commands.

Return one consolidated pass over the agreed surface. Group all discovered
findings by category and give each the violated invariant, reachable path,
evidence, and effect on the repair claim. Do not stop at the first defect or
expand routine review into an unrestricted architecture audit. Follow-up review
checks corrections and their affected consequences, reusing still-applicable
evidence through the existing provenance and proof-selection owners.

For each claim, separate safety, recovery progress under stated finite-failure
assumptions, and resource bounds. A safe refusal does not prove eventual useful
service; a successful request does not prove recovery or bounded retained work.
State whether the evidence is deterministic, native, or from real physical
failure domains, and distinguish a product failure, fixture failure, verifier
error, and unavailable execution. Preserve the first failing artifact.

An unrelated finding gets an owner and disposition in the existing record.
It blocks this repair only when it invalidates the repair's contract, proof, or
safe integration; otherwise the integration owner carries it forward without
rewriting the scenario or release verdict. The three acceptance claims are
defined in [`release-gate.md`](../../../test/guidelines/release-gate.md).
Repeated refutation of the same causal assumption triggers reassessment by the
current roles; a round count alone creates no new reviewer or mandatory gate.

Design-time counterpart: [design-note-template.md](design-note-template.md)
structures a design note when the change needs design review. It covers consumed
surfaces, typed failure edges, cached views, and identity without requiring a
separate design stage for every bounded repair.
