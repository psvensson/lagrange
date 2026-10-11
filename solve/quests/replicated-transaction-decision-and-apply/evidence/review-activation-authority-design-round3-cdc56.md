# Participant release activation authority design re-vet — round three

**Activation verdict: REVISE.** The stable rendezvous, physical birth record,
ordinary-boot invocation split, real CLI/admin/CREATE budget sources, and
durable admitted-effect CAS are coherent design corrections. Seven remaining
grouped findings are reachable on the proposed production paths. Three are
protocol safety/liveness defects: the claimed Raft reservation is not an
existing operation-port contract, `CONSUMED` releases its fence before the
dependent actually resumes, and the unified four-slot owner can deadlock on a
nested control release. The normal-startup phase cut and its event-driven
reentry are also incomplete, retained snapshot recovery can fail before its
proposed C3 caller is reachable, and the proposed operator restore path
contradicts the repository's published restore policy.

**Linked C3 judgment: checkpoint and invocation shapes remain compatible, but
activation acceptance remains blocked by R3-1 through R3-5 and R3-7.** This review does
not reopen or approve the broader FreshMG C3 source, cleanup, two-REPLACE,
seed-loss, or full integration claims.

## Exact subjects and method

- Review worktree: `/mnt/data/peter/projects/.worktrees/tx1-work-20261010`,
  HEAD `e7c89f4b5114c0238312d3831b65889a4622f4e9` with the pre-existing dirty and
  untracked Quest implementation preserved.
- Activation subject:
  `solve/quests/replicated-transaction-decision-and-apply/design-participant-release-activation-authority-2026-10-11.md`,
  SHA-256 `9d1db249459a699c1b937f519e164a6df5c0976fd714008214e9d1c40f109330`.
- Prior round-two report:
  `review-activation-authority-design-round2.md`, SHA-256
  `38987c77ad76acd5f5a2ae1578cdf1abc6fda6ca76f44ea4e31b2be3f0f1082c`.
- Linked Fresh C3 subject:
  `/mnt/data/peter/projects/.worktrees/freshmg-integration-20261010/solve/quests/message-group-fresh-identity-membership/design-c3-automatic-replace-driver-2026-10-11.md`,
  SHA-256 `d008c1b0fdd8713e0e23c825212ee255ceb1e11ed7539b1956fcbceffed8b659`;
  the shared startup contract at lines 691-756 and recovery witnesses at
  800-835 were reread.
- The full round-three amendment (D:681-1027), the whole prior report, the ten
  applicable verification templates, the design-note template,
  `architecture/contracts/authority-and-recovery.md`, and the concrete startup,
  release, storage, admin, recovery, topology and Raft owners were read.
- This was a documentation-only review. No source, test, Quest log, commit,
  publication, or runtime/cluster action was performed. Only this report was
  created. C17 bytes were not touched.

Key current-source fingerprints used below:

