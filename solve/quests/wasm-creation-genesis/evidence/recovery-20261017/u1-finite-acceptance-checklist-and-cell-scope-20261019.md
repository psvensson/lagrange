# Current U1 acceptance checklist and adjacent Cell shutdown scope

Date: 2026-10-19. Prepared by `subagent:/root/lifecycle_design_research`.
Read-only contract/evidence census; no behavioral execution or source/test edit.
This append-only checklist records pending work, not a new acceptance verdict.

## Acceptance subject and completed bounded evidence

The sealed quest is `quest.json`, sealed at
`f6c3698be77043ddd19e3a2a923a6d0ac6d2a9a9`. U1's narrower frozen claim is
identified in `verifier-recovery-u1-cloud/verdict.md:7–11`; the corrected claim
is v3 plus its approved addenda. The original 55-item implementation checklist
and nine applicable categories remain required by the v3 independent design
verdict at lines 25 and 126–141. This is a finite review of those obligations,
not permission to substitute newly discovered adjacent work for them.

- **Accepted earlier bounded recovery F1:**
  `u1-f1-executed-verdict-20261019.md` accepts reservation-finality source
  `77a888af01f13e30052135075964c6508b1d0b24`: original lab #235, three files,
  123 runner assertions, and meaningful source-only M01/M02/M03 at #262,
  #263 and #265. It explicitly excludes combined U1, U2, activation and
  release. The scope includes real component resource/journal owners and a
  scripted physical runtime, not native retirement.
- **Earlier coherent source approvals:** handler/inventory at
  `ac092686975dd22b4843be8df8e2e1d3663c0b7f` and physical/runtime/manager at
  equivalent `ed9c5ccc72873e9fd49b55d0ed523ec281beca5c` bind production tree
  `10a9c9d676d5b71e1b5d522f84882c596440e26a`. Physical findings P1–P4 are
  explicitly resolved there. Those approvals left combined execution and
  controls open.
- **Current oracle rulings:** the P-R8, revised restart/legacy, strict-read,
  reconstructed-five and dedicated pre-start ordering records now provide
  explicit bounded dispositions. The complete intended physical test is
  818 lines, SHA256
  `b22348a23a705765b92be5480737b2532d79aa90570fd0209554a2fa83de7d6b`.
  Its nineteen declared cases are not an executed assertion count.
- **Newest narrow source approval:** the generic REMOVE initial guard moved
  inside its existing `try/finally`, source SHA256
  `a8db277dc5bd861796d870478bd52397984e6e5d444a02000ad3604ff3af7f30`,
  is independently approved in
  `u1-remove-guard-source-and-prestart-order-independent-verdict-20261019.md`.
  Its test-only-before-source sequencing is recorded there. Its behavioral
  negative/positive pair remains a separate obligation.

No older multi-file pass becomes a pass for the new test tree by addition.
The missing 714-line physical checkpoint was not recovered; new tests have
new bytes and approval. Its old receipt/approval cannot be reused.

## Seven finite completion gates

| Gate | Evidence required to close it | Current disposition |
| --- | --- | --- |
| U1-1: exact source reconciliation | Rebind the unchanged approved physical/F1 owners and independently review the nine-path net production delta listed below, then include the separately approved one-guard correction at its exact hash. | OPEN: old coherent source approval does not cover the ten later production commits. |
| U1-2: immutable oracle checkpoint | Preserve the reviewed restart/legacy supersessions, strict owner-read options, reconstructed five and pre-start assertion order in a test-only checkpoint; record complete test tree and fixture hashes. Reapply only approved source afterwards. | Approved bytes exist; root owns final checkpoint/tree preservation. |
| U1-3: current static/generated gate | Complete the normal scoped source checks, exact changed-path cone, classifications/impact contracts and required generated metadata/seals; compare the resulting source/test trees before lab placement. Classify any inherited failure explicitly. | OPEN at the final corrected candidate; earlier static reports bind older trees. |
| U1-4: one exact positive selection | Execute all thirteen files below at one immutable corrected SHA under the classified Harnessd profile. Preserve terminal receipt, actual planned/completed files, exit, counts and complete first failures. | OPEN for these final bytes. A submission/placement or separate earlier runs cannot close it. |
| U1-5: meaningful source-only controls | Complete the six separate start/return controls and the remaining v3/control evidence map below with the full final test tree frozen. Record the actual decisive failed assertion and intact prerequisites. | OPEN. Historical missing-method/carrier failures and old F1 controls do not measure these new interactions. |
| U1-6: affected-owner compatibility | Account for relevant existing catalog/Cell/lifecycle/identity/storage and changed-owner tests required by TEST-PLAN and the actual cone, including inherited conformance failures and the adjacent Cell finding's precise scope. | OPEN; the thirteen-file focus is not asserted to be the entire changed-owner cone. |
| U1-7: independent combined conclusion | Reconcile all 55 checklist items, F1 plus F2–F6, source reviews, first results, controls and evidence ceilings against the final exact source. Explicitly accept U1 or list remaining defects. | OPEN. Only this bounded combined conclusion releases the U2 dependency. |

