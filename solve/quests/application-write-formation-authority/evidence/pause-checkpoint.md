# Application-write formation authority pause checkpoint

Date: 2026-09-28

State: ACTIVE / PAUSED AT CLEAN OWNER CHECKPOINT. This Quest is not sealed or
published. No production edits are authorized while the upstream
formation/lifecycle owners are changing.

## Exact implementation

- Production implementation commit:
  `ae3e6d887b5ed4bf80bdc75131ee6ba889201d36`.
- Evidence state immediately before this checkpoint:
  `7fec3934958c36ea02b5a54310e09eb2d879e78d`.
- The production tree has not changed after `ae3e6d887`; later commits contain
  Quest evidence only.
- The transaction STOP checkpoints remain untouched:
  `292b7204334cf47617e675dd9b12bc708b682886` and
  `f673538bbeaa30738d688fb226dbcd90f94014d9`.

## Direct owner proof

Command:

```text
node --test test/rebalancer/application-write-formation-authority.test.js test/rebalancer/replica-operation-membership-epoch-binding.test.js
```

Result on this checkpoint: 158 tests, 157 passed, 0 failed, 1 shutdown-only
skip.

- F1: an unchanged composite admission observation is revalidated at the
  effect boundary and produces exactly one durable operation-insert attempt.
- F2: a required create-time predicate, including the canonical
  `replica_operations` write route, can independently keep admission from
  returning PROCEED.
- F3: a decision-relevant authority change after observation returns typed
  `OPERATION_CREATION_ADMISSION_REENTER` before any operation insert.
- F4: a stale generation cannot insert; re-entry under the current generation
  retains the deterministic operation identity.

The same direct suite also keeps anchors for route quarantine, priority-recovery
routing, repair-only admission, narrow ledger-read fail-open, lost operation
insert result, duplicate logical request, canonical epoch decoding, caller
census, INSERT ambiguity, and safe lifecycle UPDATE retry.

## Composite admission dimensions

`RebalanceCoordinator` owns one exported operation-creation admission. Its
observation binds:

1. The readiness planning identity: global planning generation, target-node
   planning generation, and the fail-closed saturation state.
2. Canonically decoded membership-publication epoch when the move is bound to
   one.
3. Operation intent: move type; partition, entity and target identities;
   source node and replica identities; deterministic operation and replica
   intent IDs; work class; priority-recovery requirement; and concurrent-budget
   policy.
4. Current entity/operation state, including conflicting in-flight operations
   and entity add-like serialization.
5. Topology policy: priority control-plane removal, surplus-removal fence,
   critical-partition create lane, and create topology guard.
6. The existing operation-ledger interlock, retaining only its documented
   deadlock-prevention fail-open behavior.
7. Storage admission and the resolved entity-size input used by that owner.
8. The canonical QueryExecutor `replica_operations` write-candidate result,
   including endpoint quarantine and priority-recovery routing.

The observation carries compact semantic identities and decisions, not mutable
cache objects. Unversioned predicates are reread by the same coordinator during
effect-boundary revalidation. A route loss is translated to re-entry only when
QueryExecutor and the repository prove that no submission occurred; possibly
submitted outcomes remain ambiguous and reconcile through deterministic
operation identity.

## Readiness identity owner

Admission consumes
`ControlPlaneReadinessService.readCurrentPlanningProjectionIdentity(nodeId)`.
That identity is current only when:

- `globalPlanningGeneration` is readable;
- `nodePlanningGeneration` is readable; and
- `saturated` is `false`.

The semantic-generation owner classifies changes from `nodes`,
`node_endpoints`, `services`, `partitions`, `replica_operations`,
`storage_reservations`, and `control_plane_publications`, together with the
owner's node-liveness/recovery inputs. Admission captures the identity before
its gates, confirms it after observation, and requires the same identity again
immediately before persistence.

## Deferred integration evidence

T-A is pending, not waived. Exact carrier
`82499b8a761cc47728936505696e5df97350184d` passed one focused tv-dator run
(33 assertions) and then stopped on confirmation 1/3 before its transaction
assertions. The composite owner correctly withheld the schema child while an
upstream `replica_operations` REPLACE source-removal wedge and ambiguous-result
storage-reservation replay kept the operation ledger unsafe.

Those formation/lifecycle semantics are outside this direct owner checkpoint
and are moving separately. Resume T-A only after their authoritative contracts
stabilize. Do not weaken composite admission, widen timeouts, or add mutation
retry to make the integration anchor pass.

## Resume rule

On resume, start from production commit `ae3e6d887`, retain the evidence-only
descendants, rerun the direct owner proof, then rerun T-A against the stabilized
formation/lifecycle base. Fresh exact-SHA verification, Quest sealing, and
publication remain outstanding.
