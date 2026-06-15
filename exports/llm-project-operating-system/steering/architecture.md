---
scope: architecture
status: canonical
always_load: false
source_of_truth: self
compiled_pack: steering/packs/architecture.md
last_reviewed: 2026-05-23
---

> Method kernel — portable. Keep the mechanism; this file is domain-neutral. Extend it with your project's own rules.

> **Canonical source.** Architecture document tree pointer.

# Architecture Steering Pointer

## Document Role

This document governs architecture-document lookup only.

Use this file for:

- locating the canonical architecture entrypoint
- understanding where owner maps and per-subsystem detail live
- routing to the narrowest relevant domain file before reading any monolith

Do not use this file for:

- stable implementation rules
- testing policy
- style guidance
- roadmap scope decisions

The canonical architecture entrypoint lives at `../architecture/INDEX.md`.

Use that index for component ownership, runtime boundaries, and the
single-path-ownership contract (every piece of state has exactly one owner, and
one authoritative path that writes it). Keep architecture decomposed: a short
INDEX that routes to one domain file per major subsystem / owner boundary,
rather than one monolith. Supporting system-description documents may live
under `../architecture/`. This steering file exists for discoverability only.

The compact, always-on rules compiled from this source live under
`steering/packs/`; cite a contract from a rule when the rule defends an invariant.

When architecture changes:
- update `../architecture/INDEX.md`
- update any affected supporting files under `../architecture/`
- keep this pointer intact so steering lookups resolve to the canonical file