There is no requirement here to repeat every historical experiment merely
to obtain a fresh count. Existing evidence can retain its stated bounded
claim when its exact source/test/owner applicability is demonstrated.
Changed or missing witnesses, changed guarantees and the explicitly required
final-tree controls need new evidence. One control can close multiple matrix
cells only if its complete logs actually reach their decisive assertions.

## Nine-path production review gap

`git log` and `git diff --name-only` independently show ten production commits
between the approved `ac092686` source and `a55ab41296faf30a4c404c56117eacbaa993c903`:

| Change family | Commits | Net source paths requiring explicit review/rebind |
| --- | --- | --- |
| Corrupt journal isolation and global duplicate identity rejection | `ed6b3c5a3`, `39b09b1f4` | `src/service/service-lifecycle-manager.js`; `src/service/service-lifecycle-recovery.js` |
| Duplicate scheduled CREATE compares original retained origin | `d04dab162` | `src/node/runtime-service-creation-execution.js` |
| Tokenless cancellation versus physical retirement; ID-only memo projection | `588c34990`, `7919e405b`, `9d658acec` | `src/node/runtime-service-bound-creation-route.js`; shared `src/node/runtime-service-handler.js` |
| Bound/canonical target classification; strict legacy owner authorization and no forged memo | `f07ed5311`, `78b0364e6`, `5ce738450` | `src/bootstrap/shared/guarded-runtime-service-handler.js`; `src/bootstrap/shared/runtime-service-handler-setup.js`; `src/control-plane/replica-dispatch-service.js`; shared handler path above |
| Queued generic STOP uses admitted memo identity | `2ab37a85f` | `src/node/runtime-service-generic-replica.js` |

The newer source/oracle guard verdict approves only moving the initial check
inside `try/finally`. It does not approve this preceding net delta. Likewise,
P-R8 and the other test expectation reviews expressly are oracle rulings.
No later consolidated production verdict covering these nine paths was found
in the preserved top-level U1 review records examined for this checklist.
This is an identified review gap, not a claim that all ten changes are faulty.

## Exact corrected-candidate positive selection

Root supplied the exact twelve-file selection of lab #383 at `a55ab412` and
the planned addition of the existing lifecycle file, making thirteen:

```text
test/control-plane/replica-dispatch-reservation-identity.test.js
test/control-plane/service-instance-creation-cas.test.js
test/node/runtime-service-bound-route.test.js
test/node/runtime-service-handler.test.js
test/runtime/service-runtime-consensus-publication.test.js
test/service/service-consensus-creation-intent.test.js
test/service/service-consensus-creation-recovery.integration.test.js
test/service/service-lifecycle-manager.test.js
test/wasm-service/bound-creation-handler-embedding.integration.test.js
test/wasm-service/bound-creation-physical-custody.integration.test.js
test/wasm-service/bound-creation-restart.integration.test.js
test/wasm-service/operation-lifecycle.test.js
test/wasm-service/wasm-service-lifecycle.test.js
```

This records selection membership supplied by root, not an independently
retrieved #383 execution result. Earlier planned regression lists additionally
name the driver tests; U1-6 uses the actual final cone and existing contract
requirements instead of assuming the focus list supersedes every prior gate.

## Six explicit start/return source-only controls

All six remain distinct. The unchanged final physical test contains each
oracle. Remove only the named owning guarantee while retaining the complete
test tree, formats and valid setup. A setup failure is not a successful control.

