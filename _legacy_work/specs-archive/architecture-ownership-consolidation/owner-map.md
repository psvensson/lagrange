# Owner Map Reference

This is the concise implementation owner map for this spec package.

| Concern | Canonical owner | Current orchestration boundary |
| --- | --- | --- |
| Seed bootstrap phases | Seed phase owners | `BootstrapService` |
| Joining phases | Join phase owners | `NodeJoiningService` |
| Message router setup | `MessageRouterSetup` | Bootstrap/join pipeline phases |
| CDC integration setup and upgrade | `CDCIntegrationSetup` | Bootstrap/join pipeline phases |
| Replica handler setup | `ReplicaHandlerSetup` | Bootstrap/join pipeline phases |
| Control-plane setup composition | `ControlPlaneSetup` | Bootstrap/join pipeline phases |
| Message-group CDC apply path | `CDCHandler` | `MessageGroupService` delegation |
| System cache key descriptor | `SystemCacheKeyDescriptor` module | `SystemTableCache`, `SQLiteSystemCache` |
| Runtime startup wiring | `createRuntimeStartupWiring` | Seed/join startup composition only |

Guardrail tests for this owner map live in
`test/config/architecture-ownership-guardrails.test.js`.
