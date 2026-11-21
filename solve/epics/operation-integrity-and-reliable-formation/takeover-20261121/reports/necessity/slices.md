# Necessity audit: deletion worklist (N0-N3), parallel slices

Head `b638284d1`. Input: the 2,596 still-valid census sites with usable evidence (`buckets.tsv`). This worklist covers buckets
**N0, N1, N2 and N3**: sites whose alternate arm never executed in any lane, or executed only in unit-lane fixtures.
N4 and N5 sites are not in it. Their alternate ran in a composed lane or in formation, so they wait for the trap experiment
(`experiment.md`) before any deletion.

Totals (VERIFIED, computed): **54 slices, 1,859 sites, 736 files**, plus 9 N0-N3 sites in deferred files.
Slice size: 13-47 sites (median 36), 5-20 files (median 14).
- Formation tier (control-plane, rebalancer, partition, bootstrap, query, node, cdc, cache): 31 slices, 1,176 sites, 474 files.
- Middle tier: 16 slices, 469 sites, 188 files.
- Later tier (admin, cli, diagnostics, debug): 7 slices, 214 sites, 74 files.

## Rules for every slice

1. **File sets are disjoint across slices.** A file belongs to exactly one slice, so any slices can run in parallel without
   merge conflicts in `src`. Test fixtures can overlap, and that is the merge risk to watch: the test lists below show the overlap.
2. **What a slice does to each site, by bucket:**
   - N0: the whole site is unexecuted in every lane. Read the enclosing function's callers first. If the function is dead,
     delete the function, not just the arm. If it is live but untested, the silent default is the defect: replace it with a typed
     outcome or a required input, and add the test that reaches it.
   - N1: delete the alternate arm, or make the input required (throw a typed error naming the missing input). An error-path
     catch is **unproven, not unnecessary**. Replace it with a typed outcome that has an owned continuation. Never delete it
     into an unhandled throw without naming who handles the throw.
   - N2: read the two-arm verdict in `sample.md`. "Primary dead": delete the typeof arm and the guarded capability.
     "Inverted": delete the seam and keep the production arm (clock or timer seams become one passed time source).
   - N3: first migrate the unit fixtures that drive the alternate to the real construction, with zero `src` change. Then delete
     the arm, with zero test change. This is the W4 recurrence lesson: reduced fixtures are what keep retired fallbacks alive.
3. **N4 and N5 sites in the same files stay untouched** (525 of them share files with these slices; counts in the table).
   An implementer who believes one of them is also dead records that as a trap-experiment candidate, not as a deletion.
4. **Kinds a and e** found while reading go to the lead, not into the slice. Kind a is a competing authority (W3 and W4 own
   the leader and read-mode families). Kind e needs a witness first.
5. **Verification as a lab change cone.** Commit the slice on a branch from the integration head, then run
   `node scripts/lab.js test changed --lane all --sha <slice-head> --base-sha <slice-base> --split` (the selector reads
   `test/shards/impact-contracts.json`, so the contracts and coupled pairs listed below are selected automatically).
   The listed importing tests are a cross-check on what the selector picks, not a second list.
   Formation-tier slices also need one formation comparison: the formation lane of `experiment.md` A on the slice head,
   compared with the refreshed baseline (lead ruling D0: behaviour-changing slices get a formation comparison).
6. **Done when**, per slice: the slice's cells in the ratchet (`ratchet.md`) for N0-N3 read zero for its files, and the
   change cone is green. The ratchet is the probe. No label, reason text or classification entry closes a site.

## Slice table

Order: formation relevance first (control-plane, rebalancer, partition, bootstrap, query, node, cdc, cache), then raft, transport,
message-group and the other runtime directories, then admin, cli, diagnostics and debug. Within a directory, files are packed in
name order, so owner families (`operation-workflow-*`, `membership-publication-*`, `node-joining-*`) stay together.
"Contracts / pairs" counts the impact contracts and coupled pairs whose owners match a slice file by prefix.
"Importing tests" counts the test files that import a slice file by path; the full lists are in `slices-tests.tsv`.

| Slice | Directory | Files | Sites | N0 / N1 / N2 / N3 | N4+N5 left in same files | Contracts / pairs | Importing tests |
| --- | --- | --- | --- | --- | --- | --- | --- |
| NS-01 | control-plane | 10 | 45 | 1 / 28 / 0 / 16 | 9 | 2 / 1 | 51 |
| NS-02 | control-plane | 12 | 47 | 5 / 30 / 0 / 12 | 13 | 7 / 3 | 40 |
| NS-03 | control-plane | 15 | 46 | 0 / 20 / 5 / 21 | 24 | 2 / 1 | 47 |
| NS-04 | control-plane | 16 | 42 | 1 / 21 / 1 / 19 | 4 | 4 / 3 | 66 |
| NS-05 | control-plane | 16 | 45 | 0 / 20 / 0 / 25 | 11 | 5 / 4 | 73 |
| NS-06 | control-plane | 14 | 44 | 0 / 14 / 0 / 30 | 32 | 1 / 1 | 22 |
| NS-07 | control-plane | 16 | 45 | 1 / 29 / 1 / 14 | 18 | 3 / 2 | 34 |
| NS-08 | control-plane | 10 | 19 | 2 / 13 / 0 / 4 | 17 | 4 / 2 | 69 |
| NS-09 | rebalancer | 20 | 37 | 3 / 17 / 1 / 16 | 14 | 8 / 5 | 77 |
| NS-10 | rebalancer | 20 | 45 | 1 / 29 / 0 / 15 | 11 | 7 / 5 | 21 |
| NS-11 | rebalancer | 20 | 43 | 1 / 34 / 0 / 8 | 7 | 9 / 5 | 50 |
| NS-12 | rebalancer | 11 | 41 | 2 / 32 / 0 / 7 | 3 | 6 / 6 | 20 |
| NS-13 | rebalancer | 15 | 46 | 1 / 36 / 1 / 8 | 4 | 13 / 12 | 98 |
| NS-14 | rebalancer | 20 | 44 | 1 / 34 / 0 / 9 | 13 | 6 / 4 | 42 |
| NS-15 | rebalancer | 8 | 29 | 5 / 17 / 0 / 7 | 5 | 1 / 1 | 17 |
| NS-16 | partition | 15 | 40 | 2 / 21 / 1 / 16 | 2 | 3 / 3 | 22 |
| NS-17 | partition | 20 | 37 | 1 / 25 / 1 / 10 | 9 | 12 / 10 | 93 |
| NS-18 | partition | 14 | 43 | 2 / 23 / 0 / 18 | 1 | 10 / 10 | 42 |
| NS-19 | partition | 13 | 29 | 2 / 10 / 0 / 17 | 4 | 6 / 6 | 24 |
| NS-20 | bootstrap | 20 | 37 | 6 / 27 / 4 / 0 | 32 | 8 / 6 | 89 |
| NS-21 | bootstrap | 17 | 42 | 16 / 26 / 0 / 0 | 14 | 5 / 4 | 28 |
| NS-22 | bootstrap | 18 | 42 | 5 / 36 / 1 / 0 | 21 | 11 / 8 | 71 |
| NS-23 | bootstrap | 13 | 27 | 2 / 19 / 6 / 0 | 24 | 5 / 2 | 43 |
| NS-24 | query | 20 | 39 | 4 / 23 / 0 / 12 | 9 | 3 / 2 | 96 |
| NS-25 | query | 16 | 40 | 1 / 30 / 0 / 9 | 10 | 8 / 6 | 30 |
| NS-26 | query | 16 | 43 | 5 / 24 / 1 / 13 | 11 | 9 / 7 | 87 |
| NS-27 | query | 15 | 35 | 1 / 24 / 0 / 10 | 9 | 5 / 4 | 140 |
| NS-28 | node | 20 | 32 | 1 / 23 / 1 / 7 | 6 | 11 / 11 | 184 |
| NS-29 | node | 14 | 36 | 4 / 23 / 1 / 8 | 19 | 9 / 9 | 69 |
| NS-30 | cdc | 13 | 23 | 2 / 8 / 1 / 12 | 13 | 2 / 1 | 35 |
| NS-31 | cache | 7 | 13 | 0 / 9 / 1 / 3 | 2 | 0 / 0 | 30 |
| NS-32 | raft | 14 | 29 | 1 / 20 / 0 / 8 | 7 | 18 / 15 | 126 |
| NS-33 | raft | 11 | 19 | 0 / 12 / 0 / 7 | 7 | 5 / 4 | 39 |
| NS-34 | transport | 18 | 40 | 4 / 24 / 0 / 12 | 23 | 4 / 9 | 33 |
| NS-35 | message-group | 13 | 32 | 7 / 20 / 0 / 5 | 5 | 5 / 4 | 24 |
| NS-36 | topology, storage, hlc, time, config, migration | 16 | 25 | 1 / 12 / 1 / 11 | 9 | 6 / 5 | 39 |
| NS-37 | index-management | 7 | 33 | 6 / 18 / 1 / 8 | 0 | 0 / 0 | 9 |
| NS-38 | policy, workflow | 7 | 18 | 0 / 8 / 1 / 9 | 15 | 4 / 4 | 44 |
| NS-39 | runtime | 16 | 36 | 7 / 10 / 1 / 18 | 2 | 1 / 0 | 42 |
| NS-40 | runtime | 15 | 35 | 4 / 18 / 1 / 12 | 4 | 5 / 4 | 71 |
| NS-41 | runtime | 6 | 22 | 1 / 14 / 0 / 7 | 4 | 4 / 3 | 48 |
| NS-42 | service | 11 | 38 | 4 / 23 / 0 / 11 | 4 | 4 / 2 | 26 |
| NS-43 | service | 15 | 30 | 3 / 18 / 0 / 9 | 14 | 4 / 4 | 58 |
| NS-44 | wasm-service | 11 | 27 | 2 / 16 / 0 / 9 | 8 | 2 / 2 | 27 |
| NS-45 | wasm-service | 7 | 26 | 2 / 15 / 0 / 9 | 13 | 6 / 6 | 39 |
| NS-46 | logging | 6 | 23 | 0 / 11 / 1 / 11 | 14 | 0 / 0 | 602 |
| NS-47 | function, threading, live-query, utils, authoring, (src root) | 15 | 36 | 2 / 25 / 0 / 9 | 3 | 9 / 6 | 69 |
| NS-48 | admin | 12 | 39 | 2 / 22 / 0 / 15 | 4 | 6 / 4 | 25 |
| NS-49 | admin | 9 | 27 | 2 / 12 / 0 / 13 | 4 | 3 / 3 | 13 |
| NS-50 | admin | 12 | 41 | 7 / 21 / 0 / 13 | 4 | 2 / 2 | 9 |
| NS-51 | cli | 19 | 30 | 6 / 14 / 0 / 10 | 0 | 1 / 0 | 38 |
| NS-52 | diagnostics | 9 | 29 | 1 / 11 / 0 / 17 | 1 | 0 / 0 | 21 |
| NS-53 | diagnostics | 5 | 26 | 0 / 15 / 0 / 11 | 0 | 0 / 0 | 11 |
| NS-54 | debug, debug-runtime | 8 | 22 | 1 / 14 / 0 / 7 | 9 | 0 / 0 | 18 |

Notes on selection cost:
- NS-46 (logging, 23 sites) is imported by 602 test files: its change cone is effectively the whole corpus. Run it last, or
  split each logging change down to a single file.
- NS-28 (node), NS-32 (raft), NS-27 (query) and NS-24 (query) are imported by 96-184 test files. Expect long cones.
- Slices with zero contracts and pairs (NS-31 cache, NS-37 index-management, NS-46 logging, NS-52 to NS-54 diagnostics and
  debug) have no declared impact owner. Their cone is import-based only. The W3 report already notes the same gap for the
  leader-routing modules.

## Slices in detail

### NS-01 · control-plane · 10 files · 45 sites

Buckets: N0 1, N1 28, N2 0, N3 16. Rows: two_source 22, typeof 19, catch 4.

Files: `control-plane/authoritative-control-plane-view.js` (3), `control-plane/authoritative-node-evidence-reconciler.js` (16), `control-plane/control-plane-diagnostics-ledger.js` (1), `control-plane/control-plane-kernel-ingress.js` (4), `control-plane/control-plane-mutation-outcome-classifier.js` (2), `control-plane/control-plane-mutation-readiness.js` (2), `control-plane/control-plane-publication-merge.js` (2), `control-plane/control-plane-readiness-diagnostics-eligibility.js` (13), `control-plane/control-plane-readiness-evidence-reasons.js` (1), `control-plane/control-plane-readiness-planning-shared.js` (1).

Selection: contracts `readiness-versioned-planning-liveness`, `admin-owner-mutation-confirmation`; coupled pairs `admin-owner-mutation-confirmation`; 34 contract/pair witness tests; 51 test files import a slice file (e.g. `test/admin/admin-control-snapshot.test.js`, `test/bootstrap/node-joining-service-canonical-readiness.test.js`, `test/bootstrap/node-joining-service-join-lifecycle-resume.test.js`, `test/bootstrap/node-joining-service-mesh-reconciliation.test.js`).

### NS-02 · control-plane · 12 files · 47 sites

Buckets: N0 5, N1 30, N2 0, N3 12. Rows: two_source 42, typeof 3, catch 2.

