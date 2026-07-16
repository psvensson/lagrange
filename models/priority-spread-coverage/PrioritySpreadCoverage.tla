---------------------- MODULE PrioritySpreadCoverage ----------------------
(***************************************************************************)
(* Priority-recovery closure composes four owner-boundary facts:           *)
(*                                                                         *)
(*  1. the structural planner publishes a numeric spread gap;              *)
(*  2. operations can cover that gap only on distinct eligible targets;    *)
(*  3. publication closure may certify satisfaction only after coverage;   *)
(*  4. uncovered demand must retain its follow-up scheduling obligation.   *)
(*  5. pre-schema admission consumes that published satisfaction as data.  *)
(*                                                                         *)
(* CountAwareClosure = FALSE models the observed bug: one qualifying       *)
(* operation is collapsed to a Boolean and can close a gap of two. TRUE    *)
(* consumes the numeric gap as data at the closure boundary.               *)
(***************************************************************************)
EXTENDS FiniteSets, Naturals

CONSTANTS CountAwareClosure,
          SpreadRequiredForSchemaAdmission

RequiredDistinct == 3
EligibleTargets == {"node-b", "node-c"}

VARIABLES readyDistinct,
          operationTargets,
          publishedSatisfied,
          followupPending,
          schemaAdmitted

vars == <<
  readyDistinct,
  operationTargets,
  publishedSatisfied,
  followupPending,
  schemaAdmitted
>>

CoveredDistinct == readyDistinct + Cardinality(operationTargets)
Uncovered == CoveredDistinct < RequiredDistinct

TypeOK ==
  /\ readyDistinct \in 0..RequiredDistinct
  /\ operationTargets \subseteq EligibleTargets
  /\ CoveredDistinct <= RequiredDistinct
  /\ publishedSatisfied \in BOOLEAN
  /\ followupPending \in BOOLEAN
  /\ schemaAdmitted \in BOOLEAN

Init ==
  /\ readyDistinct = 1
  /\ operationTargets = {}
  /\ publishedSatisfied = FALSE
  /\ followupPending = TRUE
  /\ schemaAdmitted = FALSE

ScheduleTarget(target) ==
  /\ followupPending
  /\ Uncovered
  /\ target \in EligibleTargets \ operationTargets
  /\ operationTargets' = operationTargets \cup {target}
  /\ UNCHANGED <<
       readyDistinct,
       publishedSatisfied,
       followupPending,
       schemaAdmitted
     >>

ScheduleAnyTarget ==
  \E target \in EligibleTargets:
    ScheduleTarget(target)

ClosureCoverageSatisfied ==
  IF CountAwareClosure
    THEN ~Uncovered
    ELSE Cardinality(operationTargets) > 0

PublishClosure ==
  /\ ~publishedSatisfied
  /\ ClosureCoverageSatisfied
  /\ publishedSatisfied' = TRUE
  /\ followupPending' = FALSE
  /\ UNCHANGED <<readyDistinct, operationTargets, schemaAdmitted>>

SchemaAdmissionAllowed ==
  IF SpreadRequiredForSchemaAdmission
    THEN publishedSatisfied
    ELSE TRUE

AdmitSchema ==
  /\ ~schemaAdmitted
  /\ SchemaAdmissionAllowed
  /\ schemaAdmitted' = TRUE
  /\ UNCHANGED <<
       readyDistinct,
       operationTargets,
       publishedSatisfied,
       followupPending
     >>

Next ==
  \/ ScheduleAnyTarget
  \/ PublishClosure
  \/ AdmitSchema

Spec == Init /\ [][Next]_vars

PublicationRequiresCoveredSpread ==
  publishedSatisfied => ~Uncovered

UncoveredSpreadRetainsFollowup ==
  Uncovered => followupPending

SchemaAdmissionRequiresCoveredSpread ==
  schemaAdmitted => ~Uncovered

SchemaAdmissionRequiresPublishedSummary ==
  schemaAdmitted => publishedSatisfied

=============================================================================
