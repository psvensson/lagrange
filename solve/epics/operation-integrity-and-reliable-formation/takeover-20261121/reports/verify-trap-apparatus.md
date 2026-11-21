# Verification: fallback necessity trap, closure ratchet and checker retirement

Subject: `work/fallback-trap-apparatus-20261121`, commits `a44f8dacb`, `c2df8d9e5`, `e39fe811c` on base `16300e756`.
Verifier: independent, read-only. Nothing was executed: no test, no script, no plan, no checker run.
Every statement below is marked **VERIFIED** (read in the code or data at the named ref) or **INFERRED** (reasoned from what was read, not executed).
Line numbers are at `e39fe811c` unless a different ref is named.

Process note: the brief asked for one command at a time. One call ran five `git grep -c` in a sequential loop and a few calls chained two light reads. All were sequential, pinned and niced; none ran in parallel.

## Verdicts

| Part | Verdict | Short reason |
| --- | --- | --- |
| (a) trap, observe mode | APPROVE-WITH-CONDITIONS | No construct found where the rewrite changes a program value. "Arm ran" is sound. "Arm never ran" is not yet sound: an observation file can be overwritten, and unobserved processes are invisible. |
| (b) trap, throw mode | REJECT as deletion evidence until B1-B3 are fixed | The firing is recorded independently of the throw surviving, which is right. But a green throw run can be vacuous in two ways, and nothing classifies a swallowed throw. |
| (c) ratchet | APPROVE-WITH-CONDITIONS | Supplementary only, and the header says so. It is wired into no gate, can run only where an unreferenced commit exists, under-counts three named leader-role readers, and its documented slice probe can reach 0 without removing an arm. |
| (d) retirement | APPROVE-WITH-CONDITIONS | Nothing dangling in runnable code, no history rewritten, the epic entry is an append. Two open items need a lead decision. |

`git diff --stat 16300e756 e39fe811c -- src vendor` is empty (**VERIFIED**).

## What the apparatus can and cannot support

- **"Arm X ran"** (observe or throw): supported. One record in any observation file is enough.
- **"Arm X did not run in lane L"**: supported only when all of these hold, and the tool checks none of them for you:
  1. X is in the plan and its armed side is known (N2 sites arm the other side, see A4);
  2. X's file has a non-zero `loaded` count in the merged result;
  3. every process and worker of the lane wrote an observation file (no roster exists, see A2);
  4. no observation file was overwritten (see A1);
  5. no file was refused.
- **"Lane L needs arm X"**: a red throw run with X thrown, plus the failing test's output naming X. The trap result does not record which test failed, so the attribution is manual.
- **"Arm X is unnecessary"**: the apparatus cannot establish this alone. It needs the producer-history check, complete-coverage runs in every lane including formation, and then the deletion itself with the change cone green and the boundary witness. For an arm that only runs in a recovery schedule no lane drives, none of this shows that recovery still works.
- **A green throw run in which X threw** means the throw was swallowed or tolerated. It is inconclusive, never evidence that X is unneeded.

## 1. Rewrite correctness (observe mode)

What the rewrite does (**VERIFIED**, `fallback-necessity-trap.js:244-304`):

| Row | Edit | Insert only? |
| --- | --- | --- |
| two-source chain | each term after the first becomes `(trap("id#k"),term)` | yes |
| typeof conditional | the armed side becomes `(trap("id#0"),side)` | yes |
| typeof if, braced arm | `trap("id#0");` after the `{` | yes |
| typeof if, unbraced arm | `{trap("id#0");` before, `}` after | yes |
| catch | `trap("id#0", param);` after the `{` of the catch body | yes |

Nothing is duplicated or removed, so no getter is evaluated twice and evaluation order is unchanged.

Constructs checked by reading, all **INFERRED** safe (not executed):

