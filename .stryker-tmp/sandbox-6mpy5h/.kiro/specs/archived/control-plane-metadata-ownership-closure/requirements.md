# Requirements Document: Control-Plane Metadata Ownership Closure

## Introduction

The current control-plane metadata path has drifted away from the system
guidelines. Rows in the same architectural area are created through different
owners, propagated through partially different CDC paths, and observed through
cache-only readers whose correctness is not enforced uniformly.

This specification closes those deviations for all affected control-plane
metadata areas:

1. cluster identity metadata: `nodes`, `node_endpoints`
2. service catalog metadata: `service_definitions`, `service_endpoints`
3. replica lifecycle metadata: `services`
4. table topology metadata: `tables`, `partitions`, `replica_operations`
5. shared control-plane CDC propagation and cache application
6. discovery/readiness diagnostics that depend on the local `SystemTableCache`

The target state is strict single-owner behavior by table family, one
authoritative propagation path, one authoritative cache-application path, and
generic startup/join rules with no per-table ad hoc exceptions.

## Shortcoming Catalog

- **C1**: Rows in the same control-plane area are created and updated through
  different owners depending on bootstrap, join, or runtime context.
- **C2**: Some startup and join writes to CDC-propagated tables happen before
  subscriptions are active, without one generic cache handoff contract.
- **C3**: Partition-origin CDC propagation does not uniformly preserve
  authoritative event metadata such as `timestamp` and `causeId`.
- **C4**: Safe CDC propagation can report success even when no remote targets
  were actually resolved.
- **C5**: Discovery and readiness logic infer `sys-postgres-wire` health from
  inconsistent tables, producing misleading root-cause results.
- **C6**: Local SQL state and local `SystemTableCache` state can diverge without
  one generic invariant or regression test catching it.
- **C7**: Subscription and propagation behavior is partly table-specific rather
  than area-generic.
- **C8**: Ownership and field-level mutation rights are not documented with
  enough precision to prevent future bypasses.

## Glossary

- **Control_Plane_Table_Family**: A group of system tables that represent one
  architectural area and therefore must follow one ownership model.
- **Canonical_Row_Owner**: The one component allowed to create and mutate a row
  family except for explicitly documented field-level delegated ownership.
- **Field_Owner**: The one component allowed to mutate a defined subset of
  fields on an existing row.
- **Propagation_Owner**: The one component that fans out CDC events for
  control-plane metadata across message groups and nodes.
- **Cache_Apply_Owner**: The one component that applies CDC-propagated system
  table events into `SystemTableCache`.
- **Pre_Subscription_Cache_Handoff**: The generic mechanism that keeps local
  cache state correct for CDC-propagated tables when a node performs local
  writes before CDC subscriptions are active.
- **Discovery_Read_Model**: The cache-backed view consumed by
  `service_discovery_local()` and preload/admin readiness checks.

## Requirements

### Requirement 1: Canonical Ownership Matrix for Control-Plane Table Families

**User Story:** As a maintainer, I want one explicit owner map for each
control-plane table family, so code in the same area cannot drift into multiple
creation or mutation paths.

#### Acceptance Criteria

1. THE system SHALL define one canonical owner matrix for the following
   families:
   - `nodes` + `node_endpoints`
   - `service_definitions` + `service_endpoints`
   - `services`
   - `tables` + `partitions` + `replica_operations`
2. THE owner matrix SHALL identify:
   - row-creation owner
   - allowed field owners for updates
   - bootstrap-only exceptions, if any
   - forbidden writers
3. THE architecture and steering documents SHALL reference the same owner
   matrix.
4. THE codebase SHALL NOT leave ownership implicit for any row or field subset
   in these families.

### Requirement 2: Single Mutation Owner Per Control-Plane Table Family

**User Story:** As an architect, I want rows in the same control-plane family
to be created and updated through one generic owner path, so bootstrap, join,
and runtime behavior cannot diverge.

#### Acceptance Criteria

1. THE system SHALL route row creation for each control-plane family through
   one Canonical_Row_Owner shared across bootstrap, join, and runtime paths.
2. BootstrapService and NodeJoiningService SHALL orchestrate these writes only
   through shared owners or thin delegation adapters.
3. THE system SHALL NOT allow table-specific ad hoc mutation bodies for rows in
   the same family.
4. `INSERT OR REPLACE` or equivalent whole-row overwrite behavior SHALL NOT be
   used for lifecycle/status updates on existing control-plane rows.
5. Missing-row repair behavior SHALL fail closed or route through the canonical
   creation owner; it SHALL NOT synthesize replacement rows from partial local
   knowledge.

### Requirement 3: Explicit Field Ownership for Shared Rows

**User Story:** As a maintainer, I want field-level ownership on shared rows to
be explicit, so one component cannot overwrite another component's state.

#### Acceptance Criteria

1. THE `services` row contract SHALL define explicit field owners for:
   - identity fields
   - lifecycle/status fields
   - consensus role fields
   - error/progress fields
2. THE `service_endpoints` row contract SHALL define explicit field owners for:
   - endpoint identity fields
   - health fields
   - runtime metadata fields
3. THE `node_endpoints` row contract SHALL define explicit field owners for:
   - endpoint identity fields
   - transport/status fields
4. No component SHALL rewrite fields outside its documented field ownership.
5. Cache-derived data SHALL NOT be used to reconstruct or preserve fields owned
   by another component when issuing writes.

### Requirement 4: One Propagation Owner for All CDC-Propagated Control-Plane Writes

**User Story:** As a platform maintainer, I want all CDC-propagated
control-plane writes to use one propagation owner, so ordering, retry, and
delivery semantics are identical across table families.

#### Acceptance Criteria

1. THE system SHALL route all control-plane CDC fanout through one
   Propagation_Owner.
