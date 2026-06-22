---
scope: architecture
status: canonical
always_load: false
source_of_truth: self
compiled_pack: .kiro/steering/llm/architecture.md
parent_index: ../doctrine/INDEX.md
last_reviewed: 2026-05-23
---

> **Canonical source.** Doctrine sub-file: single path / single contract shape. Index: [`INDEX.md`](INDEX.md).

# Doctrine — Single Path

## 2. One Ingress, Not Many Helpers

There may be multiple semantic owners, but there must not be many equivalent
runtime ingress paths.

- Shared metadata writes flow through semantic owners into one canonical
  mutation ingress.
- Shared metadata reads for a given semantic decision flow through one
  canonical read ingress.
- Query-plane traffic may use a separate ingress from metadata/control-plane
  traffic, but both planes must share the same pressure/admission contract.

The goal is not one giant generic helper. The goal is one structural path per
plane, so backpressure, retry semantics, batching, diagnostics, and admission
rules are universal.

## 3. One Dissemination Path For Shared Metadata

For CDC-propagated metadata, the dissemination path is:

`authoritative partition commit -> CDC -> SystemTableCache -> readers`

Bootstrap may hydrate initial state, but bootstrap code must not remain the
runtime dissemination owner.

If runtime correctness still depends on a phase-owned subscriber, retry loop,
cache patch, or bridge, the design is incomplete.

## 11b. One Contract Shape Per Concern

When the same concern appears as several near-synonymous caches, helpers,
snapshots, or output shapes, the design has already started to drift.

Prefer:

- one operationally authoritative contract per concern
- additional views only when their roles are explicit and non-overlapping
- one declared consumer set per shared surface
- one declared list of forbidden reinterpretations

Do not let observed, published, retained, cached, repaired, or fast-path
variants drift into several interchangeable authorities.

## 12. Normalize Boundary Impedance Once

Storage rows, bootstrap inputs, wire payloads, and transport observations are
evidence gathered at a boundary. They are not the steady-state runtime model.

Prefer:

- one ingress normalizer per boundary
- explicit runtime state variants
- storage and transport details contained at the edge

Do not let row nullability, protocol-specific fields, or bootstrap-only shapes
become semantic runtime contracts inside the system.

## 13. Prefer Named Modes Over Combinable Flags

If callers need to choose between semantic policies, give them one named mode
set owned by the boundary.

Prefer:

- explicit read, write, admission, or lifecycle modes
- invalid combinations made structurally impossible
- diagnostics that emit the resolved named mode

Do not encode semantic policy as independent booleans that callers can combine
into overlapping or contradictory behavior.
