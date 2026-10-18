# Verifier verdict, stage 1c round 5 (corrective; design Revision 7): the memo custody table certified cell by cell

Independent adversarial verifier (Fable). Subject: `git diff 6b4208268 4bcf5f86d` minus the lead's documents (design
Revision 7, closeout plan, quest log, retained round-4 evidence): `src/node/runtime-service-bound-creation-route.js`,
`src/node/runtime-service-handler.js`, `test/node/runtime-service-bound-route.test.js`, `test/shards/impact-graph-seal.json`.
Read in `/mnt/data/peter/projects/.worktrees/verify-1c` detached at `4bcf5f86dcfb3ffc539f4ef47fa470b76d562a8d`
(`refs/heads/wip/rs-raft-serving-publication-6`; parent `6b4208268` = my round-4 tree). The prescribed import-graph
refresh REPRODUCED the committed seal (snapshotDigest `86f21e7f...`; `git status --short` empty after the refresh):
V-N19 closed by the implementer's `test:metadata:refresh`. Binding: Revisions 1-7 (latest wins), the three stage-1c vet
reports, my round-1/3/4 verdicts. Hard rules kept as before (no commit/stage/push/reset/clean/stash; refs untouched;
`git checkout -- <generated seal>` + `git checkout --detach` only; mutations restored byte-identically; every run through
`npm run test:file -- <file>` behind the thermal gate and the no-other-runner guard; no lab host).

## 0. Frozen delta claim (RV7.1-RV7.3 as implemented; RV7.4/RV7.5 recorded)

RV7.1 `settleCreation` spreads `{deferRetry: true}` into the memo for a DEFERRED decision (`route.js:109, :112`), the
same flag the outcome carries through `failureOptions`; a permanent FAILED settle records none and the named memo stays
(its `operationId` serves a bound REMOVE). RV7.2 `NAMED_MEMO_REPLIES` maps FAILED to `reenterDeferredCreation`
(`:246`), which re-enters only `existing.deferRetry === true`, else null -> `trackCreateRequest` tracks the request in
flight only (RV6.1) and routes it under its own id (a retained request takes the memo by a named settle; an unrouted
one is refused nameless, memo untouched). RV7.3 `refuseForeignCreation` (`:265`; handler ACTIVE branch `:363`): a named
ACTIVE memo and a request under another id -> CREATE_FAILED CONTENT_CONFLICT emitted under the request (`WORKFLOW_STEP.FAILED`,
`failureOptions`), reply ALREADY_EXISTS, no CREATE_ACTIVE, memo never written; same-id duplicate and nameless ACTIVE
unchanged (CREATE_ACTIVE re-announce).

## 1. Re-census of the FAILED-memo writers for the one vocabulary (brief item 3)

| Writer | Memo written | Carries `deferRetry`? | Should it? |
|---|---|---|---|
| route `settleCreation` DEFERRED (`:109-112`) | named or nameless FAILED | yes | yes (RV7.1) |
| route `settleCreation` permanent FAILED | named FAILED | no | no (RV7.1) |
| route `settleCreation` unrouted BOUND_ROUTE_REQUIRED / UNAVAILABLE deferral (nameless, only when the memo is nameless) | nameless FAILED, `deferRetry` on the UNAVAILABLE deferral | yes for the deferral (F-r5-1) | harmless: `replyToRetainedMemo` requires a named memo, so the flag on a nameless memo is never read; it is the outcome's own flag copied once (one vocabulary). Acceptable; restricting it to named settles would be equally correct. |
| route `settleRemoval` (`:358`) for the REMOVE deferral (read UNAVAILABLE) and for permanent REMOVE refusals | `{...memo, status: FAILED}` (named, spread) | no, in both cases | the outcome carries `deferRetry` for the REMOVE deferral but the memo does not: a vocabulary inconsistency without a custody consequence (a named FAILED memo without the flag is "permanent" to RV7.2: a CREATE proceeds under its own id, which is safe for a REMOVE-deferred creation, and a REMOVE re-drives bound through the kept `operationId`). Recorded V-N21; the lead may have `settleRemoval` record the flag for DEFERRED or state that the flag means "creation deferral". |
| handler `createGenericReplicaAsync` FAILED (`:478`) | nameless | no | no: the generic failure outcome carries no deferral |
| handler `removeGenericReplicaAsync` FAILED (`:743`) | nameless | no | no: same |
| handler `trackCreateRequest` | CREATING (nameless memos only) | n/a | - |
| `recoverLocalReplicaForRemoval` | row status (`active`) + hint | n/a | - |
| `registerExistingReplica` | caller's object | caller's | external, no `src/` caller |

No writer other than `settleCreation` produces a named FAILED memo that a CREATE would consult for re-entry; the
deferral/permanent distinction has one producer and one consumer (`reenterDeferredCreation`).

