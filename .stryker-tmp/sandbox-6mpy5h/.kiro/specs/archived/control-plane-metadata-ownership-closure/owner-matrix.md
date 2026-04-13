# Control-Plane Owner Matrix

This matrix is the concrete owner reference for
`control-plane-metadata-ownership-closure`.

## Table Family Matrix

| Table family | Row creation owner | Allowed field owners | Forbidden writers |
| --- | --- | --- | --- |
| `nodes` | `NodeRegistrationOwner` | `NodeRegistrationOwner`, `NodeLifecycleStateMachine` | ad hoc bootstrap/join SQL mutation bodies |
| `node_endpoints` | `NodeEndpointRegistry` | `NodeEndpointRegistry` | transport/discovery code writing endpoint rows directly |
| `service_definitions` | `ServiceDefinitionRegistry` | `ServiceDefinitionRegistry` | discovery/readiness code, bootstrap-only helper logic with standalone writes |
| `service_endpoints` | `ServiceEndpointRegistry` | `ServiceEndpointRegistry`, `RuntimeEndpointWriter` | readiness/discovery code, ad hoc bootstrap/join endpoint writes |
| `services` | `ReplicaStateMachine` | `ReplicaStateMachine`, consensus-role owner | status updaters that insert missing rows, stale-cache repair logic |
| `tables` | `TableTopologyMetadataOwner` | `TableTopologyMetadataOwner` | benchmark-specific or later-created-table custom writers |
| `partitions` | `TableTopologyMetadataOwner` | `TableTopologyMetadataOwner` | partition bootstrap/join special cases outside the owner |
| `replica_operations` | `ReplicaOperationOwner` | `ReplicaOperationOwner` | lifecycle/status mutation outside the owner |

## Shared Owners

| Concern | Canonical owner | Notes |
| --- | --- | --- |
| Control-plane CDC fanout | `CDCGroupPropagationService` | preserves `timestamp` and `causeId`; no zero-target silent success |
| Control-plane cache application | `CDCHandler` | owns ordering, dedupe, watermarks, and cache mutation |
| Pre-subscription cache correctness | `PreSubscriptionCacheHandoffOwner` | generic for all `CDC_PROPAGATED_TABLES`; no per-table direct-cache exceptions |
| Discovery/readiness read model | cache-backed authoritative readers | source tables must match the owner matrix |
| SQL-vs-cache parity diagnostics | generic control-plane parity probe | required for distributed diagnostics and closure tests |

## Invariants

1. Row creation happens exactly once through the row creation owner.
2. Field owners do partial updates only.
3. Non-owners request transitions; they do not synthesize rows.
4. Startup and join may orchestrate owner calls, but they do not become row
   owners themselves.
5. If a propagated row exists in local SQL and not in local cache, the system
   treats that as a correctness failure, not as a slow path.
