# Re-verification: trap apparatus, corrective round

Subject: `work/fallback-trap-apparatus-20261121`, commits `4c4bf1cd1`, `2a689f1b9`, `29502803b` on top of `e39fe811c`.
Round 1: `verify-trap-apparatus.md`. Same rules: read-only, nothing executed here.
**VERIFIED** = read in the code or in retained lab output. **INFERRED** = reasoned, not executed.
Line references are at `29502803b`.

## Verdicts

| Part | Round 1 | Now | Why |
| --- | --- | --- | --- |
| Observe mode | APPROVE-WITH-CONDITIONS | APPROVE-WITH-CONDITIONS | The overwrite and roster holes are closed for host lanes. Three small gaps remain before a NOT-REACHED is cited. |
| Throw mode | REJECT as evidence | APPROVE-WITH-CONDITIONS | A vacuous run now refuses to start, and a swallowed throw fails the report. The report's passing verdict still needs reading rules. |
| Ratchet | APPROVE-WITH-CONDITIONS | APPROVE-WITH-CONDITIONS | The probe, census-head, kept, merge-history and exemption holes are closed or narrowed. Do not wire it yet. |
| Retirement | APPROVE-WITH-CONDITIONS | unchanged | This round touched nothing of it. |

## Which uses are sound now

**(i) Collecting observe evidence on the lab, once a route exists.**
- "Arm X ran" (HIT): sound, any lane.
- "Arm X did not run in lane L" (NOT-REACHED): sound for lanes whose processes are all started by Node through `child_process` or `worker_threads`, when every one of these holds:
  1. the report verdict is COMPLETE;
  2. the report is bound to the lane and the lane exit code is 0 (the tool does not require this, see O3);
  3. X is in `notReached`, not `notLoaded`;
  4. the plan was built in the lane's own checkout;
  5. the merge line shows a non-zero rostered count when more than one process ran (see O1).
- Not sound yet for container lanes (formation, physical). dockerd starts the node, so no roster covers it, and the harness step that would refuse a silent container is not built.

**(ii) Citing a throw run in a deletion's evidence.** Sound only in this form: X is in `armed` and in `notReached`, the verdict is NOT-REACHED, the lane exit is 0, and the verifier has recomputed the plan digest and lane-log digest from retained files. That says the same as an observe result, plus proof that X was armed. A throw run never supports deleting an arm that ran: SWALLOWED and SURFACED both block.

**(iii) Wiring the ratchet into a gate.** Not yet. Three things first (R1 to R3 below).

## (a) The seven blocking holes

| # | Hole | Status | Next variant tried |
| --- | --- | --- | --- |
| 1 | Observation file overwritten on pid reuse | **Closed.** The name carries a random token and the first write is exclusive (`runtime.js` `createExclusively`, `observationFileName`). | Two hosts' files copied into one directory: observations stay distinct, but roster files collide by pid (see O2). |
| 2 | No roster | **Closed for Node-to-Node launches.** The census preload runs in roster-only mode; a rostered process with no observation makes the merge INCOMPLETE, exit 1 (`results.js:179-231`). | See O1 and the stated limits below. |
| 3 | Throw run that arms nothing | **Closed.** The process refuses to start (`runtime.js` `refuseVacuousThrow`); the armed count is recorded and must agree across inputs. | `bucket:N1,site:<typo>`: the bucket arms something, so the typo is accepted silently. `select` shows the armed list; nothing refuses a token that matches nothing. |
| 4 | Swallowed throw not classified | **Closed for green lanes**: verdict SWALLOWED, exit 1. | See T1. |
| 5 | Slice probe reaches 0 by editing text | **Closed.** Selecting the bucket row also counts uncensused sites in scope. Retained metric: 1,893 = 1,868 + 25. | None found beyond reshaping, which the header now names. |
| 6 | Checker runs only on this machine | **Closed.** Typed exit 3 names the fetch; `census/fallback-census-head-6a240d3de` exists locally and as a remote-tracking ref (**VERIFIED**). | It is a branch, not a tag: it can be moved or deleted. |
| 7 | One red run keeps every arm | **Narrowed.** The report must arm that site alone, be SURFACED, and list the witness among its failed tests (`closure.js` `trapProblem`). | See K1 and K2. |

