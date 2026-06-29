---
scope: architecture
status: pointer
always_load: false
source_of_truth: self
compiled_pack: docs/steering/llm/architecture.md
last_reviewed: 2026-05-23
---

> **Pointer — not a rule source.** This file only routes architecture-document
> lookups to the canonical tree; it carries no implementation rules of its own.
> The architecture *policy* rules live in `runtime-contracts.md` and the
> `doctrine/` sub-files (which is where the architecture pack's rules come from).
> Do not treat this pointer as a co-equal source of architecture policy.

# Architecture Steering Pointer

## Document Role

This document governs architecture-document lookup only.

Use this file for:

- locating the canonical architecture entrypoint
- understanding where current owner maps and subsystem detail live

Do not use this file for:

- stable implementation rules
- testing policy
- style guidance
- roadmap scope decisions

The canonical architecture entrypoint lives at `../../architecture/INDEX.md`.

Use that index for component ownership, runtime boundaries, and
implementation architecture. Supporting system-description documents may live
under `../../architecture/`, while `../../architecture.md` remains a
compatibility pointer for older links. This steering file exists for
discoverability only.

When architecture changes:
- update `../../architecture/INDEX.md`
- update any affected supporting files under `../../architecture/`
- keep this pointer intact so steering lookups resolve to the canonical file
