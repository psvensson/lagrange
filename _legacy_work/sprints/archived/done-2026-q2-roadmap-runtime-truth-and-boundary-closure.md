# Roadmap Runtime Truth And Boundary Closure Sprint (AGPL)

## Goal

Bring planning, architecture documents, and executable guardrails back into
agreement with current runtime truth before expanding product-facing platform
work.

The sprint target is:

1. distinguish capability existence from representative gate proof
2. make static guardrail failures first-class packages
3. keep Phase 0.1 runtime blockers ahead of service-platform expansion
4. treat oversized runtime files as semantic owner-extraction work
5. make AGPL and commercial extension boundaries explicit in architecture docs

## Why This Sprint Exists

The roadmap and architecture surface currently imply more closure than the
runtime and static guardrails prove:

1. Phase 0.1 says failure simulation work is complete, while the active
   representative gate is still `rolling-restart` under load.
2. The doctrine requires one owner path; decision-boundary, literal-owner, and
   metadata-gateway audits reported violations at sprint start and are now
   closed by executed follow-on packages.
3. Hot runtime owners remain too large to review against the ownership model,
   especially priority recovery and rebalancer files on the current failure
   path.
4. Public naming still leaks legacy `distributed-database-system` and
   `ddb-admin` names while the roadmap presents the `lagrange` operator
   surface.
5. Service-platform architecture docs use paid feature examples that can be
   mistaken for AGPL implementation scope.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` truth-maintenance and
maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Operational visibility`
4. `Production guarantees`

Phase `0.5 - External Usability` scope under:

1. `Cluster Deployment Experience`
2. CLI/package naming needed for the `lagrange` operator path

Edition matrix scope:

1. Community / AGPL rows may drive this sprint.
2. Pro and Enterprise rows may be mentioned only as external consumer examples
   or explicit extension points.

## In Scope

1. Roadmap status rebaseline for Phase 0.1 representative gates.
2. Work packages for metadata-gateway, decision-boundary, literal-owner, and
   priority-recovery decomposition failures.
3. A bounded package for public package/CLI naming alignment.
4. Architecture wording that fences backup/PITR, tenancy/RBAC, KMS/secrets, and
   commercial entitlement examples as external extension points.
5. Sprint-level guardrails that keep service-platform expansion behind Phase
   0.5 basics until the current runtime gate is green.

## Out Of Scope

1. Implementing Pro or Enterprise features.
2. Implementing entitlement checks, RBAC, tenancy, KMS, or backup/PITR logic in
   this repository.
3. Broad runtime refactors without a named owner boundary and file-scoped
   static drift ledger.
4. Making the active rolling-restart gate appear green through harness-only
   exemptions.
5. Renaming every legacy CLI surface in one unbounded pass.

## Representative Gates

Primary Phase 0.1 gate:

1. `rolling-restart` with `test/distributed/config/local.json`

Guardrail gates:

1. `npm run test:metadata-gateway:audit`
2. `npm run audit:guideline:decision-boundaries`
3. `npm run audit:guideline:literals`

Phase 0.5 usability gate after Phase 0.1 blockers stop moving:

1. `lagrange cluster init`
2. `lagrange node start`
3. `lagrange cluster join`
4. one local-cluster getting-started path

## Executed Packages

1. [Roadmap runtime truth and AGPL boundary closure](../../packages/done-20260426-roadmap-runtime-truth-and-agpl-boundary-closure.md)
2. [Metadata gateway audit owner-path closure](../../packages/done-20260426-metadata-gateway-audit-owner-path-closure.md)
3. [Decision-boundary audit closure](../../packages/done-20260426-decision-boundary-audit-closure.md)
4. [Guideline literal debt rebaseline and ratchet](../../packages/done-20260426-guideline-literal-debt-rebaseline-and-ratchet.md)

## Queued Packages

1. [Priority recovery semantic owner extraction](../../packages/todo-20260426-priority-recovery-semantic-owner-extraction.md)
2. [Lagrange package and CLI naming alignment](../../packages/todo-20260426-lagrange-package-and-cli-naming-alignment.md)

## Execution Order

1. Keep the current runtime stability sprint focused on the moving
   `rolling-restart` blocker.
2. Metadata-gateway audit drift closed before broadening owner-path work.
3. The 16 decision-boundary violations closed without remaining owner splits.
4. Literal debt rebaselined with a ratchet so broad counts cannot grow while
   focused owner packages proceed.
5. Extract semantic owners from priority recovery and rebalancer hotspots only
   after the active blocker identifies the owner boundary.
6. Align public package/CLI naming before Phase 0.5 usability work is presented
   as product-ready.

## Sprint Guardrails

1. No Phase 0.1 row is complete from capability existence alone; it needs a
   green representative gate or an explicit open blocker.
2. A package cannot close if its selected static guard count increases.
3. Service-platform work may continue only as AGPL substrate work and must not
   implement external commercial behavior.
4. Large-file work must extract semantic owners with proof, not create more
   arbitrary segment files.
5. Naming changes must preserve existing operator compatibility until an
   explicit migration path is accepted.

## Done When

1. `roadmap.md` separates capability status from representative gate status for
   the open Phase 0.1 blockers.
2. Architecture docs clearly fence paid-feature examples as external extension
   points.
3. Static guardrail failures have executable packages with preflight ledgers.
4. Runtime decomposition work is tied to priority recovery and rebalancer owner
   boundaries on the active failure path.
5. Phase 0.5 naming work has a bounded package and does not hide behind service
   platform expansion.
