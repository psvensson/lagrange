# Scenario Predictability and Harness Convergence Sprint (AGPL)

## Goal

Use the remaining runtime-hotspot work to make the system more understandable
and predictable at the boundaries that drive distributed-harness outcomes.

The primary goal is not a lower metric number by itself. The goal is a runtime
whose named harness scenarios converge green more reliably and whose failures
explain themselves through one canonical diagnostic story when they do not.

## Current Status

As of 2026-04-19:

1. The admin observability/discovery package remains complete for this sprint
   pass. The current cognitive report still has no remaining `/src/admin/`
   violations.
2. The query-executor follow-on pass is complete and verified on focused query
   coverage.
3. The repo cognitive ratchet is currently green at `138/146` violations.
4. The full reuse-first priority tranche is now complete:
   canonical leader routing, partition CDC, control-plane
   publication/provisioning contract reuse, and rebalancer visibility reuse.
5. The full reuse-first tranche is verified on focused owner-path tests plus
   repo metrics.
6. The reuse-first tranche package files are now closed under `done-...`
   filenames to match the sprint state mechanically.
7. The latest `node-join-under-load` reruns exposed the next architectural
   gap: cache-only or timing-sensitive observation still leaks into
   topology-settling and replica-operation confirmation boundaries.
8. A new architecture-convergence tranche is now prioritized ahead of broad
   harness closure so the next fixes reduce the number of possible runtime
   interpretations instead of only patching scenario symptoms.
9. The active authoritative-observation package has now landed both
   endpoint blocker revalidation and owner-persisted deferred
   replica-operation confirmation on focused proof, and the closure deep dive
   did not find another live local blocker interpreter on that boundary.
   Named harness evidence remains the final closure gate for that package.
10. The membership-publication unification package is now active. Its first
    slice extracted node-state publication into a dedicated runtime owner, its
    second slice routed join admission writes for `nodes`, `node_endpoints`,
    and `service_endpoints` through a composed membership publication runtime
    owner, its third slice routes steady-state
    `control_plane_publications` through that same owner surface, and its
    fourth slice unifies publication diagnostics and harness-facing readiness
    evidence behind one readiness-owned publication story. Named harness
    evidence remains the final closure gate for that package.
11. A new reasoning-closure tranche is now added ahead of the remaining
    broad hotspot follow-ons so the next work reduces semantic drift
    directly: one canonical readiness ladder, one publication-acknowledgement
    gate story, tighter partition-leader ownership, transport-semantic
    isolation, and explicit deletion of shadow grammars.
12. The first reasoning-closure slice is already active in this sprint pass:
    bootstrap readiness probes now surface one canonical readiness-stage
    ladder from publication, acknowledgement, recovery, and traffic evidence,
    and harness bootstrap-readiness normalization preserves that stage for
    diagnostics.
13. The publication acknowledgement and recovery-gate cutover slice is now
    landed on focused proof: one shared `publicationRecoveryGate` snapshot now
    drives readiness, startup-authority, recovery-protocol, and harness
    closure diagnostics instead of adjacent local ACK/spread interpreters.
14. The partition-leader owner-row convergence cutover slice is now landed on
    focused proof: touched partition-routing paths distinguish owner-row truth
    from owner-row lag/staleness explicitly and no longer widen owner-missing
    routing from service-role leader witnesses.
15. The transport semantic-isolation slice is now landed on focused proof:
    router/query transport outcomes are normalized into one typed semantic
    contract, readiness preserves typed local transport diagnostics, and
    seed-side owner-read diagnosis no longer depends on raw router error text
    or authoritative-first stale service ownership.
16. The shadow-grammar deletion slice is now landed on focused proof:
    readiness planning answers retain the shared gate instead of rebuilding
    activity from reason-code bags, bootstrap readiness consumes gate-owned ACK
    state, and rebalancer priority blockers now use shared gate evidence
    instead of adjacent local spread-gap branches.
17. The remaining architecture-convergence packages are now code-complete on
    focused proof: replica semantic phases, partition write-kernel split,
    transport delivery contract hardening, and legacy-path deletion.
18. Replica-operation read paths now expose one semantic phase and witness
    grammar across repository, liveness, unified rebalancer, and dispatch
    ownership diagnostics.
19. `PartitionService` write/apply flow now routes through
    `partition-write-kernel`, and replica removal cleanup is proven to remain
    replayable without making durable truth ambiguous.