Also from round 1: the injected leader constant is now counted (admin 2 to 3); the two cross-file readers are named in the header as a known undercount. Exemption is by whole service type; the re-measure moved 7 rows from the message-group row to the counted row. Exempt rows are now a per-directory cell (16 at the head), but their file locations are still never printed (`closure.js:660-676`). The merged-history false red, which I had only inferred, was confirmed by execution: that test returned 1 at `4c4bf1cd1` and 0 after the fix.

### Remaining findings

- **O1. The roster flag is self-declared.** An observation says `roster: true` when the census directory variable equals the trap's out directory (`preload.js`, `rostered`). Nothing checks that the census preload was actually loaded.
  Example: `NODE_OPTIONS` carries only the trap preload, `LAGRANGE_CENSUS_COVERAGE_DIR` is set. No roster file is ever written, every observation claims the roster, and the merge is complete with 0 rostered.
  Fix: at install, confirm the census launch wrappers are in place before claiming the roster; in the merge, flag observed processes that have no roster entry, other than the lane root.
- **O2. Roster matching ignores the host.** Entries and observations are matched on `pid:thread` (`results.js:92-94, 184-189`). Merge per host first, as the recipe says; the tool does not refuse a directory holding two hosts' files.
- **O3. COMPLETE does not mean the lane completed.** An observe report needs no lane binding, and a bound red lane still reads COMPLETE (`results.js:327-333`). A lane that aborted halfway yields NOT-REACHED for every arm its unrun tests would have reached.
- **T1. SURFACED means "lane red and the arm id appears in the supplied logs", not "red because of it".** The match is a substring test per arm id over all lane logs, or a non-zero uncaught-monitor count (`results.js:311-325`).
  Example: the trapped arm throws, a product catch logs the error message (which contains the arm id) and continues; the lane fails on an unrelated flaky test whose output includes that log line. The arm is classed SURFACED.
  For deletions this errs toward keeping the arm, which is the safe side. It matters for kept arms (K2).
  A lane red for an unrelated reason with the throw swallowed and not logged is classed SWALLOWED, which is correct by the code but has no test.
  Minor: `#f1` is a substring of `#f10`, so chains with ten or more later terms can cross-match.
- **T2. The passing verdict NOT-REACHED hides three cases.** It is returned whenever no armed arm threw. It still passes when the armed arms' files were never loaded, when the lane was red, and it says nothing about masking in a SURFACED run, where the other arms' `notReached` entries are untrustworthy because the lane died early. Hence the reading rules under (ii). A separate verdict for "armed but not loaded" would remove the first.
- **K1. A report can be written by hand.** The checker reads `schema`, `mode`, `verdict`, `head`, `run`, `armed`, `surfaced` from the committed JSON and nothing else. The plan digest and lane-log digest in a real report bind it to inputs that are not committed, so the checker cannot test them. What binds a report to an executed lane is the retained lab job, outside the tool.
  This lets a fabricated, prose-free keep through. It is the conservative direction (an arm is kept), but a kept arm leaves its N4c or N5 cell, so a false keep shields an arm from the programme.
  Smallest improvement: commit the merged file and lane log beside the report and have the checker recompute the report from them.
- **K2. A coincidental red still keeps.** With a single-site selection, T1's example plus naming the flaky test as witness satisfies every check. A control run (the same lane, same head, no trap, green) would close it.

Stated honestly in the tool header and accepted as limits: launches outside the wrapped APIs, a packed copy outside the plan root, pid reuse sharing one roster entry, hand-writable reports, the unimplemented coupled-pair condition, bounded census tampering.

Expected friction, not a hole: INCOMPLETE is all-or-nothing. A lane with one deliberately clean-environment child cannot produce a COMPLETE report without someone adjudicating that child from its roster entry.

## (b) The detector version re-base

**Yes, it can raise semantic cells silently.** A changed `detectors` value in the baseline skips the raise check for every semantic cell (`closure.js` `baselineRaises`), and the only other rule is that the baseline names the current constant.

Example: one commit changes `DETECTORS_VERSION` from 2 to 3 with no detector change, adds five new role-derived readers in `src/`, and lands the re-measured baseline. The checker exits 0 and prints nothing about the re-base.

