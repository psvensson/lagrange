# Edition Matrix

Lagrange is one product - a distributed runtime for data-intensive
services. Editions slice that one product's feature areas by edition and
implementation home; they are not separate product lines or alternate
evolutionary paths.

This document is the canonical mapping from feature area to edition and
implementation home. Release homes follow the single numbered sequence in
[the roadmap](roadmap.md). A broad feature area can have separately named
outcomes in several releases; each outcome is assigned explicitly below and in
the product planning surfaces. A release assignment does not alter edition
ownership or authorize external commercial work in this repository.

Implementation rule:

- Only rows whose `Implementation home` is `AGPL repo` may drive specs, tasks,
  or code in this repository.
- Rows mapped to `External / commercial` are visibility-only here.

| Feature area | Edition | Implementation home | Release home | Canonical roadmap or backlog | May drive work in this repo? | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Topology workflow stabilization | Community | AGPL repo | 0.2.9; production guarantees in 1.0 | AGPL feature map (agent steering) | Yes | Core control-plane stabilization |
| Distributed transactions | Community | AGPL repo | 0.2.9; locking reads in 0.3; production invariants in 1.0 | AGPL feature map (agent steering) | Yes | Core database capability |
| Schema migration workflow | Community | AGPL repo | 0.2.9; supported recovery in 1.0 | AGPL feature map (agent steering) | Yes | Core database capability |
| Operational visibility basics | Community | AGPL repo | 0.2.9; pilot view in 0.5; service contributions in 0.9 | AGPL feature map (agent steering) | Yes | Metrics, diagnostics, admin visibility |
| Advanced observability | Pro | External / commercial | 0.9 | Cross-edition visibility plus external paid backlog | No | Prometheus, tracing, heatmaps, advanced runtime traces |
| Failure simulations | Community | AGPL repo | 0.2.9, 0.4, 0.5, 1.0 and 2.0 acceptance workloads | AGPL feature map (agent steering) | Yes | Test and resilience work |
| Cluster deployment experience | Community | AGPL repo | 0.5 | AGPL feature map (agent steering) | Yes | Community operator UX |
| Developer workflow and debugging | Community | AGPL repo | 0.5 | AGPL feature map (agent steering) | Yes | Community developer experience |
| System service foundations | Community | AGPL repo | 0.6 minimum; 0.9 complete lifecycle; 1.0 support | AGPL feature map (agent steering) | Yes | Shared substrate remains in scope here even when it enables paid services |
| Backup / Restore / PITR | Pro | External / commercial | 1.0 | Cross-edition visibility plus external paid backlog | No | First-party paid system service |
| PostgreSQL compatibility | Community | AGPL repo | 0.2.9 semantics; 0.5 driver certification; 1.1 breadth | AGPL feature map (agent steering) | Yes | Community database compatibility |
| Security and tenancy | Enterprise | External / commercial | 1.2 | Cross-edition visibility plus external paid backlog | No | Tenant isolation, RBAC, enterprise security controls |
| Cross-region replication | Enterprise | External / commercial | 1.2 | Cross-edition visibility plus external paid backlog | No | Enterprise durability and replication feature set |
| Production guarantees | Community | AGPL repo | 1.0 | AGPL feature map (agent steering) | Yes | Includes Raft snapshot/log lifecycle, supported scale profiles, balance/convergence SLOs, and certification; excludes user backup/restore/PITR |
| Multi-stage distributed plans | Community | AGPL repo | 2.0 | AGPL feature map (agent steering) | Yes | Community query execution platform |
| Advanced runtime services | Community | AGPL repo | 0.6 native calls; 2.0 advanced execution; 2.1 search | AGPL feature map (agent steering) | Yes | Runtime substrate and community service capabilities |
| External kernel platform API | Community | AGPL repo | 0.6 required minimum; 0.9 stable installable-service API | AGPL feature map (agent steering) | Yes | Public service-platform contract work |
| Enterprise platform API extensions | Enterprise | External / commercial | 1.2; integration contracts in 0.9 | Cross-edition visibility plus external paid backlog | No | Policy provider and secrets/KMS integrations |
| Installable service ecosystem core | Community | AGPL repo | 0.9; native artifact store extension in 2.0 | AGPL feature map (agent steering) | Yes | Package registry, install UX, SQL/CLI surface |
| Licensing and edition gating | Pro / Enterprise | External / commercial | 0.9 | Cross-edition visibility plus external paid backlog | No | Commercial activation and entitlement checks |
| Data-local AI processing | TBD | Not yet classified | 2.1; edition classification required before implementation | Cross-edition visibility only | No | Do not implement until edition and implementation home are assigned |
| Queryable Core | Community | AGPL repo | 0.3; global uniqueness in 1.0; SQL breadth in 1.1 | AGPL feature map (agent steering) | Yes | Ordered keys, local/global access paths, locking reads and live queries; existing edition ownership is unchanged |
| Practical service core and comparisons | Community | AGPL repo | 0.4 Scenario A; 2.0 full Scenario B | AGPL feature map (agent steering) | Yes | Bounded public service capabilities and independently qualified comparative evidence |
| Core peer trust and encrypted transport | Community | AGPL repo | 0.5 | AGPL feature map (agent steering) | Yes | Minimum node authentication/encryption belongs to every edition, distinct from enterprise identity and tenancy |
| Transport-independent networking | Community | AGPL repo | 0.7 N0/N1, NATS and static timing; 0.8 Veilid; 2.0 advanced policy | AGPL feature map (agent steering) | Yes | Each backend must support standalone complete-cluster operation; mixed transports are optional 2.0 scope |
| Specialized search and embedding substrate | Community | AGPL repo | 2.1 | AGPL feature map (agent steering) | Yes | Preserves the Community advanced-runtime substrate classification; data-local AI product classification remains separate |
