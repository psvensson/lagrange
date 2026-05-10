---
inclusion: always
---

# System Guidelines — Mandatory Rules for All Code Generation

## Document Role

This document governs stable repo-wide implementation rules.

Use this file for:

- durable ownership rules
- single-path execution rules
- cache and communication discipline
- timeout-budget and idempotency rules
- user-model discipline
- mandatory implementation workflow rules

Do not use this file for:

- current concrete owner maps
- workstream-local testing procedure
- style-only rules
- roadmap scope decisions

For adjacent concerns, use:

- [`.kiro/steering/doctrine.md`](doctrine.md)
- [`../../architecture.md`](../../architecture.md)
- [`../../architecture/current-owner-maps.md`](../../architecture/current-owner-maps.md)
- [`.kiro/steering/testing-guidelines.md`](testing-guidelines.md)
- [`.kiro/steering/code-style.md`](code-style.md)
- [`.kiro/steering/roadmap.md`](roadmap.md)
- [`../../work/README.md`](../../work/README.md)

These rules are non-negotiable. Every rule applies to every code change, every
new file, and every refactor. When in doubt, the rule wins.

Read this document together with `.kiro/steering/doctrine.md`. The doctrine
defines the short-form architectural intent; these rules make it enforceable.

---

The system is called lagrange.

## 0.1 Mandatory Work Intake And Package Discipline

All non-trivial implementation work MUST follow the repository work-tracking
workflow.

Mandatory rules:

1. Human ideas start in `work/ideas/` as `idea-YYYYMMDD-slug.md`.
2. Broad or scope-changing ideas MUST sharpen `../../roadmap.md` before active
   implementation starts.
3. In-scope bounded work MUST be executed from a work package in
   `work/packages/`.
4. Active code changes MUST be driven by an `active-...` work package, unless
   the immediate change is the roadmap-sharpening step that creates the
   package.
5. Work packages MUST be one executable concern per file. Do not mix unrelated
   concerns into one package.
6. Package status lives in the filename:
   `idea-`, `todo-`, `active-`, `done-`, `superseded-`.
7. Do not create a second status system in headings, directories, or sidecar
   trackers when the filename already carries status.
8. `docs/` is reserved for end-user or operator-facing documentation. Internal
   planning and execution material MUST live under `work/`.
9. `work/model-ledger.jsonl` MAY record explicit package-level model,
   reasoning-effort, task-class, outcome, validation, correction-loop, and
   review-finding evidence to inform future LLM choice.
10. The model ledger MUST remain advisory. It MUST NOT replace validation,
    review subagents, mandatory package sequencing, package closure, or focused
    commit discipline.

The point of this rule is the same as the rest of this document: one concern,
one owner, one path. Planning must not be allowed to fragment into several
parallel tracking systems any more than runtime logic is.

### 0.1.1 Package Closure And Sprint Archiving

Work-tracking closure is filename-first and must stay mechanically obvious.

Mandatory rules:

1. Close a completed package by renaming its file from `active-...` to
   `done-...`. Do not create a second closure marker inside another tracker to
   compensate for a stale filename.
2. If a package is not being executed yet, rename it to `todo-...`; do not
   leave dormant work in `active-...`.
3. If a package is displaced by newer evidence or another package, rename it to
   `superseded-...` and link the superseding package from the body without
   adding another status marker.
4. Active sprint documents live directly in `work/sprints/`.
5. Close a sprint by renaming it to `done-...` and moving it to
   `work/sprints/archived/`.
6. `work/sprints/` should contain only the live `active-...` and `todo-...`
   sprint files plus the `archived/` folder.
7. When archiving a sprint or closing a package, update in-repo links in the
   same change so the tracker remains navigable.
8. Do not archive package files into a second package-status directory. Package
   status is carried by the filename; sprint archival is the exception used to
   keep the live sprint root small and readable.
9. In a scenario-driven sprint, exactly one package may own the current
   representative re-entry gate at a time.
10. If an `active-...` package is retained only as a dormant residual after the
    representative path migrates away from its boundary, rename it to `todo-...`
    or `superseded-...` before continuing the new representative package.
11. A second `active-...` package is allowed only when it is being executed now
    and has explicitly disjoint file scope, owner scope, and proof scope from
    the current representative package.
12. Every completed work-package slice MUST end in a focused git commit and
    push before the next package slice starts.
13. The commit MUST include only package-owned changes and package-status or
    sprint-handoff updates that belong to that slice. Do not sweep unrelated
    dirty worktree changes into the package commit.
14. Packages closed under the current tracker workflow MUST include a Commit
    And Push Ledger with focused package commit SHA, pushed remote/branch, and
    an explicit `yes` that the commit contains only package-owned files,
    package-status updates, or allowed sprint handoff updates. Historical
    closed-package proof must not be backfilled by invention; if a package is
    reopened, migrated, or closed again, the current proof rules apply.
15. If a push is impossible because no remote is configured, credentials are
    unavailable, or a human explicitly says not to push, stop and ask for human
    direction before continuing to the next package slice.
16. If package-owned and unrelated changes cannot be separated safely, stop and
    ask for human direction instead of committing a mixed slice.

### 0.1.2 Package Closure Deep-Dive Review

Every work package MUST end with a deep-dive review of the affected code area
before the package is renamed to `done-...`, committed, and pushed.

Affected area means:

1. every production file touched by the package
2. the direct owner collaborators of those files
3. the decision, lifecycle, ingress, dissemination, or persistence boundaries
   that those files participate in

Mandatory rules:

1. Before closing a package, read through the affected area as a whole, not
   only the changed lines.
2. Look explicitly for mistakes, irregularities, and architectural drift, not
   only for the narrow package symptom that triggered the change.
3. Audit the affected area against `.kiro/steering/doctrine.md` and this
   document with special focus on:
   - owner bypasses and shadow state
   - duplicate logic or parallel paths
   - fallback behavior and bag-of-`if` decision boundaries
   - `null`/`undefined` domain-state contracts
   - unowned resource lifetime or missing diagnostics
   - mutations that cross row-field or lifecycle ownership boundaries
4. If the deep dive finds a concrete mistake, irregularity, or doctrine/system
   guideline violation inside the affected area, the package is not done until
   that issue is fixed in the same work cycle.
5. Do not leave known doctrine or system-guideline violations in the affected
   area behind as "follow-up cleanup" while still closing the package.
6. If the deep dive reveals a separate concern outside the affected area, open
   a new idea or work package for that concern instead of silently widening the
   current package.

### 0.1.3 Residual Closure Inventory And Boundary Sequencing

Every active package MUST make residual closure explicit so package completion
cannot drift into “hot path fixed, tails later”.

Mandatory rules:

1. Every active package must carry an explicit residual-closure inventory in
   the package file.
2. That inventory must name, at minimum:
   - the direct owner paths being changed
   - the tail consumers and collaborator owners that must be cut over
   - the status, diagnostics, harness, admin, or reporting surfaces that must
     match the new contract
   - the superseded paths, fallbacks, or vocabulary that must be deleted
   - the required proof layers before closure
3. A package may not be renamed to `done-...` while any in-scope residual item
   remains open.
4. “Known residual” is not an acceptable closure state for an in-scope package
   item. Either fix it in the same package, or split it into a new package
   before closure and update links immediately.
5. Do not start a second active package on the same architectural boundary
   while the first package still has unresolved in-scope residuals.
6. If two packages must be worked in parallel on the same broad area, they
   must have explicitly disjoint file and owner scope, or one umbrella package
   must define the sequencing and completion contract for both.
7. Package progress notes must distinguish clearly between:
   - landed hot-path changes
   - remaining residual closures
   - proof already run
   - proof still required

### 0.1.4 Shared Boundary Contract Declaration

When a package adds or reshapes a shared runtime boundary, the package must
carry the boundary contract explicitly instead of leaving reviewers to infer it
from code.

Mandatory rules:

1. The package must name:
   - semantic owner
   - canonical contract shape or vocabulary
   - allowed consumers
   - prohibited reinterpretations
   - primary diagnostics and proof surfaces
2. If the concern has several views, the package must state which view is:
   - operational authority
   - diagnostics-only observation
   - owner-internal retained state
3. If the change is durable rather than bug-local, update
   `architecture/current-owner-maps.md` or the relevant architecture record in
   the same work cycle.
4. If part of the boundary is mechanically checkable, add one bounded static
   guardrail or split that guardrail work into a linked follow-on before
   closure.

### 0.1.5 Failure Migration Recording And Next-Order Blocker Probe

When a package is driven by a failing integration, distributed, load, or
scenario-level blocker, the package must make blocker movement explicit rather
than treating focused green tests as full analysis closure.

Mandatory rules:

1. The active package must name the current dominant blocker for the scenario
   it is trying to close.
2. After focused proof for the current fix is green, rerun the original
   scenario or the narrowest representative blocker probe before treating the
   analysis as closed.
3. If the dominant failure class, reason, or owner seam changes materially,
   update the active package or split a follow-on package in the same work
   cycle.
4. Package progress notes must distinguish clearly between:
   - the blocker that was just reduced
   - the blocker that now dominates
   - the hypothesis for why the new blocker remained latent
5. Do not close a scenario-driven package or sprint on “hot path fixed” while
   the original scenario still fails and the new dominant blocker is unnamed.
6. Do not open a new package merely because a fresh artifact has a different
   epoch, node id set, count, timestamp, or presentation shape while the same
   semantic owner and boundary still dominate.
7. Open or activate a new package only when the canonical owner boundary,
   current semantic owner, or required next action changes materially.
8. When the owner boundary has not changed, append the new normalized evidence
   to the current package and update the sprint's current blocker snapshot
   instead of widening package churn.
9. Evidence copied from distributed or integration artifacts must be derived
   from the artifact whenever a canonical extractor or script exists. Manual
   summaries must still name the source artifact paths and the normalized
   fields that make the blocker canonical.

### 0.1.6 Progress Grammar Declaration For Lifecycle Boundaries

When a package touches startup, join, rejoin, readiness, admission, recovery,
convergence, rebalancing, or other lifecycle-style progression, the package
must declare one small progress grammar for the affected boundary.

Mandatory rules:

1. The package or linked architecture record must name:
   - the canonical state or outcome vocabulary
   - the meaning of blocked, deferred, retryable, terminal, and ready states
   - the canonical blocker or reason-code vocabulary
   - the evidence precedence when storage, cache, transport, and runtime
     witnesses disagree
2. If the concern has several axes, the package must name the axes explicitly
   instead of collapsing them into one local boolean bag.
3. Diagnostics, admin, harness, and reporting surfaces that consume that
   boundary must reuse the same grammar or declare a bounded view role.
4. If readers still need to infer progress from object existence, local
   booleans, or logs after the package lands, the package is not ready for
   closure.

### 0.1.7 Static Drift Ledger And Guardrail Closure

Every active package that touches runtime, control-plane, harness,
diagnostics, admin, or shared test infrastructure MUST carry a static drift
ledger in the package file.

Mandatory rules:

1. Before implementation starts, record the relevant guardrail status for the
   touched boundary. At minimum, classify:
   - decision-boundary guideline audit
   - runtime-grammar contract audit when runtime meaning is touched
   - metadata gateway or owner-ingress audit when system-table reads/writes are
     touched
   - scalar/literal guideline audit for files being materially edited
   - dependency cycle and complexity ratchets for broad refactors
2. The ledger must distinguish:
   - inherited repo-wide debt outside the package boundary
   - inherited debt in touched files
   - new debt introduced by the package
   - debt removed by the package
3. A package may not close if any relevant guardrail count increases.
4. A package may not close with an in-scope guardrail violation in a touched
   production file unless a linked follow-on package is created before closure
   and the original package explains why the violation is outside its boundary.
5. If a guardrail fails repo-wide before work begins, the package must still
   run the narrowest file-scoped guard for touched files before and after the
   change and record both results.
6. Do not hide guardrail failures by weakening scripts, expanding allowlists,
   renaming files out of scan scope, or moving code into test-only paths.
7. Any new allowlist, suppression, or accepted-boundary entry must name:
   - the semantic owner
   - the reason the exception is structurally necessary
   - the expiry or follow-on package that removes it
   - the guardrail that will fail once the exception is removed

Static checks are not advisory lint. When a guard encodes this steering
contract, its failure is package evidence that architecture drift is still
present.

### 0.1.8 LLM Sprint Entry And Width Limits

LLM-driven sprint work must keep architectural width small enough that the
model can preserve owner contracts across the whole touched boundary.

Mandatory rules:

1. A sprint must name one representative gate before broad execution starts.
2. A package must name one primary architectural boundary and one primary
   semantic owner.
3. A package may touch several files only when those files are direct owner
   collaborators for the same boundary.
4. Guardrail cleanup and runtime behavior changes may share a package only
   when they are the same boundary. Otherwise, split guard cleanup into a
   separate package.
5. A package may not widen from one failure migration to a second unrelated
   blocker without updating the package scope or splitting a new package first.
6. When an LLM sprint repeatedly exposes new blockers at the same boundary, the
   next package must reduce the boundary surface area before adding more
   symptom-specific behavior.
7. A scenario-driven active package may carry at most one current dominant
   blocker, one primary semantic owner, and one primary boundary. Historical
   blocker migrations may remain as evidence, but they must not define the
   current edit scope.
8. After two material blocker migrations inside one package, the next work
   cycle must either close the representative gate or split a contraction
   package that names the current owner contract and removes older migrations
   from the active edit scope.
9. A contraction package must define the smallest replayable owner-decision
   fixture or blocker probe before runtime behavior changes begin.
10. Presentation surfaces, including admin summaries, triage summaries,
    failure bundles, and harness reports, must consume a canonical
    decision-layer contract when one is present. They must not invent a new
    dominant reason by reassembling lower-layer publication, readiness,
    transport, or cache fragments.
11. If presentation and decision evidence disagree, the package must treat that
    disagreement as a first-class blocker. The package may not close until
    either presentation consumes the decision contract or the decision contract
    is proven wrong by a focused owner test.
12. Broad representative reruns are acceptance proof only after the replayable
    owner fixture, focused owner tests, and affected presentation tests are
    green.
13. Every active scenario-driven sprint must keep a compact current blocker
    snapshot near the top of the sprint document.
14. Before resuming LLM-driven sprint or package work, run
    `npm run work:context` and use its current blocker, first-read files,
    proof ladder, useful commands, and dirty-worktree summary as the starting
    handoff. If the context is stale, run `npm run work:current-blocker` first
    and then rerun `npm run work:context`.
15. The current blocker snapshot must name:
    - latest artifact or replay directory
    - representative gate or scenario
    - current representative package
    - primary semantic owner and boundary
    - canonical blocker or dominant reason
    - prior blocker that just closed or migrated
    - subordinate evidence that must not drive the edit scope
    - next required owner proof or action
16. Long migration history belongs below the snapshot as a ledger. It must not
    force readers or sub-agents to reconstruct the current blocker from old
    package narratives.
17. A sprint continuation must start by refreshing or confirming the current
    blocker snapshot before runtime implementation resumes.
18. If the snapshot shows the same owner boundary with a new artifact shape,
    continue the current package. If it shows a new owner boundary, split or
    activate exactly one new representative package.
19. Sub-agent work inside a sprint must be sequential at owner boundaries:
    first extract canonical evidence from the latest artifact, then map the
    owner path and smallest proof surface, then implement the bounded change.
20. Sub-agents may run in parallel only for independent sidecar questions with
    disjoint owner or file scope. They must not each chase separate
    interpretations of the same current blocker.
21. Runtime edits must not start from a sub-agent until the current blocker
    snapshot names the canonical owner boundary and the smallest focused proof
    surface.
22. The main agent remains responsible for integrating sub-agent findings,
    choosing whether the owner boundary changed, and keeping package status
    filename-first.
23. When starting or continuing package execution in a sprint, the first
    real sub-agent task must review the most recently executed package on the
    same sprint or owner boundary.
24. The package-review sub-agent must check whether the last package actually
    closed its stated blocker, left stale status, widened scope, missed
    residual closure, introduced guardrail drift, or left the sprint snapshot
    inconsistent with current evidence.
25. If that review finds actionable problems, the next sub-agent task must be
    a bounded fix for those problems before any new package implementation
    begins.
26. Only after the previous package is clean or its review findings are fixed
    may a new implementation sub-agent start work on the current package.
27. The review, fix, and implementation sub-agents must be sequential unless
    their file and owner scopes are explicitly disjoint. The default workflow
    is review previous package, fix previous-package defects if any, then
    implement the current package.
28. Parent-session notes, local/manual session labels, and arbitrary text
    without a real agent id do not satisfy review, fix, or implementation
    roles unless the user explicitly disables sub-agents for that task.

### 0.1.8.1 Causal Analysis Escalation For Repeated Scenario Failures

When scenario-driven work keeps reducing or classifying blockers without making
the representative gate pass, the next work cycle must move up to causal
analysis before adding another local runtime patch.

Mandatory rules:

1. Trigger causal-analysis escalation when any of these are true:
   - the same representative scenario remains red after two material fixes or
     classification-only reductions on related lifecycle, admission, readiness,
     recovery, or convergence boundaries
   - the same owner boundary remains dominant while residual evidence shifts by
     node, timing, retained evidence, subordinate reason, or artifact shape
   - package review identifies local tactical treatment as the risk rather than
     one missing owner-path fix
   - a package classifies residual evidence as intentional backpressure but the
     representative gate still fails