Files: `control-plane/control-plane-readiness-priority-recovery-planning.js` (3), `control-plane/control-plane-readiness-publication-planning-resolution.js` (15), `control-plane/control-plane-readiness-publication-planning-snapshot.js` (8), `control-plane/control-plane-readiness-recovery-epoch-summary-methods.js` (2), `control-plane/control-plane-readiness-service-node-methods.js` (1), `control-plane/control-plane-readiness-snapshot-store.js` (1), `control-plane/control-plane-snapshot-owner-evidence-advance.js` (1), `control-plane/control-plane-snapshot-owner.js` (4), `control-plane/control-plane-system-table-gateway-cache-reconciliation.js` (1), `control-plane/control-plane-system-table-gateway-diagnostics.js` (3), `control-plane/control-plane-system-table-gateway-mutation-submission.js` (3), `control-plane/control-plane-system-table-gateway-query-execution.js` (5).

Selection: contracts `readiness-versioned-planning-liveness`, `active-gate-convergence`, `CL-033`, `CL-034`, `publication-readiness-churn-liveness-closure`, `core-system-logic`, `serve-eligibility-committed-epoch`; coupled pairs `readiness-freshness-macrotask-bound`, `active-gate-authoritative-repair-backoff`, `serve-eligibility-committed-answer-and-routing`; 52 contract/pair witness tests; 40 test files import a slice file (e.g. `test/active-gate/active-gate-authoritative-repair-convergence.test.js`, `test/admin/admin-control-snapshot-completed-placement-handoff-repair.test.js`, `test/admin/admin-control-snapshot-deferred-refresh-membership-observation-test-cases.js`, `test/admin/admin-control-snapshot-heartbeat-lease-freshness.test.js`).

### NS-03 · control-plane · 15 files · 46 sites

Buckets: N0 0, N1 20, N2 5, N3 21. Rows: typeof 21, two_source 21, catch 4.

Files: `control-plane/control-plane-system-table-gateway-read-contracts.js` (2), `control-plane/control-plane-system-table-gateway-read-dispatch.js` (3), `control-plane/control-plane-system-table-gateway-read-strategies.js` (5), `control-plane/control-plane-system-table-gateway-request-coalescing.js` (3), `control-plane/control-plane-system-table-gateway-telemetry.js` (4), `control-plane/heartbeat-service-lifecycle-methods.js` (3), `control-plane/heartbeat-service-publication-methods.js` (2), `control-plane/heartbeat-service-reporter-visibility-methods.js` (1), `control-plane/live-transport-evidence.js` (1), `control-plane/membership-lifecycle-controller.js` (3), `control-plane/membership-publication-active-gate-reconcile.js` (2), `control-plane/membership-publication-candidate-derivation.js` (3), `control-plane/membership-publication-coordinator-persist.js` (1), `control-plane/membership-publication-coordinator-planning.js` (12), `control-plane/membership-publication-coordinator-queue.js` (1).

Selection: contracts `readiness-versioned-planning-liveness`, `active-gate-convergence`; coupled pairs `active-gate-authoritative-repair-backoff`; 41 contract/pair witness tests; 47 test files import a slice file (e.g. `test/active-gate/active-gate-authoritative-repair-convergence.test.js`, `test/bootstrap/bootstrap-api-rejoin.test.js`, `test/bootstrap/bootstrap-membership-owner-outcome-consumers.test.js`, `test/bootstrap/durable-rejoin-incarnation-advance.test.js`).

### NS-04 · control-plane · 16 files · 42 sites

Buckets: N0 1, N1 21, N2 1, N3 19. Rows: typeof 17, two_source 14, catch 11.

Files: `control-plane/membership-publication-coordinator-reads.js` (7), `control-plane/membership-publication-coordinator-reconcile-helpers.js` (1), `control-plane/membership-publication-coordinator-reconcile.js` (6), `control-plane/membership-publication-planning-evidence.js` (7), `control-plane/membership-publication-priority-partition-canonical-data.js` (1), `control-plane/membership-publication-priority-partition-readiness-data.js` (1), `control-plane/membership-publication-readiness-repair.js` (1), `control-plane/membership-publication-row-helpers.js` (1), `control-plane/membership-swim-prober.js` (4), `control-plane/membership-swim-runtime.js` (1), `control-plane/node-lifecycle-publication.js` (1), `control-plane/node-liveness-semantic-projection-owner.js` (5), `control-plane/node-trust-state.js` (3), `control-plane/owners/endpoint-incarnation-authority.js` (1), `control-plane/owners/endpoint-incarnation-currentness.js` (1), `control-plane/owners/pilot-cutover-workflow-contract.js` (1).

Selection: contracts `readiness-versioned-planning-liveness`, `active-gate-convergence`, `router-delivery-envelope`, `serve-eligibility-committed-epoch`; coupled pairs `readiness-freshness-macrotask-bound`, `router-envelope-control-plane`, `committed-node-floor-and-retained-wake`; 81 contract/pair witness tests; 66 test files import a slice file (e.g. `test/bootstrap/durable-rejoin-incarnation-advance.test.js`, `test/control-plane/cl-033-epoch-probe-node-scope.test.js`, `test/control-plane/endpoint-incarnation-authority.test.js`, `test/control-plane/endpoint-writer-census.js`).

### NS-05 · control-plane · 16 files · 45 sites

Buckets: N0 0, N1 20, N2 0, N3 25. Rows: two_source 41, catch 2, typeof 2.

Files: `control-plane/owners/pilot-cutover-workflow-owner.js` (8), `control-plane/owners/service-definitions-owner.js` (1), `control-plane/owners/service-install-catalog-contract.js` (1), `control-plane/owners/service-install-catalog-owner.js` (1), `control-plane/pressure-governor.js` (7), `control-plane/priority-recovery-admission-constants.js` (1), `control-plane/priority-recovery-completion.js` (3), `control-plane/priority-recovery-dispatch-snapshot.js` (2), `control-plane/priority-recovery-observation-gate-resolution.js` (8), `control-plane/priority-recovery-observation-normalization.js` (2), `control-plane/priority-recovery-observation-partition-witness.js` (2), `control-plane/priority-recovery-observation-snapshot.js` (4), `control-plane/priority-recovery-operation-owner-observation.js` (1), `control-plane/priority-recovery-snapshot-actuation.js` (2), `control-plane/priority-recovery-snapshot-burndown.js` (1), `control-plane/priority-recovery-snapshot-closure.js` (1).

Selection: contracts `service-instance-selection-resource-state`, `service-consensus-original-intent-admission`, `service-consensus-retained-native-bootstrap`, `postgres-wire-owner-scale`, `runtime-definition-create-authority`; coupled pairs `service-instance-selection-resource-state`, `service-consensus-original-intent-admission`, `service-consensus-retained-native-bootstrap`, `runtime-definition-create-authority`; 42 contract/pair witness tests; 73 test files import a slice file (e.g. `test/admin/admin-control-snapshot-priority-recovery-authority.test.js`, `test/admin/admin-control-snapshot-priority-recovery-dormant-context-retirement.test.js`, `test/bootstrap/node-joining-service-register-service-retries.test.js`, `test/cdc/cdc-integration-service.test.js`).

### NS-06 · control-plane · 14 files · 44 sites

Buckets: N0 0, N1 14, N2 0, N3 30. Rows: two_source 39, typeof 4, catch 1.

Files: `control-plane/priority-recovery-snapshot-ingress.js` (3), `control-plane/priority-recovery-snapshot-observation.js` (1), `control-plane/priority-recovery-snapshot-rebalancer.js` (2), `control-plane/priority-recovery-snapshot-workflow.js` (4), `control-plane/priority-recovery-synthetic-serial-wait-snapshots.js` (1), `control-plane/projection-readiness-evidence.js` (8), `control-plane/publication-active-gate-handoff-contract-decision.js` (1), `control-plane/publication-active-gate-handoff-contract-selection.js` (2), `control-plane/publication-active-gate-handoff-contract.js` (2), `control-plane/publication-owner-decision.js` (1), `control-plane/publication-recovery-convergence-builder.js` (8), `control-plane/publication-recovery-convergence-gate-builder.js` (7), `control-plane/publication-recovery-evidence-builders.js` (1), `control-plane/publication-recovery-membership-evidence-normalizers.js` (3).

Selection: contracts `readiness-versioned-planning-liveness`; coupled pairs `readiness-freshness-macrotask-bound`; 29 contract/pair witness tests; 22 test files import a slice file (e.g. `test/admin/admin-control-snapshot-publication-convergence-active-gate-test-cases.js`, `test/control-plane/current-membership-epoch-null-unreadable.test.js`, `test/control-plane/membership-publication-coordinator-owner-handoff-reconcile.js`, `test/control-plane/membership-publication-coordinator-reconcile-queue-merge.js`).

### NS-07 · control-plane · 16 files · 45 sites

Buckets: N0 1, N1 29, N2 1, N3 14. Rows: two_source 23, typeof 5, catch 17.

Files: `control-plane/publication-recovery-observation-evidence-normalizers.js` (5), `control-plane/publication-recovery-stream-evidence.js` (2), `control-plane/readiness-planning-completion-admission-methods.js` (1), `control-plane/readiness-planning-formation-source.js` (2), `control-plane/readiness-planning-global-projection.js` (3), `control-plane/readiness-planning-publication-contract.js` (3), `control-plane/readiness-planning-semantic-currency-methods.js` (4), `control-plane/readiness-planning-semantic-generation.js` (2), `control-plane/readiness-planning-snapshot-owner.js` (1), `control-plane/readiness-planning-table-impact-classification.js` (4), `control-plane/readiness-planning-version-contract.js` (2), `control-plane/readiness-resolved-planning-answer-context.js` (1), `control-plane/recovery-protocol-snapshot.js` (3), `control-plane/rejoin-reconciliation-contract.js` (7), `control-plane/replica-dispatch-direct-wakeup.js` (1), `control-plane/replica-dispatch-operation-execution.js` (4).

Selection: contracts `readiness-versioned-planning-liveness`, `router-delivery-envelope`, `replica-dispatch-direct-wakeup-delivery`; coupled pairs `readiness-freshness-macrotask-bound`, `router-envelope-control-plane`; 61 contract/pair witness tests; 34 test files import a slice file (e.g. `test/control-plane/active-node-projection-membership-publication-test-cases.js`, `test/control-plane/control-plane-readiness-service-getall-and-snapshot-cache.test.js`, `test/control-plane/current-membership-epoch-null-unreadable.test.js`, `test/control-plane/membership-publication-first-epoch-members.test.js`).

### NS-08 · control-plane · 10 files · 19 sites

Buckets: N0 2, N1 13, N2 0, N3 4. Rows: typeof 6, two_source 9, catch 4.

Files: `control-plane/replica-dispatch-reconcile-callbacks.js` (3), `control-plane/replica-dispatch-replay-health-readiness.js` (2), `control-plane/replica-dispatch-replay-readiness.js` (3), `control-plane/replica-dispatch-service-dispatch-error-helpers.js` (2), `control-plane/replica-dispatch-service-dispatch-observation-methods.js` (3), `control-plane/replica-dispatch-service-lifecycle.js` (1), `control-plane/replica-dispatch-service.js` (1), `control-plane/system-metadata-access-error.js` (1), `control-plane/timeout-budget.js` (1), `control-plane/topology-operator-witness.js` (2).

Selection: contracts `runtime-service-bound-creation-route`, `router-delivery-envelope`, `transport-handler-identity`, `replica-dispatch-direct-wakeup-delivery`; coupled pairs `runtime-service-legacy-removal-authority`, `router-envelope-control-plane`; 44 contract/pair witness tests; 69 test files import a slice file (e.g. `test/admin/admin-control-snapshot-retry-decision.test.js`, `test/admin/admin-websocket-api-timeout.test.js`, `test/bootstrap/bootstrap-api-seed-join-gate-authoritative-refresh.test.js`, `test/bootstrap/bootstrap-request-deferral-wait-bound-spent.test.js`).

### NS-09 · rebalancer · 20 files · 37 sites

Buckets: N0 3, N1 17, N2 1, N3 16. Rows: catch 10, two_source 21, typeof 6.

Files: `rebalancer/assignment-epoch-manager.js` (6), `rebalancer/cluster-readiness-signal.js` (2), `rebalancer/committed-membership-bootstrap-read.js` (4), `rebalancer/entity-size-resolution.js` (1), `rebalancer/global-topology-blocking-operation-view.js` (1), `rebalancer/move-planner-state-methods.js` (5), `rebalancer/move-planner.js` (2), `rebalancer/node-storage-budget-service.js` (1), `rebalancer/operation-lifecycle.js` (2), `rebalancer/operation-owner-availability-policy.js` (2), `rebalancer/operation-owner-shutdown-join.js` (1), `rebalancer/operation-progress-events.js` (1), `rebalancer/operation-progress-observer.js` (2), `rebalancer/operation-progress-store.js` (1), `rebalancer/operation-workflow-ambiguous-create-delivery.js` (1), `rebalancer/operation-workflow-coordinator-created-handoff-scheduling.js` (1), `rebalancer/operation-workflow-coordinator-handoff-retry.js` (1), `rebalancer/operation-workflow-dispatch-execution.js` (1), `rebalancer/operation-workflow-dispatch-ledger-self-move-gate.js` (1), `rebalancer/operation-workflow-dispatch-rearm-evidence.js` (1).

