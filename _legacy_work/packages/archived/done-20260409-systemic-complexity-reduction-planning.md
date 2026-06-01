# Systemic Complexity Reduction Plan

This document defines the step-by-step plan for detecting the full set of
changes needed to reduce control-plane complexity, unify implementation
methods, and improve understandability without trading correctness for speed.

It is a detection-and-execution plan, not just a list of principles. The goal
is to produce a complete inventory of required changes and then drive those
changes through one repeatable rollout method.

This plan is guided by:

- [`.kiro/steering/doctrine.md`](../../.kiro/steering/doctrine.md)
- [`architecture/current-owner-maps.md`](../../architecture/current-owner-maps.md)
- [`docs/admission-decision-model.md`](../../docs/admission-decision-model.md)

The governing intent is simple:

1. One concern has one semantic owner.
2. One semantic decision uses one read path and one adjudicator.
3. Durable workflows are explicit state machines.
4. Shared policy decisions are explicit snapshots plus one decision function.
5. Under pressure the system may slow down or defer, but it must not become
   less correct.

## 1. Target Outcomes

This plan is complete only when the codebase has fewer ways to answer the same
question and fewer ways to advance the same workflow.

The expected end state is:

1. One canonical active-membership and recovery-cohort model.
2. One canonical priority-recovery admission plan.
3. One canonical operation progression path for owner-managed topology work.
4. One canonical late-response lifecycle model in transport.
5. Fewer branch lattices and more explicit state models.
6. Fewer duplicated helpers and fewer special-case ingress paths.
7. Complexity ratchet tightened after each completed simplification batch.

## 2. Rules For This Workstream

Use these rules to decide whether a finding requires a code change:

1. If two modules answer the same semantic question, one of them must stop.
2. If a decision depends on several live signals and is expressed as repeated
   booleans or `if` chains, it must become a normalized snapshot and one
   adjudicator.
3. If a workflow can advance through more than one owner path, it must be
   collapsed to one canonical progression entry point.
4. If bootstrap or phase logic remains semantically necessary after handoff,
   the handoff is incomplete.
5. If a fix requires another exception branch to preserve correctness, first
   ask whether the missing concept is actually a state, reason code, or owner
   boundary.
6. If diagnostics reconstruct truth differently from runtime owners, the read
   model is wrong.

## 3. Required Artifacts

Before code changes begin, create or update these artifacts during detection:

1. A concern inventory.
2. A semantic-question matrix.
3. An owner map delta against `architecture/current-owner-maps.md`.
4. An implicit-state-machine inventory.
5. A duplicated-decision inventory.
6. A branch-lattice inventory for hotspots.
7. A rollout sequence with one concern per batch.

The artifacts may live in one working note or several documents, but they must
exist before the full simplification rollout starts.

## 4. Detection Workflow

Follow these steps in order.

### Step 1: Build The Concern Inventory

List the durable concerns that currently matter to control-plane correctness.

For each concern, record:

1. Semantic question being answered.
2. Current semantic owner.
3. Read paths used today.
4. Write paths used today.
5. Downstream consumers.
6. Current known failures.

The initial concern set should include at least:

1. Active membership and recovery cohort.
2. Membership publication.
3. Node readiness and control-plane recovery eligibility.
4. Priority recovery admission and budget reservation.
5. Replica-operation lifecycle progression.
6. Dispatch ownership and retry/rearm behavior.
7. Bootstrap-to-runtime handoff.
8. Split/bootstrap/cutover workflow safety.
9. Transport request/response lifetime.
10. Pressure and admission behavior at control-plane boundaries.

Output:

- A table with one row per concern.

Completion criteria:

- Every repeated red harness signature maps to at least one concern row.

### Step 2: Build The Semantic-Question Matrix

For each concern, write the exact semantic question being asked by the system.

Examples:

1. Which nodes count as active for control-plane publication right now?
2. Which nodes are recovery-eligible but not yet published?
3. Is priority recovery globally active right now?
4. May this partition consume an add slot right now?
5. What is the next legal state for this replica operation?
6. What should this late service response mean?

Then find every file that answers each question.

Use:

```bash
rg -n "resolveActiveNodeViews|resolveCanonicalActiveNodeIds|buildPriorityRecoveryPublicationContext|resolvePriorityRecoveryAdmissionPlanFromPublication|reconcileOperationLifecycle|handleServiceResponse" src test
```

Output:

- One matrix: `question -> files -> helper names -> owner`.

Completion criteria:

- Every question has one preferred owner and all parallel answerers are visible.

### Step 3: Detect Duplicate Ownership

Mark any question as a required refactor when:

1. More than one module computes the same verdict.
2. One module computes the verdict and another reconstructs it from raw rows.
3. Planning and diagnostics use different truth models.
4. Runtime and bootstrap both remain effective owners after handoff.