2. The causal-analysis package must not be another symptom patch. It must
   produce or update a durable diagnostic or architecture boundary that covers:
   - an end-to-end phase model for the scenario
   - a cross-entity causal graph with dependency edges and waiting
     relationships
   - budget and timeout accounting across nested attempts, retries, admission,
     locks, and scenario deadlines
   - invariant review for what must remain true at each phase boundary
   - a normalized failure-class taxonomy
   - architecture-level stop conditions that say when to continue local fixes,
     migrate owner boundary, widen architecture work, or stop for human
     direction
3. Runtime owner packages that follow a causal-analysis escalation must cite the
   relevant causal model section, schema, decision table, fixture, extractor, or
   diagnostic artifact in their scope basis and proof ladder.
4. Do not close a causal-analysis package with prose-only conclusions when a
   reusable schema, decision table, fixture, extractor, or diagnostic artifact
   is required for successor packages to consume the analysis consistently.
5. Do not treat intentional backpressure as solved merely because it is
   classified. If the representative gate remains red, the causal model must
   explain whether the stop condition is accepted backpressure, insufficient
   budget, wrong sequencing, missing handoff, or a migrated owner boundary.

### 0.1.9 Roadmap And Work-Tracker Truth Reconciliation

Roadmap status must not outrun current representative evidence.

Mandatory rules:

1. A roadmap row marked complete means the capability exists and its declared
   exit evidence is not contradicted by an active package or current
   representative scenario.
2. If an active sprint or package is still fixing a failure that belongs to a
   completed roadmap row, the package must explicitly say whether the row is:
   - capability-complete but gate-open
   - status-overstated and needing roadmap correction
   - a new maintenance concern outside the original completion claim
3. Scenario-driven rows such as failure simulations, topology stabilization,
   and production guarantees must not be treated as complete solely because
   focused unit proof is green. The representative gate named by the package or
   sprint must also be green or the remaining blocker must be named in a live
   package.
4. Before a sprint closes, reconcile its active packages with `../../roadmap.md`
   and `../../architecture/current-owner-maps.md`. Do not leave the roadmap
   saying "done" while work tracking says the same exit criterion still fails.
5. Roadmap corrections are not product scope expansion. They are truth
   maintenance and should happen in the same closure cycle that discovers the
   contradiction.

## 0.2 Critical Generation Contract: Scalars And Decision Boundaries

These rules are hard stops for generated code and hand-written code alike.

1. No inline domain scalars.
   Do not write raw string, number, `null`, or `undefined` values directly in
   domain logic, runtime/exported structures, or semantic decisions.
2. Every scalar must have an owner.
   Before using a scalar, classify it:
   - shared domain value: import it from the canonical constants-owner module
   - file-private value: define one top-level named constant in that file
   - test-private value: define one suite-local named constant
   - raw external input: normalize it at the boundary before it enters runtime logic
3. Absence is not state.
   `null` and `undefined` must not encode runtime/domain state. Use an explicit
   named variant instead.
4. Semantic decision boundaries must not be implemented as bags of independent
   `if` statements.
   When multiple signals determine one outcome, the code must:
   - collect evidence
   - normalize one snapshot
   - use one explicit state model or decision table
   - emit one canonical outcome and reasons
5. Small local guards are allowed.
   Branch piles around readiness, admission, retryability, phase, or lifecycle
   are not.
6. If a scalar or state has no clear owner, stop and define the owner first.
   Do not inline it “for now”.

## 0.2.1 Shared Contract Shape And Boundary-Impedance Discipline

When one concern keeps reappearing under different names, shapes, or helper
options, treat that as a design bug, not as harmless flexibility.

Mandatory rules:

1. One runtime concern must have one canonical contract shape.
   If several views exist, each must have a non-overlapping role such as:
   - published operational authority
   - observed diagnostics input
   - owner-internal retained stabilization state
2. Shared contract surfaces must declare:
   - semantic owner
   - canonical evidence inputs
   - canonical state or outcome vocabulary
   - allowed consumers
   - forbidden reinterpretations
3. Do not expose semantic mode through combinable boolean or tri-state option
   bags.
   If callers are choosing between policy variants, define one explicit named
   mode set and make invalid combinations unrepresentable.
4. Storage rows, transport observations, bootstrap inputs, cache internals,
   and wire payloads are boundary evidence, not runtime contracts.
   Normalize them once at ingress before they enter runtime logic.
5. For shared identity or authority concerns such as node endpoint identity,
   leader identity, and publishable control-plane authority, there must be one
   canonical operational source.
   Other sources may exist only as ingress-only, diagnostics-only, or
   owner-internal evidence.
6. Do not introduce a second cache, snapshot, field, or helper for the same
   concern unless the role boundary is explicit and non-overlapping.
7. If a work package adds or reshapes a shared runtime boundary, update
   `architecture/current-owner-maps.md` or the relevant architecture record in
   the same work cycle so the owner, vocabulary, consumers, and forbidden
   reinterpretations are documented once.

## 0. Platform Model and Design Intent

Lagrange exposes a small user model built around two primary primitives:

Tables — durable structured state

Services — durable executable workloads

Users express intent through tables, services, SQL, and policies.
Users do not directly manage partitions, replicas, placement, or rebalancing.

Those lower-level mechanisms are internal system machinery owned by the platform.

Therefore, all generated code MUST preserve the following architectural intent:

External simplicity — do not introduce unnecessary new user-visible concepts.

Internal ownership — partitions, replicas, routing, lifecycle, and placement remain system-owned concerns.

Policy over micromanagement — prefer policy-controlled behavior over direct low-level control surfaces.

No machinery leakage — internal mechanisms must not become accidental user-facing concepts unless explicitly designed as such.

Strengthen existing primitives — new features should extend tables, services, policies, and canonical execution paths rather than create new conceptual categories.

When proposing a new feature or API, first ask:

Does this strengthen tables or services?

Does this preserve the small external model?

Is this internal machinery, or is it being exposed unnecessarily?

If a change introduces a new conceptual entity that is neither a table nor a service, treat that as a design warning and justify it explicitly.

## 1. ZERO DUPLICATION CONTRACT (highest priority)

This is the single most important rule in the entire system. Violations of this
rule have caused real production bugs. Read every sub-rule carefully.

### 1.1 One Owner Per Concern

Every piece of logic, every state transition, every data transformation, every
decision MUST have exactly ONE owning component. No exceptions.

Before writing ANY new function, method, class, or code block, you MUST:

1. Search the codebase for existing code that does the same thing or overlaps.
2. If it exists, use it. Do not create a second version.
3. If it exists but needs modification, modify the original. Do not fork it.
4. If you are unsure whether something already exists, search first. Do not guess.

### 1.2 No Parallel Implementations

It is FORBIDDEN to:

- Create a new function that does what an existing function already does.
- Add a field/property that carries the same semantic meaning as an existing one
  (e.g., `m.type` and `m.operation` meaning the same thing).
- Introduce a "helper" or "utility" that reimplements logic from another module.
- Create a "wrapper" that silently duplicates the behavior of the thing it wraps.
- Add a second code path "just in case" or as an alternate path.
- Introduce a second authority surface, cache, snapshot, or identifier for the
  same runtime concern without an explicit role split and consumer contract.
- Preserve semantic mode as several orthogonal booleans when one named mode
  contract should exist.

### 1.3 Single-Path Execution

There must be exactly ONE code path for any given operation. Specifically:

- Any given runtime function or semantic concern MUST have one active code path
  once policy has been normalized.
- Callers must not assemble semantic behavior by toggling combinations of
  booleans that route into overlapping owner behavior.
- Boundary normalization happens once at ingress. Runtime logic must consume
  the normalized state rather than reopening raw storage or transport shapes.
  at a time.
- No "if new way fails, try old way" patterns.
- No feature flags that keep two implementations alive simultaneously.
- No "current path plus prior path" layouts for the same semantic concern.
- When something changes, replace the prior path instead of carrying both
  forward.

The one scoped exception is explicit recovery sweeps (see §1.8): the cache is
the steady-state read model, and SQL reads are permitted for authoritative
writes, recovery sweeps, and diagnostics reconciliation. This is not a second
steady-state path. It is a separate, explicitly owned recovery path that
re-enters the canonical owner queue. Do not generalize this exception into
ad-hoc "try cache then try SQL" patterns.

### 1.4 Single Source of Truth for State

Each piece of state (node status, replica role, epoch, etc.) is owned by exactly
one component. Other components that need that state MUST read it from the owner.
They must NOT maintain their own copy, shadow, or derived version of that state.

