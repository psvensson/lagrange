# Seed release failure projection: Quest design draft V2

## Status and input

This supersedes V1 as design input while preserving
`seed-diagnostic-design-draft-v1.md` unchanged. It does not authorize
implementation, a timeout or retry change, a startup repair, metadata work, or
a test or lab run.

The input is the reviewed C2/recovery composition candidate
`6c27b10b6f3c8093f4baab149f20b6a79524aecf`, with C2 parent
`406ceac1c40bdf57da1a6668806d0f3b38526cb9` and recovery parent
`f6c48301221877c534a3f669f5a91a7a8a1edd29`. Retained same-host evidence shows
existing-origin recovery green while fresh-seed startup still fails before the
intended claim-cache/bootstrap bodies. The terminal answers vary between
aggregate `release_drain_pending` and later `release_deadline`, so the terminal
answer alone cannot distinguish blocked work from an old joined attempt or
shared-budget exhaustion.

## Proposed Quest statement

On a failed fresh-seed participant release, preserve and project three bounded
owner observations: the first canonical cohort member found not drained, the
first same-build attempt that the seed caller joined, and the failing service's
position and spend in the existing serialized seed budget. A later
client-shaped `release_deadline` must remain the terminal typed answer but must
not overwrite either earlier observation. Preserve the current fresh-seed
authorization, one shared deadline, retry cadence, cutover single-flight,
drain predicate, admission transitions, attempt cleanup, startup result, and
shutdown.

Suggested ID: `seed-participant-release-failure-projection-alpha`.

This Quest adds failure-only projection. It adds no release policy, drain
predicate, retry, timeout, healthy-path log, durable state, or recovery owner.

## Exact production boundary

Only these two production paths are proposed.

### `src/node/replica-handler-participant-cutover.js`

1. Replace the aggregate branch's current `census.some(...)` with one
   canonical selection:

   ```js
   const blocked = census.find((facts) => !isReleaseDrained(facts.work));
   if (blocked !== undefined) {
     // existing DRAIN_PENDING refusal, with the bounded projection below
   }
   ```

   The same `blocked` entry supplies both the refusal decision and the optional
   failure projection. The branch must not evaluate `isReleaseDrained` a
   second time, copy its expression, retain the full census, or infer a
   different drain state.

2. The `DRAIN_PENDING` answer may add exactly one bounded observation:

   ```text
   blockedDrain = {
     generation: {
       nodeId, ownerIncarnation, replicaId, lifecycleIncarnation,
       runtimeGeneration, connectionGeneration, admissionGeneration
     },
     work: {
       sqliteTransactionOpen, participantStaging, participantPrepared,
       proposals, pendingOutcomes, appliedIndex, commitIndex, lastIndex
     }
   }
   ```

   These are the full canonical `GENERATION_FIELDS` identity and the existing
   canonical work vector from that one census entry. Omitting a generation
   field would make the observation ambiguous across an owner, lifecycle,
   runtime, connection, or admission replacement. Membership, term, routing,
   origin, query census, SQL values, payloads, and the rest of the cohort are
   unnecessary to identify this observation and stay excluded.

3. Extend the existing `RUNS` record only with the starter's handler-clock
   start instant and a bounded original trigger. The start instant remains
   internal; it is never emitted. The trigger is retained only when it equals
   one of the existing fixed `PARTICIPANT_RELEASE_TRIGGER` string values;
   otherwise the diagnostic value is `null`. Never retain or echo an arbitrary
   request value, object, accessor, or string. A same-build joining caller:

   - captures `joinAgeMs = nowAtJoin - startedAt` immediately before awaiting;
   - awaits the exact stored `current.promise`;
   - on a failed shared answer only, returns a caller-specific optional
     `joinedAttempt` containing `originalTrigger`, `joinAgeMs`, and
     `terminalAgeMs`;
   - captures `terminalAgeMs = nowAfterSettlement - startedAt` after that same
     promise settles and proves `terminalAgeMs >= joinAgeMs >= 0`.

   Both ages are finite nonnegative safe-integer relative durations from the
   handler's existing clock. `joinAgeMs` records how old the attempt already
   was when this caller joined; `terminalAgeMs` records its age when the caller
   observed failure. Neither value is a deadline, retry delay, timeout input,
   nor reason to keep the attempt alive.

   Project the join diagnostic with one use of the existing `releaseAnswer`
   freezing surface. The projection starts from the settled owner answer and
   preserves that answer's `outcome`, `releaseId`, `partitionId`, `phase`, and
   every optional owner field byte-for-value; it must not reconstruct those
   fields from the joining request. A witness compares the projected response
   with the settled answer after removing only `joinedAttempt`.