- `this` binding: a chain or conditional used as a callee already yields a value, not a reference, so the comma changes nothing. A call inside an arm keeps its own receiver.
- Function name inference: a chain term or conditional side is never a direct initialiser, so no anonymous function gains or loses a name.
- `await`, `yield`, arrow bodies, default parameters, class fields, spread, optional chains, `in` inside a `for` initialiser, regex after the inserted comma: the wrapper adds parentheses and parses in each.
- ASI: an expression arm always follows an operator, `?` or `:`. A braced unbraced-arm keeps its own terminator.
- Nested and coincident arms: the edit order (`compareEdits`, `:324-329`) nests closes innermost first and opens outermost first. The combined rewrite of each file is re-parsed (`gateParsableArms`, `:356-366`).
- Line numbers stay true (no newline inserted). Columns shift on edited lines.
- Stack and source-text consumers in `src/` at the base: only `src/sea/runtime-file-resolution.js:19-38`, which reads frame file names, and `src/utils/base-error.js:57`. No `Function.prototype.toString`, `new Function`, `vm` or `eval` use was found by grep. Neither consumer sees the rewrite.
- Loading paths: `module.registerHooks` is in-thread and covers `import`, dynamic `import` and `require`. A planned file whose source is unavailable refuses to load (`preload.js:122-126`). `src/` creates workers and one fork with inherited environment only (**VERIFIED** by grep at the base).

The syntax gate catches a rewrite that does not parse. It does not check meaning. That is acceptable here because every edit is a local insertion.

**No construct was found where observe mode changes a program value.** The tests would fail if the rewrite were a no-op, but they cover about eleven shapes only (`test/scripts/fallback-necessity-trap.test.js:33-97, 262-301`). The claim rests on reading, not on a behaviour corpus.

Side effects that are not value changes (conditions, not blockers):

- **A5. A failed write throws into product code.** `trap` calls `flush` synchronously at each first hit (`runtime.js:363`), and `flush` is an unguarded `writeFileSync` plus `renameSync` (`:294-298`). A full disk or a removed OUT directory raises inside the arm, in observe mode. A test that mocks `fs.writeFileSync` sees the extra call or swallows the write, because `fs` methods are looked up at call time. **INFERRED.**
- **A6. Timing.** Each first hit captures a 64-frame stack and rewrites the whole snapshot on the event loop. Formation lanes are already sensitive to seed event-loop delay. A lane that turns red under observe may be showing this, not a semantic change. **INFERRED.**
- **A7. Drift check is per slice, not per file.** The hash covers `file + "\n" + slice` at each site's absolute range (`runtime.js:189-192`). A stale plan still rewrites a file when every planned slice sits unchanged at its old offset. Sites added after the last planned site are then unarmed and unreported. The plan's `head` is never compared with the checkout. For a catch-row N2 site the insertion lands in the try block, outside the hashed catch clause (`trap.js:300`); there are no such sites today (**VERIFIED** from the baseline: all 33 N2 sites are typeof).
- **A8. Marker escape.** A file that already ends with the marker line loads unarmed and is still recorded as loaded (`runtime.js:188`, `preload.js:135`). Contrived, but it is a silent exemption.

## 2. Recording correctness

Sound, **VERIFIED**:

- The first hit of every arm is written before `trap` returns or throws (`runtime.js:352-365`). SIGKILL, `process.exit`, worker termination and a crash lose only later counts.
- Each thread writes its own file through a temporary file and a rename (`:294-298`, `:382-384`). Concurrent workers cannot corrupt each other.
- `loaded` and `refused` are per process and summed by the merge (`trap.js:574-588`), so "file never loaded" is distinguishable from "arm never ran" at lane level.

Holes:

- **A1. An observation file is overwritten when a process id is reused (blocking for "never ran").**
  The file name is `trap-<pid>-<thread>.json` (`preload.js:112`, `runtime.js:382-384`) and every process writes it unconditionally at start (`preload.js:140`). The merge's duplicate check uses the process key, which the overwritten file no longer carries.
  Minimal example: a container's node is pid 1 and hits arm X, so `trap-1-0.json` holds X. The node is restarted in the same container. The new pid 1 writes an empty `trap-1-0.json`. The merge reports one process and no X.
  This contradicts the header's "first hits are already on disk" (`trap.js:110-112`) for exactly the restart and recovery lanes where fallback arms run. The same happens on any host that recycles pids within one lane (the Windows lab host does; **INFERRED**).
  Fix: put the start time or a random token in the name and create the file exclusively.