For the current concrete owner map, see
`architecture/current-owner-maps.md` and the linked sections in
`architecture.md`.

### 1.4.1 Injected Owners Must Be Used

If a component is constructed with an owner dependency such as
`replicaStateMachine`, `serviceLifecycleManager`, `failureDetector`, or another
explicit owner, that component MUST route the owned behavior through it.

It is FORBIDDEN to:

- Accept the owner as a dependency and then persist the same state directly.
- Keep parallel local logic for the same transition "just in case".
- Treat an injected owner as optional when the owned behavior still executes.
- Leave owner dependencies unused while mutating the owned state elsewhere.

An injected-but-bypassed owner is an architecture violation, not a cleanup task.

### 1.4.2 One Owner Per System-Table Row Lifecycle

For every system-table-backed entity, exactly one component must own the row
lifecycle:

- Row creation
- Row lifecycle transitions
- Row deletion

Other components may request actions through that owner, but they may NOT:

- Create temporary or repair rows themselves
- Recreate missing rows from partial local knowledge
- Mix row creation into status-update code paths

### 1.4.3 One Owner Per Field Subset

For shared system-table rows, field ownership must be explicit and non-overlapping.

Example: a `services` row may have different owners for:

- Identity fields: `service_id`, `service_type`, `node_id`, `partition_id`,
  `replica_id`, `address`, `created_at`
- Lifecycle fields: `status`, `state_entered_at`, `previous_state`,
  `trigger_reason`, `error_message`, `updated_at`
- Raft-role fields: `raft_role`

No component may rewrite fields outside its owned subset.

### 1.4.4 Create Once, Update Partially

Initial row creation and subsequent lifecycle updates are different operations
and MUST remain separate.

- Initial creation must write the full canonical row shape.
- Later lifecycle changes must use partial updates only.
- `INSERT OR REPLACE` or full-row replacement is FORBIDDEN for steady-state
  lifecycle/status mutation of existing system rows.

If a row is expected to exist and does not, the code must either:

- Fail loudly, or
- Route the request through the canonical row-creation owner

It must NOT silently recreate the row inside an updater.

### 1.4.5 Cache Is For Observation, Not Reconstruction

`SystemTableCache` is the read path for current cluster metadata. It is NOT an
authoritative source for reconstructing fields that another owner already owns.

It is FORBIDDEN to:

- Rebuild authoritative write payloads from stale cache rows when the owner is
  available
- Copy owner-managed fields such as `raft_role` from cache into unrelated write
  paths
- Infer missing identity data from local convenience state when a canonical row
  owner exists

### 1.4.5.1 Shared Control-Plane Snapshot Readers Must Not Repair On Read

For shared control-plane truth surfaces such as startup, readiness, admin
snapshot, service discovery, and harness convergence, one snapshot owner MUST
own:

- freshness or revision state
- canonical observation state
- reason codes
- retry timing
- repair scheduling and forced-repair routing

Mandatory rules:

1. Non-forced readers MUST NOT perform synchronous multi-table authoritative
   repair on the hot path.
2. When cache evidence is insufficient, readers MUST consume the owner outcome
   directly as `fresh`, `stale-but-usable`, `deferred-refresh`, or `failed`
   instead of reopening broad repair locally.
3. Background or deferred repair MUST be scheduled through the owner-held
   reconcile path rather than through reader-local retry loops.
4. Forced repair, when a boundary explicitly allows it, MUST still route
   through the same owner and bounded budget rather than bypassing it with a
   second repair path.
5. Reader-local caches MUST NOT memoize stale or deferred blocked answers as if
   they were fresh observations.

### 1.4.5.2 Critical Convergence Traffic Must Outrank Snapshot Repair

When control-plane pressure forces a choice, critical convergence work must
outrank diagnostics, observability reads, and broad repair.

Critical convergence work includes:

- `NODE_STATE_UPDATE`
- membership publication
- authoritative `replica_operations` visibility
- other owner-defined control-plane progression writes

It is FORBIDDEN to:

- Let snapshot repair or observability reads consume the same effective lane as
  critical convergence work
- Treat mild pressure or degrade signals as permission to collapse critical
  visibility into cache-only emptiness
- Reopen broad repair from readers on the same stressed path needed to finish
  convergence

### 1.4.6 Canonical Owner Rows Must Outrank Read Models

When leader identity or group state is needed, the canonical owner row MUST be
consulted before any supporting replica rows.

Mandatory owner precedence:

- `partitions.leader_node_id` outranks `services.raft_role` for partition
  leader identity
- `message_groups.leader_node_id` outranks `services.raft_role` for
  message-group leader identity
- `services` remains the owner of replica-only fields such as replica role,
  status, and address

It is FORBIDDEN to:

- Derive canonical leader identity from `services` row iteration order
- Treat replica rows as alternative truth when the owner row is present
- Collapse owner-row mismatch and replica-role mismatch into one undifferentiated
  error

### 1.4.7 New Raft-Backed Runtime Services Must Extend Shared Owners

A new raft-backed runtime service MUST be built by extending existing shared
runtime owners, not by copying an older service and editing it in place.

Required implementation path:

1. Declare the canonical owner row and owned field subset first.
2. Reuse the shared raft lifecycle owner for leader/follower/candidate and
   leader-change handling.
3. Reuse the shared authoritative row mutation helper for role and owner-row
   persistence.
4. Feed control snapshots and diagnostics from the owner row first, then attach
   replica detail separately.
5. Add owner-path regressions that prove the shared owners are actually used.

It is FORBIDDEN to:

- Add service-local raft lifecycle wiring that duplicates shared behavior
- Add service-local retry/cache-gap mutation loops
- Introduce a second mutation helper for the same owner-row concern
- Publish diagnostics that infer canonical leader truth from replica rows alone

### 1.4.8 No Overloaded Lifecycle Fields Across Concerns

A single persisted field MUST NOT carry multiple lifecycle semantics for
different owners.

Examples of forbidden overloading:

- Using one timestamp both as "operation completed at" and
  "assignment lease expires at"
- Reusing one status value set for both "reservation active" and
  "operation terminal success"
- Treating one table row as both claim owner and workflow owner without
  explicit owner-boundary fields

Required pattern:

1. Keep claim/lease lifecycle, workflow lifecycle, and entity-ownership
   lifecycle as separate owned concerns.
2. If they share a row, field subsets must be explicitly partitioned by owner
   and never reused across concern boundaries.
3. Expiry/recovery sweep logic may act only on rows/fields owned by that sweep
   owner; it must not rewrite terminal workflow outcomes from another owner.

### 1.4.9 Status Taxonomy Must Be Enforced by Consumers

When constants define active/terminal status sets, decision logic MUST consume
those sets directly.

It is FORBIDDEN to:

- Define `ACTIVE_*` / `TERMINAL_*` sets and then bypass them with ad-hoc
  checks
- Infer active/terminal state from timestamps alone when status taxonomy exists
- Mark terminal outcomes and later reclassify them via a sweep that ignores
  status taxonomy

Mandatory check:

1. Any "is active" predicate must gate on the canonical active status set.
2. Any sweep that expires entries must skip canonical terminal statuses.
3. Any status transition to terminal success must be monotonic and must not be
   rewritten to failure by unrelated expiry logic.

### 1.4.10 Configured Modes Must Dominate Disabled-Path Preconditions

When a subsystem exposes explicit configured modes (for example grouped vs safe),
the configured mode is canonical and MUST NOT be overwritten by precondition
checks from a disabled mode path.

It is FORBIDDEN to:

- Run grouped-path prerequisite checks when grouped mode is disabled and then
  publish grouped degradation reasons
- Overwrite a healthy configured-safe publication mode with runtime fallback
  reasons that only apply to grouped delivery
- Evaluate readiness/admission against diagnostics generated from an inactive
  strategy path

Required pattern:

1. Gate by configured mode first.
2. Execute only prerequisites for that mode.
3. Publish diagnostics reason codes that are valid for the active mode only.

### 1.4.11 Admission Planning Must Consume the Full Candidate Set

For control-plane provisioning (table bootstrap, split child provisioning,
rebalance add/replace), admission decisions must be made against a candidate
pool, not a pre-truncated first target.

It is FORBIDDEN to:

- Pre-slice target nodes to the requested replica count before admission checks
- Fail the whole provisioning step on the first candidate denial when other
  candidates exist
- Defer obvious "no admissible cohort" states into long timeout waits

Required pattern:

1. Discover ordered candidate nodes first.
2. Evaluate canonical admission owner (`storageAdmissionService`) per candidate
   until the required minimum cohort is satisfiable.
