# Necessity audit of fallback arms (Track N)

Read-only. Head **`b638284d1`** (merge of `wip/q11-canonical-operation-mutation-nov21`, 2026-11-21 11:42), read only through
`git show` and `git grep` and through an extracted copy of the tree (scratchpad). Nothing was written in any worktree, and no
test or coverage run was made. Light pure computations ran under `nice -n 19`: the repository's own detectors over the source
text (1.9 s), the census hash check, and `git log -S` history queries.
Marking: **VERIFIED** = computed or read at the head. **INFERRED** = reasoned, not executed.

Owner instruction: test every multiple path for the same logic. The burden of proof is on keeping an arm.
Owner additions (2026-11-21):
1. The ratchet is supplementary. The proof is an executed experiment, and a boundary arm needs a coupled-pair witness across
   the real producer, the publication boundary and the consumer.
2. An unreachable arm may be a required path broken by a producer change (section 6).

## Files

| File | Content |
| --- | --- |
| `site-validity.tsv` | every 2026-11-10 census site with its status at the head, plus the 24 head sites new since the census |
| `buckets.tsv` | one row per still-valid site: head range and line, row, bucket, lanes where each side ran, formation observation, chain length, deferred flag |
| `bucket-row-dir.tsv`, `per-file.tsv` | counts per directory × row × bucket, and per file |
| `sample.md` | 40 sites read at the head and classified into kinds a-f; all 33 N2 sites read |
| `slices.md`, `slices-tests.tsv` | 54 disjoint deletion slices (N0-N3), test selection per slice, deferred files, producer-change marks |
| `producer-check.tsv` | N0-N2 sites reading a value whose producer contract changed, plus the history verdict for the N2 dead primaries |
| `experiment.md` | observation refresh on the head, physical-formation gaps, trap-mode design and recommendation, semantic dispatch points, boundary witnesses |
| `ratchet.md` | the one-way ratchet (supplementary), reconciled with W4 section D and W3 section 5.2 |

## 1. Validity of the 2026-11-10 observations at the head (VERIFIED)

The tooling's slice hash, reproduced from `scripts/checks/code-navigability-source.js` `makeSite`:
`sha256(file + "\n" + text.slice(range[0], range[1]))`. Ranges are **espree offsets in UTF-16 code units**, not bytes; V8 reports
coverage in the same units. The site identity is `(row, file, hash, occurrence)`. Cross-checks:
- Running the detector at the census head `6a240d3de` reproduces 2,685 sites, the original census count, with identical identities.
- The detectors and `makeSite` are unchanged from `6a240d3de` to the head.
- The committed census has 2,674 sites. `5bc4d0769` deleted 11 records of deleted files. `9c3a10fdb` and `5bc4d0769` hand-edited
  one record (`partition-cdc-delivery.js`), carrying its evidence onto text it was never measured on, so it is excluded from all
  evidence counts.

| Status at the head | Sites |
| --- | --- |
| still valid: same range, slice hash matches | 1,876 (1,763 of them in files byte-identical to `6a240d3de`) |
| relocated: file changed, the identical site found elsewhere in the same file by `(row, file, hash, occurrence)` | 721 |
| changed: no site with that hash in the file | 68 |
| file gone | 9 (`live-query-sql-renderer.js`, `query-executor-select-aggregation.js`, `streaming-aggregator.js`) |
| **total census sites** | **2,674** |

- Relocation across files cannot be found with this hash, because the file name is part of it. A text-equality search for the
  77 changed or gone sites found 5 matches, all generic `catch (e) { return null; }` clauses, so they are not relocations.
- The tooling's own `join` binds a run only where the file's whole digest equals the run's: 1,763 sites would bind today
  without a refresh.
- **Detector at the head: 2,621 sites** (two-source 1,660, typeof 587, catch 374). **24 are new since the census**
  (rebalancer 9, query 8, partition 3, node 3, bootstrap 1; by row: two-source 4, typeof 10, catch 10).

Evidence below uses **2,596 still-valid sites**: 1,876 + 721 − 1 hand-edited.

## 2. What "executed" means in this data

- **Mechanism (VERIFIED).** `NODE_V8_COVERAGE` with Node's precise block coverage, flushed by `v8.takeCoverage()` from the census
  preload. `executedIntervalsOfScript` turns nested V8 ranges into executed source intervals. A side counts as executed when **any
  offset** of its range lies in an executed interval (`intervalsOverlap`). Only booleans per run are kept; counts are discarded.
- **Granularity is per expression operand, not per function or line** (VERIFIED with a 6-line probe under node v22.23.2):
  - `o.x ?? p.y` reports `"?? p.y"` with count 0 when the left side answered;
  - `a || b || {}` reports `"|| p.y"` and `"|| {}"` as separate ranges;
  - `if` branches and `catch` clauses each get their own block ranges;
  - an uncalled function reports count 0.

  So a one-line `a ?? b` is resolved. The census's 718 two-source primary-only sites confirm this at scale: under
  function-level coverage that class would be empty.
