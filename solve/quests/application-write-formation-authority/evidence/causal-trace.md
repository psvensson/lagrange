# Application-write formation authority: causal trace

Date: 2026-09-27

Product base: `75147d7439de82d72de857aadd48c6b0eccf3059`

Exposing run: `f673538bbeaa30738d688fb226dbcd90f94014d9` on
`tv-dator`. The exposing test is not part of this repair branch and remains
unchanged on the frozen STOP branch.

## Verdict

Classification: **D (A + B)**.

- **A, missing predicate:** the application-write provisioning precheck does
  not require the `replica_operations` owner path to be routable/writable. An
  unreadable operation ledger is deliberately collapsed to no interlock
  deferral by `resolveProvisioningLedgerInterlockDeferral()`, after which the
  storage admission policy can return `ADMITTED`.
- **B, different view:** provisioning candidate selection consumes
  `getProvisioningNodeTrustViewSync()`, which reads node readiness using the
  direct-publication-row planning source and admits `repairEligible` nodes as
  an explicit degraded fallback. The ensuing `replica_operations` routed
  mutation consumes `getControlPlaneParticipationSync(...,
  controlPlaneRecoveryEligible)`. In the captured failure those two reads
  disagreed: the former selected all three nodes as `repair_only`, while the
  latter rejected all candidates with `planning_snapshot_refresh_pending` and
  `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`.

This is not a stronger meaning inferred from cluster ACTIVE. The write-specific
owner itself returns `OWNER_CONTRACT_STATE.READY` / `PROCEED` from
`waitForProvisionTargetNodeIds()`, and the production comment on
`checkProvisioningAdmission()` says the precheck must predict
`createOperation()`.

## Controlled owner-boundary reproduction

A read-only direct invocation on the product base used the real
`ReplicaOperationRepository.queryIncompleteOperations()`, the real ledger
interlock, and the real `checkProvisioningAdmission()` composition. The
gateway returned `Partition service not found` for the authoritative
`replica_operations` read; the storage policy admitted.

Observed result:

```json
{
  "decision": {
    "allowed": true,
    "decisionType": "admitted",
    "admissionResult": {
      "allowed": true,
      "decisionType": "admitted"
    }
  },
  "observation": {
    "state": "empty",
    "operationCount": 0,
    "deferredOutcome": null,
    "retryAfterMs": null
  },
  "trace": [
    {
      "owner": "ReplicaOperationRepository",
      "tableName": "replica_operations",
      "outcome": "Partition service not found"
    },
    {
      "log": "error",
      "message": "Failed to query operations from system table"
    },
    {
      "owner": "ProvisioningAdmissionPolicy",
      "outcome": "ADMITTED"
    }
  ]
}
```

This reproduces the false handoff without elapsed-time assumptions: the
authoritative ledger observation is unavailable, its observation is exposed
as level `empty`, and the write-specific formation owner returns admitted.

## Captured live timeline

The retained source log is:

`tv-dator:/home/peter/projects/lagrange/test-output/transaction-replicated-apply/active-owns-connection-2026-09-27T17-14-50-403Z/seed-7c11cb06-c133-4abc-8a49-1486c29dbfa7-node-0.log`

| Point | Time | Owner | Source of truth / state | Identity |
| --- | --- | --- | --- | --- |
| t0 | before 17:16:43 | embedded cluster lifecycle | seed plus two joiners started; harness begins application-write formation after membership handoff | seed `7c11cb06...`, joiners `8121f747...`, `067200b4...` |
| t1 | before 17:16:43 | membership publication owner | three published active node identities are visible to provisioning trust | publication epoch `7`, source snapshot version `0` |
| t2 | 17:16:43.974 | schema job / SQL provisioning | first attempt has no admissible cohort and fails before a replica operation can be trusted | table `tbl-05e790f...`, partition `tbl-05e790f...-p1` |
| t3 | 17:16:46.289 | `SQLQueryEngine.waitForProvisionTargetNodeIds` | write-specific formation releases via explicit degraded fallback | same partition; later captured trust entries are `repair_only` |
| t4 | 17:16:48.027 | query routing / control-plane participation | `replica_operations-p1` has zero routable candidates; the canonical leader is known but every candidate is filtered by recovery readiness | ledger partition `replica_operations-p1` |
| t5 | 17:16:49.440 | `RebalanceCoordinator` workflow owner | deterministic CREATE child operation is already durable enough to time out and transition terminal | operation `schema-job-05e790f...:operation:8121f747...` |
| t6 | 17:16:49.532 | `RebalanceCoordinator` | that child operation is marked failed, so later deterministic job ownership cannot safely treat the original handoff as a clean pre-effect refusal | same operation identity |
| t3' | 17:17:17.601 | `SQLQueryEngine.waitForProvisionTargetNodeIds` | formation again logs degraded fallback: `strictNodeIds=[]`; all three candidates are `repair_only`; each carries publication epoch `7`, source snapshot `0`, and `serve_lane_publication_stream_not_ready` / `serve_lane_priority_recovery_active` | same table partition and cohort |
| t4' | 17:17:18.331, .537, .951 | `ReplicaOperationRepository` / query routing | authoritative operation reads fail `Partition service not found` for `replica_operations` | ledger partition owner unavailable |
| t6' | 17:17:24.108 | schema job owner | deterministic retry encounters the durably terminal failed winner and surfaces `Operation persistence collision winner is durably terminal` | same schema-job namespace |

The interval contains real authoritative changes, but the controlled
reproduction shows that no transition is required to violate the contract:
with the ledger path held unavailable, the precheck still admits.

## Owner-difference table

| Predicate | Formation owner reads it? | Write owner reads it? | Source of truth | Version / generation |
| --- | --- | --- | --- | --- |
| published cohort membership | yes | indirectly for routed participation | membership publication owner | epoch `7`, source snapshot `0` in captured run |
| node serve eligibility | yes, preferred | yes for ordinary routing | `ControlPlaneReadinessService` | readiness observation/revision |
| node repair eligibility | yes, accepted as degraded fallback | yes, as `controlPlaneRecoveryEligible` participation | `ControlPlaneReadinessService` | formation forces direct-publication planning source; routing uses the canonical participation snapshot |
| target storage admission | yes | yes unless the prechecked result is reused | `ProvisioningAdmissionPolicy` | unversioned decision payload |
| live ledger self-move interlock | yes | yes | authoritative `replica_operations` observation | no handoff generation; queried twice |
| ledger observation availability | **no: unavailable can collapse to empty** | yes when operation persistence/read confirmation executes | `ReplicaOperationRepository` / system-table gateway | owner read outcome has no admitted handoff identity |
| `replica_operations-p1` routed-write availability | **no** | **yes** | `QueryExecutor` canonical leader plus control-plane participation | current routing snapshot/readiness generation |
| deterministic child operation identity | generated after formation | yes | schema provisioning job owner | `schema-job:<job>:operation:<node>` |
| durable terminal winner | no | yes on retry/collision resolution | authoritative `replica_operations` row | operation id and terminal workflow state |

## Required repair boundary

The existing application-write formation owner must consume one canonical
replica-operation admission observation that includes both ledger visibility
and the actual routed mutation dependency, then the effect boundary must
revalidate that same semantic authority (or return a typed pre-effect
refusal). Merely waiting longer, retrying CREATE, or strengthening the test
would leave the owner mismatch intact.