4. The stored promise and map lifetime remain exactly current. The starter
   creates and stores one `runCutoverAttempt` promise; a joiner may await it but
   must not wrap or replace `record.promise`, insert another map entry, change
   the map key, install a timer, or participate in deletion. The starter's
   existing identity-checked `finally` remains the only cleanup. Mixed-build
   refusal remains immediate and unchanged. A successful shared answer is
   returned without diagnostic fields.

### `src/bootstrap/bootstrap-service-seed-workflow.js`

For each service, before its existing retry loop, hold two write-once local
slots: `firstBlockedDrain` and `firstJoinedAttempt`. After each typed answer,
populate an empty slot only from that answer's corresponding owner projection.
Never overwrite a populated slot. Thus a subsequent retry may terminate with
`release_deadline` while the earlier blocked-work or joined-attempt evidence
survives beside the unchanged final answer.

On the existing terminal throw only, add one bounded `seedRelease` object:

```text
seedRelease = {
  budgetMs,
  elapsedMs,
  remainingMs,
  ordinal,
  total,
  completed,
  attemptCount,
  firstBlockedDrain,
  firstJoinedAttempt
}
```

- `budgetMs` is the unchanged `leadershipWaitTimeoutMs` used to create the one
  existing release-loop deadline.
- `elapsedMs` is the nonnegative safe-integer difference between terminal
  observation and release-loop start on the existing seed clock. It may exceed
  `budgetMs`; hiding overspend would discard evidence.
- `remainingMs` is the nonnegative safe-integer
  `max(0, deadline - terminalObservation)`. Zero reports exhaustion and is not
  converted into a new deadline.
- `ordinal` is the failing service's one-based position in the already sorted
  list; `total` is that list's fixed length; `completed` is the number of prior
  services that reached `CUT_OVER`; `attemptCount` counts this service's
  existing requests.
- The two `first...` fields are either `null` or the first immutable projection
  observed during this service's current retry loop. They are not arrays,
  histories, or mutable accumulators.

No absolute start, deadline, join, failure, or wall-clock timestamp is emitted.
No new read, wait, per-attempt log, or per-service success log is added. The
existing final `answer` remains intact next to `seedRelease` in the thrown
error.

## Owners that remain unchanged

- Fresh-seed authority:
  `src/node/participant-release-authorization-owner.js`.
- Request transport and deadline shaping:
  `src/node/participant-release-client.js`.
- Canonical facts and sole drain predicate:
  `src/partition/partition-participant-release-facts.js`.
- Release identity, generation comparison, answer freezing, and census rules:
  `src/partition/partition-participant-release-contract.js`.
- Pause and final admission mutation:
  `src/partition/partition-participant-transaction-pause.js`.
- Existing-origin continuation and cleanup:
  `src/node/replica-handler-release-recovery.js` and
  `src/node/replica-runtime-cleanup-custody.js`.
- Startup phase error publication:
  `src/bootstrap/pipeline/startup-pipeline-runner.js` and the existing seed
  workflow failure block.

Any change to authority, serialized-release policy, accepted work, drain
classification, deadline ownership, retries, admission, recovery cadence, or
shutdown is a separate owner-boundary Quest and is out of scope.

## Binary receipts

1. **`one-canonical-blocked-entry`**: the aggregate branch calls
   `census.find` once with imported `isReleaseDrained`; the selected entry both
   causes `DRAIN_PENDING` and supplies `blockedDrain`. A source-only revert
   loses the projection. A copied predicate, `some` plus `find`, or full-census
   retention fails the receipt.