- **A2. No roster: a process without an observation is indistinguishable from no process.**
  The merge reads only the files that exist (`trap.js:612-623`). A child started without `NODE_OPTIONS`, or a module loaded from a copy outside the plan root (a packed install), runs unarmed and leaves nothing. The census has a participant roster for this; the trap has none. The header plans one for containers only (`:106-109`), and it is not built. **VERIFIED** absence; which lanes strip the environment was not surveyed.
- **A3. No per-arm report.** The merge lists arms that were hit. "Never ran" is the absence of a key and must be joined against the plan by hand, including the `loaded` check. A `report` step that prints HIT, THROWN, NEVER-RAN and NOT-LOADED per planned arm, and refuses NEVER-RAN when the file's loaded count is 0, would close this.
- **A4. The same arm id names different sides under different plans.**
  For an N2 site the plan arms the primary side; otherwise the fallback side (`trap.js:315`). Both use arm id `<site>#0`. The lab recipe builds the host plan with `--no-census` (`:65-67`) and then says bucket labels come from a controller-side plan because "site ids are the same on both sides" (`:84-85`). For the 33 N2 sites the host observed the fallback side and the controller plan calls that arm the primary. No join tool exists to refuse the mismatch.

## 3. Throw mode

Sound, **VERIFIED**: `thrown` is counted and flushed before the error is raised (`runtime.js:361-364`). A throw swallowed by a product catch-all, discarded by `finally { return }`, or lost in an unhandled rejection is still on disk. The test asserts this through a caller that catches (`test:303-339`).

Holes:

- **B1. A selection that matches no arm is accepted, so a throw run can arm nothing.**
  Throw mode requires only that an include token exists (`runtime.js:312-314`), not that it matches (`:242-245`). The observation records the selection text, not the number of arms selected.
  Minimal example, following the header literally: the host plan is built `--no-census`, so every site's bucket is `uncensused` (`sites.js:340-343`). `LAGRANGE_NECESSITY_TRAP_SELECT=bucket:N1` matches nothing. No arm throws, the lane is green, `thrownArms` is 0.
  A mistyped `site:` id does the same. Fix: refuse when the selection matches zero planned arms, and record the count.
- **B2. A swallowed throw is recorded but never classified.** The merge prints a total (`trap.js:670-672`) and exits 0 when `--lane-exit-code 0` is bound to a result with thrown arms. Nothing lists those arms as swallowed. `experiment.md` B reads "composed lanes green under the trap" as "replaceable"; with `thrown > 0` that reading is unsound. Fix: when the bound lane exit is 0, list every thrown arm as SWALLOWED and exit non-zero.
- **B3. A1 and A2 apply here too.** A throw in an overwritten or unobserved process is invisible, and the lane stays green.
- **B4. `@FILE` selections are not reproducible.** The observation stores the raw text `@path` (`runtime.js:228, 326`), not the tokens read from it.
- **B5. Throw is not deletion.** A trapped catch raises a `NecessityTrapError` wrapping the cause, so an upstream handler that tests the error's type or code sees a different error than it would after the catch is deleted. A trapped chain term throws where deletion would yield `undefined`. Trap-green and deletion-green can differ in both directions. The design already makes the deletion run the final evidence; the tool header should say so.

## 4. The ratchet

One-way behaviour, **VERIFIED** by reading and covered by the tests' known-bad inputs:

| Case | Result |
| --- | --- |
| new site, new file, new directory | fails: a missing cell is 0 (`closure.js:527-539`) |
| edited site text, renamed file | fails: the identity changes and the uncensused cell rises |
| file moved to another top-level directory | fails permanently: the target `fallback_sites` cell can never rise |
| site moved inside its file | no change: identity is hash plus occurrence |
| baseline raised in any commit | fails on history replay (`:411-428`) |
| census changed with head and `generatedAt` both unchanged | fails (`:442-444`) |
| refresh moves a site to a more exercised bucket | fails (`:446-455`) |

Holes, each with its minimal example:

- **C1. The documented slice probe reaches 0 without removing an arm.**
  The header's probe is `--metric --rows fallback_sites_bucket --buckets N0,N1,N2,N3 --scope src/cdc/`, target 0 (`:59-62`). An edited site becomes uncensused and leaves its bucket cell (`:325-327`). With `--rows` set, only the selected cells are compared with the baseline (`:516-539`).
  Example: change `a.x ?? b.y` to `a.x ?? (b.y)` in a scoped file. The probe prints 0 and exits 0. Only the unfiltered checker would object, and it runs in no gate.
  Fix: the probe must also select `fallback_sites_uncensused`, or `--metric` must count uncensused sites in scope.
- **C2. Not wired, and runnable only on this machine.**
  No npm script, static-audit list, proof obligation or hook names the checker (**VERIFIED** by grep at the head). It exits 2 when the census head is not a local commit (`:359`). That commit, `6a240d3de`, is in no ref (see section 8), so every other clone is unmeasurable, and a garbage collection here would make it unmeasurable everywhere. Pin the commit with a pushed ref before relying on the checker.
- **C3. `role_derived_leader_reads` (30) misses named W3 readers.** Leader tokens are learned from imports and module-level constants only (`detectors.js:433-453`), and taint is per file (`:401-411`). Checked against the base:

  | W3 reader | Site at `16300e756` | Why it is missed |
  | --- | --- | --- |
  | N3 | `src/admin/admin-service-discovery-table-readiness-methods.js:359-371` | `LEADER_RAFT_ROLE` is destructured from `options` (`:7-21`), not imported |
  | #12 | `src/bootstrap/owners/bootstrap-topology-snapshot-owner-authoritative-rows.js:404-405` | the role read is an imported helper (`...-contract.js:137`) |
  | #3 | `src/rebalancer/priority-publication-leader-safety.js:52-53` | the role read is a method defined in a sibling file (`priority-publication-safety-topology.js:233`) |

  The cell counts agree with this reading: admin is 2 with three named comparisons, bootstrap is 4 with five. Six other named sites were found counted (`admin-shared-metadata-consistency.js:135`, `admin-control-snapshot-leadership-summary.js:342`, `node-joining-backfill-merge-and-status.js:781-782`, `...-leader-identity.js:120`, `...-published-views.js:198`, `leader-readiness-gate.js:120`). The header's "an over-count, never an under-count" holds for name scoping only. New readers written through an injected constant or a shared helper are invisible to the ratchet. **INFERRED** from the detector logic; the detector was not run.
- **C4. The fixture exemption is a substring test.** A row is exempt when the text of its first type key matches `/wasm|meta/` (`detectors.js:106, 497-508`).
  Example: `{service_id: 'p1-metadata-r1', service_type: SERVICE_TYPE.MESSAGE_GROUP, raft_role: 'leader'}` is exempt, because `service_id` comes first and contains "meta". Rows of that naming exist (`test/message-group/cdc-non-leader-propagation.test.js:972-990`, currently `candidate`, so not miscounted today).
  Exempt rows are a bare count with no locations and no cell (`closure.js:342-345`), so an exemption cannot be reviewed or ratcheted. The exempt total at the base is retained nowhere; W3 expected 17. Message-group rows are counted separately as claimed (56, **VERIFIED** by summing the baseline).
- **C5. The kept-arm rule does not require the lane to be red because of that arm.** It checks a non-zero bound exit code and `thrown > 0` for the site (`closure.js:242-258`).
  Example: one `bucket:N5` throw run of the formation lane is red because of arm A. Every other N5 arm that threw once and was swallowed now qualifies as kept from that same file.
  Also: the exit code is a caller-typed flag (`trap.js:656-664`), the trap file is hand-writable JSON with no provenance check, and the witness needs only to exist and be classified (`closure.js:260-265`). Nothing ties the witness to the arm or to the test that failed. The coupled-pair condition of `ratchet.md` 1.4 is not implemented. Fix: require the run's selection to be exactly that site, and record failing tests in the trap result.
