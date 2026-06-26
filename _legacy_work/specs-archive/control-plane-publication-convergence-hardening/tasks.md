# Tasks

## Phase 1: Spec, Fixtures, And Counterexamples

- [x] 1. Add failing unit tests for publication artifact derivation
  - Cover publication epoch monotonicity.
  - Cover active-node set derivation from authoritative owner rows.
  - Cover publication row persistence shape and transition history.
  - Target files: `test/control-plane/membership-publication-coordinator.test.js`, `src/control-plane/membership-publication-coordinator.js`
  - _Requirements: 1.1, 1.3, 2.1, 2.2, 10.1_

- [x] 2. Add failing unit tests for acknowledgement and readiness cutover
  - Cover acknowledgement completion and idempotency.
  - Cover `controlPlanePublished` readiness behavior.
  - Cover `controlPlaneRecoveryEligible` depending on publication convergence.
  - Target files: `test/control-plane/membership-publication-coordinator.test.js`, `test/control-plane/control-plane-readiness-service.test.js`, `src/control-plane/control-plane-readiness-service.js`, `src/control-plane/control-plane-readiness-constants.js`
  - _Requirements: 2.3, 2.4, 2.5, 6.1, 6.3, 6.4, 10.1, 10.2_

- [x] 3. Add failing projection and harness tests
  - Cover active-node projection preferring the published active-node set.
  - Cover benchmark-ready and restart-readiness gating on the published epoch.
  - Cover harness disagreement when nodes report different publication epochs.
  - Target files: `test/control-plane/active-node-projection.test.js`, `test/distributed/harness/__tests__/cluster.test.js`, `src/control-plane/active-node-projection.js`, `test/distributed/harness/cluster.js`
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 10.3_

## Phase 2: Publication Artifact And Owner

- [x] 4. Add the `control_plane_publications` system table and schema wiring
  - Define the durable publication row shape.
  - Add canonical constants, row normalizers, and admin visibility plumbing.
  - Target files: `src/constants/tables.js`, `src/bootstrap/system-table-schemas-constants.js`, `src/control-plane/system-row-normalizers.js`, `src/control-plane/owners/control-plane-publications-owner.js`, `src/constants/index.js`
  - _Requirements: 1.3, 1.4, 2.2_

- [x] 5. Implement `MembershipPublicationCoordinator`
  - Reuse authoritative reads to derive the candidate publication state.
  - Persist durable publication rows through one owner path.
  - Route execution through owner-key serialization and durable workflow steps.
  - _Requirements: 1.1, 1.2, 1.5, 2.1, 2.2, 5.1, 5.2, 5.4_

- [x] 6. Implement acknowledgement processing
  - Add idempotent acknowledgement writes.
  - Close publication epochs only after required acknowledgements are durable.
  - Add timeout-budget and abandonment behavior.
  - _Requirements: 2.3, 2.4, 2.5, 2.6, 5.3, 5.4_

## Phase 3: Priority Recovery Mode And Resource Isolation

- [x] 7. Implement explicit priority control-plane recovery mode
  - Add activation and deactivation logic.
  - Persist or expose recovery-mode diagnostics for readiness/admin use.
  - _Requirements: 4.1, 4.2, 4.3, 8.1_

- [x] 8. Extend priority partition spread enforcement
  - Reuse existing spread blockers in `UnifiedRebalancer`.
  - Gate non-critical work on published convergence in addition to spread.
  - _Requirements: 4.4, 4.5, 9.4_

- [x] 9. Add dedicated operation lanes and budget plumbing for publication and priority recovery
  - Reserve owner-scoped execution capacity.
  - Surface pressure diagnostics for publication and priority recovery work.
  - _Requirements: 9.1, 9.2, 9.3_

## Phase 4: Readiness And Projection Cutover

- [x] 10. Add `controlPlanePublished` to canonical readiness
  - Update readiness constants, snapshots, reasons, diagnostics, and history.
  - Extend recovery epoch correlation with publication epoch details.
  - _Requirements: 6.1, 6.2, 6.6, 8.3_

- [x] 11. Recompute composite readiness dimensions using publication convergence
  - Make `controlPlaneRecoveryEligible` require publication convergence.
  - Preserve stricter `serveEligible` semantics.
  - _Requirements: 6.3, 6.4, 6.5_

- [x] 12. Cut active-node projection and benchmark admission over to published state
  - Prefer the durable published active-node set.
  - Preserve authoritative and cache fallback only for degraded diagnostics.
  - _Requirements: 7.1, 7.2, 7.3, 10.3_

## Phase 5: Admin And Harness Cutover

- [x] 13. Extend admin control snapshot and discovery diagnostics
  - Surface publication epoch, publication status, acknowledgements, and priority recovery state.
  - Clearly distinguish repaired observation from published convergence.
  - _Requirements: 8.1, 8.2_

- [x] 14. Update distributed harness convergence logic
  - Make success require agreement on publication epoch and published active-node set.
  - Preserve explicit failure on disagreement.
  - _Requirements: 7.4, 7.5, 10.4, 10.5_

## Phase 6: Scenario Validation

- [x] 15. Run focused verification suites
  - Bootstrap/readiness/publication tests
  - Cluster/harness projection tests
  - Admin control snapshot tests
  - _Requirements: 10.1, 10.2, 10.3_

- [ ] 16. Run distributed scenario validation ladder
  - Rolling restart
  - Node join under load
  - Seed restart under load
  - Transaction recovery under restart churn
  - Postgres baseline discovery
  - _Requirements: 10.4, 10.5_

- [ ] 17. Rerun the broader distributed harness matrix
  - Confirm the previously failing scenarios converge on one published epoch and one published active-node set.
  - _Requirements: 10.6_
