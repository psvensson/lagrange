# Independent predecessor comparison review

Reviewer: `subagent:/root/control_source_review`. Date: 2026-10-21.
Verdict: **APPROVE the bounded file-level historical comparison, with the
assertion-text correction below.** No production, corpus, landing, release,
failure waiver, or same-root-cause approval is given. No tests were run by this
reviewer. Only this additive review record was written.

## Frozen inputs and independently checked correspondence

The reviewed local packet is
`test-output/seed-release-custody/predecessor-847c36a31/` in the primary execution
tree. Its `packet-manifest.json` SHA256 is
`a721689a8676e46ee545fc345745a918149cb2f2fec67317d8f1d7b1c16c6239`.
All 64 listed files independently matched both recorded sizes and hashes.
The five nested per-host manifests also matched their data files.

The frozen `comparison.json` SHA256 is
`c99e67d38d82e1e711b4b2a5cb3d658a365cbcaf6160c31e002eb936d149d6f4`;
`comparison-report.md` is
`8a2ec6cde8fc54e74284009a2c5d21f4c2de679106c3ed7bcd6bdeea978965a7`.
These originals remain evidence; the correction in this review does not rewrite
the original index or its manifest.

Candidate: `393f411ca09449898465cc3cb7320c03fba2aba8`.
Predecessor: `847c36a31ea3e84880dbf5e16b7e4ffb81cdd3eb`.
For all 102 files, direct `git rev-parse <sha>:<path>` readback independently
confirmed equal test blobs at both commits and agreement with the index.
The same check confirmed the three runner-owner blobs:

| Owner | Equal Git blob at both commits |
| --- | --- |
| `scripts/lab/probe.js` | `f336847122d8e9f37f0e05cf3b8a7b4056367978` |
| `scripts/run-classified-test-files.js` | `677f3f511176028057ccf6d2bdbbf39a4aefd964` |
| `scripts/run-test-files.js` | `e40cda7cb2f2f206f37e6ace1fbb5c5937096e76` |

This is direct test and named runner correspondence, not equality of every
dependency. Git comparison confirms ten changed production files across the
pair, including bootstrap custody/phase, participant completion, and the
message-group/WASM literal-owner changes. Metadata, scripts and repository
state consumed by structural tests can also differ.

I independently re-indexed all 204 candidate/predecessor host-prefixed outer
verdict blocks, their counts/durations/line numbers, and each block's first
retained failing TAP assertion. Every indexed field agrees with the frozen
comparison. This checked all pairs, not only the four prioritized examples.
The 99 original failures exactly equal the original broad controller's red
selection; the three supplementary files are disjoint, all on Lenovo, and
match the separately retained candidate attempt. No nested fixture result was
promoted into this selection.

The original 99 selection SHA256 remains
`f631228a9fc42bb2e1588c70464c3328f96e161aa47401d48a539c80fb71e887`;
the three-file supplement is
`7c1c5281aaf90a363bae0c7591f2b36d332c347ff3f3184a724b1c3314835144`.
For each host I verified the execution-start input digest against its actual
input (the supplemented input for Lenovo), exact predecessor commit in both
plan and placement log, the planned file set and every classified lane's
membership. The five raw predecessor ledgers have exactly the selected files,
no duplicates/extras, attempt 1, `retriedOnce: false`, and all `ok: false`.

## Measured file-level result

| Host | Planned/reported red | Reported assertions | Candidate factor to predecessor factor |
| --- | ---: | ---: | --- |
| adam-laptop | 16/16 | 163 | 2.0 to 2.1 |
| adams-gamla | 16/16 | 521 | 2.1 to 2.1 |
| carinas-windows | 12/12 | 321 | 2.5 to 2.0 |
| tv-dator | 34/34 | 1,218 | 1.4 to 1.4 |
| lenovo-laptop | 24/24 | 481 | original 2.2, supplement 2.3, predecessor 2.3 |
| Total | 102/102 | 2,704 | Same canonical policy, differing observed factors |

All five executions terminated with exit 1; no selected predecessor file was
green or unreported. The retained execution interval is
06:28:34.442 through 07:01:17.790 UTC. The orchestration invokes canonical
`labTestCommit`, classified planning and `runLabTest` with the original host,
split false and retries zero, rejects manual timeout/factor/lane/thermal
overrides, and preserves normal thermal holds. The source and recorded
placement environment support this bounded harness claim. Different discovered
factors, load and smaller selections prevent an equal-timing experiment claim.

The original candidate broad attempt remains 1,261 selected, 1,159 pass,
99 reported red and three unreported. The separate candidate supplement
measured those three red. This comparison neither rewrites the incomplete
original attempt nor supplies the missing original Lenovo ledger. All five
predecessor ledgers are present; the candidate's original Lenovo evidence
continues to rely on retained controller verdicts and the separate supplement.

## Required correction: absent assertions are not matching texts

The comparison's boolean reports 97 `sameFirstReportedNotOkText: true` values.
One is `null == null`, for
`test/bootstrap/phase-failure-handling.property.test.js`.
Therefore the accurate partition is **96 equal retained first-assertion texts,
five different texts, and one pair with no indexed failing assertion**.

For that last file the candidate outer verdict is at original controller line
34285, followed at 34286 by a runner timeout after 600,045 ms against a
600,000 ms budget, SIGKILL, and process exit without a status. The predecessor
Lenovo controller lines 2899-2900 report the same runner-level budget outcome
after 600,089 ms. Both report 14 assertions; neither retained excerpt contains
an indexed failing TAP assertion. Retained earlier material includes intentional
one-millisecond leader-wait failures and passing failure-handling children; it
does not identify the final internal pending operation. Candidate line 34364
reports 87,708 elided bytes and predecessor line 2979 reports 84,028 elided bytes.
The equal-null boolean is a derivation property, not evidence of equal assertion
text or a proven identical hang cause. Root agreed to preserve the original
packet and correct the wording additively.

