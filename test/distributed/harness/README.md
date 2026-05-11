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

1. Run `npm run work:evidence-summary -- <report-or-failure-bundle.json>`.
2. Run `npm run analyze:topology-convergence -- <artifact>` and, when needed,
   `npm run analyze:topology-convergence -- <artifact> --explain <edge>`.
3. Run `npm --silent run analyze:causal-model -- <artifact>` for stop-condition
   and critical-path evidence.
4. Read focused owner/helper files named by those summaries before opening large
   harness segment files.

Do not infer owner boundaries from raw logs when compact report, topology, or
causal evidence is available.