2. The Propagation_Owner SHALL preserve authoritative event metadata at minimum
   for:
   - `tableName`
   - `operation`
   - `data`
   - `timestamp`
   - `causeId`
3. THE system SHALL NOT maintain separate table-specific propagation logic for
   later-created partitions versus bootstrap-time partitions.
4. Propagation success SHALL require actual local apply plus explicit remote
   delivery target resolution where remote fanout is expected.
5. A fallback mode SHALL NOT report success when remote target resolution is
   empty or indeterminate.

### Requirement 5: Generic Pre-Subscription Cache Handoff for Startup and Join

**User Story:** As a developer, I want one generic rule for writes that occur
before CDC subscriptions are active, so startup and join cannot depend on ad
hoc direct-cache exceptions.

#### Acceptance Criteria

1. THE system SHALL implement one generic Pre_Subscription_Cache_Handoff for
   all `CDC_PROPAGATED_TABLES`.
2. The handoff SHALL use the same authoritative row shape and the same
   Cache_Apply_Owner used by normal CDC application.
3. Bootstrap and join code SHALL NOT contain table-specific direct-cache
   seeding exceptions for CDC-propagated rows once the generic handoff exists.
4. The handoff SHALL be active only while CDC subscriptions for the local node
   are not yet active.
5. After subscriptions are active, runtime writes SHALL use only the normal
   CDC propagation and cache-application path.

### Requirement 6: One Cache-Application Owner for All Control-Plane Metadata

**User Story:** As a maintainer, I want one cache-application owner for
CDC-propagated metadata, so local cache state cannot drift because different
paths apply different row shapes.

#### Acceptance Criteria

1. THE system SHALL define one Cache_Apply_Owner for CDC-propagated
   system-table rows.
2. Immediate apply, replay, catchup, and pre-subscription handoff SHALL all use
   the same Cache_Apply_Owner semantics.
3. THE Cache_Apply_Owner SHALL own event ordering, dedupe, schema-watermark
   tracking, and cache mutation semantics.
4. Non-owner modules SHALL NOT mutate `SystemTableCache` for propagated rows
   except through the Cache_Apply_Owner.
5. SQL-backed local state and cache-backed local state SHALL use the same
   canonical primary-key resolution and row shape.

### Requirement 7: Authoritative Discovery and Readiness Read Models

**User Story:** As an operator, I want service discovery and readiness to read
from the authoritative control-plane tables for their area, so diagnostics and
gates reflect the true model rather than mixed proxies.

#### Acceptance Criteria

1. `service_discovery_local()` and preload/admin readiness SHALL derive
   `sys-postgres-wire` availability from `service_definitions` and
   `service_endpoints`, not from unrelated tables.
2. Table topology readiness SHALL derive its state from `tables`,
   `partitions`, `services`, and `replica_operations` according to the
   documented owner matrix.
3. Discovery/readiness diagnostics SHALL not treat proxy counts from a
   different table family as authoritative evidence.
4. The read model SHALL remain cache-backed, but its source-table assumptions
   SHALL be documented and test-covered.
5. If a required control-plane row exists in local SQL but not in local cache,
   diagnostics SHALL surface that mismatch explicitly.

### Requirement 8: SQL-vs-Cache Parity Diagnostics for Control-Plane Tables

**User Story:** As an investigator, I want one generic parity probe for
control-plane metadata, so cache divergence is observable without table-specific
guesswork.

#### Acceptance Criteria

1. THE system SHALL provide a generic per-node parity probe for the affected
   control-plane families.
2. The probe SHALL compare local SQL rows and local cache rows using canonical
   primary keys and row identity for:
   - `nodes`
   - `node_endpoints`
   - `service_definitions`
   - `service_endpoints`
   - `services`
   - `tables`
   - `partitions`
3. The probe SHALL identify whether a mismatch is:
   - SQL-only
   - cache-only
   - key mismatch
   - field mismatch
4. Distributed diagnostics and baseline reports SHALL include parity results
   when preload/discovery failures occur.
5. Root-cause labeling SHALL use these parity signals before falling back to
   generic timeout-style explanations.

### Requirement 9: No Table-Specific CDC Subscription Semantics Within a Family

**User Story:** As an architect, I want subscription and catchup behavior to be
generic within a control-plane area, so different tables are not handled by
special cases.

#### Acceptance Criteria

1. Subscription registration for `CDC_PROPAGATED_TABLES` SHALL be derived from
   shared table classification and owner wiring, not from ad hoc per-table
   branches.
2. Catchup, replay, and buffered-event behavior SHALL use one contract for all
   control-plane propagated tables.
3. Later-created table-topology metadata SHALL use the same subscription and
   application semantics as bootstrap-time control-plane metadata.
4. Table-family-specific data shaping MAY vary by schema, but subscription and
   delivery semantics SHALL NOT.
5. Any unavoidable exception SHALL be documented in the owner matrix with a
   sunset task; undocumented exceptions are forbidden.

### Requirement 10: Ownership Enforcement Tests and Completion Gates

**User Story:** As a maintainer, I want CI gates that enforce these ownership
rules, so this class of drift cannot return later.

#### Acceptance Criteria

1. THE test suite SHALL include ownership contract tests proving orchestrators
   delegate to the canonical owners for each affected family.
2. THE test suite SHALL include propagation tests proving authoritative event
   metadata is preserved end-to-end.
3. THE test suite SHALL include parity tests proving local SQL and local cache
   agree for control-plane metadata after bootstrap, join, and later-created
   table setup.
4. THE test suite SHALL include distributed readiness tests that fail when
   discovery/readiness derives from the wrong table family.
5. Tasks in this spec SHALL NOT be marked complete without production-path
   evidence, not just unit-level proof.