The version need not increase: the new test itself goes 2, 1, 2 and each step re-bases. A detector edit with no version change is equally unguarded, so a detector weakened to match less simply lowers the cells.

What makes it visible today: only the diff of one constant and of the baseline, in review.

A version change should require:
1. that the commit touches only the detector files, the baseline and the checker's tests (the checker has both revisions and can test this);
2. a printed line per cell that moved at the re-base;
3. the version derived from a content digest of the detector modules, so it cannot be skipped or bumped without a change;
4. a dated entry in the epic's decision log.

## (c) The author's "not closed" list

| Item | Blocks use? | Reasoning |
| --- | --- | --- |
| A failed observation write throws inside product code | **Fix before a NOT-REACHED is cited; does not block collecting.** | After the file exists, a persistent write failure leaves it stale. The roster sees a file and reports nothing. Later first hits are lost, which is the dangerous direction, and the thrown error may be swallowed by the very catch being audited. Catch the failure, count it, and make the merge treat an observation with write failures as incomplete. |
| Drift check per slice; plan head not compared | No. | The recipe builds the plan in the lane's checkout. A stale plan cannot mis-arm a planned site; it can only omit new ones, which no report then mentions. |
| A file ending with the marker loads unarmed | No. | No file under `src/` or `vendor/` carries the marker at the head (**VERIFIED** by grep). A one-line refusal in `plan` would make it permanent. |
| Report provenance | Not for deletions, if the verifier recomputes the digests from retained files. Weakens kept arms (K1). | |

## (d) Tests and lab outputs

- **Red**, `trap-apparatus-red-4c4bf1cd1-tv-dator-1`: sha `4c4bf1cd1d0b19ea12f267dfca8863ce9bf5b767`, tv-dator, 2 files, exit 1. Trap file 12 pass, 6 fail; ratchet file 9 pass, 9 fail. So 15 fail and 21 pass, as claimed (**VERIFIED**).
  Twelve fail on the hole's own behaviour. Three fail earlier: two on `reportRun is not a function`, one because the old checker rejects the new report shape at its first assertion. That is still red for the right code, but not "on the hole itself".
- **Green**, `trap-apparatus-green-29502803b-adams-gamla-17`: sha `29502803bb25587b2adadca435997c2274e42cd9`, adams-gamla, 2 files, exit 0, 18 + 19 = 37 (**VERIFIED**). The 37th test (detector version) was added with the fix, not red first.
- **Plan artifacts**, `trap-apparatus-plan-29502803b`: 2,621 sites, 3,294 arms, 0 uninstrumented at the head; checker output with role reads 31, fixtures 542, message-group 49, exempt 16; "ratchet OK: 6062". These now exist as retained output, which round 1 lacked. The directory does not say which host produced them.
- The new tests hold known-bad inputs and run the roster, the refusal and the swallow through real child processes. A no-op implementation fails them: that is what the red run shows.
- Not tested: O1, O3, T1's logged-but-swallowed case, the unrelated-red swallowed case, a merge that keeps a higher cell, a version bump with source changes.

## Before wiring the ratchet (iii)

- **R1. A census refresh route must exist first.** Editing a site's text or renaming a file with sites raises the uncensused cell, and only a refresh or a deletion lowers it. The design notes say no lab route runs the census. Wired today, the gate would block ordinary edits in 875 files with no way back. **INFERRED** from the cell rules and `experiment.md` A.1; decide this knowingly.
- **R2. The gate's clone needs the census ref and full first-parent history of the baseline.** Exit 3 must fail the gate, not skip it. A shallow clone hides raises.
- **R3. Tighten the detector-version rule** as in (b).

## Conditions, in priority order

1. Write-failure handling in the recorder (item 1 of (c)).
2. O1: verify the census wrappers before claiming the roster; flag observed-but-unrostered processes.
3. O3 and T2: require a lane binding with exit 0 for a passing verdict; a distinct verdict for armed-but-not-loaded.
4. (b): the version-bump rule.
5. K1 and K2: recompute the report from committed inputs; a green control run for a keep.
6. Refuse a selection token that matches nothing; refuse a directory with two hosts; print exempt locations.
