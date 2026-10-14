# Existing-owner control proof: remove one redundant member census (design V1)

Disposition: WIP. Bounded corrective attempt under the already canonically sealed/red `seed-control-current-proof-amortization` Quest. This does not amend its acceptance probe or the original fresh-seed deadlines.

## Starting source and measured defect

Starting production revision `47ceb42e4a36757007f0d8006d2014fa1400d9c8`. The canonical control cutover owner is `src/node/replica-handler-participant-cutover.js`. Its already-current `sql_transactions-p1` path:
1. Obtains the current committed leader membership and complete routed `INSPECT` facts (the initial member census).
2. Sends actual `PAUSE` to each current member; each recipient closes new work and returns **new facts after the pause**, including its current generation, origin, membership, query census, work and schema enforcement.
3. Checks `cleanCurrentControlCohort` using the canonical `releaseCensusDefect` predicate, which requires all current members, matching membership/term, paused, drained, non-legacy, same durable origin, query state CLEAR and enforced schema.
4. Sends a **second INSPECT** to all of the same paused members, checks the same canonical predicate again.
5. Sends `RESUME` to each, including that second census. The recipient's existing `resumeParticipantCutoverAdmission` itself re-reads **new** full membership, work, schema, origin and generation facts and rejects a mismatch before writing OPEN, with a final status/lifecycle check and no await between status and OPEN.

The duplicate post-pause `INSPECT` is not a separate authoritative fence: `RESUME` already must validate its caller-provided cohort against a newer authoritative local snapshot. It costs one transport request and membership proof per participant per current-control release. No part of the full first-release `ENABLE`/origin-observe path is eligible for this subtraction.

## Exact proposed owner-only transition

After the first valid post-PAUSE cohort census, call **that same** `actOnCohort(..., ACTION.RESUME, pausedCensus, {census: pausedCensus})`. Delete only the second `readCohort` and its copy of `cleanCurrentControlCohort` in `proveCurrentControlCohort`. Preserve all pre-existing runtime owner/partition/authorization checks and the second admission guard at the recipient. Do not manufacture a session permit or cached OPEN. Existing last-moment `RESUME` failures must keep admission CLOSED, preserve durable origin and return the existing refusal. Failure remains owned by the existing release-recovery continuation.

The source is eligible **only** when the canonical `sql_transactions-p1` is already clean. Other partitions and dirty/repaired SQL control groups continue through the original full path. The true accepted commit point of OPEN remains the existing per-recipient `resumeParticipantCutoverAdmission`, not the earlier PAUSE response.

## Falsifiers / refusal proof

- A real registered canonical SQL transaction control service, with durable origin established by an initial full release, invokes a second release. Old candidate performs two INSPECT messages to the same real replica; new candidate must perform **one**, still issue an actual PAUSE and an actual RESUME, do no ENABLE/OBSERVE and return CUT_OVER. Use the *same* test bytes/source-only negative on one host.
- Between returned PAUSE facts and final RESUME, mutate the real SQL transaction schema enforcer. The recipient must detect the disagreement in its final fresh census and refuse reopening. The original durable origin must remain intact; a subsequent full release must repair the schema and safely reopen.
- Replace, shut down, or advance a replica/lifecycle generation after PAUSE; the existing recipient RESUME guard must return STALE/UNAVAILABLE, not re-open a changed owner. The previous uninstrumented V10 native/response tests and 3-replica/cross-node tests remain required.
- Exhausted original absolute deadline must remain refused; no retry, timeout or per-cohort budget increase. The remaining 1000ms startup failure is not excused by faster post-origin control.

## Scope, interaction, and limits

Touch only the one canonical cutover owner and targeted tests; do not edit `src/partition/partition-participant-transaction-pause.js` or second-guess `releaseCensusDefect`. The owner interaction is `PAUSE` -> complete census -> `RESUME`, where the former closes work and the latter is the final authoritative read/OPEN. This design assumes exact `RESUME` revalidation already verified by `38530001635`, including a last-moment enforcer mutation. A one-replica test is a **boundary** witness, not the complete distributed cohort proof.

The whole source remains WIP until post-attempt independent source review, actual original startup bodies, full static/tests and locked-host composition. Do not count a passed primitive as Quest/main acceptance.
