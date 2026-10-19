# U1 inventory and lifecycle reconstruction checkpoint

Status: REJECTED / UNVERIFIED WIP preservation at the parent's explicit request.
Independent review has remaining findings; this source must not be accepted,
merged or treated as a completed U1 correction. No behavioral, native,
component or integration test was executed in the local workspace.

## Open review findings at immediate WIP preservation

- The STOPPED projection gate incorrectly accepts the real stopped projection
  owner's `{retained: false, state: 'stopped'}` result. That owner has performed
  no write. The current WIP can therefore complete the original journal while
  an old services row remains. This requires a narrow canonical stopped-result
  refusal and a real stopped-owner negative witness. The asynchronous
  RETAINED-to-APPLIED continuation remains the separately owned activation A5
  prerequisite; it is not being implemented inside U1.
- Physical retirement admission has just been corrected to reject a reused
  operation ID with different full intent/token against active and retiring
  exact objects, before task installation or any physical retirement effect.
  Its direct native changed-body witness and final scoped checks are pending.
  This guard must receive independent review before acceptance.
- The manual owner-interaction registry still describes the older HELD memo
  route and omits new owner helpers and the independent custody witness.
  Registry alignment and actual combined-tree metadata regeneration remain
  necessary after integration of the parent's test-only commits.
- Root's independent test commits are not yet integrated in this WIP. All
  behavioral and mutation execution, plus the final source verdicts, remain
  outstanding.

The parent requested this immediate rejected checkpoint so the reconstructed
implementation cannot again be lost while review and correction continue.

## Source and authority

The exact reconstruction base is
`8c9b14141f89872938d21cc35472b262929818d6`. That checkpoint published the U1
contracts and counterexamples, plus the earlier F1 source correction, but no
F2-F6 production correction. No surviving earlier implementation was found by
the implementation owner or parent. This checkpoint reconstructs the approved
coherent inventory/lifecycle unit from that base; it does not replay an old
source patch or change the preserved red checkpoint.

The applicable design is `u1-inventory-continuation-contract-v3.md`, SHA256
`6f010cc376fd3ff6bd0d7d07892636967eb3ad343915364f4c80a35c5450c048`, with the
approved v3 addendum, journal hydration addendum and physical-state
clarification. Two narrow clarifications approved by the independent parent
reviewer before the corresponding implementation are also consumed:

- `u1-ordinary-memo-wake-clarification-20261019.md`, SHA256
  `0953fc2add0be34c019c6356db67e3cba5905bec8153484ec3af5c4750898274`.
- `u1-retirement-projection-debt-clarification-20261019.md`, SHA256
  `339fb399f23e9c91c41482bcafd07e81da541e3c06ec724c87e0667d9c6b637a`.

The parent preserves those clarification records with the separately owned
test checkpoints. Their integration follows this source preservation commit.

## Coherent owner changes

### Inventory, request identity and continuation lifetime

The manager reads PENDING and IN_PROGRESS rows in one SQL observation,
validates the result, deduplicates only exact duplicate rows and refuses a
conflicting operation identity without applying a partial inventory. The
handler installs one shared inventory task per lifetime. Failed unapplied
observations may be explicitly retried; an applied plan array is retained.
Stop is irreversible and every asynchronous continuation checks its exact
task or execution entry before applying local effects.

Each retained creation has one plan with the captured full intent and token,
its local inspection, its action and its remaining journal obligation. A
collision produces a named CONTINUATION_PENDING memo and keeps every plan.
Known-plan CREATE routing happens before current-memo routing, so a newer
physical creation cannot retarget an older explicit request. A CREATE for a
retired retained plan remains a typed retryable deferral while silent
retirement housekeeping proceeds under the original origin.

The existing in-progress map is the sole canonical replica execution gate.
Bound CREATE, coordinator REMOVE and silent startup retirement install an
exact entry and release only that entry. Startup retirement retains at most
one coordinator observer. Identical repeats coalesce; different requests are
refused without a waiter or future outcome. The entry captures its target
creation at admission. Global request-ID lookup covers both primary entries
and the optional observer, before ordinary CREATE memo replies or REMOVE
effects. A known-plan request cannot attach to another plan's observer.