| Path | SHA-256 |
| --- | --- |
| `src/raft/raft-rs-runtime-owner.js` | `218f3cf591502a7fb2a6f0db2f95cb3ab9a2df0ef9941f3eebee25ab1f022dca` |
| `src/raft/raft-rs-membership-transition-runtime.js` | `4f18719c50e631f3bdf9bdfc408dc46b098aa15f538ec4f1cb78c56fdfbe0744` |
| `src/raft/raft-rs-operation-port.js` | `19e4c8826a2429b02a6546431b32c4d31ee0dcc78d03bd7ed7cb5f2dedf5bad1` |
| `src/node/replica-handler-release-recovery.js` | `07594e7e2aeaae7305c0f39eddd6d5e6227a08e4de659e28b6e19a24125a41e3` |
| `src/node/replica-handler-participant-cutover.js` | `de7c59950179093519f5a161e61768df9c25759980e0618543bb6e076df0d271` |
| `src/bootstrap/bootstrap-service-seed-workflow.js` | `cf24ca03d57820f0870642034046556ad036bbe54b6c467e39a36f141344a8a6` |
| `src/bootstrap/phases/seed-cache-hydration-phase.js` | `d67b91a71d6665e75f0f188e0071cf5efabd0303a6baa012a56617ee4fc79c30` |
| `src/bootstrap/owners/bootstrap-topology-snapshot-owner-leader-identity.js` | `0f4a8d52510d46cc0e4710d59fbb3db51b83f2bb15fec52945abf179228f0ca5` |
| `src/storage/data-directory-process-owner.js` | `26317d935c35dfe438a698cd21533bf0fb98f63e908a57b46510a41e5c4ca150` |
| `src/bootstrap/startup-workflow-store.js` | `7bd5f8d95e4580d0ed62a72c499e7e6d23843d8c7b8a2e14a7047bb590347b65` |
| `src/partition/partition-service-raft-init-base.js` | `5277891dcbe618a7e3b5467b053142048af032f007ea7d5ee0c6dabfa0377e7a` |
| `src/raft/snapshot-install.js` | `0a6a75875c043693aef98314961f4f5637becea032cfbc0343575ba3baf6eb29` |
| `src/bootstrap/phases/seed-partitions-phase.js` | `3b86eede8a945086161ead9680521791aebd317568a2a50f0af829d8fd93b8a3` |
| `test/shards/impact-contracts.json` | `5b517d6b6c379f3ec93455a9f7e53b4de4f7a997826300ce44ed63987dca8eb2` |

## Prior findings corrected at design level

| Prior item | Round-three correction |
| --- | --- |
| R2-1 | D:696-733 retains the rendezvous permanently, refuses links/nonordinary or corrupt entries, and fixes lock order to outer then inner with a release-and-retry rule. |
| R2-2 | D:735-781 adds a no-follow marker plus directory/marker device, inode and digest, and supplies the missing parent/leaf/workflow-directory fsync sequence and lost-answer readback. R3-6 below is limited to the claimed restore escape path. |
| R2-3 | D:783-832 separates immutable birth authorization, ordinary workflow generation, and bounded startup invocation; it enumerates completed restart, abandoned boot, never-authorized storage, expired command, and retained C3 work. |
| R2-4 | D:834-862 correctly makes the CLI an intent-only adapter, admits it at `REGISTRATION_READY`, names `admin.queryTimeoutMs`, and preserves CREATE's original durable workflow timestamp. R3-3 is a new queue-composition defect introduced by D:864-880. |
| R2-5 | D:882-940 makes one revision-CAS `effect_admitted` record the permission linearization and explicitly keeps it non-revocable across late delivery, source retirement and restart. |
| R2-6 | D:942-999 correctly rejects use of the old `CUT_OVER` census as independently current and proposes a control-owner interaction. Its claimed implementation owner and consume lifetime remain unsound in R3-1/R3-2. |

## Remaining findings — category complete

### R3-1 — HIGH — the existing Raft “membership lane” cannot supply the promised cross-request reservation

D:950-975 says the operation port acquires a transient read reservation under
the existing group-wide membership lane, returns it to a remote dependent, and
prevents membership transition until a later consume/deadline/shutdown event.
That is not an existing owner operation:

- `raft-rs-runtime-owner.js:725-755` has one `enqueue` turn whose lifetime is
  exactly the returned work promise. A turn cannot both resolve a reserve reply
  to the caller and remain held until a later consume request.
- `raft-rs-runtime-owner.js:1565-1569` deliberately answers non-learner committed
  membership reads, including RETIREMENT, outside that queue.
- `raft-rs-membership-transition-runtime.js:166-182`'s
  `membershipTransitionFence` only rejects an older transition permit within
  the current membership generation. It is not a reader reservation and has no
  reservation ID, deadline, lifecycle release, or consume operation.
- `raft-rs-operation-port.js:406-423,425-431` exports a committed-membership read
  and a transition proposal, but no acquire/consume reservation API.

