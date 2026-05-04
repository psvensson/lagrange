# Runtime Grammar Hierarchy

## Document Role

This document defines the current target grammar hierarchy for active runtime
coherence work.

Use this file for:

- the target semantic layer order for active runtime boundary work
- current pilot-slice grammar mapping
- explicit identification of missing or overloaded grammar on the touched path

Do not use this file for:

- roadmap scope decisions
- end-user or operator documentation
- stable coding rules that belong in steering documents

## Target Hierarchy

The target runtime grammar hierarchy is:

1. `intent`
2. `authority`
3. `actuation`
4. `conditions`
5. `decision`
6. `presentation`

The hierarchy is strict.

- lower layers provide evidence upward
- higher layers may summarize lower layers
- higher layers must not rewrite lower-layer meaning locally
- presentation must not become a substitute decision layer

## Layer Contracts

### 1. `intent`

- Role:
  what should become true if the system is making correct progress
- Typical outputs:
  desired spread,
  desired replica count,
  desired leader placement,
  desired publication convergence target,
  desired active cohort size
- Allowed owners:
  planners,
  topology/policy calculators,
  bounded derived target snapshots
- Forbidden outputs:
  retry policy,
  wait mode,
  pressure diagnosis,
  operator presentation labels

### 2. `authority`

- Role:
  who or what is allowed to count toward the intent
- Typical outputs:
  admitted cohort,
  published-active cohort,
  pending-ack cohort,
  authoritative leader,
  eligible recovery cohort
- Allowed owners:
  publication,
  admission,
  startup authority,
  canonical leader authority
- Forbidden outputs:
  workflow progress,
  timeout meaning,
  actuation retry state,
  report-level dominant reason

### 3. `actuation`

- Role:
  what action item exists, or must exist, to move reality toward intent
- Typical outputs:
  `no_action_needed`,
  `action_required`,
  `persisted_not_dispatched`,
  `dispatched_waiting_progress`,
  `transition_deferred`,
  `terminal_completed`,
  `terminal_failed`
- Allowed owners:
  workflow owner,
  coordinator,
  durable operation state machine,
  bounded actuation snapshots derived from those owners
- Forbidden outputs:
  publication authority,
  readiness truth,
  presentation summaries

### 4. `conditions`

- Role:
  what the system currently observes without imposing higher-level meaning
- Typical outputs:
  visibility state,
  readiness dimensions,
  transport pressure,
  queue depth,
  write backlog,
  timeout evidence,
  observed replica role/state
- Allowed owners:
  readiness,
  repository visibility,
  pressure sensors,
  transport,
  durable row observation
- Forbidden outputs:
  canonical next action,
  canonical owner,
  semantic-state presentation

### 5. `decision`

- Role:
  the canonical current meaning after combining intent, authority, actuation,
  and conditions
- Typical outputs:
  `contractState`,
  `nextAction`,
  `currentOwner`,
  `nextRequiredAction`,
  `blockingBoundary`,
  `waitMode`,
  `semanticState`,
  `retryAfterMs`
- Allowed owners:
  explicit adjudicators and decision snapshots
- Forbidden outputs:
  ad-hoc report-only meanings,
  raw lower-layer evidence bags without a canonical answer

### 6. `presentation`

- Role:
  how humans are told what happened
- Typical outputs:
  triage summaries,
  failure bundles,
  operator recommendations,
  dominant reasons
- Allowed owners:
  admin/control-snapshot consumers,
  harness/reporting layers,
  CLI or operator surfaces
- Forbidden outputs:
  new domain/runtime meaning that bypasses the decision layer

## Interaction Rules

1. Cluster scope may aggregate partition scope.
2. Partition scope may reference operation scope.
3. Operation scope must not redefine cluster authority.
4. `decision` consumes `intent`, `authority`, `actuation`, and `conditions`.
5. `presentation` consumes `decision` and may include lower-layer evidence,
   but only as supporting detail.
6. If a concept cannot be placed cleanly in one layer, that concept is a
   design smell and must be split or renamed.

## Pilot Slice: Priority Recovery Under Load

The pilot slice for this hierarchy is:

- priority recovery under load
- publication/admission convergence
- workflow/coordinator actuation
- admin and harness reporting

### Current Mapping

