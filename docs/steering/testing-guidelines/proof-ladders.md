---
scope: testing
status: canonical
always_load: false
source_of_truth: self
compiled_pack: docs/steering/llm/testing.md
parent_index: ../testing-guidelines/INDEX.md
last_reviewed: 2026-07-10
---

> **Canonical source.** Quest-driven validation, static guardrail preflight, file-size ratchet. Index: [`INDEX.md`](INDEX.md).

# Testing — Proof Ladders & Static Guardrails

## Quest-Driven Validation Policy

All non-trivial implementation work should have validation owned by its active
Quest.

Required workflow:

1. The active Quest must define the required validation surface.
2. Tests added during the change must match the Quest concern rather than an
   unrelated umbrella scope.
3. A Quest must not report SOLVED until its required validation has passed.
4. If validation reveals a second concern, record a finding and add or author a
   frontier instead of silently widening the current one.
5. After the Quest validation surface is green, perform the required closure
   deep dive across the affected area before claiming SOLVED (scope and stop
   condition defined under "Closure deep dive — scope" below).
6. If that deep dive finds mistakes, irregularities, or doctrine/system
   guideline violations in the affected area, fix them before claiming SOLVED.
7. If a Quest changes a shared contract, validation must prove not only the
   runtime owner path, but also the direct status, diagnostics, admin, harness,
   or reporting surfaces that consume that contract.
8. A Quest is not validation-complete while tail-consumer proof is still
   missing, even if the main owner tests are green.
9. When residual closure moves to a follow-on Quest or frontier, the original
   Quest must stop short of SOLVED until the split is explicit in a finding or
   the current Quest report.

This keeps test closure aligned with bounded implementation scope instead of
letting validation sprawl across unrelated concerns.

The Quest is not SOLVED merely because the named tests pass. Test closure and
Quest closure both require the final affected-area deep dive defined next, which is
the same obligation named in
[`docs/steering/system-guidelines.md`](../system-guidelines.md) §13 ("Closure
Requires Proof, Review, And Truth Repair").

### Closure deep dive — scope

The "affected area" is bounded, not the whole repo: it is the files the Quest
changed plus their **direct owner collaborators** — the owners and tail consumers
(status, diagnostics, admin, harness, reporting) named in the diff. The deep dive
re-reads exactly that set for:

1. doctrine / system-guideline violations introduced by the change, **and**
   pre-existing violations in the same semantic boundary (one owner / one concern);
2. tail-consumer surfaces of any changed shared contract that were not updated;
3. leftover scaffolds — a flag, test-only path, or dead branch the change should
   have removed.

The deep dive is **complete** when every file in that bounded set has been checked
and each finding is either fixed or recorded as an explicitly out-of-scope
follow-on frontier. It does not require reading files outside the touched owner
boundary.

## Static Guardrail Preflight And Closure Policy

Every non-trivial Quest must prove that it did not increase architecture
drift while fixing behavior.

Required workflow:

1. Before editing production code, capture the relevant static guardrail status
   in the Quest attempt summary or finding.
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
   output is too broad for focused work, and use the matching `:strict` command
   only when the touched boundary is expected to have no local violations.
4. After implementation and focused tests, rerun the same guardrails and record
   the after state.
5. A Quest cannot close when:
   - a relevant guardrail count increased
   - a touched production file has a new decision-boundary, runtime-grammar,
     metadata-gateway, or owner-ingress violation
   - the Quest weakens a guard, expands an allowlist, or moves code out of
     scan scope to make validation pass
6. Existing violations in touched files must be fixed when they are part of the
   same semantic boundary (one owner / one concern, per system-guidelines §2 One
   Semantic Owner Per Concern). If they are genuinely outside scope, the Quest must
   name the excluded boundary and record a follow-on Quest/frontier before
   closure.
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
