# Implementation Plan: Codebase Constants Centralization

## Overview

This plan centralizes all string and numeric literals into constants, organized
per system part and enforced by tooling. The work proceeds subsystem by
subsystem to keep changes reviewable while enforcing a single source of truth.

## Tasks

- [x] 1. Define constants structure and conventions
  - Create shared constants modules under `src/constants/`
  - Define naming, units, and freeze rules
  - Document Literal_Allowlist and Literal_Override rules
  - _Requirements: 1.1, 2.2, 4.2, 5.2_

- [x] 2. Add literal enforcement tooling
  - Implement an AST-based check (script or ESLint rule)
  - Allow constants modules and module specifiers
  - Support `literal-ok:` overrides with justification
  - _Requirements: 5.1, 5.2, 5.3_

- [ ] 3. Migrate shared cross-cutting constants
  - Move table names, entity types, message types, SQL strings, timeouts,
    errors, and log templates into shared constants
  - Replace shared literal usage across the codebase
  - _Requirements: 1.1, 2.2, 3.1, 4.1_

- [x] 4. Transport and addressing constants migration
  - Create `src/transport/constants.js` and `src/address/constants.js`
  - Replace address separators, entity types, and transport message strings
  - _Requirements: 2.1, 3.1, 4.1_

- [x] 5. Bootstrap, node lifecycle, and control plane constants migration
  - Create constants modules for `src/bootstrap/`, `src/node/`,
    `src/control-plane/`
  - Replace state names, lifecycle phases, and control message fields
  - _Requirements: 2.1, 3.1, 4.1_

- [x] 6. Message group and raft constants migration
  - Create `src/message-group/constants.js` and `src/raft/constants.js`
  - Replace Raft packet types, roles, and message identifiers
  - _Requirements: 2.1, 3.1, 4.1_

- [x] 7. Partition, storage, and transaction constants migration
  - Create constants modules for `src/partition/`, `src/storage/`,
    `src/transaction/`
  - Replace table names, replica state strings, and numeric thresholds
  - _Requirements: 2.1, 3.1, 4.1_

- [x] 8. Cache, CDC, and config constants migration
  - Create constants modules for `src/cache/`, `src/cdc/`, `src/config/`
  - Replace CDC event names, cache keys, and config keys/defaults
  - _Requirements: 2.1, 3.1, 4.1_

- [x] 9. Query, index management, and live query constants migration
  - Create constants modules for `src/query/`, `src/index-management/`,
    `src/live-query/`
  - Replace SQL fragments, query timeouts, and index state strings
  - _Requirements: 2.1, 3.1, 4.1_

- [x] 10. Core utilities constants migration
  - Create constants modules for `src/hlc/`, `src/threading/`, `src/function/`,
    and `src/policy/`
  - Replace timing, state, and policy literals in utilities
  - _Requirements: 2.1, 3.1, 4.1_

- [x] 11. Rebalancer and replica lifecycle constants migration
  - Create constants modules for `src/rebalancer/` and replica lifecycle code
  - Replace operation types, statuses, and timing values
  - _Requirements: 2.1, 3.1, 4.1_

- [x] 12. Admin, CLI, logging, and entry point constants migration
  - Create constants modules for `src/admin/`, `src/cli/`, `src/logging/`
  - Replace literals in `src/index.js` and `src/sea-entry.js`
  - Replace CLI command names, admin message strings, and log templates
  - _Requirements: 2.1, 3.1, 4.1_

- [ ] 13. Migrate tests and scripts; enable full enforcement
  - Replace literals in `test/` and `scripts/`
  - Remove temporary allowlist entries
  - Run full test suite and ensure lint passes
  - _Requirements: 3.1, 4.1, 5.1, 6.2_
