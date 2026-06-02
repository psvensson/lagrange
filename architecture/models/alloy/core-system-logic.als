module architecture/core_system_logic

/*
alloy-model
{
  "schema": "alloy-model-v1",
  "modelId": "core-system-logic",
  "owner": "architecture_owner",
  "boundary": "core_system_logic",
  "invariantRefs": [
    {
      "id": "single-semantic-owner",
      "assertion": "SingleSemanticOwner"
    },
    {
      "id": "normalized-state-only",
      "assertion": "NormalizedStateOnly"
    },
    {
      "id": "owner-outcome-before-observer",
      "assertion": "OwnerOutcomeBeforeObserver"
    },
    {
      "id": "readers-do-not-repair-authority",
      "assertion": "ReadersDoNotRepairAuthority"
    },
    {
      "id": "degraded-evidence-never-upgrades-readiness",
      "assertion": "DegradedEvidenceNeverUpgradesReadiness"
    }
  ],
  "runPredicates": [
    "ExampleCoreSystemLogic"
  ],
  "forbiddenPredicates": [
    "ForbiddenRawIngress",
    "ForbiddenObserverBeforeOwnerOutcome",
    "ForbiddenObserverRepair",
    "ForbiddenDegradedReadinessPromotion",
    "ForbiddenTemporaryPhaseWithoutHandoff"
  ]
}
*/

abstract sig Owner {}
one sig ArchitectureOwner extends Owner {}
one sig RuntimeContractOwner extends Owner {}
one sig ControlPlaneReconcileOwner extends Owner {}
one sig ReadModelContractOwner extends Owner {}
one sig ControlPlaneReadinessOwner extends Owner {}
one sig StartupRuntimeHandoffOwner extends Owner {}

abstract sig Boundary {}
one sig CoreSystemLogic extends Boundary {}
one sig OwnerOutcomeEnvelope extends Boundary {}
one sig OwnerKeyReconcile extends Boundary {}
one sig ObserverProjection extends Boundary {}
one sig ReadinessGating extends Boundary {}
one sig PhaseToSteadyStateHandoff extends Boundary {}

abstract sig IngressShape {}
one sig NormalizedIngress extends IngressShape {}
one sig RawIngress extends IngressShape {}

abstract sig Evidence {}
one sig AuthoritativeEvidence extends Evidence {}
one sig DegradedEvidence extends Evidence {}
one sig MissingEvidence extends Evidence {}

abstract sig Outcome {}
one sig ReadyOutcome extends Outcome {}
one sig PendingOutcome extends Outcome {}
one sig DeferredOutcome extends Outcome {}
one sig BlockedOutcome extends Outcome {}
one sig FailedOutcome extends Outcome {}

abstract sig Phase {}
sig TemporaryPhase extends Phase {}
sig SteadyStatePhase extends Phase {}

sig Concern {
  owner: one Owner,
  boundary: one Boundary,
  ingress: one IngressShape,
  evidence: one Evidence,
  outcome: lone Outcome,
  phase: lone Phase
}

sig Projection {
  source: one Concern
}

sig RepairProjection extends Projection {}

sig PhaseHandoff {
  concern: one Concern,
  from: one TemporaryPhase,
  to: one SteadyStatePhase
}

fact CoreSystemLogicRules {
  all c: Concern | c.ingress = NormalizedIngress
  all p: Projection | one p.source.outcome
  no RepairProjection
  no c: Concern |
    c.evidence in DegradedEvidence + MissingEvidence and
    c.outcome in ReadyOutcome
  all c: Concern |
    some c.phase and c.phase in TemporaryPhase implies
      one h: PhaseHandoff | h.concern = c
}

pred ExampleCoreSystemLogic {
  some c: Concern |
    c.owner = ArchitectureOwner and
    c.boundary = CoreSystemLogic and
    c.ingress = NormalizedIngress and
    c.evidence = AuthoritativeEvidence and
    c.outcome in PendingOutcome + DeferredOutcome + BlockedOutcome + FailedOutcome
}

pred ForbiddenRawIngress {
  some c: Concern | c.ingress = RawIngress
}

pred ForbiddenObserverBeforeOwnerOutcome {
  some p: Projection | no p.source.outcome
}

pred ForbiddenObserverRepair {
  some RepairProjection
}

pred ForbiddenDegradedReadinessPromotion {
  some c: Concern |
    c.evidence in DegradedEvidence + MissingEvidence and
    c.outcome in ReadyOutcome
}

pred ForbiddenTemporaryPhaseWithoutHandoff {
  some c: Concern |
    some c.phase and
    c.phase in TemporaryPhase and
    (no h: PhaseHandoff | h.concern = c)
}

assert SingleSemanticOwner {
  all c: Concern | one c.owner and one c.boundary
}

assert NormalizedStateOnly {
  no c: Concern | c.ingress = RawIngress
}

assert OwnerOutcomeBeforeObserver {
  all p: Projection | one p.source.outcome
}

assert ReadersDoNotRepairAuthority {
  no RepairProjection
}

assert DegradedEvidenceNeverUpgradesReadiness {
  no c: Concern |
    c.evidence in DegradedEvidence + MissingEvidence and
    c.outcome in ReadyOutcome
}

run ExampleCoreSystemLogic for 6
run ForbiddenRawIngress for 6
run ForbiddenObserverBeforeOwnerOutcome for 6
run ForbiddenObserverRepair for 6
run ForbiddenDegradedReadinessPromotion for 6
run ForbiddenTemporaryPhaseWithoutHandoff for 6

check SingleSemanticOwner for 6
check NormalizedStateOnly for 6
check OwnerOutcomeBeforeObserver for 6
check ReadersDoNotRepairAuthority for 6
check DegradedEvidenceNeverUpgradesReadiness for 6
