# Live / simulator correspondence

Authority for any new simulator composition work. Measured on the sealed
strict substrate (`22420f874`), seed 7, against the frozen live calibration
`formation-seed-2026-09-13.json` (`8a6275a4d`, 152.1 s window, 3.50 %
unattributed).

Nothing here proposes a repair. It records the first missing causal arrows.

## Reproduction predicates

| # | predicate | status |
| --- | --- | --- |
| 1 | seed watchdog gap fraction >= 50 %, every joiner < 5 % | UNMET |
| 2 | incomplete-lease observations name all five nodes with escalating backoff | UNMET |
| 3 | prioritySpreadGap non-decreasing with zero operations in flight | **met** |
| 4 | admission ends in `control_plane_pressure` | UNMET |
| — | two runs of one seed hash identical | **met** |
| — | one run completes in under 60 s | **met** |

## Frontier 1 discriminator — seed CPU

The watchdog contract is unchanged: 250 ms interval, 1000 ms threshold,
`expectedAt` measured from the previous **actual** callback.

Across 79 seed watchdog callbacks in one run:

```
max callback lateness            99 ms
callbacks later than 1000 ms      0
seed busy fraction              5.3 %   (1066 charged ms / 20 026 ms window)
reported seed gap                 0 ms
```

**Classification C1.** The seed's backlog never approaches the gap threshold,
so zero observed gaps is the *correct* answer for the workload the simulator
currently generates. The watchdog is not at fault and must not be touched.
The defect is owner rate and owner coverage.

## Owner-rate audit — seed, per second of window

| owner | live seg/s | sim seg/s | sim / live | first sim activity |
| --- | ---: | ---: | ---: | --- |
| raft_protocol | 22 559.8 | 319.5 | **0.014** | 0.2 s |
| membership_publication | 2 726.8 | 0.9 | **0.0003** | 10.0 s |
| rebalancer | 2 236.9 | 389.3 | **0.174** | 5.1 s |
| readiness | 2.2 | 2.8 | 1.29 | 0.0 s |
| bootstrap | 1 439.2 | 0.0 | 0 | never |
| transport | 869.5 | 0.0 | 0 | never |
| admin | 299.2 | 0.0 | 0 | never |
| raft_apply | 162.3 | 0.0 | 0 | never |
| worker_dispatch | 0.0 | 0.0 | — | never (observed-inactive live too) |

Seed segments per virtual 5 s bucket:

```
owner                     0-5s     5-10s    10-15s    15-20s    20-25s
membership_publication       0         0         6         3        10
raft_protocol              132       645      2067      2169      1386
readiness                   12        15        12        14         3
rebalancer                   0      1616      1553      3081      1547
```

### Which reality this is

Of the three candidate explanations, the audit selects **C**: the currently
hosted dominant owners run at the wrong production rate.

It is *not* primarily the absent 14.9 %. Even granting that bootstrap,
raft_apply, admin and transport never run, the three hosted dominant owners -
73.2 % of the live window - are short by 70x, 3000x and 5.7x respectively.
Readiness is the only owner running at its live rate, and it is the one whose
live rate is lowest (2.17 seg/s).

So the first missing arrows are inside the hosted owners' triggers, not only
in the unhosted owners. The two are not independent: bootstrap and raft_apply
are plausible drivers of raft_protocol and membership_publication work
(candidate B), and that remains to be tested. What the audit rules out is
candidate A - that hosting the missing 14.9 % of cost would by itself
saturate the seed.

### Live phase shape, for comparison

The live window shows bootstrap and raft_protocol dominating the first ~23 s,
with raft_protocol, rebalancer and membership_publication growing together
from ~35 s. The simulator's window is 20 s against the live 152 s, so onset
comparisons are only meaningful in the first bucket: raft_protocol starts
promptly (0.2 s) but two orders of magnitude too slowly, rebalancer starts at
5.1 s, and membership_publication barely starts at all (10.0 s, 19 segments
total).

## Open questions, in the order they must be answered

1. Which production protocol trigger is absent, such that six Raft groups on
   five nodes produce 319 seg/s instead of 22 560? Normalise by groups x peers
   x protocol timer and message opportunities, not by a coefficient.
2. Which membership/publication generation and advance wake is absent, such
   that the owner produces 19 segments in a whole window?
3. Which reconcile wakes and reasons does the live rebalancer receive that the
   simulator's do not?
4. Do bootstrap and raft_apply, once hosted, drive (1) and (2) - candidate B -
   or are their triggers independent?

## Not yet traced

Frontier 3 (readiness first-divergence) and Frontier 4 (admission
first-divergence) have not been instrumented. Predicate 2 and predicate 4 are
downstream of seed saturation, and the audit above says seed saturation is not
close, so tracing them first would measure a consequence rather than a cause.

## Q1a — runtime Raft population census

