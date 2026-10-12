# Activation cycle round 13 evidence

## Scope and ceiling

This packet amends design only for independent AC12-1/2/3 review. Product
source remains the unapproved frozen `14fac7d6` population. No source, test,
metadata, startup, FreshMG, merge or publication approval is claimed.

The immutable input design is
`design-participant-release-activation-authority-cycle-round13-predecessor-3aeadfe3.md`,
SHA-256
`3aeadfe3b654b6b065cd99ac6d9df583dc2fff4a3636225517da8a945763a32d`.
The independent input report is
`review-activation-cycle-design-round2-independent.md`, SHA-256
`f14f361452a8240db6275a72de18073eb27d82021f9cd700b51b7a54e9b87d1a`.
Its diagnostics manifest SHA-256 is
`3696fb9b0f39ac06bc2824203512a63960f62f1daa3bf3b8227b29310b62b390`.

The accepted `82b11d80...` prefix, R7-2 route/resource clauses, committed
winner, conditional dependent fence, same-attempt catch-up and fixed deadline
remain unchanged.

## Complete corrected handoff

| Boundary | Existing durable owner | Exact retained fact before effect | Commit / apply fact | Recovery and release |
| --- | --- | --- | --- | --- |
| Root to CLAIM | Seed/operator `StartupWorkflowStore.participantReleaseCommand`; Fresh CREATE existing `replica_operations` operation payload | One per-partition `pendingControlClaim`, revision-CASed before the first operation-port call, containing exact CLAIM and PAUSE bodies, predecessor/history expectation and original deadline | Committed CLAIM result/readback transfers complete custody to the existing control singleton | Captured or submitted-unknown crash redrives the same entry ID. A successor candidate is admitted only after committed terminal refusal and preserves root/effect. Candidate and copy leases release after atomic terminal-result/successor update or validated custody transfer. |
| Old cycle to dependent supersession | Same control singleton CASes `SUPERSESSION_PENDING` before dispatch | Immutable command names history, old cycle/claim, dependent release, original PAUSE, exact prior fence and reason; route/leader/term are excluded | Dependent apply orders supersession before PAUSE or after exact PAUSE using only replicated bytes and the durable fence | Current execution envelope can change after receiver refusal or unknown delivery, but command body/entry ID cannot. Replay is inert. Control terminalizes only after exact dependent proof. |
| High-water to delayed old target | Existing control state inside `_partition_write_generation.participant_release_control_text`; old target's authentic durable authorization | One durable `controlHistoryId` initialized by first claim from a pre-custodied seed and exact origin, copied through every control revision and authentic image | History-scoped terminal closure advances `closedThroughCycleOrdinal` | Same-history delayed A after B/C may consume `RETIRED_SUPERSEDED`; different/missing history remains HOLD. Consumer rereads old authorization/target and no-successor fence after await. |

The design retains only one unresolved claim candidate plus one constant-size
last terminal result per admitted effect, one current control slot, one pending
supersession and the history/high-water scalar. It adds no ledger, coordinator,
scheduler, global readiness gate, participant-count cap or deadline renewal.

## AC12 disposition

- **AC12-1:** custody begins at the existing root command record's candidate
  CAS, before submission. `captured_unsubmitted` and `submitted_unknown` both
  survive boot/process/leader loss and redrive exact bytes. Missing application
  state, ACK and timeout do not prove replacement.
- **AC12-2:** immutable supersession effect and volatile current delivery
  envelope are separate canonical shapes. Receiver admission consumes the
  envelope; replicated apply consumes only the immutable command. The same
  body crosses a changed attempt, unknown delivery and replay.
- **AC12-3:** every ordinal, dependent fence, authorization and result carries
  the same durable history ID. Snapshot/replacement copies it exactly. Missing
  or recreated history is typed HOLD, even when numeric ordinals match.

## Deterministic feasibility

Command:

```sh
node solve/quests/replicated-transaction-decision-and-apply/evidence/activation-cycle-round13-feasibility.mjs \
  > solve/quests/replicated-transaction-decision-and-apply/evidence/activation-cycle-round13-feasibility-result.json
```

The model reports 12/12 observations:

1. captured candidate survives a pre-submit crash;
2. submitted-unknown recovery redrives exact candidate bytes;
3. successor candidate occurs only after a committed STALE result;
4. committed claim owns the prospective history and byte-identical PAUSE;
5. stale envelope can be replaced around the same immutable supersession;
6. supersession-first makes delayed PAUSE inert;
7. PAUSE-first closes the exact PAUSE;
8. lost supersession answer replays the exact entry;
9. three same-history cycles retire delayed A without changing C;
10. equal ordinal in a different history remains HOLD;
11. target mutation or successor publication during await retains debt; and
12. authentic image preserves history while missing history holds.

This program is a deterministic supplied-fact model. It imports no product
Raft, SQLite, request or apply function and supplies its own coordinates. It
proves internal feasibility of the specified states, not production reachability
or commitment.

## Actual seam evidence and future proof

The actual unapproved source currently provides these navigation facts only:

- `startup-workflow-store.js` is the existing file-backed startup record owner;
- `partition-participant-release-request.js` owns request correlation and
  pending outcome handling;
- `replica-handler-participant-release.js` checks current receiver attempt;
- `partition-participant-transaction-store.js` owns the singleton generation,
  control revision and authorization fields;
- `partition-participant-release-apply.js` applies existing release commands;
- `participant-release-lifecycle-retirement.js` consumes target retirement;
  and
- `replica-handler-release-recovery.js` is the existing wake/recovery runner.

No current source is claimed to implement the new candidate, supersession or
history fields. Future implementation review must traverse actual durable root
capture, operation port, proposal/apply, exact SQLite before/after rows,
transport loss, snapshot/replacement, target revalidation and controlled
successor publication. It must include both PAUSE orders, pre/post-submit
crashes, changed receiver attempts, three cycles plus delayed target,
different-history refusal, complete population/resource metadata and the
unchanged production pgwire oracle.