## 2. The custody table, certified cell by cell (U = runtime-service-bound-route.test.js (44); H = runtime-service-handler.test.js (39); PROBE = `r5/probes/facts.ndjson`, my own probe over the committed witness world: scripted runtime behind the real adapter, real manager over the SQLite journal and metadata owner, real emitter)

Columns: reply to the CREATE; memo after; outcomes emitted (type, operation id); resumes the manager saw; REMOVE routing afterwards (stops bound/generic, outcome).

| memo state | request id | witness | reply | memo after | outcomes (type @ id) | resumes | REMOVE afterwards |
|---|---|---|---|---|---|---|---|
| absent | the retained creation X | U C6-1; PROBE absent/same | INITIATED | HELD named X | CREATE_HELD @ X | [X] | bound; REMOVE_COMPLETED |
| absent | unrouted Y | U C6-4; PROBE absent/different | INITIATED | FAILED nameless | CREATE_FAILED BOUND_ROUTE_REQUIRED @ Y | [Y] | generic; REMOVE_FAILED (no replica; today's generic behaviour) |
| nameless CREATING | any | H "IN_PROGRESS for creating replica"; PROBE x2 | IN_PROGRESS | unchanged | none | [] | generic; REMOVE_FAILED (today) |
| nameless FAILED / REMOVING, native row | any | H :319; PROBE x2 | INITIATED | ACTIVE nameless (generic create) | CREATE_ACTIVE @ req | [req] (resume answers UNAVAILABLE/NOT_FOUND -> generic) | generic; REMOVE_COMPLETED |
| nameless FAILED / REMOVING, bound row, request = retained X | - | PROBE x2 | INITIATED | HELD named X | CREATE_HELD @ X | [X] | bound; REMOVE_COMPLETED (the route decides by the journal, RV2.2) |
| HELD named X | X | U C6-3, F9; PROBE | IN_PROGRESS | HELD named X | CREATE_HELD @ X | [X] | bound; COMPLETED |
| HELD named X | Y | U RV5.1 x2; PROBE | IN_PROGRESS | HELD named X (untouched) | CREATE_HELD @ X | [X] | bound; COMPLETED |
| FAILED named X, `deferRetry` | X | U RV6.2 retry, RV7.1; PROBE | IN_PROGRESS | HELD named X | CREATE_HELD @ X | [X] | bound; COMPLETED |
| FAILED named X, `deferRetry` | Y | U RV6.2 (P6); PROBE | IN_PROGRESS | HELD named X | CREATE_HELD @ X | [X] | bound; COMPLETED |
| FAILED named X, permanent | X | U RV7.1 (second half); PROBE | INITIATED (tracked in flight) | FAILED named X (rewritten identical) | CREATE_FAILED TERMINAL_OPERATION @ X | [X] | bound read -> TERMINAL_OPERATION -> REMOVE_FAILED (RV3.3, typed; custody kept) |
| FAILED named X, permanent | Y | U RV7.2 (P14); PROBE | INITIATED | FAILED named X (untouched) | CREATE_FAILED BOUND_ROUTE_REQUIRED @ Y | [Y] | bound read -> REMOVE_FAILED TERMINAL (typed) |
| FAILED named I, permanent (RESOURCE_CLOSED) | J's retained founder | U RV7.2 (P15); PROBE SEQUENCE | INITIATED | HELD named J | CREATE_HELD @ J | [J] | bound (under J) |
| ACTIVE named X | X | U RV7.3 same-id; PROBE | ALREADY_EXISTS | untouched | CREATE_ACTIVE @ X | [] | bound; COMPLETED |
| ACTIVE named X | Y | U RV7.3; PROBE; PROBE SEQUENCE (late I against J) | ALREADY_EXISTS | untouched | CREATE_FAILED CONTENT_CONFLICT @ Y | [] | bound; COMPLETED |
| REMOVING named X | X | PROBE (no committed witness: F-r5-3) | IN_PROGRESS | untouched | CREATE_FAILED RETIREMENT_IN_PROGRESS + deferRetry @ X | [] (nothing tracked) | bound re-drive; COMPLETED |
| REMOVING named X | Y | U RV6.3 (P5); PROBE | IN_PROGRESS | untouched | CREATE_FAILED RETIREMENT_IN_PROGRESS + deferRetry @ Y | [] | bound re-drive; COMPLETED |
| REMOVED named X | X | PROBE (scripted stop leaves the slot live: resume answers HELD); PROBE SEQUENCE for the real owner (slot CLOSED: RESOURCE_CLOSED -> permanent FAILED named X) | INITIATED | HELD named X / FAILED named X | CREATE_HELD @ X / CREATE_FAILED RESOURCE_CLOSED @ X | [X] | bound |
| REMOVED named X | Y unrouted | U RV6.1; PROBE | INITIATED | untouched | CREATE_FAILED BOUND_ROUTE_REQUIRED @ Y | [Y] | reply COMPLETED (already removed), no stop |
| REMOVED named X | definition no longer bound-class | round-4 PROBE P11 | INITIATED | nameless ACTIVE (generic replica) | CREATE_ACTIVE @ req | [req] | generic (V-N18: closed creation, harmless) |
| HELD nameless | any (same is undefined) | U RV6.4 (P8); PROBE x2 (F-r5-3) | ERROR {error, errorCode CORRUPT_LOCAL_MEMO, deferRetry false, nodeId} | untouched | none | [] | generic; REMOVE_FAILED (no creation named) |

Sequence (PROBE SEQUENCE, the stage's temporal cell 63 at this tree): I HELD -> bound REMOVE closed:true (memo REMOVED named I) -> owner RELEASING, CLOSED for I's token -> late duplicate of I's CREATE: INITIATED, resume(I) RESOURCE_CLOSED, memo FAILED named I without `deferRetry` -> J SELECTED, `prepareConsensusCreation` ADMISSION_RETAINED under `successor-operation-0` for the same canonical replica -> J's CREATE: INITIATED, `resumedIds` [J], memo HELD named J, CREATE_HELD @ J -> J granted PUBLISHED, OBSERVED wake -> QUEUED, re-entry resumes J, memo ACTIVE named J, CREATE_ACTIVE @ J -> a late duplicate of I's CREATE against J's ACTIVE memo: ALREADY_EXISTS, CREATE_FAILED CONTENT_CONFLICT @ I, memo J untouched -> REMOVE: bound (J's creation), REMOVE_COMPLETED. Every transition matches Revision 7.

Deviations from the table: none. Two cells the implementer listed without a witness (REMOVING named + same id; nameless HELD + same id) behave per the table in my probe (the code paths read no id); committed witnesses for them are optional (F-r5-3).

## 3. Findings by category (round 5)

No required finding. Recorded:

### V-N21 (recorded; one-vocabulary consistency) `settleRemoval` writes the REMOVE-deferral memo (journal read UNAVAILABLE -> REMOVE_FAILED + `deferRetry`) as `{...memo, status: FAILED}` without `deferRetry`, while its outcome carries it; the memo is then "permanent" to RV7.2. No custody consequence (the memo keeps its `operationId`; a CREATE proceeds under its own id - safe for a creation whose REMOVE was deferred; a REMOVE re-drives bound). Either record the flag there too or state that `deferRetry` on the memo means a CREATE deferral.
### V-N22 (recorded; F-r5-1) The flag is also written on nameless deferred memos (the bound-class UNAVAILABLE deferral, the pre-answer catch path); never read, since `replyToRetainedMemo` requires a named memo; the generic path is unchanged (H :319 green). Acceptable as RV7.1's literal reading.
### V-N23 (recorded; F-r5-2) RV7.3's CREATE_FAILED is emitted before the ALREADY_EXISTS reply, as the CREATE_ACTIVE re-announce always was (V-N16 precedent). Acceptable.
### V-N24 (recorded) In the committed-witness world the scripted stop never closes the slot, so "REMOVED named + same id" re-enters HELD there; against the real owner (SEQUENCE) the same cell answers RESOURCE_CLOSED and writes the permanent FAILED memo exactly as the table says. Both recorded; the table's statement is the owner's behaviour.
### V-N25 (recorded; carried) The handler's memo remains a volatile cache of the creation link (RV7.4: the recovery stage decides journal-first reads by replica identity); V-N18 (third nameless writer from a closed creation) and V-N9 (REMOVE's journal dependency) stand.

Checked and sound: every round-3/4 witness green (U 44); H 39; the lifecycle unit test still green at this tree (62); N green; publication integration green (P11); the seal reproduced by the refresh.

## 4. Mutations (authored from mechanism; applied once; catcher U gated; restored byte-identically; `r5/mutations/`)

| Id | Mutation | First failure (U) |
|---|---|---|
| R5B | permanent failure re-enters (`deferRetry === true` check removed) | `not ok 12 - RV7.2 (P14) ...`; `not ok 13 - RV7.2 (P15) ...` |
| R5A | deferral flag not recorded (`...deferral` dropped from the memo write) | `not ok 9 - RV6.2 (P6) ...`; `not ok 10 - RV6.2 the same-id retry ...` |
| R5C | ACTIVE branch emits CREATE_ACTIVE for a different id (`refuseForeignCreation` always false) | `not ok 15 - RV7.3 a named ACTIVE memo and a request under a different id ...` |
| R5D | foreign refusal writes the memo (`localReplicas.set(... FAILED, operationId: request)` added) | `not ok 15 - RV7.3 ... memo untouched` |
| M4B | FAILED removed from `NAMED_MEMO_REPLIES` | `not ok 9 - RV6.2 (P6) ...`; `not ok 10 - ...` |
| RA | re-entry resumes `params.operationId` | `not ok 1 - RV5.1 ...`; `not ok 2 - RV5.1 a wake during that re-entry ...` |
| RB | `writesMemo` -> true | `not ok 3 - RV5.2 ...`; `not ok 4 - RV5.2 the catch path ...` |

Seven of seven killed by the named behavioural assertion; every `*.sha-before` equals the restored sha256; `git status --short` empty after the chain.

## 5. Statics (clean tree; `r5/statics/`) and runs (`r5/runs/`)

| Check | Result | Versus base / round 4 |
|---|---|---|
| fast-static `--base b3793c7e5` | ok in 12.2 s | - |
| decision boundaries `--json`, 2 touched src (route, handler) | total 0, raw 0, inherited 0, baseline 806 | no baseline change |
| eslint, 3 touched JS | 0 problems | - |
| complexity scoped, 3 targets | 1 = `handleRemoveReplica` 14 (inherited, base) | 0 new |
| cognitive scoped | 0 | - |
| literals / silent-catch scoped (2 src) | 0 / 0 | - |
| runtime grammar | 0; pressure pass | - |
| `audit:shards` | OK 2409 (fnv1a32-8f7e78d2 / fnv1a32-4af5901f) | unchanged |
| `audit:impact-contracts` | PASS 67/38 | unchanged |
| `audit:file-size` | 26/27, 21/21 | unchanged |
| `test:unused:ratchet` | 1456 | = base 1456 |
| `test:duplication` | src+scripts 47/47, 1462/1462; test 698/26458 | = base 698/26458 |
| import-graph seal | committed seal reproduced by the refresh (snapshot `86f21e7f...`); tree clean | V-N19 closed |

Runs (gated, serial): U ok 44; N ok 3 (1.8 s); H ok 39; publication integration ok 25 (P11 green); lifecycle unit test ok 62 (unchanged since round 3, re-run as asked); custody-table probe ok 12 (deleted afterwards).

## 6. Lab - PENDING

#161-#163 (round 2, 85 files at 04f1a9112) and #170 (round-5 changed cone, request `c2c8e379100f441283bdc418e9842a65`,
18 files, lenovo-laptop, at 4bcf5f86d) queued WAITING_APPROVAL behind the owner's #159; #169 withdrawn. No record under
`~/.local/state/lagrange-lab/runs/` at hand-back. Classification recipe as in round 1.

## 7. What I did not read or run (counted)

Not read: the activation charter, closeout-plan and quest-log edits of this round (lead's documents); the retained
round-4 evidence copy (my bytes); the implementer's red-first logs beyond the report's table. Not run: the base tree;
any lab host; N under the round-5 mutations (U is their catcher; N and the lifecycle unit test were run green on the
clean tree); the other 14 lab-selection files locally.

## 8. Verdict

**PROVISIONAL (lab PENDING). On the node-side custody claim at 4bcf5f86d: APPROVE.** Revision 7's table holds in every
cell (witness or my own probe per cell, section 2), the I-then-J sequence holds end to end including the late
duplicate of I against J's ACTIVE memo, all seven mutations are killed by the named witnesses, the statics show no new
debt against the base, the committed seal is reproduced by the refresh, and every earlier witness of rounds 1-4 stays
green.

**The V-F1 / V-F2 / V-F3 class is CLOSED at this tree for every memo state the handler can hold:** absent, nameless
CREATING/FAILED/REMOVING/REMOVED/ACTIVE (no custody by definition; generic path unchanged), HELD named, FAILED named
deferred, FAILED named permanent, ACTIVE named, REMOVING named, REMOVED named, and the corrupt nameless HELD. In every
state a CREATE under any id leaves a creation-naming memo in place or hands the replica to a retained creation by a
named settle, and a REMOVE routes bound whenever the memo names a creation (permanent/TERMINAL answers typed
REMOVE_FAILED per RV3.3). The one nameless overwrite of a named memo left (`createGenericReplicaAsync` from a REMOVED
memo, V-N18) concerns a CLOSED creation and loses nothing. Premises recorded, not residual states: the handler process
is live (a restart is the recovery stage's, RV7.4/V-N9), and the memo is a cache (RV7.4).

Recorded, non-blocking: V-N21 (REMOVE-deferral memo lacks the flag the outcome carries), V-N22 (flag on nameless
deferred memos, never read), V-N23 (synchronous CONTENT_CONFLICT emission, precedent), V-N24 (REMOVED/same cell in the
scripted world vs the owner), V-N25 (memo-as-cache carried to recovery). Lab PENDING as stated.

This is the verifier's record; the lead records the verdict and decides the round. Not reported as done on anyone's
behalf.