Selection: contracts `replica-operation-state`, `failed-create-target-authoritative-cleanup`, `operation-ledger-self-move-interlock`, `rolling-restart-rebalancer-handoff`, `committed-bootstrap-stamp`, `router-delivery-envelope`, `partition-replica-admission-from-committed-operation`, `partition-declaration-policy-and-placement`; coupled pairs `failed-create-target-authoritative-cleanup`, `operation-ledger-self-move-hold-dispatch`, `committed-bootstrap-stamp`, `router-envelope-rebalancer`, `partition-declaration-policy-and-placement`; 70 contract/pair witness tests; 77 test files import a slice file (e.g. `test/bootstrap/behaviour-changing-consumer-convergence.test.js`, `test/bootstrap/durable-rejoin-incarnation-advance.test.js`, `test/bootstrap/storage-budget-bootstrap.test.js`, `test/cdc/cdc-event-handler.test.js`).

### NS-10 · rebalancer · 20 files · 45 sites

Buckets: N0 1, N1 29, N2 0, N3 15. Rows: typeof 7, two_source 37, catch 1.

Files: `rebalancer/operation-workflow-dispatch-wake-preemption.js` (1), `rebalancer/operation-workflow-dispatch-wake-progress-decision.js` (2), `rebalancer/operation-workflow-executor-outcome-reconcile-methods.js` (1), `rebalancer/operation-workflow-executor-outcome-visibility.js` (1), `rebalancer/operation-workflow-observed-progress-retention.js` (1), `rebalancer/operation-workflow-observed-state.js` (1), `rebalancer/operation-workflow-owner-adapter.js` (1), `rebalancer/operation-workflow-owner-dispatch-pending-reentry.js` (2), `rebalancer/operation-workflow-owner-effects.js` (3), `rebalancer/operation-workflow-owner-execution-lane.js` (2), `rebalancer/operation-workflow-owner-handoff-state.js` (1), `rebalancer/operation-workflow-owner-ports.js` (10), `rebalancer/operation-workflow-owner-priority-recovery-reentry.js` (1), `rebalancer/operation-workflow-owner-retry-registry.js` (1), `rebalancer/operation-workflow-priority-recovery-superseded-target-decision.js` (1), `rebalancer/operation-workflow-recovery-drain.js` (2), `rebalancer/operation-workflow-recovery-observation.js` (4), `rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js` (6), `rebalancer/operation-workflow-recovery-reconcile.js` (1), `rebalancer/operation-workflow-recovery-status-reconcile.js` (3).

Selection: contracts `replica-operation-state`, `failed-create-target-authoritative-cleanup`, `rolling-restart-rebalancer-handoff`, `storage-reservation-authoritative-adoption`, `message-group-registered-learner-read`, `router-delivery-envelope`, `priority-recovery-drain-and-replica-observation`; coupled pairs `failed-create-target-authoritative-cleanup`, `storage-reservation-operation-and-retry-authority`, `message-group-registered-learner-read`, `router-envelope-rebalancer`, `priority-recovery-drain-and-replica-observation`; 49 contract/pair witness tests; 21 test files import a slice file (e.g. `test/control-plane/current-membership-epoch-null-unreadable.test.js`, `test/convergence/formation-joint-admission-rounds.js`, `test/node/fresh-create-resumed-syncing-claim.test.js`, `test/node/replica-handler-create-admission-test-cases.js`).

### NS-11 · rebalancer · 20 files · 43 sites

Buckets: N0 1, N1 34, N2 0, N3 8. Rows: typeof 11, two_source 27, catch 5.

Files: `rebalancer/operation-workflow-recovery-timeout.js` (7), `rebalancer/operation-workflow-replace-handoff-attempt.js` (1), `rebalancer/operation-workflow-replace-owner-recovery.js` (1), `rebalancer/operation-workflow-replace-owner-state.js` (2), `rebalancer/operation-workflow-replace-owner-wake.js` (1), `rebalancer/operation-workflow-replace-owner.js` (1), `rebalancer/operation-workflow-replace-surviving-membership.js` (2), `rebalancer/operation-workflow-replace-terminal-admission.js` (2), `rebalancer/operation-workflow-replace-witness.js` (5), `rebalancer/operation-workflow-terminal-transition-repair.js` (1), `rebalancer/operation-workflow-transition-orchestration.js` (1), `rebalancer/operation-workflow-transition-persistence.js` (2), `rebalancer/placement-owner-evidence.js` (2), `rebalancer/priority-publication-handoff.js` (3), `rebalancer/priority-publication-safety-rows.js` (4), `rebalancer/priority-publication-safety-shared.js` (1), `rebalancer/priority-publication-safety-topology.js` (1), `rebalancer/priority-recovery-observation.js` (3), `rebalancer/priority-recovery-planning-read.js` (1), `rebalancer/priority-recovery-superseded-target.js` (2).

Selection: contracts `partition-topology`, `replica-operation-state`, `failed-create-target-authoritative-cleanup`, `CL-038`, `CL-035`, `replace-owner-membership-observation`, `router-delivery-envelope`, `serve-eligibility-committed-epoch`, `partition-declaration-policy-and-placement`; coupled pairs `failed-create-target-authoritative-cleanup`, `replace-owner-membership-observation`, `router-envelope-rebalancer`, `partition-declaration-policy-and-placement`, `committed-node-floor-and-retained-wake`; 75 contract/pair witness tests; 50 test files import a slice file (e.g. `test/control-plane/cl-035-voter-ready-row-seed.test.js`, `test/control-plane/operational-probes-not-routed.guard.test.js`, `test/control-plane/priority-recovery-spread-stall-unmask.test.js`, `test/control-plane/readiness-deferred-denial-evidence-absent.test.js`).

### NS-12 · rebalancer · 11 files · 41 sites

Buckets: N0 2, N1 32, N2 0, N3 7. Rows: two_source 32, catch 3, typeof 6.

Files: `rebalancer/provisioning-admission-policy.js` (5), `rebalancer/rebalance-coordinator-concurrent-add-budget.js` (2), `rebalancer/rebalance-coordinator-helper-common.js` (2), `rebalancer/rebalance-coordinator-ledger-interlock-admission.js` (3), `rebalancer/rebalance-coordinator-ledger-interlock-hold-state.js` (1), `rebalancer/rebalance-coordinator-operation-creation-admission.js` (4), `rebalancer/rebalance-coordinator-operation-creation.js` (2), `rebalancer/rebalance-coordinator-operation-intent-methods.js` (2), `rebalancer/rebalance-coordinator-pressure-helper.js` (5), `rebalancer/rebalance-coordinator-priority-budget-admission.js` (12), `rebalancer/rebalance-coordinator-priority-budget-helper.js` (3).

Selection: contracts `priority-spread-planner-admission`, `critical-create-admission-topology-ordering`, `operation-ledger-self-move-interlock`, `spread-cure-transition-authorization`, `committed-bootstrap-stamp`, `storage-reservation-authoritative-adoption`; coupled pairs `priority-spread-planner-retention-admission-hold`, `critical-create-hold-topology-guard-order`, `operation-ledger-self-move-hold-dispatch`, `spread-cure-transition-authorization`, `committed-bootstrap-stamp`, `storage-reservation-operation-and-retry-authority`; 23 contract/pair witness tests; 20 test files import a slice file (e.g. `test/query/durable-provisioning-job-owner-guard.test.js`, `test/query/schema-provisioning-transient-collision.test.js`, `test/query/sql-query-engine-provision-ledger-hold-transient-wait.test.js`, `test/raft/raft-rs-backend/committed-membership-census.test.js`).

### NS-13 · rebalancer · 15 files · 46 sites

Buckets: N0 1, N1 36, N2 1, N3 8. Rows: typeof 14, two_source 21, catch 11.

Files: `rebalancer/rebalance-coordinator-replica-identity-methods.js` (7), `rebalancer/rebalance-coordinator-reservation-adoption.js` (1), `rebalancer/rebalance-coordinator-runtime-placement-slot-reservation.js` (1), `rebalancer/rebalance-coordinator-topology-guard-methods.js` (6), `rebalancer/rebalance-coordinator.js` (1), `rebalancer/rebalancer-planning-gate-methods.js` (4), `rebalancer/rebalancer-priority-recovery-planning-gate-methods.js` (8), `rebalancer/rebalancer-transport-pressure-methods.js` (2), `rebalancer/replica-operation-liveness.js` (2), `rebalancer/replica-operation-message-group-learner-observation.js` (1), `rebalancer/replica-operation-message-group-learner-successor.js` (2), `rebalancer/replica-operation-message-group-membership-authorization.js` (3), `rebalancer/replica-operation-message-group-membership-owner-claim.js` (3), `rebalancer/replica-operation-message-group-removal.js` (2), `rebalancer/replica-operation-repository-entity-read-methods.js` (3).

Selection: contracts `replica-operation-state`, `failed-create-target-authoritative-cleanup`, `critical-create-admission-topology-ordering`, `readiness-versioned-planning-liveness`, `storage-reservation-authoritative-adoption`, `message-group-learner-authorization-consumption`, `message-group-learner-outcome-recording`, `message-group-registered-learner-read`, `message-group-learner-create-admission`, `message-group-learner-join`, `message-group-learner-successor-ordering`, `message-group-learner-promotion`, `partition-declaration-policy-and-placement`; coupled pairs `failed-create-target-authoritative-cleanup`, `critical-create-hold-topology-guard-order`, `readiness-freshness-macrotask-bound`, `storage-reservation-operation-and-retry-authority`, `message-group-learner-authorization-consumption`, `message-group-learner-outcome-recording`, `message-group-registered-learner-read`, `message-group-learner-create-admission`, `message-group-learner-join`, `message-group-learner-successor-ordering`, `message-group-learner-promotion`, `partition-declaration-policy-and-placement`; 75 contract/pair witness tests; 98 test files import a slice file (e.g. `test/bootstrap/removed-formation-barrier-and-handoff-census.test.js`, `test/config/control-plane-gateway-mutation-guardrails.test.js`, `test/control-plane/canonical-readiness-consumption.test.js`, `test/control-plane/control-plane-readiness-service-construction.test.js`).

### NS-14 · rebalancer · 20 files · 44 sites

Buckets: N0 1, N1 34, N2 0, N3 9. Rows: two_source 32, catch 7, typeof 5.

Files: `rebalancer/replica-operation-repository-incomplete-read-methods.js` (2), `rebalancer/replica-operation-repository-read-methods.js` (1), `rebalancer/replica-operation-repository-visibility-methods.js` (4), `rebalancer/replica-placement-cure-policy.js` (1), `rebalancer/service-data-affinity-weights.js` (1), `rebalancer/spread-cure-transition-authorization.js` (3), `rebalancer/storage-capacity-accounting-service.js` (4), `rebalancer/storage-capacity-migration.js` (1), `rebalancer/storage-capacity-semantic-projection-owner.js` (4), `rebalancer/storage-pressure-behavior.js` (1), `rebalancer/topology-owner-constants.js` (3), `rebalancer/topology-owner-placement-constants.js` (2), `rebalancer/unified-rebalancer-available-nodes.js` (2), `rebalancer/unified-rebalancer-budget-planning.js` (1), `rebalancer/unified-rebalancer-control-plane-readiness-methods.js` (1), `rebalancer/unified-rebalancer-core.js` (1), `rebalancer/unified-rebalancer-critical-topology-methods.js` (1), `rebalancer/unified-rebalancer-follow-up-augmentation-methods.js` (5), `rebalancer/unified-rebalancer-follow-up-decision.js` (5), `rebalancer/unified-rebalancer-lifecycle-base.js` (1).

Selection: contracts `replica-operation-state`, `runtime-service-placement`, `readiness-versioned-planning-liveness`, `spread-cure-transition-authorization`, `storage-reservation-authoritative-adoption`, `runtime-service-bound-creation-route`; coupled pairs `readiness-freshness-macrotask-bound`, `spread-cure-transition-authorization`, `storage-reservation-operation-and-retry-authority`, `runtime-service-legacy-removal-authority`; 48 contract/pair witness tests; 42 test files import a slice file (e.g. `test/bootstrap/behaviour-changing-consumer-convergence.test.js`, `test/config/control-plane-gateway-mutation-guardrails.test.js`, `test/control-plane/endpoint-reader-currentness.test.js`, `test/control-plane/membership-publication-first-epoch-members.test.js`).

### NS-15 · rebalancer · 8 files · 29 sites

Buckets: N0 5, N1 17, N2 0, N3 7. Rows: two_source 17, typeof 8, catch 4.

Files: `rebalancer/unified-rebalancer-local-serve-readiness.js` (2), `rebalancer/unified-rebalancer-move-execution.js` (6), `rebalancer/unified-rebalancer-priority-readiness.js` (5), `rebalancer/unified-rebalancer-priority-recovery-coordination.js` (3), `rebalancer/unified-rebalancer-priority-recovery-follow-up-decisions.js` (5), `rebalancer/unified-rebalancer-replica-state.js` (5), `rebalancer/unified-rebalancer-shared.js` (1), `rebalancer/user-table-leader-placement-cure.js` (2).

Selection: contracts `router-delivery-envelope`; coupled pairs `router-envelope-rebalancer`; 32 contract/pair witness tests; 17 test files import a slice file (e.g. `test/control-plane/current-membership-epoch-null-unreadable.test.js`, `test/control-plane/membership-publication-first-epoch-members.test.js`, `test/control-plane/node-liveness-semantic-projection-owner.test.js`, `test/distributed/README.local.md`).

### NS-16 · partition · 15 files · 40 sites

Buckets: N0 2, N1 21, N2 1, N3 16. Rows: catch 2, two_source 34, typeof 4.

