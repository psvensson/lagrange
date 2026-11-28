# Release hop trace: producers, readers and dependants at ab347e962

Stage-1 census for `participant-release-completion-contract-restoration`
(brief `r1-main-red-release-completion.md`, points 2-4). All `path:line`
citations are at `ab347e9625a64ed24b7700b8f958bd54d8e3db06`. VERIFIED = read
in code or history, or measured; INFERRED = reasoned, not measured. Search
method: `git grep` over the whole tracked tree (src, test, scripts, docs,
architecture, solve) for `releaseHops`, `joinedHops`, `joinedMessageId`,
`Slow participant release response`, `releaseTrace`, `bindReleaseTrace`,
`recordReleaseHop`, `observeReleaseReceiver`, `control_before_pause`,
`control_before_resume`, `participant-release-hop-observation`,
`Replica CREATE physical worker`, `clock.trace`, `options.trace`, `trace: `,
the word `hops`, and every caller of `askParticipantRelease`,
`requestParticipantRelease`, `completeParticipantRelease`,
`releaseFreshCreate` and `runParticipantCutover`. The census is complete
for the tracked tree. It does not cover untracked lab logs outside the
repository.

## 1. One mechanism, two trace objects

`recordReleaseHop(trace, phase, hop)` keeps per phase a count, the slowest
and the last hop (`src/node/participant-release-diagnostic-observation.js:286-292`).
The only writer is `askParticipantRelease`, and it writes only when a trace
is passed (`src/node/participant-release-client.js:124,133,141-146,150-152`).
`phase` defaults to `request.action` (`participant-release-client.js:124`).
Two different trace objects reach it. VERIFIED.

| Trace | Created | Fed into `askParticipantRelease` by | State at ab347e962 |
| --- | --- | --- | --- |
| CREATE-side (sender) | `work.releaseTrace = {hops: {}}`, `src/node/replica-handler-create-methods.js:643` | `trace: work.releaseTrace` passed to `releaseFreshCreate` (`replica-handler-create-methods.js:647`), then `{now, sleep, trace}` to the completion, then `clock.trace` (`participant-release-client.js:186`) | Dead. `releaseFreshCreate` passes `{now, sleep}` only (`src/node/replica-handler-release-recovery.js:437-439`) since `b14641752`. The seed passes `{now, sleep}` (`src/bootstrap/bootstrap-service-seed-workflow.js:330-334`). `clock.trace` is always `undefined` and `hops` stays `{}`. |
| Receiver-side | `observeReleaseReceiver` makes `{messageId: envelope.messageId, hops: {}}` for RELEASE, INSPECT and RESUME and binds it to a RELEASE request (`participant-release-diagnostic-observation.js:294-303`, wired at `src/node/replica-handler-lifecycle-methods.js:182`); `runParticipantCutover` makes `{messageId: null, hops: {}}` when none is bound, i.e. for background recovery (`src/node/replica-handler-participant-cutover.js:670-671`, caller `replica-handler-release-recovery.js:314`) | Cohort reads and actions pass it directly: `readCohort` (`replica-handler-participant-cutover.js:65-69`, from `:196-197`, `:508-509`, `:556-557`), ENABLE (`:83-85`), `actOnCohort` for PAUSE, RESUME and OBSERVE_APPLIED_POSITION (`:92-99`); the attempt is bound to it at `:502`. The control-owner-first redirects pass `releaseTrace(request), phase` through `requestParticipantRelease` (`:267-269`, `:274-281`), with phase `control_before_pause` or `control_before_resume` (`:126-131`, `:481-486`; values at `src/partition/partition-participant-transaction-cutover-constants.js:15-16`). | Live. |

Callers of the primitives (VERIFIED, complete for `src`):
`requestParticipantRelease` is called by the completion (`participant-release-client.js:186`),
the operator request with two arguments (`replica-handler-release-recovery.js:457-459`)
and the two receiver redirects (`replica-handler-participant-cutover.js:267,274`).
`askParticipantRelease` is called by `requestParticipantRelease`
(`participant-release-client.js:162,165`) and by the receiver directly with
four arguments, never with a `phase` (`replica-handler-participant-cutover.js:66,83,93`).
`completeParticipantRelease` has exactly the seed and fresh CREATE callers.

## 2. Readers