20. Transport-local delivery normalization now owns ACK-versus-response
    semantics for router, join publication, service dispatch, and rebalancer
    dispatch boundaries. Harness reruns are the next step.
21. A new file-hygiene housekeeping tranche is now prioritized so compressed
    runtime formatting debt and oversized files are removed systematically
    instead of during unrelated feature or bug-fix work.
22. The first housekeeping slice is already landed and verified: the smallest
    compressed runtime tranche is now reformatted in repo style across
    `pressure-governor`, `service-registration-visibility-owner`,
    `native-js-driver`, and `storage-admission-service`, with focused tests
    plus `npm run test:metrics` green.
23. The second compressed-runtime slice is now also complete: the remaining
    tranche-2 targets are reformatted and split into readable helper modules
    where needed, all six files are below the line cap, and the focused
    tranche proof bundle is green.
24. Oversized runtime decomposition tranche 2 is now active. The first
    quick-win reductions are landed and verified for
    `system-table-schemas-constants`, distributed transaction coordinator,
    message-group worker service, move planner, and admin test-run service.
25. The same runtime tranche has now landed another boundary pass for
    `src/index.js`, `src/cli/index.js`,
    `src/bootstrap/join-readiness-evaluator.js`, and
    `src/partition/partition-split-merge-manager.js`. Each file is now below
    the `1500`-line cap, focused subsystem tests are green, and the remaining
    oversized runtime count is down to `22`.
26. The active runtime tranche has now also landed a full runtime-tail split
    for `src/bootstrap/bootstrap-service.js` into
    `bootstrap-service-runtime-methods.js`. The main file is now `1368`
    lines, focused bootstrap proof is green, and the remaining oversized
    runtime count is down to `19`.
27. The same runtime tranche now also splits
    `src/partition/managed-split-workflow.js` into
    `managed-split-workflow-state-methods.js` and
    `managed-split-workflow-provisioning-methods.js`. The main workflow owner
    is now `998` lines, the two extracted helpers stay below the cap, focused
    managed-split proof plus `npm run test:metrics` are green, and the
    remaining oversized runtime count is down to `18`.

## Starting Point

Repo-owned guardrails currently hold at:

1. cognitive complexity threshold `20`: `130` violations
2. circular dependencies: `0` cycle groups
3. duplication: `11` clone groups and `281` duplicated lines

The remaining work is still concentrated in scenario-driving owners:

1. admin observability and discovery for `admin-query-smoke` and
   `diag-admin-discovery`
2. partitioning and query execution for `node-join-under-load`,
   `seven-node-load-during-partitioning`,
   `seven-node-read-write-load-distribution`,
   `seven-node-read-write-load-transaction-recovery`,
   `seven-node-table-partition-distribution`, and
   `seven-node-postgres-baseline-partition-split`
3. control-plane readiness and message delivery for `rolling-restart`,
   `seed-restart-under-load`, `node-join-under-load`, and the seven-node
   recovery lanes

## Sprint Umbrella

1. [Admin observability and discovery predictability](../packages/active-20260413-admin-control-snapshot-follow-on-cognitive-complexity-reduction.md)
2. [Partition and query routing predictability](../packages/active-20260413-partition-and-query-cognitive-complexity-reduction.md)
3. [Control-plane readiness and message delivery predictability](../packages/active-20260413-control-plane-and-transport-cognitive-complexity-reduction.md)

## Reuse-First Priority Tranche

1. [Canonical leader routing reuse cutover](../packages/done-20260419-canonical-leader-routing-reuse-cutover.md)
2. [Partition CDC owner cutover](../packages/done-20260419-partition-cdc-owner-cutover.md)
3. [Control-plane publication and provisioning contract reuse cutover](../packages/done-20260419-control-plane-publication-and-provisioning-contract-reuse-cutover.md)
4. [Rebalancer visibility reuse cutover](../packages/done-20260419-rebalancer-visibility-reuse-cutover.md)

## Architecture-Convergence Tranche

1. [Authoritative observation and topology blocker cutover](../packages/active-20260419-authoritative-observation-and-topology-blocker-cutover.md)
2. [Membership publication runtime owner unification](../packages/active-20260419-membership-publication-runtime-owner-unification.md)
3. [Replica workflow semantic phase simplification](../packages/done-20260419-replica-workflow-semantic-phase-simplification.md)
4. [Replica enactment and partition-kernel split](../packages/done-20260419-replica-enactment-and-partition-kernel-split.md)
5. [Transport delivery contract and response-correlation hardening](../packages/done-20260419-transport-delivery-contract-and-response-correlation-hardening.md)
6. [Legacy path deletion and proof hardening](../packages/done-20260419-legacy-path-deletion-and-proof-hardening.md)

