# U1 revised restart and legacy oracles: independent follow-up review

Date: 2026-10-19. Reviewer: `subagent:/root/lifecycle_design_research`.

## Scope and disposition

This records the additional review completed after
`u1-pr8-supersession-independent-review-20261019.md` (SHA256
`9c2f6e3792e9076fbf5cf0804f316f920ae49faa54d7a4ce9c0a5f3a8b15d30d`).
It discharges the named pending oracle-review items in that earlier record
within the bounded scopes below. The earlier record is preserved unchanged.

The source subject is unchanged production
`a55ab41296faf30a4c404c56117eacbaa993c903`. The handler test includes root's
separately reviewed gate-release additions, subsequently preserved in
`407fab824`. Complete reviewed file hashes are recorded below; the verdict
does not depend on assuming that a mutable branch is unchanged.

**APPROVE** the P-R7 completion-failure expectation, P-R11 retained-token
input, canonical corruption carrier assertion, final P-R12 tokenless
cancellation memo expectation, materialization-before-formation prerequisite,
and legacy handler consumer witnesses described below.

**REVISE** the strict-owner legacy test's repository-read assertions and
evidence label. Its response expectations are sound, but its scripted
unavailable result does not discriminate omission of a required read option.
The minimum requested correction is recorded explicitly.

These are independent contract/oracle rulings, not production-source
acceptance, executed test or mutation results, full U1 acceptance, or U2
authorization. The reviewer authored none of the candidate source or tests
and executed no tests. Root authorized writing this new evidence record only.

## APPROVE: P-R7 original-journal completion failure remains HELD

Reviewed witness: `test/wasm-service/bound-creation-restart.integration.test.js:292–357`,
especially the revised branches at `:323–345`, introduced by `588c3499`.

The revised `REMOVE_HELD` expectation is required by v3 section 8: physical
retirement and the exact STOPPED projection cannot prove completion of the
original creation journal. The witness distinguishes those states instead
of accepting a result label alone:

- The `stopped` branch installs its fault after a real published creation.
- The component journal writer treats non-INSERT journal updates as
  `admission`, so `before-admission` faults the original completion update at
  this point. It does not fault the separate actual services projection.
- The witness requires services absence only in the `stopped` branch,
  original journal `in_progress`, and zero REMOVE_COMPLETED outcomes.
- After clearing the fault and rebuilding the host, it requires the real
  retirement and original journal to complete and requires no startup
  executor outcome.

Sources: `test/service/service-consensus-creation-fixture.js:47–54`;
`src/service/service-consensus-bootstrap.js:125–146`;
`src/service/service-consensus-creation-intent.js:393–415`;
`src/node/runtime-service-bound-creation-route.js:478–490`.

This approves the changed expectation and its fault/oracle construction.
The fixture models named crash intervals and honest host reconstruction; it
does not execute a process kill or establish mid-CAS power-loss behavior.
The earlier completed-event expectation is superseded by the already
approved v3 physical-versus-journal rule, not by the fact that a test failed.

## APPROVE: P-R11 uses the actual full retained wake token

Reviewed witness: `bound-creation-restart.integration.test.js:444–467`,
changed by `cb7aea2e`.

`matchesInstanceResourceToken` requires the complete token: binding/body
digests, slot, ordinal and operation identity. `{operationId}` is not a valid
owner token. The revised setup obtains `retained.token` from the real manager
and asserts `ADMISSION_RETAINED` before restarting. It retains the readiness
refusal, absence of premature outcomes, a queued matching wake, and exactly
one original-identity re-entry.

Sources: `src/control-plane/owners/service-instance-state.js:311–318`;
`src/node/runtime-service-creation-execution.js:47–55`;
`src/node/runtime-service-bound-creation-route.js:415–458`;
`src/node/runtime-service-restart-inventory.js:145–162`.

The wake remains a matching continuation hint. Supplying its real token does
not give the wake authority to create or replace a journal admission.