| Reader | Reads | Kind | Evidence |
| --- | --- | --- | --- |
| R1 `Replica CREATE physical worker` log at boundary `participant_release` (settled, refused, error) | `releaseHops: request.releaseTrace?.hops` | production INFO log | `src/node/replica-handler-create-work.js:56-73` (member at `:69-70`), called through `measureCreateStage` (`:75-87`) from `replica-handler-create-methods.js:644`. At ab347e962 it always logs `releaseHops: {}`. VERIFIED |
| R2 `Slow participant release response` log | `...trace`: `messageId`, `hops` (every phase, including `control_before_pause` and `control_before_resume`), and for a joined run `joinedMessageId`, `joinedHops` | production INFO log, only when the receiver spent at least `REQUEST_TIMEOUT_MS` = 5000 ms on a RELEASE, INSPECT or RESUME | `participant-release-diagnostic-observation.js:308-317`; constant at `partition-participant-transaction-cutover-constants.js:52`. VERIFIED |
| R3 joined run | copies the running record's `trace.messageId` and `trace.hops` into the joiner's trace as `joinedMessageId`, `joinedHops`, which R2 then logs | in-process | `replica-handler-participant-cutover.js:660-664`, record at `:674`. VERIFIED |
| R4 test `fresh CREATE ...` cases | `trace.hops.release.count` and `.last.messageId` of a trace passed as `releaseFreshCreate`'s `trace` option | test assertion on the CREATE-side trace | `test/node/participant-release-fresh-create-completion.test.js:70,78-82,89-90`. See section 4. VERIFIED |
| R5 test `slow registered RELEASE responses identify the shared transport request only for a real join` | `messageId` and `joinedMessageId` of R2 (not `hops`) | test assertion on the receiver-side trace | `test/partition/participant-release-protocol.test.js:109-115,598-631`. Green at ab347e962 (22/22). Unaffected by the repair: neither field depends on the completion or the redirects. VERIFIED (reading); INFERRED for the repaired tree until it is run |
| none | no harness, script, check, generator, guideline or contract parses `hops`, `releaseHops`, `joinedHops`, R1 or R2 | | `git grep` over `test/distributed`, `scripts`, `docs`, `architecture`, `test/guidelines`: no hit. VERIFIED |

## 3. Retained evidence and the open owner (`physical-scenario-a-review-repair`)

The quest has no terminal entry (last entry: verification, 2026-11-28T06:54Z).
Its `quest.json` and `evidence/receipt.json` contain no hop, trace or
control-phase term. VERIFIED.

- CREATE-side records. `releaseHops` appears in 20 retained `Replica CREATE
  physical worker` records:
  `evidence/bench-review-owed-three-1929/last-two-copy-timing.json` (2),
  `evidence/bench-review-named-three-1947/tail-copy-timing.json` (6),
  `evidence/bench-repeat-named-three-1954/matched-tail-discharge.json` (12).
  They were produced by builds that still had the feed: `a723f28f1` (1929)
  and `f8d839662` (1947) both contain `3ed2d6969`, lack `b14641752` and pass
  `trace: options.trace` in `releaseFreshCreate`; the 1954 file names no
  build, but all 12 of its records are non-empty, which requires the feed.
  They are history (R21) and
  stay valid as records of those runs. Nothing reads them programmatically.
  VERIFIED.
- Receiver-side records in findings. Log line 104 (2026-11-26T17:05:29Z)
  counts and times `Slow participant release response` IDs from the `3d1`
  node logs; log line 111 (17:12:46Z) compares "starter hop vectors" and
  `joinedHops` across three runs. Retained history, unaffected. VERIFIED.
