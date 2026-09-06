# Core System Logic Contract

> **Reading this contract.** The block immediately below is the machine-readable
> `system-contract` consumed by `npm run model:contracts` — you do not need to
> read the JSON. For the human narrative, jump to
> [Operational Analysis](#operational-analysis); the
> [Failure Classes](#failure-classes), [Invariants](#invariants),
> [Runtime Bindings](#runtime-bindings), and [Model Bindings](#model-bindings)
> sections render the same contract in prose.

<!-- system-contract
{
  "schema": "system-contract-v1",
  "contractId": "core-system-logic",
  "status": "active",
  "owners": [
    {
      "owner": "architecture_owner",
      "boundary": "core_system_logic"
    }
  ],
  "failureClasses": [
    "architecture documents can change owner boundaries without updating adjacent executable models",
    "callers can reproduce owner logic locally when the architecture-level owner flow is implicit",
    "observers, caches, diagnostics, admin views, or harness reports can become accidental semantic owners",
    "temporary bootstrap, join, or recovery phase owners can remain reachable after steady-state handoff",
    "stale observer projections can promote readiness or admission after the owner epoch has moved",
    "durable owner transitions can strand follow-up work if enqueue or wake delivery is not recoverable",
    "non-shrinking retry evidence can keep authorizing another local retry instead of a blocked model route"
  ],
  "stateVariables": [
    "ingressShape",
    "normalizedConcern",
    "semanticOwner",
    "ownerBoundary",
    "authoritativeEvidence",
    "contractState",
    "nextAction",
    "durableTransition",
    "observerProjection",
    "phaseOwner"
  ],
  "safetyInvariants": [
    {
      "id": "single-semantic-owner",
      "statement": "Every state transition, lifecycle decision, data transformation, cache view, diagnostic grammar, and runtime resource has exactly one semantic owner."
    },
    {
      "id": "normalized-state-only",
      "statement": "Runtime logic consumes normalized state and does not reopen raw storage, transport, bootstrap, cache, or wire shapes."
    },
    {
      "id": "owner-outcome-before-observer",
      "statement": "An owner emits one canonical outcome before observers, caches, diagnostics, admin views, or harness reports project the result."
    },
    {
      "id": "readers-do-not-repair-authority",
      "statement": "Reader-local caches, diagnostics, and reports do not repair or replace authoritative owner state on the hot path."
    },
    {
      "id": "degraded-evidence-never-upgrades-readiness",
      "statement": "Degraded or cross-plane evidence can explain, defer, or block, but cannot upgrade readiness or admission."
    },
    {
      "id": "stale-projection-never-promotes-readiness",
      "statement": "A stale observer projection cannot promote readiness, admission, or owner progress across handoff boundaries."
    },
    {
      "id": "durable-transition-has-recoverable-wake",
      "statement": "Every durable owner transition that requires follow-up work has an atomic, recoverable, or replayable wake before observers depend on it."
    },
    {
      "id": "single-canonical-outcome",
      "statement": "Every retry, rerun, handoff, or observer evidence combination emits exactly one owner-owned canonical action."
    },
    {
      "id": "non-shrinking-evidence-blocks-local-retry",
      "statement": "Repeated local retry with non-shrinking evidence cannot authorize another local retry."
    },
    {
      "id": "deferred-followup-has-recoverable-wake",
      "statement": "Deferred follow-up work exits through a recoverable wake while retry budget remains available."
    }
  ],
  "livenessExpectations": [
    {
      "id": "phase-owner-handoff-completes",
      "statement": "Temporary bootstrap, join, recovery, and migration owners transfer responsibility to explicit steady-state owners before phase completion."
    }
  ],
  "knownResiduals": [
    "This is a low-resolution architecture model; high-resolution protocol models remain bound by narrower contracts such as active-gate convergence.",
    "The model names the required owner flow, but individual subsystem contracts still need their own focused TLA+, decision-table, property-test, or statechart bindings."
  ],
  "systemTheory": {
    "problemStatement": "The whole runtime should behave like a single-owner reconcile system: normalized intent enters one owner, that owner emits one canonical outcome, and observers project the result without becoming authorities.",
    "phaseChain": [
      "ingress is normalized into shared architecture vocabulary",
      "exactly one semantic owner and boundary are selected",
      "the owner resolves authoritative evidence or typed dependency gaps",
      "the owner emits one canonical outcome and persists owner-managed transitions",
      "observers project the outcome and temporary phase owners hand off to steady-state owners"
    ],
    "ownerBoundaryMap": [
      "architecture_owner / core_system_logic owns the low-resolution model and architecture adjacency rule",
      "runtime_contract_owner / owner_outcome_envelope owns the shared contractState and nextAction envelope",
      "control-plane owner-key queues own enqueue-only progression for event-driven reconciliation",
      "startup runtime handoff owners transfer bootstrap, join, and recovery phase work to steady-state runtime owners"
    ],
    "invariantRefs": [
      "single-semantic-owner",
      "normalized-state-only",
      "owner-outcome-before-observer",
      "readers-do-not-repair-authority",
      "degraded-evidence-never-upgrades-readiness",
      "phase-owner-handoff-completes",
      "stale-projection-never-promotes-readiness",
      "durable-transition-has-recoverable-wake",
      "single-canonical-outcome",
      "non-shrinking-evidence-blocks-local-retry",
      "deferred-followup-has-recoverable-wake"
    ]
  },
  "runtimeBindings": [
    {
      "path": "src/control-plane/owner-contract-outcome.js",
      "owner": "runtime_contract_owner",
      "boundary": "owner_outcome_envelope",
      "transition": "shared contractState and nextAction envelope for owner outcomes"
    },
    {
      "path": "src/workflow/owner-key-reconcile-queue.js",
      "owner": "control_plane_reconcile_owner",
      "boundary": "owner_key_reconcile",
      "transition": "enqueue-only owner-key progression with single in-flight execution per owner key"
    },
    {
      "path": "src/control-plane/read-model-contract.js",
      "owner": "read_model_contract_owner",
      "boundary": "observer_projection",
      "transition": "read-model contract consumers observe canonical owner state without replacing the owner"
    },
    {
      "path": "src/control-plane/control-plane-readiness-snapshot-store.js",
      "owner": "read_model_contract_owner",
      "boundary": "membership_publication_planning_projection",
      "transition": "a cluster-wide nodes/services/partitions/publications source revision fences memoized priority summaries while per-node readiness invalidation remains node-scoped"
    },
    {
      "path": "src/control-plane/control-plane-readiness-service.js",
      "owner": "control_plane_readiness_owner",
      "boundary": "readiness_gating",
      "transition": "readiness decisions consume canonical owner evidence and emit blocked or deferred outcomes instead of upgrading on degraded evidence"
    },
    {
      "path": "src/bootstrap/owners/startup-runtime-handoff-owner.js",
      "owner": "startup_runtime_handoff_owner",
      "boundary": "phase_to_steady_state_handoff",
      "transition": "startup and recovery phase work transfers to steady-state runtime ownership before completion"
    }
  ],
  "modelBindings": [
    {
      "kind": "alloy-model",
      "artifact": "architecture/models/alloy/core-system-logic.als",
      "properties": "structural ownership constraints for single semantic owner, normalized ingress, observer non-authority, and degraded evidence non-promotion"
    },
    {
      "kind": "statechart",
      "artifact": "architecture/models/statecharts/core-system-logic.json",
      "properties": "low-resolution core owner flow from normalized ingress through owner outcome, observer projection, and steady-state handoff"
    },
    {
      "kind": "decision-table",
      "artifact": "architecture/models/decision-tables/bounded-retry-exit-routing.json",
      "properties": "bounded retry and handoff exit routing so repeated or non-shrinking evidence cannot authorize unbounded local retries"
    },
    {
      "kind": "state-model",
      "artifact": "architecture/models/traces/core-owner-trace-examples.json",
      "properties": "valid and forbidden owner traces for owner outcome ordering, projection freshness, serviceability gating, recoverable wake, and observer non-repair"
    }
  ],
  "metrics": [
    {
      "name": "architecture model-contract gate",
      "probe": "npm run model:contracts"
    },
    {
      "name": "architecture Alloy gate",
      "probe": "npm run model:alloy"
    },
    {
      "name": "architecture statechart gate",
      "probe": "npm run model:statecharts"
    },
    {
      "name": "architecture owner trace gate",
      "probe": "npm run model:owner-traces"
    }
  ],
  "questRefs": [
    "solve/quests/core-system-logic-model-adjacency/quest.json",
    "solve/quests/model-projection-freshness-epoch-fencing/quest.json",
    "solve/quests/model-owner-transition-recoverable-wake/quest.json",
    "solve/quests/model-bounded-retry-exit-routing/quest.json",
    "solve/quests/model-owner-trace-validation/quest.json"
  ],
  "theoryLedgerRefs": [
    "theory-20260529-rolling-restart-active-gate-priority-recovery-coupled-invariants"
  ],
  "failureAnalysis": {
    "fmea": [
      {
        "failureMode": "architecture owner-flow changes without adjacent model update",
        "severity": "high - future runtime work can pass local tests while violating the single-owner system shape",
        "detectability": "high - model:contracts validates contract records and architecture-owned statecharts together",
        "mitigation": "keep the core-system-logic contract and architecture/models statechart updated with architecture owner-map changes",
        "probe": "npm run model:contracts"
      },
      {
        "failureMode": "observer projection becomes a second authority",
        "severity": "high - caches or diagnostics can silently override owner outcomes",
        "detectability": "medium - Alloy forbidden-shape runs reject reader repair, observer-before-owner-outcome, and degraded-readiness-promotion relations",
        "mitigation": "bind read-side consumers to owner outcome grammar and fail closed on missing owner evidence",
        "probe": "npm run model:alloy"
      },
      {
        "failureMode": "stale projection or lost wake creates false readiness or stranded follow-up work",
        "severity": "high - startup and recovery can appear green while required owner work is stale or unwoken",
        "detectability": "high - Alloy, statechart, owner-trace, and decision-table gates reject stale promotion, missing wake, and unbounded retry shapes",
        "mitigation": "preserve owner epochs and recoverable wakes in the core owner flow and route repeated evidence to blocked or migration outcomes",
        "probe": "npm run model:contracts"
      }
    ],
    "stpa": [
      {
        "controller": "architecture_owner",
        "unsafeAction": "accepts a subsystem architecture change that bypasses normalized ingress, single owner selection, or phase-owner handoff",
        "feedbackSignal": "model-contract gate output, architecture/current-owner-maps.md changes, and subsystem contract records",
        "ownerBoundary": "architecture_owner / core_system_logic"
      },
      {
        "controller": "runtime_contract_owner",
        "unsafeAction": "lets degraded, stale, missing, or observer-only evidence upgrade readiness or admission",
        "feedbackSignal": "contractState, nextAction, readiness diagnostics, and owner-specific evidence",
        "ownerBoundary": "runtime_contract_owner / owner_outcome_envelope"
      },
      {
        "controller": "architecture_owner",
        "unsafeAction": "accepts retry or observer-flow changes that lose owner wake delivery, omit epoch freshness, or repeat non-shrinking local evidence",
        "feedbackSignal": "bounded retry decision table, owner trace suite, statechart forbidden transitions, and model-contract gate output",
        "ownerBoundary": "architecture_owner / core_system_logic"
      }
    ]
  }
}
-->

## Failure Classes

This contract covers core system logic drift: architecture text changes a
semantic owner, normalized ingress, read-side projection, or phase handoff
without updating an executable architecture-owned model.

## Invariants

The core model asserts one semantic owner per concern, normalized-state-only
runtime decisions, owner outcomes before observer projection, read-side
non-repair, fail-closed readiness, and completed handoff from temporary phase
owners to steady-state runtime owners.

## Runtime Bindings

The runtime bindings are representative core surfaces rather than an exhaustive
subsystem map: the owner outcome envelope, owner-key reconcile queue, read-model
contract, readiness service, and startup runtime handoff owner. Narrower
contracts remain responsible for their domain-specific runtime files.

## Model Bindings

`architecture/models/alloy/core-system-logic.als` is the low-resolution
structural model for ownership relations and forbidden architecture shapes. Its
valid-shape run must be `SAT`, forbidden-shape runs must be `UNSAT`, and
assertion checks must be `UNSAT` because Alloy found no counterexample within
the command scope. `architecture/models/statecharts/core-system-logic.json`
remains the lifecycle flow model. Both live under `architecture/models` so
architecture changes and model changes are reviewed together. Higher-resolution
protocol models, such as the active-gate TLA+ model, remain bound through their
own contracts.

## Operational Analysis

FMEA/STPA treat the architecture itself as the controller for the core logic
shape. The unsafe actions are accepting owner-flow drift without model updates
and allowing observer-only or degraded evidence to become readiness authority.
Membership-publication priority summaries are cluster-wide projections: every
node, service, partition, or publication change advances their source revision,
even though ordinary readiness snapshot invalidation remains per-node.
`npm run model:contracts` is the gate that keeps the architecture record,
statechart, invariant registry, and narrower protocol models aligned.
