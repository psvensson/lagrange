---
audience: development
---

# Sealing packets for the four derived epics

The solve-v2 migration derived four epics from the quests it found under them
and left each with no `doneWhen` and no `authorizes`, so nothing bounds a quest
started there. These are the packets the operator seals from. Nothing here is
instantiated: each packet proposes, and each ends with what the proposal would
*not* demonstrate, because that is where a claim gets narrowed by accident.

Baseline: `b8ee3a055`.

## 1. rolling-restart-certification

**Original purpose, as the epic states it.** "A rolling restart of every node
keeps the cluster serving and converges back to full replication."

**What its only quest actually claims.** Something different, and much more
specific: on the declared five-node reference hardware class, a clean
fixed-code window of at least fifteen runs keeps six safety counters at zero in
every run and reports a Wilson-95 scenario-pass lower bound at or above the
sealed 0.357, with failure-class distribution and p50/p95 convergence time,
through the canonical stat-gate verdict. The epic says nothing about a bar, a
run count, a hardware class or the stat gate. **That divergence is the first
thing to seal.**

**Proposed bounded scope.** `test/distributed`, `scripts/rolling-restart-stat-gate.sh`,
`scripts/rolling-restart-stat-gate-summary.js`, `scripts/calibrate-machine.js`,
`test/distributed/config/convergence-sealed-bars.json`, `scripts/checks`. Not
`src/`: this epic certifies behaviour, it does not change it.

**Proposed doneWhen.**

```
probe: script
args:
  command: node scripts/checks/rolling-restart-certification.js --metric
```

**Exact probe.** A new projector under `scripts/checks/` that reads the newest
stat-gate aggregate and prints the number of unmet certification conditions,
zero meaning certified. It asserts every field the quest's own
`canonical-verdict-projection` constraint enumerates: source commit and
fingerprint, clean-tree receipt, config digest, hardware class, node count,
workload and failure-schedule identity, run count, the six safety counters, the
Wilson interval against the sealed bar, failure-class distribution, p50/p95
convergence time, acknowledged-write visibility, and the contributing report
paths. This is the smallest generic capability that closes the gap: `sealed-bar`
is on the solver's non-measuring list, and the v2 scenario-harness probe
silently drops `minimumRuns`, `certification` and `sealedBarsFile`.

**What a pass demonstrates.** That one clean fixed-code window of at least
fifteen runs on `calibrated-local-container-v1` produced a canonical ABOVE_BAR
verdict with a Wilson-95 lower bound at or above 0.357, and that no run in that
window lost or failed to verify an acknowledged write, corrupted data, exited a
node unexpectedly, blinded the oracle, or executed stale source.

**Falsifiers.**
1. Hand-author an aggregate of fifteen passes whose runs carry two different
   source fingerprints. The projector must refuse the window as
   non-contributing, not average it.
2. Lower `wilsonLowerBoundBar` below 0.357 and re-run. The projector must
   refuse: the bar moves upward only, under the re-seal document.
3. An aggregate that meets the bar but has one run with
   `acknowledgedWriteUnverified` non-zero must fail on the safety floor, not
   pass on the statistics.

**What this does not demonstrate.** The epic's own sentence. A Wilson lower
bound of 0.357 is compatible with most runs in the window failing, so
"keeps the cluster serving" is not what is being certified; the bar is a
floor on a pass rate, deliberately set where the evidence was. It says nothing
about hardware classes other than the calibrated local container class, nothing
about node counts other than five, and nothing about restart schedules other
than the sealed sequential non-seed one. If the operator wants the epic's
liveness sentence proved, that is a second claim and needs its own quest.

## 2. deterministic-cloud-gate

**Original purpose.** "The GitHub-hosted blocking gate is repeatably green with
every failure class understood."

**Proposed bounded scope.** `scripts/checks`, `.github/workflows`,
`test/shards`, and the test files named by the two receipt frontiers. Not
`src/`.

**Proposed doneWhen.**

```
probe: script
args:
  command: node scripts/checks/hosted-gate-repeatability.js --metric
```

**Exact probe.** The check already exists and requires the same source SHA to
have passed the complete hosted `ci` workflow three times. No new capability is
needed for the repeatability half.

**What a pass demonstrates.** That one identical published head passed the whole
hosted blocking gate three times, so the gate's greenness is a property of the
tree rather than of a lucky run.

**Falsifiers.**
1. Three successes spread across three different SHAs must not satisfy it.
2. One success plus two cancelled or skipped runs must not satisfy it.
3. Three successes on a SHA that is not the head under test must not satisfy it.

