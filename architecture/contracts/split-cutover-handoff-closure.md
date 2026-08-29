# Split Cutover Handoff Closure Contract

<!-- system-contract
{
  "schema": "system-contract-v1",
  "contractId": "split-cutover-handoff-closure",
  "status": "active",
  "owners": [
    {
      "owner": "managed_split_workflow",
      "boundary": "split_cutover_handoff_closure"
    }
  ],
  "failureClasses": [
    "source cleanup progress can be mistaken for whole-plane source retirement authority",
    "plans created before a cutover barrier can outlive child readiness and fail after source descriptor deletion",
    "explicit transactions can retain source participants after their initiating statement returns",
    "membership or workflow-owner rotation can reuse stale query-plane acknowledgements",
    "a transport response timeout can lose the only wake after a query lease or transaction finishes"
  ],
  "stateVariables": [
    "workflowFenceToken",
    "handoffGeneration",
    "membershipPublicationEpoch",
    "requiredQueryNodeIncarnations",
    "activeQueryPlanLeases",
    "openTableTransactions",
    "queryPlaneAcknowledgements",
    "sourceReplayWatermark",
    "sourceDescriptorPresent"
  ],
  "safetyInvariants": [
    {
      "id": "split-source-retirement-has-one-owner",
      "statement": "ManagedSplitWorkflow is the only owner that records handoff_closed and authorizes source dissolution."
    },
    {
      "id": "split-cleanup-false-is-progress-only",
      "statement": "CLEANUP_COMPLETED with sourceMirrorRemoved false can persist replay progress but can never authorize source removal."
    },
    {
      "id": "split-source-retained-until-whole-plane-closure",
      "statement": "The source descriptor remains routable until replay is drained and every required query-serving incarnation acknowledges the exact fenced generation with no active plan lease or relevant open transaction."
    },
    {
      "id": "split-handoff-cohort-does-not-silently-shrink",
      "statement": "A captured query-serving incarnation remains required until an authoritative terminal status or a new boot incarnation proves the old process and its requests are gone."
    }
  ],
  "livenessExpectations": [
    {
      "id": "split-handoff-events-rearm-owner",
      "statement": "Cache publication, lease completion, transaction completion, and ready notifications re-arm the owner without an arbitrary delay or polling loop."
    },
    {
      "id": "split-waiting-plans-resume-after-terminal-clear",
      "statement": "Plans arriving behind an installed handoff barrier remain queued and re-plan against target-only metadata after terminal transition clear."
    }
  ],
  "knownResiduals": [
    "TLC proves the abstract two-node protocol; exact transport, cache, recovery, and live concurrent-write behavior still require deterministic guards and an exact-source GCP A/B."
  ],
  "runtimeBindings": [
    {
      "path": "src/partition/split-cutover-handoff-contract.js",
      "owner": "managed_split_workflow",
      "boundary": "split_cutover_handoff_closure",
      "transition": "shared versioned wire vocabulary for the workflow owner and subordinate node-local query-plane components"
    },
    {
      "path": "src/partition/split-cutover-handoff-closure-owner.js",
      "owner": "managed_split_workflow",
      "boundary": "split_cutover_handoff_closure",
      "transition": "persist a fence-, publication-, and incarnation-bound handoff generation and atomically record query-plane closure"
    },
    {
      "path": "src/query/split-cutover-handoff-query-plane-owner.js",
      "owner": "managed_split_workflow",
      "boundary": "split_cutover_handoff_closure",
      "transition": "subordinate node-local admission fence and plan/transaction observation for the durable generation"
    },
    {
      "path": "src/query/sql-query-engine-lifecycle-and-callback-dispatch.js",
      "owner": "managed_split_workflow",
      "boundary": "split_cutover_handoff_closure",
      "transition": "activate exactly one node-local query-plane component at the authoritative transaction-recovery runtime handoff"
    },
    {
      "path": "src/partition/managed-split-workflow-dissolution-methods.js",
      "owner": "managed_split_workflow",
      "boundary": "split_cutover_handoff_closure",
      "transition": "invoke the existing replica-removal fence and affectedRows-proven descriptor deletion only after handoff_closed"
    }
  ],
  "modelBindings": [
    {
      "kind": "decision-table",
      "artifact": "docs/specs/decision-tables/split-cutover-handoff-closure.json",
      "properties": "every cleanup, replay, query-closure, and owner-fence combination has one owner action"
    },
    {
      "kind": "tla-spec",
      "artifact": "models/split-cutover-handoff-closure/SplitCutoverHandoffClosure.tla",
      "properties": "source deletion follows whole-plane barrier closure and queued plans remain barrier-bound until terminal release"
    },
    {
      "kind": "property-test",
      "artifact": "test/query/split-cutover-handoff-query-plane-owner.test.js",
      "properties": "pre-barrier plans, explicit transactions, delayed listeners, hostile authority, and incarnation evidence fail closed"
    }
  ],
  "metrics": [
    {
      "name": "split handoff decision table",
      "probe": "npm run model:decision-tables"
    },
    {
      "name": "fixed split handoff TLC mode",
      "probe": "node scripts/model-tlc.js --mode split-cutover-handoff-closure-fixed"
    },
    {
      "name": "cleanup-status mutant TLC mode",
      "probe": "node scripts/model-tlc.js --mode split-cutover-handoff-closure-cleanup-status-bug"
    }
  ],
  "questRefs": [
    "solve/quests/managed-split-cutover-handoff-closure.json"
  ],
  "theoryLedgerRefs": [
    "theory-20260825-managed-split-cutover-handoff-closure"
  ],
  "failureAnalysis": {
    "fmea": [
      {
        "failureMode": "source descriptor is deleted while a remote query plan or explicit transaction still names the source",
        "severity": "critical - a valid concurrent write becomes terminal after the topology owner removes its participant",
        "detectability": "medium - timing-dependent passes hide the unsafe retirement order",
        "mitigation": "install a versioned barrier on the captured query-serving cohort and retain the source through exact generation closure",
        "probe": "test/partition/split-cutover-handoff-closure.test.js"
      }
    ],
    "stpa": [
      {
        "controller": "managed_split_workflow",
        "unsafeAction": "interprets source-local cleanup or child readiness as authority to dissolve the source before query-plane closure",
        "feedbackSignal": "replay watermark, handoff generation, query node incarnation acknowledgements, active plan leases, and open transactions",
        "ownerBoundary": "managed_split_workflow / split_cutover_handoff_closure"
      }
    ]
  }
}
-->

