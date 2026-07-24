---
audience: development
---

# LLM Development / Bugfixing Process Improvement Plan

Status: VERIFIED (adversarial subagent pass applied 2026-06-15). Author: analysis
of work 2026-06-13 .. 2026-06-15.

> Corrections from the verification pass are marked **[V]** inline. The load-bearing
> correction: WS4 Option A (a "yielding" `Sync` build) is INFEASIBLE — ~30 callers
> across ~20 files depend on the synchronous return; see WS4. Also: default gate
> runs produce GZIPPED `.full-logs/rolling-restart/<nodeId>.log.gz`, NOT
> `node.ndjson` (which exists only under the perturbing debug-logs mode) — every
> WS1/WS2 artifact reference is corrected accordingly.

## FLAG VALIDATION CAMPAIGN VERDICT (2026-06-15, 11 gate runs from clean containers)

The two flag-gated behavioral changes (WS5, WS4) were tested against a same-tree
baseline. **Neither target precondition fired in 11 runs — the tree is healthy and
prior CL work drove both bug-classes rare** — so the campaign proved *no-regression*
but could not prove *load-bearing*.

| Round | Result | target precondition |
| --- | --- | --- |
| Baseline (flags off) | 4/4 CONVERGED, walls p50 414s | 0/4 |
| WS5 on | 3 CONVERGED / 1 SLOW (0 corrupt), p50 407s | OPEN-stuck **0/4 — inert**; the SLOW was unrelated `published_member_missing` |
| WS4 on (3 runs) | 3/3 CONVERGED, walls 384–411s (tightest) | freeze never bound, **0/3** |

**Decisions (neither de-flagged — no engagement evidence to justify defaulting
unvalidated hot-path behavior):**
- **WS5 (`LAGRANGE_OWNER_IDEMPOTENT_CLOSE`) — REMOVED** (reverted, commit 60c429c8).
  Its OPEN-stuck target is now inert across four cumulative gate rounds (the ledger's
  075853Z + 085729Z, plus baseline + WS5 here) and the ledger already carries a
  standing note not to iterate the OPEN-row driver until a gate reproduces the state.
  Prior fixes (variant-A close lane, CL-037) eliminated the precondition; carrying a
  never-triggered re-drive on the owner hot path is unjustified surface. The
  deterministic finding + repro design remain recorded here.
- **WS4 (`LAGRANGE_READINESS_BUILD_BOUND`) — KEPT flagged-off**, registered as a
  candidate lever on **CL-039** (the LIVE frontier: a residual seed event-loop gap
  > the raft election timeout shedding publications-p1 leadership — exactly what WS4
  bounds). It didn't fire in 7 healthy runs because the freeze is intermittent, but
  CL-039 documents it occurs there. Validate it when a CL-039 gate reproduces the
  freeze (`reproduced` rung); do not default until then.

---

This plan implements eight recommendations to make distributed convergence
debugging cheaper and less error-prone for an LLM operator. Each workstream is
grounded in concrete current-state file:line references gathered before writing,
and several recommendations were **corrected** against the code (noted inline).

Sequencing rationale: WS1–WS3 are cheap, high-leverage *enablers* that pay back
on every subsequent bug (observability, gate discipline, record clarity). WS4–WS6
are the systemic code/architecture fixes that dissolve bug *classes*. WS7 locks in
a finished refactor. Do WS1–WS3 first; they make WS4–WS6 measurable.

---

## WS1 — Per-incarnation log capture (observability) — HIGHEST IMMEDIATE ROI

**Recommendation #4.** Unblocks the entire rejoin-side frontier (CL-001 A/B/C).

### Corrected problem statement
Re-attachment already exists. `createNodeLogStreamer` in
`test/distributed/harness/full-node-log-capture.js:134-248` re-attaches on stream
end via `scheduleReattach()` (`:193-217`) using `since: lastDockerTs`, and
`chaos.js` `restartNode` (`:217-251`) reuses the **same containerId**, so the
follow stream resumes. The real defects are:

1. **No incarnation boundary.** `fullLogDestPath()` (`:61-63`) keys the file by
   `nodeId` only (`.full-logs/<scenario>/<nodeId>.log.gz`); the file-based path
   (`:54-55`) likewise. Both incarnations accumulate into one file with **no
   marker** separating pre- and post-restart lines. `_scanBootProvenance`
   (`cluster-class-lifecycle-base.js:1051-1087`) keeps only the LAST boot record,
   so an investigator cannot slice "second-incarnation only".
2. **Re-attach gap.** `DEFAULT_REATTACH_DELAY_MS` (`:28`, 1000ms) is a window
   where post-restart lines emitted before re-attach are lost.
3. **No restart re-stream call.** `_restartNodeWithObservation`
   (`cluster-class-lifecycle-base.js:1429-1450`) calls `_chaos.stopNode` then
   `_chaos.startNode` (NOT `_chaos.restartNode`) but does NOT call
   `_beginNodeLogStream` again, relying solely on the `onEnd` re-attach. **[V]**

**[V] TWO CAPTURE MODES — the mechanism below applies to only one.**
- **Default (streamer) mode** produces `.full-logs/rolling-restart/<nodeId>.log.gz`
  (GZIPPED) via `createNodeLogStreamer`. The incarnation-thunk + synthetic-boundary
  approach works here.
- **File-logging mode** (`LAGRANGE_DEBUG_LOGS` / `LAGRANGE_CAPTURE_LOGS`,
  `cluster-class-lifecycle-base.js:416-419`) is the ONLY mode that produces
  `node.ndjson`, and `_beginNodeLogStream` **early-returns at `:935-937`** — there
  is no streamer to inject a boundary into, and this mode carries the
  `[[debug-logs-observer-effect-on-seed]]` perturbation. So WS1 targets the
  DEFAULT `.log.gz` path; for `node.ndjson` the node must emit its own
  `incarnation` field at boot (app-side) or write a boundary marker into the
  bind-mounted file. Do NOT switch to debug-logs mode just to get `node.ndjson` —
  it perturbs the convergence being measured.

