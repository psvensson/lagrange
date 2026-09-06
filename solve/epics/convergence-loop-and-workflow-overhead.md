---
id: convergence-loop-and-workflow-overhead
status: open
proof: deterministic
legacy: true
roadmapRow: null
graduatesTo: quests
quests:
  - effective-placement-serial-priority-planner
  - harness-runtime-environment-allowlist-v2
  - harness-runtime-environment-allowlist-v3
  - harness-runtime-environment-allowlist
  - priority-surplus-remove-authoritative-placement-fence
  - solver-operator-safety-facade
  - solver-workflow-candidate-verification-cutover
  - solver-workflow-epic-routing-cutover
  - solver-workflow-projection-retention-cutover
authorizes: []
legacyStatus: active
---

# Epic: convergence-loop-and-workflow-overhead

## Intent

The 2026-07-13..19 review of the formation-complexity-consolidation week found the
discipline (sealed doneWhen, adversarial verification, clean-HEAD control runs,
epic findings ledger) working and worth keeping, and four loop-level problems
around it:

1. The live MovieLens gate drives a moving-blocker chain (fence → spread-cure →
   minting-gap → leader-address-routing → executor-cache-handoff) with no
   declared point at which instance-fixing stops and the structural options
   (O3/O4 in formation-complexity-consolidation) land. Recurrence of the F4
   hand-re-enumeration class shows the bug family is structural.
2. Discovery of each new blocker is paced by a 10–20 minute, nondeterministic
   live run on a heat-limited machine; the confirmation gate ("2 consecutive
   green") bounds nothing statistically for a racy scenario.
3. Workflow bookkeeping costs are visible: solve/changes/ holds ~190 MB, of
   which ~169 MB is two quests' uncompressed live-run evidence bundles (a
   115 MB + 22 MB `playback/snapshots.ndjson` pair under
   `managed-partition-merge-live-validation/`, ~15 MB of node logs under
   `formation-ledger-self-move-blocks-cluster-ops/`) and only ~17 MB is raw
   attempt diffs (149 files ≥ 32 KiB predating content-addressing, ~11 MB).
   39% of the week's commits were checkpoints whose subject line is the full
   sealed statement, making `git log --oneline` unreadable.
4. The complexity ratchet was re-anchored upward (cognitive 144 → 184 → 183)
   with rationale only in a commit message and code comment; no steering rule
   governs baseline movement. The 800-line limit is producing mechanical
   `*-methods.js` splits (141 in src/) rather than owner-boundary structure.

Every work item below extends an existing mechanism; none introduces a new
subsystem, flag surface, or per-call option (policy over request class holds).

## Constraints (standing)

- No per-call configuration flags; one stable behavior per request class.
- Sealed quests are immutable; nothing here edits an existing quest's doneWhen.
- Live runs: check `sensors` before starting; ~10–20 min each.
- Solver machinery changes are process-class quests with subagent verification
  before checkpoint (same pattern as solver-workflow-draft-receipt-signal-quality).

---

## Work item 1 — declared stopping rule for the live residual chase

Problem: the fence-live confirmation gate is 0/2 green; each residual spawns a
child quest via `links.parentQuest`; nothing bounds the chain. O3
(EffectivePlacement / serial goal-state planner) and O4 (ledger episode state
machine) stay deferred because their deletion targets are load-bearing for the
active chain — a potential deadlock.

**1a (zero-code, do first).** Add a dated decision-log entry and a "Stopping
rule" block to the Handoff section of
`solve/epics/formation-complexity-consolidation.md`:

> If `executor-active-services-cache-handoff` plus at most one further
> AUTHORED child quest (not one more attempt) do not produce a green
> confirmation gate (5-of-5 formation-probe + 3-of-3 full-demo repetitions,
> per work item 2b) on the unchanged MovieLens scenario, stop authoring
> residual instance quests. Author the O3 quest (goal-state planner behind
> current behavior) as the next product quest, scoped so the live chain's
> load-bearing classifiers/valves are ported, not deleted, until O3's own
> live gate passes. Not re-litigable per residual; every residual found
> during the budget is recorded as an O3 design input.

APPLIED 2026-07-19: the binding block and a dated decision-log entry are in
`solve/epics/formation-complexity-consolidation.md`.

Epics are plain markdown parsed by `scripts/solve/overview.js`; no machinery
change is needed for the rule to bind future agents — the Handoff section is
already the mandated entry point for fresh agents on this epic.

**1b (process quest, small).** Add a chain-depth signal to the existing
convergence-guard read models so the Solver itself surfaces the condition:

- Detector: new pure function in `scripts/solve/convergence-guards.js`
  (alongside `detectCoupledOscillation` etc.) that walks `links.parentQuest`
  from an open quest through `solve/quests/*.json` and returns the chain
  depth counting BOTH open and SOLVED links that share the same live-gate
  artifact class within a rolling window (owner decision 2026-07-19:
  SOLVED-inclusive, because the observed whack-a-mole chain closes each
  quest as it spawns the next — an open-only count would never have fired;
  window 14 days; artifact-class key = the doneWhen/metric probe's report
  family, robust to statement wording). Budget idiom copied from
  `shouldSpawnRestoration()` in `scripts/solve/invariant-liveness.js` (the
  existing "after N spawns, stop escalating" pattern,
  `OSCILLATION_REOPEN_BUDGET`).
- Policy: constant `QUEST_CHAIN_DEPTH_BUDGET` (proposed: 4) in
  `scripts/solve/constants.js`; call-site policy behind a new entry in the
  frozen `CONVERGENCE_GUARDS` map, advisory-then-terminal like rr-C..rr-G.
- Effect when tripped: force an altitude reflection (extend the `triggers`
  consumed by `altitudeReflectionDue()` in `scripts/solve/reflection.js`; the
  altitude prompt already names "EXHAUST and pivot to a higher-altitude
  Quest/epic" as a legitimate outcome — reuse it, no new prompt surface).
- Non-goal: the guard never auto-parks a quest; it forces the reflection turn
  and records the signal. Parking stays a ladder decision.

APPLIED 2026-07-19 (rr-H): `questChainArtifactKey` + `questChainDepthStatus`
in `convergence-guards.js` (pure; artifact class = doneWhen probe +
scenario); `QUEST_CHAIN_DEPTH_BUDGET = 4`, `QUEST_CHAIN_WINDOW_DAYS = 14`,
and a `chainDepth` entry in the frozen `CONVERGENCE_GUARDS` map in
`constants.js`; impure ancestry walk (`questChainRows`, cycle-safe,
walk-capped, missing-log tolerant) + `quest-chain-depth` signal in
`health.js`; `triggers.chain -> 'chain-depth'` in `altitudeReflectionDue`
with a dedicated prompt reason in `reflection.js`; trigger wired from health
signals in `loop.js`. Tests: pure cases in
`test/solve/convergence-guards.test.js`, trigger precedence in
`reflection.test.js`, wiring in `health.test.js`. The full `test/solve`
suite is green.

Verified semantics on the live chain (adversarial subagent, 2026-07-19): the
current chain's shared-scenario depth is 3 — `formation-joining-ready-phase-
fence` has a different doneWhen scenario AND is exhausted, so it breaks the
chain — meaning the guard does NOT fire today. That is the intended
calibration, not a miss: budget 4 makes the reflection land exactly when the
stopping rule's "one more authored child quest" is spent (the next
same-scenario child of `executor-active-services-cache-handoff` produces
depth 4). The guard was verified to fire on synthetic same-scenario chains
of depth 4, 5, and 12 (the walk cap).

## Work item 2 — cheaper, better-bounded discovery than the full live run

Grounding from `docs/deterministic-directed-testing-plan.md`: the DT substrate
(VirtualTimeSource, SeededRandomSource, PctScheduler, virtual network + raft
host) exists and already hosts deterministic reproductions of past MovieLens
failures (`test/convergence/dt6-formation-ledger-quorum-spread-first.test.js`,
`dt6-rebalancer-formation-self-move-interlock.test.js`, placement-affinity
kernel sims) with a seed-sweep harness
(`test/distributed/harness/pct-search.js`, `exploreWithPct`). The plan doc
explicitly warns against scoping DT work around reproducing a live scenario's
pass/fail *rate* (virtualization deletes CPU-latency-tail races), and full
in-process hosting of the live demo is the deferred north star (only ~15 of
~330 `Date.now()`-using src files thread a TimeSource). So: do not attempt
"MovieLens deterministic in-process" now. Instead:

**2a — RESOLVED AS ALREADY COVERED (2026-07-19 implementation pass).** The
deterministic-first bullet in `test/distributed/operational-ground-truth.md`
already requires exactly this: the primary evidence for every convergence fix
is a deterministic in-process reproduction, red-on-revert, "built BEFORE
changing code and kept as the validating proof afterward", with live
statistical runs gated behind `gate:preflight` and never the iteration loop.
Per the memory-boundary single-canonical-home rule, no duplicate sentence was
added. The actionable residue is behavioral (apply the existing rule to the
live chain — work item 2c's dt6 scenarios), not normative.

**2b (new small script, extends existing artifacts).** An N-repetition live
runner: `scripts/run-live-repetitions.js <probe|demo>` (positional run class
only — the repetition policy is fixed per class, no per-call behavior flags)
wrapping the existing `examples/service-data-affinity/run-formation-probe.js`
(cheap bring-up: formation → CREATE TABLE → partition readiness) and
`run-affinity-demo.js` (full gate). Policy (owner decision 2026-07-19,
stricter option): `probe` runs 5 repetitions, `demo` runs 3; the gate is ALL
repetitions green; a confirmation session runs probes first so a probe
failure rejects before any 20-minute demo is spent. Behavior: check
`sensors` before each run (existing operational constraint) and classify a
thermally-invalidated run as non-measuring (excluded, rerun) rather than
red, consistent with the Solver's invalid-samples-never-count rule;
aggregate the produced `*.report.json` verdicts into one summary JSON in
`test-output/reports/`; exit nonzero unless the gate holds. Reuse
`scripts/analyze-topology-convergence.js` on failures — it already consumes
these report artifacts.

**2c (targeted DT scenarios, existing substrate only).** Author dt6 scenarios
for the *current* residual classes while they are hot: SERVICES-cache lag
during executor terminal handoff, in-flight drain race, observer-blindness
window. Same harness composition as the existing dt6 formation scenarios;
seed-swept via `exploreWithPct`. These become the deterministic proof suites
for the open quests' findings (work item 2a applied to the live chain).

**2d (deferred, recorded as an option only).** Extending
`test/integration/helpers/cluster-test-helpers.js` (in-process multi-node,
real clock) to cover schema-admission → provisioning as a fast middle tier,
and the whole-system DST north star. Not quested now; the DT plan owns the
sequencing.

## Work item 3 — bookkeeping cost (process quests, small)

**3a — finish the storage story; the diff half is already shipped.**
Content-addressing for attempt diffs LANDED in quest
`solver-proof-artifact-content-addressing` (commit `80ae7cfa`):
`createAutoDiffChangeRef()` (`scripts/solve/step.js:123`, reached from the
live step path at `step.js:267`) already routes auto-diff attempt writes
through `writeContentAddressedChangeArtifact()`
(`content-addressed-change-artifact.js:303`) — raw inline below
`CONTENT_ADDRESS_THRESHOLD_BYTES` (32 KiB), gzipped content-addressed objects
under `solve/artifacts/sha256/` with a `.diff.json` descriptor above it.
Gzipping does not disturb exact-fingerprint verifier approvals: identity
hashes are computed over the decompressed payload
(`change-artifact.js:91-133`, `verification.js:85,106-137`). Do NOT re-quest
this. The residual work is:

- Run the existing migration tool (`scripts/solve/proof-artifact-migration.js`,
  with `proof-artifact-census.js` as inventory) over the 149 pre-`80ae7cfa`
  raw diffs ≥ 32 KiB (~11 MB). Mechanical; likely no quest needed.
- The real weight is live-run evidence bundles, not diffs: ~169 MB of
  uncompressed `playback/snapshots.ndjson`, `failure-bundle.json`, and node
  logs under two closed/blocked quests. Quest scope (process, small): a
  compression policy for evidence bundles — gzip playback snapshots and node
  logs at capture time (ndjson gzips extremely well; the 115 MB file is the
  single dominant object), and a one-time gzip pass over closed-quest
  bundles. Any solver probe that reads these must resolve `.gz` the way
  `readChangeArtifact` does; inventory the readers before sealing.
- Operator-supplied `changeRef` diffs still bypass the content-addressed
  writer (they reference pre-existing files). Leave as-is; record here so
  nobody mistakes it for a gap.

Note honestly: git history retains old blobs; all of this shrinks the working
tree and stops future growth — history rewrite is explicitly out of scope.

APPLIED 2026-07-19: `solve/changes/` reduced 190 MB → 35 MB. The dedicated
migration tool turned out to be a one-shot deliverable sealed to its original
quest's receipt (re-running it is refused by design), so the applied
mechanism is the reader's other supported shape: all 149 legacy raw diffs
≥ 32 KiB became historical `.diff.gz` siblings, and evidence files ≥ 1 MiB
(playback snapshots, failure bundles, node logs) were gzipped in place.
Resolution verified through `readChangeArtifact` for both shapes (payload
sha computed over decompressed bytes, so recorded fingerprints are
unchanged). Re-analyzing an archived gzipped bundle needs a gunzip first;
capture-time compression for future bundles remains the open quest slice.

**3b — checkpoint subject shortening.** `commitMessage()` in
`scripts/solve/handoff.js` (lines 196–204) currently puts the full quest
statement in the subject (`checkpoint(quest): <id>: <statement>`). Change to
subject `checkpoint(quest): <id>:` with the statement as the body's first
paragraph (before the co-author trailer). The checkpoint parser
(`latestCheckpointCommit`, `scripts/solve/verification.js:294-306`) matches by
prefix `checkpoint(quest): <id>:` via `startsWith` — the trailing colon is
preserved, so both old and new commits keep matching with zero parser change.
The only other parse site, `test/solve/loop.test.js:438-439`, uses the even
more lenient `startsWith('checkpoint(quest):')` and is likewise safe.

APPLIED 2026-07-19: `commitMessage()` now emits subject
`checkpoint(quest): <id>:` with the statement as the body's first paragraph;
format pinned by a new test in `test/solve/verification-handoff.test.js`.
Deliberate deviation from the draft: TERMINAL commit subjects keep the full
statement — they occur once per quest and their subject carries the sealed
result; the `--oneline` unreadability came from the high-frequency
checkpoint commits, which are now one short line.

**3c — watch, don't build.** Process:product open-ratio governance already
exists as a projection (`summarizePortfolio()` in
`scripts/solve/portfolio.js`). No gate is added; the ratio is reviewed at
altitude reflections (existing cadence). Recorded here so nobody builds a
second mechanism.

## Work item 4 — ratchet integrity and split quality

**4a — steering rule for baseline movement (no new mechanism).**
APPLIED 2026-07-19: added as the "Static Gate Baselines Are A One-Way
Ratchet" section of `test/guidelines/release-gate.md` (the
packed testing source owning static/release-gate policy — chosen over
`operational-ground-truth.md`, whose scope is distributed-work traps), then
packs regenerated via `npm run steering:llm:pack`. This turns the good
ad-hoc practice of commit 22596900 into a citable rule via the existing
`rules.json` generator — no hook changes required initially.

**4b (optional follow-up, only if 4a is violated once).** Extend
`.githooks/pre-commit` (which already runs `check-staged-constant-names.js`)
with a staged-diff check that flags an increased `BASELINE_COUNT` lacking a
same-commit epic decision-log change. Deliberately deferred: prefer rule +
review over hook proliferation.

**4c — RESOLVED AS ALREADY COVERED (2026-07-19 implementation pass).**
`docs/development/code-style.md` "Source File Size And Naming" already mandates
semantic-owner extraction before quest closure, names for responsibility not
split position, no ordinal/segment/grab-bag names, and explicit-context
modules over new `*-methods.js` mixin fragments (existing fragments are
"established debt, not license"). No duplicate rule added. The structural
remedy for the 141 existing `*-methods.js` files is not a mass rename — it
is O3/O4/O7 in formation-complexity-consolidation, sequenced by work item 1.

## Sequencing

1. 1a (epic edit) and 4a (steering rule) — same day, no code.
2. 2b (repetition runner) — before the next confirmation-run session, so the
   next gate statement is N-of-M.
3. 3a, 3b — one process quest each, next time the Solver machinery is touched.
4. 2a steering rule + 2c dt6 scenarios — alongside the open live-chain quests.
5. 1b (chain-depth guard) — after 1a has been exercised once manually.
6. 2d, 4b — recorded options, not quested.

## Decision log

### Owner calls resolved 2026-07-19

The former open questions were decided by the owner on 2026-07-19:

1. Stopping-rule budget: current quest + one more AUTHORED quest (not "stop
   now"), with two clauses — not re-litigable per residual, and residuals
   found during the budget are recorded as O3 design inputs.
2. Confirmation gate: the STRICTER shape — 5-of-5 formation-probe greens AND
   3-of-3 full-demo greens (probes first; thermal invalids are
   non-measuring, not red).
3. Evidence bundles: gzip in place now (including an immediate pass over the
   two existing heavy bundles); the content-addressed object store stays a
   recorded fallback if evidence weight recurs.
4. Chain-depth guard: windowed SOLVED-inclusive count (14-day window,
   report-family artifact key), since an open-only count would not have
   fired on the 2026-07-13..19 chain; false positives are cheap because the
   guard only forces a reflection turn.

### Owner call 2026-07-22 — workflow simplification accepted

The operator accepted the complete simplification program: optional bounded
epics with derived linked-work stage, progressive promotion from direct work to
a Quest, a `start`/`continue`/`land` façade over the existing Solver owner,
verification of landable candidates rather than abandoned attempts, checkpoints
only at real durability boundaries, and on-demand standard report projection.
Implementation is split into bounded Quests linked to this epic; the underlying
seal, probe, append-only log, exact content verification, final composition
review, audit, scope-safe commit, and no-push guarantees remain mandatory.