2. **`first-observations-survive-terminal-deadline`**: a deterministic seed
   retry sequence observes a projected blocked drain and/or joined attempt,
   then terminates with the existing typed `release_deadline`; the terminal
   answer remains the deadline answer and each write-once slot retains its
   first value. Replacing either value with a later value, accumulating a
   history, or treating the red as success fails the receipt.
3. **`relative-seed-budget-only`**: a terminal seed failure reports safe
   scalar `budgetMs`, `elapsedMs`, `remainingMs`, `ordinal`, `total`,
   `completed`, and `attemptCount`; it reports no absolute timestamp. The
   original service order, one deadline, retry delays, and bounds are
   unchanged.
4. **`older-joined-attempt-on-same-promise`**: a joining caller enters after a
   real started attempt has been held and the injected handler clock has
   advanced. Its failed answer has `joinAgeMs > 0` and
   `terminalAgeMs >= joinAgeMs`, while the starter has no join projection.
   `originalTrigger` is one fixed existing trigger value or `null`. Both
   observe the same failed owner attempt; mixed-build behavior and a later
   fresh attempt remain unchanged.
5. **`promise-lifetime-unchanged`**: instrumentation or a narrow source seam
   proves one stored promise for the two same-build callers and starter-owned
   identity-checked deletion. No caller replaces the stored promise, extends
   cleanup, or adds a shutdown obligation. Removing only `joinedAttempt` from
   the joiner's projected answer yields the exact settled owner answer,
   including all identity and optional fields.
6. **`healthy-path-and-authority-unchanged`**: successful release and seed
   paths carry no new diagnostic object and emit no new log. Fresh-seed
   authorization, origin, release identity, admission, typed outcomes,
   startup result, and shutdown stay under their existing owners.
7. **`real-startup-red-remains-honest`**: the retained claim-cache/bootstrap
   witness reports its actual result at unchanged bounds. A red with projection
   remains red; reaching the intended body is a separate behavioral result,
   and neither is Quest closure by itself.
8. **`scope-static-and-source-revert`**: exact approved changes are limited to
   the two projection owners and bounded assertions in existing witnesses.
   Syntax, exact ESLint, size, complexity, duplication, dependency, guideline,
   shard, and impact checks are measured without baseline increase. Inherited
   static reds remain explicitly attributed and the Quest remains HOLD; a
   source-only revert with identical witness bytes loses receipts 1-5.

## Narrow falsifying witnesses

### Real aggregate drain plus older join

Bound additions to
`test/partition/participant-release-protocol.test.js`, using its existing real
`PartitionService`, registered `ReplicaHandler`, in-process transport, operator
release owner, and controllable consensus port:

1. Perform the existing real operator release and require `CUT_OVER`, so the
   participant is legitimately admitted and has a durable origin.
2. Install the established controllable-port proposal handler that captures
   but does not commit one real ordinary write. Start `executeQuery`, wait for
   the actual proposal, prove the write is unsettled, the row is absent, and
   the production proposal queue owns one pending proposal. Do not assign
   queue, work, pause, origin, membership, or release facts.
3. Gate the existing committed-membership handler for the next real cutover
   read, using the same bounded continuation pattern already exercised by
   `test/node/replica-handler-release-recovery.test.js`. Start the first
   operator release and wait until that owner read is actually entered.
4. Advance a handler-only `VirtualTimeSource` by one fixed millisecond, then
   issue the second same-build operator release. The deadline remains ample;
   neither request starts expired. Release the membership gate.
5. Require both requests to observe aggregate `DRAIN_PENDING`. The starter's
   answer contains the blocked projection and no join projection. The joiner's
   answer contains the same blocked generation/work observation, the fixed
   first trigger, `joinAgeMs > 0`, and `terminalAgeMs >= joinAgeMs`. Removing
   only `joinedAttempt` must make it deeply equal to the starter's settled
   answer, pinning `outcome`, `releaseId`, `partitionId`, `phase`, retry fields,
   and every optional owner field. Import `isReleaseDrained` and prove the
   projected work is not drained; specifically prove the projected proposal
   count reflects the actual pending proposal.
