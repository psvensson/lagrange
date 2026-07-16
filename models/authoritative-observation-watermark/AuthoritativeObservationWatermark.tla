---------------- MODULE AuthoritativeObservationWatermark ----------------
(***************************************************************************)
(* Focused authoritative-repair -> cache evidence -> snapshot admission   *)
(* composition (quest movielens-authoritative-observation-watermark).      *)
(*                                                                         *)
(* A complete authoritative read can confirm unchanged rows or an empty   *)
(* table. Neither result is a cache mutation, but both are fresh evidence. *)
(* The fixed protocol publishes the read-completion time separately, then  *)
(* selects the newest mutation-or-observation watermark and checks its age. *)
(* The mutant keeps freshness coupled to the old mutation time.            *)
(*                                                                         *)
(* This is a deliberately narrow cross-layer proof, not exhaustive formal *)
(* coverage of repository-layer interactions.                             *)
(***************************************************************************)
EXTENDS Naturals

CONSTANTS MutationOnlyFreshness,
          ExactEqualityReconcileGate

NoRowsObserved == "none"
UnchangedRowsObserved == "unchanged_rows"
ConfirmedEmptyObserved == "confirmed_empty"
AuthoritativeRowStates == {
  NoRowsObserved,
  UnchangedRowsObserved,
  ConfirmedEmptyObserved
}

FreshnessUnclassified == "unclassified"
FreshnessFresh == "fresh"
FreshnessStale == "stale"
FreshnessStates == {
  FreshnessUnclassified,
  FreshnessFresh,
  FreshnessStale
}

FreshnessSourceUnavailable == "unavailable"
FreshnessSourceMutation == "mutation"
FreshnessSourceAuthoritativeObservation == "authoritative_observation"
FreshnessSources == {
  FreshnessSourceUnavailable,
  FreshnessSourceMutation,
  FreshnessSourceAuthoritativeObservation
}

NoEvidenceAt == 0
InitialMutationAt == 1
InitialClock == 3
FreshnessMaxAge == 1

VARIABLES repairRequested,
          initialReadFailed,
          repairRetryRequested,
          authoritativeRowsState,
          reconcileComplete,
          independentMutationAdvanced,
          clock,
          mutationWatermarkAt,
          observationCandidateAt,
          observationWatermarkAt,
          selectedFreshnessAt,
          freshnessState,
          freshnessSource,
          schemaAdmitted

vars == << repairRequested,
           initialReadFailed,
           repairRetryRequested,
           authoritativeRowsState,
           reconcileComplete,
           independentMutationAdvanced,
           clock,
           mutationWatermarkAt,
           observationCandidateAt,
           observationWatermarkAt,
           selectedFreshnessAt,
           freshnessState,
           freshnessSource,
           schemaAdmitted >>

NewestEvidenceAt ==
  IF observationWatermarkAt >= mutationWatermarkAt
  THEN observationWatermarkAt
  ELSE mutationWatermarkAt

NewestEvidenceSource ==
  IF observationWatermarkAt # NoEvidenceAt /\
     observationWatermarkAt >= mutationWatermarkAt
  THEN FreshnessSourceAuthoritativeObservation
  ELSE FreshnessSourceMutation

TypeOK ==
  /\ repairRequested \in BOOLEAN
  /\ initialReadFailed \in BOOLEAN
  /\ repairRetryRequested \in BOOLEAN
  /\ authoritativeRowsState \in AuthoritativeRowStates
  /\ reconcileComplete \in BOOLEAN
  /\ independentMutationAdvanced \in BOOLEAN
  /\ clock \in Nat
  /\ mutationWatermarkAt \in Nat
  /\ observationCandidateAt \in Nat
  /\ observationWatermarkAt \in Nat
  /\ selectedFreshnessAt \in Nat
  /\ freshnessState \in FreshnessStates
  /\ freshnessSource \in FreshnessSources
  /\ schemaAdmitted \in BOOLEAN

Init ==
  /\ repairRequested = FALSE
  /\ initialReadFailed = FALSE
  /\ repairRetryRequested = FALSE
  /\ authoritativeRowsState = NoRowsObserved
  /\ reconcileComplete = FALSE
  /\ independentMutationAdvanced = FALSE
  /\ clock = InitialClock
  /\ mutationWatermarkAt = InitialMutationAt
  /\ observationCandidateAt = NoEvidenceAt
  /\ observationWatermarkAt = NoEvidenceAt
  /\ selectedFreshnessAt = NoEvidenceAt
  /\ freshnessState = FreshnessUnclassified
  /\ freshnessSource = FreshnessSourceUnavailable
  /\ schemaAdmitted = FALSE

