# Membership cutover — theory-grounded plan (rev 2, 2026-06-21)

Rev 2 supersedes the "single-owner-from-minimal-inputs / delete the projection"
framing of rev 1. That framing was **refuted by implementation** (see Evidence
Log): a minimal owner rule cannot replace the projection because membership is not
a local function — it is agreement over a failure detector's output. This rev
re-grounds the work in the group-membership literature, where the win is
**replacing ad-hoc machinery with named protocols, not deleting it.**

## 1. The problem, named

This is the classic **group membership problem**. Three established results bind
the design and explain rev 1's failure:

- **FLP (Fischer–Lynch–Paterson, 1985):** consensus — and group membership, which
  is consensus-hard — is impossible in a pure asynchronous system with even one
  crash. You must add a failure detector.
- **Chandra–Toueg (JACM 1996) + weakest-failure-detector (Chandra–Hadzilacos–Toueg):**
  reliable membership requires at least an eventually-strong / Ω-class failure
  detector. Membership = (failure detector) + (agreement over its output).
- **Therefore membership is NOT computable from minimal local inputs.** The
  projection's "7 sources + guards" is precisely an (unnamed) failure detector +
  view function. That is why `computeShadowActiveMemberSet` (baseline + readiness
  only) structurally could not trim a departed node — it lacked the detector.

## 2. Target architecture — the canonical three layers

Each layer one owner, matching the literature:

1. **Failure detector (evidence).** Suspicion over heartbeats / lease / transport
   connectivity. *Prior art:* **SWIM** (Das–Gupta–Motivala, DSN 2002) + **Lifeguard**
   (HashiCorp — explicitly built to cut false-positive removals), **φ-accrual**
   (Hayashibara et al.) for tunable suspicion.