| Control | Isolated source defect | Required first substantive effect |
| --- | --- | --- |
| P0 dedicated pre-start | Omit the physical-currentness half of `startBoundReplica`'s admission check; retain descriptor comparison. | `OLD_CONTEXT_STARTED_A_SUCCESSOR_THROUGH_SERVICE_ID`; reordered before carrier. |
| P1 manager prepare return | Permit stale STARTING in `projectCreationReplicaState` after actual READY returns. | J's actual manager record is replaced or mutated in the READY-return witness. |
| P2 driver physical return | Omit `projectBoundStart`'s post-PUBLISHED currentness check. | `LATE_PUBLISHED_DRIVER_RETURN_MARKED_HELD_SUCCESSOR_RUNNING` or the paired old-context effect. |
| P3 manager confirmation return | Permit stale RUNNING after the actual owner PUBLISHED confirmation. | J's actual manager record is replaced or mutated in the confirmation witness. |
| P4 runtime services return | Omit only the currentness check after `projectServicesRow`. | `LATE_SERVICES_RETURN_INVOKED_RETIRED_CREATIONS_ENDPOINT_WRITER`. |
| P5 runtime endpoint return | Omit only the currentness check after `writeEndpoint`. | `LATE_ENDPOINT_RETURN_INVOKED_RETIRED_CREATIONS_PHYSICAL_MARK`. |

P0/P2 are in `wasm-component-driver-consensus.js`; P1/P3 consume
`service-lifecycle-state-record.js` from the two
`service-consensus-bootstrap.js` awaits; P4/P5 are the separate awaits in
`service-runtime-consensus-publication.js`. P1's differing descriptor must
not be credited as an independent P0 control. Current source/site and exact
test hashes are recorded in the fresh reconstructed-five and pre-start verdicts.

## Remaining finite v3/control evidence map

These are the named mechanism groups from v3 sections 11–12, its addenda,
physical review and the approved clarifications. They do not mandate arbitrary
new mutants. Each existing required discriminator needs an explicit current
evidence disposition; grouping rows is not permission to omit their distinct
guarantees or to replace an intended effect with a timeout.

| Group | Required exclusion and paired progress/control |
| --- | --- |
| V1 inventory owner/lifetime | One recoverable observation, shared successful task, retry only after an unapplied failure; separately remove coalescing and stopped-lifetime checks across journal/local reads. No late ready/memo/work after shutdown. |
| V2 exact plans and canonical projection | Historical debts complete in both enumeration orders while J stays intact; no memo-ownership prerequisite for old cleanup or unconditional old STOPPED/STARTING claim. Exact retained F lookup must precede ACTIVE/HELD/REMOVING memo routing; F's original request survives until its real prerequisite and trigger. |
| V3 handler execution custody | Both startup/coordinator admission orders, captured REMOVE target, exact-entry late settlement, bounded observer/identity and thrown-call release. Removing the shared gate or using a later memo as target must expose duplicate/wrong-owner effects. An unresolved I releases its attempt for queued J without self-retry or dropping I's debt. |
| V4 ordinary HELD wake | Removing J's bounded memo wake bit must fail `ORDINARY_J_WAKE_WAS_LOST_BEHIND_F`; omitting current physical/memo checks must expose stale reentry. Foreign/RESOURCE_CLOSED/unavailable-grant wakes retain their no-pending-work controls. |
| V5 physical currentness/identity | D2's complete state table; `!live => ABSENT`, `.live` as CREATED start admission, token-only comparison and premature bookkeeping deletion must be distinguishable. Full-body same-operation retirement conflict must fail before resource release (`CHANGED_BODY_ENTERED_RESOURCE_RELEASE_BEFORE_ORIGIN_CHECK`). |
| V6 admitted physical task population | Register before synchronously reentrant collaborators; coalesce only exact identity; join by-path work held at release/close before directory release. After-fence calls have zero effect. Failed cleanup/ordinary-stop joins retain tombstone debt and allow the owned retry. |
| V7 physical/journal/projection finality | Actual RETIRED plus HISTORY_UNAVAILABLE is FINAL without fabricating CLOSED; missing storage is nonfinal. Removing STOPPED/debt/confirming-journal guards must expose unresolved original rows or premature completion. The actual stopped projection owner control must fail `STOPPED_OWNER_FORGED_ORIGINAL_JOURNAL_COMPLETION`. |
| V8 legacy authority/handler lifetime | Exact original operation and both strict read options; unavailable authority remains retryable, wrong entity cannot publish a forged memo, delayed owner answer cannot admit STOP after replacement. These are scoped repository/handler consumer witnesses unless an actual owner is composed. |
| V9 newest generic gate correction | Restore the initial memo check outside `try/finally` with the unchanged handler tests. Require `SUPERSEDED_QUEUED_REMOVE_RETAINED_EXECUTION_GATE` and the paired subsequent cleanup-admission discriminator, then corrected-source success. The late-STOP gate assertion is a separate already-inside-finally sibling control. |