## APPROVE: conflicting inventory observation uses canonical outcome carrier

Reviewed witness: `bound-creation-restart.integration.test.js:1105–1138`,
carrier assertion changed by `cb7aea2e`.

`ServiceInstanceContractError` stores its canonical classification in
`.outcome`. The journal observation owner throws that error when one
operation ID has divergent row contents. The revised assertion changes only
the error carrier and preserves the substantive checks: readiness remains
closed, no memo is installed, and no continuation starts. The equal duplicate
case still folds into one retained obligation and one re-entry.

Sources: `src/control-plane/owners/service-instance-contract.js:16–23`;
`src/service/service-lifecycle-manager.js:532–568`.

No permission to order conflicting observations into a winner is introduced.

## APPROVE: final P-R12 tokenless-cancellation memo expectation

Reviewed witness: `bound-creation-restart.integration.test.js:469–532`,
changed by `588c3499` and then corrected by `9d658ace`.

The final permanent `FAILED` memo without `deferRetry` denotes an original
creation whose reservation was authoritatively cancelled before admission.
It does not claim that a physical resource was retired. The original journal
remains `CANCELLED`; the foreign request retains its `ADMITTED` slot. A
terminal CREATE redelivery does not resurrect retryable custody. A repeated
REMOVE still consumes the original terminal journal and receives R3-D's
completion disposition without a new physical retirement.

The witness keeps both opposing branches: an applied-but-unanswered original
reservation is resolved under the same request and physically retired; an
unavailable owner leaves the original row PENDING and the REMOVE held,
reachable through a later restart. Those checks prevent tokenless
cancellation from becoming a fallback for unresolved or admitted work.

Sources:

- `src/control-plane/owners/service-instance-state.js:216–239`: the actual
  resource owner distinguishes sealed same-ordinal conflict from unresolved
  reservation conditions.
- `src/service/service-consensus-creation-intent.js:333–390`: original-identity
  cancellation CAS/reread, retained-token resolution, and terminal replay.
- `src/node/runtime-service-bound-creation-route.js:548–588`: exact original
  memo/origin matching and null-token cancellation before clearing retry state.
- `RECOVERY-DESIGN-20261017.md`, R3-D: repeated REMOVE after CANCELLED.

The intermediate cancellation-as-`REMOVED` expectation from `588c3499` is
not approved. The final `9d658ace` expectation is approved. This neither
changes admitted-resource finality nor makes a generic FAILED result prove
that reservation never occurred.

## APPROVE: materialization before formation

Reviewed witness: `bound-creation-restart.integration.test.js:724–768`,
prerequisite added by `4cc155b8`.

The new bounded settle establishes the actual formation helper's input
prerequisite: every replica object exists before the helper invokes
`raft.tick()`. It does not enlarge `SETTLE_ROUNDS`, add a wall-clock wait or
change native formation behavior.

The original failure discrimination remains. The witness captures the scan
count before releasing the first observation, then checks one scan, shared
applied-plan identity, no successful rescan, and unchanged ACTIVE memo. A
second-scan defect remains observable after materialization; the new wait
cannot erase the recorded count or make distinct returned plans identical.

Sources: `src/node/runtime-service-restart-inventory.js:145–179`;
`test/wasm-service/bound-creation-handler-embedding-fixture.js:322–352`.

This approves the setup adaptation. It does not reclassify a prior null-replica
setup exception as an executed forbidden-effect failure.

## APPROVE: legacy handler consumer witnesses, with explicit seams

Reviewed blocks: `test/node/runtime-service-handler.test.js:473–639` and
`:753–772`; relevant changes are `f07ed531`, `7bcfa6f2`, `47798323` and
`f26d25c8`.

The positive reconstruction, wrong-entity/no-poison retry, unavailable-owner
retry, delayed authorization-return exclusion, and falsely bound opaque-target
refusal are valid handler consumer oracles. Their ADMITTED/UNAVAILABLE owner
answers are scripted, and the delayed-answer test directly replaces the memo
at a named boundary. Within that scope they establish that the handler:

- consumes exact authorized request identity before generic STOP;
- leaves no newly published memo or physical call after a rejected opaque
  request, while allowing later original-owner cleanup;
- retains caller retryability after unavailable ownership rather than
  treating an unknown answer as permanent absence or permission;
- rechecks the handler/memo lifetime after the authorization await;
- refuses to route an opaque target as a bound creation merely because an
  injected memo carries an operation ID.

Sources: `src/node/runtime-service-handler.js:479–545`;
`src/bootstrap/shared/guarded-runtime-service-handler.js:20–35`;
`src/control-plane/replica-dispatch-service.js:47–74`.

These unit witnesses do not execute the repository owner or a real RPC.
They do not prove a production successor-admission interleave, physical
incarnation identity, or safety of a STOP already admitted to the physical
owner. The separately approved queued/STOP-return and gate-release witnesses
retain their own proof ceilings.

## REVISE: strict-owner legacy test's read contract and evidence label

Reviewed witness: `test/control-plane/replica-dispatch-reservation-identity.test.js:188–229`,
added by `7bcfa6f2`, at full-file SHA256
`237a4dcdaab017ba0a450e61de24472c84c8cbff054a23b834921f855c82cb21`.

The typed expectations are sound, but the current stub supplies
`{deferredOutcome: ...}` independently of the received read options.
Therefore removing `requireAbsenceConfirmation: true` from the production
call would still satisfy the unavailable-owner assertion. The real
repository can then classify a failed read as absence outside priority
recovery:

- `replica-operation-repository-read-methods.js:425–438` creates an explicit
  failed-read deferral when absence confirmation is required.
- `replica-operation-repository-visibility-methods.js:489–493` returns no
  priority-recovery deferral outside that mode.
- `replica-dispatch-service.js:62–64` maps no operation and no deferral to
  permanent `CONTENT_CONFLICT`.

This is a demonstrated oracle blind spot by source reasoning, not an
executed mutation. The production call at `a55ab412` already supplies both
required options; this finding requests no production repair.

Minimum requested correction:

1. Describe the test as a dispatch consumer using a scripted repository seam.
   Its present wording must not imply an executed repository/RPC or physical
   generation authority proof.
2. Assert that the captured read uses the exact requested operation ID.
3. Assert both `OWNER_RPC_REQUIRED` and `requireAbsenceConfirmation: true`.
4. Preserve the existing ADMITTED, wrong-entity, wrong-node, terminal,
   confirmed-absence and unavailable response checks.

The corrected bytes require a subsequent narrow independent check. Full
repository owner execution and physical-incarnation safety remain outside
this unit test's claim even after the minimum correction.

## Verification-category coverage and retained gates

The applicable owner-interaction, harness-fidelity, recovery-replay,
concurrency-serialization and transport-delivery templates were considered
for these bounded oracle changes. Their result is not a new review of every
U1 source path.

| Category | Disposition for this delta |
| --- | --- |
| Owner interaction | Exact journal, reservation, wake-token, inventory and legacy authorization owners are identified. Paired admitted/cancelled/unavailable cases preserve conflicting obligations. No memo or cache projection becomes permission. The strict-read option gap is the explicit REVISE above. |
| Harness fidelity | Actual component owner effects and scripted seams are separated. P-R7 checks intermediate state, P-R11 uses the actual token, and startup materialization preserves the original discriminator. Prior unrelated failures are not promoted to meaningful negatives; no control experiment is claimed executed. |
| Recovery/replay | No stale scan may replace live state; completed and cancelled original rows stay terminal. Unknown reservation or completion remains owed. Repeated original work preserves identity. Host reconstruction is distinguished from process death. |
| Concurrency/serialization | Inventory coalescence, memo-before-reentry, delayed authorization checks and the separate exact gate are retained. The bounded test wait is not a production scheduler. Direct memo replacement does not prove physical successor admission. |
| Transport/delivery | Synchronous replies, executor outcomes, lost owner answers and deferred custody remain distinct. No transport ACK is treated as owner processing. The actual strict repository's absence-confirmation option is required at the consumer boundary. |

