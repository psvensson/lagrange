# Diagnostics this repair removes

Lead ruling 1 (2026-11-28, case (ii)): the per-hop trace is not threaded
through the sealed completion or its primitive. Citations are at
`ab347e9625a64ed24b7700b8f958bd54d8e3db06`; the census behind this list is
`trace-reader-census.md`.

## Fields that disappear

| Where | Field | Since | Why it has no producer after the repair |
| --- | --- | --- | --- |
| `Replica CREATE physical worker` INFO log, boundary `participant_release`, outcomes settled, refused, error (`src/node/replica-handler-create-work.js:69-70`) | `releaseHops` | `3ed2d6969` | Its feed (`work.releaseTrace`, `src/node/replica-handler-create-methods.js:643,647`, through `clock.trace` at `src/node/participant-release-client.js:186`) was cut by `b14641752`; it has logged `{}` since. Both lines are removed. |
| `Slow participant release response` INFO log, member `hops` (`src/node/participant-release-diagnostic-observation.js:308-317`) | groups `control_before_pause` and `control_before_resume` (each `{count, slowest, last}`) | `3ed2d6969` | They were written only by the control-owner-first redirects passing `releaseTrace(request), phase` through `requestParticipantRelease` (`src/node/replica-handler-participant-cutover.js:267-269,274-281`). The primitive is two-parameter again, so these requests record nothing. |
| same log, member `joinedHops` of a joined run (`replica-handler-participant-cutover.js:660-664`) | the same two groups, copied from the running record | `3ed2d6969` | Copies of the groups above. |

Groups are created on first write (`recordReleaseHop`,
`participant-release-diagnostic-observation.js:286-292`), and the trace has no
declared list of groups. So no empty or zero group for these phases can
appear: the keys are simply never created.

What stays: `messageId`, `joinedMessageId`, and the groups that the
receiver's own direct requests record, keyed by request action (`inspect`,
`enable`, `pause`, `resume`, `observe_applied_position`;
`replica-handler-participant-cutover.js:65-69,83-85,93-98`).

**Consequence: an empty `hops` record (stage 2e, VERIFIED by reading the
candidate).**
- **New with this repair:** a dependent (non-`sql_transactions`) RELEASE that
  is refused inside control-owner-first now logs `hops: {}`, and every joiner
  of that run logs `joinedHops: {}`.
  - The refusal comes before any cohort request: `runCutoverAttempt` calls
    `releaseControlOwnerFirst` at candidate
    `replica-handler-participant-cutover.js:475`.
  - Its requests to the control owner carry no trace (`:261-263`, `:268-275`).
  - It refuses at `:292-297` (also `:252-255` and `:288-290`).
  - So the bound trace still has no group when the slow-response record is
    written (`participant-release-diagnostic-observation.js:310-316`, at least
    `REQUEST_TIMEOUT_MS` = 5000 ms).
  - Joiners copy the run's `hops` (`:649-652`).

  This record cannot be told apart from "no hop was made". Before the repair the
  same run would have shown the `control_before_pause` group.
- **Already true at the base:** a slow INSPECT or RESUME record always carries
  `hops: {}`. Its trace is created at
  `participant-release-diagnostic-observation.js:302` but bound only for RELEASE
  (`:303`), so nothing can record into it.
- **Unchanged:** a RELEASE refused locally before control-owner-first
  (`replica-handler-participant-cutover.js:472-474`) already logged `hops: {}`
  before this repair.

Removed with them, because nothing feeds them any more:

- the `phase` parameter of `askParticipantRelease` (it always equalled `request.action`);
- the `trace` and `phase` parameters of `requestParticipantRelease`;
- the `phase` parameter of `releaseControlOwnerFirst`;
- its two call arguments `PHASE.CONTROL_BEFORE_PAUSE` and `PHASE.CONTROL_BEFORE_RESUME`;
- the `PARTICIPANT_CUTOVER_PHASE as PHASE` import in `replica-handler-participant-cutover.js`.

Also removed (lead ruling, stage 2b): the constants `CONTROL_BEFORE_PAUSE` and
`CONTROL_BEFORE_RESUME` (`src/partition/partition-participant-transaction-cutover-constants.js:15-16`,
added by `b14641752`), which have no reader after the repair.

## The open owner that planned to use them

