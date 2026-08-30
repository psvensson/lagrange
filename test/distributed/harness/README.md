# Distributed Harness Owner Card

Start here before opening large `cluster-segment-*` files.

## Active-Gate, Publication, and Recovery Evidence

- Active-gate evidence lives in scenario reports under
  `publicationConvergence.activeGate` and names readiness state, selected
  snapshot coverage, publication status, pending ACKs, and closure witness class.
- Publication evidence is summarized by `publicationConvergence` fields such as
  `publicationStatus`, `pendingAckCount`, `missingPublishedCount`, and
  `publishedActiveNodeIds`.
- Recovery evidence is summarized by `priorityRecoveryProgressSummary`,
  `priorityRecoveryReasonCodes`, and topology/causal analyzer output.

## LLM Starting Points

0. For the CROSS-CORPUS picture first — which blockers are masked behind the current
   dominant reason, the peel-order, and emerging candidates — run
   `npm run analyze:latent-blockers` (mines every `test-output/reports/*.report.json`).
   A single gate/report shows only one dominant reason; this shows the masked
   distribution. Steps 1-6 below then diagnose a single artifact.
1. Run `npm run analyze:distributed-failure -- --report <report-or-failure-bundle.json>`.
2. Run `npm run analyze:topology-convergence -- <artifact>` and, when needed,
   `npm run analyze:topology-convergence -- <artifact> --explain <edge>`.
3. Run `npm --silent run analyze:causal-model -- <artifact>` for stop-condition
   and critical-path evidence.
4. For priority-recovery residual splits, run
   `npm run analyze:priority-recovery-residuals -- <artifact>` before writing
   package metadata or ad hoc extraction commands.
5. Use `npm run analyze:owner-files -- <owner> [boundary]` to find likely owner
   files before broad source searches.
6. For a five-node GCP formation-release run, run
   `npm run analyze:formation-release-phases -- <report-dir>` (one
   `test-output/reports/formation-release-handoff-closure/<timestamp>/`
   directory) to see, per joiner, W -> handoff observed -> barrier release ->
   READY with deltas and the analyzer-classified outcome, instead of
   reconstructing the phases from probe reports by hand.
7. Read focused owner/helper files named by those summaries before opening large
   harness segment files.

Do not infer owner boundaries from raw logs when compact report, topology, or
causal evidence is available.

## Running the gate — smallest N first

The docker stat gate (`bash scripts/rolling-restart-stat-gate.sh <N>`) is expensive
(~5–10 min/run). **Start with the lowest N that could answer the question and
escalate only when a small run is inconclusive** — the burden is on justifying a
LARGER N, never a smaller one (full rationale in
[`docs/steering/operational-ground-truth.md`](../../../docs/steering/operational-ground-truth.md)).

- **Default N=3.** It is also the `rolling-restart-core-stability` doneWhen streak
  (3 consecutive scenario-PASS), so a clean 3/3 satisfies closure — confirm with
  `node scripts/solve.js probe --id rolling-restart-core-stability --probe scenario-harness --scenario rolling-restart --consecutive 3 --metric priority`.
  A hard breach / corruption is conclusive even sooner; stop early.
- **Escalate to N≥8 only** for a borderline pass rate you need to separate from
  variance, or a convergence-*rate* promotion verdict where the statistic is the
  claim. Do not default to N=8/N=10 every iteration.
- Before queuing any gate, run `npm run analyze:latent-blockers` (step 0) — don't
  spend a gate to learn a layer the corpus already reveals.
