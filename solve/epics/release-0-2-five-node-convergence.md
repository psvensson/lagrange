---
id: release-0-2-five-node-convergence
status: open
proof: certification
roadmapRow: RM-0.2-five-node-convergence
graduatesTo: null
quests:
  - managed-split-cutover-handoff-closure
authorizes:
  - src/control-plane
  - src/rebalancer
  - test/distributed
  - scripts/checks
doneWhen:
  probe: scenario-harness
  args:
    scenario: release-0-2-five-node-convergence
    consecutive: 3
    metric: priority
---

# Release 0.2 five-node convergence

Five nodes form, rebalance and survive churn within the release budget on the representative harness.

Derived by the solve-v2 migration from the quests listed above (amendment 7).
The operator seals `doneWhen` and `authorizes` before new quests start here;
until then the epic is `legacy: true` and its scope is unenforced.

## Sealed acceptance (2026-09-07)

The two undefined terms in the sentence above looked like they needed an
operator to invent them. They did not. Two dated decisions appeared to
contradict each other, and the contradiction resolves by scope and
supersession without anyone choosing a number.

**"The release budget" is not a time budget.** One figure carries authority:
sixty seconds from cluster start to five nodes ACTIVE, an operator decision of
2026-08-16 preserved through `formation-grace-parallel-start-hardening` and
`formation-release-handoff-closure-v4`, superseding an earlier ninety. But
`RELEASE.md`, decided 2026-09-05 and therefore later, is specifically about
release gating and says five-node formation timing is "a measured number ...
never a gate", precisely because the release had been coupled to a live result
the shipped bytes had not met. This epic is a release epic. The later, narrower
authority governs what gates a release, so the sixty-second window is a
measured signal here and not this epic's bar. Nothing is reversed: it remains
the certification window for the quests that own it.

What remains once timing is excluded is stated identically by two independent
authorities that do not contradict each other or `RELEASE.md`. The Phase 0.2
exit criteria in `docs/development/agpl-feature-map.md`: "The representative
cold five-node workload completes three consecutive runs without a formation,
table-readiness, or initial-service-placement stall." And the solved v1 quest
of this epic's own name: "For one frozen release-content digest, three
consecutive fresh-container five-node runs complete cold formation, user-table
creation and readiness, and initial runtime-service placement without a
formation, table, placement, or safety stall."

`doneWhen` is that, and takes its scenario name and shape from that quest's own
sealed probe rather than restating it.

**"The representative harness" is a missing artifact, not a missing
contract.** The scenario `release-0-2-five-node-convergence` does not exist in
`test/distributed/scenarios/` and is not registered, so the probe reports no
report for the scenario and will until it is built. That is the honest state:
the acceptance is known and the thing that would measure it has not been
written. It is the same position `service-portability-ladder` is in, and it is
recorded rather than papered over by pointing the probe at whichever of the
five candidate five-node configurations happened to be nearest.

**What this does not demonstrate.** No timing claim whatever - not the sixty
second window, not any convergence duration. And not the claim of its one
quest, `managed-split-cutover-handoff-closure`, which is narrower and harder:
fenced handoff ownership under concurrent writes, proved by a GCP A/B of at
least two fixed and two exact-revert runs. A five-node stall-free streak does
not demonstrate that, and that quest is separately held by a standing verifier
rejection until its prerequisite formation quest lands.
