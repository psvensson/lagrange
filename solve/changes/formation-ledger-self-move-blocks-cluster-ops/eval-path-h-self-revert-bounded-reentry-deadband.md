# Eval — FIX PATH H ("self-revert / bounded-re-entry DEADBAND on the count-changing move")

Scope: evaluation only, no src changed. Companion to `research-SYNTHESIS.md` (H = cut b),
`research-external-systems.md` (CRDB undo-sim; K8s HPA), `research-existing-solutions-project-history.md`,
and the prior evals `eval-path-b-hysteresis.md` (timer, node-boundary-inert),
`eval-path-c-incumbent-hysteresis.md` (score term, count-invisible),
`eval-path-d-view-completeness.md` (authoritative OPS read = wrong table + stale),
`eval-path-e-services-freshness.md` (SERVICES-row watermark, GO-WITH-CAVEATS, HIGH effort).
Every claim carries a `file:line` or SHA.

Path H (two precedented forms, evaluated separately because they are NOT the same mechanism):
- **H1 — CRDB "simulate the undo":** before emitting a count-CHANGING move, simulate the
  opposing leg; if the move would be immediately self-reverting, don't emit it
  (`research-external-systems.md:64-75`).
- **H2 — active-gate bounded-re-entry (`AllowUnboundedReentry=FALSE`):** refuse a
  count-CHANGING move if the target is already **covered** by an in-flight / just-completed
  operation — idempotence against dispatched work, the way the shipped active-gate fix
  excludes already-covered/published nodes from re-entering the reconcile
  (`models/active-gate/ActiveGate.tla:69-82`;
  `src/control-plane/publication-active-gate-handoff-contract-decision.js:27-31`).

---

## HEADLINE VERDICT — **NO-GO** (confidence HIGH)

**H does not survive the crux. Both precedented forms are defeated by the exact failure
that killed B/C/D/F, and by a subtle misreading of what the active-gate wheel actually is.**

- **H1 (CRDB undo-sim) is defeated by stale-view SELF-CONSISTENCY** — the naive undo-check
  provably does NOT trip on either phantom leg (§1a). This is crux risk #1 from the
  synthesis, and the code confirms it.