`physical-scenario-a-review-repair` (no terminal entry) holds an approved,
unexecuted diagnostic overlay that joins on these records:

- log line 200 (2026-11-26T19:55:52Z): "approved ... diagnostic overlay. Overlay unexecuted; parent owns matched diagnostic launch";
- `evidence/bench-review-owed-three-1929/last-two-copy-timing.json:1178` (`timingWitness`): "Join the sender ack messageId to receiver messageId for control_before_pause and control_before_resume"; the gap it targets is at `:1174`;
- `evidence/bench-review-named-three-1947/tail-comparison.md:25`: "Join messageId to sender last/slowest and consult joinedHops when present".

That overlay could not run as retained even before this repair. Its sender
half (`releaseHops.release.last/slowest`) has had no producer since
`b14641752`. Its patch (`evidence/bench-review-owed-three-1929/selected-release-timing.patch`)
targets `src/node/participant-release-hop-observation.js`, which `d4fd72d5b`
removed. The retained records and findings of that quest (log lines 104 and
111, and 20 `releaseHops` records in three evidence files) are history and
are not affected.

Observing control-before-pause and control-before-resume timing again needs
a decision-neutral trace input admitted by a revised completion contract. That
revision is the participant-release owner's call, in a quest of its own
(ruling 1).

## Left for the navigability and literals repairs of participant-release-diagnostic-observation.js

This repair does not change `src/node/participant-release-diagnostic-observation.js`
(lead ruling, stage 2d). It has no diff against ab347e962, so the commit hook does not
look at it. If the file is staged as it stands, these findings fail the hook:

| Finding | Where (at ab347e962) | Origin | Note |
| --- | --- | --- | --- |
| Duplicate of a shared vocabulary (R06) | private `FIELD.OUTCOME: 'outcome'` and `FIELD.MISSING_FACT: 'missingFact'` (`:44,46`); used at `:137,141,149` | file history | The shared definition now exists: `PARTICIPANT_RELEASE_ANSWER_FIELD` in `src/partition/partition-participant-transaction-cutover-constants.js` (this repair), consumed by `participant-release-client.js`. The file should import it and drop the two private entries. |
| Navigability `identity_keyed_module_state` (no baseline entry under any path) | `const releaseTraces = new WeakMap();` (`:276`) | `3ed2d6969` (then in `participant-release-hop-observation.js`), moved here by `d4fd72d5b` | Its repair is a restructuring of the receiver trace, not a lint fix. Two routes: (a) make the trace explicit: `observeReleaseReceiver` hands the trace to `execute`, `runParticipantCutover` takes it and keeps it in its run record, and the attempt reads it from there. This needs `src/node/replica-handler-lifecycle-methods.js`. (b) Hold the map on its owner, the `ReplicaHandler`, with `bindReleaseTrace(handler, ...)` and `releaseTrace(handler, ...)`, changing about eight call sites in `replica-handler-participant-cutover.js`. Either route needs its own proof that hop records, joined runs and the slow-response log are unchanged. |
| Navigability `alias_exports` (the export without a baseline entry; the baseline holds one alias for this file) | `controlRefusalText as releaseDiagnosticText` (`:323`) | `3ed2d6969` | Behaviour-neutral fix: rename the function to `releaseDiagnosticText` (10 occurrences) and export it directly. Its importer `participant-release-client.js` keeps its import name. The other alias (`safeClockInteger as participantReleaseSafeClockInteger`, `:330`, from `54dd2d7ce`) is the baselined one. |
| Literals (6, not in the baseline) | `'inspectNodeId'` `:90`, `'inspectReplicaId'` `:91`, `'Slow participant release response'` `:311`, `'operationId'` `:313`, `'attemptToken'` `:314`, `'outcome'` `:315` | `:311-315` from `3ed2d6969`; `:90-91` earlier | `'outcome'` is the shared field above. The other five are private to this file: private `FIELD` entries and one message constant, with the same strings (the protocol test matches the message text). |

Measured at stage 2c, where these edits were made and then reverted under the
stage-2d ruling: with all of them except the `WeakMap`, the file had 0 eslint,
0 literals and 1 navigability finding (the `WeakMap`), and reversing the
substitutions gave HEAD's bytes exactly. Outputs are in the coordination dir
under `lab/r1-main-red-stage2c/`.