3. Treat one denied candidate as a rejected candidate, not a global abort,
   unless no candidate cohort can satisfy the minimum.
4. If the minimum cohort cannot be satisfied after candidate evaluation, fail
   immediately with structured rejection diagnostics.

### 1.4.12 Readiness Must Reconcile Lease State with Live Transport

Node readiness decisions MUST NOT be driven by one stale signal (for example
observer-side lease expiry) when stronger live transport evidence is available.

It is FORBIDDEN to:

- Classify a node as unhealthy solely because `ready_lease_expires_at` is older
  than local wall clock while transport still reports the node connected
- Maintain separate readiness semantics per consumer (dispatch, rebalance,
  admission) for the same "cluster member healthy" decision
- Treat stale heartbeat rows as healthy forever with no bounded freshness check

Required pattern:

1. Evaluate readiness via `ControlPlaneReadinessService` as the single owner.
2. Combine lease/readiness-at-write evidence with live transport connectivity
   when transport owner data is available.
3. Apply bounded stale-heartbeat tolerance so propagation lag is tolerated but
   indefinite stale rows are rejected.
4. Emit explicit reason codes from the canonical readiness snapshot used by
   admission/dispatch/rebalance decisions.
5. Internal topology consumers (dispatch, rebalance, split admission, storage
   admission) share the `repairEligible` dimension; routing and benchmark
   consumers use `serveEligible`.

### 1.4.13 CDC-Replicated Row Mutations Must Be Primary-Key Addressed

System-table mutations that flow through CDC MUST be row-addressed by canonical
primary key.

It is FORBIDDEN to:

- Run set-based `UPDATE` / `DELETE` mutations on CDC-propagated system tables
  using non-primary predicates as the primary write path
- Depend on SQL parser reconstruction of primary keys from non-key predicates
  (for example `operation_id`, `status`, range predicates) to make CDC payloads
  valid
- Use one broad mutation to represent multiple row lifecycle transitions when
  CDC/cache propagation is row-scoped

Required pattern:

1. Query candidate rows first using read predicates.
2. Transition each row by primary key (`... WHERE <pk> = ?`) via the canonical
   mutation owner path.
3. Keep one deterministic mutation shape for lifecycle transitions so CDC events
   always carry the canonical row identity.
4. If multiple rows qualify, apply per-row transitions (or an explicit
   transaction wrapper that preserves row identity), not a single broad update.

### 1.4.14 Runtime Shared-Metadata Access Must Cross Canonical Gateways

Runtime access to shared metadata must cross canonical ingress owners rather
than raw helper calls.

Required pattern:

1. Semantic owners submit shared-metadata writes through one canonical runtime
   mutation gateway.
2. Semantic decisions over shared metadata use one canonical read gateway or
   one declared owner-fed read model for that decision path.
3. Bootstrap-only shortcuts remain phase-scoped and are not valid runtime
   ingress paths.

It is FORBIDDEN to:

- Call raw system-table mutation helpers directly from runtime feature code
  when a canonical gateway owner exists.
- Add a second runtime read ingress that performs equivalent cache/SQL
  decisions outside the declared owner path.
- Keep bootstrap-era helper paths reachable from steady-state runtime code.

### 1.4.15 Phase-To-Steady-State Handoff Must Be Explicit

Bootstrap, join, and recovery phases may initialize runtime mechanisms, but
steady-state correctness must not depend on phase-owned wiring after completion.

Required pattern:

1. If a phase establishes a subscriber, bridge, queue, retry loop, or cache
   hydration path needed by steady state, ownership must transfer explicitly to
   a runtime owner before phase completion.
2. Phase completion must remove only temporary scaffolding, never the sole live
   dissemination, observation, or admission path.
3. Handoff completion must be represented by one owner transition, not inferred
   from phase timers or "good enough" cache visibility.

It is FORBIDDEN to:

- Tear down a phase-owned subscriber or bridge when no steady-state owner has
  taken over the same responsibility.
- Leave runtime correctness dependent on a phase-scoped retry loop, buffer, or
  cache patch.
- Hide missing handoff ownership behind fallback reads, broad repairs, or
  timeout inflation.

### 1.4.16 Boundary Closure Is Mandatory After Repeated Bugs

When more than one correctness bug appears at the same architectural boundary,
the next fix must reduce the number of runtime paths through that boundary.

Examples of a boundary include:

- metadata mutation ingress
- metadata read ingress
- bootstrap-to-runtime handoff
- CDC dissemination
- readiness classification
- transport admission

Required pattern:

1. Identify the boundary explicitly in the spec, task, or fix notes.
2. Remove, merge, or structurally block at least one redundant path across that
   boundary.
3. Add regression coverage that proves the reduced boundary is now the only
   legal path.

It is FORBIDDEN to:

- Land a third local symptom fix on the same porous boundary with no
  architectural consolidation plan.
- Treat repeated boundary failures as unrelated bugs when they share the same
  owner gap or ingress overlap.

### 1.4.16.1 Multi-Signal Admission Must Use One Canonical Adjudicator

When readiness, admission, placement, or cohort selection depends on more than
one live signal, the system must separate observation from policy.

Required pattern:

1. Collectors fetch evidence and diagnostics, but do not emit the final admit,
   ready, or select verdict.
2. One normalized per-entity snapshot records all evidence needed for the
   decision, including whether each signal is authoritative, equivalent, or
   degraded.
3. One canonical adjudicator derives the final state, verdict, retryability,
   and reason codes from that snapshot.
4. Equivalent evidence may clear only the blocker classes explicitly declared
   by spec. Degraded or cross-plane evidence may explain or defer, but it must
   not upgrade a blocked entity to admitted or ready.
5. Policy targets such as strict cohort size or parity must remain owned by
   explicit policy, not be rewritten opportunistically from the survivors of a
   local fallback branch.

It is FORBIDDEN to:

- Scatter final readiness or admission decisions across helper-specific boolean
  branches or fallback probes.
- Use a weaker or cross-plane signal to prove a stronger workload or
  owner-specific readiness claim unless the spec declares that signal
  equivalent.
- Collapse a strict policy target to whichever entities happened to pass local
  fallbacks in the current attempt.

### 1.4.17 Shared Pressure Contract Must Span All Ingress Paths

Separate planes may keep separate ingress owners, but they must reuse the same
pressure/admission contract.

Required pattern:

1. Metadata/control-plane ingress and query-plane ingress classify work with a
   shared contract for work class, resource keys, retry/defer semantics, and
   structured overload reasons.
2. Backpressure is emitted by owners as structured admission outcomes, not
   reconstructed by call-site-specific retry code.
3. Capacity reservations or priority isolation must be expressed through the
   shared pressure contract, not through hidden local queues.

It is FORBIDDEN to:

- Invent per-feature overload semantics when a shared pressure owner exists or
  should exist.
- Let one plane discover overload only by timeout while another receives
  structured defer/reject signals.

### 1.4.18 Resource Lifetime Must Be Owned, Bounded, And Observable

Every queue, buffer, subscription registry, deferred-work map, retry registry,
or single-flight registry must have one owner and one bounding rule.

Required pattern:

1. Define the owning component, capacity or bound, expiry/teardown rule, and
   diagnostic surface for each resource-lifetime structure.
2. Expose enough structured diagnostics to prove plateau under repeated
   join/restart/load cycles.
3. Treat sustained memory or subscriber growth as a correctness bug, not as
   operational tuning.

It is FORBIDDEN to:

- Introduce runtime collections that accumulate work, listeners, or retries
  with no explicit owner and no plateau rule.
- Rely on process lifetime, GC luck, or eventual scenario end to clean up
  control-plane resources.

### 1.4.19 Transitional Runtime Delegators Need An Expiry Plan

Temporary runtime delegators or compatibility adapters are allowed only when
their removal is planned and enforced.

Required pattern:

1. The same spec or task list that introduces a transitional delegator must
   include its removal task and the target canonical owner.
2. A structural guard (CI audit, import guard, or equivalent) must prevent new
   call sites from binding to the transitional path.
3. The delegator must preserve one semantic owner. It may forward, but it may
   not add a second decision path.

It is FORBIDDEN to:

- Add a temporary runtime delegator with no explicit removal checkpoint.
- Let a delegator become a permanent second ingress for the same semantic.

### 1.5 Verification Checklist (run this before writing code)

Before generating or modifying code, answer these questions:

1. Does a component already own this responsibility? -> Use it.
2. Does a function already exist that does this? -> Call it.
3. Does a constant/enum already exist for this value? -> Import it.
4. Am I adding a second way to do something that already has one way? -> Stop.
5. Am I adding state that another component already tracks? -> Read from owner.
6. Am I adding a field that means the same thing as an existing field? -> Reuse.
7. Am I accepting an owner dependency but not routing the behavior through it? -> Stop.
8. Am I mixing row creation and row updates in the same code path? -> Stop.
9. Am I writing fields owned by another component? -> Stop.
10. Am I reconstructing authoritative write state from cache when an owner exists? -> Stop.
11. Am I overloading one field/status to represent multiple owner lifecycles
    (claim, workflow, entity state)? -> Stop.
