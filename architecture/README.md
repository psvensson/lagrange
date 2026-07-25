# Current Architecture

This directory contains the current architecture index and supporting
system-description documents.

[`INDEX.md`](INDEX.md) is the canonical architecture entrypoint. The root
[`architecture.md`](../architecture.md) file remains a compatibility pointer
for existing links.
Canonical repo-relative path: `architecture/INDEX.md`.

Add detailed subsystem documents here only when the material is architectural
and link them from `INDEX.md`.

## Illustrated Walkthrough

- [The Lagrange System Model](system-model.md) — start here; also defines the
  colour legend shared by every process diagram
- [Process: Partitioning](process-partitioning.md)
- [Process: Replication](process-replication.md)
- [Process: Rebalancing](process-rebalancing.md)
- [Process: Request Routing](process-request-routing.md)
- [Process: Data Affinity](process-data-affinity.md)

These are the primary visual architecture references and should stay aligned
with the ownership and execution model in `INDEX.md`.

## Current Supporting Documents

- [Architecture Models](models/)
- [Core System Logic Contract](contracts/core-system-logic.md)
- [Readiness Handoff Liveness Contract](contracts/readiness-handoff-liveness.md)
- [Lagrange Service Manifest](lagrange-service-manifest.md)
- [Lagrange Service Registry](lagrange-service-registry.md)

Unimplemented designs live under `solve/specs/` and are linked from the
roadmap. Files under `architecture/` describe implemented behavior and current
contracts only.