The original thirteen M01–M13 controls remain historical evidence bound to
the rejected old U1 subject; the separately accepted F1 three-control package
has its own scope. Their existence does not settle V1–V9 or P0–P5 on changed
source. The final reviewer should map preserved valid bounded evidence and
new actual results, rather than claiming all old controls executed unchanged
on the newest candidate.

## Generic queued START versus U1 scope

**Disposition: an adjacent, same-class physical-lifetime finding, not automatic
authorization to expand the sealed native U1 implementation.** It cannot be
called harmless or closed. Its composed witness and any repair need their own
bounded review. A U1-introduced regression or demonstrated shared bound effect
would make it U1-blocking regardless of this provisional lane separation.

The boundary is grounded in owners and text: HANDOFF-INTERFACES lines 7–12,
31–33 and 44–50 keep request Cells on their existing path/semantics; v3 section
6 names bound continuation triggers and section 10 names
`WasmServiceLifecycle` admitted retirement custody. The actual driver at
`wasm-component-driver.js:407–430` rejects bound/Cell mixing before choosing
the separate Component-runtime branch. C13 and TEST-PLAN's final changed-cone
requirements still require Cell compatibility; the scope does not waive them.

The Component owner's queued-START population and the seed shutdown ordering
already existed at the quest seal. Git objects are identical at `f6c3698`
and `a55ab412`: Cell runtime blob
`0f811447f1c21ee284e4b60bbd4b3468ec5ff02c`, seed-cleanup blob
`0287cf73af1cd8387fb5422933995172da8a1686`. This establishes source lineage,
not an executed inherited failure classification. The finding is that Cell
`operations` already contains a START while `shutdown` snapshots only
`cells`; later driver/runtime cleanup can lose its physical handle. The
composed owner-ingress experiment must establish that mechanism and its
actual physical population, with a normal CREATE positive.

Therefore U1 can claim only its exact bound retirement/currentness scope.
A broad claim that whole-node shutdown joins all admitted physical work is
blocked by this unresolved finding. If the new Cell witness enters the required
final compatibility cone, its failure must be explicitly resolved or classified
with valid predecessor evidence; it must not be hidden by a suite label.

## U2 and later boundaries

U2 source **and test implementation** remain gated on independent approval of
complete corrected U1. The approved U2 notification amendment is design only
(`u2-progress-independent-contract-verdict-20261018.md:5–12`). U2 owns the
offline local-grant admission, notification-progress implementation and its
actual C9 process-recovery proof excluded from the original U1 claim.
Its cadence guarantee is opportunities within at most K qualifying delivered
APPLIED_PROGRESS notifications, not completed writes, completed confirmation
or elapsed time. Its stated queue/lifetime/first-wake/native-batching controls
remain required when U2 opens.

Production restart composition, activation A5's retained-to-applied and
still-pending-writer lifetime, full quest C1–C13 receipts, Set A/Set B closure,
global corpus and required multi-machine certification remain their named
later gates. U1 acceptance alone grants no main merge, runtime drain/propose
change, request-Cell redirection, activation expansion or full-release seal.

## Principal input byte bindings

| Record | SHA256 |
| --- | --- |
| `quest.json` | `8abb6047248e56341a1f9d703a79f9725dae8323b42722d3acd782ee78b72944` |
| `CONTRACT-R2.md` | `f086f2edb4126221be2834f8d15b688e836472286d8f3da544aa8e1d5f6e6224` |
| `HANDOFF-INTERFACES.md` | `73ce46f2cb6828d5a07fa5e7811152929314de9be97f777af2b1d62524470cea` |
| `TEST-PLAN.md` | `4dd2f339e4cf78b1451789596581a86e420e5bb12bc14136675dfe8833b6d04d` |
| v3 contract / addendum | `6f010cc376fd3ff6bd0d7d07892636967eb3ad343915364f4c80a35c5450c048` / `401f90a5f09a3056573ee1d8ab8b57cee6135c721355295e0e1506ceb93303ae` |
| F1 executed verdict | `77e520ec447af40ad2874670e877fe100e85e5e4de8720f0e3e3df019ed2d237` |
| Handler coherent source verdict | `f858da2c73f26259df29767bb54957601330ec819d380cf5035e6ed1184a5a76` |
| Physical coherent source verdict | `738d6c942ad1c5c0b93df55b26dd39cbc48f0810f8bcedcb0c46d8b0459555a2` |
| U2 notification contract verdict | `aad57d5dcf6c3d4beb5456c5147e870fdc373ad590e13cf7a516495d61457743` |

Later completions should add exact receipts/verdicts against these identified
gates rather than rewriting historical failures or silently changing scope.