### Concrete steps
1. **Emit an incarnation boundary record.** In `_restartNodeWithObservation`
   (`cluster-class-lifecycle-base.js:1429-1450`), after `_chaos.startNode(id)`
   returns, increment a per-node `incarnation` counter (new field on the node
   object in `_nodes`, default 1) and write a synthetic boundary line into that
   node's capture stream: `{harnessEvent:"incarnation-boundary", nodeId,
   incarnation, atDockerTs}`. This is a harness-injected line, not app output, so
   it survives the sparse-bundle problem.
2. **Stamp every captured line with `incarnation`.** In the line handler inside
   `createNodeLogStreamer` (`full-node-log-capture.js`, the write path
   `:161-217`), thread the current incarnation (read from a callback the streamer
   is given, or from a shared mutable ref updated in step 1) and add `inc:<N>` to
   each written record. Cheapest implementation: the streamer takes a
   `getIncarnation()` thunk; the cluster updates the backing counter on restart.
3. **Optionally segment the gz file** by incarnation
   (`<nodeId>.inc<N>.log.gz`) via `fullLogDestPath()` (`:61-63`). Keep the merged
   file too for backward compatibility, or add a `--full-logs-per-incarnation`
   harness flag. Decision left to verifier (see Open Questions).
4. **Shrink the re-attach gap.** Reduce `DEFAULT_REATTACH_DELAY_MS` (`:28`) and/or
   proactively re-attach immediately after `startNode` instead of waiting for
   `onEnd`. Confirm docker `--since` overlap dedup still holds (the existing
   `lastDockerTs` mechanism `:212` already de-overlaps).

### Guard / verification
- New harness unit test in `test/distributed/harness/__tests__/` (alongside
  `full-node-log-capture.test.js`): start node → write line A → restart →
  write line B → assert a parsed capture yields `inc:1` for A, an
  `incarnation-boundary` record, and `inc:2` for B.
- Re-run any rolling-restart gate run and confirm a restarted node's
  post-restart lines are filterable by `inc:2` in the GZIPPED
  `.full-logs/rolling-restart/<nodeId>.log.gz` (read with `zcat`/`zgrep`) — **[V]**
  NOT `node.ndjson`, which only exists in the perturbing debug-logs mode.

### Effort / risk
Small (1 file pair + 1 test). Risk: low; harness-only, no `src/` change, cannot
affect convergence behavior. Update `[[full-logs-gz-vs-ndjson-trap]]` memory after.

---

## WS2 — `reproduced`-before-fix gate rung + fix-engagement / precondition analyzers

**Recommendations #1 and #2.** Stops the "land a fix, then burn N gate runs to
discover it was inert" bleed (CL-001 variant A was inert across 075853Z + 085729Z,
~2h of gate wall; the lesson is already recorded in CL-001).

### Part A — process rung (cheap, doc + checklist)
The closure grammar (`closure-grammar.md`) already defines a `reproduced` status
between `narrowed` and `fix_in_progress`. It is being skipped in practice (records
jump `open` → "fix landed + statistical gate").
1. In `closure-grammar.md`, add an explicit **transition rule**: a record MUST NOT
   enter `fix_in_progress` until it is `reproduced`, where `reproduced` means
   EITHER (a) a deterministic/semi-deterministic targeted repro test exists, OR
   (b) the precondition recurrence rate has been MEASURED on a gate (so a fix
   gated on a rare precondition is known-rare before authoring).
2. Add a one-line `reproducedBy:` field to the record-fields table (test path or
   gate-run + measured recurrence %).

### Part B — `analyze:fix-engagement` analyzer
Turns the per-round manual subagent mining ("did the fix fire?") into a flag.
- New script `scripts/analyze-fix-engagement.js`; npm alias `analyze:fix-engagement`
  in `package.json` (analyzer block near `:87-95`).
- Input: a stat-gate run dir. **[V]** Full-logs live at
  `.playback/<run>/.full-logs/rolling-restart/<nodeId>.log.gz` (GZIPPED) — the
  analyzer must `gunzip`/`zcat` these, not read `node.ndjson` (which only exists
  under debug-logs mode).
- Reuse `scripts/artifact-sidecar-loader.js` (`readArtifactWithSidecarsSync`,
  `:75`) for report loading and a gzip-aware line reader for full-logs.
- Detection: parse lines where `msg === "convergence decision trace"` (emitted by
  `_emitConvergenceDecisionTrace` in
  `src/control-plane/membership-publication-coordinator-reconcile.js:77,580-595`).
  **[V]** This trace is `logConsoleOnly` at level `info` — it is NEVER persisted to
  the logs table, so it appears only in the stdout-derived `.log.gz`. For a
  named signal (default `ownerAckCompletionPendingCount`), report per-run:
  count of `decision:"drive"` traces, count where `<signal> > 0`, and count of
  those that reached `outcome:"reconcile-committed"` vs `"reconcile-timed-out"`.
- Output JSON `{run, driveTraces, signalEngaged, committedAfterEngage}` + a
  markdown one-liner per run. `signalEngaged === 0` across all runs ⇒ INERT.
- Make the signal field a CLI arg (`--signal ownerAckCompletionPendingCount`) so
  future fixes reuse the same analyzer.

### Part C — `analyze:precondition-recurrence` analyzer
- New script `scripts/analyze-precondition-recurrence.js`; npm alias.
- Input: a stat-gate run dir (all `*-run<i>.report.json` + their full-logs).
- Detect named preconditions per CL family, each a small predicate over the
  per-run owner stream / failure-bundle:
  - OPEN-stuck (variant A): a publication with `status:"OPEN"` and
    `pendingAckCount >= 1` persisting to budget.
  - tier1-degradation (variant B): owner decision trace with
    `leadershipTier:"tier1-partition-row"` AND `outcome:"reconcile-timed-out"`
    sustained.
  - lease-lapse-trim (variant C): owner log `"Skipped lease disconnect for
    transport-connected node"` co-occurring with `clusterMemberUnhealthyExcluded`
    / `readinessExcluded` naming a transport-connected node.