- **H2 (active-gate bounded-re-entry) keyed on IN-FLIGHT-OP COVERAGE is node-boundary-immune
  (its one genuine advantage over B) BUT reads the same lagging `systemTableCache` as D, and
  the specific window that matters — a JUST-COMPLETED spread REPLACE — is FILTERED OUT of the
  in-flight set (F's refutation), so the coverage signal does not trip in the phantom window**
  (§1b). Where it does have a signal it only catches the target-overlap subset, not the
  count-miscount subset (§3).
- **The active-gate wheel's load-bearing part is NOT the rule-table shape — it is the
  freshness-fenced, durable, MONOTONIC `covered`/`published` set** (`ActiveGate.tla:20,35,39-43`).
  Instantiating that for the rebalancer requires a durable freshness fence the move path does
  not have — which is **exactly Path E's watermark build**. So the honest form of H2 collapses
  INTO E, not away from it (§2).

**Head-to-head vs E:** H is NOT genuinely cheaper-AND-correct. The cheap forms (H1, H2-on-cache)
are incorrect; the correct form (H2 with a durable freshness fence) IS E's build plus a rule
table on top. H is either refuted or a strictly-more-expensive E. **REUSED/EXTEND/NEW tag: the
active-gate machinery is NEW machinery wearing a reused NAME** (§2).

---

## 1. THE CRUX — does the deadband FIRE on a stale-but-internally-consistent view? → **NO**

### 1a. H1 (CRDB "simulate the undo") — defeated on BOTH legs by stale-view self-consistency

The two phantom legs and their governing count arithmetic:

- **Phantom ADD** (`increase_replica_count`): `needed = targetCount - currentCount`, one ADD
  per unit, over the stale committed `currentCounts`
  (`move-planner-move-calculation-methods.js:295-303`). A fresh leader that reads
  `activeCount` LOW simulates: add → land AT target. Simulate the down-replication undo → at
  target, no surplus → **would NOT remove** → undo-check does not trip → **phantom ADD
  proceeds.**
- **Phantom REMOVE** (`spread_replicas`/`node_not_in_target`): `excess = currentCount -
  targetCount` over `replicasByNode` (committed rows, `:357-361`); the over-creation cap keys
  on `inFlightAccounting.activeCount > targetReplicaCount` (`:329-347`). A fresh leader that
  reads a node OVER simulates: remove → land at target. Simulate re-add → at target, no
  deficit → **would NOT re-add** → undo-check does not trip → **phantom REMOVE proceeds.**

The undo-check operates on the SAME stale view that produced the miscount, so the view is
**internally self-consistent**: "remove → target → no re-add" and "add → target → no re-remove"
both evaluate cleanly. This is verbatim the synthesis's crux risk #1
(`research-SYNTHESIS.md:44-50`), and the count code confirms it mechanically. **H1 is INERT on
the observed REPLACE→ADD→REMOVE signature.** CRDB's undo-sim works in CRDB because the
leaseholder-only decision (`research-external-systems.md:69-71`) guarantees a single fresh
authority; our fresh leader acts on a lagging replicated read — the precondition CRDB's guard
assumes is exactly the one our bug violates.

### 1b. H2 (bounded-re-entry keyed on in-flight-op COVERAGE) — the only trip-able form, and it does not reliably trip

The synthesis correctly identifies the only escape: key the deadband on **in-flight-operation
coverage** (idempotence against dispatched work), not on the count
(`research-SYNTHESIS.md:47-50`). I traced whether that signal is (i) available synchronously,
(ii) node-boundary-immune, (iii) not defeated by cache lag.

**(i)+(ii) — GENUINELY available sync and node-boundary-immune (H's one real advantage over B).**
`getInFlightOperations()` reads `this.systemTableCache.filter(REPLICA_OPERATIONS, …)`
synchronously (`unified-rebalancer-replica-state.js:544-554`); `getTopologyBlockingInFlightOperations()`
filters it (`:632-636`). Because it is a **shared cache read, not per-node in-memory state**,
it is visible to whichever node just won leadership — so it does **NOT** suffer B's
node-process-boundary inertness (`eval-path-b §1a`). This is the single respect in which H
improves on B. **But that is where the good news ends.**

**(iii) — DEFEATED by the same lagging cache as D, and by the filtered-out window from F.**
- The read is the **same `systemTableCache`** that feeds D's ops read
  (`eval-path-d §1`, "both halves lag from the SAME cache on a fresh leader"). On a fresh
  leader mid-flap the in-flight-ops view is as stale as the rows view.
- **The window that matters is filtered OUT.** The phantom fires precisely because a prior
  spread REPLACE **COMPLETED** but its completion is not yet in the fresh leader's ROWS view.
  A just-completed / terminal REPLACE is **excluded** from the in-flight set:
  `isTopologyBlockingInFlightOperation` drops REPLACE remove-dispatch-phase rows
  (`unified-rebalancer-replica-state.js:613-624`), and terminal ops are dropped by
  `isTrackedInFlightOperation` (`eval-path-f §1-§3`, `replica-operation-liveness.js:527-538`).
  So H2's "target already covered by an in-flight/**just-completed** operation" idempotence has
  **no coverage row for exactly the just-completed REPLACE** it needs to recognize. It does not
  trip in the phantom window.
- **The in-flight signal is ALREADY consumed by the count path and already proven insufficient.**
  `computeInFlightAwareReplicaAccounting` is fed `getEntityTopologyBlockingInFlightOperations()`
  (`move-calc:312-316`); `inFlightReplaceInCreationCount` counts in-creation REPLACEs
  (`in-flight-aware-replica-count.js:151-156`) but is **EXCLUDED from `deficitEffectiveCount`**
  (`:225-226,229-230`), and `inFlightAddCount` is 0 in this signature (prior ops are REPLACEs,
  `eval-path-d §1`). H2 re-uses the same coverage evidence the accounting already reads and
  already cannot act on.

**Conclusion on the crux:** H1 is defeated by stale-view self-consistency; H2 dodges B's node
boundary but re-inherits D's cache staleness and F's filtered-out-terminal window. **Neither
form reliably fires in the phantom window. The crux FAILS.**

## 2. Reuse depth — can the active-gate machinery be EXTENDED, or is it NEW-wearing-a-name? → **NEW**

The synthesis's strongest claim is "H reuses a wheel we already ship" (`research-SYNTHESIS.md:28-34`).
Read at the code, that claim does not hold.

**What the active-gate wheel actually is:** in `ActiveGate.tla` the bounded-re-entry route is
NOT a standalone "don't self-revert" rule. It is a bounded re-entry over a **durable, monotonic,
FRESHNESS-FENCED coverage set**:
- `covered`, `published` are monotonic sets; `AllowUnboundedReentry=FALSE` simply **disables the
  regression action** `DeferReentry(n)` that would return a covered node to `pending`
  (`ActiveGate.tla:69-82`).
- Convergence **requires `fresh`** (`:39-43`), and `StaleEvent` (which clears `fresh`) is ALSO
  gated off in the bounded route (`:78-82`). The freshness fence is intrinsic, not incidental.
- The runtime decision table carries the fence explicitly:
  `freshnessRevisionRequirement` / `durablePublicationRevision` / `snapshotCoverageRevision` /
  `requirementSatisfied = revisionObserved && freshnessObserved`
  (`publication-active-gate-handoff-contract-decision.js:332-344`), and the "already covered"
  exclusion keys on the **published** set, not a cache read
  (`collectPublicationActiveGateActivePendingReconcileNodeIds`, `:27-31`).

So the load-bearing part of the wheel is exactly the thing the rebalancer move path lacks: a
**durable, freshness-fenced, monotonic "spread covered" set**. Dropping only the rule-table
SHAPE onto the move path — keying the exclusion on the lagging `systemTableCache` instead of a
freshness-fenced published set — reproduces H2, which §1b refutes. Instantiating the wheel
FAITHFULLY (with the freshness fence) is **exactly Path E's build**: a services-row raft-index
watermark end-to-end (`eval-path-e §1`, HIGH effort). Either way H is not cheap reuse.

**Structural specificity:** the decision rule table is a bespoke frozen array of
`{state, reasonCode, nextAction, matches}` whose `matches(evidence)` predicates reference
publication-specific evidence (`publishedActiveNodeIds`, `pendingReconcileNodeIds`,
`missingPublishedNodeIds`, `snapshotCoverage`, `durablePublication`)
(`publication-active-gate-handoff-contract-decision.js:33-132`). There is **no shared generic
decision-rule/deadband util** to import; extending to the rebalancer means a NEW rule table over
NEW evidence with NEW `matches`. The genuinely reusable asset is the **METHOD** (model the
invariant in the TLC/`CoupledAdmission` harness first, `research-SYNTHESIS.md:35-40`) and the
TLA+ TEMPLATE (`covered`/`published`/`fresh` + bounded re-entry) — but the template's `fresh`
variable is precisely the fence E must build.

**REUSED/EXTEND/NEW: NEW** (rule-table shape reused in name; the load-bearing freshness fence
must be built = E). The interlock's own precedent for "fresh leader + stale local view" already
shows the shape of the real fix: a **cache-BYPASSING owner-RPC re-verify**, and it is **async**
(`rebalance-coordinator-ledger-interlock-admission.js:283-302`, `requireOwnerRpcRead:true`
`:290-293`) — i.e. c7a3bf19 had to leave the cache to be correct, the same escape H2-on-cache
refuses to make.

## 3. Does H fix BOTH phantom legs, or only one? → **Neither reliably; and only the OVERLAP subset even in principle**

- H1: fixes **neither** leg (§1a — undo-check inert on both ADD and REMOVE).
- H2: the coverage idempotence can, in principle, suppress a phantom move that targets the
  **same node** as a still-visible in-creation REPLACE. But the phantom ADD/REMOVE born of a
  stale COUNT can target a **different** node (one the stale view thinks is under/over target)
  that carries no in-flight op — that subset has no coverage row and is not caught. So even in
  its best case H2 addresses only the **target-overlap subset**, not the **count-miscount
  subset**, which is the driver (`eval-path-d §1`: the miscount is a `currentReplicas`/`activeCount`
  divergence, `move-calc:333,360`). Contrast E, which gates the whole count-CHANGING class on a
  row-view freshness precondition and therefore covers both legs (`eval-path-e §6`).

## 4. Freeze / legit-spread risk → **avoids the freeze, but only because it does nothing (H1); H2 risks the F-class false-suppression**

- H1 emits nothing new and suppresses nothing (§1a), so it does **not** freeze the legitimate
  first spread — but only because it is inert. No benefit, no harm.
- H2: if the coverage check were made aggressive enough to fire in the phantom window (e.g. by
  treating terminal/just-completed REPLACEs as "covered"), it would re-introduce exactly F's
  hazard — suppressing a **genuine** count change because a prior, now-drained REPLACE looks
  like coverage — masking real deficits (`eval-path-f §1-§3`). The legitimate first spread off
  the concentrated seed has NO prior op to be "covered" by, so a pure coverage gate does not
  freeze it; but a coverage gate strong enough to catch the phantom is strong enough to
  suppress a real follow-on ADD. Same too-weak/too-strong bind that sank C
  (`eval-path-c §4`), one layer over.

## 5. Change site + effort + DT

- **Injection site (shape):** the count path in `calculateMoves`
  (`move-planner-move-calculation-methods.js:295-361`), alongside the over-creation cap
  (`:329-347`) — a **sync** local check. H's sole structural win is that the coverage read
  (`getInFlightOperations`, `unified-rebalancer-replica-state.js:544-554`) is already sync and
  shared, so unlike E it needs **no async pre-load on `setLeader`**
  (`unified-rebalancer-lifecycle-base.js:475-483`). Effort of the CHEAP form: LOW. But the
  cheap form is the refuted form (§1).
- **Correct form effort:** to make H2 fire correctly it needs a freshness-fenced coverage
  signal = E's watermark build (`eval-path-e §1`, HIGH) + a rule table on top = **strictly more
  than E**.
- **DT (multi-node mandatory — single-instance shares one cache and false-passes,
  `eval-path-b §5`):** compose `dt6-rebalancer-formation-self-move-interlock.test.js` +
  `dt6-ledger-leader-durability-fitness.test.js` +
  `dt6-formation-ledger-spread-completion-self-move-interlock-deadlock.test.js`; virtual clock
  past the 60s legal hold + 3× 1s strikes; seeded RNG for the leadership-start jitter. Binding
  observable pair H must move: (i) a fresh leader whose prior-epoch spread REPLACE has completed
  but whose ROWS view is stale does **NOT** emit the phantom count move; (ii) a genuine deficit
  STILL spreads. **H fails the pair for the same structural reason B/C/D/F fail it:** in the
  phantom window the completed REPLACE is filtered out of the in-flight set (H2) and the
  undo-sim is self-consistent (H1), so the gate cannot separate (i) from (ii). A faithful
  multi-node DT would expose the contradiction, not confirm a fix — and a single-instance rig
  would FALSELY pass H2 by sharing one already-fresh cache.

## 6. Interactions

- **c78833f0 deficit credit / over-creation cap / REPLACE serialization / deficit reconcile**
  (`move-calc:329-347,507-582,625-646`; `in-flight-aware-replica-count.js:160-211`) — all key on
  `activeCount` and already consume the in-flight set H2 would re-read. H adds no new signal
  they lack; it double-reads the same evidence.
- **c7a3bf19 ghost re-verify** (`interlock-admission.js:283-302`) — the real precedent for
  "fresh leader + stale local view," and it went **cache-bypassing + async** to be correct. H2's
  cache-first sync coverage read is the shape c7a3bf19 had to abandon.
- **run-20/22 self-move serialization + quorum-concentration hold** (`:195-222,315-338`) —
  untouched by a planner-count deadband; structurally intact, no benefit and no new risk.

---

## Ratings

| Axis | Rating |
| --- | --- |
| Crux — deadband fires on a stale-but-consistent view? | **NO** (§1 — H1 self-consistent-inert; H2 cache-stale + filtered-out window) |
| Node-boundary-immune? | **YES for H2** (§1b — shared-cache read; H's one genuine gain over B) |
| Reintroduces D's staleness / F's filtered-terminal window? | **YES** (§1b — same `systemTableCache`; terminal REPLACE excluded) |
| Fixes both phantom legs? | **NO** (§3 — H1 neither; H2 only the target-overlap subset) |
| Freeze risk | **LOW-but-inert (H1) / F-class false-suppression (H2)** (§4) |
| Reuse depth | **NEW wearing a reused name** (§2 — load-bearing part is the freshness fence = E) |
| Risk / Effort | **MED / LOW (refuted cheap form) or > HIGH (correct form = E + rule table)** (§5) |

## VERDICT: **NO-GO** (confidence HIGH)

H's two precedented forms both fail the crux. The CRDB "simulate the undo" form (H1) is inert on
the observed signature because the undo-check operates on the same stale view that produced the
miscount, so "add→target→no re-remove" and "remove→target→no re-add" both evaluate cleanly
(`move-calc:295-303,329-347,357-361`; crux risk #1, `research-SYNTHESIS.md:44-50`). The
active-gate bounded-re-entry form keyed on in-flight-op coverage (H2) is **node-boundary-immune**
— its one real improvement over B (`getInFlightOperations`, `unified-rebalancer-replica-state.js:544-554`)
— but reads the same lagging `systemTableCache` as D and cannot see the just-completed REPLACE
that drives the phantom window because terminal/drain-phase REPLACEs are filtered OUT of the
in-flight set (`:613-624`; `eval-path-f §1-§3`), and it addresses only the target-overlap subset,
not the count-miscount subset that is the driver.

Critically, the active-gate wheel the synthesis invokes is **not** a bare "don't self-revert"
rule — its load-bearing element is a durable, monotonic, **freshness-fenced** coverage set
(`ActiveGate.tla:20,35,39-43,78-82`;
`publication-active-gate-handoff-contract-decision.js:332-344`). Reproducing it faithfully on the
rebalancer requires the freshness fence the move path lacks — **which is Path E's watermark
build**. So H is either the refuted cache-first form or a strictly-more-expensive E. It is
**not** genuinely cheaper-AND-correct.

### Head-to-head vs Path E
E is the only path on the correct axis (stale committed replica ROWS) whose deferral is bounded
and non-circular (`eval-path-e §3-§4`). H does not beat it: the cheap H is wrong (§1), and the
correct H is E-plus-a-rule-table. **Keep E as the candidate root; do not divert to H.** The one
honest fragment worth carrying forward from H is the confirmation that the coverage read is
**sync and node-boundary-immune** — but that only tells us WHERE a fix could sit cheaply, not
that a cache-first signal there can be correct. Per the coupled-invariant method
(`research-SYNTHESIS.md:35-40`, `operational-ground-truth.md:73-89`), if a bounded-re-entry
invariant is pursued it must be **modelled in the TLC harness with an explicit `fresh` fence
first** — and that fence is E.
