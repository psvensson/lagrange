# U1 rs-raft: focused eleven-file green and unresolved legacy authorization — 2026-10-19

**Type:** Append-only investigative checkpoint in the existing `wasm-creation-genesis` Quest under `raft-rs-full-cutover`.
**Acceptance:** NOT APPROVED. No merge, release, U2 commencement, or activation seal granted.

## Exact measured positive candidate

- Source commit: `cb1f0959fc35c7280218b7d5421f1703286645bd` (`probe/u1-p-r8-sync-terminal-oracle-20261019`).
- Original signed Harnessd cloud request: `80a6a22e-5a4d-422a-804c-b3257862346b`, control [issue #14](https://github.com/psvensson/harnessd-control/issues/14), generation 7, `repo-tests`.
- Physical [lab #364](https://github.com/psvensson/lagrange-lab/issues/364), request `5c0df8a280024e55a3e06e5c56f78e97`, host `tv-dator`.
- Terminal: COMPLETE / exit code 0, **11/11 selected files PASS; 310 runner-reported assertions**, original untruncated log 2,284 bytes.
- The positive result includes R2/F1 intent, runtime-handler, routing, custody, physical/restart, service-runtime publication, and lifecycle tests. This is **focused source/test evidence only**: not static/audit, full corpus, independent source/oracle approval, source-only mutation controls, distributed seed-loss proof or merge authority.
- Original red candidate `7919e405`: [#346](https://github.com/psvensson/lagrange-lab/issues/346), 3/5 files passed. Full original 48,954-byte log retrieved through #347–353. Its handler legacy-id and restart-idempotency failure witnesses were preserved and classified before correction.
- Original red candidate `4cc155b8`: [#355](https://github.com/psvensson/lagrange-lab/issues/355), 3/4 files passed. Its single P-R8 old-oracle failure led to explicit `_handleDispatchResponse(COMPLETED)` / `handleStopPhaseSatisfiedResponse` ownership analysis. A synchronous already-REMOVED reply is already a terminal coordinator input; the test-only change in `cb1f0959` asserts no second async REMOVE_COMPLETED. This assertion supersession still needs independent approval; the old result is not deleted or counted green.

## An adversarial direct-boundary red — not yet a proven reachable production exploit

- Positive compatibility repair `f07ed5311c69c6fc1c1c7693297e4ad3970b826e` restored handler acceptance of noncanonical *generic* legacy REMOVE while keeping bound creation and new dispatched CREATE IDs strict; source based on July 24 canonical target migration history.
- Source-only additional test commit: `c3ec5488e6ead919c77e0ceec8ea5418e5340613` (`probe/u1-legacy-opaque-entity-red-20261019`).
- Original [lab #366](https://github.com/psvensson/lagrange-lab/issues/366), host `lenovo-laptop`, exact SHA above, exit 1, 33/34 passing leaves (41 runner-reported assertions). Original full log 15,791 bytes, retrieved through #367–368.
- New test sets an opaque legacy services row plus a historical REPLACE operation for entity A. A direct handler REMOVE request claims entity B and the same opaque replica ID. Actual: **INITIATED** and a generic STOP is admitted; expected: ERROR/no effect. Failure message `OPAQUE_ID_WITH_UNRELATED_ENTITY_ADMITTED_DESTRUCTIVE_CLEANUP`.
- **Proof ceiling:** this test directly invokes the handler; it does not prove that Lagrange's actual coordinator/dispatch owner can generate or deliver a mismatched operation, nor prove a malicious remote caller crosses the trusted-network threat model. Do not label as a production exploit until that route is exercised. Conversely, do not dismiss the identity ambiguity merely because the eleven existing files passed. The direct handler boundary is insufficiently fenced under the original request's claimed entity.

## Historical ownership, confirmed from source

- [July 24 canonical target handoff](https://github.com/psvensson/lagrange/commit/33571309702204f076fb27b80efaba03929adaa8) made new runtime targets canonical `entityId-rN`, but **also added the historical legacy-cleanup positive test** and the timerless `RuntimeServiceLegacyTargetReconciler` which read original REPLACE operations, checked canonical coverage, and submitted a normal coordinator REMOVE for old opaque IDs.
- [August 21 single-owner refactor](https://github.com/psvensson/lagrange/commit/d29c7d8c845b1c0b9b2067113b220295a161ab29) deleted that reconciler and its owner hook. New target aliasing remains prohibited.
- The existing `ReplicaDispatchService.getAuthoritativeReplicaOperationRow(operationId)` reads the canonical `ReplicaOperationRepository.queryAuthoritativeOperationById` (or the gateway); do **not** duplicate that authority via `systemTableCache` or derive entity from the requested opaque ID.
- Check whether any legitimate production path currently attempts cleanup of historical opaque targets. If reachable, model the interaction as: durable REPLACE target/entity/source facts → authoritative coordinator REMOVE admission → exact handler target/identity, including mixed generations, restart, missing owner, lost replies, and conflicting entity claims. If not reachable, classify obsolete direct fixture/migration separately with independent ownership approval.
- A safe correction belongs in the existing operation-authority/dispatch and handler interaction, not a new local allocator, `replace-replica-*` alias for CREATE, or unqualified projection-based grant. Preserve physical finality and original journal obligations. No assumption that a cached `replica_operations` row is itself permission to delete.

## Acceptance and next actions

1. **Unresolved systemic class:** prove reachability through actual coordinator → dispatch → router → handler, with a real durable operation and both matching/mismatched entity identities. Independent owner decision required before treating the direct red as U1-blocking or excluded.
2. Independently review the `f07ed531` REMOVE guard and test-only `cb1f0959` synchronous completion oracle; do not self-approve. Validate that original July24 canonical handoff still prohibits aliasing.
3. Run exact-tree scoped fast-static (lint, dependency graph, impact-index metadata, guidelines, source/fixture equivalence) and reproduce source-only negative controls with the final test tree. Existing F1 negative controls at earlier SHA cannot certify the new tree.
4. Extend to integrated physical multi-host crash/restart and off-seed seed-storage-loss proof per the parent epic. A one-host 11-file green is not this proof.
5. Publish a new immutable final U1 SHA only after independent design, source, oracle and execution acceptance. Keep `main`, U2 and activation gated until then.

This note is a **data-only** preserved handover. It does not modify the sealed Quest statement, history or source and is not a terminal receipt.
