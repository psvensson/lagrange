----------------------- MODULE PublicationConvergence -----------------------
(***************************************************************************)
(* Rolling-restart PUBLICATION-CONVERGENCE liveness model.                 *)
(*                                                                         *)
(* This spec captures the SECOND wedge exposed once the readiness-         *)
(* starvation break-points (see ReadinessStarvation.tla) clear the first   *)
(* deadlock: the owner publishes its membership epoch, but the other       *)
(* active nodes are never added to the published set, so the harness fails *)
(* with publication_convergence_blocked / consumer_lag / waiting_for_      *)
(* consumer and missingPublished > 0 forever.                              *)
(*                                                                         *)
(* Empirical anchors (latest harness run, see session rr_findings +        *)
(* test-output/report.json activeGate.progress):                           *)
(*   published   == owner advanced publication epoch (steady_published).   *)
(*                  publicationStatus = PUBLISHED, publishedActiveNodeIds   *)
(*                  = [owner].                                              *)
(*   converged   == every active node is in publishedActiveNodeIds, i.e.   *)
(*                  missingPublishedCount = 0. The harness reports          *)
(*                  publicationActiveGateHandoffNextAction =                *)
(*                  reconcile_owner_membership_publication and             *)
(*                  membershipPublicationHandoffOutcomeEnqueued = FALSE:    *)
(*                  the owner KNOWS it must reconcile but never does.       *)
(*   probeBounded== the admin control-snapshot diagnostic probe is running  *)
(*                  bounded/cache-only because the recovery transport is    *)
(*                  saturated and the full resolve loses the deadline race  *)
(*                  (admin-control-snapshot-local-diagnostics-methods.js    *)
(*                   resolveBoundedLocalControlSnapshot:553-583). Under     *)
(*                  saturation this can stay TRUE indefinitely.             *)
(*                                                                         *)
(* The OWNER-RECONCILE owner-command is the only action that flips          *)
(* converged. In production it is driven ONLY as a side effect of the      *)
(* control-snapshot resolve/repair path (resolveLocalControlSnapshot ->    *)
(* triggerMembershipPublicationHandoffOwnerCommand, class-part-2.js:200).   *)
(* When the probe is bounded that side effect is SKIPPED, so reconcile      *)
(* never enqueues -> the lost wakeup.                                       *)
(*                                                                         *)
(* The fix is modelled as a single constant:                               *)
(*   ScheduledReconcile (fix): drive the owner-reconcile from its OWN       *)
(*                     bounded, scheduled owner-command that is independent *)
(*                     of the diagnostic read probe, so it fires even while *)
(*                     the probe is bounded under saturation.               *)
(***************************************************************************)
EXTENDS Naturals

CONSTANT ScheduledReconcile

VARIABLES published,     \* owner advanced publication epoch
          converged,     \* missingPublished == 0 (all active nodes published)
          probeBounded,  \* diagnostic probe is bounded/cache-only (saturated)
          phase          \* "recover" -> "steady"

vars == << published, converged, probeBounded, phase >>

Phase == {"recover", "steady"}

TypeOK ==
  /\ published \in BOOLEAN
  /\ converged \in BOOLEAN
  /\ probeBounded \in BOOLEAN
  /\ phase \in Phase

\* Recovery starts with the transport saturated, so the diagnostic probe is
\* bounded from the outset.
Init ==
  /\ published = FALSE
  /\ converged = FALSE
  /\ probeBounded = TRUE
  /\ phase = "recover"

(*-----------------------------------------------------------------------*)
(* Safety: you can never converge without first publishing.               *)
(*-----------------------------------------------------------------------*)
ConvergeImpliesPublished == converged => published

(*-----------------------------------------------------------------------*)
(* Actions.                                                               *)
(*-----------------------------------------------------------------------*)

\* The owner advances its publication epoch (abstracts the now-unblocked
\* readiness-starvation recovery completing for the owner).
Publish ==
  /\ ~published
  /\ published' = TRUE
  /\ UNCHANGED << converged, probeBounded, phase >>

\* The recovery transport saturates the diagnostic probe (or keeps it
\* saturated). Adversarial: no fairness forces it to drain.
BoundProbe ==
  /\ ~probeBounded
  /\ probeBounded' = TRUE
  /\ UNCHANGED << published, converged, phase >>

\* The transport momentarily drains and the probe can run the full resolve.
\* Also adversarial: nothing GUARANTEES this ever happens under load.
UnboundProbe ==
  /\ probeBounded
  /\ probeBounded' = FALSE
  /\ UNCHANGED << published, converged, phase >>

\* Probe-driven reconcile: the owner-reconcile rides the control-snapshot
\* resolve path and ONLY fires when the probe is NOT bounded. This is the
\* production behaviour and the source of the lost wakeup.
ProbeReconcile ==
  /\ published
  /\ ~converged
  /\ ~probeBounded
  /\ converged' = TRUE
  /\ UNCHANGED << published, probeBounded, phase >>

\* Scheduled reconcile (the fix): an independent, bounded owner-command that
\* enqueues the reconcile regardless of whether the diagnostic probe is
\* bounded. Enabled only when the fix is configured.
ScheduledReconcileAct ==
  /\ ScheduledReconcile
  /\ published
  /\ ~converged
  /\ converged' = TRUE
  /\ UNCHANGED << published, probeBounded, phase >>

\* Quiesce once every active node is published (missingPublished == 0).
ReachSteady ==
  /\ phase = "recover"
  /\ converged
  /\ phase' = "steady"
  /\ UNCHANGED << published, converged, probeBounded >>

SteadyStutter ==
  /\ phase = "steady"
  /\ UNCHANGED vars

Next ==
  \/ Publish
  \/ BoundProbe
  \/ UnboundProbe
  \/ ProbeReconcile
  \/ ScheduledReconcileAct
  \/ ReachSteady
  \/ SteadyStutter

(*-----------------------------------------------------------------------*)
(* Fairness.                                                              *)
(*                                                                        *)
(* The owner eventually publishes and eventually quiesces once converged. *)
(* The scheduled owner-command (when configured) is weakly fair: while it *)
(* stays enabled it eventually fires. CRUCIALLY there is NO fairness on    *)
(* UnboundProbe or ProbeReconcile -- under saturation the probe may stay   *)
(* bounded forever, so the probe-driven reconcile is never guaranteed.     *)
(*-----------------------------------------------------------------------*)
Fairness ==
  /\ WF_vars(Publish)
  /\ WF_vars(ReachSteady)
  /\ WF_vars(ScheduledReconcileAct)

Spec == Init /\ [][Next]_vars /\ Fairness

(*-----------------------------------------------------------------------*)
(* Correctness properties.                                               *)
(*-----------------------------------------------------------------------*)

\* The cluster must always converge: every active node eventually becomes a
\* published member and the restarted cohort reaches steady state.
\*
\* Without ScheduledReconcile this FAILS: there is a fair behaviour in which
\* the probe stays bounded forever, the probe-driven reconcile is never
\* enabled, converged stays FALSE, and phase never leaves "recover".
\* With ScheduledReconcile it HOLDS: the scheduled owner-command fires under
\* weak fairness regardless of the probe, so convergence and quiescence are
\* guaranteed.
EventuallySteady == <>(phase = "steady")

=============================================================================