Files: `partition/group-retirement-evidence.js` (1), `partition/learner-promotion-count-check-evidence.js` (2), `partition/managed-merge-workflow-dissolution-methods.js` (1), `partition/managed-merge-workflow-execution-gate-methods.js` (1), `partition/managed-merge-workflow-persistence-methods.js` (4), `partition/managed-merge-workflow.js` (9), `partition/managed-source-replication-start-delivery.js` (1), `partition/managed-split-workflow-dissolution-methods.js` (3), `partition/managed-split-workflow-persistence-methods.js` (3), `partition/managed-split-workflow-provisioning-methods.js` (3), `partition/managed-split-workflow-state-methods.js` (3), `partition/managed-split-workflow.js` (4), `partition/managed-workflow-ownership-core.js` (1), `partition/managed-workflow-record-changes.js` (1), `partition/managed-workflow-record-coordinator.js` (3).

Selection: contracts `spread-cure-transition-authorization`, `partition-replication-start-authorization`, `router-delivery-envelope`; coupled pairs `spread-cure-transition-authorization`, `partition-replication-record-physical-start`, `router-envelope-partition`; 36 contract/pair witness tests; 22 test files import a slice file (e.g. `test/bootstrap/behaviour-changing-consumer-convergence.test.js`, `test/node/group-retired-tombstone-incarnation.test.js`, `test/node/group-retirement-as-a-unit-fixture.js`, `test/node/group-retirement-redrive.test.js`).

### NS-17 · partition · 20 files · 37 sites

Buckets: N0 1, N1 25, N2 1, N3 10. Rows: catch 18, two_source 13, typeof 6.

Files: `partition/managed-workflow-record-store.js` (6), `partition/partition-boundary-representation.js` (1), `partition/partition-cdc-generator.js` (2), `partition/partition-cdc-obligation-delivery.js` (1), `partition/partition-cdc-obligation-lane.js` (1), `partition/partition-consensus-hold-log.js` (1), `partition/partition-locking-read-reservation.js` (7), `partition/partition-participant-release-contract.js` (2), `partition/partition-participant-transaction-pause.js` (2), `partition/partition-participant-transaction-request.js` (1), `partition/partition-participant-transaction-self-check.js` (1), `partition/partition-participant-transaction-staging.js` (3), `partition/partition-participant-transaction-store.js` (1), `partition/partition-participant-transaction-topology-fence.js` (1), `partition/partition-raft-storage.js` (1), `partition/partition-replica-admission.js` (1), `partition/partition-service-cdc-stream-base.js` (1), `partition/partition-service-core-base.js` (1), `partition/partition-service-durability-fitness.js` (2), `partition/partition-service-entry-apply-base.js` (1).

Selection: contracts `distributed-transaction-coordinator-participant-protocol`, `raft-rs-runtime-lifecycle-entry`, `raft-rs-runtime-application-transaction`, `partition-raft-operation-port`, `partition-session-transaction-persistence-admission`, `public-seam-durability-certification-source`, `original-retained-history-observation`, `original-retained-effects-correspondence`, `cdc-source-native-delivery`, `router-delivery-envelope`, `transport-handler-identity`, `partition-replica-admission-from-committed-operation`; coupled pairs `distributed-transaction-coordinator-participant-protocol`, `raft-rs-runtime-lifecycle-entry`, `raft-rs-runtime-application-transaction`, `partition-raft-operation-port`, `partition-session-transaction-store-persistence-admission`, `participant-origin-native-history`, `original-foundation-producer-observation`, `cdc-source-native-delivery`, `router-envelope-partition`, `partition-replica-admission-from-committed-operation`; 164 contract/pair witness tests; 93 test files import a slice file (e.g. `test/bootstrap/replication-target-authority.test.js`, `test/bootstrap/retained-seed-original-handoff.integration.test.js`, `test/bootstrap/seed-participant-release-failure-projection.test.js`, `test/bootstrap/seed-release-failure-custody.test.js`).

### NS-18 · partition · 14 files · 43 sites

Buckets: N0 2, N1 23, N2 0, N3 18. Rows: two_source 31, typeof 7, catch 5.

Files: `partition/partition-service-learner-promotion-count-check-methods.js` (1), `partition/partition-service-learner-promotion-methods.js` (13), `partition/partition-service-learner-promotion-proof-methods.js` (3), `partition/partition-service-lifecycle-methods.js` (1), `partition/partition-service-merge-replication-methods.js` (5), `partition/partition-service-merge-replication-state.js` (1), `partition/partition-service-metadata-delivery-methods.js` (1), `partition/partition-service-metadata-mutation-helpers.js` (4), `partition/partition-service-raft-init-base.js` (1), `partition/partition-service-raft-peer-cache-reconciliation.js` (1), `partition/partition-service-rebalancer-methods.js` (2), `partition/partition-service-row-owner.js` (2), `partition/partition-service-source-replication-start-methods.js` (7), `partition/partition-service-split-accessor-base.js` (1).

Selection: contracts `replica-durable-generation-cleanup`, `raft-rs-runtime-lifecycle-entry`, `raft-rs-runtime-application-transaction`, `partition-raft-operation-port`, `spread-cure-transition-authorization`, `partition-replication-start-authorization`, `replica-host-cleanup-custody`, `router-delivery-envelope`, `fresh-seed-original-publication-and-admission`, `partition-replica-admission-from-committed-operation`; coupled pairs `replica-durable-generation-cleanup`, `raft-rs-runtime-lifecycle-entry`, `raft-rs-runtime-application-transaction`, `partition-raft-operation-port`, `spread-cure-transition-authorization`, `partition-replication-record-physical-start`, `replica-host-cleanup-custody`, `router-envelope-partition`, `fresh-seed-original-publication-and-admission`, `partition-replica-admission-from-committed-operation`; 105 contract/pair witness tests; 42 test files import a slice file (e.g. `test/bootstrap/behaviour-changing-consumer-convergence.test.js`, `test/bootstrap/fresh-seed-activation.integration.test.js`, `test/bootstrap/partition-activation-handler-boundary.test.js`, `test/closure/original-birth-scope-lint.test.js`).

### NS-19 · partition · 13 files · 29 sites

Buckets: N0 2, N1 10, N2 0, N3 17. Rows: catch 4, two_source 22, typeof 3.

Files: `partition/partition-service-split-replication-state.js` (1), `partition/partition-service-write-metrics-base.js` (2), `partition/partition-snapshot-cadence.js` (2), `partition/partition-split-merge-manager-core-methods.js` (2), `partition/partition-split-merge-manager-transition-methods.js` (5), `partition/partition-split-merge-policy.js` (4), `partition/partition-split-routing.js` (4), `partition/partition-statement-admission-names.js` (1), `partition/partition-statement-admission-rowid-rules.js` (2), `partition/partition-transaction-determinism.js` (1), `partition/partition-transition-overlap-guard.js` (1), `partition/partition-transition-row.js` (1), `partition/pending-request-tracker.js` (3).

Selection: contracts `raft-rs-runtime-application-transaction`, `partition-session-transaction-persistence-admission`, `public-binding-two-partition-policy-shape`, `router-delivery-envelope`, `exact-logical-table-identity`, `partition-declaration-policy-and-placement`; coupled pairs `raft-rs-runtime-application-transaction`, `partition-session-transaction-store-persistence-admission`, `public-binding-table-policy-merge-decision`, `router-envelope-partition`, `exact-logical-table-identity`, `partition-declaration-policy-and-placement`; 95 contract/pair witness tests; 24 test files import a slice file (e.g. `test/partition/durable-replay-cursor.test.js`, `test/partition/merge-backfill-batching.test.js`, `test/partition/partition-participant-transaction-staging.test.js`, `test/partition/partition-snapshot-cadence.test.js`).

### NS-20 · bootstrap · 20 files · 37 sites

Buckets: N0 6, N1 27, N2 4, N3 0. Rows: two_source 23, typeof 10, catch 4.

Files: `bootstrap/bootstrap-api-admission-methods.js` (1), `bootstrap/bootstrap-api-control-plane-methods.js` (1), `bootstrap/bootstrap-api-readiness-methods.js` (1), `bootstrap/bootstrap-api-server-methods.js` (1), `bootstrap/bootstrap-api.js` (2), `bootstrap/bootstrap-service-control-plane-runtime-methods.js` (1), `bootstrap/bootstrap-service-runtime-methods.js` (1), `bootstrap/bootstrap-service-seed-delegates.js` (1), `bootstrap/bootstrap-state-tracker.js` (1), `bootstrap/bootstrap-topology-snapshot.js` (1), `bootstrap/control-plane-write-health-owner.js` (1), `bootstrap/join-cleanup-handler.js` (1), `bootstrap/join-readiness-convergence-methods.js` (3), `bootstrap/join-readiness-snapshot-methods.js` (2), `bootstrap/node-joining-admission-readiness.js` (2), `bootstrap/node-joining-backfill-merge-and-status.js` (7), `bootstrap/node-joining-cdc-subscription-and-backfill.js` (3), `bootstrap/node-joining-delegate-bundles.js` (1), `bootstrap/node-joining-message-group-runtime-delegation.js` (3), `bootstrap/node-joining-owner-construction.js` (3).

Selection: contracts `bootstrap-contract`, `seed-registration-election-scheduling`, `readiness-handoff-liveness`, `raft-rs-runtime-application-transaction`, `cdc-source-native-delivery`, `router-delivery-envelope`, `fresh-seed-original-publication-and-admission`, `runtime-definition-create-authority`; coupled pairs `seed-registration-election-scheduling`, `raft-rs-runtime-application-transaction`, `cdc-source-native-delivery`, `router-envelope-service-bootstrap`, `fresh-seed-original-publication-and-admission`, `runtime-definition-create-authority`; 141 contract/pair witness tests; 89 test files import a slice file (e.g. `test/bootstrap/address-takeover-live-ab.test.js`, `test/bootstrap/address-takeover-workflow.test.js`, `test/bootstrap/boot-incarnation-reservation-census.test.js`, `test/bootstrap/boot-incarnation-superseded-floor.test.js`).

### NS-21 · bootstrap · 17 files · 42 sites

Buckets: N0 16, N1 26, N2 0, N3 0. Rows: catch 12, two_source 23, typeof 7.

Files: `bootstrap/node-joining-ready-signal-readiness.js` (5), `bootstrap/owners/backup-restore-owner.js` (2), `bootstrap/owners/bootstrap-cluster-view-owner.js` (2), `bootstrap/owners/bootstrap-control-plane-recovery-health.js` (2), `bootstrap/owners/bootstrap-join-admission-owner.js` (1), `bootstrap/owners/bootstrap-node-ready-rebalance-owner.js` (1), `bootstrap/owners/bootstrap-readiness-dependency-probes.js` (6), `bootstrap/owners/bootstrap-readiness-owner-probe-details.js` (1), `bootstrap/owners/bootstrap-readiness-snapshot-evaluator.js` (2), `bootstrap/owners/bootstrap-topology-snapshot-owner-authoritative-rows.js` (1), `bootstrap/owners/management-v1-owner.js` (4), `bootstrap/owners/move-replica-assignment-lease-validation.js` (1), `bootstrap/owners/move-replica-assignment-reservation-persistence.js` (3), `bootstrap/owners/move-replica-handoff-owner.js` (4), `bootstrap/owners/seed-runtime-bridge-owner.js` (1), `bootstrap/owners/service-leader-readiness-owner.js` (3), `bootstrap/owners/service-registration-visibility-owner.js` (3).

Selection: contracts `bootstrap-contract`, `raft-rs-runtime-application-transaction`, `cdc-source-native-delivery`, `management-v1-quorum-and-cluster-view-authority`, `release-version-fence`; coupled pairs `raft-rs-runtime-application-transaction`, `cdc-source-native-delivery`, `management-v1-quorum-and-cluster-view-authority`, `release-version-fence`; 93 contract/pair witness tests; 28 test files import a slice file (e.g. `test/bootstrap/bootstrap-api-readiness-publication.test.js`, `test/bootstrap/bootstrap-request-execution-timeout.test.js`, `test/bootstrap/management-action-authority.test.js`, `test/bootstrap/management-v1-l4-l3.test.js`).

### NS-22 · bootstrap · 18 files · 42 sites

Buckets: N0 5, N1 36, N2 1, N3 0. Rows: typeof 17, catch 9, two_source 16.

Files: `bootstrap/owners/startup-runtime-handoff-owner.js` (1), `bootstrap/phases/connect-websocket-phase.js` (3), `bootstrap/phases/contact-seed-failure-signals.js` (1), `bootstrap/phases/contact-seed-phase.js` (1), `bootstrap/phases/create-message-group-phase.js` (3), `bootstrap/phases/create-message-group-replica-lifecycle.js` (5), `bootstrap/phases/query-system-state-phase-snapshot-helpers.js` (1), `bootstrap/phases/query-system-state-phase.js` (1), `bootstrap/phases/seed-cache-hydration-phase.js` (1), `bootstrap/phases/seed-message-groups-phase.js` (6), `bootstrap/phases/seed-partition-replica-progress.js` (1), `bootstrap/phases/seed-partitions-phase.js` (6), `bootstrap/phases/seed-registration-phase.js` (1), `bootstrap/phases/wait-for-leadership-phase.js` (1), `bootstrap/rejoin-hints-durable-evidence.js` (4), `bootstrap/rejoin-hints.js` (3), `bootstrap/seed-retained-partition-effects.js` (1), `bootstrap/shared/control-plane-setup.js` (2).