- **What each row's sides mean:**
  - **two-source** (`a.x || b.y ...`): *primary* = the first term was evaluated, which is true whenever the expression was
    reached. *Fallback* = the **last** term was evaluated, which needs every earlier term to be falsy or nullish.
    - Middle terms are not recorded: in the 513 still-valid chains of three or more terms, a middle source may have answered
      unseen.
    - "Both" does not say whether the first term ever answered.
    - "Fallback-only" cannot occur by construction (0 sites).
  - **catch** (`try {...} catch {return default}`): *primary* = the `try` block was entered. *Fallback* = the catch ran.
    "The try always threw" is invisible.
  - **typeof** (`typeof x === 'function' ? A : B`, `if ... else`): the two arms have their own block counters, so both
    sides are measured. *Primary* = the arm taken when the value is a function, after negations. This is the only row where
    N2 exists.
- **What the lanes are (VERIFIED).** These are test classifications by path (`test/shards/primary-classes.json` at `6a240d3de`),
  not deployment shapes:

  | Lane | Contents |
  | --- | --- |
  | unit | 2,274 test files: everything not classified elsewhere |
  | bootstrap | the 222 files under `test/bootstrap/`, mostly fixture-level tests of bootstrap code, **not** a composed run |
  | integration | 124 `*.integration.test.js` or `test/integration/` files; about 46 start processes or clusters (INFERRED by grep) |
  | packaging | 4 files |
  | formation | `scripts/checks/formation-health.js --trend`: the MovieLens formation-only phase as 5 local processes on one host |

  - The convergence-probe class (3 files) is in no lane.
  - The nightly formation-only runs of 2026-11-08, 09 and 10 all **failed** (`node_ready_lease_incomplete`,
    `data/formation-health/trend.ndjson`). So the formation lane observes formation *attempts*, not a converged cluster,
    steady state, failover, restart or a physical multi-host formation.
- **Two commits (VERIFIED).**
  - The formation and packaging runs, four integration runs and one bootstrap run are from `f3e9b011c`. The rest are from
    `6a240d3de`. Only two `src` files differ between the two commits.
  - 186 still-valid sites have no formation-lane observation: their file was not loaded by the formation processes, or its
    digest differed. For these sites N4 and N5 cannot be told apart.

## 3. Evidence buckets (VERIFIED counts)

| Bucket | Definition | Sites |
| --- | --- | --- |
| N0 | neither side executed in any lane | 141 |
| N1 | alternate never executed (class primary-only) | 1,105 |
| N2 | only the alternate executed; the primary never did (typeof only) | 33 |
| N3 | alternate executed only in the unit lane | 589 |
| N4b | alternate executed in the bootstrap lane (and maybe unit), never in integration, packaging or formation. This is fixture-level evidence like N3, split out because the "composed" label is wrong for the bootstrap lane | 85 |
| N4c | alternate executed in integration or packaging, never in formation | 228 |
| N5 | alternate executed in the formation lane (only 1 site executed its alternate in formation alone) | 415 |

By row:

| Row | N0 | N1 | N2 | N3 | N4b | N4c | N5 | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| two_source_fallback_reads | 107 | 698 | 0 | 396 | 38 | 137 | 280 | 1,656 |
| typeof_dual_paths | 21 | 188 | 33 | 108 | 38 | 61 | 127 | 576 |
| catch_returns_default | 13 | 219 | 0 | 85 | 9 | 30 | 8 | 364 |
| **All** | **141** | **1,105** | **33** | **589** | **85** | **228** | **415** | **2,596** |

By top-level directory (`bucket-row-dir.tsv` has the full three-way table; `per-file.tsv` has per-file counts):

| Directory | N0 | N1 | N2 | N3 | N4b | N4c | N5 | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| control-plane | 10 | 175 | 7 | 141 | 7 | 26 | 151 | 517 |
| rebalancer | 14 | 204 | 2 | 72 | 0 | 23 | 53 | 368 |
| bootstrap | 29 | 108 | 11 | 0 | 66 | 8 | 48 | 270 |
| query | 11 | 101 | 1 | 44 | 0 | 27 | 14 | 198 |
| partition | 7 | 79 | 2 | 61 | 3 | 11 | 12 | 175 |
| admin | 11 | 55 | 0 | 41 | 0 | 14 | 5 | 126 |
| runtime | 12 | 42 | 2 | 37 | 0 | 14 | 2 | 109 |
| node | 5 | 46 | 2 | 15 | 1 | 14 | 25 | 108 |
| service | 7 | 41 | 0 | 20 | 2 | 19 | 6 | 95 |
| wasm-service | 4 | 31 | 0 | 18 | 0 | 19 | 8 | 80 |
| transport | 4 | 24 | 0 | 12 | 1 | 11 | 17 | 69 |
| raft | 1 | 32 | 0 | 15 | 1 | 10 | 5 | 64 |
| diagnostics | 1 | 26 | 0 | 28 | 0 | 0 | 1 | 56 |
| cdc | 2 | 10 | 1 | 12 | 1 | 4 | 15 | 45 |
| message-group | 7 | 20 | 0 | 5 | 1 | 4 | 4 | 41 |
| logging | 0 | 11 | 1 | 11 | 0 | 2 | 13 | 38 |
| index-management | 6 | 18 | 1 | 8 | 0 | 0 | 0 | 33 |
| cli | 6 | 14 | 0 | 10 | 0 | 0 | 0 | 30 |
| 20 others | 4 | 68 | 3 | 39 | 2 | 22 | 36 | 174 |