12. Did I define active/terminal status sets but bypass them in decision logic? -> Stop.
13. Am I publishing degraded diagnostics from a mode-specific path that is
    disabled by current config? -> Stop.
14. Am I pre-truncating provisioning candidates or failing on the first denied
    candidate instead of evaluating the full admissible cohort? -> Stop.
15. Am I classifying node readiness from lease expiry alone while ignoring
    canonical transport/readiness-owner evidence? -> Stop.
16. Am I mutating CDC-replicated system rows with broad non-primary predicates
    instead of primary-key-addressed row transitions? -> Stop.
17. Am I fixing a repeated control-plane problem locally instead of routing it
    through a shared higher-order primitive (authoritative view, eligibility
    snapshot, operation lane, workflow step runner, timeout policy)? -> Stop.
18. Am I introducing a code path where load or contention causes a correctness
    failure instead of a throughput reduction? -> Stop.
19. Am I letting callers discover overload only via timeout instead of
    structured backpressure (queue-full, retry-after, rejection)? -> Stop.
20. Am I returning a hard failure to a query client during a topology
    transition when retryable replicas or structured retry semantics
    exist? -> Stop.
21. Am I designing a state mutation that produces a different outcome on
    retry than on first execution? -> Stop.
22. Has this same architectural boundary produced more than one recent bug, and
    am I still patching it locally without reducing the number of paths? ->
    Stop.
23. Am I leaving steady-state correctness dependent on bootstrap, join, or
    recovery phase wiring after the phase completes? -> Stop.
24. Am I introducing a queue, buffer, subscription set, retry map, or
    single-flight registry with no explicit owner, bound, and cleanup rule? ->
    Stop.
25. Am I adding a runtime shared-metadata read/write path that bypasses the
    canonical gateway owner? -> Stop.
26. Am I keeping a temporary delegator alive without a removal task and
    structural guard against new callers? -> Stop.
27. Am I combining observation, fallback probing, and final admission policy in
  the same retry loop instead of producing one normalized snapshot and one
  canonical adjudicated verdict per entity? -> Stop.

If the answer to any of 4–27 is yes, you are violating this contract.

### 1.5.1 Owner Wiring and Fallback Elimination Procedure

When changing control-plane code (dispatch, rebalance, split, admission, or
readiness), complete this procedure before closing the task:

1. Define the canonical owner dependency and required methods first (for
   example `storageAdmissionService.checkAdd`, `storageAccountingService
   .estimateReplicaBytes`, `cdcGroupPropagationService
   .getPublicationModeDiagnostics`).
2. Wire the owner from the composition root (`ControlPlaneSetup`, bootstrap
   setup, or equivalent). Do not create local replacement logic in consumers.
3. If owner references can refresh at runtime, route refresh through the
   canonical setter path (for example `setRebalanceCoordinator`) so child
   dependencies resync; do not mutate coordinator/owner fields directly.
4. Missing owner dependencies are hard dependency errors. Fail loudly with a
   typed error instead of synthesizing fallback decisions or "allow by default"
   behavior.
5. Keep exactly one decision path for one semantic. Do not add local
   "owner-unavailable" alternate logic that reconstructs equivalent decisions
   from secondary data.
6. Add or update a regression that proves the injected owner path is actually
   used and fails when that owner is bypassed.
7. If the bug is part of a repeated boundary failure, remove or structurally
   block at least one redundant path before closing the task.
8. If the code touches phase-established runtime wiring, prove the runtime
   owner remains after phase completion and no phase teardown removes the only
   live path.
9. If the decision depends on more than one signal, define the normalized
  decision snapshot and the canonical adjudicator before adding or changing
  fallback behavior.

Mandatory pre-merge scan for touched files:

- Search for direct owner field mutation where a setter exists.
- Search for synthetic fallback decisions when owner dependencies are absent.
- Search for duplicate decision logic that reimplements owner behavior locally.
- Search for helpers or fallback probes that return final ready/admit/select
  booleans outside the canonical adjudicator.
- Search for phase-scoped runtime subscribers, bridges, or retry loops that
  remain required after phase completion.
- Search for direct shared-metadata reads or writes that bypass the canonical
  gateway owner.

### 1.6 Deterministic Control-Plane Progression

Control-plane concerns (dispatch, rebalance progression, split progression,
admission progression) MUST execute through a deterministic owner-key reconcile
path.

- Events may enqueue owner-key work, but they MUST NOT execute long-running
  progression inline.
- For a given owner key, there MUST be at most one reconcile execution in
  flight.
- Multiple triggers for the same concern (event, cache update, timer) MUST
  converge into the same reconcile queue and owner path.
- Broad polling loops are recovery-only tools. They MUST NOT be the steady-state
  primary progression mechanism.

### 1.6.1 Topology Workflow Owner Map

Topology-changing workflows have fixed ownership boundaries.

The current concrete workflow owner map lives in
`architecture/current-owner-maps.md`.

The durable rule remains:

- owner-managed workflow fields have one writer
- participant executors emit outcomes and do not persist owner-managed phase
  transitions directly
- cache visibility, timer age, or incidental row observation do not prove
  executor-owned phase completion

### 1.7 Durable Workflow + Transaction Boundary Rule

Topology-changing operations MUST use one durable monotonic workflow contract
and one transactional contract.

- Step transitions MUST be persisted durably with previous step, next step,
  reason, and timestamp.
- A transition that requires atomic multi-row authoritative updates MUST commit
  through the shared `DistributedTransactionCoordinator`.
- Executor-owned phase progression requires durable participant
  acknowledgement before the owner advances the workflow.
- Do not implement ad-hoc cross-owner write ordering to emulate atomicity.
- Do not retain sequential fallback branches for atomic topology cut points.
- Do not create a second workflow engine for control-plane operations when
  `DurableWorkflowCoordinator` already owns the workflow contract.

### 1.8 Canonical Read-Model Contract (No Two Truths)

Each decision path MUST declare exactly one canonical read model for its
semantics.

- CDC-propagated metadata decisions in steady state should read from
  `SystemTableCache`.
- SQL reads for equivalent semantics are limited to authoritative writes,
  explicit recovery sweeps, or diagnostics reconciliation.
- A single decision path MUST NOT mix cache and SQL fallbacks for the same
  semantic meaning.
- Cache divergence recovery MUST re-enter the same owner-key reconcile queue
  rather than a direct mutation fallback path.
- Cache visibility MUST NOT complete an executor-owned topology phase on its
  own.
- Cache/authoritative divergence must be surfaced as typed diagnostics and
  invariants, not hidden by silent fallback behavior.

### 1.8.1 Higher-Order Control-Plane Building Blocks Are Mandatory

When control-plane logic becomes hard to reason about, the required fix is to
raise the abstraction level, not to scatter more one-off line fixes across
workflow code.

It is FORBIDDEN to:

- Re-implement cache read, authoritative read, retry, ownership, timeout, or
  eligibility logic inside individual workflows
- Encode control-plane invariants as ad-hoc booleans, maps, or local helper
  branches per feature
- Treat timeouts as opaque operational noise instead of missing progress
  invariants with typed ownership
- Add per-callsite single-flight, retry, or readiness interpretations when a
  shared owner primitive already exists or should exist

The current shared control-plane building blocks live in
`architecture/current-owner-maps.md`.

Mandatory design rule:

- New topology workflows and control-plane features MUST be composed from the
  shared primitives first.
- If an existing primitive is missing one capability, extend the primitive.
  Do not fork the logic into a feature-local implementation.
- If a repeated concern appears in more than one owner path, stop and extract
  the shared building block before continuing feature work.

### 1.9 Timeout and Invariant Hard Rules

Timeouts and invariant breaches in control-plane logic are correctness bugs, not
operational noise.

- Every top-level control-plane operation MUST start with one canonical timeout
  budget.
- Nested operations MUST derive from remaining budget; they MUST NOT start with
  fresh default full budgets.
- Exact-boundary timeout clusters (for example exactly 4s/6s/30s/60s) MUST be
  treated as hard bugs with typed classification.
- Control-plane owners MUST emit structured invariant results. Hard invariant
  breaches MUST fail deterministic test gates and remain serializable into
  diagnostics and harness artifacts.

### 1.10 Availability Under Load Is Non-Negotiable

Every subsystem MUST continue to function correctly under load. Slowness is
acceptable; breakage is not.

