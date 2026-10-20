# U1 bound REMOVE complete-operation witness — 2026-10-20

Status: proposed oracle supplement; native execution and source approval pending.
Author: `subagent:/root/physical_custody_review`. Base
`be93c7e5d9a76a39e76a530c93715521b2281356`, product bytes
`be25caa5f0c3612feec662d4feaa9ba28f8f34df`.

This is a bounded supplemental witness under the existing wasm-creation-genesis
Quest, its exact-origin/exclusion/async-custody contract and original review-first
constraint. No seal, runtime ordering, generic activation or acceptance term
changes. Root requested this supported route after source inspection excluded
ordinary unbound WASM CREATE and built-in deployed meta placement. Earlier generic
STOP and input-loss drafts remain explicitly unexecuted component observations;
they are not replaced historical evidence or production acceptance.

## Actual route and complete operation

Use the existing `bound-creation-handler-embedding-fixture.js` unchanged. Its
catalog command and ServiceDefinitionsOwner create the selected binding; real
ServiceLifecycleManager.prepareConsensusCreation journals and retains each
founder; actual RuntimeServiceHandler CREATE traverses manager, adapter, runtime,
driver and native lifecycle. Three native founders form and reach PUBLISHED;
actual services/endpoint owner writes and native serving predicates are required
setup positives. Metadata consensus is still component SQLite, transport queued
loopback, and all three hosts live within one process.

| Trigger / current facts | Permitted effect / actual durable commit | Lost answer / remaining obligation |
| --- | --- | --- |
| CREATE: real selected binding and retained original journal+token | Actual handler construction and native formation, owner grant, local PUBLISHED, actual services and endpoint rows | Existing original journal remains IN_PROGRESS; fixture does not invent admission or imply catalog activation. |
| REMOVE: actual handler reads its original retained creation and installs execution | Manager captures complete immutable origin; runtime first requests exact old endpoint deletion | Pause the actual endpoint owner's deleteWhere before mutation, closing over the exact old endpoint primary key and unchanged predicate/options. No physical retire call has entered. |
| While endpoint deletion is pending: selected resource remains PUBLISHED | Call real ServiceDefinitionsOwner.selectConsensusInstance for a valid successor request with current expected version/incarnation | Required PREDECESSOR_OUTSTANDING, unchanged selected binding/resources and original open native object. This is the enforced exclusion; elapsed time or absence does not grant a successor. |
| Endpoint delete resolves; driver receives canonical retained origin | Lifecycle admits exact retirement, matches complete intent+token, enters STOPPING, retains exact old object, applies metadata RELEASING, writes local RETIRED and closes native handles before metadata CLOSED | Native close failure keeps actual DB/object and original journal debt; no CLOSED, no REMOVE_COMPLETED, no successor permission. |
| Physical FINAL | Runtime projects old physical services key STOPPED, manager completes the original creation journal, handler emits original REMOVE_COMPLETED | Exact endpoint/native/CLOSED/row/journal outcomes measured separately. No lost-response or abrupt crash is inferred. |
| All predecessor resources CLOSED | Real owner selects next binding; new retained journals and actual handler CREATE build the next group | Require native PUBLISHED/serving, new physical identities, actual services/endpoints and original old journals completed. This proves progress after the same prerequisite returns. |
| Retry old exact retained-origin retirement through public manager.stopReplica | Existing origin-carrying adapter/runtime/driver path may finish old idempotent debt; sink may only touch old physical identity | New native DB/registered handler/current object/endpoint/services row remain unchanged. This is an exact-origin replay at its manager API, not a claim that a bare old handler REMOVE message itself carries a retained origin. |

## Proposed files and oracles

New `test/wasm-service/bound-remove-physical-operation.integration.test.js`, with
a small new fixture only if necessary. Root owns metadata/impact registration;
no production files are edited.