**N1 by how far the primary got:**
- 504 sites: the primary ran in formation and the alternate never ran anywhere. This is the strongest "not needed in any
  observed schedule".
- 234 sites: the primary ran in a composed lane.
- 367 sites: even the primary ran only in unit tests, so no composed schedule reached the code at all.

**The top files** are listed in `per-file.tsv`. The largest are `wasm-service/wasm-service-models.js` (23),
`diagnostics/topology-convergence-graph.js` (19), `control-plane/control-plane-readiness-publication-planning-resolution.js` (18)
and `query/sql-locking-read-execution.js` (18).

## 4. What each bucket proves and does not prove

| Bucket | Proves | Does not prove: false acquittals |
| --- | --- | --- |
| N0 | no lane reached the site at all | that the code is dead. Unreached production code with a silent default is the defect itself: an untested default is never "fine" |
| N1 | no observed schedule needed the alternate | that none ever will. An error-path catch (219 catch sites) or an unavailability default that never fired is **unproven, not unnecessary**. Under the owner's rule it must become a typed outcome with an owned continuation, not be deleted into an unhandled throw. It also does not prove the arm is not a **required path broken by a producer change** (section 6). For chains of 3+ terms, it says nothing about the middle terms |
| N2 | the guarded capability or injection is used by no lane (typeof only) | which arm is canonical. 13 of the 33 are inverted: the "fallback" is the production path (`sample.md`) |
| N3 | the alternate exists for unit fixtures only | that production cannot reach it. Fixtures are often reduced constructions (W4 section B), so migrate them first |
| N4b, N4c | a test of a composed or bootstrap kind needs the arm | that production needs it. Integration fixtures can also be reduced, and the integration lane is not a formation |
| N5 | the formation attempt reached the arm | that the arm is needed. The primary may have failed (a competing source answering, kind a), or the arm is a legitimate default (e). Only a throw-mode trap decides |

The census can only nominate. An arm is deleted on an executed experiment (trap or deletion with the interaction's
witnesses green), and kept on an executed experiment (a red trap run plus a named witness). See `experiment.md`.

## 5. Sample (40 sites, `sample.md`)

| Kind | Share |
| --- | --- |
| a: competing source of truth | 5 (13 %) |
| b: silent default or substitution | 12 (30 %) |
| c: probe or injection seam for fixtures | 12 (30 %) |
| d: second shape or name | 4 (10 %) |
| e: legitimate default or optional feature (keep only with a witness) | 5 (13 %) |
| f: detector false positive (a catch that *is* the typed-outcome conversion) | 2 (5 %) |

- N1 is mostly b; N2 mostly c; N3 mixes b, c and d; N4 and N5 hold nearly all the a and e cases.
- With 8 sites per bucket the shares are about ±30 points (95 %).
- At full scale (VERIFIED counts, INFERRED kinds): 60 % of the N1 two-source sites end in a named constant, which is kind b.

## 6. Producer-change check: is a never-executed arm a broken required path?

The surrogate scheduling lane looked dead because the October producer change collapsed published partition leader roles to
follower, while its consumer still compared against `leader` (owner decision on D2). Apply this check to every N0, N1 and N2
arm, and to every never-firing W3 role reader, **before deletion**:

1. **Name the trigger value V**, the value whose presence or absence selects the arm:
   - for two-source: the earlier terms being falsy;
   - for typeof: the probed member's presence;
   - for catch: the try's failure;
   - for a comparison: the compared field's value.
2. **Producers at the head:** `git grep` the key, column or constant that writes V (construction options, row columns,
   publication helpers, decision tables under `docs/specs/decision-tables/`).