Holding the existing whole group turn until a remote consume would also queue
ticks, inbound drain, proposals and status-changing protocol work behind a
network round trip, conflicting with D:971-975's claim that only membership
transition is blocked. Conversely, resolving the turn with the reserve reply
leaves later transitions unblocked.

The design must state the actual operation-port contract expansion. A coherent
shape is a narrow, process-local **membership-transition** reservation installed
and validated in the group's serialized turn, checked by every
`PROPOSE_MEMBERSHIP_TRANSITION`, while normal Raft protocol turns continue. It
must name acquire/renew-or-consume/release outcomes, exact reservation key,
leader/runtime/lifecycle/configuration anchors, injected-clock one-shot expiry,
unref behavior, shutdown/reconstruction clearing, and the transition caller's
typed retry wake. It must not describe the current anti-stale permit fence as
that API. Required paired witness: a normal proposal waits/refuses while the
reservation is live but ticks/application proposals still progress, then the
same proposal reenters on exact release; leader loss, runtime replacement,
deadline and shutdown release without granting the dependent.

### R3-2 — HIGH — `CONSUMED` releases the control fence before the dependent resumes

D:977-984 says control consumes **and releases** the reservation, returns
`CONSUMED`, and only then the dependent resumes. Pause the reply after the
control leader releases its reservation. A waiting membership transition can
now commit before the dependent receives `CONSUMED`; the dependent then resumes
against the old population. D:991-994 calls that transition a later topology
event, but relative to the actual resume it is earlier. This is the exact
check/act race the current-population interaction exists to prevent.

The linearization must extend through the local resume actuation. For example,
`CONSUMED` may mark the proof ready while retaining the transition reservation;
the dependent rechecks deadline/lifecycle, performs the exact bound RESUME, and
sends a post-resume readback/ack that releases it. Lost `CONSUMED` leaves the
dependent closed; lost post-resume ack may expire the reservation only after
the owner can establish that resume happened before release. Any alternative
must establish the same causal order without converting transport ACK into
permission. Required schedules: delayed `CONSUMED` plus same-leader ADD/REPLACE,
deadline between reply and resume, lost consume reply before resume, lost final
release reply after resume, and fresh population reentry.

### R3-3 — HIGH — moving every release into the four-slot owner creates a nested control deadlock and no foreground fairness rule

D:864-870 moves seed, operator, CREATE and background work into the existing
four-slot `createParticipantReleaseRecovery` owner. The current slots are the
`running` map at `replica-handler-release-recovery.js:16-20,97-118`; direct
fresh-CREATE/operator calls at :133-175 do not currently consume them. Every
dependent cutover awaits control release first at
`replica-handler-participant-cutover.js:138-168,224-225`.

On a node that hosts the control leader, four dependent attempts can occupy all
four slots and each enqueue/await the control partition through the same owner.
The control attempt cannot obtain a slot, while no dependent can release one.
The same saturation can make an accepted foreground CREATE/admin/seed request
wait behind background work for its entire inherited deadline. Sequential
multi-partition submission does not prevent four independent background or
foreground callers from producing this state.

Specify one nonrecursive scheduling rule within the existing owner: control
release must be established before a dependent consumes a running slot, or an
exact local control request must join/execute the canonical control singleflight
inside the parent without requesting another slot. Then state foreground
admission/fairness, capacity-release wake, shutdown ordering, and the maximum
queue wait included in each absolute deadline. Required witness fills all four
slots with dependents plus background retries and a foreground CREATE, proves
control and foreground progress without exceeding four cohort phases, and
proves no priority/force path bypasses the owner.

### R3-4 — HIGH — the proposed activation checkpoint still blocks the read-only startup work the normal-restart milestone requires

