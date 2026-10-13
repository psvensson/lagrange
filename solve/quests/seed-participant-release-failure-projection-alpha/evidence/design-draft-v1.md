# Seed release failure projection: Quest design draft V1

## Status and input

This is design input only. It does not authorize implementation, a timeout or
retry change, a startup repair, metadata regeneration, or a lab run.

The input is the reviewed C2/recovery composition candidate
`6c27b10b6f3c8093f4baab149f20b6a79524aecf`, whose C2 parent is
`406ceac1c40bdf57da1a6668806d0f3b38526cb9` and recovery parent is
`f6c48301221877c534a3f669f5a91a7a8a1edd29`. The retained same-host
intersection shows current existing-origin recovery green while fresh-seed
startup remains red before its intended bodies.

## Proposed Quest statement

Project the terminal fresh-seed participant-release failure from its existing
owners so an exhausted release names its position in the one serialized seed
budget, the first canonical cohort member and work vector that the current drain
owner found blocked, and whether the caller joined an older same-build cutover
attempt. Preserve fresh-seed authorization, one shared deadline, typed outcomes,
retry cadence, cutover single-flight, drain classification, pause/admission,
startup success/failure, and shutdown. Emit no new healthy-path log and add no
second drain predicate, fallback, release policy, timeout, or durable state.

Suggested ID: `seed-participant-release-failure-projection-alpha`.

## Existing shape is sufficient

No new protocol, logger, event, outcome, or public classifier is needed.

- `src/partition/partition-participant-release-contract.js:176-179` already
  defines the deep-frozen release answer as the typed outcome plus optional
  owner-supplied fields. Existing query-drain refusals and the DRAIN action
  already use that extension surface.
- `src/bootstrap/bootstrap-service-seed-workflow.js:294-296` already serializes
  the terminal release answer into the seed failure, and lines 560-585 already
  publish that failure through the existing phase-failure logger/events.
- The missing evidence is caused by projection loss: aggregate cutover drops
  the blocked census member; the single-flight record stores only build and
  promise; the seed workflow reports partition and answer but not its position
  in the shared budget.

The implementation boundary therefore needs only optional failure fields on
the existing answer/error surfaces. It must not change
`releaseAnswer`, the transport grammar, logger selection, or startup error code.

## Exact production owner paths

Only these two paths should require behavior-neutral projection code:

1. `src/node/replica-handler-participant-cutover.js`
   - At the existing `DRAIN_PENDING` branch, select the first blocked entry
     using the already imported canonical `isReleaseDrained`; project its
     `generation.nodeId`, `generation.replicaId`, and exact `work` object.
     Evaluate no locally copied condition and do not retain the whole census.
   - Extend the existing per-handler/per-partition `RUNS` record with the
     handler-clock start time and original trigger. When a same-build caller
     joins and the shared attempt returns a failure, project `joined: true`,
     original trigger, and nonnegative handler-clock age onto that caller's
     terminal answer. A successful answer carries no diagnostic projection.
   - Keep the same map key, promise, invalid mixed-build refusal, and `finally`
     deletion. The projection must not prolong or replace the joined promise.
2. `src/bootstrap/bootstrap-service-seed-workflow.js`
   - On the existing terminal throw only, include the seed owner's same-clock
     budget projection: service ordinal and total, already cut-over count,
     attempt count, release-loop start, deadline, failure time, and remaining
     milliseconds. Keep the existing final answer unchanged beside it.
   - Read time only through the existing `nodeService.getTimeSource()` owner.
     Do not emit per-service or per-retry logs.

Read-only authorities that must remain byte-for-byte semantic owners unless an
independent design revision proves otherwise:

- Authorization: `src/node/participant-release-authorization-owner.js`.
- Request deadline shaping: `src/node/participant-release-client.js`.
- Drain facts and sole predicate:
  `src/partition/partition-participant-release-facts.js`.
- Release identity/census/outcome envelope:
  `src/partition/partition-participant-release-contract.js`.
- Pause and final OPEN mutation:
  `src/partition/partition-participant-transaction-pause.js`.
- Held-runtime continuation and shutdown:
  `src/node/replica-handler-release-recovery.js` and
  `src/node/replica-runtime-cleanup-custody.js`.
- Startup phase error publication:
  `src/bootstrap/pipeline/startup-pipeline-runner.js` and the existing
  phase-failure block in `bootstrap-service-seed-workflow.js`.

## Binary receipts

1. **`terminal-seed-budget-projected`**: a real fresh-seed failure contains
   safe integers for ordinal, total, released count, attempt count, start,
   deadline, failure time, and remaining time from the seed owner's one clock;
   ordinal/total identify the terminal service and the existing typed answer is
   unchanged. Reverting the seed projection with identical witness bytes loses
   this receipt.
2. **`canonical-first-blocked-work-projected`**: a real aggregate
   `DRAIN_PENDING` answer names exactly one current census member and copies its
   canonical `work` object. The witness imports `isReleaseDrained` from its
   owner and proves that object is not drained; it contains no copied drain
   expression. Reverting the cutover projection loses this receipt.