- Output: `{precondition, runsObserved, totalRuns, recurrenceRate}`. This is the
  number you measure BEFORE authoring a fix (Part A rung b).

### Guard / verification
- Run both analyzers against an existing `.playback/stat-gate-*` dir and confirm
  they reproduce a known verdict by hand (e.g. 085729Z should report variant-A
  `signalEngaged: 0` — matches the ledger's "ZERO across all 8 runs").

### Effort / risk
Medium (2 read-only Node scripts + grammar edit + npm aliases). Risk: low;
analyzers are read-only over artifacts. No runtime change.

---

## WS3 — CL record restructuring (state-header + append-only log; split variants)

**Recommendation #3.** CL-001 is 890 lines / ~27k tokens — it **truncates on a
single Read**, so an LLM cannot load current state in one pass.

### Concrete steps
1. **Record template change** in `closure-grammar.md`: every CL record begins with
   a fenced `## STATE` block (≤ ~30 lines) containing exactly: `status`,
   `firstViolatedInvariant` (current), `authoritativeOwner`, `stableWitness`
   (current), `nextFalsificationStep`, and `lastGate` (ts + verdict). Everything
   below a `## LOG (append-only)` header is history and is never edited, only
   appended. Acting on a record requires reading only the STATE block.
2. **Split CL-001 into three records** per the grammar's OWN atomicity rule
   ("two distinct first violated invariants → two records"): the variants are
   different owners/invariants:
   - CL-001 (keep) = published-membership convergence umbrella → point to children.
   - CL-001A = OPEN publication never closes (ack-completion gap).
   - CL-001B = owner reconcile cannot commit at tier1 leadership (freeze→leadership
     spiral publication face). Owner: leadership/freeze (links WS4).
   - CL-001C = ready-lease-lapse owner trim of a transport-alive rejoined node.
   Use new IDs (CL-039/040/041) or `CL-001A/B/C` suffixed files; verifier to pick
   the convention that the index (`closure-ledger.md`) and any `check-*` script
   tolerate. Preserve all existing narrative by MOVING it into each child's
   append-only LOG (no content loss; git mv-style split).
3. Update the index `closure-ledger.md` and the handoff memory
   `[[convergence-work-handoff]]`.

### Guard / verification
- `wc -l` each resulting record < ~400 lines and the STATE block alone answers
  "what do I do next" without scrolling. No CL record should exceed the 25k-token
  Read cap.

### Effort / risk
Medium (mechanical doc surgery). Risk: information-loss during split — mitigate by
moving (not rewriting) narrative and diffing word counts before/after.

---

## WS4 — Bound the synchronous readiness build (freeze → leadership cliff)

**Recommendation #5.** Removes the cliff under CL-033/034 and CL-001 variant B.

### Corrected problem statement
`getNodeReadinessSync`
(`src/control-plane/control-plane-readiness-service-node-methods.js:333-483`) is
synchronous start-to-finish (zero awaits). Heaviest frames:
`resolveNodeMembershipPublicationPlanningAnswerSync` (`:376`, via
`control-plane-readiness-publication-planning-snapshot.js:393-406` →
memoized projection `:249-285`) and `buildEvaluatedNodeReadinessSnapshot` (`:459`,
→ `control-plane-readiness-evidence-reasons.js:295-371`). CL-033/034 memoized the
projection but did NOT **bound** the worst-case build, so variant C still measured
a 7.17s freeze > the 1–4.5s raft election timeout. Memoization makes the rare
full build cheaper; it does not cap it.

**[V] HARD CONSTRAINT — the synchronous contract has ~30 callers across ~20 files**
(query routing `query-executor-partition-service-resolution.js:248`, mutation
readiness `:252`, rebalancer ×~12, replica-dispatch ×4, partition promotion `:388`,
admission `admin-websocket-load-lane-admission.js:89`, bootstrap ×2). Any fix MUST
preserve a synchronous return, and on a COLD build (no stored snapshot — e.g. the
first routing decision) there is nothing to return immediately. This rules out a
naively "yielding" `Sync` build; the original Option A is retired as infeasible.

### Approach (the only viable shapes — both larger than memoization)
- **Option A (revised) — bound the build + serve stale on the sync path.** Cap the
  synchronous work to a bounded slice; if the full build would exceed it, return the
  last stored snapshot (the cache reuse path at `:352-373` and the existing
  `maybeStartBackgroundSyncReadinessRefresh` at `:361,446,473` already do exactly
  this) and finish the heavy build in the background. **[V]** Keeps the `Sync`
  contract but accepts bounded staleness on the hot path; the COLD-build case still
  needs a cheap minimal-readiness fast path. Contained to the readiness service.
- **Option B — move the heavy build off the event loop (worker thread).** **[V]**
  "Decoupling the heartbeat timer" is NOT achievable on Node's single event loop —
  a synchronous span starves ALL `setInterval` timers (heartbeats run on
  `setInterval`: `node-lifecycle-service.js:286`,
  `heartbeat-service-lifecycle-methods.js:304`), so the only way to stop the build
  starving the heartbeat is to remove the long synchronous span. Option B computes
  the projection in a worker thread and posts the result back; the sync path serves
  the last posted snapshot. Larger blast radius, true elimination.

### Decision input
Both keep the synchronous return. **[V]** Recommend revised Option A first
(measurable freeze reduction, contained to the readiness service) and escalate to
Option B (worker thread) only if a bounded-stale sync path still leaves a freeze
> election timeout. The "decouple the timer" framing is retired as infeasible.

### Guard / verification
- Add a gap-watchdog assertion to the gate: seed max event-loop gap MUST stay
  below the raft election timeout. Re-gate (N≥8) and confirm: max gap < election
  timeout, no `"Lost leadership"` storms downstream of a build, variant-B
  tier1-timeout livelock signature absent.
- **[V] Re-gate hygiene (CLAUDE.md ground truth):** force-fresh containers
  (`docker ps -aq --filter name=ddb-test-reuse- | xargs -r docker rm -f`) and
  confirm the boot `SRC_FINGERPRINT` matches the commit before trusting any result
  — a stale reused container will silently validate the UNFIXED build. Use
  `scripts/rolling-restart-stat-gate.sh` (clean-container path), never a single run.

### Effort / risk
Large. Risk: HIGH — touches the hottest correctness path. **[V]** Land BOTH options
behind a flag (revised Option A too, not just B). Mandatory adversarial subagent
verification (`[[verify-implementation-via-subagent]]`) + N≥8 promotion gate from
clean containers.

---

## WS5 — Idempotent close-on-every-tick (retire the no-deficit early return)

**Recommendation #6.** Removes the CL-014 / variant-A "owner reaches no-deficit and
never writes again" bug family.

### Corrected problem statement
The owner driver is ALREADY on a 5s always-on interval:
`startOwnerMembershipDriver` (`membership-publication-coordinator-reconcile.js:653-680`)
→ `setInterval(... driveOwnerMembershipReconcile ..., OWNER_MEMBERSHIP_DRIVER_INTERVAL_MS=5000)`.
The bug is the reconcile **body** early-returns: `driveOwnerMembershipReconcile`
(`:453-613`) skips when `missingCount <= 0 && ownerAckCompletionPendingNodeIds.length === 0`
(`:535-551`). So the tick fires but does nothing — an OPEN publication that needs a
status-only close (not a set change) is never re-evaluated.

### Concrete steps
1. Replace the binary skip with an **idempotent verify pass**: on every tick, even
   with `missingCount === 0`, re-evaluate whether the latest publication is in its
   terminal CLOSED/PUBLISHED state and close an OPEN-but-fully-ackable publication.
   This subsumes the variant-A `ownerAckCompletionPendingNodeIds` special-case.
   **[V] `shouldRefreshAcknowledgements`/`shouldRefreshStatus` (`:301-304`, backed by
   `hasCandidateAcknowledgementRefresh` `:126` / `hasCandidateStatusRefresh` `:136`)
   are NOT a standalone callable entry point** — they live inside
   `reconcileActiveGateMembershipPublication`'s `candidate.changed !== true` branch
   (`:290`), gated behind building a `candidate`. So step 1 must EXTRACT a cheap
   read-only predicate (or invoke the candidate-build + refresh-check path directly),
   not "call an existing function".
2. Keep the existing **thrash guards**: a publication whose pending acks are NOT
   eligible (dead / not recovery-eligible / admission-blocked) must route to
   `PROJECTED_STEADY_TRIM` / defer, never spin. Reuse the eligibility predicate
   already added for variant A.
3. The verify pass must be O(cheap) — read-only against the already-computed
   planning snapshot — so an always-on close-check does not add event-loop load
   (coordinate with WS4: do not reintroduce a freeze).

### Guard / verification
- Extend `test/control-plane/owner-membership-driver.test.js`: a stable tick
  (`publicationChanged===false`, `missing===0`, latest row OPEN with an eligible
  pending ack) DRIVES a close; a dead/ineligible pending ack does NOT spin.
- Re-gate and confirm the variant-A OPEN-stuck precondition, when it occurs, now
  self-closes (measure with the WS2 fix-engagement analyzer).

### Effort / risk
Medium. Risk: medium — thrash if the eligibility guard is wrong. The existing
timeout (`OWNER_MEMBERSHIP_RECONCILE_TIMEOUT_MS=15000`) + interval pacing bound the
worst case. Adversarial verify required. **[V] Add a kill switch** (env flag) for
the always-on close behavior — WS4 lands behind a flag and WS5 should too, given the
thrash risk; the plan originally omitted this for WS5.

---

## WS6 — Single active-set writer + leadership/active-set accessor consolidation

**Recommendation #7.** Dissolves the multi-source disagreement class behind the
whole CL-001 family.

### Corrected problem statement
`active-node-projection.js` mixes 7 sources in `resolveProjectedActiveNodeSelection`
(`:423-575`): nodeRows (`:424`), readinessByNodeId (`:442`), connectedNodeIds
(`:443`), localNodeId (`:444`), nodeEndpointRows (`:447-448`), serviceRows (`:532`),
runtimeTransportEvidence (`:467-470`). The owner-trim path
(`cluster_member_healthy_only` mode `:271-275`, `clusterMemberUnhealthyExcluded`
`:476/508/520`) is where variant C trims a transport-alive node. **[V]** The
transport-alive grace asymmetry is documented in the code itself at
`active-node-projection.js:303-304` (grace on lease-DISCONNECT, absent on the
publication-trim). **[V] CONFIRMED (was "memory hearsay"):** the designed
single-writer replacement `membership-lifecycle-controller.js` exists and is
**295 lines (partial)** — step 3 also depends on completing it, not just on
WS4/WS5 stability.

Leadership is PARTLY consolidated: `resolveControlPlanePublicationsLeadership`
(`control-plane-publications-leadership.js:42-94`, 3-tier) + derived
`isControlPlanePublicationsWriteLeader` (`:96-106`) exist, but stragglers remain:
`service.isLeaderReplica()` (kernel-ingress `:353`,
`replica-dispatch-service-lifecycle.js:426`, lease-service `:179`) and raw
`row[RAFT_ROLE]` comparisons.

### Concrete steps (staged — this is the big one; do the cheap down-payments first)
1. **Down-payment A — single active-set accessor.** Introduce one read accessor
   that every consumer of "the active node set" calls, backed today by
   `resolveProjectedActiveNodeSelection`. Migrate callers. This makes the eventual
   writer swap a one-point change and surfaces every current reader.
2. **Down-payment B — retire leadership stragglers.** Route `isLeaderReplica()` and
   raw `RAFT_ROLE` publication-leadership checks through
   `resolveControlPlanePublicationsLeadership`. (Keep per-service replica checks
   that are genuinely about a different table.) This removes the tier0/tier1
   misread surface seen in variant B/C.
3. **Cutover (gated on convergence stability from WS4/WS5).** Execute the designed
   `Membership_Lifecycle_Controller` single-writer cutover for the published active
   set, retiring the 7-source mix as a *truth* source (it may remain as *evidence*
   into the single writer). Apply the lease-disconnect transport-alive grace
   uniformly to the publication-trim path (variant C: the grace exists for
   disconnect at lease-service but not for the trim).

### Guard / verification
- **[V] CONFIRMED in code (was "memory hearsay"):** the B4 single-writer tripwire
  is `assertSingleMembershipPartition` ("B4 tripwire",
  `membership-publication-coordinator-reconcile.js:620-645`) — it must stay green;
  confirm no NEW writer is introduced.
- Re-gate; variant-C lease-lapse-trim precondition (WS2 analyzer) should drop to 0.

### Effort / risk
Very large; multi-PR. Risk: HIGH; this is the hard-cutover the whole spec targets.
Steps 1–2 are independently shippable and low-risk; step 3 is the gated finale.
Do NOT build a parallel mechanism (recurring warning across memories).

### WS6 EXECUTION FINDING (2026-06-15) — verified before any code change
- **Down-payment B is a NO-OP and attempting it would be a CORRECTNESS BUG.**
  Inspected all three named straggler sites: `control-plane-kernel-ingress.js:353`
  (per-service routing eligibility), `replica-dispatch-service-lifecycle.js:426`
  (a specific message-group's dispatch), `lease-service.js:179` (any message-group
  leader, to run the lease sweep). `isLeaderReplica()` is a GENERAL per-message-
  group / per-partition / raft-replica leadership predicate (defined on
  message-group/partition/raft services), NOT a `control_plane_publications`
  write-leader check. Routing these through `resolveControlPlanePublicationsLeadership`
  would conflate distinct raft groups. The publications write-leader resolution is
  ALREADY consolidated in `resolveControlPlanePublicationsLeadership` /
  `isControlPlanePublicationsWriteLeader`; there are no genuine stragglers. B is
  done by construction.
- **The transport-alive trim-grace asymmetry (active-node-projection.js:303-304) is
  ALREADY FIXED** by CL-001 variant C (commit 3d7dc3cf, retention-only grace),
  gate-validated 085708Z. Nothing to do here.
- **Remaining WS6 = down-payment A (single active-set read accessor + caller
  migration) and step 3 (the designed `Membership_Lifecycle_Controller` single-writer
  cutover).** Both are large, touch leadership/active-set resolution that the LIVE
  CL-039 work is actively editing, and step 3 is gated on (i) WS4+WS5 gate-validation
  producing a stable convergence baseline and (ii) completing the partial
  `membership-lifecycle-controller.js` (295 lines). Per the project's record-before-
  code discipline these are NOT landed speculatively; they proceed as the spec's
  Task-27/28 cutover when the convergence frontier reaches them. No code shipped for
  WS6 in this pass — the safe pieces were already done, and the rest is correctly
  gated.

---

## WS7 — Lock in de-ordinalization with a prevention gate

**Recommendation #8.** CORRECTED: the migration is essentially DONE — the ordinal
inventory (`_legacy_work/inventory/ordinal-segments.md`) reports `Ordinal files: 0`.
Remaining work is prevention, not migration.

### Concrete steps
1. Locate the enforcing check (a `scripts/check-*.js` or test under `test/scripts/`,
   or an eslint rule) that asserts no new `*-segment-N` / `*-stage-N` / `*-part-N`
   files. If it exists, confirm it fails CI on a new ordinal file. If it does not,
   add a small `scripts/check-no-ordinal-files.js` + `test/scripts` wrapper that
   greps `src/` for the ordinal naming pattern and exits non-zero.
2. Make the file-size policy (whatever currently motivates splitting) **require a
   semantic module name on split** — reject the ordinal suffix in the same check —
   so the debt cannot regenerate.

### Guard / verification
- Add a fixture test: a temp file named `foo-segment-2.js` under a scanned path
  makes the check fail.

### Effort / risk
Small. Risk: low; tooling only.

---

## Sequencing summary

| Order | WS | Why first | Size | Risk |
|------|-----|-----------|------|------|
| 1 | WS1 incarnation logs | unblocks live frontier today | S | low |
| 2 | WS2 rung + analyzers | stops gate-time bleed; needed to measure WS4–6 | M | low |
| 3 | WS3 record restructure | LLM can load state in one read | M | low |
| 4 | WS7 ordinal gate | quick lock-in | S | low |
| 5 | WS5 idempotent close | removes a bug family; measurable via WS2 | M | med |
| 6 | WS4 bound readiness build | removes freeze cliff | L | high |
| 7 | WS6 single-writer + accessors | dissolves disagreement class | XL | high |

WS6 step 3 (cutover) is gated on WS4+WS5 producing a stable convergence baseline
AND on completing the partial `membership-lifecycle-controller.js` (295 lines).

## [V] Cross-cutting cautions the verifier flagged as missing
- **Debug-logs observer effect.** `node.ndjson` exists only under
  `LAGRANGE_DEBUG_LOGS`, the mode that floods the leader's stdout (~10k lines/sec)
  and perturbs convergence (`[[debug-logs-observer-effect-on-seed]]`). WS1/WS2 must
  work off the default-mode gzipped `.log.gz`; do NOT enable debug-logs to obtain
  `node.ndjson` for measurement — the measurement would not reflect default behavior.
- **Stale-container / single-run traps.** All WS4/WS5 re-gates: force-fresh
  containers + confirm `SRC_FINGERPRINT`, and never conclude from one run (use the
  stat-gate). Encoded into WS4's guard; applies equally to WS5.
- **Kill switches.** WS4 and WS5 both land behind flags (WS5 addition).

## Open questions (post-verification)
1. WS1: segment gz files per incarnation (`<nodeId>.inc<N>.log.gz`) vs single file
   with inline `inc:` field. (Backward-compat vs simplicity — verifier left open.)
2. WS3: new CL IDs vs `CL-001A/B/C` suffixes — no enforcing ledger validator script
   was found, so either convention is tolerated; pick for index readability.
3. WS4: revised Option A (bound + serve-stale) vs Option B (worker thread) — start
   with A, escalate to B only if a bounded-stale sync path still freezes > election
   timeout. (Original "decouple the timer" retired as infeasible.)
4. RESOLVED: `membership-lifecycle-controller.js` exists (295 lines, partial) and the
   B4 tripwire (`assertSingleMembershipPartition`, reconcile `:620-645`) exists.
5. RESOLVED: file:line references verified against the current tree; the readiness
   service files use SEMANTIC suffixes (`-node-methods`, `-shared`), not numbered
   ordinals, and the cited lines hold.