D:838-844 retains activation inside `REGISTRATION_READY`. Actual seed ordering
is activation at `bootstrap-service-seed-workflow.js:345-363`, then cache
hydration at :365-376, then control-plane registration/discovery at :379-421.
The cache phase explicitly performs local authoritative reads, cache hydration,
CDC subscription/readiness and normal CDC wiring at
`seed-cache-hydration-phase.js:124-217`. All of that remains behind the
activation HOLD even though it can and must progress with ordinary mutation
admission closed on a normal restart.

The route currently consulted by dependent release is also a topology view
(`replica-handler-participant-cutover.js:145-151`). Its owner can source local
authoritative partition rows, but its public leader resolution still composes
published/raw/cache/retained views
(`bootstrap-topology-snapshot-owner-leader-identity.js:35-94`). The amendment
does not inventory which exact pre-hydration authoritative source finds a
remote control leader, how it refreshes after a same-leader configuration
change, or what happens when the restart node hosts no current control leader.

Define the actual normal-startup dependency cut: snapshot/authentication,
authoritative discovery, cache hydration and CDC subscription/reconciliation
that are read-only or already-admitted recovery must run while participant
mutation admission remains closed; activation still precedes the registration
**writes** that require an origin. Name each read/write and its owner, and give
fresh-first-activation and existing-origin restart separate noncircular paths.
Do not add a global readiness barrier or use cache projection as authority.
Required production-shaped witness is a normal multi-node restart with a remote
control leader and nonempty voters+learners: hydration/discovery/CDC advance
while user mutation remains refused, then full current population releases the
same held activation and registration writes proceed.

### R3-5 — MEDIUM — event-driven reentry remains a promise without reachable subscriptions

D:386-389 says row/service/consensus events “may wake” seed, and D:864-871 says
all callers share the existing recovery owner. The current owner subscribes
only to hosted-service and consensus events
(`replica-handler-release-recovery.js:121-131`) plus its one-second timer. It
does not subscribe to startup-workflow/command revision, topology/cache route
publication, message-handler registration, authorization-effect CAS, remote
population change, or capacity release as distinct owner events. Join has an
outer retry loop, while seed's current workflow marks every failure
nonretryable (`bootstrap-service-seed-workflow.js:473-484`); the amendment names
the future seed branch but not the concrete event-to-coalesced-queue wiring.

List, for seed/join/operator/background, every HOLD `missingFact`, the exact
owner event that can change it, the subscriber and coalesced enqueue key, and
the timer fallback. Capacity release must arm pending foreground work; handler
registration/topology/cache/command revisions must reenter the same owner; all
callbacks must be fenced by workflow/invocation/boot/shutdown and unref their
timers. Required witnesses must show each real event fires the retry earlier
than the fallback and that stopped/spent invocations log one exact identity
rather than silently suppressing rescue.

### R3-6 — MEDIUM — the physical-birth rule invents an operator restore workflow that the product explicitly does not have

D:759-762 assigns an in-place block restore that preserves physical identity to
“the explicit operator restore workflow.” The current product contract says
there is no supported backup, restore or PITR surface
(`docs/operations-readiness.md:135-149`, SHA-256
`955546e12c0e0a626989aa97cb5383176a7bb716027948da4d370d1703bca563`;
`docs/evaluate.md:184-193`, SHA-256
`ff3dc305cdec4acd93a91f026df78ceff3c6c501ead04b9d9aabf1ed643e7698`).
No owner or typed command for that workflow appears in D:1001-1023.

Keep the physical tuple as automatic same-directory restart evidence, but make
copied/restored/ambiguous storage a typed conflict under the current unsupported
restore policy. A future restore surface requires its own owner/design. Required
pair: legitimate restart on the original physical directory succeeds; copied,
recreated and operator-presented ambiguous storage refuse without minting birth
or claiming a nonexistent recovery path.

### R3-7 — HIGH — the proposed retained-snapshot recovery caller can be unreachable behind the partition initialization that needs it