## Failure Classes

The regression joined two individually reasonable owners through an invalid
authority edge: source replication reported local replay cleanup while the
workflow interpreted the status as whole-plane retirement. Child readiness,
source-local drain, query retry, and elapsed time cannot close plans already
built on other nodes.

## Invariants

ManagedSplitWorkflow owns one subordinate handoff interaction. PartitionService
reports replay progress; SQL query nodes observe and acknowledge exact durable
generations; QueryExecutor and DistributedWriteCoordinator remain delivery
tails. None is a parallel source-retirement authority.

## Runtime Bindings

The workflow persists the generation and exact node incarnations. Each query
node synchronously observes that durable barrier before planning, fences new
work for the affected table, and retains already-created statement leases and
explicit transaction participants until terminal. The existing local replica
removal fence remains the final defense after whole-plane closure.

## Model Bindings

The decision table pins the low-resolution authority rules. The TLC fixed and
cleanup-status-mutant configurations prove that deletion requires every
barrier, lease, and acknowledgement condition. Deterministic query and workflow
guards bind those abstract variables to the real seams.

## Operational Analysis

No sleep or widened delivery retry is part of the cure. Cache changes, lease
release, transaction completion, and generation-bound ready notifications are
the only progress events. Broad and live validation runs in GCP; the local
machine is limited to thermal-gated focused guards.