## Reasoning-Closure Tranche

1. [Canonical readiness ladder and admission closure](../packages/active-20260419-canonical-readiness-ladder-and-admission-closure.md)
2. [Publication acknowledgement and recovery-gate single-owner cutover](../packages/active-20260419-publication-acknowledgement-and-recovery-gate-single-owner-cutover.md)
3. [Partition leader owner-row convergence hardening](../packages/active-20260419-partition-leader-owner-row-convergence-hardening.md)
4. [Transport semantic isolation from readiness and workflow](../packages/active-20260419-transport-semantic-isolation-from-readiness-and-workflow.md)
5. [Shadow-grammar deletion across readiness, bootstrap, and rebalancer](../packages/active-20260419-shadow-grammar-deletion-across-readiness-bootstrap-and-rebalancer.md)

## File-Hygiene Housekeeping Tranche

1. [Compressed runtime reformat tranche 1](../packages/done-20260419-compressed-runtime-reformat-tranche-1.md)
2. [Compressed runtime reformat tranche 2](../packages/done-20260419-compressed-runtime-reformat-tranche-2.md)
3. [Oversized runtime decomposition tranche 1](../packages/todo-20260419-oversized-runtime-decomposition-tranche-1.md)
4. [Oversized runtime decomposition tranche 2](../packages/active-20260419-oversized-runtime-decomposition-tranche-2.md)
5. [Test and harness file decomposition](../packages/todo-20260419-test-and-harness-file-decomposition.md)
6. [File-hygiene exemption policy and enforcement](../packages/todo-20260419-file-hygiene-exemption-policy-and-enforcement.md)

## Sequenced Follow-On Packages

1. [Query executor boundary decompression and formatting](../packages/todo-20260418-query-executor-boundary-decompression-and-formatting.md)
2. [Partition service boundary decompression and formatting](../packages/todo-20260418-partition-service-boundary-decompression-and-formatting.md)
3. [Query executor routing and delivery owner split](../packages/todo-20260418-query-executor-routing-and-delivery-owner-split.md)
4. [Message router connection authority and outbound registry owner split](../packages/todo-20260418-message-router-connection-authority-and-outbound-registry-owner-split.md)
5. [Control-plane readiness startup authority and transition owner extraction](../packages/todo-20260418-control-plane-readiness-startup-authority-and-transition-owner-extraction.md)
6. [Partition split-routing extraction from partition service](../packages/todo-20260418-partition-split-routing-extraction-from-partition-service.md)

## Acceptance Model

1. Each package must name the owner boundaries it is simplifying and the
   harness scenarios that should become easier to understand, keep green, or
   triage.
2. Touched boundaries must emit one canonical outcome and reasons instead of
   parallel fallback stories.
3. Validation follows the harness ladder: targeted owner-path tests first,
   then focused scenario evidence for the named lane, then `npm run test:metrics`.
4. Metrics remain a hard guardrail, but they are secondary acceptance evidence
   for this sprint.

## Execution Order

1. Execute the reuse-first priority tranche before any remaining older
   follow-on package sequencing.
2. Execute the new architecture-convergence tranche before broad named harness
   closure.
3. Execute the reasoning-closure tranche immediately after the current active
   observation/publication cutovers and before the remaining large-owner
   decomposition follow-ons.
4. Execute the file-hygiene housekeeping tranche before resuming older broad
   follow-on decomposition packages so subsequent edits happen in readable,
   bounded files.
5. Use existing shared helpers and contracts first; only extract new owners
   when no canonical reusable boundary already exists.
6. After each slice, reassess the residual hotspot to decide
   whether more decomposition is still warranted.
7. Prefer focused named scenario reruns over broad ad-hoc distributed reruns.

## Exit Check

1. The three package lanes have explicit owner contracts and canonical
   diagnostics tied to named harness scenarios.
2. The touched scenario families either run green or fail with one clear typed
   blocker story that matches the emitted diagnostics.
3. `npm run test:metrics` stays green with zero cycles and no duplication
   regression.
