# Edition Matrix

Lagrange is one product - a distributed runtime for data-intensive
services. Editions allocate complete core capabilities and separate
organizational services by implementation home; they are not competing
execution paths or alternative product lines.

**Standing product boundary (2026-11-01):** Community/AGPL includes working
latency groups, efficient regional placement/routing/replication/failover,
ordinary operating policies and their enforcement, useful security and
observability, and usable backup/restore/PITR mechanisms when implemented.
Enterprise purchases recurring operations, governance, integrations and
evidence across deployments; it does not unlock correctness, locality or
recovery. One canonical core owner handles physical placement, security,
replication, recovery and service lifecycle regardless of edition. A commercial
control plane cannot become necessary for those safety obligations.

Lagrange Images and Lagrange Object Environment are optional, independently
maintained development-environment companions. Lagrange Enterprise must work
without either; optional integrations can consume the same public contracts.
Their repository licences are separate decisions, not changed by this matrix.

This document is the canonical mapping from feature area to edition and
implementation home. Release homes follow the single numbered sequence in
[the roadmap](roadmap.md). A broad feature area can have separately named
outcomes in several releases; each outcome is assigned explicitly below and in
the product planning surfaces. A release assignment does not alter edition
ownership or authorize external commercial work in this repository.

The published baseline is 0.4.0. Selected correctness, installed-product,
publication and claim repairs belong to 0.4.1; remaining Queryable Core,
practical-service/comparison and inherited stable-core acceptance belongs to
0.5 alongside Hono and pilot qualification. Earlier unfinished implementation and acceptance obligations
carry forward; the 2026-11-01 edition correction supersedes the previously
overbroad paid allocations without changing historical roadmap IDs. Independently proved bounded repairs may ship in 0.4.1
without completing the broader 0.5 outcome. Delivered work and applicable
original evidence remain credited.

Implementation rule:

- Only rows whose `Implementation home` is `AGPL repo` may drive specs, tasks,
  or code in this repository.
- Rows mapped to `External / commercial` are visibility-only here.