Selection: contracts `bootstrap-contract`, `seed-registration-election-scheduling`, `replica-durable-generation-cleanup`, `readiness-versioned-planning-liveness`, `readiness-handoff-liveness`, `core-system-logic`, `original-retained-effects-correspondence`, `cdc-source-native-delivery`, `fresh-seed-original-publication-and-admission`, `runtime-definition-create-authority`, `release-version-fence`; coupled pairs `seed-registration-election-scheduling`, `replica-durable-generation-cleanup`, `readiness-freshness-macrotask-bound`, `original-foundation-producer-observation`, `cdc-source-native-delivery`, `fresh-seed-original-publication-and-admission`, `runtime-definition-create-authority`, `release-version-fence`; 126 contract/pair witness tests; 71 test files import a slice file (e.g. `test/bootstrap/address-takeover-live-ab.test.js`, `test/bootstrap/address-takeover-workflow.test.js`, `test/bootstrap/behaviour-changing-consumer-convergence.test.js`, `test/bootstrap/boot-incarnation-owner.test.js`).

### NS-23 · bootstrap · 13 files · 27 sites

Buckets: N0 2, N1 19, N2 6, N3 0. Rows: two_source 7, typeof 18, catch 2.

Files: `bootstrap/shared/local-query-transport-readiness.js` (2), `bootstrap/shared/message-group-selection.js` (2), `bootstrap/shared/message-group-service-activation.js` (3), `bootstrap/shared/node-registration-owner-durable-rejoin-methods.js` (1), `bootstrap/shared/node-registration-owner-publication-methods.js` (1), `bootstrap/shared/node-state-publication-owner.js` (3), `bootstrap/shared/partition-cdc-propagation-subscriber.js` (1), `bootstrap/shared/partition-service-activation.js` (2), `bootstrap/shared/startup-convergence-gate.js` (1), `bootstrap/shared/startup-sql-runtime-handoff.js` (2), `bootstrap/startup-workflow-store.js` (1), `bootstrap/system-table-writer.js` (1), `bootstrap/traffic-readiness-utils.js` (7).

Selection: contracts `bootstrap-contract`, `readiness-handoff-liveness`, `core-system-logic`, `cdc-source-native-delivery`, `router-delivery-envelope`; coupled pairs `cdc-source-native-delivery`, `router-envelope-service-bootstrap`; 81 contract/pair witness tests; 43 test files import a slice file (e.g. `test/bootstrap/boot-incarnation-reservation-census.test.js`, `test/bootstrap/bootstrap-service-ready-signal.test.js`, `test/bootstrap/call-cell-invocation-setup.test.js`, `test/bootstrap/cdc-propagation-source-owner-currentness.test.js`).

### NS-24 · query · 20 files · 39 sites

Buckets: N0 4, N1 23, N2 0, N3 12. Rows: two_source 28, typeof 2, catch 9.

Files: `query/application-database-error.js` (1), `query/cancellation-token.js` (1), `query/distributed/distributed-query-planner.js` (2), `query/distributed/distributed-transaction-coordinator.js` (6), `query/distributed/distributed-transaction-decision-protocol.js` (1), `query/distributed/distributed-transaction-decision.js` (1), `query/distributed/distributed-transaction-participant-manifest.js` (1), `query/distributed/distributed-transaction-protocol.js` (1), `query/distributed/distributed-transaction-records.js` (1), `query/distributed/distributed-transaction-recovery-authority.js` (3), `query/distributed/distributed-transaction-recovery.js` (3), `query/distributed/distributed-transaction-telemetry.js` (2), `query/distributed/distributed-write-coordinator.js` (1), `query/distributed/exchange-manager.js` (1), `query/distributed/parallel-query-coordinator-hedging-methods.js` (1), `query/distributed/parallel-query-coordinator.js` (3), `query/distributed/straggler-detector.js` (4), `query/partition-resolver-composite.js` (3), `query/partition-resolver.js` (1), `query/pg/pg-function-registry.js` (2).

Selection: contracts `distributed-transaction-coordinator-participant-protocol`, `transaction-workflow-recovery-ownership`, `public-application-database-seam`; coupled pairs `distributed-transaction-coordinator-participant-protocol`, `transaction-workflow-recovery-ownership`; 31 contract/pair witness tests; 96 test files import a slice file (e.g. `test/bootstrap/durable-rejoin-incarnation-advance.test.js`, `test/bootstrap/shared/control-plane-setup.test.js`, `test/control-plane/control-plane-write-identity.test.js`, `test/control-plane/endpoint-incarnation-authority.test.js`).

### NS-25 · query · 16 files · 40 sites

Buckets: N0 1, N1 30, N2 0, N3 9. Rows: two_source 28, typeof 6, catch 6.

Files: `query/pg/pg-translate.js` (1), `query/pg/postgres-wire-adapter.js` (2), `query/provisioning-completion-summary.js` (1), `query/query-execution-budget.js` (2), `query/query-executor-base.js` (1), `query/query-executor-partition-delivery.js` (3), `query/query-executor-partition-routing-snapshot.js` (5), `query/query-executor-partition-service-resolution.js` (3), `query/query-executor-shared.js` (1), `query/query-executor-unknown-outcome.js` (1), `query/query-executor-write-retry-routing.js` (8), `query/runtime-replica-state-projection.js` (4), `query/runtime-runner.js` (1), `query/schema-provisioning-job-owner.js` (2), `query/schema-provisioning-job-repository.js` (2), `query/service-partition-access-publisher.js` (3).

Selection: contracts `distributed-transaction-coordinator-participant-protocol`, `readiness-versioned-planning-liveness`, `partition-write-answer-retry-classification`, `runtime-service-bound-creation-route`, `router-delivery-envelope`, `schema-provisioning-quorum-refusal`, `serve-eligibility-committed-epoch`, `query-budget-normalization-and-enforcement`; coupled pairs `distributed-transaction-coordinator-participant-protocol`, `partition-write-answer-retry-classification`, `runtime-service-bound-creation-route`, `router-envelope-query`, `schema-provisioning-quorum-refusal`, `serve-eligibility-committed-answer-and-routing`; 110 contract/pair witness tests; 30 test files import a slice file (e.g. `test/cdc/write-then-read-projection-census.test.js`, `test/control-plane/operational-probes-not-routed.guard.test.js`, `test/distributed/harness/benchmark-scenario-a-run.js`, `test/helpers/pgwire-auth-handler.js`).

### NS-26 · query · 16 files · 43 sites

Buckets: N0 5, N1 24, N2 1, N3 13. Rows: catch 6, typeof 7, two_source 30.

Files: `query/sql-locking-read-execution.js` (16), `query/sql-locking-read-grammar.js` (1), `query/sql-parser-schema-mutation-methods.js` (1), `query/sql-parser-select-methods.js` (2), `query/sql-parser.js` (1), `query/sql-query-engine-bootstrap-routing-overlay.js` (3), `query/sql-query-engine-ddl-methods.js` (1), `query/sql-query-engine-initial-partition-provisioning.js` (1), `query/sql-query-engine-instance-initializer.js` (2), `query/sql-query-engine-lifecycle-and-callback-dispatch.js` (1), `query/sql-query-engine-metadata-authority-refresh.js` (4), `query/sql-query-engine-participant-wire.js` (1), `query/sql-query-engine-partition-routing-readiness.js` (3), `query/sql-query-engine-provisioning-admission-methods.js` (1), `query/sql-query-engine-request-dispatch.js` (4), `query/sql-query-engine-routing-metadata-methods.js` (1).

Selection: contracts `distributed-transaction-coordinator-participant-protocol`, `sql-grammar`, `sql-engine-system-table-read`, `committed-bootstrap-stamp`, `partition-replication-start-authorization`, `router-delivery-envelope`, `exact-logical-table-identity`, `schema-provisioning-quorum-refusal`, `query-budget-normalization-and-enforcement`; coupled pairs `distributed-transaction-coordinator-participant-protocol`, `sql-engine-cache-membership`, `committed-bootstrap-stamp`, `partition-replication-record-physical-start`, `router-envelope-query`, `exact-logical-table-identity`, `schema-provisioning-quorum-refusal`; 74 contract/pair witness tests; 87 test files import a slice file (e.g. `test/bootstrap/behaviour-changing-consumer-convergence.test.js`, `test/control-plane/runtime-access-policy-owner.test.js`, `test/convergence/dt-formation-declared-size-latch.test.js`, `test/distributed/harness/__tests__/benchmark-cohort-preserving-dataset-reset.test.js`).

### NS-27 · query · 15 files · 35 sites

Buckets: N0 1, N1 24, N2 0, N3 10. Rows: two_source 27, catch 5, typeof 3.

Files: `query/sql-query-engine-select-execution.js` (3), `query/sql-query-engine-shared.js` (3), `query/sql-query-engine-statement-admission.js` (2), `query/sql-query-engine-statement-execution.js` (3), `query/sql-query-engine-transaction-persistence-methods.js` (3), `query/sql-query-engine-transaction-recovery-methods.js` (1), `query/sql-query-engine-transaction-set-methods.js` (1), `query/sql-query-engine-write-failure-methods.js` (4), `query/sql-query-engine.js` (3), `query/sql-request.js` (2), `query/sql-select-execution-helpers.js` (2), `query/table-creation-service-class.js` (3), `query/table-creation-service-completion.js` (2), `query/table-creation-service-metadata-lookup.js` (2), `query/table-creation-service-partition-provisioning.js` (1).

Selection: contracts `distributed-transaction-coordinator-participant-protocol`, `sql-engine-system-table-read`, `router-delivery-envelope`, `exact-logical-table-identity`, `query-budget-normalization-and-enforcement`; coupled pairs `distributed-transaction-coordinator-participant-protocol`, `sql-engine-cache-membership`, `router-envelope-query`, `exact-logical-table-identity`; 63 contract/pair witness tests; 140 test files import a slice file (e.g. `test/admin/admin-websocket-api-timeout.test.js`, `test/admin/admin-websocket-api.test.js`, `test/bootstrap/behaviour-changing-consumer-convergence.test.js`, `test/bootstrap/fresh-join-registration-runtime-replacement.integration.test.js`).

### NS-28 · node · 20 files · 32 sites

Buckets: N0 1, N1 23, N2 1, N3 7. Rows: catch 7, two_source 16, typeof 9.

Files: `node/group-retired-tombstone-store.js` (3), `node/message-group-service-handler-create-admission.js` (2), `node/node-host-statistics-sampler.js` (1), `node/node-lifecycle-state-machine.js` (2), `node/node-reintegration-reconciliation.js` (3), `node/node-reintegration-service.js` (1), `node/node-service.js` (3), `node/participant-release-applied-position-observation.js` (1), `node/participant-release-client.js` (1), `node/participant-release-diagnostic-observation.js` (1), `node/replica-create-admission-input.js` (1), `node/replica-create-admission-owner.js` (2), `node/replica-handler-class.js` (2), `node/replica-handler-create-admission-methods.js` (2), `node/replica-handler-create-status-methods.js` (2), `node/replica-handler-failed-create-publication.js` (1), `node/replica-handler-group-retired-tombstone-methods.js` (1), `node/replica-handler-membership-relay.js` (1), `node/replica-handler-participant-release.js` (1), `node/replica-handler-progress-methods.js` (1).

Selection: contracts `priority-services-publication-census`, `replica-durable-generation-cleanup`, `failed-create-target-authoritative-cleanup`, `raft-rs-runtime-application-transaction`, `replace-owner-membership-observation`, `replica-host-cleanup-custody`, `participant-release-bounded-completion`, `router-delivery-envelope`, `message-group-learner-create-admission`, `message-group-learner-join`, `replica-create-failure-claim-and-retry-type`; coupled pairs `priority-services-row-publication-census`, `replica-durable-generation-cleanup`, `failed-create-target-authoritative-cleanup`, `raft-rs-runtime-application-transaction`, `replace-owner-membership-observation`, `replica-host-cleanup-custody`, `participant-release-bounded-completion`, `router-envelope-service-bootstrap`, `message-group-learner-create-admission`, `message-group-learner-join`, `replica-create-failure-claim-and-retry-type`; 101 contract/pair witness tests; 184 test files import a slice file (e.g. `test/address/address-manager-peer-location-authority.test.js`, `test/bootstrap/_min-test.test.js`, `test/bootstrap/boot-incarnation-superseded-floor.test.js`, `test/bootstrap/bootstrap-cleanup.property.test.js`).

### NS-29 · node · 14 files · 36 sites

Buckets: N0 4, N1 23, N2 1, N3 8. Rows: typeof 6, catch 6, two_source 24.

Files: `node/replica-handler-remove-execution-methods.js` (4), `node/replica-handler-removed-cleanup-sweep.js` (1), `node/replica-handler-runtime-metadata-methods.js` (2), `node/replica-handler-runtime-methods.js` (4), `node/replica-handler-status-methods.js` (3), `node/replica-state-machine-create-persistence.js` (1), `node/replica-state-machine-lifecycle-observation.js` (1), `node/replica-state-machine-recovery.js` (10), `node/replica-state-machine.js` (2), `node/runtime-service-bound-creation-route.js` (2), `node/runtime-service-call-cell-handler.js` (1), `node/runtime-service-creation-execution.js` (2), `node/runtime-service-request-cell-handler.js` (2), `node/runtime-service-restart-inventory.js` (1).

Selection: contracts `priority-services-marker-reconcile`, `replica-durable-generation-cleanup`, `failed-create-target-authoritative-cleanup`, `replica-host-cleanup-custody`, `runtime-service-bound-creation-route`, `router-delivery-envelope`, `transport-handler-identity`, `replica-create-failure-claim-and-retry-type`, `runtime-definition-create-authority`; coupled pairs `priority-services-marker-reconcile`, `replica-durable-generation-cleanup`, `failed-create-target-authoritative-cleanup`, `replica-host-cleanup-custody`, `runtime-service-bound-creation-route`, `runtime-service-legacy-removal-authority`, `router-envelope-service-bootstrap`, `replica-create-failure-claim-and-retry-type`, `runtime-definition-create-authority`; 79 contract/pair witness tests; 69 test files import a slice file (e.g. `test/bootstrap/boot-incarnation-reservation-census.test.js`, `test/bootstrap/durable-rejoin-incarnation-advance.test.js`, `test/bootstrap/join-resume-replica-lifecycle-owner.test.js`, `test/bootstrap/message-group-activation-handler-boundary.test.js`).

