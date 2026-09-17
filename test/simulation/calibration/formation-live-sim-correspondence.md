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

## Supersession: the 2026-09-13 owner-cost table (recorded 2026-09-16)

```
status:                     historical_live_calibration
quantitativeCorrespondence: superseded
reason:                     production formation-attribution semantics
                            changed after calibration
replacement:                formation-seed-2026-09-17.json (see below)
```

The run itself remains valid historical evidence and none of its evidence
files is rewritten: `seed-owner-costs.md`, `seed-owner-costs.evidence.json`
and `seed-owner-costs.report.json` stand as they are, along with the live
five-node formation behaviour, the watchdog gaps, the readiness, backoff,
spread and admission observations, the formed timing, the raw logs and the
CPU profile digest.

What lapses is the QUANTITATIVE table. Two source repairs changed what the
same code now reports as owned: the protocol task tracker's bookkeeping and
the seed pipeline's phase completion both keep the lineage of the interaction
they belong to, so turns this run measured as unattributed are measured as
their owner now. The table is therefore no longer admissible for:

- sim/live owner-rate ratios
- per-owner simulator coefficients
- mechanism ranking
- the Q1b residual
- any claim that an owner is under-rate by some factor

No arithmetic adjustment of the old numbers is admissible either. A corrected
table comes from a new measured run, not from adding an estimate of the lost
segments to `raft_protocol`.

**Two kinds of repair, and only one of them touches the live run.** The
simulator-only correspondence repairs - restoring the StartupPipelineRunner
entry, and carrying an AsyncResource across the virtual adapter timer - do not
invalidate the historical run at all. A real Node timer already creates its
async resource when armed, so a live process never lost that lineage; those
repairs explain why the SIMULATOR was losing what live retains. It is the
production attribution-semantic repairs that make the table stale. Nothing
here says that the simulator's newly attributed Raft turns were necessarily
unattributed in the old live run.

**Fail closed.** `formation-seed-2026-09-13.json` now carries its own
supersession record and `loadCalibration()` refuses it with
`calibration_superseded` unless the caller states what it is reading it for.
The metered oracle states that it uses the table for within-run determinism
and never for correspondence. Any new consumer has to make the same statement
in the same place, where a reviewer sees it.

**The replacement run** uses the same external scenario - fresh five-node cold
formation, same machine class or a documented machine factor, same formation
verdict, same owner vocabulary, same formed-mark harvesting rule, same
watchdog and probe evidence - with the repaired attribution implementation,
and records both the formed-window and the complete/deadline snapshot as
before. Owner durations, dispatch and handoff counts, turn segments, mean
microseconds per segment, unattributed and idle are recomputed from the
measured data. No old number is a target. It should be run after the
AddressManager frontier is sealed, so a second live calibration is not needed
if that frontier changes a production formation path.


## Remeasured 2026-09-17, under shared attribution semantics

The replacement calibration ran on head `73e8f8446` (booted fingerprint
`283c3683a7e7e760`, matched), same scenario and machine class as the
2026-09-13 run, with the repaired attribution: PASS, schema admitted,
unattributed 3.25 % of a 137.6 s formation window, partition delta 0. It is
now the simulator's coefficient source
(`formation-seed-2026-09-17.json`, `status: current_live_calibration`); the
2026-09-13 manifest stays refused for correspondence and names this file as
its replacement. Figures below are outputs of measurement, never targets, and
no 2026-09-13 number is compared with them.

### Live per-owner rate (seed, per second of the formation window)

| owner | seg/s | mean us/seg | share |
| --- | ---: | ---: | ---: |
| raft_protocol | 34 102.6 | 11.2 | 38.0 % |
| membership_publication | 2 791.7 | 50.3 | 14.0 % |
| bootstrap | 1 638.0 | 42.3 | 6.9 % |
| rebalancer | 1 059.5 | 145.7 | 15.4 % |
| transport | 1 000.5 | 20.7 | 2.1 % |
| admin | 269.5 | 145.9 | 3.9 % |
| raft_apply | 164.7 | 318.7 | 5.2 % |
| readiness | 3.7 | 2 772.3 | 1.0 % |
| worker_dispatch | 0.0 | - | 0.0 % |

### The metered runner (legacy hosted-owner composition, seed 7)

Like-for-like continuation of the audit above, now against the current table.
Virtual window 20.05 s; unattributed 0 %.

| owner | live seg/s | sim seg/s | sim / live |
| --- | ---: | ---: | ---: |
| raft_protocol | 34 102.6 | 877.5 | 0.026 |
| rebalancer | 1 059.5 | 155.2 | 0.147 |
| readiness | 3.7 | 2.0 | 0.545 |
| membership_publication, bootstrap, transport, admin, raft_apply | - | 0.0 | 0 (never hosted here) |

This composition hosts six synthetic groups on five nodes. Its under-rate is a
property of that composition and is no longer the correspondence question.
Its metered oracle (`formation-sim-metered-oracle.json`) remains bound to the
2026-09-13 calibration digest and stays `substrate_regression_only`; it is not
a correspondence artifact.

### The production-composed seed host (E/F composition, F4 packet)

138 production owner runtimes on node-0 - the same population the live seed
hosts: the seed log registers 135 existing replicas plus 3 message-group
services at 05:52:03 and shuts down only 4 before the harvested snapshot, so
the live window carries 134-138 Raft runtimes throughout. Formation window
4.451 virtual s. This host charges NO cost: virtual time advances by link
delays and timer cadences only.

Normalised per hosted Raft runtime per second (segments = dispatches plus
handoffs, the same unit on both sides):

| owner | live, per runtime-s | sim, per runtime-virtual-s | sim / live |
| --- | ---: | ---: | ---: |
| raft_protocol | 249 to 284 | 1 071 | 3.8 to 4.3 |
| raft_apply | 1.19 to 1.36 | 5.05 | 3.7 to 4.2 |

(The live range spans whether the 18 s before the 138 runtimes existed is
counted in the window or not.)

### Q1b decision

The old finding - raft_protocol 70x UNDER rate - measured the legacy six-group
composition and is superseded. Under shared attribution semantics and the
correct 138-runtime composition the discrepancy is in the OTHER direction and
is consistent across both Raft owners: the simulator realises roughly 4x the
live Raft segment rate per runtime. That is material, so Q1b is open - but
its leading explanation is not a missing protocol trigger. It is that the
production-composed host is uncharged: on the live seed the event loop is
90 % busy and timer- and message-driven work waits behind other owners' turns,
while the uncharged host runs every cadence on time. The same ~4x on
raft_protocol and raft_apply is what a global time-scale effect looks like and
what a missing trigger does not.

So Q1b opens as a CHARGING question first: charge the production-composed
host with this lineage's coefficients (the positive scenario's own closure
matrix and metered oracle, already the planned next step), remeasure the
per-runtime rates, and only if a material discrepancy survives charging does
the trigger question follow. No simulator repair is opened on the rate
difference alone.
