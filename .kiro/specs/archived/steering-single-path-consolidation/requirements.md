# Requirements Document: Steering Single-Path Consolidation

## Introduction

The steering set currently mixes durable repo-wide rules, current subsystem
ownership maps, workstream-local procedures, and broad roadmap items in ways
that make document ownership harder than it should be. This spec consolidates
the steering stack so each rule is stated once, each document has one job, and
contributors can locate the authoritative statement for a concern without
guessing.

The design anchor is simple: one semantic concern, one owning document class,
one active code path at a time. The steering cleanup itself must follow that
same rule.

## Glossary

- **Steering Documents**: Repo-wide implementation rules under `.kiro/steering/`.
- **Architecture Entrypoint**: `architecture.md` plus linked support documents
  under `architecture/` that describe current owner maps and subsystem detail.
- **Canonical Roadmap**: `roadmap.md`, the only roadmap that may drive
  implementation work in this repository.
- **Scope Matrix**: `edition-matrix.md`, the canonical mapping from feature
  area to edition and implementation home.
- **Spec-Local Detail**: Workstream-specific thresholds, scripts, checklists,
  rollout notes, and closure artifacts stored under `.kiro/specs/`.
- **Single-Path Rule**: Every runtime function and semantic decision has one
  active code path at a time.

## Requirements

### Requirement 1: Document Authority Map

**User Story:** As a contributor, I want each document class to have one clear
job, so I can find the authoritative rule for a concern without reading the
entire repository.

#### Acceptance Criteria

1. THE steering set SHALL define one authority map covering steering,
   architecture, specs, roadmap, and scope documents.
2. EACH steering document SHALL state what it governs and what it does not
   govern.
3. `architecture.md` SHALL state that it owns current subsystem owner maps,
   current data flow descriptions, and links to supporting architecture
   documents.
4. `roadmap.md` SHALL remain the only roadmap that may drive implementation
   work in this repository.
5. NO two documents SHALL claim primary ownership of the same rule class.

### Requirement 2: Doctrine Reference Uniqueness

**User Story:** As a contributor, I want doctrine references to point to one
clearly named implementation doctrine, so there is no ambiguity about which
doctrine governs coding work.

#### Acceptance Criteria

1. THE implementation doctrine SHALL be referenced by exact path in steering
   documents.
2. THE repository root doctrine document SHALL no longer create ambiguous
   doctrine references.
3. ALL steering documents that cite the doctrine SHALL point to the same file.
4. A repository search for ambiguous doctrine references within steering
   documents SHALL return zero unresolved hits.

### Requirement 3: Code Style Scope

**User Story:** As a contributor, I want `code-style.md` to cover formatting and
linting only, so style guidance does not compete with system behavior rules.

#### Acceptance Criteria

1. `code-style.md` SHALL cover linting, formatting, and local coding style only.
2. Architecture and ownership rules SHALL be removed from `code-style.md` and
   replaced with short pointers to the owning steering documents.
3. THE constants rule in `code-style.md` SHALL allow file-local named constants
   and suite-local named test constants while requiring shared domain constants
   to live in their canonical owner module.
4. `code-style.md` SHALL not restate system behavior rules already owned by
   another steering document.

### Requirement 4: Stable System Rules

**User Story:** As a maintainer, I want `system guidelines.md` to contain stable
repo-wide implementation rules, so the document remains useful even when
component names or subsystem wiring change.

#### Acceptance Criteria

1. `system guidelines.md` SHALL retain durable rules for single ownership,
   single-path execution, cache discipline, communication discipline,
   idempotency, timeout-budget discipline, and user-model discipline.
2. Current subsystem owner maps and component-specific procedures SHALL move to
   architecture documents or be replaced with concise pointers.
3. `system guidelines.md` SHALL state explicitly that any given runtime
   function or semantic concern has one active code path at a time.
4. THE remaining sections in `system guidelines.md` SHALL still be correct if
   current class names change.
5. EVERY rule that remains in `system guidelines.md` SHALL have a single
   authoritative statement inside that document or a direct pointer to the
   owning architecture document.

### Requirement 5: Architecture Owns Concrete Owner Maps

**User Story:** As a maintainer, I want concrete owner maps and subsystem detail
to live in architecture documents, so steering documents do not carry volatile
implementation structure.

#### Acceptance Criteria

1. `architecture.md` SHALL become the entrypoint for concrete owner maps and
   linked subsystem detail.
2. MATERIAL moved out of steering documents SHALL be placed in `architecture.md`
   or linked support documents under `architecture/`.
3. EVERY moved section SHALL remain reachable from `architecture.md`.
4. Steering documents SHALL point to `architecture.md` when current concrete
   owner mappings are needed.

### Requirement 6: Stable Testing Policy

**User Story:** As a contributor, I want `testing-guidelines.md` to define
durable testing policy, so workstream-local procedure does not obscure the rules
that apply to every change.

#### Acceptance Criteria

1. `testing-guidelines.md` SHALL retain universal testing rules, including
   test-first bug fixing, owner-path regressions, no skipped tests, no
   test-only production paths, and targeted-before-broad execution.
2. Script names, narrow scenario choreography, exact per-workstream thresholds,
   and workstream-local closure ladders SHALL move to specs, test READMEs, or
   architecture/test support documents.
3. FAILURE-handling language in `testing-guidelines.md` SHALL apply to the
   touched area and to failures discovered in the test runs chosen for the
   change.
4. `testing-guidelines.md` SHALL not require knowledge of one specific test file
   unless that file is part of stable project structure.

### Requirement 7: Roadmap Actionability

**User Story:** As a maintainer, I want open roadmap items to be sharp enough to
drive specs and tasks, so implementation work starts from a defined scope rather
than a broad title alone.

#### Acceptance Criteria

1. `roadmap.md` SHALL remain the only implementation-driving roadmap in this
   repository.
2. ANY roadmap item marked in progress SHALL include acceptance criteria or a
   linked spec or architecture document.
3. BROAD roadmap items that are not yet ready for direct implementation SHALL
   link to design-preparation work before task creation begins.
4. `.kiro/steering/roadmap.md` SHALL remain aligned with `roadmap.md`,
   `product-roadmap.md`, and `edition-matrix.md`.

### Requirement 8: Missing Governance Rules

**User Story:** As a maintainer, I want the steering set to cover the remaining
repo-governance gaps, so contributors do not need oral tradition to decide how
to handle borderline work.

#### Acceptance Criteria

1. THE steering set SHALL define the AGPL preparatory-work boundary for shared
   substrate work in this repository.
2. THE steering set SHALL define an architectural exception process with an
   owner, a recording location, and a removal checkpoint.
3. THE steering set SHALL define when a roadmap row requires a spec before
   implementation work begins.
4. THE steering set SHALL define where workstream-local procedure belongs so
   those details do not drift back into repo-wide steering documents.

### Requirement 9: Active Spec Alignment And Audit Closure

**User Story:** As a maintainer, I want active specs and current steering docs
to agree on document roles, so task execution does not point at stale guidance.

#### Acceptance Criteria

1. ACTIVE specs that cite steering documents SHALL be updated to the current
   document roles and exact doctrine path.
2. A final audit SHALL confirm there is no duplicated rule ownership between
   `code-style.md`, `system guidelines.md`, and `testing-guidelines.md`.
3. A final audit SHALL confirm there are no ambiguous doctrine references in the
   steering set.
4. A final audit SHALL confirm every section moved out of a steering document
   has a surviving authoritative home.