- An approved, unexecuted diagnostic that names the redirect records. Log
  line 200 (19:55:52Z): "Independent source and raw evidence review ...
  approved ... diagnostic overlay. Overlay unexecuted; parent owns matched
  diagnostic launch." The overlay is
  `evidence/bench-review-owed-three-1929/selected-release-timing.patch`. Its
  stated use (`last-two-copy-timing.json:1178`, `timingWitness`): "Join the
  sender ack messageId to receiver messageId for control_before_pause and
  control_before_resume"; also `evidence/bench-review-named-three-1947/tail-comparison.md:25`
  ("Join messageId to sender last/slowest and consult joinedHops when
  present"). The open gap it targets is recorded at
  `last-two-copy-timing.json:1174`: "Control-before-pause vs
  control-before-resume and per-member time are unobserved." VERIFIED.
  This plan needs both traces. At ab347e962 it can no longer be executed as
  retained: its sender half (`releaseHops.release.last/slowest`) has been
  unfed since `b14641752`, and the patch targets
  `src/node/participant-release-hop-observation.js`, which `d4fd72d5b`
  removed (log line 224). VERIFIED. Whether the owner still intends to run
  it is not recorded. NOT KNOWN.

## 4. Tests that assert the trace (reported before any change)

- `test/node/participant-release-fresh-create-completion.test.js:70,78-82,89-90`.
  Origin: `3ed2d6969` (2026-11-26 16:27, "WIP: trace participant release
  and exercise loss of a schema job owner"; owner
  `physical-scenario-a-review-repair`). The file is a witness of the sealed
  `participant-release-completion-owner`; its sealed-era form is `3343a640a`
  (last earlier change `3c0b6f2e6`, 2026-11-20). Measured at ab347e962:
  **red, 6 of 7 fail** with `TypeError: Cannot read properties of undefined
  (reading 'count')` at `:89`. It has been red since `b14641752` removed the
  feed, i.e. it is a fourth pre-existing red on main. The `3343a640a` form of
  the file, run unmodified against ab347e962 `src` from a scratch copy:
  **7 of 7 pass**. So the trace assertions are its only red cause, and the
  brief's "must stay green unmodified" cannot hold for this file under any
  repair that leaves the trace unfed. VERIFIED.
- `test/partition/participant-release-protocol.test.js:598-631` (R5). Origin
  `3ed2d6969`. Asserts receiver `messageId` and `joinedMessageId` only; green;
  case (ii) does not touch what it reads. VERIFIED (reading).

## 5. What each repair step removes, and the decision it forces

1. Restoring the two-parameter `requestParticipantRelease` (required by
   `REQUEST_CONTRACT`, `scripts/participant-release-completion-audit.js:111-118`)
   by itself stops the receiver redirects from recording hops: the arguments
   at `replica-handler-participant-cutover.js:269,281` become extra arguments
   that JavaScript drops. The `control_before_pause` and
   `control_before_resume` groups then vanish from R2 and R3. Keeping them
   would require either a trace parameter on the primitive (a revision of the
   sealed contract, case (i)) or a second redirect path (forbidden, R11).
   VERIFIED (reading).
2. Brief point 2 stop condition: a live production reader (R2, at INFO, above
   5000 ms) and an approved, unexecuted diagnostic plan of the open owner
   (section 3) use the redirect hop records. No sealed witness depends on
   them. **Decision for the lead: drop these records (case (ii)) or revise
   the contract (case (i)).**
3. CREATE-side plumbing (`replica-handler-create-methods.js:643,647`,
   `replica-handler-create-work.js:69-70`, `clock.trace` at
   `participant-release-client.js:186`): no live producer; readers are R1
   (always `{}`) and R4 (red). Retained records stay as history.
4. `askParticipantRelease(owner, nodeId, request, trace, phase)`: `trace` stays
   (fed by the receiver at `:66,83,93`; read by R2 and R3). After steps 1 and 2
   no caller passes `phase`, so it always equals `request.action` and is
   removed as an unfed parameter. INFERRED until implemented.

## 6. Baseline measurements at ab347e962 (unchanged tree)

| Check | Result | Output (coordination dir `lab/r1-main-red-stage1/`) |
| --- | --- | --- |
| `node scripts/checks/participant-release-completion-contract-probe.js --metric` | `1`, exit 1 | |
| `node scripts/solve.js probe --id participant-release-completion-contract-restoration --json` (draft) | metric 1, target 0, measuring, not done | `solve-probe-base.json` |
| decision boundaries, unrelated file | 1 violation (`participant_release_completion_contract`), exit 1 | `decision-boundaries-unrelated-base.txt` |
| decision boundaries, `src/node/participant-release-client.js` | 2 (`local_retry_loop` at `:184` and the contract), exit 1 | `decision-boundaries-owner-base.txt` |
| `test/scripts/participant-release-completion-owner.test.js` (sealed) | 10/13, failing 1, 3, 8 | `completion-owner-sealed-base.txt` |
| same sealed test, unmodified, over a scratch tree with only the four owner edits reverted (run from the worktree root) | 13/13 | `completion-owner-sealed-scratch-reverted-owner.txt` |
| `test/node/participant-release-fresh-create-completion.test.js` | 1/7 | `fresh-create-completion-base.txt` |
| its `3343a640a` form against ab347e962 `src` (scratch) | 7/7 | `fresh-create-completion-pretrace-form-vs-head.txt` |
| `test/bootstrap/seed-participant-release-failure-projection.test.js` | 9/9 | `seed-participant-release-failure-projection-base.txt` |
| `test/partition/participant-release-protocol.test.js` | 22/22 | `participant-release-protocol-base.txt` |
| `node scripts/check-complexity.js --scoped` on the five writable `src` files | `askParticipantRelease` 13, `traceCreateWorker` 14 (and five older identities) | `complexity-scoped-base.txt` |
| audit per commit (HEAD's audit over each commit's sources) | `3343a640a` 0, `3ed2d6969` 2, `4964244da` 2, `b14641752` 1, `15a0be14e` 1, `ea6bd6861` 1, `d4fd72d5b` 1, `1b021c220` 1, `807cc016d` 1, `d254a75a6` 0, `ab347e962` 1 | |
