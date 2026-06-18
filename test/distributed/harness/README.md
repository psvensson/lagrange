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
6. Read focused owner/helper files named by those summaries before opening large
   harness segment files.

Do not infer owner boundaries from raw logs when compact report, topology, or
causal evidence is available.