| Layer | Current owners / artifacts | Current vocabulary | Current issue |
| --- | --- | --- | --- |
| `intent` | priority-recovery planner inputs in `src/control-plane/priority-recovery-snapshot.js` | `requiredDistinctNodeCount`, `readyDistinctNodeCount`, `spreadGap`, missing partition ids | mixed too closely with convergence and operation evidence |
| `authority` | publication, admission, startup-authority, admitted participation | `publishedActiveNodeIds`, `pendingAckNodeIds`, admitted/eligible cohorts | publication truth is overloaded as both authority and closure |
| `actuation` | `RebalanceCoordinator`, `OperationWorkflowOwner`, `replica_operations`, `PriorityRecoveryDecisionSnapshot.actuation` | `no_action_needed`, `action_required`, `persisted_not_dispatched`, `dispatched_waiting_progress`, `transition_deferred`, `terminal_completed`, `terminal_failed` | actuation is first-class; remaining drift is older presentation vocabulary in retained artifacts |
| `conditions` | readiness, repository visibility, pressure sensors, transport, queue depth | `visibilityState`, readiness dimensions, `pendingWrites`, `query_timeout`, `control_plane_backpressure` | pressure and timeout evidence are still too secondary |
| `decision` | `OwnerContractOutcome`, `PriorityRecoveryProgressContract`, semantic state mapping | `contractState`, `nextAction`, `currentOwner`, `blockingBoundary`, `waitMode`, `semanticStateId` | forced to compensate for the missing actuation layer |
| `presentation` | observation snapshot, admin control snapshot, failure bundle, triage summary | `dominantReason`, `failureClass`, operator text | still occasionally stands in for missing lower-layer meaning |

### Pilot Slice Owner Ingress Map

The priority-recovery pilot slice already has one reusable owner chain.
The remaining work is to make that chain explicit and first-class.

- `intent`
  enters through planner and priority partition summary inputs in
  `src/control-plane/priority-recovery-snapshot.js`.
- `authority`
  is normalized by
  `src/control-plane/control-plane-readiness-service-segment-4.js`
  `buildPriorityRecoveryPlanningProjection(...)` and local admission evidence,
  then resolved into one admitted active cohort by
  `src/control-plane/active-node-projection.js`
  `resolvePriorityRecoveryActiveNodeCohort(...)`.
- `actuation`
  is currently split across:
  `src/rebalancer/rebalance-coordinator-segment-3.js`
  create-lane checks plus
  `armCoordinatorCreatedOperationProgress(...)`,
  `src/rebalancer/operation-workflow-owner-segment-7.js`
  progress reconciliation and timeout reconcile,
  and timing/classification evidence in
  `src/rebalancer/replica-operation-liveness.js`.
- `conditions`
  come from runtime-authority visibility and readiness,
  authoritative/deferred operation observation,
  and pressure evidence such as
  `pendingWrites`,
  `pendingWriteGrowthCount`,
  `query_timeout`,
  and `control_plane_backpressure`.
- `decision`
  is composed centrally in `src/control-plane/priority-recovery-snapshot.js`.
- `presentation`
  is derived downstream in
  `src/control-plane/priority-recovery-observation-snapshot.js`,
  admin control-snapshot consumers,
  and harness/reporting code.

### Immediate Owner-Path Tension

The touched slice already has:

1. explicit authority input
2. explicit condition evidence
3. a centralized decision layer

The missing piece is one first-class actuation contract between the existing
coordinator/workflow owner path and the current decision contract.

### Current Dominant Gaps

1. `actuation` is the most obvious missing first-class grammar.
   The system still collapses:
   - no follow-up action exists
   - action creation was attempted but could not persist
   - action creation was blocked by control-plane pressure
   into one too-small outcome family.
2. `conditions` evidence is richer than the actuation layer that should
   consume it.
   Pressure, timeouts, and visibility lag exist, but they are not yet
   normalized into one actuation contract.
3. `presentation` is still too close to raw failure symptoms on the touched
   path because the lower hierarchy is not fully separated yet.

## Immediate Closure Direction

The next implementation steps on this pilot slice are:

1. Define one explicit priority-recovery actuation contract on the existing
   workflow/coordinator path.
2. Normalize control-plane pressure and attempt-outcome evidence as
   `conditions` and actuation inputs rather than top-level semantic labels.
3. Recompose the decision layer so `PriorityRecoveryProgressContract` is
   clearly derived from:
   `intent + authority + actuation + conditions`.
4. Cut admin/harness/reporting consumers over so they summarize the hierarchy
   instead of reconstructing meaning from partial evidence.