3. **History:** `git log -S'<key>' -- src` (0.5-1 s per key here). Classify:
   - **P0, never produced:** every commit since the arm's introduction has the key only on the consumer side. This is a
     never-wired seam or a defensive default: delete (or type it).
   - **P1, producer removed or changed:** a commit after the arm's introduction removed the last producer or changed the
     produced value (a column dropped, a role collapsed, a shape renamed). Read that commit's quest or epic record
     (`solve/quests/*/log.ndjson`, `quest.json` `doneWhen`, owner decisions):
     - if the consumer's capability is a recorded requirement (a sealed quest, an epic requirement, an owner decision), it is
       a **broken required path**: repair the consumer onto the canonical producer, with a coupled-pair witness across producer,
       publication boundary and consumer, and do not delete;
     - if the producer change was the deliberate retirement of the capability, delete the consumer, citing the retirement.
   - **P2, produced but unreached:** a producer exists at the head, so the arm can be reached in a schedule no lane ran.
     Use more lanes, a trap in observe mode, or the physical run, not deletion on sight.
4. **Prior executions:** search quest logs and retained physical evidence for the arm's reason code or function (for example
   the July surrogate log recording 13 nonlocal moves through one declared owner). An arm recorded live once and dead now is
   P1 until shown otherwise.

Results so far (`producer-check.tsv`; marks also in `slices.md`):
- **No N0-N2 census site reads SERVICES `raft_role`.** Only two census sites in any bucket touch a role, both reading the
  live role. The role readers are comparisons, which the three syntactic rows do not detect, so the surrogate-type risk sits
  **outside the census**, in W3's reader list.
- 27 N0-N2 sites read a value with a producer contract: `leader_node_id` (2, with a "self is leader" default), the REPLACE
  source (3), and snake/camel shape pairs (24).
- Of the 18 N2 dead-primary keys checked:
  - 7 are P0;
  - **1 is P1**: `resolveExtraFields`, whose only producer was removed in `c93265e10` (2026-03-21); its intent must be confirmed;
  - 1 is a second wiring path (`onSnapshotCatchupNeeded` is assigned after construction by `snapshot-catchup-wiring.js:121`;
    the capability is alive);
  - 7 are P2;
  - 2 are not determined.

## 7. Recommendations

1. **Trap mechanism: (i)**, a plan-driven load-time rewrite in a separate trap preload, with observe and throw modes (`experiment.md` B).
   - Stryker (ii) answers "is it tested", not "is it needed", and cannot run the formation or physical lanes.
   - Hand deletion (iii) is the product change that follows each trap result.
2. **Refresh the census on the head first** (`experiment.md` A: about 2.5-3 h on two lab hosts). This needs two small apparatus
   additions (a lab census route and a merge of merged files), and the join should keep counts per term.
3. **Slices** (`slices.md`): 54 disjoint slices, 1,859 N0-N3 sites in 736 files (13-47 sites each). The formation tier comes
   first: 31 slices, 1,176 sites. 9 further sites sit in deferred writers' files.
4. **Semantic alternates** (`experiment.md` C): count arms at 6 dispatch points. The key one is
   `cdc-integration-service-authoritative-read-delegates.js:260` `executeAuthoritativeSystemTableRead`, where the result already
   names its arm, so the deferred read-flow file needs no edit.
5. **Ratchet** (`ratchet.md`): supplementary. One checker, cells by row × directory × bucket, a census integrity check, and the
   kept-arm exit only with a red trap run and a witness. It adds the two-source and catch rows W4 D.2 left out.

## 8. Decisions needed from the lead

1. Approve building the trap preload and the two census additions (lab census route, merge of merged files, counts per term)
   as apparatus outside `src`. Without them, no "executed experiment" exists for N4 and N5.
2. Whether the physical three-host formation becomes a census lane (about 200 lines across harness, census and image), or
   only an observe-mode counter run, which needs the preload in the image and a bind mount.
3. Whether catch-site deletions (219 N1 catches) may proceed as "typed outcome plus owned continuation" before trap evidence,
   or wait for it.
4. Confirm the P1 case (`resolveExtraFields`, `c93265e10`) as a retired capability, and assign the W3 role readers' history
   checks (D2-style) to the W3 writer.
5. Order between the N3 fixture migrations and the W4 S8 probe work, which share fixtures (`slices-tests.tsv` shows the overlap).

## 9. Not checked

- No test, coverage or trap run. Every reachability statement beyond the census is INFERRED.
- Lane durations: only start times exist. Census host names were not mapped to the lab inventory.
- Kinds a-f for the 2,556 unsampled sites; the population shapes are regular-expression classifications.
- Callers of most sampled sites. The P2 and undetermined N2 cases. The history check for the 24 shape pairs and for W3's
  role readers.
- Whether `controlPlaneOperationLedger` summaries reach an admin snapshot the physical harness retains.
- Whether Stryker propagates the active mutant to child processes.
- How the 9 deferred-file sites relate to the in-flight writers' current branches (only the head was read).
- The boundary-arm count (144; 120 in slices) is a heuristic.
