# Stage 1c acceptance (2026-10-17): node-side bound CREATE/REMOVE routes, discovery rows, PRESENT mark by token, wake consumer in the C6 embedding

Quest `wasm-creation-genesis`, lane `work/rs-raft-event-reconciliation-20261016`.
Design: `ACTIVATION-DISCOVERY-DESIGN-20261017.md` (draft + Revisions 1-7, latest
wins). Scope: the sealed CONTRACT-R2 embedding scope (owner ruling 2026-10-17:
production activation is the separate quest chartered in
`solve/epics/raft-rs-full-cutover/activation-quest-charter-2026-10-17.md`).

## Claim accepted (node side)

Given an embedding that supplies the CONTRACT-R2 owners, a bound CREATE
delivered to the node's real `RuntimeServiceHandler` resumes its retained
creation first; HELD leaves the operation IN_PROGRESS with `CREATE_HELD`;
PUBLISHED projects the services row and the endpoint row through the existing
projection owner and endpoint writer (binding-first, one resolution shared with
the remover), marks the replica's services row PRESENT by exact token and emits
CREATE_ACTIVE; PUBLISHED_UNPROJECTED is confirmed against the metadata owner
like PUBLISHED; a bound REMOVE reads the creation journal-only and retires
through the manager (endpoint removed before CLOSED, STOPPED row after CLOSED);
the wake consumer is enqueue-only. The handler's local memo carries the
creation link under the custody table of Revision 7: in every memo state a
CREATE under any id leaves a creation-naming memo in place or hands the
replica to a retained creation by a named settle, and a REMOVE routes bound
whenever the memo names a creation.

## Rounds

| Round | Snapshot (pushed wip branch) | Implementer | Verifier verdict | Required finding |
|---|---|---|---|---|
| 2 | `04f1a9112` (`wip/rs-raft-serving-publication-3`) | Opus, 19 mutations killed | REJECT narrow (`verifier-1c-round1/verdict.md`) | V-F1: HELD re-entry under a different operation id lost custody |
| 3 | `9f83c7be3` (`-4`) | Revision 5 applied; 9 mutations | REJECT narrow (`verifier-1c-round3/verdict-r3.md`) | V-F2: the handler's CREATING tracking write was a second memo writer |
| 4 | `6b4208268` (`-5`) | Revision 6 applied; 7 mutations | REJECT narrow (`verifier-1c-round4/verdict-r4.md`) | V-F3: permanent failures re-entered like deferrals; a dead creation captured J's founder |
| 5 | `4bcf5f86d` (`wip/rs-raft-serving-publication-6`) | Revision 7 applied; 6 mutations | **APPROVE** on the node-side claim, lab PENDING (`verifier-1c-round5/verdict-r5.md`) | none; the custody table certified cell by cell; V-F1/V-F2/V-F3 class CLOSED for every memo state |

Evidence: `evidence/activation-discovery-20261017/` (`implementer-rounds/`,
`verifier-1c-round1/`, `-round3/`, `-round4/`, `-round5/`; SHA256SUMS per
directory). Design vets: `evidence/design-vets-20261017/`.

## Measured at the accepted tree (verifier round 5, clean tree)

- Witnesses: `test/node/runtime-service-bound-route.test.js` 44 assertions;
  `test/wasm-service/bound-creation-handler-embedding.integration.test.js` 3;
  `test/node/runtime-service-handler.test.js` 39;
  `test/runtime/service-runtime-consensus-publication.test.js` 16;
  `test/runtime/request-cell-definition-classification.test.js`;
  `test/wasm-service/wasm-service-lifecycle.test.js` 62;
  `test/wasm-service/wasm-creation-publication.integration.test.js` 25 (P11 green).
- Mutations: round 5 7/7 killed by the named witness (plus 9/9, 7/7, 12/13 in
  rounds 3, 4, 1; the one survivor, the PRESENT latch, was witnessed in round 3).
- Statics vs base `b3793c7e5`: fast-static ok; decision boundaries 0 new;
  eslint 0; complexity/cognitive 0 new (five inherited); literals 0 new (the
  repo-wide checker's 320 hits are outside the diff: lane debt for closeout
  step 3); silent-catch inherited only; `audit:shards` OK; `audit:impact-contracts`
  PASS 67/38 (one new coupled pair `runtime-service-bound-creation-route`);
  unused-export ratchet 1456 = base; test duplication 698/26458 = base;
  import-graph seal reproduced by the refresh.

## Lab (PENDING at acceptance)

The private lab was blocked from 15:07Z by the owner's UNCERTAIN prior job
(lab #159; lab issue #165). Queued, WAITING_APPROVAL: round-2 broad run
#161 (tv-dator, 28 files), #162 (adam-laptop, 29), #163 (adams-gamla, 28) at
`04f1a9112`, which classifies the unchanged files against the base (expected
base reds: `wasm-driver-contract-conformance`, `wasm-service-replica`,
`replica-transport-handler-identity`, `write-identity-instance`,
`durable-commit-replica-kinds`, `wasm-service-group-on-raft-rs`); round-5
changed-cone run #170 (lenovo-laptop, 18 files, `implementer-rounds/lab-selection-round5.txt`)
at `4bcf5f86d`. Rounds 3 and 4 cone jobs (#167, #169) were withdrawn as
superseded. The classification is appended below when the records land; until
then this acceptance is the node-side verification plus local runs only.

## Recorded, not changed here

- RV7.4 / V-N9 / V-N25: the memo is a cache of the creation link; the recovery
  stage decides journal-first custody reads and the REMOVE's journal
  dependency.
- RV4.5: a RETAINED production projection becoming PRESENT (activation quest).
- V-N21: the REMOVE-deferral memo lacks the `deferRetry` flag its outcome
  carries (no custody consequence; one-vocabulary note for the recovery stage).
- V-N18: `createGenericReplicaAsync` can overwrite a REMOVED (closed) named
  memo when the definition is no longer bound-class; nothing live is lost.
- RV5.6: the repo-wide literal baseline is stale at the lane tip (closeout
  step 3).

## Addendum A (2026-10-17): the pre-commit repair, rounds 6-7

The stage-1c commit was refused by the pre-commit hook's silent-catch check on
`src/service/service-consensus-creation-intent.js`: the comment-only catch in
`writeAndObserve`, inherited from the base `b3793c7e5` without a baseline
entry, surfaced because the round-2 helper extraction staged the file. Fixed at
the owner, never in the baseline: the write callback's answer is a named
record (`WRITE_ACKNOWLEDGED` or `{acknowledged: false, error}` from
`attemptWrite`); the reread still decides the row; a reread failure throws the
same UNKNOWN with `cause = {writeAttempt, readFailure}`. Round 6
(`ab5c70255`, a nullable `writeFailure`) was rejected narrowly (V-F4: a raw
null encoding a state is a decision-boundary hit); round 7 (`f518f3566`)
APPROVED: file-scoped decision boundaries 0/0/0 equal to the round-5 bytes,
silent-catch 0, eslint 0, complexity 0, fast-static ok, the seal reproduced
by the refresh, the lost-answer witnesses bind (mutation MA killed). Recorded:
V-N27, the double-failure `cause` is diagnostic only (every caller maps by
`outcome`), no witness drives write-throw plus reread-throw. Evidence:
`evidence/activation-discovery-20261017/verifier-1c-rounds6-7/`. The accepted
tree for the commit is `f518f356615ddc1a81d5f1fd44287b6834ade551`.
