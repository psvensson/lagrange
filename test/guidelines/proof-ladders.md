---
scope: testing
status: canonical
always_load: false
source_of_truth: self
last_reviewed: 2026-10-22
---

> **Canonical source.** Quest-driven validation, static guardrail preflight, file-size ratchet. Index: [`INDEX.md`](INDEX.md).

# Testing — Proof Ladders & Static Guardrails

## Quest-Driven Validation Policy

The active Quest owns the validation for its bounded causal repair. Declare the
invariant, real entry and owner paths, affected consumers, and proof required
for that claim before implementation. Use the acceptance distinctions in
[`release-gate.md`](release-gate.md): repair completion, representative service
success, and release acceptance have separate verdicts.

A Quest reaches `solved` only through the current landing command after its
sealed validation, relevant guards, and independent review pass. If the declared
claim changes, record the decision and use the existing supersession lifecycle;
do not weaken `doneWhen` retrospectively. A second concern gets a finding,
responsible owner, and disposition instead of silently widening the repair.
A shared-contract change includes the direct status, diagnostics, admin,
harness, and reporting consumers affected by that change.

### Closure review - scope and stop condition

Review the changed semantic boundary and its directly affected collaborators
and callers. Check the actual diff and reachable consequences for:

1. Introduced or exposed violations of the changed contract and assumptions
   necessary for the repair to be correct.
2. Consumers whose meaning changed without a corresponding update or proof.
3. Scaffolds, test-only paths, or dead branches introduced or made obsolete by
   the repair.
4. Safety, recovery progress, and resource obligations within the declared
   finite-failure and deployment assumptions.

Use the relevant
[`verification templates`](../../docs/development/verification-templates/INDEX.md)
to return one consolidated set of concrete findings. Every finding identifies an
invariant, reachable path, evidence, and closure consequence. A source hypothesis
is not measured evidence. Do not turn closure into an unrestricted architecture
review or a requirement to fix every pre-existing issue in a touched file.

Review is complete when the scoped surface is covered and each finding is either
fixed or explicitly routed with an owner. An outside-scope finding blocks this
repair only if it invalidates its contract, proof, or safe integration; it remains
visible to the integration owner otherwise. Introduced regressions and required
gate failures cannot be disposed of as unrelated debt. Repeated refutation of the
same causal assumption prompts a concise reassessment by the existing roles.
It does not automatically create another reviewer, Quest, or approval gate.

## Static Guardrail Preflight And Closure Policy

Every non-trivial Quest must prove that it did not increase architecture
drift while fixing behavior.

Required workflow:

1. Before editing production code, capture the relevant static guardrail status
   in the existing Quest attempt or finding.
2. Choose guardrails by boundary, not by convenience (each maps to a concrete
   command):
   - decision-boundary audit (`npm run audit:guideline:decision-boundaries`) for
     readiness, admission, lifecycle, retry, status, phase, outcome, or reason-code
     logic
   - runtime-grammar audit (`npm run audit:runtime-grammar`, or
     `audit:runtime-grammar:file` for a single file) for runtime meaning,
     owner-contract, or presentation/decision-layer changes
   - metadata gateway audit (`npm run test:metadata-gateway:audit`) for system-table
     read/write ingress
   - scalar/literal audit (`npm run audit:guideline:literals`) for files with
     material runtime edits
   - cycle and complexity ratchets (`npm run test:cycles` and `npm run
     test:complexity`) for extraction or broad refactor Quests
3. If a repo-wide guard already fails, run the narrowest file-scoped or
   boundary-scoped form that covers the touched files and record the inherited
   count before the change.
   Use `npm run test:metrics:scoped -- <files...>` when repo-wide complexity
   output is too broad for focused work. Existing touched files use that scoped
   cyclomatic-and-cognitive before/after ratchet unless zero local violations is
   an explicit boundary expectation. Every newly added JavaScript file under
   `src/`, `test/`, or `scripts/` has no inherited-debt exception and must pass
   both `npm run test:complexity:scoped:strict -- <files...>` and
   `npm run test:complexity:cognitive:scoped:strict -- <files...>`.
4. After implementation and focused tests, rerun the same guardrails and record
   the after state.
5. A Quest cannot close when:
   - a relevant guardrail count increased
   - a touched production file has a new decision-boundary, runtime-grammar,
     metadata-gateway, or owner-ingress violation
   - the Quest weakens a guard, expands an allowlist, or moves code out of
     scan scope to make validation pass
6. Repair existing violations that cause the defect or invalidate the changed
   contract. Route unrelated inherited debt with its boundary, evidence, and
   owner in the existing record. A new architecture task is warranted by the
   demonstrated cause, not merely by touching a file that contains debt.
7. Static guardrail proof is required even when focused unit and integration
   tests pass. Green behavior tests do not override a failed owner-path guard.

The intent is to make drift visible at Quest scale. A large inherited
repo-wide count is not a reason to allow new local debt.

## File-Size Ratchet Policy

Large owner files and large catch-all test files materially slow review,
debugging, and LLM-assisted implementation. Runtime Quests that touch already
oversized files should record whether they are adding local size debt or
extracting a smaller owner/helper boundary.

Required workflow:

1. Run `npm run audit:file-size` for broad runtime, control-plane, transport,
   harness, and test-infrastructure Quests.
2. New or newly edited source-code files must finish within the per-scope thresholds owned by `scripts/check-file-size-thresholds.js` (currently src ≤ 800, test ≤ 1500 lines).
3. If a Quest touches an inherited oversized source-code file, it must
   extract or refactor the touched file until it is within its scope threshold
   before closure.
4. New source-code files over their scope threshold fail closure; a follow-on extraction
   Quest is not sufficient for newly created oversize.
5. Use `npm run audit:file-size:strict` only for Quests that explicitly own
   repo-wide inherited file-size cleanup, because the repository still has
   inherited oversize files.