**What this does not demonstrate.** "Every failure class understood." Counting
green runs cannot show that each historical failure has an owned cause and
regression coverage; the two receipt frontiers under this epic are what carry
that half, and they were never attempted. The operator should decide whether
the epic's `doneWhen` is the repeatability check alone or a conjunction with
those receipts.

**Two things to fix at sealing time.** The migration copied one receipt file
into all three sibling quest directories, so two quests whose own receipts all
pass are held red by a third quest's hosted entry; each needs its own receipt.
And this epic's evidence cannot exist before publication while landing requires
a terminal state, a circularity its own parent recorded. Sealing should say
which side gives.

## 3. service-portability-ladder

**Original purpose.** "Services run under the OCI container driver on a live
host; the spec lives in `solve/specs/service-portability-ladder/`." It is the
only one of the four that points at a real spec.

**Proposed bounded scope.** `src/runtime`, `architecture/oci-runtime-host-contract.md`,
`docs/service-portability-capabilities.json`, `test/`, `solve/specs/service-portability-ladder`.

**Proposed doneWhen.**

```
probe: scenario-harness
args:
  scenario: oci-container-driver-live-activation
  consecutive: 3
  reportDir: test-output/reports/oci-container-driver-live-activation
```

**Exact probe.** Note `consecutive: 3`. The parent quest carried it; the
migration's per-frontier metrics dropped it, so both surviving frontiers would
currently close on one run while their own `deterministic-first-live-terminal`
constraint demands three distinct measuring live passes. Restoring three is
returning the claim to what it was, not tightening it.

**What a pass demonstrates.** That a digest-pinned OCI installation traverses
shipped seed and join composition to an authenticated Docker host agent which
pulls, creates, starts, inspects, stops and removes the exact fully labelled
real container; that security, receipt, fence, identity and configuration
failures are typed fail-closed; and that no managed resource remains.

**Falsifiers.**
1. Revert production binding, authentication, digest comparison or label
   enforcement; the terminal runner must go red on each.
2. Substitute an injected monotonic counter for a provisioned TPM NV counter at
   `/dev/tpmrm0`; the run must fail closed rather than proving the live claim.
3. Leave one managed container behind; the run must fail on residual resources.

**What this does not demonstrate.** Nothing about runtimes other than OCI, and
nothing new about the three frontiers already landed — those are provenance,
not evidence. The capability flip of `realContainerActivation` to true and the
removal of the mutable feature gate must happen in the same terminal aggregate;
a pass that leaves the gate in place has not demonstrated the claim.

**Operator question inherited from the parent's triage.** Mint a narrower
successor covering only the two frontiers never attempted, citing the three
landed ones as provenance, or keep the five-frontier seal open until the OCI
lane is scheduled. The scenario named by both surviving frontiers does not
exist in the tree, so either answer requires building it.

## 4. release-0-2-five-node-convergence

**Original purpose.** "Five nodes form, rebalance and survive churn within the
release budget on the representative harness."

**This one cannot be sealed from what is written.** "The release budget" and
"the representative harness" are both undefined in the epic, and unlike the
rolling-restart bar there is no sealed-bars entry to read them from. The
configs in `test/distributed/config/` carry several different convergence
budgets, so picking one would be inventing the acceptance rather than recording
it. **This packet asks the operator for two numbers rather than proposing
them.**

**Proposed bounded scope.** `src/control-plane`, `src/rebalancer`,
`test/distributed`, `scripts/checks`.

**Proposed doneWhen, with the gaps marked.**

```
probe: scenario-harness
args:
  scenario: <the representative five-node scenario: which one?>
  consecutive: <how many consecutive passes?>
  metric: priority
```

**What the operator must supply.** Which scenario is "the representative
harness" for five nodes; what "the release budget" is, as a number with a unit,
and where it is recorded so the probe can read rather than restate it; and how
many consecutive passes close it.

**What a pass would demonstrate, once those are fixed.** That five nodes form,
rebalance and survive the scheduled churn inside the stated budget, that many
times consecutively.

**Falsifier to require.** Raising the budget must not turn a failing window into
a passing one without a recorded re-seal, exactly as the rolling-restart bar
moves upward only.

**What it would not demonstrate.** Its only quest, `managed-split-cutover-handoff-closure`,
claims something narrower and harder: fenced handoff ownership under concurrent
writes, proved by a GCP A/B of at least two fixed and two exact-revert runs. A
five-node convergence probe does not demonstrate that, and that quest is
additionally held by a standing verifier rejection until the prerequisite
formation quest lands.

## What all four have in common

None of the four epics currently bounds anything: `authorizes` is empty in
every one, so the landing guard treats a quest under them as unscoped. Sealing
a `doneWhen` without also sealing `authorizes` leaves half the gap open.
