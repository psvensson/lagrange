# Architecture Support Documents

This directory contains the current architecture index and supporting
system-description documents.

[`INDEX.md`](INDEX.md) is the canonical architecture entrypoint. The root
[`architecture.md`](../architecture.md) file remains a compatibility pointer
for existing links.
Canonical repo-relative path: `architecture/INDEX.md`.

Add detailed subsystem documents here only when the material is architectural
and link them from `INDEX.md`.

## Diagram Packs

- [Lagrange Architecture Diagrams](lagrange_architecture_diagrams.md)
- [Lagrange Advanced Architecture Diagrams](lagrange_advanced_architecture_diagrams.md)

These two files are the primary visual architecture references and should stay
aligned with the ownership and execution model in `INDEX.md`.

## Current Supporting Documents

- [Architecture Models](models/)
- [Core System Logic Contract](contracts/core-system-logic.md)
- [Readiness Handoff Liveness Contract](contracts/readiness-handoff-liveness.md)
- [Lagrange Kernel Platform API v0](lagrange-kernel-platform-api-v0.md)
- [Lagrange Service Manifest](lagrange-service-manifest.md)
- [Lagrange Service Registry](lagrange-service-registry.md)

## Future Architecture

The `future/` subdirectory contains forward-looking architecture documents
for planned features. When a feature moves to in-progress, promote its
document to this directory and link from `INDEX.md`.

- [Activation-Cost-Aware Placement](future/activation-cost-aware-placement.md)
- [Native Artifact Store](future/native-artifact-store.md)