The linked C3 design places the only normal retained learner recovery at
`CONTROL_PLANE_READY` after canonical repository and current NODES publication
(F:667-689), and says that owner then calls `recoverPendingSnapshotInstall`
under current CREATE authority (F:758-798). Current seed startup must first
complete `PARTITIONS_READY`; `seed-partitions-phase.js:120-300` constructs and
awaits each partition's `initialize()`.

`PartitionService.initialize()` synchronously calls
`resolvePendingSnapshotInstall` before opening the database and without current
CREATE authority (`partition-service-raft-init-base.js:299-358`). Any
`INSTALL_STATE_CONFLICT` throws and aborts that initialization at :341-346.
Repository search finds no production caller of
`recoverPendingSnapshotInstall`; its only definition is
`snapshot-install.js:724-751`, while current uses are tests. Thus a retained
replica that needs the proposed authenticated recovery can stop
`PARTITIONS_READY`, preventing the runtime from reaching both activation at
`REGISTRATION_READY` and C3 at `CONTROL_PLANE_READY`.

The design must identify the production startup disposition before generic
initialize: hold the affected replica out of the normal initialize batch and
carry its exact durable CREATE/artifact identity to the later owner, or move a
properly authorized recovery owner earlier without depending on current NODES
that cannot yet be published. Healthy control partitions and the canonical
repository/current-NODES path must continue with ordinary mutation admission
closed; one retained learner cannot become a new global startup barrier. The
solution must keep `resolvePendingSnapshotInstall` from deciding authority and
must preserve snapshot-install as the image/binding owner. Required witness:
an authentic STAGING, STAGED and post-rename marker on the normal seed and join
entrypoints reaches the claimed recovery owner, while healthy control services
reach canonical repository/current NODES, and then opens exactly the retained
CREATE generation; foreign artifacts remain a typed local conflict without
blocking unrelated startup progress.

## All 63 requested items

Disposition key: **P** = coherent proposed rule; **O** = implementation/proof
obligation, not a demand for existing implementation; **B** = blocked by a
finding above. Every item cites the proposed rule and/or current source seam.

