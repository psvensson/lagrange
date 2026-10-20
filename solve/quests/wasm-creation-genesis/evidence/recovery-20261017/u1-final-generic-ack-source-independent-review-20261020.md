# U1 final generic execution ACK — bounded independent source/oracle review

**2026-10-20; target candidate**
`be25caa5f0c3612feec662d4feaa9ba28f8f34df`.
**Verdict:** **APPROVE only the bounded generic CREATE/REMOVE acknowledgment
identity contract**, not the complete U1, native generic physical custody,
distribution, other currentness owners or a release/merge.

## Inspected exact production blobs

- `src/node/runtime-service-creation-execution.js`:
  `fb4a97950ddf1aef666b4aa7fb47a5e785d9f4eb`.
- `src/node/runtime-service-generic-replica.js`:
  `eebb6e43460aa603525c916e1b510e592d110f45`.
- `src/node/runtime-service-bound-creation-route.js`:
  `0648fb505c1dc47899989ba49eb9056f8703a089`.

Inspected associated exact test blobs:

- `test/node/runtime-service-handler.test.js`:
  `50fe2c3f114edeafd416f73418b9e6b6103946b5`.
- `test/node/runtime-service-remove-execution-custody.test.js`:
  `29e162fcbe03a333a9ed2c0e317ca223f19e53dc`.

## One existing owner; no second promise of completion

The existing `inProgressOperations` entry is authoritative for a
generic CREATE/REMOVE execution. `replyToGenericExecutionGate` first
finds the actual installed execution by canonical replica ID, then
only returns `IN_PROGRESS` when BOTH its operation type and complete
captured request agree: operationId, entityId, replicaId, reason and
request JSON digest. Equal operation ID with any incompatible request
returns typed nonretryable `CONTENT_CONFLICT`. Different operation ID
returns retryable `RETIREMENT_IN_PROGRESS`: it never promises an
outcome observer that was not registered. No secondary queue, adapter
or retry authority was installed.

The generic REMOVE path delegates its busy check to that same owner
before attempting physical STOP admission. Its previously approved
`admittedMemo` identity fence and `finally` execution-gate release
remain in place. The generic CREATE consumer likewise asks this
owner instead of treating a nameless `CREATING` memo as proof of
a running task; without an installed task it re-enters the
existing ordinary public CREATE admission. The bound retained
creation and its original durable journal/origin remain a separate
authority, not inferred from a generic memo.

The public-entry test fixtures now first install an actual request
by `handleCreateReplica` or `handleRemoveReplica` and THEN repeat
the same envelope. The assertion counts one installed execution
and one physical lifecycle call. An earlier synthetic REMOVE fixture
omitted the fields required for a real admission: retaining that
fixture expectation would certify the wrong ACK policy.

## Actual executable discriminators on the frozen tree

- [Focused #514](https://github.com/psvensson/lagrange-lab/issues/514):
  **15/15 PASS**, 421 runner assertions.
- [Compatibility #515](https://github.com/psvensson/lagrange-lab/issues/515):
  **23/23 PASS**, 958 runner assertions.
- [Generic fixture #510](https://github.com/psvensson/lagrange-lab/issues/510):
  **2/2 PASS**, 53 runner assertions at its immediately previous
  test-only fixture branch. The exact final 15/23 suites supersede it.
- [Foreign-op mutation #517](https://github.com/psvensson/lagrange-lab/issues/517):
  one production-line changed to permit wrong-operation ACK;
  meaningful **RED** at
  `FOREIGN_REMOVE_WAS_ACKNOWLEDGED_WITH_NO_OUTCOME_OWNER`.
- [Unowned-memo mutation #518](https://github.com/psvensson/lagrange-lab/issues/518):
  one source-only false-ACK change; meaningful **RED** at
  `UNOWNED_CREATING_MEMO_ACKNOWLEDGED_WITHOUT_SCHEDULING_RECOVERY`
  (actual `in_progress`, expected `initiated`).
- [Canonical static/generated #513](https://github.com/psvensson/lagrange-lab/issues/513):
  whole-U1 fast-static and generated seal PASS at exact final source.

## Explicit review ceilings

This does **not** certify that a lower generic lifecycle adapter
cannot physically retire/overwrite a successor resource under the
same logical replica ID once STOP starts. The generic source checks
the admitted memo before and after STOP and suppresses stale
publication, but the lower adapter's physical selection and
cross-host lifetime remain their **own** owners.

Likewise generic CREATE after an awaited `startReplica` is fenced
by the installed task, but this review does not certify every possible
external physical-generation replacement while that task remains
installed. The named admission/ACK contract is narrower.

The unchanged 119 failed test-file blobs are not automatically
inherited failures. The exhaustive [GCP run
39393585693](https://github.com/psvensson/lagrange/actions/runs/39393585693)
was **1,779/1,898 PASS**, **119 FAIL**. The predecessor differential
and root classification, V1–V9 remainder, actual final physical
and native distributed proof, independent 55-item combined U1
review and all release gates remain open.

**Do not upgrade this bounded approval to combined U1 acceptance or
use it to authorize U2, activation or merge to `main`.**