- Operations may take longer under contention, backpressure, or topology
  change. That is expected and tolerable.
- Operations MUST NOT fail, return incorrect results, or silently drop work
  because the system is under load.
- Timeouts are a last resort, not a normal outcome. If a code path routinely
  times out under moderate load, that is a correctness bug requiring a fix —
  not an operational tuning knob.
- Control-plane pressure (splits, rebalance, leader elections) MUST NOT cause
  data-plane or query-plane failures. The query path may slow down while the
  control plane is busy, but it must not break.
- Readiness, admission, and routing decisions MUST remain correct during
  topology transitions. Transient internal state lag (cache propagation delay,
  lease expiry race) MUST NOT surface as user-visible errors.

It is FORBIDDEN to:

- Treat load-induced failures as acceptable operational noise.
- Add timeouts that convert slow-but-progressing work into hard errors without
  structured retry or backpressure.
- Allow stale internal signals to override live evidence of system health
  (see §1.4.12).
- Design code paths where throughput pressure causes correctness violations
  rather than throughput reduction.

Design principle: always correct, sometimes slower.

### 1.11 Backpressure and Flow Control

When a subsystem is overloaded, it MUST apply explicit backpressure rather than
silently dropping work or letting callers time out.

Required patterns:

1. **Bounded queues with rejection** — work queues MUST have a capacity limit.
   When full, new work MUST be rejected with a structured reason, not silently
   dropped or left to time out.
2. **Propagate pressure to callers** — when a downstream dependency is slow or
   at capacity, the upstream component MUST propagate that signal (queue depth,
   rejection, retry-after) rather than accumulating unbounded in-flight work.
3. **Shed load at the edge** — when the system cannot keep up, prefer rejecting
   new work at the entry point (admin API, query admission) with a retryable
   error over accepting it and failing deep inside the stack.
4. **Control-plane and query-plane isolation** — control-plane pressure (split,
   rebalance, leader election) MUST NOT starve query-plane resources. If they
   share execution resources, explicit priority or capacity reservation MUST
   prevent mutual starvation.

It is FORBIDDEN to:

- Accept unbounded in-flight work with no queue limit or admission control.
- Let callers discover overload only via timeout expiry.
- Treat "queue full" or "at capacity" as an unexpected error instead of a
  normal backpressure signal with structured retry semantics.

### 1.12 Query Routing During Topology Transitions

During partition splits, moves, or leader elections, the query path MUST remain
functional. Queries may be slower but MUST NOT fail due to transient topology
state.

Required patterns:

1. **Retry to available replicas** — when a partition leader is unavailable
   during a topology transition, the query router MUST retry to another
   replica or the new leader rather than returning a hard failure.
2. **Structured retryable errors** — if no replica can serve the query, return
   a structured retryable error to the client (not a generic timeout) so the
   client can retry with backoff.
3. **Bounded retry window** — query-path retries MUST be bounded by the
   caller's timeout budget. Do not retry indefinitely.
4. **Stale routing tolerance** — the routing layer MUST tolerate briefly stale
   partition maps during topology changes. A query routed to a stale leader
   MUST be redirected, not failed.

It is FORBIDDEN to:

- Return a hard failure to the client because a partition is mid-split or
  mid-move when other replicas exist.
- Treat a stale routing table entry as a terminal error during topology
  transitions.
- Queue queries indefinitely waiting for a topology transition to complete.

### 1.13 Idempotency

All state-mutating operations MUST be idempotent. Applying the same operation
twice MUST produce the same result as applying it once.

This is a foundational requirement for a distributed system with retries,
message redelivery, and recovery sweeps.

Required patterns:

1. **Unique operation identity** — state-mutating operations MUST carry a
   unique identifier (operation ID, idempotency key, or equivalent) so
   duplicate applications can be detected.
2. **Monotonic transitions** — state transitions MUST be monotonic. Replaying
   a transition that has already been applied MUST be a no-op, not a second
   mutation.
3. **Write-if-not-exists for creation** — row creation MUST use
   insert-if-not-exists semantics (or equivalent) so duplicate creation
   attempts do not corrupt existing state.
4. **Deterministic outcomes** — given the same inputs and current state, an
   operation MUST produce the same outcome regardless of how many times it
   executes.

It is FORBIDDEN to:

- Design operations where a retry produces a different outcome than the
  original execution.
- Rely on caller discipline to prevent duplicate delivery instead of making
  the receiver resilient to it.
- Use non-idempotent mutations (counters, append-only without dedup) in
  paths that can be retried.

---

## 2. Data Architecture

### 2.1 Tables Are the Universal Storage Model

- ALL persistent information is stored in tables.
- System topology and metadata live in system tables.
- A table is implemented as partitions.
- A partition is implemented as a Raft group (liferaft).

### 2.2 System Cache

- Every node uses exactly ONE system cache instance (`SystemTableCache`) on a selected Message Group.
- All nodes must have at least one Message Group replica, but can host more to let sparse message groups form quorum.
- The system cache on each Message Group is updated ONLY by CDC events from table partitions.
- Only CDC-propagated tables are cached. Non-propagated tables remain
  queryable from their owning partition via SQL. See `CDC_PROPAGATED_TABLES`
  and `CDC_NON_PROPAGATED_TABLES` in `src/cache/cache-constants.js` and
  the classification rules in `architecture.md § System Tables`.
- There must be NO other caches of system information. None. Zero.
- Do not create ad-hoc Maps, Sets, or objects that cache system data outside
  the system cache. If you need system data, read it from the cache or SQL.
- Any new system table MUST be classified in exactly one of
  `CDC_PROPAGATED_TABLES` or `CDC_NON_PROPAGATED_TABLES`.

### 2.3 Reads and Writes

- Writing system information: route to the leader replica of the correct
  partition(s). There is exactly one write path. No component may write
  directly to `SystemTableCache`; all mutations flow through CDC events
  generated by partition leaders.
- Runtime shared-metadata writes MUST enter through the owning semantic
  component and the canonical runtime mutation gateway. Raw runtime writes via
  ad-hoc SQL helpers or direct CDC helper calls are forbidden when the gateway
  owner exists.
- Reading system information: components may read directly from the local
  `SystemTableCache` for performance-critical hot paths (rebalancer,
  control-plane readiness checks, bootstrap API, node readiness policy).
  The SQL engine also uses the system cache internally for routing.
- Runtime shared-metadata reads for one semantic decision MUST use one declared
  ingress path only: either the canonical read gateway or the declared owner-fed
  read model. Do not mix raw cache, SQL, and helper reads for one decision
  path.
- Direct cache reads are permitted because the cache is strictly read-only
  from the consumer perspective — it is updated only by CDC events, which
  guarantees consistency with the authoritative partition state.
- No component may maintain a parallel cache, shadow copy, or derived
  state store outside `SystemTableCache`.

### 2.4 Bootstrap Exception

- The seed node may bypass the normal write path during bootstrap to create
  initial system cache entries (it cannot route writes before the cache exists).
- The joining node may call `applySystemTableChange` during cache hydration
  from bootstrap snapshots (before CDC subscriptions are active).
- These bypasses MUST be removed immediately after bootstrap completes.
- These are the ONLY exceptions to the single write path rule.
- If bootstrap or join establishes a runtime CDC bridge, subscription, or
  propagation path, ownership must hand off explicitly to a steady-state
  runtime owner before phase teardown.

Bootstrap-only write exceptions must NOT leak into steady-state runtime paths.
If runtime code can still call a bootstrap shortcut after initialization, that
is a bug.

---

## 3. Communication

- All nodes have at least one message group replica (liferaft).
- ALL communication (including local) goes through the MessageRouter.
- Do not create direct function calls between services that bypass the router
  for operations that should be messages.

### 3.1 Query/Data-Plane Transport Rule

- ALL query/data-plane traffic MUST use Message Group transport.
- Query requests, query responses, and data-plane coordination messages MUST be
  sent through the owning Message Group (replicated path), not a direct
  best-effort path.
- Do not add alternate fast paths for query/data-plane traffic (direct local
  handler calls, ad-hoc sockets, admin API forwarding, or service-to-service
  in-process bypasses).
- There must be one data-plane transport path only: Message Group transport.
- If performance is insufficient, optimize inside that path. Do not introduce a
  second non-replicated path.

---

## 4. Code Quality

### 4.1 Scalars Must Have Owners

- Do not write raw string, number, `null`, or `undefined` values directly in
  domain logic, runtime/exported structures, or semantic decisions.
- Before using a scalar, classify it:
  - shared domain value: import it from the canonical constants-owner module
  - file-private value: define one top-level named constant in that file
  - test-private value: define one suite-local named constant
  - raw external input: normalize it at the boundary before it enters runtime logic
