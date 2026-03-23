# Architecture Support Documents

This directory is for supporting system-description documents that expand on
the root [architecture.md](../architecture.md).

`architecture.md` remains the canonical root entrypoint. Add detailed
subsystem documents here only when the material is architectural and link them
from the root document.

## Diagram Packs

- [Lagrange Architecture Diagrams](lagrange_architecture_diagrams.md)
- [Lagrange Advanced Architecture Diagrams](lagrange_advanced_architecture_diagrams.md)

These two files are the primary visual architecture references and should stay
aligned with the ownership and execution model in `../architecture.md`.

## Current Supporting Documents

- [Lagrange Kernel Platform API v0](lagrange-kernel-platform-api-v0.md)
- [Lagrange Service Manifest](lagrange-service-manifest.md)
- [Lagrange Service Registry](lagrange-service-registry.md)

## Future Architecture

The `future/` subdirectory contains forward-looking architecture documents
for planned features. When a feature moves to in-progress, promote its
document to this directory and link from `architecture.md`.

- [Activation-Cost-Aware Placement](future/activation-cost-aware-placement.md)
- [Native Artifact Store](future/native-artifact-store.md)