| Item | Disposition and concrete evidence |
| --- | --- |
| A1 | **P/O.** D:737-781 and :911-934 bind physical birth/command effect at ENABLE; D:977-986 binds control population at RESUME. Implementation must reread the same stored effect/origin tuple at both seams. **B R3-2** for current population at actual resume. |
| A2 | **P.** D:809-827 and the D:623-633 result table distinguish transient HOLD, storage/authority conflict, `expired_pending`, abandoned boot and completed readback; none is empty success. |
| A3 | **P/O.** D:836-862 names startup invocation, `admin.queryTimeoutMs`, and original CREATE workflow timestamp; D:873-880 charges every await and queue wait. Tests must pin no retry/attempt rotation replenishment. |
| A4 | **P/O.** D:329-341 requires a thrown strict-own `STARTUP_CHECKPOINT_HELD`; D:956-968 supplies the reserve shape. Consumers must use the exported object code, never `String(object)`. **B R3-1/R3-2** for missing reserve/consume typed operations. |
| A5 | **B R3-5.** D:386-389 names possible events and a bounded sleep, but current recovery subscribes only service/consensus at `replica-handler-release-recovery.js:121-131`; command, route, handler and effect release events are unbound. |
| A6 | **P/O.** D:572-580 requires deadline/generation reread after every await; D:911-934 rereads source facts before effect CAS; D:980-983 rereads control lifecycle/term/config. **B R3-2** after consume reply. |
| A7 | **P/O.** D:329-341 and :625-633 require workflow/checkpoint/obligation/node/boot/deadline/missingFact; effect/reservation diagnostics must add exact effect, release, config and reservation identity. |
| Y1 | **B R3-5.** Join's actual outer loop is at `node-joining-admission-readiness.js:691-728`; the proposed seed/operator/background event sources are not wired to the coalesced owner. |
| Y2 | **P.** D:774-781 and :809-827 preserve frozen record/deadline and classify unreadable/mismatched bytes as refusal; absence/unreadability cannot refresh a window. |
| Y3 | **P/O.** D:623-633 enumerates typed exits and D:358-363 requires loud expiry/shutdown; implementation must log every queue, reservation and retry stop with exact identity. |
| Y4 | **B R3-3/R3-4.** Four nested dependents can starve their control release, and activation currently gates the hydration/discovery work that can release its route HOLD. |
| Y5 | **B R3-3.** D:864-880 states four concurrent cohorts, 1024 members, 1 s background and 100 ms election cadence, but lacks foreground fairness and a nonrecursive control-capacity calculation. |
| Y6 | **P/O.** D:911-940 linearizes permission at revision-CAS `effect_admitted`; late retries join/read back the same effect and origin rather than repeating mutation. |
| Y7 | **P.** D:821-825, :849-855 and :918-930 preserve debt across request expiry; transport ACK, progress and retry never renew the original request budget. |
| T1 | **P/O.** D:488-493 says ACK means processed only. Current client already classifies delivery and rejects `noHandler` at `participant-release-client.js:41-50`; new reserve/auth/consume calls must reuse this contract. |
| T2 | **B R3-2.** Effect CAS fixes late authorization, and D:988-994 rejects delayed old release before reserve; delayed `CONSUMED` after fence release can still resume after a newer membership. |
| T3 | **P/O.** D:488-493 names AUTHORIZED/HELD/CONFLICT/EXPIRED and bounded transport outcomes; all new interactions must flow through `classifyTransportDeliveryOutcome`, preserving `deferRetry/retryAfterMs`. |
| T4 | **P/O.** D:488-493 and :625-633 make missing source handler/gateway bounded HOLD/UNAVAILABLE under the inherited deadline; no await may hang past remaining time. |
| T5 | **P/O.** D:654-659 requires two real handlers, router serialization, redirect, noHandler and real success. Add reserve/consume and delayed-response schedules from R3-1/R3-2; helper-only stubs cannot close it. |
| S1 | **B R3-1/R3-5.** D:383-389 covers injected seed sleep/unref, but the proposed reservation deadline has no actual injected-clock owned timer or unref/release contract. |
| S2 | **P.** D:911-934 and :980-983 require source owner, leader/lifecycle/term/config checks; expiry/timeout returns HOLD/STALE and never authorizes. |
| S3 | **P/O.** D:814-827 clears/abandons volatile invocation only after physical/boot supersession while durable command/effect/origin debt survives; transient reservations clear on lifecycle loss. |
| S4 | **P/O.** D:873-880 explicitly allows slow settlement within the inherited deadline and retains closed admission/debt on expiry; prove boundary order with injected epoch time. |
| S5 | **B R3-1/R3-4/R3-7.** Reads/recovery are intended to progress while writes are paused, but a whole Raft group turn reservation would freeze protocol progress, the current checkpoint holds cache/CDC work, and an early install conflict can abort before the later recovery owner. |
| R1 | **P/O.** D:800-808 requires revision-CAS preserving immutable authorization and accepted command; recovery must skip/compare advanced effect/outcome state, never replace it from a stale snapshot. |
| R2 | **P.** D:809-827 separately defines completed normal restart, superseded pending invocation and first activation/no-birth storage. |
| R3 | **P.** D:818-825 and :836-844 make absent authorization or empty/unavailable population HOLD/operator-required; no empty plan is accepted. |
| R4 | **P/O.** D:774-781 and :918-940 cover marker/auth/effect lost answers and exact effect re-drive; required witness must interrupt each boundary and retain one identity. |
| R5 | **P.** D:710-715, :774-781 and :625-633 make corrupt/absent/unreadable metadata unavailable/conflict, never freshness or terminal proof. |
| C1 | **P/O.** D:696-733 supplies synchronous rendezvous+inner physical exclusion; D:764-781 adds durable fsync/readback and workflow CAS as async backstop. |
| C2 | **B R3-1/R3-2.** D:572-580 covers ordinary post-await checks and :911-934 closes authorization CAS TOCTOU; reservation installation/lifetime and consume-to-resume remain undefined/unsafe. |
| C3 | **P/O.** D:911-925 names revision-CAS `effect_admitted` as the single winner. Define deterministic effect-ID derivation and existing-effect exact-match behavior in implementation tests. |
| C4 | **B R3-3/R3-5.** The queue is intended to coalesce wake/timer/config drivers, but nested control reentry can deadlock and several wake sources have no subscriber/shutdown fence. |
| C5 | **P/O.** D:705-725 keys physical leaf/rendezvous locks; D:864-880 keys partition attempts; D:911-934 binds effect to operation/release/config; D:950-975 must add an honest control-group reservation key per R3-1. |
| F1 | **B R3-4/R3-7.** Actual startup performs partition initialization, then release in `REGISTRATION_READY`, then cache hydration/control-plane work (`bootstrap-service-seed-workflow.js:332-421`); the closed-admission read/write inventory is absent and retained install conflict can prevent reaching both later owners. |
| F2 | **B R3-4/R3-5/R3-7.** D:994 says cache is route-only, but does not identify a guaranteed pre-hydration authoritative route or bind its publication/change event to retry; linked C3 also depends on repository/current NODES behind the initialization it must repair. |
| F3 | **P/O.** D:836-862 preserves normal startup, configured admin and original CREATE budgets; no new client-visible window is proposed. |
| F4 | **B R3-3/R3-4.** D:873-880 includes queue/discovery/drain/origin/resume in one window, but cannot supply margin until nested slot progress and startup phase ordering are fixed. |
| F5 | **P.** D:1003-1027 keeps existing owners, no raw SQL, no second durable ledger, no global readiness barrier and no fallback authority. R3-4 requires reordering owner calls, not a bypass. |
| H1 | **P/O.** D:637-677 and :936-940/:996-999 require semantic failures at authority, durability, reserve, consume and resume transitions; setup/import failures do not count as red proof. |
| H2 | **B R3-7; O.** D:654-659 requires real handlers/router and D:1003-1023 names source owners. The normal `startLagrangeRuntime` seed/join entry must reach the recovery assertion; direct calls to `recoverPendingSnapshotInstall` cannot prove reachability. Add real admin/CREATE adapters and declare fixture simplifications. |
| H3 | **P/O.** D:727-733, :774-781, :936-940 and :996-999 prescribe latches around publication/fsync/CAS/reply/config changes; add the consume-before-resume timing from R3-2. |
| H4 | **P/O.** D:742-750, :788-797, :890-903 and :956-968 identify physical birth, boot/workflow, effect/release/config and reservation fields. Tests must use exact fields, not hand-built partial rows. |
| H5 | **P/O.** D:996-999 requires fresh full-population success; the normal-restart witness in R3-4 must use nonempty remote voters+learners and a genuine prior origin. |
| H6 | **P/O.** This review approves design rules only. Existing source proves ceilings: no reservation API, only two recovery event subscriptions, current phase order, and no production `recoverPendingSnapshotInstall` caller. Implementation must fingerprint exact changed bytes and not claim those ceilings as completion. |
| O1 | **P.** DataDirectoryProcessOwner owns storage birth/claim; StartupWorkflowStore owns birth/command/effect; Raft owner owns committed membership; release owner owns pause/origin/resume; census is evidence only. **B R3-6** for the unnamed restore owner. |
| O2 | **P/O.** D:1003-1023 places typed interactions at storage, startup, admin, CREATE, release and Raft owners. R3-1 requires explicit acquire/consume operation-port types rather than an assumed lane. |
| O3 | **P/O.** D:637-677 pairs refusal and success for birth, restart, command, CREATE, transport, settlement and HOLD; add reservation/normal-restart pairs and the reachable retained-install pair from R3-7. |
| O4 | **P/O.** D:988-999 requires stale old reply then fresh owner reserve/census reentry; R3-2 must ensure delayed consume cannot bypass that reentry. |
| O5 | **B R3-3.** The four-slot owner preserves backpressure in intent, but nested control work can consume all capacity and foreground priority/fairness is undefined. |
| O6 | **B R3-5.** D mentions event wakes, while actual owner exposes only service/consensus subscriptions and timer fallback; event-driven release is not yet a complete interaction. |
| O7 | **P.** D:944-954 and :988-994 make topology/cache route hints only; full census and Raft membership remain authority. |
| O8 | **P/O.** D:637-677 requires source fingerprints and real positive/negative treatments; expected negatives must be excluded from positive certification. |
| O9 | **P.** D:1025-1027 forbids fallback, second owner/ledger/timer/count cap. Fixes must stay scoped and must not add global readiness. |
| O10 | **O/B R3-4/R3-5/R3-7.** D:663-675 names the future impact contract and primary surfaces, but `impact-contracts.json` hash above has no live `participant_release_activation_authority` entry. Register actual startup/admin/CREATE/recovery/Raft/snapshot-init endpoints and normal-restart retained-install tests with generated classifications in the implementation Quest. |
| J1 | **P/O.** D:560-568 requires safe finite integer epoch milliseconds, rejects `-0`, fractions, unsafe values and overflowed sums. Apply the same lattice to reservation IDs' deadlines, generation indices, retry delays and cohort lengths. |
| J2 | **P/O.** D:329-341, :474-480 and :956-968 require strict own fields. Validators must reject inherited fields at every wire and durable-record boundary. |
| J3 | **O.** “Strict own” must be implemented by one capture/canonicalization of each external object; tests must prove getters execute at most once and cannot change between validation and digest/CAS. |
| J4 | **O.** Exact-field/null-prototype canonicalization and indexed dense-array reads must remain unchanged under polluted Object/Array/Map/Set prototypes; no design permission depends on enumeration side effects. |
| J5 | **O.** Primitive IDs/digests/deadlines/booleans in D's record and wire shapes must reject boxed strings/numbers/booleans, Symbols and exotic coercion. |
| J6 | **O.** The strict-own contract must cite and test frozen/captured intrinsics actually used for trim/regex/array/JSON/hash validation; this is boundary hardening, not arbitrary trusted-host protection. |
| J7 | **P/O.** D:752-754 type-pins physical decimal BigInt strings and SHA-256 marker digest; effect/authority/release/reservation digests must likewise type-pin primitives and canonical field order before hashing. |
| J8 | **P/O.** D:526-534 and :873-874 retain the 1024-member bound and require dense own unique arrays. Validate length/manifest before allocating or fanning out, and reject sparse/accessor/iterator-defined populations. |

## Required next design correction

One bounded amendment can close this round without implementation evidence:

1. define an explicit narrow operation-port membership-transition reservation,
   including timer/lifecycle and normal-protocol progress, rather than claiming
   the current read or anti-stale transition fence already supplies it;
2. retain that reservation through provable local RESUME actuation and release
   it only after a post-resume readback/ack or an equally strong causal protocol;
3. remove nested use of the four slots and state foreground fairness/capacity
   wake semantics;
4. place normal-startup snapshot/auth/discovery/cache/CDC read-only progress on
   a reachable pre-registration-write path while mutation admission stays
   closed, and bind every missing fact to a real coalesced wake source; and
5. replace the nonexistent operator restore workflow with the current typed
   unsupported-restore conflict policy; and
6. give retained snapshot artifacts a reachable authorized disposition before
   generic partition initialization can abort the startup that owns their later
   C3 recovery.

The highest CDC witness remains separate and open: normal production startup
must deliver the original committed CDC obligation without another user SQL
write, and lost ACK recovery must retain the same event identity and obligation.
This design review neither supplies nor substitutes for that witness.
