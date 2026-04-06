# Integration Test Local Procedures

## Document Role

This document holds integration-specific local procedures that do not belong in
repo-wide steering policy.

Use this file for:

- integration-only local execution notes
- convergence-SLO procedure for node-join work

## Node Join Convergence SLO Procedure

Cluster-join work should update the node-join convergence SLO integration test
when the change affects rebalancing, learner promotion, leader election, or the
join flow.

Required assertions:

1. The cluster settles inside the configured window.
2. Leadership churn stays below the expected cap for the scenario.
3. Over-target voter counts return to the target within the expected bound.
4. The final topology ends without over-target voter counts.

Default measurement values for the current suite:

- `targetVoterCount = 3`
- `settleTimeoutMs = 20000`
- `quietWindowMs = 5000`
- `maxSustainedOverTargetMs = 2000`
- `sampleIntervalMs = 250`
- `maxLeaderChanges = partitionCount * 4`

Targeted execution:

```bash
npm test -- test/integration/node-join-convergence-slo.integration.test.js
```
