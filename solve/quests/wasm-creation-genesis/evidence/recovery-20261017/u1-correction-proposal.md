# Recovery unit 1 corrective contract proposal — 2026-10-17

Status: DRAFT, for independent content-bound review before production edits.
Subject: recovery unit 1 at `a251ce4fd9c980a78c0fd33d8a5f873161f90870`,
source/test-identical to its published `d55cb368d` implementation snapshot.
This record supplements the approved recovery design's R2-A/R3-E reservation
custody and R1-A/R1-H restart composition. It does not change unit 2 or loosen
any existing acceptance term. The frozen original remains under a complete
independent review by `subagent:/root/verify_recovery_u1`.

## Exact reservation refusal belongs to the resource owner

`resolveRetainedReservation` may cancel a PENDING journal only after the
authoritative resource owner proves that the exact immutable binding/request
cannot now or later be admitted. The intent caller's copied list of outcome
names does not establish that fact. Independent real-SQLite witnesses show
both TARGET_ALREADY_OWNED and INVALID_EXPECTED_STATE can disappear after the
blocking resource closes, allowing the delayed original request to admit.

The existing `reserveInstanceResource` result retains its `outcome`, token,
phase and diagnostic fields. A refusal additionally carries the canonical
`reservationRefusal` enum from `src/constants/service-instance.js`:
`SEALED` or `UNRESOLVED`. Only the deterministic resource-state owner can
produce SEALED. The enclosing metadata interaction reports UNRESOLVED for
all other refusals, including read/submission/encoding failures. No caller
derives finality by enumerating outcome names.

The SEALED-producing decisions are the following exact state facts:

| State-owner decision | Why the exact request cannot later admit |
| --- | --- |
| Binding absent and `binding.selectionVersion <= state.version` | Selection versions are monotone, rows are retained, and an absent old binding cannot become selected again. A missing future binding is UNRESOLVED. |
| Requested ordinal below the slot's current ordinal | Slot ordinals never decrease. |
| Requested ordinal equals the current ordinal with a different operation or immutable request body | The exact ordinal already has its immutable winner. |
| A matching retiring binding would require a new reservation | The old binding cannot become selected again. Existing exact admissions still resolve ADMITTED before this rule. |
| Exact requested ordinal exceeds the supported counter range | This exact request cannot acquire a representable next ordinal. |

Temporary occupancy, a requested future ordinal, a never-created selection,
bounded CAS contention, unknown submission, unavailable metadata, and any
encoding or validation failure carry no finality proof. On a REMOVE-time
resolution they leave the row PENDING and answer UNKNOWN with the original
reason, hence REMOVE_HELD. A concurrently observed terminal journal still
uses the existing terminal-with-row-state answer. SEALED still performs the
existing PENDING-to-CANCELLED CAS and confirming reread; ADMITTED still
persists the exact token before retirement. No new journal or metadata state
is introduced.

## One startup inventory and one handler lifetime

The handler's restart latch also owns an irreversible stopped state. Shutdown
closes that lifetime before clearing volatile maps. A scan checks that same
lifetime after every awaited owner observation, before applying memos or
opening ready, and in queued continuations. A read-only scan suspended across
shutdown may finish reading but cannot write memos, open ready or begin a
creation/retirement. No shutdown waits for a suspended read merely to make
this fence effective.

Concurrent calls to `recoverRetainedCreations` share one startup task. After
successful application, subsequent calls reuse its result and cannot rescan
over live ACTIVE/REMOVING state. A failed observation before application may
be retried while that handler remains alive; retries never overlap. The
ready promise remains an inventory-applied signal, not a shutdown-success
signal; closing the lifetime cannot open it.

The same handler lifetime gates queued bound re-entry, wake consumption and
late bound-route memo/outcome settlement. It does not pretend that ignoring a
late answer undoes an admitted physical effect: that custody remains with
the physical lifecycle owner, below.

The RETIRED startup plan acquires the existing handler removal gate using
the same tracking method as a coordinator REMOVE. It proceeds only while
the current memo still names that creation and is REMOVING. It never
overwrites an in-flight operation. If a coordinator REMOVE acquired custody
first, that request performs the retirement and emits its own outcome. If
startup acquired custody first, duplicate REMOVE answers IN_PROGRESS and
the existing retry protocol observes its result. Startup emits no executor
outcome of its own, preserving R1-E.

## Physical lifecycle joins admitted retirement work

`WasmServiceLifecycle` already permanently fences fresh bound creation with
`consensusClosing` and retains exact replica objects until their stop settles.
By-path retirement also belongs to this owner: a release await can otherwise
resume into a local tombstone after the old process directory owner is gone.

The lifecycle registers each admitted exact retained-creation retirement
task before calling any asynchronous collaborator. Calls for the same
immutable intent/token coalesce to that task. Task records exist only until
settlement, and create no durable authority or substitute journal. A task
for a different retained identity is never joined as the same creation.

`shutdownAll` first sets its existing `consensusClosing` fence, then joins
the already admitted retirement tasks together with its existing exact
replica shutdowns. It cannot resolve while a task can still touch the local
path or close its metadata resource. New retirement calls after that fence
answer typed UNAVAILABLE without local or metadata effects. Failed live
replica cleanup remains retained through the existing retiring-replica
owner; unresolved metadata retirement remains owed by the original journal.
The composition releases its data-directory process owner only after this
physical lifecycle shutdown settles, as the existing contract requires.

## Required corrective witnesses

Preserve and adopt the independent delayed-reservation witnesses for both
temporary refusals, the actual owner-transfer inventory witness, and the
startup/coordinator REMOVE overlap witness. Add the independent repeated
inventory and admitted by-path retirement/shutdown witnesses when the
original category review completes. Each must fail the original mechanism
and pass the corrective implementation under the same classified runner.

Add direct owner distinctions for missing future versus irrevocably absent
old bindings, immutable conflicting/history ordinals, counter exhaustion,
and nonfinal submission/read failures. Include positive cancellation, later
admission after a temporary refusal, no task duplication, an inventory retry
after an unavailable scan, and no admission after shutdown. Independently
mutate the finality classification, lifetime fence, inventory coalescing,
removal gate and retirement join; record each named witness and first
failing assertion. Re-run the changed owner cone and classify inherited
reds without weakening gates or erasing historical evidence.
