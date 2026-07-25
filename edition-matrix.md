# Edition Matrix

This document is the canonical mapping from feature area to edition and
implementation home.

Implementation rule:
- Only rows whose `Implementation home` is `AGPL repo` may drive specs, tasks,
  or code in this repository.
- Rows mapped to `External / commercial` are visibility-only here.

| Feature area | Edition | Implementation home | Canonical roadmap or backlog | May drive work in this repo? | Notes |
|--------------|---------|---------------------|------------------------------|------------------------------|-------|
| Topology workflow stabilization | Community | AGPL repo | `roadmap.md` | Yes | Core control-plane stabilization |
| Distributed transactions | Community | AGPL repo | `roadmap.md` | Yes | Core database capability |
| Schema migration workflow | Community | AGPL repo | `roadmap.md` | Yes | Core database capability |
| Operational visibility basics | Community | AGPL repo | `roadmap.md` | Yes | Metrics, diagnostics, admin visibility |
| Advanced observability | Pro | External / commercial | `product-roadmap.md` plus external paid backlog | No | Prometheus, tracing, heatmaps, advanced runtime traces |
| Failure simulations | Community | AGPL repo | `roadmap.md` | Yes | Test and resilience work |
| Cluster deployment experience | Community | AGPL repo | `roadmap.md` | Yes | Community operator UX |
| Developer workflow and debugging | Community | AGPL repo | `roadmap.md` | Yes | Community developer experience |
| System service foundations | Community | AGPL repo | `roadmap.md` | Yes | Shared substrate remains in scope here even when it enables paid services |
| Backup / Restore / PITR | Pro | External / commercial | `product-roadmap.md` plus external paid backlog | No | First-party paid system service |
| PostgreSQL compatibility | Community | AGPL repo | `roadmap.md` | Yes | Community database compatibility |
| Security and tenancy | Enterprise | External / commercial | `product-roadmap.md` plus external paid backlog | No | Tenant isolation, RBAC, enterprise security controls |
| Cross-region replication | Enterprise | External / commercial | `product-roadmap.md` plus external paid backlog | No | Enterprise durability and replication feature set |
| Production guarantees | Community | AGPL repo | `roadmap.md` | Yes | Includes Raft snapshot/log lifecycle, supported scale profiles, balance/convergence SLOs, and certification; excludes user backup/restore/PITR |
| Multi-stage distributed plans | Community | AGPL repo | `roadmap.md` | Yes | Community query execution platform |
| Advanced runtime services | Community | AGPL repo | `roadmap.md` | Yes | Runtime substrate and community service capabilities |
| External kernel platform API | Community | AGPL repo | `roadmap.md` | Yes | Public service-platform contract work |
| Enterprise platform API extensions | Enterprise | External / commercial | `product-roadmap.md` plus external paid backlog | No | Policy provider and secrets/KMS integrations |
| Installable service ecosystem core | Community | AGPL repo | `roadmap.md` | Yes | Package registry, install UX, SQL/CLI surface |
| Licensing and edition gating | Pro / Enterprise | External / commercial | `product-roadmap.md` plus external paid backlog | No | Commercial activation and entitlement checks |
| Data-local AI processing | TBD | Not yet classified | `product-roadmap.md` only | No | Do not implement until edition and implementation home are assigned |