- **C6. Census edits pass when `generatedAt` is bumped.** With the head unchanged and `generatedAt` changed, no bucket comparison is made (`closure.js:445`). The baseline's own `censusHead` is free text, never compared with the census (`:395, 416`), and changing it re-bases every bucket cell.
  Example: flip one record's sides from N5 to N0 consistently, bump `generatedAt`, edit the bucket cells and alter the baseline's `censusHead`. Every check passes. `sites.js:28-29` admits that tampering is only bounded; the checker header's "a re-join, never a partial edit" overstates it.
- **C7. Parallel tightening can leave the checker red for good (INFERRED, check before parallel slices start).** History is replayed as one linear `git log --reverse` list without `--first-parent` (`closure.js:156-166, 398-409`).
  Example: branch 1 lowers cell x from 5 to 4. Branch 2, cut earlier, lowers y and still carries x = 5. After the merge the list reads base, branch 1, branch 2, merge. The step from branch 1 to branch 2 shows x rising from 4 to 5, which is reported as a raised baseline, and history cannot be repaired.
- **C8. Semantic rows are counts, not identities.** One site can replace another inside a row and directory cell. Fixtures are keyed by top-level test directory, not per file as W3 5.2 specified. Tightening is a hint only, so slack accumulates.
- **C9. Scope is narrower than `ratchet.md` 1.5.** Present: the three census rows, read-mode members (merged with repository read sources), non-required leader mode, role reads, fixtures. Absent: `fallback_contract_flags`, `fallback_identifiers`, `sequential_dual_read`, `unavailable_collapsed_to_value`, typeof probes without an else, `legacy_term_identifiers`, `implicit_mode_defaults`, `reduced_owner_fixtures`, W3 family W, fixtures under `scripts/`, builder arguments and JSON fixtures. The header lists what exists accurately; the commit subject line overstates it.
- **C10. `census_head_not_ancestor` and one unreproducible record are baselined, not refused.** `ratchet.md` 2 asked for a refusal. The cells are honest and one-way, but every bucket is evidence measured on a commit outside this lineage. Buckets are nominations only.

Reshaping code so a detector no longer matches (a statement split, a helper, `??=`) satisfies the syntactic rows. That is inherent. The header says "fewer counted shapes" and "never the proof", which is honest, though it does not name the reshaping escape outright; `ratchet.md` 3 does.

Spot checks of the other semantic rows against the base, **VERIFIED** by grep: the rebalancer read-mode cell (24) matches 23 code lines carrying the W4 D.2 names; the admin cell (15) matches 15 lines. Plausible.

## 5. Probe discipline (R27)

- The checker reads files and runs `git` read commands only (`rev-parse`, `merge-base`, `log`, `show`, `cat-file`). It writes nothing; `--print-baseline` prints. **VERIFIED** by reading. The test asserts an unchanged `git status` around every run (`test/scripts/fallback-read-closure.test.js:164-169`).
- `plan` writes only its `--out` file and runs `git rev-parse HEAD`. It starts nothing.
- `--metric` fits the `script` probe kind (`scripts/solve/probes.js:432-466`): the script is under `scripts/checks/`, the number is the last numeric stdout line, exit 2 prints no number and so is non-measuring, exit 1 prints the number and is not done. **VERIFIED.**

## 6. The retirement

- References at the base outside history and evidence: the Q11 evidence script, the test, three shard class files, and the epic's receipt id. At the head the shard files and the evidence script are updated; the checker and its test are gone. **VERIFIED.**
- No file under `solve/quests/` changed. The epic change is 13 added lines at the end of the file. No history was rewritten. **VERIFIED** from the diff.
- The evidence script keeps `--check-verification`; its default mode now exits 1 with a message. The third lab test file covers that surviving mode and passed.
- The epic entry states plainly that the classification file and the `fallback_sites_unclassified` budget row were not retired, which differs from `ratchet.md` 4 and is explained.

Open items:

- **D1.** Q11's receipt records a digest for the deleted test (`solve/quests/repository-legacy-fallback-closure/evidence/receipt.json`, `testFileDigests`). If Q11's sealed probe is ever re-measured it returns non-measuring, "missing" (`probes.js:101-146`). It is a closed quest, so this is latent.
- **D2.** The epic still requires the receipt `repository-legacy-fallback-closure-verified` (epic line 22; `solve/quests/canonical-authority-formation-acceptance/quest.json:21`). No script produced that id at the base either. After the retirement someone must decide what satisfies it.
- **D3.** The old test ran in the unit lane against the real tree. The new tests use synthetic checkouts only. Until the new checker is wired, no lane measures the real tree's fallback sites at all.

## 7. The tests

- Known-bad inputs are present and must be refused (R19). Trap: a drifted file (runtime and child process), a rewrite that does not parse, throw without a selection, an unknown mode, merges of mixed plans, a duplicate process, a foreign schema, a re-merge of a bound result. Ratchet: a new site, a raised baseline, an unrejoined census edit, an upward refresh, a head off the lineage, an absent head, a missing baseline, and kept entries with prose, the wrong bucket, no red run, observe mode, exit 0, zero thrown, or an absent witness.
- The trap tests run through the real preload in child processes (`NODE_OPTIONS=--import=<preload>`, `test:165-176`). They assert the exact set of recorded arms and the thrown errors, so a no-op rewrite fails them.
- Not tested: pid reuse, a selection matching nothing, a swallowed throw at lane level, `require` loading, a child without the environment, the "metadata" exemption, cross-file leader reads, the `generatedAt`-only census edit, merged branch history.
- Lab output (`lab/trap-apparatus-e39fe811c-tv1/`): sha `e39fe811c9918551f557c2c7636dff7aa8aa4d68`, host tv-dator, three files, exit 0, 12 + 9 + 9 = 30 assertions. **VERIFIED.** Twenty-one of the 30 belong to the two apparatus files. The run holds no real-tree plan or checker output, so the plan numbers (3,294 arms, 0 uninstrumented) are not independently confirmed.

## 8. The author's stated findings

- **Census head.** `6a240d3def91f05191214c3c1d4768904945b0bf` exists locally as a commit (2026-11-10), is contained in no ref of any kind (`for-each-ref --contains` is empty), and is not an ancestor of `e39fe811c`. **Confirmed.**
- **Baseline numbers.** Summing the committed baseline gives 2,621 sites; N0 141, N1 1,105, N2 33, N3 589, N4b 85, N4c 228, N5 415; uncensused 25; rows 1,660 / 587 / 374; read-mode 124, leader-mode 72, role reads 30, fixtures 535, message-group fixtures 56. **Confirmed** as the file's content, not as a fresh measurement.
- **N1 over-acquits multi-term chains.** Consistent with the code: the census's fallback side of a chain is its last term only (`code-navigability-fallback-detectors.js:95`), while the trap arms every later term. No retained artifact of the four-term smoke was found, so the observation itself is **not verified**.
  Share: 3,294 arms minus 961 single-arm typeof and catch sites leaves 2,333 arms on 1,660 chains, so 673 middle arms. At most 673 chains (40.5 %) have three or more terms. Spread evenly, that is at most about 283 of the 698 two-source N1 sites, a quarter of all N1. The exact figure is not derivable from the stated numbers: the plan computes arms per bucket but does not print them (`trap.js:457-481`).
  Recommendation: yes. For a chain of three or more terms, N1 speaks for the last term only. Every middle arm has no census evidence and should be treated as unproven until an observe run covers it.

## Conditions, in priority order

1. A1: unique observation file names (start time or token, exclusive create).
2. B1: refuse a throw selection that matches no planned arm; record the selected count.
3. B2 and A3: a report that classifies every planned arm, lists swallowed throws, and refuses "never ran" for an unloaded file.
4. A2: a process roster, or at least an expected-process count bound into the merge.
5. C1: fix the slice probe so uncensused sites in scope count.
6. C2: pin `6a240d3de` with a pushed ref before any use; then wire the checker.
7. C5: the kept rule requires a single-site selection and a recorded failing test.
8. C3 and C4: cross-file and injected leader tokens; exact-match exemption with listed locations.
9. C7: confirm or refute the merged-history false red before parallel slices tighten the baseline.
10. A4: encode the armed side in the arm id, or refuse label joins across plans.
