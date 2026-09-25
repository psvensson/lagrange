# F1 A2 gate: SLO red classified (2026-09-25)

The A2 gate ran on 13d845c07 (production 895034825). It stopped at the first red: `node-join-convergence-slo` run 2. Run 1 was green.

- **Assertion:** "over-target voter duration should stay bounded (3060ms <= 2000ms)".
- **Handoff failures:** zero "Replica leader handoff failed" lines. F1's step-down works.
- **Evidence** (the assertion's own evidence record, partition `replica_operations-p1`):
  - First sample: the REPLACE is `active/ACTIVE` (source 0201, target 0202), and its source is still a voter.
  - Last sample: a separate planner `REMOVE pending/SENDING`, created 2657 ms after the first sample. Its source node is 0202, the joiner that F1 made the ledger leader.
- **Classification:** the known mechanism in `finding-slo-residual-remove-safety.md` (c7f512480), path 2.
  1. The drain closed the REPLACE at ACTIVE with its source still a voter.
  2. The surplus was then removed by the planner on the new leader, throttled by `checkRebalance`'s 1 s cadence.
  - This is not a new mechanism, not an F1 property violation, and not a regression of seed parity.
- **Consequence under the owner's decision:** the decision was publish-then-fix, conditional on the A2 gate's 10 SLO runs staying green. That condition failed, and the publish gate would meet the same red. So the REPLACE single-source-removal owner repair (R-1 and R-2 in the finding, plus B5 from the synthesis) must land before the publish.