3. **`joined-attempt-lifetime-projected`**: two same-build requests for one
   partition still execute one cutover promise. Only the joining caller's
   failure names the original trigger and nonnegative handler-clock age. The
   RUNS entry disappears through the existing `finally`, a later request starts
   fresh, and mixed-build refusal is unchanged. Reverting the projection loses
   the join evidence while retaining the same one-attempt behavior.
4. **`healthy-path-and-policy-unchanged`**: successful release answers and
   successful seed services carry no new diagnostic object and emit no new log;
   authorization, timeout constants, retry cadence, service ordering, outcome,
   admission, release identity, and startup result are unchanged. Existing
   release/recovery controls pass at their original bounds.
5. **`real-startup-red-explained-not-waived`**: on one locked same-host run,
   the existing claim-cache or bootstrap property still records its honest
   result. If red, its terminal error includes the bounded projection; the red
   is not counted green. If it reaches the intended body, that is recorded as a
   behavior change requiring separate diagnosis, not as diagnostic-Quest
   acceptance.
6. **`scope-static-and-source-revert`**: exact diff contains only the two
   production projection owners and approved assertions in existing witness
   files; no constant/baseline/budget/metadata hand edit. Syntax, exact ESLint,
   size/complexity/duplication, dependency, guideline, shard, and impact checks
   pass or retain separately attributed baseline debt. An identical-test
   source-only revert fails receipts 1-3.

## Narrow falsifying witnesses

- `test/partition/participant-release-protocol.test.js`
  (`de77149e3070c6cc42bd566e1f54c6ad3d676809be90008592caee18e0ec00a9`
  at the design input): extend the existing real registered-handler fixture,
  without a new helper, with two synchronous calls to the actual cutover owner
  for two same-build requests whose handler-clock deadline is already exhausted.
  Give the calls distinct existing triggers. The second call must join the
  first promise before its microtask settles and report the first trigger and
  age; a later call proves the RUNS record was removed. Preserve unchanged
  mixed-build refusal and assert absence of diagnostics on the existing
  successful release. This exercises lifetime and failure projection without
  fake Raft state, a sleep, or another release algorithm. Use the canonical
  drain owner for any blocked-work assertion.
- `test/integration/message-group-membership-claim-cache.integration.test.js`
  (`cacf237059ee99f449ca938691e0df80b8b587e9594acb4dca5a84506c32b70a`):
  unchanged real 1-second shared-deadline consumer on `adam-laptop`. Its
  retained timing marks distinguish failure before the T1 body. Capture the
  terminal failure projection as raw evidence; do not invert its success
  assertion or make the red expected.
- `test/bootstrap/node-bootstrap-consistency.property.test.js`
  (`df78abc52898eb758433956a84cf459ca80ebfd27da7e3b08b43bb1dc45ddab3`):
  unchanged real 5-second shared-deadline consumer on `adams-gamla`. Preserve
  the three original startup assertions, 23-leaf authority witness and other
  fixture controls. Capture one terminal drain projection and any deadline
  projection; do not treat downstream HTTP 503 as body engagement.
- `test/node/replica-handler-release-recovery.test.js`
  (`979653087fdee7931ac1d9caaab57dd18685153296ed271a851210fdf0435f76`):
  unchanged regression witness that held-runtime cadence, current-object
  lifetime, shutdown joining and healthy event-driven behavior are unaffected.

The focused protocol assertion and the two real startup outputs are the
falsifiers. A file-absence or string-only check is insufficient. The startup
files may remain red because this Quest explains rather than repairs their
owner failure.

## Impact analysis before implementation

| Concern | Required preservation and review question |
| --- | --- |
| Authority | Diagnostic fields are observations only. They cannot satisfy fresh-seed authorization, validate a release, select a leader, resume admission, or turn a refusal into success. Verify no consumer branches on them. |
| Serialized deadline | The single deadline remains created once before the sorted 138-service loop. Projection reads the existing clock only on the terminal path; it cannot restart, partition, extend, or convert the deadline. Verify counters do not add waits or per-service logging. |
| Joined attempt lifetime | Start time and original trigger live only in the existing RUNS record and die with its existing `finally`. Verify no new promise, timer, map key, strong handler reference, retry, or shutdown wait. Joining still shares the original attempt; mixed-build still refuses. |
| Drain owner | `isReleaseDrained` remains the sole classifier over the canonical facts work vector. The cutover branch identifies the first entry using that function and copies its existing work object. Tests import the owner function; no production or test copy of the predicate is allowed. |
| Failure shaping | Typed `outcome`, `releaseId`, `partitionId`, `phase`, retry and missing-fact fields remain unchanged. Optional diagnostics must be bounded and deep-frozen through the current answer. Existing transport classifiers must ignore them. |
| Startup error reporting | Reuse the current terminal Error and phase-failure logger/event. Add no healthy log and no per-attempt stream. Preserve error code and bootstrap success semantics. Project only IDs, counters, timestamps, trigger, and the work vector; never SQL values, transaction payloads, authorization tokens, or a full census. |

## Claim ceiling

This Quest could prove that current seed-release failures are observable at
their existing owners. It cannot prove startup repaired, justify a larger
deadline, authorize parallel release, change held recovery, close C2/recovery
integration, certify the corpus, or identify a root cause until the projected
evidence is measured.