Existing v3 design approvals remain authoritative. No new timer, sweep,
reservation policy, ownership lane, fallback or membership authority is
introduced by these test adaptations. Exact candidate execution, meaningful
frozen-test source-only controls, the missing five reconstructed physical
oracles, generated-metadata checks and the remaining U1 source acceptance
work are not discharged by this review.

## Byte bindings

SHA256 values bind complete reviewed files. A full-file hash does not extend
the verdict beyond the named cases or source questions.

| File | SHA256 |
| --- | --- |
| `test/wasm-service/bound-creation-restart.integration.test.js` | `197cf1610af6b779dfed1edb60c86faa31b882b47967b4b493a5963e29c1f945` |
| `test/wasm-service/bound-creation-handler-embedding-fixture.js` | `fae23bc1c01d42b70d1020bdfd4670cbef256d2d58812221529aaeec774d5515` |
| `test/service/service-consensus-creation-fixture.js` | `c2664a538eea8f83ae101960ea5d80792e931ef076878f403e1599df8637cd5a` |
| `test/node/runtime-service-handler.test.js` | `e6fb5b6b658fa855ecabe22689c7e3d7896e783fe68ed7a19a17dc961cb77fe3` |
| `test/control-plane/replica-dispatch-reservation-identity.test.js` (REVISE) | `237a4dcdaab017ba0a450e61de24472c84c8cbff054a23b834921f855c82cb21` |
| `src/node/runtime-service-handler.js` | `f18d08ab364da40004c5c432aa404bca50d991ad565df7b3f79b8c32426d4f07` |
| `src/node/runtime-service-bound-creation-route.js` | `133b5f1e4068aa1b1352f1c6305dc547bced68ef0d3eaa151e11d50634d5b98f` |
| `src/node/runtime-service-creation-execution.js` | `f7a68bd547d33128e410915ec4bda6c4cb944fa89df444a0a246fdd8fc96988e` |
| `src/node/runtime-service-restart-inventory.js` | `44dcac34efec16d4991b6433e1fb8a807f86a4201f41568c894d55c688197e20` |
| `src/service/service-consensus-bootstrap.js` | `1b60a815cb70106d797a9b4e6e5b9767ce59ecbfbe5fc316e8504c98fd2008cd` |
| `src/service/service-consensus-creation-intent.js` | `19f996fc5c079db1a01096ad4d657a1ee8c4d53db1c63bcd6ffb75e18db4ed3d` |
| `src/service/service-lifecycle-manager.js` | `a4c724584dd066346ad58e9625127adb4728d1877726b59d33208eb23c0b6306` |
| `src/control-plane/owners/service-instance-contract.js` | `dae9021728d97987dfc16baf7423352a2308fccf5a2fc78362aea91f44eab0fd` |
| `src/control-plane/owners/service-instance-state.js` | `c0c582f02b2af52d5604fc0bc39c3da615da8ff452f24054fc6097a26fd6905b` |
| `src/control-plane/replica-dispatch-service.js` | `385217923b84a9981204398d25b434453d01df709aa09daf429f24c378e04352` |
| `src/rebalancer/replica-operation-repository-read-methods.js` | `a7618950221ffce5ad837774c4d89827bfe8c7c466a8be119cb447a60249d677` |
| `src/rebalancer/replica-operation-repository-visibility-methods.js` | `1eb7bc55867b2a319bd5e04cdedd09edf314f2483d6639cc6319ef228fce77e8` |

This record adds explicit rulings without rewriting any original witness,
contract, prior review or lab receipt.