## All five differing texts

All remaining unequal pairs were read in both retained blocks:

* `index-maintenance-consistency.property.test.js`: random seed differs
  (1827693874 versus -638982614); the minimized counterexample
  `partition-0`, `tbl_A00`, and `{id:1,col_data:" ",col_num:0}` is equal,
  with 21 shrinks and a false predicate in both.
* `raft-leader-election.integration.test.js`: the same 15-second bootstrap
  assertion reports 39,392 versus 38,774 ms. This proves the asserted bound was
  missed in both observations, not equal latency or identical internal cause.
* `table-partition-structure.property.test.js`: seed/shrink path differ,
  10 versus 11 shrinks, and minimized table name `A` versus `A0`; both retained
  texts report a false predicate with the same zero-valued UUID row shape.
* `distributed-transaction-coordinator.property.test.js`: seeds, minimized
  inputs (`0--`/`p-0` versus `000`/`p-a`), shrink counts and placement paths
  differ. Both retained stacks identify the typed participant-outcome refusal
  at `sql-query-engine-participant-wire.js:193`, through `:257`, initializer
  `:205` and participant-set `:78`. This establishes an observed common refusal
  boundary, not the equivalence of the different generated schedules.
* `cdc-generation.property.test.js`: seeds and 14 versus 11 shrinks differ;
  the minimized `partition-0`, `A`, `{id:1,name:" ",value:0}` counterexample and
  false predicate match.

The other 96 retained first texts match after removing only the TAP elapsed-time
suffix. Many are generic (`should be equal`, `bootstrap should succeed`,
`timeout!`, or `test unfinished`). Matching such a label is deliberately not
promoted to root-cause attribution or evidence that later assertions would
behave identically.

## Four prioritized first material observations

1. `code-path-uniqueness.property.test.js`: original line 2036 and predecessor
   Adam line 23 contain exactly the same five detector entries for ENABLE
   symbols in participant release, cutover constants, WASM opening,
   publication and constants. The failing assertion is test line 259. This is
   matching detector output, not proof those identifiers are runtime feature
   flags or a candidate-only introduction.
2. `replica-handler-owner-path-bypass.test.js`: original line 4951 and
   predecessor Adam line 836 first pass `create should be initiated`; lines
   4958 and 843 then report unfinished work in the first CREATE child declared
   at test line 182. Source awaits its created-event promise after the initiated
   response. Four assertions are reported on each run and later children
   cascade. The log does not identify the precise internal pending await or
   establish a product defect in all later cases.
3. `replica-create-admission-recovery.test.js`: the first terminal-first child
   passes (original 1286, predecessor Adams 240). The current-boot CREATING
   child then has an explicit missing `semantic_raft_status` observation
   (1314/268) before its pending-promise cancellation (1323/277). Subsequent
   child cancellations remain consequential observations, not separate proven
   causes. This supports the report's first-refusal boundary with that limit.
4. `message-group-native-custody-handoff.test.js`: original 878 and predecessor
   Adams 406 fail the same actual recipient proposal-count assertion at test
   line 146, expected 1 versus actual 0. The preceding sequential source
   assertions require successful native source write, an actual durable CDC
   event and safe positive log index before the owner flush and retained
   recipient observation. This supports engaged source/CDC flow and the
   recipient-count divergence. The subsequent retention/rejoin obligations
   were not proven; neither lost durable debt nor cross-host safety follows.

## Evidence and owner limits

The full retained controller streams are not complete child TAP. The predecessor
streams explicitly elide one Adams block (430,444 bytes), one Lenovo block
(84,028), and two TV blocks (375,780 total). Adam and Carinas streams have no
such elision markers. The packet preserves the emitted streams and raw
transport outputs; the absent expanded child TAP cannot be reconstructed from
an index. This is especially material for the null-assertion runner kill.
No missing native execution or absent assertion is converted into safety.

Applicable category disposition:

* Evidence integrity: exact packet hashes, direct Git identities, all 204
  indexed blocks, per-host plans/inputs and all five predecessor ledgers checked.
  Publication is still a separate owner operation; restoration-target paths
  and publication-candidate lists are not evidence that upload completed.
* Harness fidelity: same test bytes, same named runner blobs, original hosts,
  attempt 1/no retry, original selection plus explicit supplementary attempt.
  Factors and subset load differ; property generators are not seed-matched.
  The four selected engagement claims above distinguish reached assertions
  from pending/cancelled work.
* Recovery/replay: no retry, reset, changed deadline or substitute execution was
  introduced by this review. Historical recovery failures and uncertain work
  remain obligations; timeout/cancellation is not native cleanup finality.
  This predecessor comparison is not a recovery witness for the new handoff.
* Owner interaction: report labels remain observations at the tested boundary;
  common refusal text is not independent proof of every underlying producer,
  authority or subsequent effect. The changed source dependencies and earlier
  assertions can mask other regressions. No existing U1/TX1/FreshMG/cutover
  acceptance or broader release gate is weakened.

The defensible result is that this selected set has **102 red-at-both-heads
file observations** with the exact first-text partition corrected above.
All 102 remain work obligations. The other 1,159 candidate-green files were
not predecessor-tested by this slice, and the candidate's broad gate remains
RED independently of these historical observations.