Current likely duplicate-owner hotspots are:

1. Active membership and recovery cohort.
2. Priority recovery admission.
3. Operation progression ingress.
4. Transport late-response classification and retirement.

Output:

- A duplicated-owner inventory ordered by risk.

Completion criteria:

- Every duplicated owner is classified as either:
  - remove
  - merge
  - wrap behind canonical snapshot

### Step 4: Detect Implicit State Machines

Inspect each hotspot and extract the real state model from the code.

A concern contains an implicit state machine when:

1. Behavior depends on combinations of booleans, lists, or status strings.
2. Transition rules are spread across several functions.
3. Recovery logic uses different state rules than steady-state logic.
4. Retryability is inferred ad hoc instead of encoded in the model.

For each implicit state machine, record:

1. States currently represented.
2. Missing explicit states.
3. Inputs and evidence classes.
4. Legal transitions.
5. Terminal states.
6. Retryable vs non-retryable blockers.

Priority candidates:

1. Active membership / recovery inclusion.
2. Priority admission.
3. Replica-operation progression.
4. Split child bootstrap/cutover.
5. Late response retirement/disposition.

Output:

- One extracted state table per hotspot.

Completion criteria:

- Every hotspot can be described as a small explicit state model instead of a
  narrative about helper interactions.

### Step 5: Detect Branch Lattices

Run a branch-lattice pass over the hotspot files.

Flag functions for simplification when they have one or more of:

1. Repeated checks of the same field or concept.
2. Several boolean knobs controlling related behavior.
3. Fallback logic mixed with policy logic.
4. Read, normalize, adjudicate, and act all in one function.
5. More than one special case for the same concern.

Use:

```bash
npm run test:complexity
npm run test:deps
rg -n "if \\(|else if|switch \\(" src/control-plane src/rebalancer src/bootstrap src/transport
```

Do not use the complexity count alone as the signal. The real signal is
semantic repetition.

Output:

- A branch-lattice inventory with candidate replacements:
  - explicit state machine
  - decision snapshot + adjudicator
  - canonical gateway
  - owner-key reconcile queue

Completion criteria:

- Each high-complexity hotspot has a proposed replacement shape, not just a
  warning.

### Step 6: Detect Mixed Observation And Policy

For each multi-signal decision boundary, separate:

1. Observation.
2. Normalization.
3. Adjudication.
4. Action.

If any function performs all four, it needs structural change.

Apply this directly to:

1. Membership publication candidate derivation.
2. Readiness decisions involving recovery eligibility.
3. Priority admission and budget reservation.
4. Split cutover safety.
5. Transport response retirement and warning behavior.

Use the model in [`docs/admission-decision-model.md`](../../docs/admission-decision-model.md).

Output:

- A per-boundary note listing current collector logic, current policy logic,
  and the intended split.

Completion criteria:

- Each boundary has one planned snapshot builder and one planned adjudicator.

### Step 7: Detect Read/Write Ingress Multiplicity

For each concern, list every effective ingress.

Required questions:

1. How many write ingress paths exist?
2. How many read ingress paths exist for the same semantic decision?
3. Are degraded or fallback paths still able to promote correctness-critical
   decisions?
4. Are there old compatibility paths still acting as owners?

This step should explicitly check:

1. Membership publication reads.
2. Readiness and authoritative repair.
3. Priority admission reads.
4. Replica-operation creation, claim, dispatch, outcome, reconcile, timeout,
   and recovery re-entry.
5. Late response retirement and unmatched warning paths.

Output:

- One ingress map per concern.

Completion criteria:

- Each concern names one canonical ingress and all non-canonical paths are
  marked for removal, wrapping, or downgrade.

### Step 8: Detect Phase-To-Runtime Leakage

Inspect bootstrap, join, and rejoin paths for logic that remains semantically
necessary after the phase should have completed.

Look for:

1. Phase-owned retries that still uphold runtime correctness.
2. Phase-specific subscribers or bridges still required in steady state.
3. Phase completion that leaves runtime without a canonical owner.
4. Runtime code that still depends on phase-local conventions.

Current likely hotspot:

1. `NODE_STATE_UPDATE` target resolution and publication path.

Output:

- A handoff gap inventory.

Completion criteria:

- Every phase either fully hands off to a runtime owner or is marked for
  refactor.

### Step 9: Detect Diagnostic Truth Drift

Compare runtime owners with admin, readiness, and failure diagnostics.

A diagnostic surface is drifting when:

1. It recomputes a verdict from raw rows instead of consuming the owner model.
2. It reports a different cohort, admission state, or blocker set than the
   runtime owner.
3. It needs special-case knowledge of several internals to explain one state.

Check:

1. Admin control snapshot.
2. Membership publication diagnostics.
3. Priority recovery diagnostics.
4. Failure bundle synthesis.

Output:

- A diagnostic drift list.