The first CREATE entry is installed before its prompt acknowledgment. Its
deferred journal-only hydration validates the original full request against
the retained origin before owner resume. A NOT_ADMITTED row contributes the
validated intent and a null-token enqueue hint. A wake never installs a token;
only an authoritative resume or reservation-resolution result can upgrade it.

### Wake storage and settlement

Matching checks include the full binding and the full admitted token when
present. Foreign or malformed wakes cannot mutate a plan, entry or memo.
RESOURCE_CLOSED and an unavailable grant are record-only. A qualifying wake
can leave one bit on the matching running entry or retained plan.

An ordinary HELD memo also retains at most one bit while another origin owns
the replica gate. Gate settlement is the only new retry point, after queued
startup plans. Consumption requires the same installed memo, full original
origin, HELD state, live handler and an immediate physical CURRENT result.
Busy admission preserves the bit; replacement discards it. There is no new
timer, queue, listener, token adoption or durable registry.

### Physical currentness and custody

The full origin has one canonical capture in
`service-consensus-creation-origin.js`. The physical lifecycle owns the sole
observation predicate in `wasm-creation-custody.js` and exposes
`observeCurrentCreation(creation)`. Manager, adapter, runtime and driver
pass through the same `{consensusCreation: creation}` shape.

CURRENT, ABSENT, DIFFERENT and UNAVAILABLE are defined once in the lightweight
`wasm-service-constants.js`. Exact registered CREATED, STARTING or READY
objects are CURRENT. Different full origin is DIFFERENT; stopping, cleanup,
closed admission or an unavailable observation is UNAVAILABLE. The existing
physical `.live` predicate is unchanged, including CLEANUP_REQUIRED and
excluding CREATED.

The manager's canonical replica map stores a named generic or bound record,
including the bound origin. Its public state getter preserves the existing
string return. Bound start and projection require immediate exact physical
CURRENT. Driver descriptors and preparation maps are likewise fenced by the
same observation and full origin. Removal bookkeeping can clear only its
captured descriptor after physical ABSENT.

A bound successor cannot bypass an admitted retirement task or a registered
current object with unresolved cleanup. This includes a directly invoked
replica shutdown that has reached STOPPING before the lifecycle adds it to
its retiring set. Exact CREATED reuse and normal CREATED startup remain
admissible, and a different CREATED object remains replaceable under the
existing lifecycle contract. Generic successor semantics remain at their
existing owner.

### Retirement and ordered remaining debt

The physical owner admits each exact retirement task before invoking any
collaborator, coalesces only a matching origin and closes admission before
shutdown drains those tasks. Shutdown joins admitted retirement by path as
well as exact objects. RETIRE_RESOURCE intent survives failed cleanup and
also survives joining an already STOPPING orderly stop; joining that earlier
promise does not assert that it wrote a tombstone.

Physical FINAL is canonical: actual CLOSED, or a durably RETIRED exact local
tombstone with explicitly unavailable owner history. Missing storage alone
does not prove retirement. The raw closed, tombstone and close evidence is
preserved. FINALITY vocabulary has one lightweight owner; executable physical
modules are not imported merely to read a constant.

The runtime requires an actual non-retained STOPPED projection result after
physical FINAL and before the manager attempts the original-journal CAS.
An absent result, retained result or failed writer produces the named
RETIRED_UNPROJECTED carrier, keeping raw physical FINAL and the projection
reason. The manager may separately update its own exact physical record but
does not complete the journal on that carrier. The handler retains the
original retirement debt and reports its projection or journal reason.

## Source organization

Six small owner modules were added: creation-origin capture, lifecycle state
records, physical custody, handler execution identity, generic handler
execution, and envelope dispatch. The latter two extract existing generic
logic and dispatch so edited source files remain within the 800-line bound.
No ratchet or guideline baseline was changed.

## Preserved and added witnesses

