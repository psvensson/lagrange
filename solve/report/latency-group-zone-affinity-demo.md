# Solve report: latency-group-zone-affinity-demo

**Goal:** A live multi-latency-domain demo proves BOTH motives of latency groups without conflating them: on a cluster of two operator-pinned zones (latency.pinnedGroupId — the k8s zone-label analog), (a) PLACEMENT: data loaded while only zone-a exists stays zone-a-local, a deployed read_locality=same_group service converges its replicas into zone-a via the group-granular DATA_AFFINITY term (the coarse cross-domain coordinate that node weights cannot express), and its reads are routed same-group (locality routing observable); (b) CDC EFFICIENCY (the groups' original motive): cross-zone CDC propagation is observably representative-mediated — per-update cross-zone message count stays O(1) in group size rather than O(nodes) — measured from transport/CDC counters on a live run. Both observables are asserted by a re-runnable scenario script that emits a scenario-harness report, and the demo documents the zone-pinning operator surface. Builds on (does not modify) the single-zone node-affinity demo; the group-granular weights and zone pinning shipped by the epic are exercised, not reimplemented.

**Class:** product · **Closure:** MEASURED

**Outcome:** EXHAUSTED — 1 frontier(s) parked; human decision needed

**Attempts:** 0

## Links
- parent quest: movielens-affinity-placement-demo

## Scope Pressure
- Changed files: 0
- Change bytes: 0
- Owner areas: none
- Categories: none
- Signals: none

## Frontiers
- **latency-group-zone-affinity-demo-main** [parked {exhausted}] rung 0, attempts 0, metric ? -> ? — The sealed multi-zone placement-plus-CDC result has been superseded by the user-approved single-zone service/data-affinity direction. Its CDC question may be re-authored later as an independent topology Quest, but there is no honest remaining move for it within service data-affinity completion.

## Findings
_(none recorded)_

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