Completion criteria:

- Diagnostics are consumers of canonical models, not parallel interpreters.

### Step 10: Produce The Required Refactor Batches

Convert the inventories above into executable batches. Each batch must own one
semantic simplification, not a pile of symptoms.

Each batch must include:

1. Concern.
2. Current owner and duplicate owners.
3. Target model shape.
4. Files to change.
5. Files to delete or downgrade.
6. Tests to add first.
7. Harness scenarios affected.
8. Success criteria.

Use this batch order unless new evidence strongly contradicts it:

1. Canonical priority-recovery admission plan.
2. Canonical active-membership and recovery-cohort snapshot.
3. Canonical operation progression ingress and reconcile state machine.
4. Canonical transport late-response lifecycle model.
5. Bootstrap-to-runtime handoff cleanup.
6. Split/bootstrap/cutover explicit state model.

Output:

- One batch spec per concern.

Completion criteria:

- No batch mixes unrelated concerns.

## 5. Execution Workflow For Each Batch

After detection is complete for one batch, execute the batch using this fixed
method.

### Step A: Write The Model First

Before refactoring code, write down:

1. Canonical states.
2. Inputs.
3. Evidence classes.
4. Transition rules.
5. Reasons and diagnostics contract.

If the model cannot be written clearly, the refactor is not ready.

### Step B: Add Guardrail Tests First

Add tests that lock the intended model before removing old code.

Preferred tests:

1. Table-driven state/adjudication tests.
2. Owner-path regression tests.
3. Replay-based regression from known harness failures.
4. Negative tests proving degraded evidence cannot promote.
5. Duplicate-path closure tests proving old paths no longer answer the
   question independently.

### Step C: Collapse To One Owner Path

Refactor so that:

1. One snapshot builder exists.
2. One adjudicator exists.
3. One owner entry point applies the result.
4. Other callers consume the result instead of rebuilding it.

### Step D: Remove Parallel Paths

Delete or downgrade the previous helpers.

Allowed outcomes for old helpers:

1. Removed entirely.
2. Reduced to thin wrappers over the canonical path.
3. Kept only as adapters during a short migration boundary with explicit
   removal follow-up.

### Step E: Tighten Static Guardrails

After the batch passes:

1. Run `npm run test:complexity`.
2. Run `npm run test:deps`.
3. Tighten the complexity baseline in `scripts/check-complexity.js` if the
   violation count dropped.
4. Add or tighten any architecture guardrail tests introduced by the batch.

### Step F: Run Targeted Distributed Validation

Run only the distributed scenarios that exercise the concern changed in the
batch, then broaden.

Suggested sequence:

1. Concern-targeted deterministic tests.
2. Concern-targeted integration tests.
3. Previously red distributed scenarios.
4. Full distributed harness only after the high-risk batches land.

## 6. Detection Templates

Use the following templates during the detection pass.

### Concern Record

```md
Concern:
Semantic question:
Current owner:
Parallel owners:
Canonical read ingress:
Canonical write ingress:
Current state model:
Known failures:
Required simplification:
```

### Duplicate Decision Record

```md
Question:
Current answerers:
Why duplicated:
Target owner:
Removal strategy:
Tests needed:
```

### Implicit State Machine Record

```md
Concern:
Current inputs:
Observed states in code:
Missing explicit states:
Legal transitions:
Retryable blockers:
Terminal states:
Target model shape:
```

## 7. Current Known Hotspots

The current investigation already indicates these hotspots deserve immediate
coverage in the detection pass:

1. `src/control-plane/active-node-projection.js`
2. `src/control-plane/membership-publication-coordinator.js`
3. `src/control-plane/control-plane-readiness-service.js`
4. `src/control-plane/priority-recovery-snapshot.js`
5. `src/rebalancer/rebalance-coordinator.js`
6. `src/rebalancer/unified-rebalancer.js`
7. `src/rebalancer/operation-workflow-owner.js`
8. `src/bootstrap/node-joining-service.js`
9. `src/transport/message-router.js`
10. Split workflow files under `src/partition/`

## 8. Definition Of Done

This plan is complete only when all of the following are true:

1. Every hotspot concern has one explicit owner and one explicit model.
2. Parallel decision paths have been removed or wrapped behind the owner.
3. Diagnostics consume canonical owner outputs instead of reconstructing truth.
4. Complexity and dependency guardrails are tighter than before the work.
5. The distributed harness no longer reveals new failures at the same porous
   boundaries.
6. A new engineer can answer each hotspot semantic question by opening one
   owner module and one model definition, rather than tracing several helper
   paths.

## 9. Immediate Next Action

Start with the detection artifacts for these three concerns first:

1. Priority recovery admission.
2. Active membership and recovery cohort.
3. Replica-operation progression.

Those three currently have the highest leverage and the clearest evidence of
duplicate ownership and implicit state models.