RequestRepair ==
  /\ ~repairRequested
  /\ repairRequested' = TRUE
  /\ UNCHANGED << initialReadFailed,
                  repairRetryRequested,
                  authoritativeRowsState,
                  reconcileComplete,
                  independentMutationAdvanced,
                  clock,
                  mutationWatermarkAt,
                  observationCandidateAt,
                  observationWatermarkAt,
                  selectedFreshnessAt,
                  freshnessState,
                  freshnessSource,
                  schemaAdmitted >>

(* A failed or partial read never mints a complete-table observation time. *)
FailInitialAuthoritativeRead ==
  /\ repairRequested
  /\ authoritativeRowsState = NoRowsObserved
  /\ ~initialReadFailed
  /\ ~repairRetryRequested
  /\ initialReadFailed' = TRUE
  /\ UNCHANGED << repairRequested,
                  repairRetryRequested,
                  authoritativeRowsState,
                  reconcileComplete,
                  independentMutationAdvanced,
                  clock,
                  mutationWatermarkAt,
                  observationCandidateAt,
                  observationWatermarkAt,
                  selectedFreshnessAt,
                  freshnessState,
                  freshnessSource,
                  schemaAdmitted >>

RequestRepairRetry ==
  /\ initialReadFailed
  /\ ~repairRetryRequested
  /\ authoritativeRowsState = NoRowsObserved
  /\ repairRetryRequested' = TRUE
  /\ UNCHANGED << repairRequested,
                  initialReadFailed,
                  authoritativeRowsState,
                  reconcileComplete,
                  independentMutationAdvanced,
                  clock,
                  mutationWatermarkAt,
                  observationCandidateAt,
                  observationWatermarkAt,
                  selectedFreshnessAt,
                  freshnessState,
                  freshnessSource,
                  schemaAdmitted >>

(* TLC explores unchanged and confirmed-empty complete reads, immediately or *)
(* after retry. The gateway, not the caller, mints observationCandidateAt.    *)
CompleteAuthoritativeRead ==
  /\ repairRequested
  /\ authoritativeRowsState = NoRowsObserved
  /\ (~initialReadFailed \/ repairRetryRequested)
  /\ authoritativeRowsState' \in {
       UnchangedRowsObserved,
       ConfirmedEmptyObserved
     }
  /\ observationCandidateAt' = clock
  /\ UNCHANGED << repairRequested,
                  initialReadFailed,
                  repairRetryRequested,
                  reconcileComplete,
                  independentMutationAdvanced,
                  clock,
                  mutationWatermarkAt,
                  observationWatermarkAt,
                  selectedFreshnessAt,
                  freshnessState,
                  freshnessSource,
                  schemaAdmitted >>

(* Equal/empty truth reconciles without changing the CDC mutation time.     *)
(* The exact-equality mutant refuses to reconcile whenever an independent    *)
(* CDC mutation is newer than the read snapshot — the live nodes-table wedge: *)
(* a continuously heartbeat-mutated cache is always newer than the read, so  *)
(* the gate can block reconciliation forever.                                *)
ReconcileAuthoritativeTruth ==
  /\ authoritativeRowsState # NoRowsObserved
  /\ ~reconcileComplete
  /\ (~ExactEqualityReconcileGate \/
      mutationWatermarkAt <= observationCandidateAt)
  /\ reconcileComplete' = TRUE
  /\ UNCHANGED << repairRequested,
                  initialReadFailed,
                  repairRetryRequested,
                  authoritativeRowsState,
                  independentMutationAdvanced,
                  clock,
                  mutationWatermarkAt,
                  observationCandidateAt,
                  observationWatermarkAt,
                  selectedFreshnessAt,
                  freshnessState,
                  freshnessSource,
                  schemaAdmitted >>

(* A real CDC mutation may arrive any time after the authoritative read —   *)
(* including between the read and its reconciliation (the live nodes churn   *)
(* interleaving) — and before snapshot classification. It is distinct from   *)
(* reconciliation and newer.                                                 *)
AdvanceIndependentMutation ==
  /\ authoritativeRowsState # NoRowsObserved
  /\ ~independentMutationAdvanced
  /\ freshnessState = FreshnessUnclassified
  /\ independentMutationAdvanced' = TRUE
  /\ clock' = clock + 1
  /\ mutationWatermarkAt' = clock + 1
  /\ UNCHANGED << repairRequested,
                  initialReadFailed,
                  repairRetryRequested,
                  authoritativeRowsState,
                  reconcileComplete,
                  observationCandidateAt,
                  observationWatermarkAt,
                  selectedFreshnessAt,
                  freshnessState,
                  freshnessSource,
                  schemaAdmitted >>