### NS-30 · cdc · 13 files · 23 sites

Buckets: N0 2, N1 8, N2 1, N3 12. Rows: two_source 7, typeof 13, catch 3.

Files: `cdc/cdc-cache-deletion-visibility.js` (1), `cdc/cdc-confirmation-tracker.js` (1), `cdc/cdc-event-handler.js` (3), `cdc/cdc-integration-service-authoritative-catchup.js` (3), `cdc/cdc-integration-service-cache-divergence.js` (1), `cdc/cdc-integration-service-cache-visibility-authority.js` (4), `cdc/cdc-integration-service-lifecycle.js` (1), `cdc/cdc-integration-service-local-system-table-routing.js` (2), `cdc/cdc-integration-service-node-join.js` (1), `cdc/cdc-integration-service-owner-rpc-read-execution.js` (3), `cdc/cdc-pipeline-readiness-gate.js` (1), `cdc/cdc-routed-mutation-readiness.js` (1), `cdc/cdc-terminal-gate.js` (1).

Selection: contracts `partition-write-answer-retry-classification`, `node-terminal-removal-visibility`; coupled pairs `partition-write-answer-retry-classification`; 13 contract/pair witness tests; 35 test files import a slice file (e.g. `test/bootstrap/bootstrap-cdc-readiness-gate.test.js`, `test/bootstrap/node-joining-cdc-readiness-gate.test.js`, `test/bootstrap/node-state-gating.property.test.js`, `test/cache/system-table-cache-observation.test.js`).

### NS-31 · cache · 7 files · 13 sites

Buckets: N0 0, N1 9, N2 1, N3 3. Rows: typeof 11, two_source 1, catch 1.

Files: `cache/cache-hydration-service.js` (1), `cache/leader-readiness-gate.js` (1), `cache/read-only-system-table-cache.js` (6), `cache/system-cache-client.js` (1), `cache/system-table-cache-cdc-observation.js` (1), `cache/system-table-cache-row-merge.js` (1), `cache/system-table-cache-tombstone-store.js` (2).

Selection: contracts none; coupled pairs none; 0 contract/pair witness tests; 30 test files import a slice file (e.g. `test/admin/admin-control-snapshot-local-published-membership-recovery.test.js`, `test/admin/admin-control-snapshot.test.js`, `test/admin/admin-websocket-api-control-snapshot-query.test.js`, `test/admin/admin-websocket-api-http-and-debug-routes.test.js`).

### NS-32 · raft · 14 files · 29 sites

Buckets: N0 1, N1 20, N2 0, N3 8. Rows: two_source 14, catch 12, typeof 3.

Files: `raft/authoritative-row-mutation-helper.js` (4), `raft/authoritative-row-mutation-vocabulary.js` (1), `raft/leader-activation-gate.js` (1), `raft/leader-activation-scheduler.js` (1), `raft/raft-committed-membership-stamp.js` (1), `raft/raft-rs-group-membership-admission.js` (2), `raft/raft-rs-ingress.js` (1), `raft/raft-rs-membership-transition-runtime.js` (1), `raft/raft-rs-membership-transition.js` (1), `raft/raft-rs-operation-port.js` (1), `raft/raft-rs-peer-delivery.js` (3), `raft/raft-rs-replica-lifecycle-owner.js` (2), `raft/raft-rs-runtime-owner.js` (7), `raft/raft-rs-snapshot-witness.js` (3).

Selection: contracts `CL-041`, `CL-040`, `CL-042`, `raft-rs-runtime-lifecycle-entry`, `raft-rs-runtime-application-transaction`, `partition-raft-operation-port`, `partition-session-transaction-persistence-admission`, `committed-bootstrap-stamp`, `replace-owner-membership-observation`, `message-group-learner-authorization-consumption`, `message-group-learner-delivery-lifetime`, `message-group-committed-learner-origin`, `snapshot-receiver-lifecycle-staging`, `service-consensus-retained-native-bootstrap`, `router-delivery-envelope`, `message-group-learner-successor-ordering`, `message-group-learner-promotion`, `release-version-fence`; coupled pairs `raft-rs-runtime-lifecycle-entry`, `raft-rs-runtime-application-transaction`, `partition-raft-operation-port`, `partition-session-transaction-store-persistence-admission`, `committed-bootstrap-stamp`, `replace-owner-membership-observation`, `message-group-learner-authorization-consumption`, `message-group-learner-delivery-lifetime`, `message-group-committed-learner-origin`, `snapshot-receiver-lifecycle-staging`, `service-consensus-retained-native-bootstrap`, `router-envelope-raft`, `message-group-learner-successor-ordering`, `message-group-learner-promotion`, `release-version-fence`; 129 contract/pair witness tests; 126 test files import a slice file (e.g. `test/bootstrap/fresh-join-registration-runtime-replacement.integration.test.js`, `test/bootstrap/fresh-seed-activation.integration.test.js`, `test/bootstrap/management-action-authority.test.js`, `test/bootstrap/release-version-fence.test.js`).

### NS-33 · raft · 11 files · 19 sites

Buckets: N0 0, N1 12, N2 0, N3 7. Rows: two_source 4, typeof 2, catch 13.

Files: `raft/raft-rs-status-observation.js` (1), `raft/replica-election-timeouts.js` (1), `raft/replica-leadership-state.js` (1), `raft/snapshot-catchup.js` (2), `raft/snapshot-checkpoint-format.js` (1), `raft/snapshot-checkpoint-store.js` (4), `raft/snapshot-compaction.js` (1), `raft/snapshot-install.js` (5), `raft/snapshot-offer-router.js` (1), `raft/snapshot-retention.js` (1), `raft/snapshot-transfer-receiver.js` (1).

Selection: contracts `message-group-committed-learner-origin`, `snapshot-receiver-lifecycle-staging`, `fresh-seed-original-publication-and-admission`, `message-group-learner-join`, `message-group-learner-successor-ordering`; coupled pairs `message-group-committed-learner-origin`, `snapshot-receiver-lifecycle-staging`, `message-group-learner-join`, `message-group-learner-successor-ordering`; 19 contract/pair witness tests; 39 test files import a slice file (e.g. `test/bootstrap/management-action-authority.test.js`, `test/bootstrap/management-v1-route-authority.test.js`, `test/control-plane/cl-036-local-leader-row-seed.test.js`, `test/convergence/dt-local-leader-seed-safety-merge.test.js`).

### NS-34 · transport · 18 files · 40 sites

Buckets: N0 4, N1 24, N2 0, N3 12. Rows: typeof 6, two_source 28, catch 6.

Files: `transport/bulk-transfer-channel.js` (3), `transport/cluster-trust-provider.js` (3), `transport/message-router-ack-delivery.js` (2), `transport/message-router-connection-authority.js` (1), `transport/message-router-connection-close-reconnect.js` (2), `transport/message-router-connection-lifecycle-methods.js` (2), `transport/message-router-delivery-behaviors.js` (1), `transport/message-router-delivery-pressure-routing.js` (4), `transport/message-router-delivery-source-admission.js` (1), `transport/message-router-outbound-delivery-registry.js` (3), `transport/message-router-pending-response-ledger.js` (5), `transport/message-router-reconnect-behaviors.js` (3), `transport/message-router-shared-vocabulary.js` (1), `transport/message-router-stats-shutdown.js` (2), `transport/node-address-resolution.js` (2), `transport/router-server-manager.js` (1), `transport/rpc-client.js` (1), `transport/x509-ed25519-certificate-authority.js` (3).

Selection: contracts `message-envelope`, `message-group-learner-delivery-lifetime`, `cdc-source-native-delivery`, `router-delivery-envelope`; coupled pairs `message-group-learner-delivery-lifetime`, `cdc-source-native-delivery`, `router-envelope-query`, `router-envelope-cdc-forwarding`, `router-envelope-partition`, `router-envelope-control-plane`, `router-envelope-rebalancer`, `router-envelope-service-bootstrap`, `router-envelope-raft`; 82 contract/pair witness tests; 33 test files import a slice file (e.g. `test/bootstrap/boot-incarnation-reservation-census.test.js`, `test/cdc/cdc-event-handler.test.js`, `test/control-plane/endpoint-incarnation-authority.test.js`, `test/control-plane/endpoint-reader-currentness.test.js`).

### NS-35 · message-group · 13 files · 32 sites

Buckets: N0 7, N1 20, N2 0, N3 5. Rows: catch 7, typeof 7, two_source 18.

Files: `message-group/message-group-committed-command-admission.js` (1), `message-group/message-group-forwarding-owner-delivery-methods.js` (5), `message-group/message-group-forwarding-owner-routing-methods.js` (1), `message-group/message-group-forwarding-owner-target-methods.js` (4), `message-group/message-group-forwarding-owner.js` (1), `message-group/message-group-learner-join.js` (5), `message-group/message-group-operation-ledger.js` (1), `message-group/message-group-service-cdc-propagation-runtime-methods.js` (2), `message-group/message-group-service-cdc-replication-runtime-methods.js` (1), `message-group/message-group-service-metadata-publication.js` (2), `message-group/message-group-service-state.js` (1), `message-group/message-group-target-resolver.js` (2), `message-group/message-retry-handler.js` (6).

Selection: contracts `raft-rs-runtime-lifecycle-entry`, `original-retained-effects-correspondence`, `cdc-source-native-delivery`, `router-delivery-envelope`, `message-group-learner-join`; coupled pairs `raft-rs-runtime-lifecycle-entry`, `cdc-source-native-delivery`, `router-envelope-cdc-forwarding`, `message-group-learner-join`; 102 contract/pair witness tests; 24 test files import a slice file (e.g. `test/bootstrap/replication-target-authority.test.js`, `test/control-plane/node-ready-lease-renewal-cadence.test.js`, `test/control-plane/replica-dispatch-node-state-update-node-row-bootstrap-failures.test.js`, `test/control-plane/replica-dispatch-node-state-update-ready-node-retry-cache-priority.test.js`).

### NS-36 · topology, storage, hlc, time, config, migration · 16 files · 25 sites

Buckets: N0 1, N1 12, N2 1, N3 11. Rows: typeof 11, two_source 14.

Files: `topology/cdc-group-propagation-durable-delivery.js` (1), `topology/cdc-group-propagation-retry-wait-report.js` (1), `topology/cdc-group-propagation-routing.js` (1), `topology/group-selection-service.js` (1), `topology/latency-group-manager-assignment-helpers.js` (1), `topology/latency-group-manager.js` (1), `topology/latency-measurement-service.js` (1), `topology/topology-anti-entropy-reconciler.js` (4), `storage/sqlite-store.js` (1), `hlc/hlc-clock-service.js` (2), `time/pct-scheduler.js` (1), `config/dynamic-config-service.js` (2), `migration/migration-coordinator-lifecycle-methods.js` (2), `migration/migration-coordinator-stage-methods.js` (3), `migration/migration-coordinator.js` (2), `migration/migration-recovery-trigger.js` (1).

Selection: contracts `partition-topology`, `cdc-source-native-delivery`, `router-delivery-envelope`, `exact-logical-table-identity`, `admin-owner-mutation-confirmation`, `dynamic-config-startup-ownership`; coupled pairs `cdc-source-native-delivery`, `router-envelope-cdc-forwarding`, `admin-owner-mutation-confirmation`, `exact-logical-table-identity`, `dynamic-config-startup-ownership`; 97 contract/pair witness tests; 39 test files import a slice file (e.g. `test/admin/admin-owner-mutation-outcomes.test.js`, `test/admin/admin-owner-operations.test.js`, `test/cache/system-table-cache.test.js`, `test/cdc/cdc-integration-service-time-seam.test.js`).

### NS-37 · index-management · 7 files · 33 sites

Buckets: N0 6, N1 18, N2 1, N3 8. Rows: two_source 29, typeof 4.

Files: `index-management/global-index-catalog-contract.js` (4), `index-management/global-index-lifecycle-coordinator.js` (6), `index-management/index-service-cdc-handler.js` (2), `index-management/index-service-global-methods.js` (10), `index-management/index-service-partition-methods.js` (4), `index-management/index-service.js` (6), `index-management/query-optimizer.js` (1).

Selection: contracts none; coupled pairs none; 0 contract/pair witness tests; 9 test files import a slice file (e.g. `test/index-management/global-index-maintenance-mode-seal.test.js`, `test/index-management/global-secondary-index-lifecycle.test.js`, `test/index-management/global-secondary-index-routing.test.js`, `test/index-management/index-maintenance-consistency.property.test.js`).

### NS-38 · policy, workflow · 7 files · 18 sites

Buckets: N0 0, N1 8, N2 1, N3 9. Rows: typeof 6, two_source 11, catch 1.

Files: `policy/table-policy-service.js` (4), `policy/table-policy-validation.js` (4), `workflow/durable-workflow-coordinator.js` (2), `workflow/epoch-lazy-feature-backfill.js` (3), `workflow/reconcile-queue-retry-ownership.js` (1), `workflow/timeout-policy.js` (2), `workflow/workflow-step-runner.js` (2).