6. Commit the captured proposal through the controllable port and await the
   original write. Restore the gated handler in `finally`. A later real
   operator release must start fresh and reach the existing successful result
   without join diagnostics. Teardown remains the fixture's existing bounded
   owner shutdown.

This witness engages actual aggregate drain work and an already-old attempt.
Two calls against an already-expired deadline in one microtask are explicitly
insufficient: they may prove neither blocked work nor a positive join age.

### Seed retention and current consumers

- Add only a bounded seed-workflow failure projection assertion in an existing
  bootstrap test seam that can provide a typed sequence: first a projected
  `DRAIN_PENDING`, then the current `release_deadline`. It must assert the final
  answer is still the deadline answer, the first observation is retained once,
  and all relative counters are exact. It must not duplicate release policy or
  turn the production startup red into an expected pass.
- Keep
  `test/integration/message-group-membership-claim-cache.integration.test.js`
  and the three original cases in
  `test/bootstrap/node-bootstrap-consistency.property.test.js` unchanged as
  real startup consumers. Their raw same-host outcomes show whether the new
  projection explains the existing setup failure; they do not certify repair.
  In particular, a dependent release may surface only the outer
  `current_control_owner_fact` from `releaseControlOwnerFirst`; the proposed
  aggregate projection does not expose the discarded inner control answer and
  cannot claim to explain that nested failure.
- Keep `test/node/replica-handler-release-recovery.test.js` as the unchanged
  regression witness for held-runtime cadence, attempt lifetime, and bounded
  shutdown.

Design-input hashes:

- participant release protocol:
  `de77149e3070c6cc42bd566e1f54c6ad3d676809be90008592caee18e0ec00a9`
- claim-cache integration:
  `cacf237059ee99f449ca938691e0df80b8b587e9594acb4dca5a84506c32b70a`
- bootstrap property:
  `df78abc52898eb758433956a84cf459ca80ebfd27da7e3b08b43bb1dc45ddab3`
- release recovery:
  `979653087fdee7931ac1d9caaab57dd18685153296ed271a851210fdf0435f76`

## Impact review before implementation

| Concern | Preservation question |
| --- | --- |
| Authority | Can any diagnostic field authorize a release, validate a token, select a leader, resume admission, or turn a refusal into success? The required answer is no. |
| Serialized deadline | Is the deadline still created once before the sorted service loop, with no restart, split, parallel release, extra wait, or budget increase? |
| First-observation custody | Are the two slots local, write-once, bounded, and retained only for the current failing service across its existing retries? Can a later deadline answer leave them intact without changing that answer? |
| Joined attempt lifetime | Does the joiner await the exact stored promise while starter-owned `finally` alone deletes the record? Are `joinAgeMs` and `terminalAgeMs` observations only? |
| Drain owner | Does one `find` call to imported `isReleaseDrained` both decide and project the same census entry? Is there any copied or repeated drain classification? |
| Generation/work identity | Does projection use exactly the seven canonical generation fields and eight canonical work fields, with no full census, membership, payload, or SQL content? |
| Failure shaping | Are current outcome, phase, release ID, retry and missing-fact fields unchanged, with diagnostics optional and deep-frozen by the existing answer/error surfaces? Are all projected values bounded scalars or canonical frozen records, with a fixed trigger or `null`, so diagnostics cannot make JSON serialization fail? |
| Startup reporting | Is the current terminal error and phase-failure publication reused with no healthy/per-attempt log and no absolute timestamps? |
| Shutdown | Are there no new timers, tasks, promise records, map keys, retained handlers, cleanup branches, or waits? |

## Claim ceiling

The proposed receipts can show where the existing release owner observed
blocked work, whether the seed caller joined an older attempt, and how far the
existing serialized budget had progressed before its terminal failure. They
do not guarantee that every seed failure crosses either projection point:
outer control-owner shaping currently can discard a nested answer, and a seed
caller may never join an existing run. The receipts cannot identify root cause
from source alone, repair startup, justify a larger deadline, authorize
parallelism or fallback, modify accepted-work or recovery policy, close the
C2/recovery integration, clear inherited static reds, land the Quest, or
convert any measured red to green.