(* Publication is a separate owner turn after successful cache reconcile. *)
PublishAuthoritativeObservation ==
  /\ reconcileComplete
  /\ ~MutationOnlyFreshness
  /\ observationWatermarkAt = NoEvidenceAt
  /\ observationWatermarkAt' = observationCandidateAt
  /\ UNCHANGED << repairRequested,
                  initialReadFailed,
                  repairRetryRequested,
                  authoritativeRowsState,
                  reconcileComplete,
                  independentMutationAdvanced,
                  clock,
                  mutationWatermarkAt,
                  observationCandidateAt,
                  selectedFreshnessAt,
                  freshnessState,
                  freshnessSource,
                  schemaAdmitted >>

SelectNewestFreshnessEvidence ==
  /\ reconcileComplete
  /\ freshnessState = FreshnessUnclassified
  /\ (MutationOnlyFreshness \/
      observationWatermarkAt # NoEvidenceAt)
  /\ selectedFreshnessAt' = NewestEvidenceAt
  /\ freshnessSource' = NewestEvidenceSource
  /\ freshnessState' =
       IF clock - NewestEvidenceAt <= FreshnessMaxAge
       THEN FreshnessFresh
       ELSE FreshnessStale
  /\ UNCHANGED << repairRequested,
                  initialReadFailed,
                  repairRetryRequested,
                  authoritativeRowsState,
                  reconcileComplete,
                  independentMutationAdvanced,
                  clock,
                  mutationWatermarkAt,
                  observationCandidateAt,
                  observationWatermarkAt,
                  schemaAdmitted >>

AdmitSchema ==
  /\ freshnessState = FreshnessFresh
  /\ ~schemaAdmitted
  /\ schemaAdmitted' = TRUE
  /\ UNCHANGED << repairRequested,
                  initialReadFailed,
                  repairRetryRequested,
                  authoritativeRowsState,
                  reconcileComplete,
                  independentMutationAdvanced,
                  clock,
                  mutationWatermarkAt,
                  observationCandidateAt,
                  observationWatermarkAt,
                  selectedFreshnessAt,
                  freshnessState,
                  freshnessSource >>

SettledOrBlockedStutter ==
  /\ reconcileComplete
  /\ UNCHANGED vars

Next ==
  \/ RequestRepair
  \/ FailInitialAuthoritativeRead
  \/ RequestRepairRetry
  \/ CompleteAuthoritativeRead
  \/ ReconcileAuthoritativeTruth
  \/ AdvanceIndependentMutation
  \/ PublishAuthoritativeObservation
  \/ SelectNewestFreshnessEvidence
  \/ AdmitSchema
  \/ SettledOrBlockedStutter

Fairness ==
  /\ WF_vars(RequestRepair)
  /\ WF_vars(FailInitialAuthoritativeRead)
  /\ WF_vars(RequestRepairRetry)
  /\ WF_vars(CompleteAuthoritativeRead)
  /\ WF_vars(ReconcileAuthoritativeTruth)
  /\ WF_vars(PublishAuthoritativeObservation)
  /\ WF_vars(SelectNewestFreshnessEvidence)
  /\ WF_vars(AdmitSchema)

Spec == Init /\ [][Next]_vars /\ Fairness

ObservationDoesNotFabricateMutation ==
  mutationWatermarkAt =
    IF independentMutationAdvanced
    THEN InitialClock + 1
    ELSE InitialMutationAt

NoCompleteReadNoPublishedEvidence ==
  authoritativeRowsState # NoRowsObserved \/
    observationWatermarkAt = NoEvidenceAt

PublishedObservationRequiresReconciledCompleteRead ==
  observationWatermarkAt = NoEvidenceAt \/
    (authoritativeRowsState # NoRowsObserved /\ reconcileComplete)

PublishedObservationPreservesReadCompletionTime ==
  observationWatermarkAt = NoEvidenceAt \/
    observationWatermarkAt = observationCandidateAt

SelectedFreshnessIsNewestEvidence ==
  freshnessState = FreshnessUnclassified \/
    selectedFreshnessAt = NewestEvidenceAt

FreshnessSourceMatchesNewestEvidence ==
  freshnessState = FreshnessUnclassified \/
    freshnessSource = NewestEvidenceSource

FreshnessClassificationMatchesAge ==
  /\ (freshnessState # FreshnessFresh \/
      (selectedFreshnessAt # NoEvidenceAt /\
       clock - selectedFreshnessAt <= FreshnessMaxAge))
  /\ (freshnessState # FreshnessStale \/
      clock - selectedFreshnessAt > FreshnessMaxAge)

SchemaAdmissionRequiresFreshness ==
  ~schemaAdmitted \/ freshnessState = FreshnessFresh

EventuallySchemaAdmitted == <>schemaAdmitted

=============================================================================
