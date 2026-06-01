# Roadmap Runtime Truth And AGPL Boundary Closure

## Why

The roadmap and architecture docs were ahead of current runtime truth. Phase
0.1 failure-simulation rows looked complete even though the active sprint still
uses `rolling-restart` as a failing representative gate, and service-platform
architecture examples used commercial features without enough AGPL boundary
wording.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` truth-maintenance scope and edition
matrix AGPL implementation-home rules.

Sprint:

1. [Roadmap runtime truth and boundary closure](../sprints/archived/done-2026-q2-roadmap-runtime-truth-and-boundary-closure.md)

## In Scope

1. Rebaseline Phase 0.1 roadmap status to distinguish capability existence
   from representative gate proof.
2. Mark rolling restart under load, priority recovery progress, and
   metadata-gateway audit closure as open Phase 0.1 exit blockers.
3. Clarify that paid-feature examples in service-platform architecture docs are
   external consumer examples, not AGPL implementation tasks.
4. Create first-class follow-on packages for guardrail, decomposition, and
   naming work.

## Out Of Scope

1. Runtime behavior changes.
2. Pro or Enterprise implementation work.
3. Entitlement, RBAC, tenancy, KMS, secrets, backup, or PITR behavior.
4. Full CLI/package rename implementation.

## Invariants

1. `roadmap.md` remains the only AGPL implementation roadmap.
2. `edition-matrix.md` remains the canonical implementation-home map.
3. Architecture examples must not create AGPL tasks for commercial rows.

## Hotspots

1. `roadmap.md`
2. `architecture/lagrange-kernel-platform-api-v0.md`
3. `architecture/lagrange-service-registry.md`
4. `architecture/lagrange-service-manifest.md`
5. `work/sprints/`
6. `work/packages/`

## Static Drift Ledger

Preflight:

- [x] Relevant guardrails selected by boundary: docs-only package, so
      `git diff --check` plus steering pack regeneration are the relevant
      closure guards.
- [x] Inherited repo-wide debt classified: static runtime guard failures are
      tracked by follow-on packages and not modified here.
- [x] Inherited touched-file debt classified: existing roadmap/worktree edits
      are preserved.
- [x] File-scoped or boundary-scoped baseline recorded: current active sprint
      and work packages identify `rolling-restart` as the active representative
      gate.

Closure:

- [x] Same guardrails rerun after implementation.
- [x] No relevant guardrail count increased by this docs-only package.
- [x] No new touched-file owner-path, decision-boundary, runtime-grammar, or
      metadata-gateway violation remains.
- [x] Out-of-scope inherited static guard failures have linked follow-on
      packages.

## Detection / Analysis Tasks

- [x] Identify roadmap rows whose status was ahead of the active representative
      gate.
- [x] Identify service-platform examples that mention paid-feature areas.
- [x] Identify runtime/static/naming follow-ons that need first-class packages.

## Implementation Tasks

- [x] Add the sprint document.
- [x] Add follow-on packages for metadata-gateway, decision-boundary, literal,
      decomposition, and naming work.
- [x] Update roadmap Phase 0.1 truth/status wording.
- [x] Update architecture boundary wording.

## Residual Closure Inventory

- [x] Static guardrail failures are explicit follow-on packages.
- [x] Runtime owner extraction is tied to the active failure path.
- [x] Commercial examples are fenced as external extension points.
- [x] Naming alignment is tracked as a bounded Phase 0.5 package.

## Validation

1. `git diff --check` on touched docs and work files: passed.
2. `npm run test:metadata-gateway:audit`: failed as expected and recorded in
   the metadata-gateway follow-on package.
3. `npm run audit:guideline:decision-boundaries`: failed with 16 violations,
   recorded in the decision-boundary follow-on package.
4. `npm run audit:guideline:literals`: failed with 6288 violations, recorded in
   the literal ratchet follow-on package.
5. Steering-derived content was not changed by this package, so the LLM pack did
   not need regeneration.

## April 26 Follow-On Update

The static guardrail follow-ons created by this package are now closed:

1. `npm run test:metadata-gateway:audit`: passed.
2. `npm run audit:guideline:decision-boundaries`: passed.
3. `npm run audit:guideline:literals`: passed with 0 new violations against
   the 6285-entry inherited baseline.

## Done When

1. The roadmap no longer implies Phase 0.1 exit closure from capability
   existence alone.
2. Paid-feature examples cannot be read as AGPL implementation tasks.
3. Follow-on packages own the unresolved guardrail and naming work.