B-B1: real three-founder PUBLISHED setup; hold exact subject endpoint deletion;
assert zero calls to lifecycle.retireReplica before release and unchanged old
native state. Attempt valid successor selection through actual durable owner;
require PREDECESSOR_OUTSTANDING. Release and join original handler REMOVE.
Check exact retained identity observed at physical entry, original DB closed,
local RETIRED, metadata resource CLOSED, endpoint/services absent, original
creation journal COMPLETED and exactly one correct REMOVE_COMPLETED. Retire
remaining original founders through the same handler route. Select next binding,
retain and CREATE all new founders, form and require PUBLISHED. Replay old exact
retained manager handle; require no successor physical/endpoint/state effect.

B-B2: same actual PUBLISHED setup. Fail only old native Database.close, leaving
all other databases unchanged. Actual handler REMOVE must emit REMOVE_HELD and
retain exact open DB and object (CLEANUP_REQUIRED), original journal IN_PROGRESS,
metadata RELEASING and endpoint absent. New selection remains refused. Restore
close, redeliver same REMOVE request and require complete exact old retirement.
The fault is restored and every admitted task joined in finally. Setup or
missing-interface failures cannot count as a custody result.

Controls proposed for independent review: (1) change only retiringTarget's
full-origin matching to serviceId selection, so the final exact-old manager
retry wrongly fences the live successor; (2) drop/forge physical-close failure
so the bound handler falsely completes while old DB remains open, or omit the
host's retained failed object while making the same fault engage. Choose an
actual semantic divergence; a missing method, timeout or setup failure is not
a killed control. Freeze oracle bytes before root's exact-SHA locked-lab work.

## Boundaries and review

This closes neither generic legacy cleanup reachability nor request-Cell worker
termination, generic catalog deployment, cross-host metadata quorum, abrupt
process crash or whole U1. A protected schedule plus actual next-generation
progress is useful evidence; no source repair is required merely to make a
hypothesized race exist. If selection unexpectedly allows a successor or close
failure falsely completes, preserve the original result and independently
review the named interaction before source repair.

No native tests have run. Required next steps are independent updated design
review, test-only implementation/checkpoint, independent oracle review, actual
lab positives and meaningful negatives, then the unchanged integrated/U1 gates.

## Correction: selection is distinct from publication permission

The earlier proposed `selectConsensusInstance -> PREDECESSOR_OUTSTANDING`
expectation is withdrawn before test implementation or execution. Current
`service-instance-state.js:179-202` permits one next selection, moving the old
outstanding selected instance to retiring. It is publication grant that refuses
PREDECESSOR_OUTSTANDING (`:271-279`); a further selection while retiring remains
outstanding refuses TRANSITION_HELD (`:155-166`). This distinction is authoritative.

B-B1 therefore performs legitimate next selection plus manager retention of J's
original intent/token while I's exact endpoint deletion is held. It verifies the
real grant owner refuses J with PREDECESSOR_OUTSTANDING and leaves J ADMITTED.
Actual same-handler CREATE for J while I's memo is REMOVING returns IN_PROGRESS
with a CREATE_FAILED outcome carrying deferRetry and RETIREMENT_IN_PROGRESS
(`runtime-service-bound-creation-route.js:330-337`); this is the current named
retirement refusal, not the generic execution-gate ERROR response. Require no
J physical allocation and zero I physical retirement entries before release.
After I and its other founders close through their real handler operations,
redeliver the retained J CREATEs, form and require real PUBLISHED progress.
No second selection is needed for that positive. Final exact-I manager replay
must leave J intact as described above.

B-B2 may likewise select/retain J after I's close failure; require real J grant
refusal until the remaining I obligations close. A selector refusal is not
substituted for publication permission. Preserve selected versus retiring
resource observations by full binding, never by whichever instance currently
occupies the selected pointer.

## Test-only checkpoint after independent design review

`subagent:/root/control_source_review` approved the corrected B scope for
test-only implementation, explicitly excluding measurement and acceptance.
That review confirmed the endpoint-owner await precedes physical retirement,
J selection differs from J publication permission, and the same replica slot
is needed for the handler's retirement deferral. It required zero physical
retirement/construction entry at the barrier, all I resources CLOSED before
J publication, exact old manager-origin replay, and retained close-debt retry.
This is a scope/design decision, not an independent review of the files below.

Implemented unexecuted witnesses:

| File | SHA-256 |
| --- | --- |
| `test/wasm-service/bound-remove-physical-operation-fixture.js` | `dda23538bba6688cd6861227c4a1138cf7af44da7b9cc0ed9afb8dc3d4353973` |
| `test/wasm-service/bound-remove-physical-operation.integration.test.js` | `5e36ab913f580dffd67a027f5462e00dbd11c940a09f797d2ff8ac1fa23d070d` |

Both files pass `node --check` parsing only. No native test, semantic mutation,
lab run, project audit, Quest landing, push or acceptance has occurred.
The existing C6 embedding is unchanged. New wrappers observe physical
retire/create entry without changing decisions; the exact endpoint deletion
wrapper holds the old primary key and forwards the original predicate/options;
the close fault targets only the original native database object. The held
endpoint is released before bounded fixture settling, and each wrapper is
restored even when settling fails. The close-failure witness settles on any
actual REMOVE outcome before checking absence of success, so forged completion
is a semantic failure rather than an oracle waiting for a missing HELD carrier.

The final old-origin replay is a public manager STOP with the original
canonical retained origin and bootstrap descriptor. It is deliberately not
redelivery of an unbound handler REMOVE message after J occupies the slot.
All disputed native results remain pending the exact-SHA locked-lab owner.

## Frozen-source review correction: cleanup failure custody

Independent review by `subagent:/root/control_source_review` found that the
first checkpoint's `finally` blocks could replace a primary assertion/native
failure with a cleanup failure, and an endpoint-wrapper restoration failure
could skip remaining cleanup. That checkpoint is preserved above; no native
measurement was performed against it.

The corrected fixture's `withCleanup` records the action failure, attempts
every listed cleanup independently in order, rethrows the original object
when cleanup succeeds, and aggregates all failures when more than one occurs.
The endpoint case always attempts release, restoration, bounded settling and
observer restoration; the close-fault case always attempts restoration and
bounded settling. Existing embedding teardown remains a separate owner.

The final old-origin replay now has a fresh physical-entry observer. Its
positive requires exactly one retirement call with the original complete
intent and token, and zero construction calls. Native successor survival is
asserted immediately after replay, before cleanup draining, so a retargeting
mutation's semantic failure stays primary even if subsequent cleanup fails.

Revised frozen test bytes, pending independent approval and native execution:

| File | SHA-256 |
| --- | --- |
| `test/wasm-service/bound-remove-physical-operation-fixture.js` | `f11ef265730a036c342f7ad1344227ded9700046de70537643b1ac8dffe0af7f` |
| `test/wasm-service/bound-remove-physical-operation.integration.test.js` | `09a365dd29bb022821d2c16e4ee4f827d328c634a67a1eec70a56a57b41fe7c4` |

Both revised files pass parsing with `node --check`; this is still not a
behavioral measurement. No production source or shared existing fixture changed.

## Revised frozen-file decision and first measurement authorization

`subagent:/root/control_source_review` independently approved the revised
fixture `f11ef265730a036c342f7ad1344227ded9700046de70537643b1ac8dffe0af7f`
and test `09a365dd29bb022821d2c16e4ee4f827d328c634a67a1eec70a56a57b41fe7c4`
for a normal-hook non-main WIP checkpoint and first positive locked-lab
measurement only. The review checked primary/cleanup failure retention,
independent cleanup attempts, and one exact-old physical replay entry with
native successor survival checked before draining. No native result or mutation
approval is implied.

Root authorized this B writer to checkpoint only the two supported files,
this design and generated metadata/import graph, then measure the new B file
and existing C6 `bound-creation-handler-embedding.integration.test.js` on
`adams-gamla` through `labTestCommit`/`planClassifiedTestFiles`/`runLabTest`,
fixed full SHA, matching dependencies and retries zero. No alternate host,
raw SSH runner, local native execution, production edit or mutation is included.

The four earlier generic draft files were copied byte-for-byte, SHA-256 checked,
and moved outside test discovery to
`/mnt/data/peter/projects/.worktrees/generic-stop-custody-drafts-20261020/`,
preserving their relative paths. Their hashes are unchanged from their own
checkpoint. They remain unexecuted supplemental material and are excluded from
this supported witness's generated metadata and commit.
