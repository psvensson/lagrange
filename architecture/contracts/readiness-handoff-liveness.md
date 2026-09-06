# Readiness Handoff Liveness Contract

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
  "contractId": "readiness-handoff-liveness",
  "status": "active",
  "owners": [
    {
      "owner": "startup_runtime_handoff_owner",
      "boundary": "readiness_handoff"
    }
  ],
  "failureClasses": [
    "startup active admission can declare the cluster usable before SQL serviceability is true for the canonical leader",
    "query transport serviceability can lag readiness promotion and turn probe success into a false green signal",
    "observer projections can use stale owner epochs during startup, recovery, or handoff",
    "deferred handoff outcomes can be committed without a recoverable wake, stranding follow-up work"
  ],
  "stateVariables": [
    "phase",
    "sqlServiceable",
    "queryServiceable",
    "ownerEpoch",
    "observedEpoch",
    "ownerOutcome",
    "wakeQueued"
  ],
  "safetyInvariants": [
    {
      "id": "ready-requires-serviceable-canonical-leader",
      "statement": "Startup readiness cannot become active before SQL and query transport serviceability are true for the canonical leader and the observed owner epoch is fresh."
    },
    {
      "id": "stale-projection-never-promotes-readiness",
      "statement": "A stale observer projection cannot promote readiness, admission, or owner progress across handoff boundaries."
    },
    {
      "id": "durable-transition-has-recoverable-wake",
      "statement": "Every durable owner transition that requires follow-up work has an atomic, recoverable, or replayable wake before observers depend on it."
    }
  ],
  "livenessExpectations": [
    {
      "id": "startup-handoff-eventually-terminal",
      "statement": "Every deferred startup readiness handoff eventually reaches ready, blocked, or escalated under fair progress and recoverable wakes."
    }
  ],
  "knownResiduals": [
    "The model is intentionally low-resolution and does not encode individual SQL statements, WebSocket transport details, or node-specific retry timers.",
    "Runtime Quests must still prove the concrete serviceability evidence path and affected harness tail consumers."
  ],
  "systemTheory": {
    "problemStatement": "Startup readiness behaves like a controller handoff: the owner may promote ready only when canonical SQL and query transport evidence are serviceable at a fresh owner epoch, and deferred handoff work must have a recoverable wake.",
    "phaseChain": [
      "startup handoff begins with pending or missing serviceability evidence",
      "SQL and query transport serviceability become true for the canonical leader",
      "the owner outcome advances at a new owner epoch and projection catches up to that epoch",
      "readiness either promotes ready or emits blocked/deferred/escalated with a recoverable wake"
    ],
    "ownerBoundaryMap": [
      "startup_runtime_handoff_owner / readiness_handoff owns startup active admission and phase-to-runtime handoff",
      "control_plane_readiness_owner / readiness_gating observes canonical owner evidence but cannot upgrade stale or degraded evidence",
      "read_model_contract_owner / observer_projection projects owner outcomes after epoch freshness is verified"
    ],
    "invariantRefs": [
      "ready-requires-serviceable-canonical-leader",
      "stale-projection-never-promotes-readiness",
      "durable-transition-has-recoverable-wake",
      "startup-handoff-eventually-terminal"
    ]
  },
  "runtimeBindings": [
    {
      "path": "src/bootstrap/owners/startup-runtime-handoff-owner.js",
      "owner": "startup_runtime_handoff_owner",
      "boundary": "readiness_handoff",
      "transition": "startup and recovery phase work transfers to steady-state runtime ownership before ready admission"
    },
    {
      "path": "src/bootstrap/shared/startup-sql-runtime-handoff.js",
      "owner": "startup_runtime_handoff_owner",
      "boundary": "readiness_handoff",
      "transition": "SQL serviceability evidence for startup runtime handoff"
    },
    {
      "path": "src/bootstrap/shared/local-query-transport-readiness.js",
      "owner": "startup_runtime_handoff_owner",
      "boundary": "readiness_handoff",
      "transition": "query transport serviceability evidence for startup runtime handoff"
    },
    {
      "path": "src/control-plane/read-model-contract.js",
      "owner": "read_model_contract_owner",
      "boundary": "observer_projection",
      "transition": "read-side projections observe canonical owner state and freshness instead of becoming readiness authority"
    }
  ],
  "modelBindings": [
    {
      "kind": "tla-spec",
      "artifact": "models/readiness-handoff/ReadinessHandoff.tla",
      "properties": "temporal safety and liveness for startup readiness, serviceability gating, projection freshness, and recoverable wakes"
    }
  ],
  "metrics": [
    {
      "name": "readiness handoff TLC model check",
      "probe": "npm run model:tlc"
    },
    {
      "name": "architecture model-contract gate",
      "probe": "npm run model:contracts"
    }
  ],
  "questRefs": [
    "solve/quests/model-readiness-handoff-liveness/quest.json",
    "solve/quests/rolling-restart-core-stability/quest.json"
  ],
  "theoryLedgerRefs": [
    "theory-20260526-rolling-restart-selected-snapshot-source-staleness",
    "theory-20260526-rolling-restart-selected-view-best-view-evidence-gap",
    "theory-20260526-rolling-restart-restarted-node-admin-surface"
  ],
  "failureAnalysis": {
    "fmea": [
      {
        "failureMode": "readiness promotes before canonical SQL and query transport serviceability",
        "severity": "high - rolling restart can report green while user traffic or query routing still fails",
        "detectability": "high - ReadinessHandoff unsafe TLC config violates ready-requires-serviceable-canonical-leader",
        "mitigation": "gate ready promotion on canonical serviceability evidence and fresh owner epoch",
        "probe": "npm run model:tlc"
      },
      {
        "failureMode": "deferred startup handoff commits without recoverable wake",
        "severity": "high - follow-up work can strand and leave probes waiting until timeout",
        "detectability": "high - ReadinessHandoff lost-wake TLC config violates durable-transition-has-recoverable-wake",
        "mitigation": "make deferred handoff outcomes enqueue, replay, or recover owner-key wake state before observers depend on them",
        "probe": "npm run model:tlc"
      }
    ],
    "stpa": [
      {
        "controller": "startup_runtime_handoff_owner",
        "unsafeAction": "promotes active startup readiness from stale projection, partial serviceability, or missing wake evidence",
        "feedbackSignal": "SQL serviceability, query transport serviceability, ownerEpoch, observedEpoch, ownerOutcome, wakeQueued",
        "ownerBoundary": "startup_runtime_handoff_owner / readiness_handoff"
      }
    ]
  }
}
-->

## Failure Classes

This contract covers startup readiness handoff failures where owner evidence can
look locally green while canonical SQL serviceability, query transport
serviceability, projection freshness, or recoverable wake delivery is still
missing.

## Invariants

Ready admission requires SQL and query transport serviceability for the
canonical leader and a fresh observed owner epoch. Deferred handoff work must
retain a recoverable wake. Under fair progress, the handoff reaches ready,
blocked, or escalated instead of waiting forever.

## Runtime Bindings

The runtime bindings name the startup handoff owner, SQL serviceability source,
query transport readiness source, and read-model projection contract. Concrete
runtime Quests must prove affected tail consumers when they edit these paths.

## Model Bindings

`models/readiness-handoff/ReadinessHandoff.tla` contains a bounded safe route
and two forbidden configurations: unsafe readiness promotion and lost wake. The
TLC runner executes all three through `npm run model:tlc`.

## Operational Analysis

FMEA/STPA model the startup handoff owner as the controller. Unsafe actions are
premature readiness promotion and committing deferred work without a recoverable
wake. These are the coarse stability risks identified from controller,
workflow, and trace-validation systems.