- The canonical constants-owner module for a value MAY define that literal
  once. That is the only shared owner definition point for that value.
- File-local named constants are allowed and required for values private to one
  file. Do not force private helper enums, trace labels, or internal-only
  scalar vocabulary into shared constants modules.
- `null` and `undefined` must not encode runtime/domain state. If raw external
  input physically arrives with those values, normalize it immediately at
  ingress and return an explicit variant/state instead.
- Constants-owner modules should prefer individually named scalar constants and
  then compose exported objects/arrays from those named values, rather than
  embedding raw literals inline inside exported structures.
- Test-only fixture values that are unique to a single suite may live in a
  colocated test constants-owner file for that suite. If a value becomes
  shared across suites or runtime code, promote it into the appropriate shared
  constants module and import it from there.
- A single test file may also own its suite-local fixture constants directly at
  top level; a separate sidecar constants file is optional, not mandatory.
- This test-owner exception includes suite-unique fixture filenames, labels,
  timestamps, IDs, and timezone values, as long as they are defined once as
  named constants and the rest of the suite composes from those names.
- Test files do not need exhaustive hoisting of one-off fixture literals.
  Hoist repeated or semantically important suite-local values; do not force a
  test to turn every single literal into ceremony.
- Required language or runtime syntax that cannot be imported from a constants
  module, such as a Unix shebang line, is exempt from this rule.
- If a scalar has no clear owner yet, stop and define the owner first.
  Do not inline it “for now”.
- Before creating a new constant, search for an existing one with the same
  value or meaning.
- Outside the canonical owner module, reuse the exported constant. Do not
  duplicate the literal under a second name.

### 4.1.1 Semantic Decision Boundaries Must Use Explicit State Models

- When one semantic outcome depends on multiple signals, the code must not use
  a bag of independent `if` statements.
- Required structure:
  1. collect evidence into one snapshot
  2. normalize the snapshot
  3. use one explicit state model or decision table
  4. emit one canonical outcome and reasons
- This rule is mandatory when:
  - more than one live signal affects readiness, admission, retryability,
    phase, or lifecycle
  - more than two booleans are needed to explain one outcome
  - one function sets the same semantic result in multiple branches
  - the same semantic decision is recomputed in multiple consumers
- Small local guards and one-off validation checks are allowed.
- Branch piles, boolean exemption chains, and absence-as-phase are not.

### 4.2 Single Naming

- Each concept gets ONE name. Do not introduce synonyms.
- If the codebase calls it `type`, do not also call it `operation` or `kind`.
- If the codebase calls it `nodeId`, do not also accept `node_id` or `id`.
- When accessing a property, there must be exactly one way to get it.

### 4.3 Error Handling

- Do NOT use try/catch for control flow or conditional logic.
- Caught errors MUST be either re-thrown or clearly logged. Never swallowed.
- Transient errors (no leader, cache unavailable) trigger retries with backoff,
  but retries MUST be bounded by the caller's timeout budget (see §1.9).
  Unbounded retry loops that eventually exhaust a timeout are §1.10 violations,
  not acceptable retry behavior.

### 4.4 Style

- Follow Google's JavaScript style guide (enforced by ESLint).
- NEVER add eslint-disable comments. Not inline, not file-level. Never.
- NEVER modify the ESLint configuration.
- 2-space indentation, single quotes, semicolons, max 100 chars per line.
- Prefix unused parameters with underscore (e.g., `_unused`).

### 4.5 File Organization

- Prefer small files that focus on one thing.
- Break logic into smaller files/functions when it improves clarity.
- Each file should have a clear, single responsibility.

---

## 5. Architecture Documentation

- When changes are made to the system, update `architecture.md` to reflect
  them.
- `architecture.md` is the canonical root entrypoint for describing the system:
  component ownership, runtime boundaries, data flow, and architectural rules.
- Supporting system-description documents may live under the root
  `architecture/` directory when one file is no longer enough. Those files are
  internal architecture documents, not end-user docs, and they must be linked
  from `architecture.md`.
- When a feature is implemented or a capability status changes, update
  `roadmap.md` to reflect the new status.
- When a completed feature changes user-facing behavior, capabilities, or
  system architecture visible to users, update `README.md` to reflect the
  current state.
- The `docs/` directory is for end-user documentation only.
- The `examples/` directory is for end-user examples only. Examples may support
  `docs/`, but they must remain user-facing rather than internal design notes
  or experiments.
- `.kiro/specs/` is for specs only: requirements, design, tasks, rollout, and
  other implementation-planning artifacts for active or archived workstreams.
- Internal engineering specs and implementation plans belong in `.kiro/specs/`,
  not `docs/` or `examples/`.

### 5.1 Architectural Exceptions Must Be Recorded

Architectural exceptions are allowed only when they are explicit, owned, and
time-bounded.

- Every exception must name one owning workstream or maintainer.
- Every exception must be recorded in an active `.kiro/specs/<workstream>/`
  document, or in a linked architecture note if no active spec exists.
- Every exception record must include:
  - the exact rule boundary being excepted
  - why the normal rule cannot be used yet
  - the removal checkpoint or closure condition
- Unrecorded architectural exceptions are not allowed.

---

## 6. Summary of What NOT to Do

This section exists because LLMs tend to generate these patterns. Do not:

- Add a `nodeStatus` field when `nodeState` already exists.
- Create `getLeaderAddress()` in a new file when `SystemCacheProxy` already does it.
- Build a `ReplicaTracker` when `ReplicaStateMachine` already tracks replicas.
- Add an in-memory Map of partition assignments when the system cache has them.
- Write a second CDC handler for the same event type.
- Create a "convenience" re-export that subtly changes behavior.
- Add a `utils/` function that reimplements logic from a domain module.
- Introduce `async retryWithBackoff()` when one already exists elsewhere.
- Store derived state (like "is this node ready?") when it can be computed from
  the single source of truth on demand.
- Accept `replicaStateMachine` and then write `services` rows directly anyway.
- Use a status updater to insert a missing row "for safety".
- Rewrite `raft_role` from cache in a lifecycle/status code path.
- Use one row shape for initial insert and another partial/incompatible shape in
  later replace/upsert paths.
- Let bootstrap-only write helpers remain reachable from normal runtime logic.
- Execute progression logic directly from event handlers while a second timer
  loop mutates the same owner key.
- Mix cache and SQL fallback reads for one semantic decision path.
- Start nested waits with fresh timeout constants after part of the budget is
  already consumed.
- Treat exact-boundary timeout clusters as expected runtime behavior.
- Accept load-induced query failures as normal when the system is under
  control-plane pressure (splits, rebalance, elections).
- Convert slow-but-progressing operations into hard timeout errors without
  structured retry or backpressure.
- Accept unbounded in-flight work with no queue limit, then wonder why
  callers time out under load.
- Return a hard query failure because a partition is mid-split when other
  replicas can serve the request.
- Design a write operation where retrying it produces a different result
  than the first execution.
- Inline raw string, number, `null`, or `undefined` values in domain/runtime
  logic when an owner constant or explicit state variant should exist.
- Build one readiness/admission/retryability/phase outcome from several
  independent `if` statements instead of one snapshot and explicit state model.

When you catch yourself about to do any of these: stop, search, reuse.

If you run into long periods of failures or have a hard time implementing
something, take a step back and consider whether changing the local
architecture in some way would make your current task easier while still
adhering to all other rules.
In that case, bring it to attention and come with a suggestion instead of just plodding on.

## 7. User-Facing Model Discipline

The platform should preserve a small external ontology.

### 7.1 Tables and Services Are Primary User Concepts

Prefer expressing durable user state as tables.

Prefer expressing durable user execution as services.

Do not introduce new user-visible entity categories unless explicitly required by the platform design.

### 7.2 Internal Machinery Must Not Leak

It is FORBIDDEN to expose internal implementation concepts as ordinary user-facing control surfaces unless explicitly intended by the architecture.

Examples of internal machinery include:

partitions

replica operations

leader election

rebalance workflows

message groups

cache hydration

control-plane reconcile queues

Users may observe diagnostics about these mechanisms, but must not be required to manage them directly in ordinary workflows.

### 7.3 Policy Over Direct Physical Control

Expose desired behavior through policies and declarative intent.

Do not add APIs that require users to directly assign partitions, leaders, replicas, or rebalance targets.

If a new API directly manipulates internal placement or lifecycle machinery, treat it as an architectural exception and justify it explicitly.

### 7.4 Runtime Variety Must Preserve One Service Concept

Different runtime kinds (native_js, wasm_component, oci_container) are implementation choices for services, not separate user-visible ontological classes.

Do not fragment the service model into multiple incompatible conceptual categories unless explicitly designed and documented as such.