| Feature area | Edition | Implementation home | Release home | Canonical roadmap or backlog | May drive work in this repo? | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Topology workflow stabilization | Community | AGPL repo | 0.4.1 bounded current repairs; 0.5 unfinished inherited completion; production guarantees in 1.0 | AGPL feature map (agent steering) | Yes | Core control-plane stabilization |
| Distributed transactions | Community | AGPL repo | 0.4.1 bounded current repairs; 0.5 unfinished inherited completion and locking reads; production invariants in 1.0 | AGPL feature map (agent steering) | Yes | Core database capability |
| Schema migration workflow | Community | AGPL repo | 0.4.1 bounded current repairs; 0.5 unfinished inherited completion; supported recovery in 1.0 | AGPL feature map (agent steering) | Yes | Core database capability |
| Operational visibility basics | Community | AGPL repo | 0.5 unfinished inherited completion and pilot view; service contributions in 0.9 | AGPL feature map (agent steering) | Yes | Metrics, diagnostics, admin visibility |
| Standard observability and exports | Community | AGPL repo | 0.5 pilot diagnostics; 0.9 service contribution/export contracts | AGPL feature map (agent steering) | Yes | Usable metrics, tracing, Prometheus/OpenTelemetry-compatible export and placement/traffic explanations; no paid requirement for diagnosing core behavior |
| Managed observability and fleet reporting | Pro | External / commercial | 0.9 managed contributions; 1.2 organizational operation | Cross-edition visibility plus external paid backlog | No | Hosted or centrally managed retention, fleet analytics, custom reporting, support and organizational workflows |
| Failure simulations | Community | AGPL repo | 0.4.1 bounded repair proof; 0.5, 1.0 and 2.0 acceptance workloads | AGPL feature map (agent steering) | Yes | Test and resilience work |
| Cluster deployment experience | Community | AGPL repo | 0.5 | AGPL feature map (agent steering) | Yes | Community operator UX |
| Developer workflow and debugging | Community | AGPL repo | 0.5 | AGPL feature map (agent steering) | Yes | Community developer experience |
| System service foundations | Community | AGPL repo | 0.6 minimum; 0.9 complete lifecycle; 1.0 support | AGPL feature map (agent steering) | Yes | Shared substrate remains in scope here even when it enables paid services |
| Backup / restore / PITR mechanisms | Community | AGPL repo | 0.5 honest pilot export/reload and recovery envelope; 1.0 supported backup/restore/PITR | AGPL feature map (agent steering) | Yes | Usable recovery and integrity mechanisms with explicit semantics; replica snapshots are not user backups |
| Verified recovery operations | Pro | External / commercial | 1.0 first supported recovery assurance; 1.2 fleet governance | Cross-edition visibility plus external paid backlog | No | Scheduled isolated restores, application checks, measured recovery evidence, retention, fleet coverage and operational responsibility |
| PostgreSQL compatibility | Community | AGPL repo | 0.4.1 bounded current repairs; 0.5 unfinished inherited semantics and driver certification; 1.1 breadth | AGPL feature map (agent steering) | Yes | Community database compatibility |
| Core security and supported tenancy | Community | AGPL repo | 0.5 secure pilot floor; 1.0 supported operation; 1.2 core tenant/resource isolation when claimed | AGPL feature map (agent steering) | Yes | Authentication, encryption, ordinary authorization/roles, audit events, capability enforcement, and isolation/quotas required by supported use |
| Organizational identity and governance | Enterprise | External / commercial | 1.2 | Cross-edition visibility plus external paid backlog | No | SSO/SCIM/group synchronization, delegated policy and approval workflows, centralized audit retention and enterprise KMS/secrets integrations |
| Regional efficiency and replication | Community | AGPL repo | 0.5 actual latency-group/pilot envelope; 1.0 qualified core reliability; 1.2 named cross-region profiles; 2.0 advanced cost-aware placement | AGPL feature map (agent steering) | Yes | No region unlock: group measurement, locality, safe replication/failover, topology constraints and traffic efficiency use canonical core owners |
| Regional organizational policy and cost governance | Enterprise | External / commercial | 1.2 governed policy, billing and fleet administration; 2.0 advanced financial advice | Cross-edition visibility plus external paid backlog | No | Approvals, residency evidence, provider prices/bill reconciliation, chargeback, change reviews and measured financial outcomes, without a second placement planner |
| Production guarantees | Community | AGPL repo | 1.0 | AGPL feature map (agent steering) | Yes | Includes Raft snapshot/log lifecycle, supported scale profiles, balance/convergence SLOs, certification, and supported user backup/restore/PITR; paid recovery assurance is separate |
| Multi-stage distributed plans | Community | AGPL repo | 2.0 | AGPL feature map (agent steering) | Yes | Community query execution platform |
| Advanced runtime services | Community | AGPL repo | 0.6 native calls; 2.0 advanced execution; 2.1 search | AGPL feature map (agent steering) | Yes | Runtime substrate and community service capabilities |
| External kernel platform API | Community | AGPL repo | 0.6 required minimum; 0.9 stable installable-service API | AGPL feature map (agent steering) | Yes | Public service-platform contract work |
| Enterprise operations integrations | Enterprise | External / commercial | 1.2; generic integration contracts in 0.9 | Cross-edition visibility plus external paid backlog | No | Organization policy/approval, supported KMS/secrets providers, fleet lifecycle and cost/billing integration; no alternate scheduler, recovery engine or service manager |
| Installable service ecosystem core | Community | AGPL repo | 0.9; native artifact store extension in 2.0 | AGPL feature map (agent steering) | Yes | Package registry, install UX, SQL/CLI surface, immutable revisions, safe upgrade and rollback |
| Governed application release operations | Enterprise | External / commercial | 1.2 | Cross-edition visibility plus external paid backlog | No | Approval, fleet rollout, publisher policy, revision inventory and retained provenance across applications and installations |
| Optional development-environment companions | AGPL-intended separate projects | External open-source companions; generic host/integration contracts in AGPL repo | 0.9 generic service interfaces; companion milestones are independent | AGPL feature map for generic integration only; companion repositories for their own features | No, except separately classified core integration rows | Lagrange Images and Lagrange Object Environment are never runtime or Enterprise prerequisites; their current licence declarations require separate repository reconciliation |
| Licensing and edition gating | Pro / Enterprise | External / commercial | 0.9 | Cross-edition visibility plus external paid backlog | No | Commercial activation and entitlement checks |
| Data-local AI processing | TBD | Not yet classified | 2.1; edition classification required before implementation | Cross-edition visibility only | No | Do not implement until edition and implementation home are assigned |
| Queryable Core | Community | AGPL repo | 0.4.1 bounded current correctness repairs; 0.5 unfinished completion; global uniqueness in 1.0; SQL breadth in 1.1 | AGPL feature map (agent steering) | Yes | Ordered keys, local/global access paths, locking reads and live queries; implemented work and applicable evidence remain credited; edition ownership is unchanged |
| Practical service core and comparisons | Community | AGPL repo | 0.4.1 bounded correctness/claim repairs; 0.5 Hono/Fetch, unfinished service acceptance and qualified comparisons; 2.0 full Scenario B | AGPL feature map (agent steering) | Yes | Existing service/comparison owners retain their contracts and evidence; the standard HTTP successor owns the application boundary |
| Core peer trust and encrypted transport | Community | AGPL repo | 0.5 | AGPL feature map (agent steering) | Yes | Minimum node authentication/encryption belongs to every edition, distinct from enterprise identity and tenancy |
| Transport-independent networking | Community | AGPL repo | 0.7 N0/N1, NATS and static timing; 0.8 Veilid; 2.0 advanced policy | AGPL feature map (agent steering) | Yes | Each backend must support standalone complete-cluster operation; mixed transports are optional 2.0 scope |
| Specialized search and embedding substrate | Community | AGPL repo | 2.1 | AGPL feature map (agent steering) | Yes | Preserves the Community advanced-runtime substrate classification; data-local AI product classification remains separate |
