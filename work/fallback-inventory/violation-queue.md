# Violation Queue

This file lists classified fallback situations that currently look like system
guideline violations and should be removed or converted.

## Current Queue

| Fallback ID | Concern | Why It Violates The Guidelines | Proposed Direction |
| --- | --- | --- | --- |
| `FB-BS-001` | Bootstrap runtime surface bridge | Bootstrap still accepts several cache/runtime providers for one concern. | Remove the runtimeOwner/startupAdapter bridge and inject one runtime-surface owner. |
| `FB-BS-002` | Bootstrap readiness local snapshot reconstruction | Bootstrap rebuilds readiness-owner truth locally when the shared helper contract is missing. | Expose one readiness-owned helper/snapshot surface and delete the local fallback. |
| `FB-BS-004` | Bootstrap topology snapshot bridge | Join readiness still keeps a secondary topology snapshot instead of one active-node owner surface. | Cut over to one bootstrap topology snapshot owner contract. |
| `FB-CP-001` | Priority recovery planning snapshot | Caller-local timeout and fallback policy duplicates the readiness owner. | Collapse to one best-effort planning snapshot API owned by readiness. |
| `FB-CP-002` | Membership planning epoch | Caller reconstructs planning state from diagnostics instead of consuming one canonical owner surface. | Collapse to one synchronous epoch/plan API. |
| `FB-CP-003` | Membership publication fetch and refresh | Dispatch owns its own publication freshness fallback instead of asking the publication owner for the right row. | Move selection and refresh policy behind the membership-publication owner. |
| `FB-CP-006` | Control-plane SQL mutation startup bridge | A second mutation path still exists for bootstrap/startup callers. | Remove the direct-SQL bridge after startup handoff is complete. |
| `FB-PT-002` | Partition no-raft leader election bridge | PartitionService bypasses the injected raft owner when raft is absent. | Require an explicit raft owner or test double and delete the local leader-election path. |
| `FB-RB-001` | Incomplete operation read-mode policy leak | Repository fallback policy is still caller-tunable for the same semantic read concern. | Expose one repository-owned best-effort read API. |
| `FB-RB-002` | Read-failure cache fallback policy leak | Repository consumers still choose whether authoritative-read failures degrade to cache. | Hide degraded-read policy behind repository-owned surfaces. |

## Notes

1. This queue is derived from `fallback-register.csv`.
2. Do not add an item here unless the register row has
   `guideline_violation=yes`.
3. Rows marked `unclear` in the register stay out of this queue until they are
   either justified or escalated.