Selection: contracts `transaction-workflow-recovery-ownership`, `public-binding-two-partition-policy-shape`, `admin-owner-mutation-confirmation`, `partition-declaration-policy-and-placement`; coupled pairs `transaction-workflow-recovery-ownership`, `public-binding-table-policy-merge-decision`, `admin-owner-mutation-confirmation`, `partition-declaration-policy-and-placement`; 25 contract/pair witness tests; 44 test files import a slice file (e.g. `test/admin/admin-owner-mutation-outcomes.test.js`, `test/admin/admin-owner-operations.test.js`, `test/cdc/write-then-read-projection-census.test.js`, `test/control-plane/canonical-readiness-consumption.test.js`).

### NS-39 · runtime · 16 files · 36 sites

Buckets: N0 7, N1 10, N2 1, N3 18. Rows: catch 11, typeof 3, two_source 22.

Files: `runtime/call-cell-reduce-coordinator.js` (4), `runtime/cell-host-call-protocol.js` (2), `runtime/component-export-resolution.js` (1), `runtime/endpoint-sync-config.js` (3), `runtime/endpoint-sync-controller.js` (2), `runtime/endpoint-sync-k8s-client.js` (7), `runtime/endpoint-sync-k8s-reconciler.js` (1), `runtime/endpoint-sync-leader-election.js` (3), `runtime/endpoint-sync-planner.js` (2), `runtime/endpoint-sync-source-client.js` (4), `runtime/endpoint-sync-source-query.js` (2), `runtime/native-js-driver.js` (1), `runtime/oci-container-descriptor.js` (1), `runtime/oci-host-agent-admission-table.js` (1), `runtime/oci-host-agent-durable-files.js` (1), `runtime/oci-host-agent-engine-translation.js` (1).

Selection: contracts `runtime-service-placement`; coupled pairs none; 1 contract/pair witness tests; 42 test files import a slice file (e.g. `test/control-plane/endpoint-reader-currentness.test.js`, `test/integration/helpers/public-binding-seam-harness.js`, `test/integration/message-group-learner-join.integration.test.js`, `test/integration/message-group-learner-runtime-authorization.integration.test.js`).

### NS-40 · runtime · 15 files · 35 sites

Buckets: N0 4, N1 18, N2 1, N3 12. Rows: catch 10, two_source 20, typeof 5.

Files: `runtime/oci-host-agent-enrollment.js` (1), `runtime/oci-host-agent-receipt-projection.js` (1), `runtime/oci-registry-policy.js` (2), `runtime/pgwire-auth-handler.js` (1), `runtime/pgwire-cutover-guard.js` (1), `runtime/pgwire-descriptor.js` (1), `runtime/pgwire-port-allocator.js` (2), `runtime/pgwire-protocol-handler.js` (3), `runtime/pgwire-runtime-module.js` (1), `runtime/request-cell-invocation-owner.js` (8), `runtime/service-runtime-consensus-bootstrap.js` (3), `runtime/service-runtime-consensus-publication.js` (4), `runtime/service-runtime-lifecycle-operation-methods.js` (2), `runtime/service-runtime-lifecycle.js` (1), `runtime/sql-query-loop-parallel-reduce.js` (4).

Selection: contracts `runtime-service-placement`, `service-consensus-retained-native-bootstrap`, `runtime-service-bound-creation-route`, `exact-logical-table-identity`, `schema-provisioning-quorum-refusal`; coupled pairs `service-consensus-retained-native-bootstrap`, `runtime-service-bound-creation-route`, `exact-logical-table-identity`, `schema-provisioning-quorum-refusal`; 31 contract/pair witness tests; 71 test files import a slice file (e.g. `test/cli/q8-resumable-bulk-data-load.test.js`, `test/compatibility/pgwire-client-compat.test.js`, `test/control-plane/q9-pilot-cutover-and-rollback-receipts.test.js`, `test/distributed/scenarios/public-seam-durability-client.js`).

### NS-41 · runtime · 6 files · 22 sites

Buckets: N0 1, N1 14, N2 0, N3 7. Rows: catch 3, two_source 18, typeof 1.

Files: `runtime/sql-query-loop-runtime-module.js` (2), `runtime/wasi-component-cell-runtime.js` (5), `runtime/wasi-component-cell-worker.js` (4), `runtime/wasi-component-derivation.js` (1), `runtime/wasm-component-driver-consensus.js` (3), `runtime/wasm-component-driver.js` (7).

Selection: contracts `runtime-service-placement`, `service-consensus-retained-native-bootstrap`, `runtime-service-bound-creation-route`, `exact-logical-table-identity`; coupled pairs `service-consensus-retained-native-bootstrap`, `runtime-service-bound-creation-route`, `exact-logical-table-identity`; 27 contract/pair witness tests; 48 test files import a slice file (e.g. `test/distributed/harness/__tests__/public-path-scale-and-failure-certification.test.js`, `test/integration/artifact-payload-durability.integration.test.js`, `test/integration/call-cell-two-node-deployment-fixture.js`, `test/integration/data-local-call-missing-cell-activation.integration.test.js`).

### NS-42 · service · 11 files · 38 sites

Buckets: N0 4, N1 23, N2 0, N3 11. Rows: typeof 4, two_source 31, catch 3.

Files: `service/adapters/runtime-service-adapter.js` (2), `service/artifact-payload-store.js` (1), `service/binding-route-actuals.js` (1), `service/call-binding-route-resolver.js` (2), `service/call-cell-invoker.js` (8), `service/call-cell-routing-surface.js` (1), `service/call-cell-statement-adapter.js` (4), `service/call-direct-invocation-replay.js` (9), `service/call-shard-paged-execution.js` (4), `service/call-shard-read-view-cursor.js` (1), `service/call-shard-read-view-manager.js` (5).

Selection: contracts `call-cell-routing`, `public-call-outcome-class`, `service-consensus-retained-native-bootstrap`, `runtime-service-bound-creation-route`; coupled pairs `service-consensus-retained-native-bootstrap`, `runtime-service-bound-creation-route`; 25 contract/pair witness tests; 26 test files import a slice file (e.g. `test/integration/artifact-payload-durability.integration.test.js`, `test/integration/developer-journey-j1-j2-j3.integration.test.js`, `test/integration/minimal-deployment-call-cell-invocation-live.integration.test.js`, `test/node/runtime-service-bound-route.test.js`).

### NS-43 · service · 15 files · 30 sites

Buckets: N0 3, N1 18, N2 0, N3 9. Rows: catch 9, two_source 20, typeof 1.

Files: `service/external-service-manifest.js` (3), `service/public-path-scale-failure-certification.js` (2), `service/request-binding-route-resolver.js` (1), `service/request-cell-http-adapter.js` (3), `service/request-cell-http-authenticator.js` (1), `service/request-cell-routing-contract.js` (1), `service/request-cell-routing-surface.js` (1), `service/service-consensus-bootstrap.js` (1), `service/service-consensus-creation-intent.js` (2), `service/service-dispatcher.js` (2), `service/service-lifecycle-manager.js` (3), `service/service-lifecycle-operations.js` (1), `service/service-local-oci-layout-builder.js` (1), `service/service-reconciler-contract.js` (5), `service/service-source-contract.js` (3).

Selection: contracts `service-consensus-original-intent-admission`, `service-consensus-retained-native-bootstrap`, `runtime-service-bound-creation-route`, `router-delivery-envelope`; coupled pairs `service-consensus-original-intent-admission`, `service-consensus-retained-native-bootstrap`, `runtime-service-bound-creation-route`, `router-envelope-service-bootstrap`; 52 contract/pair witness tests; 58 test files import a slice file (e.g. `test/cli/service-init-scaffold.test.js`, `test/cli/service-init-wasm-scaffold.test.js`, `test/cli/service-pipeline-command.test.js`, `test/control-plane/binding-schema-v3-handler-interfaces.test.js`).

### NS-44 · wasm-service · 11 files · 27 sites

Buckets: N0 2, N1 16, N2 0, N3 9. Rows: catch 5, two_source 22.

Files: `wasm-service/meta-write-executor.js` (2), `wasm-service/module-manifest-models.js` (4), `wasm-service/module-mirror.js` (2), `wasm-service/runtime-descriptor-validator.js` (1), `wasm-service/sql-profile-factory.js` (4), `wasm-service/wasm-creation-genesis.js` (1), `wasm-service/wasm-creation-opening.js` (2), `wasm-service/wasm-creation-publication.js` (3), `wasm-service/wasm-creation-retirement.js` (1), `wasm-service/wasm-creation-wake.js` (1), `wasm-service/wasm-executor.js` (6).

Selection: contracts `service-consensus-retained-native-bootstrap`, `runtime-service-bound-creation-route`; coupled pairs `service-consensus-retained-native-bootstrap`, `runtime-service-bound-creation-route`; 20 contract/pair witness tests; 27 test files import a slice file (e.g. `test/node/runtime-service-handler.test.js`, `test/node/runtime-service-restart-inventory-custody.test.js`, `test/query/execute-request.test.js`, `test/raft/raft-rs-backend/committed-membership-census.test.js`).

### NS-45 · wasm-service · 7 files · 26 sites

Buckets: N0 2, N1 15, N2 0, N3 9. Rows: two_source 24, catch 2.

Files: `wasm-service/wasm-meta-models.js` (7), `wasm-service/wasm-service-committed-command-admission.js` (1), `wasm-service/wasm-service-lifecycle.js` (2), `wasm-service/wasm-service-metadata-mutation-helpers.js` (2), `wasm-service/wasm-service-models.js` (12), `wasm-service/wasm-service-replica.js` (1), `wasm-service/wasm-writer-client.js` (1).

Selection: contracts `raft-rs-runtime-lifecycle-entry`, `replica-host-cleanup-custody`, `wasm-writer-v1-application-completion`, `service-consensus-retained-native-bootstrap`, `runtime-service-bound-creation-route`, `router-delivery-envelope`; coupled pairs `raft-rs-runtime-lifecycle-entry`, `replica-host-cleanup-custody`, `wasm-writer-v1-application-completion`, `service-consensus-retained-native-bootstrap`, `runtime-service-bound-creation-route`, `router-envelope-raft`; 68 contract/pair witness tests; 39 test files import a slice file (e.g. `test/admin/wasm-meta-serviceized-routing.test.js`, `test/bootstrap/guarded-runtime-service-handler.test.js`, `test/control-plane/request-binding-service-definition-owner.test.js`, `test/integration/control-plane-postgres-wire-scale.integration.test.js`).

### NS-46 · logging · 6 files · 23 sites

Buckets: N0 0, N1 11, N2 1, N3 11. Rows: two_source 16, catch 3, typeof 4.

Files: `logging/log-query-service.js` (4), `logging/log-retention-service.js` (5), `logging/logging-service.js` (8), `logging/logs-persistence-startup.js` (2), `logging/logs-table-service.js` (1), `logging/wait-bound-spent.js` (3).

Selection: contracts none; coupled pairs none; 0 contract/pair witness tests; 602 test files import a slice file (e.g. `test/address/address-manager-peer-location-authority.test.js`, `test/admin/admin-control-snapshot-local-published-membership-recovery.test.js`, `test/admin/admin-control-snapshot-retry-decision.test.js`, `test/admin/admin-control-snapshot-serve-lane-and-single-flight.test.js`).

### NS-47 · function, threading, live-query, utils, authoring, (src root) · 15 files · 36 sites

Buckets: N0 2, N1 25, N2 0, N3 9. Rows: two_source 24, catch 8, typeof 4.

Files: `function/function-query-executor.js` (4), `function/function-registry.js` (1), `threading/service-thread-manager.js` (4), `live-query/live-query-group-helpers.js` (2), `live-query/live-query-group.js` (4), `live-query/live-query-manager.js` (5), `live-query/live-query-service.js` (1), `live-query/live-query-startup-wiring.js` (1), `utils/strict-own-data.js` (1), `authoring/distributed-operation.js` (1), `entrypoint-runtime-admin-composition.js` (3), `entrypoint-runtime-join-decision.js` (4), `entrypoint-runtime-join-startup-policy.js` (1), `entrypoint-runtime-shutdown-lifecycle.js` (3), `lagrange-runtime-startup.js` (1).

Selection: contracts `public-application-database-seam`, `public-binding-two-partition-policy-shape`, `fresh-seed-original-publication-and-admission`, `seed-public-listener-acquisition`, `postgres-wire-owner-scale`, `log-owner-diagnostic-marker`, `dynamic-config-startup-ownership`, `coordinator-sqlite-merge`, `release-version-fence`; coupled pairs `public-binding-table-policy-merge-decision`, `fresh-seed-original-publication-and-admission`, `seed-public-listener-acquisition`, `log-owner-diagnostic-marker`, `dynamic-config-startup-ownership`, `release-version-fence`; 50 contract/pair witness tests; 69 test files import a slice file (e.g. `test/authoring/authoring-descriptors.test.js`, `test/bootstrap/boot-incarnation-owner.test.js`, `test/bootstrap/boot-incarnation-reservation-census.test.js`, `test/bootstrap/boot-incarnation-superseded-floor.test.js`).

### NS-48 · admin · 12 files · 39 sites

Buckets: N0 2, N1 22, N2 0, N3 15. Rows: typeof 13, two_source 19, catch 7.

