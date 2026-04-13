# Requirements Document

## Introduction

This specification centralizes all string and numeric literals into constants so
that every value has a single, canonical definition. The goal is to eliminate
format drift (addresses, message types, table names, config keys, SQL strings,
timeouts) and make it impossible to introduce new ad hoc values. Constants are
organized per system part and enforced by tooling across the codebase.

## Glossary

- **Scalar_Literal**: Any string or numeric literal in code (for example
  `'nodes'` or `5000`).
- **Constant_Module**: A module that exports named constants.
- **System_Part**: A top-level subsystem under `src/` (transport, bootstrap,
  partition, query, etc.).
- **Literal_Allowlist**: The small set of syntactically required literals
  (module specifiers) or explicitly justified exceptions.
- **Literal_Override**: An explicit `literal-ok` marker that allows a specific
  literal with justification.

## Requirements

### Requirement 1: Single Source of Truth for Scalars

**User Story:** As a developer, I want every string and number to be defined
once so that there is only one correct format.

#### Acceptance Criteria

1. ALL string and numeric values used in runtime behavior SHALL be defined in
   Constant_Modules and imported where used.
2. EACH distinct scalar value SHALL have a single canonical constant name.
3. Constants SHALL be immutable (frozen objects or const exports).

### Requirement 2: Constants Organized by System Part

**User Story:** As a developer, I want constants grouped by subsystem so that
I can find and update them quickly.

#### Acceptance Criteria

1. EACH System_Part SHALL provide a constants module that owns its values.
2. Shared values (tables, entity types, message types, timeouts, etc.) SHALL be
   defined in shared constants modules and imported by subsystems.
3. A single aggregator module SHALL export constants for discovery and tooling.

### Requirement 3: String Literal Centralization

**User Story:** As an operator, I want identical strings everywhere so formats
cannot drift.

#### Acceptance Criteria

1. ALL string literals in `src/`, `scripts/`, `cli/`, and `test/` code SHALL be
   replaced with constants, including table names, message types, address
   formats, SQL strings, config keys, error text, and log templates.
2. The only allowed inline strings SHALL be module specifiers required by
   `import`/`require` and explicitly approved Literal_Overrides.
3. Any Literal_Override SHALL include a short justification.

### Requirement 4: Number Literal Centralization

**User Story:** As a developer, I want numeric values to be self-describing and
consistent across the system.

#### Acceptance Criteria

1. ALL numeric literals in `src/`, `scripts/`, `cli/`, and `test/` code SHALL be
   replaced with constants, including timeouts, counts, limits, ports, and
   index values.
2. Numeric constants SHALL encode units in their names (for example `_MS` or
   `_BYTES`).
3. Any numeric Literal_Override SHALL include a short justification.

### Requirement 5: Tooling Enforcement

**User Story:** As a maintainer, I want tooling that prevents new literals from
creeping back in.

#### Acceptance Criteria

1. A lint or CI check SHALL fail when string or number literals are introduced
   outside Constant_Modules or the Literal_Allowlist.
2. The enforcement tool SHALL support Literal_Overrides with a required comment
   prefix (for example `literal-ok:`).
3. The allowlist and override rules SHALL be documented.

### Requirement 6: Migration Safety

**User Story:** As an operator, I want the refactor to preserve behavior.

#### Acceptance Criteria

1. Migrated code SHALL preserve runtime behavior and wire formats.
2. All unit, integration, and system tests SHALL pass after migration.
3. No duplicate or shadow constants SHALL remain after migration.