Measured, not derived from rows: the count is of objects that can execute Raft
protocol callbacks.

```
distinct directed peer edges observed   120
edge multiplicity per node pair           6      (one per hosted group)
node addresses in edges                   node-0..node-4
```

So the simulator hosts **6 groups x 5 instances = 30 Raft objects**, one per
node per group, fully meshed within each group.

### Who owns each decision

`test/simulation/formation-sim-raft-cohort.js` constructs `new LifeRaft(...)`
directly. It is not the production `PartitionService` replica lifecycle.

| decision | owner in the simulator |
| --- | --- |
| why this group exists | harness: one per entry of `PRIORITY_CONTROL_PLANE_TABLE_IDS` |
| which production partition it corresponds to | none: these are TABLE ids, not partition ids |
| replica identities | harness: exactly one per node per group |
| execution node of each replica | harness: the node whose id it carries |
| who starts the election | harness: `rafts.get(seedId).promote()` |
| who adds peers on membership change | harness: `admit()` links both ways |

Under the design's own rule - the harness may adapt transport and storage but
may not reproduce production owner decisions - topology and replica population
are owner decisions, and all six are currently the harness's.

### Like-for-like denominators

Live denominator from the established cold-formation contract: 45 critical
partitions (`CRITICAL_SYSTEM_PARTITION_IDS`, verified as 45 in this tree), RF
3, 135 replica identities, initially concentrated on the seed. The frozen
calibration report carries owner costs and a formation verdict but **no
population census**, so any additional live Raft groups contributing to the
`raft_protocol` bucket are unenumerated; that is a gap in the frozen evidence,
not a claim that none existed.

| denominator | live | sim | sim / live |
| --- | ---: | ---: | ---: |
| raft instances | 135 | 30 | 0.222 |
| directed peer edges | 270 | 120 | 0.444 |
| leader peer edges | 90 | 24 | 0.267 |

| normalised rate | live | sim | sim / live |
| --- | ---: | ---: | ---: |
| seg/s per raft instance | 167.11 | 10.65 | **0.064** |
| seg/s per directed peer edge | 83.55 | 2.66 | **0.032** |
| seg/s per leader peer edge | 250.66 | 13.31 | **0.053** |
| raw seg/s | 22 559.8 | 319.5 | 0.014 |

Population explains roughly a 4x of the raw 70x. A 15-20x opportunity-
normalised deficit remains, but it is **not yet evidence of a missing protocol
trigger**, because the population it is normalised against is itself wrong.

### Classification: P0 and P1 together

**P0** - the required population is not hosted. Live declares 45 partitions
and 135 replicas; the simulator hosts 6 groups and 30 instances. The groups
are table ids rather than partition ids, so there is no partition-level
correspondence to repair - the mapping does not exist.

**P1** - placement is structurally inverted. Live cold formation concentrates
135 replicas on the seed; the simulator places exactly one replica per node
per group, so the seed holds 6 of 30 instances (20 %) and the joiners hold the
rest. **The simulator has removed the seed concentration that caused the live
problem**, by construction.

Q1b is therefore not started. Per the stated rule, the first missing arrow is
not a LifeRaft callback: it is

```
cold bootstrap declaration
  -> production replica/runtime construction
  -> actual Raft instance on the owning node
```

### Why this also predicts the other owner deficits

This supports - and does not yet prove - the single-omission hypothesis. The
harness creates a small raw Raft cohort instead of letting cold bootstrap
create the replica population, and the owners that are exactly zero are the
ones that would have been driven by that construction: `bootstrap` (replica
initialisation), `raft_apply` (committed-entry application), `transport`
(delivery of those replicas' traffic). The same omission plausibly starves
`membership_publication` and `rebalancer`, which react to the cache and
membership churn 135 replicas would produce. That is one composition
omission rather than six independent missing-trigger bugs, and it is the next
thing to test.

## Oracle lifecycle (A0)

The metered oracle captured at `22420f874` is marked
`purpose: substrate_regression_only`, `formationCorrespondence: false`, and
names the composition it measured: `legacySyntheticFormationComposition` -
six cohorts keyed from table ids, one LifeRaft per node per group.

It is **valid for the sealed legacy substrate composition** and **not
authoritative for production-composed formation**. It was not invalidated and
its hashes are not updated: 391 metered entries, 10,120 events, 277,623
attribution segments continue to protect the scheduler, attribution, clock
closure, current-instant closure, generation isolation and host-speed
independence against regression.

During the composition slices the production-composed positive scenario has
**no metered oracle**. Its temporary gates are strict zero ambient seams,
deterministic proof eligibility, same-process and fresh-process exact
repeatability, host-block independence, and the generation and post-seal
invariants. A new oracle is captured only after the seed handoff is complete
and the correspondence census is stable, and it supersedes the old one **for
positive formation only**.