Files: `admin/admin-control-snapshot-control-plane-diagnostics.js` (7), `admin/admin-control-snapshot-diagnostic-loss-accounting.js` (1), `admin/admin-control-snapshot-leadership-summary.js` (1), `admin/admin-control-snapshot-local-build-base.js` (6), `admin/admin-control-snapshot-local-diagnostics-methods.js` (3), `admin/admin-control-snapshot-node-view-projection.js` (5), `admin/admin-control-snapshot-publication-convergence-diagnostics.js` (1), `admin/admin-control-snapshot-readiness-diagnostics-methods.js` (7), `admin/admin-control-snapshot-repair-diagnostics.js` (1), `admin/admin-control-snapshot-repair-orchestration.js` (2), `admin/admin-control-snapshot-stale-watermark-record.js` (2), `admin/admin-owner-operations.js` (3).

Selection: contracts `admin-cache-owner-lifecycle`, `node-terminal-removal-visibility`, `postgres-wire-owner-scale`, `admin-owner-mutation-confirmation`, `log-owner-diagnostic-marker`, `partition-declaration-policy-and-placement`; coupled pairs `admin-notification-repair-cache-owner-handoff`, `admin-owner-mutation-confirmation`, `log-owner-diagnostic-marker`, `partition-declaration-policy-and-placement`; 36 contract/pair witness tests; 25 test files import a slice file (e.g. `test/admin/admin-control-snapshot-priority-recovery-authority.test.js`, `test/admin/admin-control-snapshot-priority-recovery-dormant-context-retirement.test.js`, `test/admin/admin-owner-mutation-outcomes.test.js`, `test/admin/admin-owner-operations.test.js`).

### NS-49 · admin · 9 files · 27 sites

Buckets: N0 2, N1 12, N2 0, N3 13. Rows: typeof 4, catch 5, two_source 18.

Files: `admin/admin-preflight-snapshot.js` (6), `admin/admin-query-result-message-envelope.js` (3), `admin/admin-runtime-service-views.js` (7), `admin/admin-service-discovery-readiness-context-methods.js` (3), `admin/admin-service-discovery-repair-cache-methods.js` (2), `admin/admin-service-discovery-repair-methods.js` (2), `admin/admin-service-discovery-replica-readiness-methods.js` (1), `admin/admin-service-message-adapter.js` (1), `admin/admin-test-run-inventory-methods.js` (2).

Selection: contracts `active-gate-convergence`, `admin-cache-owner-lifecycle`, `runtime-definition-create-authority`; coupled pairs `active-gate-authoritative-repair-backoff`, `admin-notification-repair-cache-owner-handoff`, `runtime-definition-create-authority`; 34 contract/pair witness tests; 13 test files import a slice file (e.g. `test/admin/admin-preflight-repair-wait-bound-spent.test.js`, `test/admin/admin-preflight-snapshot.test.js`, `test/admin/admin-query-result-envelope-participant-failures.test.js`, `test/admin/admin-query-result-message-envelope.test.js`).

### NS-50 · admin · 12 files · 41 sites

Buckets: N0 7, N1 21, N2 0, N3 13. Rows: two_source 30, catch 8, typeof 3.

Files: `admin/admin-test-run-lifecycle-methods.js` (16), `admin/admin-test-run-paths.js` (1), `admin/admin-test-run-report.js` (1), `admin/admin-test-run-service-helpers.js` (2), `admin/admin-test-run-service.js` (3), `admin/admin-websocket-api-base.js` (2), `admin/admin-websocket-diagnostics-route-methods.js` (2), `admin/admin-websocket-load-lane-admission.js` (1), `admin/admin-websocket-local-observation-methods.js` (2), `admin/admin-websocket-message-dispatch-methods.js` (2), `admin/admin-websocket-query-execution-methods.js` (7), `admin/standalone-test-run-server.js` (2).

Selection: contracts `admin-cache-owner-lifecycle`, `router-delivery-envelope`; coupled pairs `admin-notification-repair-cache-owner-handoff`, `router-envelope-service-bootstrap`; 36 contract/pair witness tests; 9 test files import a slice file (e.g. `test/admin/admin-test-run-service.test.js`, `test/admin/admin-websocket-payload-size-attribution.test.js`, `test/admin/standalone-test-run-server.test.js`, `test/bootstrap/unified-service-lifecycle-cutover-guards.test.js`).

### NS-51 · cli · 19 files · 30 sites

Buckets: N0 6, N1 14, N2 0, N3 10. Rows: catch 14, two_source 14, typeof 2.

Files: `cli/admin-cli-action-methods.js` (1), `cli/bulk-load-command.js` (1), `cli/bulk-load-manifest-contract.js` (1), `cli/bulk-load-router.js` (1), `cli/cert-command-router.js` (2), `cli/core/connection-manager.js` (1), `cli/core/detail-panel.js` (1), `cli/core/dev-tools.js` (1), `cli/core/error-handler.js` (2), `cli/core/table-metadata-computer.js` (3), `cli/cutover-router.js` (1), `cli/service-lifecycle-sql-client.js` (1), `cli/service-pipeline-command.js` (8), `cli/sql/results-panel.js` (1), `cli/sql/sql-query-view.js` (1), `cli/sql/table-autocomplete.js` (1), `cli/views/config-value-helpers.js` (1), `cli/views/logical-services-view.js` (1), `cli/views/tables-view.js` (1).

Selection: contracts `node-terminal-removal-visibility`; coupled pairs none; 6 contract/pair witness tests; 38 test files import a slice file (e.g. `test/cli/admin-cli-owner-operations.test.js`, `test/cli/core/cdc-selective-update.property.test.js`, `test/cli/core/connection-manager.test.js`, `test/cli/core/detail-panel.test.js`).

### NS-52 · diagnostics · 9 files · 29 sites

Buckets: N0 1, N1 11, N2 0, N3 17. Rows: two_source 25, typeof 1, catch 3.

Files: `diagnostics/budget-timeout-accounting.js` (6), `diagnostics/causal-graph-builder.js` (8), `diagnostics/event-loop-gap-watchdog.js` (1), `diagnostics/failure-class-taxonomy.js` (3), `diagnostics/formation-attribution-window.js` (2), `diagnostics/resource-diagnostics-sampler.js` (1), `diagnostics/stop-condition-decision.js` (3), `diagnostics/topology-convergence-active-gate-normalizers.js` (1), `diagnostics/topology-convergence-edge-resolvers.js` (4).

Selection: contracts none; coupled pairs none; 0 contract/pair witness tests; 21 test files import a slice file (e.g. `test/control-plane/priority-recovery-projection-brand-short-circuit.test.js`, `test/control-plane/projection-planning-identity-memoization.test.js`, `test/control-plane/projection-readiness-planning-consumption-owner.receipt.test.js`, `test/control-plane/publication-snapshot-build-sync-section-attribution.test.js`).

### NS-53 · diagnostics · 5 files · 26 sites

Buckets: N0 0, N1 15, N2 0, N3 11. Rows: two_source 26.

Files: `diagnostics/topology-convergence-graph.js` (19), `diagnostics/topology-convergence-priority-recovery-normalizers.js` (1), `diagnostics/topology-convergence-publication-normalizers.js` (4), `diagnostics/topology-convergence-readiness-normalizers.js` (1), `diagnostics/topology-convergence-replay.js` (1).

Selection: contracts none; coupled pairs none; 0 contract/pair witness tests; 11 test files import a slice file (e.g. `test/admin/admin-control-snapshot-repair-handoff-replay-outcome-test-cases.js`, `test/control-plane/membership-publication-first-epoch-members.test.js`, `test/convergence/dt6-publication-readiness-deficit-network.test.js`, `test/diagnostics/topology-convergence-active-gate-handoff-route.test.js`).

### NS-54 · debug, debug-runtime · 8 files · 22 sites

Buckets: N0 1, N1 14, N2 0, N3 7. Rows: two_source 20, catch 1, typeof 1.

Files: `debug/debug-emitter.js` (1), `debug/debug-session-resolver.js` (1), `debug-runtime/debug-coordinator.js` (1), `debug-runtime/debug-metadata-service.js` (14), `debug-runtime/dwarf-index-cache.js` (1), `debug-runtime/runtime-introspector.js` (1), `debug-runtime/snapshot-recorder.js` (1), `debug-runtime/wasm-runtime-adapter.js` (2).

Selection: contracts none; coupled pairs none; 0 contract/pair witness tests; 18 test files import a slice file (e.g. `test/debug-runtime/dap-server-callback.integration.test.js`, `test/debug-runtime/dap-server-service.integration.test.js`, `test/debug-runtime/debug-coordinator.integration.test.js`, `test/debug-runtime/debug-coordinator.test.js`).


## Deferred: files that in-flight writers own now

These are excluded from every slice. All their still-valid sites (any bucket) are listed with head lines.
Several deferred patterns have **no** detector site at the head: `src/rebalancer/replica-operation-*retained*` (9 files),
`src/partition/partition-placement-admission*` (5 files), `replica-placement-owner-transport.js`,
`query-executor-partition-routing-candidates.js` and `control-plane-owner-fact-read.js` (absent at the head).
`rebalance-coordinator-operation-creation-support.js` has one changed census site and one new site, neither with evidence.

| File | Still-valid sites | Buckets | Head lines |
| --- | --- | --- | --- |
| `src/cdc/cdc-integration-service-authoritative-read-flow.js` | 4 | N5 2, N1 2 | 392, 438, 645, 652 |
| `src/rebalancer/rebalance-coordinator-lifecycle.js` | 6 | N4 2, N5 3, N1 1 | 154, 240, 244, 302, 321, 362 |
| `src/rebalancer/replica-operation-repository-mutation-gateway-methods.js` | 3 | N1 2, N5 1 | 184, 557, 560 |
| `src/rebalancer/replica-operation-repository-mutation-transition-methods.js` | 2 | N3 2 | 37, 92 |
| `src/rebalancer/replica-operation-repository-mutation-update-methods.js` | 1 | N1 1 | 456 |
| `src/rebalancer/replica-operation-repository.js` | 1 | N1 1 | 298 |

Deferred N0-N3 subset: 9 sites: N1 at `rebalance-coordinator-lifecycle.js:302`, `cdc-integration-service-authoritative-read-flow.js:645,652`,
`replica-operation-repository-mutation-gateway-methods.js:184,557`, `-mutation-update-methods.js:456` (catch) and
`replica-operation-repository.js:298`; N3 at `-mutation-transition-methods.js:37,92`. The last two are the operation-id and
partition-id shape chains (`operationId ?? operation.operationId ?? operation.operation_id`) that feed W4's `FALLBACK_LANE`
owner key (section C); they belong to that file's writer.
The W4 S2 slice (dual read and confirmation poll) covers the mutation files' semantic alternates, which no syntactic row sees.

## Producer-change marks (owner addition, 2026-11-21)

An unexecuted arm is not automatically unneeded. The surrogate scheduling lane looked dead only because a producer change
(partition leader roles collapsed to follower) broke its consumer. Every N0/N1/N2 site therefore gets the history check of
`README.md` section 6 before deletion. Results so far, all in `producer-check.tsv` with slice ids:

- **SERVICES `raft_role` / role reads: none among the N0-N2 census sites** (VERIFIED: a pattern scan of every N0-N2 site's
  text for `raft_role`, `raftRole`, `RAFT_ROLE`, `'leader'`, `isLeader`, `.role`, `getRole(`). In all buckets only two census
  sites touch a role, and both read the live role (`typeof service.getRole === 'function' ? service.getRole() : service.role`,
  `bootstrap/owners/service-leader-readiness-owner.js:81` N4 and `node/replica-handler-runtime-methods.js:660` N3).
  The SERVICES role readers are comparisons (`=== RAFT_ROLE.LEADER`). None of the three syntactic rows detects a comparison,
  so they are **outside this census entirely**. W3's reader census (#2-#19, N1-N6) is their worklist. Under the owner
  decision on D2, each of them is a candidate broken required path until its history check says otherwise.
- **Other producer contracts marked in N0-N2 (27 distinct sites; the two `leader_node_id` sites are also among the 24 shape pairs):**
  - `leader_node_id`: `partition/managed-merge-workflow.js:540` and `partition/managed-split-workflow.js:459` (NS-16).
    Both read `info.leader_node_id || info.leaderNodeId || this.nodeId`; the "assume self is leader" arm never ran.
    This is a value contract (the canonical leader publication), not a killed producer. Replace the arm with a typed
    unavailable outcome and do not delete it silently.
  - REPLACE source (`sourceReplicaId` and the `getReplaceSourceReplicaId` probe):
    `rebalancer/rebalance-coordinator-replica-identity-methods.js:152, 205, 309` (NS-13). The probe is for fixtures; the
    method exists in 28 places. W4 section C notes the row decoder's `steps_history` derivation, which is a different site.
  - 24 snake/camel shape pairs (for example `operation_id`/`operationId`). Each is a legacy shape (kind d) whose producer
    side must be named before deletion. Find which normaliser emits which shape at the head.
- **N2 "primary dead" history (18 keys checked with `git log -S`):**
  - 7 are P0, never produced: no commit ever passed the option.
  - 1 is **P1, producer removed**: `bootstrap/shared/message-group-service-activation.js:98` `resolveExtraFields` (NS-23).
    Its only producer was deleted in `c93265e10` (2026-03-21). Confirm that commit retired the capability before deleting.
  - 1 is a second wiring path: `partition/partition-service-core-base.js:211` (NS-17). `onSnapshotCatchupNeeded` is assigned
    after construction by `bootstrap/shared/snapshot-catchup-wiring.js:121`. The capability is alive; the constructor
    option is the dead duplicate.
  - 7 are P2: produced at the head, but this path is never reached. They need more lanes or a trap, not deletion on sight.
  - 2 are not determined (`join-cleanup-handler.js:709`, `cdc-confirmation-tracker.js:73`).
