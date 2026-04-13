# Implementation Plan: Steering Single-Path Consolidation

## Overview

This plan completes the steering cleanup end to end. The phases are ordered so
the repository never carries conflicting document ownership longer than needed.
Each phase ends with a consistency check before the next phase begins.

## Tasks

### Phase 1: Authority Map And Doctrine Naming

- [x] 1. Define the document authority map
  - Add a short ownership header to each steering document.
  - Add the matching architecture-entrypoint note to `architecture.md`.
  - Record the final document-role matrix in the steering set.
  - _Requirements: 1.1, 1.2, 1.3, 1.5_

- [x] 2. Remove doctrine-reference ambiguity
  - Rename the repository root doctrine document to `platform-doctrine.md`.
  - Update steering references to the exact implementation doctrine path.
  - Search the repository for ambiguous doctrine references and resolve them.
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 3. Add a doctrine-reference audit
  - Add a structural audit or documented grep procedure that proves steering
    documents use one doctrine path.
  - _Requirements: 2.3, 2.4, 9.3_

### Phase 2: Narrow `code-style.md`

- [x] 4. Reduce `code-style.md` to style and lint only
  - Remove architecture and system-behavior rules from `code-style.md`.
  - Keep formatting, lint, and local coding-style guidance.
  - Replace removed material with short pointers to the owning steering docs.
  - _Requirements: 3.1, 3.2, 3.4_

- [x] 5. Align the constants rule in `code-style.md`
  - State clearly that shared domain constants belong in their canonical owner
    module.
  - Allow file-local named constants and suite-local named test constants.
  - Ensure the wording matches the stable implementation-rules document.
  - _Requirements: 3.3_

- [x] 6. Audit style-rule ownership
  - Verify `code-style.md` no longer restates rule classes owned by
    `system guidelines.md` or `testing-guidelines.md`.
  - _Requirements: 3.4, 9.2_

### Phase 3: Refactor `system guidelines.md`

- [x] 7. Inventory `system guidelines.md` into keep vs move buckets
  - Mark durable repo-wide rules that stay in steering.
  - Mark current concrete owner maps and subsystem procedures that move to
    architecture documents.
  - _Requirements: 4.1, 4.2, 5.1_

- [x] 8. Rewrite `system guidelines.md` around durable rule classes
  - Keep single ownership, single-path execution, cache discipline,
    communication discipline, timeout-budget discipline, idempotency, and
    user-model discipline.
  - Add explicit wording that any given runtime function or semantic concern has
    one active code path at a time.
  - Replace moved material with concise pointers.
  - _Requirements: 4.1, 4.3, 4.4, 4.5_

- [x] 9. Move concrete owner maps into architecture documents
  - Update `architecture.md` to index the moved material.
  - Add or update linked support documents under `architecture/` where needed.
  - Ensure each moved section remains reachable from `architecture.md`.
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 10. Audit system-rule ownership
  - Verify each rule class kept in `system guidelines.md` has one
    authoritative statement.
  - Verify concrete owner mappings now resolve through architecture documents.
  - _Requirements: 4.5, 5.4, 9.4_

### Phase 4: Refactor `testing-guidelines.md`

- [x] 11. Inventory `testing-guidelines.md` into durable policy vs workstream
  procedure
  - Keep universal testing rules in steering.
  - Identify narrow scripts, thresholds, and workstream choreography for
    relocation.
  - _Requirements: 6.1, 6.2_

- [x] 12. Rewrite `testing-guidelines.md` around durable testing policy
  - Keep test-first bug fixing, owner-path regressions, no skipped tests,
    no test-only production paths, and targeted-before-broad execution.
  - Rewrite failure-handling language so it applies to the touched area and to
    failures discovered in chosen runs.
  - _Requirements: 6.1, 6.3, 6.4_

- [x] 13. Move workstream-local procedure out of `testing-guidelines.md`
  - Relocate exact script names, narrow threshold tables, and single-scenario
    closure ladders into specs, README files, or support docs.
  - Add short pointers from the testing policy where needed.
  - _Requirements: 6.2, 8.4_

- [x] 14. Audit testing-rule ownership
  - Verify `testing-guidelines.md` no longer competes with `code-style.md` or
    `system guidelines.md` for the same rule classes.
  - _Requirements: 6.4, 9.2_

### Phase 5: Tighten Roadmap And Scope Guidance

- [x] 15. Audit broad open roadmap rows
  - Identify rows that are too broad to drive direct implementation work.
  - Decide whether each needs acceptance notes, a linked spec, or a linked
    architecture document.
  - _Requirements: 7.1, 7.2, 7.3_

- [x] 16. Sharpen `roadmap.md`
  - Add the needed links or acceptance notes for broad open rows.
  - Keep `roadmap.md` as the only implementation-driving roadmap.
  - _Requirements: 7.1, 7.2, 7.3_

- [x] 17. Reconfirm steering roadmap pointer alignment
  - Verify `.kiro/steering/roadmap.md` still points correctly to `roadmap.md`,
    `product-roadmap.md`, and `edition-matrix.md`.
  - _Requirements: 7.4_

### Phase 6: Add Missing Governance Rules

- [x] 18. Define AGPL preparatory-work boundary
  - Add steering language for shared substrate work that may be done in this
    repository.
  - Keep the rule aligned with `roadmap.md` and `edition-matrix.md`.
  - _Requirements: 8.1_

- [x] 19. Define architectural exception process
  - Add the required owner, recording location, and removal checkpoint.
  - Point contributors to the correct document location for those records.
  - _Requirements: 8.2_

- [x] 20. Define spec-readiness rule for roadmap rows
  - Add steering language that says when a broad roadmap row must gain a spec
    before implementation tasks begin.
  - _Requirements: 8.3, 8.4_

### Phase 7: Update Active Specs

- [x] 21. Update active specs to the final steering model
  - Replace ambiguous doctrine references with the exact implementation doctrine
    path.
  - Update any active spec text that still points to the prior document roles.
  - _Requirements: 9.1_

- [x] 22. Move workstream-local procedure references to their local homes
  - Ensure active specs own their thresholds, scripts, checklists, and closure
    procedure where appropriate.
  - _Requirements: 8.4, 9.1_

### Phase 8: Final Audit And Closure

- [x] 23. Run a repository-wide document-ownership audit
  - Verify `code-style.md`, `system guidelines.md`, and
    `testing-guidelines.md` each own distinct rule classes.
  - Verify there are no ambiguous doctrine references in steering documents.
  - Verify every moved section has a surviving authoritative home.
  - _Requirements: 9.2, 9.3, 9.4_

- [x] 24. Run a roadmap-and-scope audit
  - Verify `roadmap.md` remains the only implementation-driving roadmap.
  - Verify `product-roadmap.md` remains visibility-only.
  - Verify `edition-matrix.md` still aligns with implementation-home rules.
  - _Requirements: 7.1, 7.4_

- [x] 25. Final single-path review of the steering stack
  - Verify the cleanup leaves one authoritative statement for each repo-wide
    rule class.
  - Verify the steering stack itself now follows the one-concern, one-owner,
    one-path rule.
  - _Requirements: 1.5, 4.3, 9.2, 9.4_

## Notes

- This work is complete only when the document roles, references, and moved
  material all align at the same time.
- The cleanup must not leave overlapping steering ownership in place between
  phases longer than necessary.
- The spec intentionally treats documentation structure as an architectural
  correctness problem: one concern, one owner, one path.