The base counterexample bytes remain published at the exact base. The local
restart integration file only appends witnesses; its pre-existing assertions
are unchanged. Added cases cover an ordinary HELD memo behind another plan,
record-only/foreign wake controls, volatile memo replacement, actual physical
successor replacement, and coordinator-first repeated exact REMOVE identity.

The memo-bit mutation must fail `ORDINARY_J_WAKE_WAS_LOST_BEHIND_F`; removing
the immediate physical fence must fail
`STALE_ORDINARY_J_WAKE_ENTERED_AFTER_REPLACEMENT`. Coordinator repeats must
produce one original retirement and one coordinator outcome, with no new
journal and no outcome for a refused foreign coordinator ID.

The parent independently owns `bound-creation-physical-custody.integration.test.js`
and its native witnesses, plus the scripted handler and runtime-publication
consumer fixture adaptations. Those source-independent tests are integrated
after this checkpoint, rather than copied or edited by this implementation
owner.

## Static evidence from the preceding source snapshot

All checks used the verified Node 22.16.0 runtime with locked JavaScript
dependencies installed using `npm ci --ignore-scripts`. No native build or
product execution was used. Checks requiring git subprocesses ran with the
authorized normal subprocess environment: the restricted environment's
EPERM/zero-changed-file attempts are not counted as evidence.

- Scoped fast-static against exact base: PASS, 30 changed paths including
  28 JavaScript paths, 22,694 ms. This included dependency, shard, complexity,
  ESLint, runtime grammar, metadata gateway, impact-contract and documentation
  checks. The report, narrow different-CREATED admission correction and the
  active/retiring same-ID origin guard were added after that measurement.
  This pass does not certify the exact immediate WIP tree.
- Strict complexity for all six new source modules: zero violations at
  cyclomatic 12 and cognitive 20 thresholds.
- Decision-boundary audit over 27 source paths: zero new violations; four
  inherited findings matched the unchanged baseline.
- Literal audit over the same 27 source paths: zero new or inherited findings.
- Import cycle check: PASS, zero of zero cycle groups.
- `git diff --check`: PASS.

The normal metadata producers observed 2,410 test files before integration of
the parent's new test file. They produced snapshot digest
`0d249af18eb34dbe3e2f2cba277b6ce3fbdb58943ddf10e60232ce7142b263f3`,
graph-byte digest
`f653657ea7a21d5237d75973bc30c1d946521de75ec1487f2c4135964a0e2478`
and seal-byte digest
`7960a50fb1f6665816d6cc7f5008640ce8807e2ba0ed88a0e9b4d569f14004cb`.
Another producer run after the CREATED adjustment completed before the last
origin-guard edit; exact final metadata is intentionally not claimed here.
The combined tree must regenerate metadata from its real 2,411-file census.
No generated seal was hand-edited to conceal a missing source input.

## Remaining gates and proposed focused execution

Independent source review is split between the parent's handler/inventory
review and the F1 review owner's physical/driver/runtime/manager review. Both
must bind their verdicts to the frozen source commit and later reviewed
corrections. Design approval alone does not discharge this gate.

The first focused Harnessd selection is:

1. `test/node/runtime-service-bound-route.test.js`
2. `test/wasm-service/bound-creation-restart.integration.test.js`
3. `test/wasm-service/bound-creation-physical-custody.integration.test.js`

The affected-owner regression selection then covers
`test/runtime/service-runtime-consensus-publication.test.js`,
`test/node/runtime-service-handler.test.js`,
`test/runtime/wasm-component-driver.test.js`,
`test/wasm-service/wasm-service-lifecycle.test.js`,
`test/service/service-lifecycle-manager.test.js`,
`test/service/service-consensus-creation-recovery.integration.test.js` and
`test/wasm-service/bound-creation-handler-embedding.integration.test.js`.
These are proposals for authorized lab execution, not recorded passes.

Behavior evidence, native custody evidence and the named mutations remain
unexecuted at this checkpoint. U1 remains open; no U2 implementation or
dependent activation acceptance follows from these static results.