2. **Membership agreement (view installation).** A totally-ordered, **monotonic**
   sequence of views installed by **consensus**. *Prior art:* **Raft** joint-consensus
   config changes (Ongaro–Ousterhout 2014), **Viewstamped Replication** view changes,
   **virtual synchrony** (Birman/ISIS), **Rapid** ("Stable and Consistent Membership
   at Scale", Suresh et al., USENIX ATC 2018) for the multi-monitor / anti-flapping
   case.
3. **View dissemination (projection).** Observers **read** the installed view; they
   never re-derive it. *Prior art:* virtual synchrony's atomically-installed view.

Design constraint (a real decision, see §6): this is a database control plane that
needs **strong** membership, so the *agreement* layer stays **consensus-installed
(Raft)** — adopt SWIM-style gossip ONLY for the *failure-detector* layer, not for
agreement.

## 3. Map the current system onto the three layers

| Layer | Current state | Verdict |
|---|---|---|
| Failure detector | SCATTERED across `resolveActiveNodeViews` overlays + ~8 readiness guards (heartbeat/lease grace, transport-retention, recovery-eligible, runtime-authority, freeze). No named owner. | **The thing to consolidate** |
| Agreement | ALREADY consensus-installed: `control_plane_publications` row + `publication_epoch`, written client→leader→Raft. Monotonic-view invariant exists implicitly ("don't reopen the epoch with a narrower set"). | **KEEP — this is correct** |
| Dissemination | CDC + `SystemTableCache` + published row, BUT ~11 consumers re-derive membership from the projection instead of reading the installed view. | **Collapse the readers** |

## 4. KEEP / REPLACE / ABANDON

**KEEP (validated + matches theory):**
- Consensus-installed published view + epoch + Raft term fence. This *is* the
  agreement layer done right; N=8 gate confirmed it converges (8/8, 0 corrupt).
- The monotonic-view invariant ("never install a narrower view at the same/older
  epoch") — the VSR/virtual-synchrony monotonic view-change property. Formalize it.
- The freeze gate's *intent* (don't trim a quorum under broad suspicion) = SWIM's
  suspicion-quorum safety; re-home it into the named detector, don't delete it.

**REPLACE (the real simplification — replacement, not deletion):**
- Extract a **named failure detector** from the scattered guards. The ~8
  membership-derived guards + projection overlays are an ad-hoc, unspecified
  suspicion mechanism. Replace with ONE module implementing a principled protocol
  (SWIM suspect→confirm + Lifeguard local-health, or φ-accrual). Net: fewer guards,
  named semantics, known correctness (TLA+ specs exist in the literature).
- Make view computation an **explicit view-change**: detector output → proposed
  view → Raft-install → monotonic epoch bump. Replaces the implicit
  `resolveActiveNodeViews → candidate-derivation` pipeline with a named protocol.

**ABANDON (refuted by implementation):**
- The minimal owner rule as a *replacement* for the projection.
- Phase 3 "collapse/delete the 7-source projection" — it is the FD + view
  computation; it is refactored into the FD layer, **not deleted**.
- Lever #2 "delete the readiness guards" — they are the FD evidence; they are
  **consolidated**, not removed (see the rewritten inventory).
- The `LAGRANGE_MEMBERSHIP_OWNER_AUTHORITATIVE` flip flag — moot under this framing.
  Keep the **self-knowledge correction** as a future FD input; remove the rest of
  the authoring scaffolding.

## 5. Sequenced work (each gated; deterministic-first)

1. **Name the layers (doc + structural guard, no behavior change).** Write the
   contract declaring FD / agreement / dissemination owners; classify every current
   guard + overlay as FD-evidence vs genuinely-dead. Add a structural test that
   non-owner code may not re-derive the view.
2. **Consumer collapse (the cheap, safe, real win).** Migrate the ~11 consumers that
   re-derive membership to read the installed view. Each behind the structural guard
   from step 1. Delivers single-ownership of *reads* without touching the detector —
   most of the genuine simplification value, lowest risk.
3. **FD extraction.** Lift the scattered suspicion guards into one named detector
   module (SWIM/Lifeguard/φ-accrual semantics), behind a flag, **divergence-probed**
   against current behavior (the Phase 0 probe + equivalence harness already built
   are directly reusable), validated at N≥8. Re-home the freeze gate as the
   detector's suspicion-quorum rule.
4. **View-change formalization.** Make the monotonic consensus install explicit;
   property-test monotonicity + quorum-safety (TLA+ candidate — narrower than the
   existing active-gate model).
5. **Retire scaffolding.** After 1–4, remove the flip-flag remnants; the projection
   is now the named FD+view layer and observers are pure readers.

## 6. Decision points (operator)

- **Strong vs weak membership (recommend: keep strong).** Agreement stays
  consensus-installed (Raft); SWIM-style gossip is for the FD layer only. A DB
  control plane needs strong, monotone views. Confirm before step 3.
- **Adopt vs specify the detector.** Reuse memberlist/Lifeguard *semantics* (well
  specified, TLA+-backed) vs. an in-house detector. Recommend adopting the semantics,
  implementing in-tree against this transport.
- **Appetite.** Step 2 (consumer collapse) is the cheap real win and is safe to do
  now. Steps 3–4 (FD + view protocol) are the larger investment and where the
  "replace, don't delete" payoff lands.

## 7. Evidence log (how rev 1 was refuted — preserved)

- Phase 0 divergence probe built + iterated v1→v4 (transition+settle emit, instance
  marker, write-leader tagging, quiescence-anchored snapshot). Commits
  `4de099ad`/`32ef4a7a`/`67177f14`/`2e254983`.
- 5 N=3 gates with the probe on: **15/15 runs converged, 0 corrupt.**
- Deterministic equivalence test: owner rule reproduces the authoritative published
  set on all **14 real converged fixtures** (incl. freeze+unreachable), 90/90.
  Commit `1ccc6f08`.
- Phase 1 owner rule reconciled (self-knowledge + freeze-gated trim), subagent-verified
  SOUND. Commit `55b98782`.
- Flip wiring (default-off), N=8 gate **8/8 converged, 0 corrupt, 0 epochs_disagree**
  (`stat-gate-20260620T183307Z`). Commits `01bb265c`/`abf8db09`.
- **REFUTATION:** making the flip default broke **~45 coordinator unit tests** —
  recovery cohort, ACK derivation, epoch monotonicity, trim, priority spread. The
  N=8 gate measured END-STATE convergence; the unit suite measured the intermediate
  decisions the minimal rule gets wrong. Reverted (`a40069f3`).
- Option-3 rewire (owner authors the *serving set* = orchestration INPUT, not the
  published set): 45 → 7 failures (`b982f006`). The trim residual then proved the
  owner rule structurally lacks presence evidence; Path-Y (keep projection + thin
  self-correction) drove 7 → 0 but only as a near-no-op — i.e. the flip only passes
  if it does NOT replace the projection. Strategic finding committed `f6f81518`.
- **Lesson:** a clean altitude diagnosis ("truth has no owner; 7 sources = mess")
  can be wrong about whether the complexity is *essential*. Deterministic
  implementation is the real test of a simplification thesis. Here it converted a
  doomed "delete the projection" effort into the correct "name + replace the layers"
  plan — before a multi-session rewrite was sunk into it.

## 8. Implementation-contact findings on rev-2's near-term levers (2026-06-21)

Before coding either rev-2 near-term lever, both premises were checked against the
source (grep + two independent multi-file audits, owner-authority read directly).
**Both near-term levers turned out smaller than the inventory framed — the same
"is this complexity essential / already-handled?" failure mode as §7.** The genuine
remaining win is §5 **step 1** (name layers + structural guard), now with a precise
allowlist and *zero current violators*.

- **Finding 1 — Lever #3 (triad consolidation) premise refuted.** The 8 "exact triad"
  tables are NOT 8 copies of a shared classifier. The *availability* half (produces
  `…_UNAVAILABLE`) is **already one parametric function** —
  `selectOperationWorkflowVariant(value, variants, fallback)`
  (`operation-workflow-owner-evidence.js:69`), applied uniformly to all ~20 evidence
  fields. The *classification* half (`operation-workflow-owner-ports.js`) is genuinely
  idiosyncratic: each is a one-line ternary over a **different** input — `context.cause`
  (timeout/history :304/:310), `retryScheduled` (retry budget/deadline :424–429),
  authority state (wake :462), or a hardcoded constant (lease `CURRENT` :380, command
  `IDLE` :361/:467). Several never emit their third value in production. **6 enum values
  are 1:1 with externally-observed reason codes** → must be preserved verbatim. A
  "parametric evaluator" here is a forced, lossy wrapper over 8 distinct predicates +
  8 label-triples, removing zero behavioral redundancy. **Not a real lever.**
- **Finding 2 — Lever #1 (consumer collapse) is essentially already done.** Audited 21
  consumer files (rebalancer + admin + diagnostics + bootstrap). **Genuine ad-hoc
  membership-truth re-derivers: 0.** Membership reads already route through the
  published-view read API (`resolvePublishedActiveNodeIds` /
  `getLatestPublishedMembershipRow`) or the legitimate full projection
  (`resolveActiveNodeViews` — only ~5 src call sites: planning-evidence,
  candidate-derivation, admin snapshot, bootstrap-cluster-view-owner, membership-owner-shadow,
  all of which genuinely need the FD/readiness overlay). The 3 sites flagged "ad-hoc"
  are **transport-liveness gates** (FD evidence by design: critical-topology cache
  enumeration, priority-readiness connected-node lag detection, remove-safety `pingNode`)
  — these are the scattered FD evidence Lever #2/§5-step-3 targets, NOT membership reads
  to collapse. `resolveOperationWorkflowOwnerAuthorityState`
  (`operation-workflow-owner-ports.js:243`) is operation-ownership (owner from operation
  metadata vs local `nodeId`), not membership. The "~11 consumers re-derive membership"
  premise does not hold.
- **Implication for the work order.** §5 step 1's **structural guard is the real,
  safe, additive next increment** — and the audit just supplied its allowlist (the ~5
  legit `resolveActiveNodeViews` callers; everyone else reads the published view) and
  confirmed **0 current violators**, so it lands GREEN and *prevents future regression*
  (the architecture is correct now but unprotected). Lever #2 (FD consolidation of the
  transport-liveness gates) remains the larger, genuine "replace-with-named-protocol"
  payoff. Lever #3 is dropped.
- **§5 step 1 LANDED (commit `289115c9`):** `membership-layer-boundary.guard.test.js`
  (GREEN, 0 violators, falsifier-RED per evasion) + `membership-layer-ownership-contract.md`.
- **Finding 3 — Lever #2 (FD consolidation) premise also largely refuted** (scoping doc
  `failure-detector-consolidation-scope.md`, subagent-verified). The control-plane FD is
  ALREADY one owner (`resolveProjectedActiveNodeSelection`); the ~15 guards are in-pipeline
  helpers; the freeze is a named suspicion-quorum clamp. The residual ~9–10 scattered
  transport-liveness probes are mostly **local real-time operational gates**, not a clean
  fold. Lever #2 therefore reduces to (a) naming/doc (low value) or (b) a **SWIM/Lifeguard/
  φ-accrual protocol replacement** — a behavior-change *upgrade*, operator-gated on §6
  (strong-vs-weak, adopt-vs-specify, appetite), NOT a cleanup. **Net: all three rev-2
  levers shrank on contact; the membership architecture is already substantially correct +
  consolidated + now guarded. The only remaining large investment is the optional protocol
  upgrade.**
