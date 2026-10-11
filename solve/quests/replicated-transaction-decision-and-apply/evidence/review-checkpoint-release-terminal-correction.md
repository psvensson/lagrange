# Independent F5 release terminal-evidence correction review

Date: 2026-10-11  
Reviewer: `subagent:/root/review_checkpoint_composition`  
Author: `checkpoint_implementation_56`

**Verdict: APPROVE the bounded two-path F5 correction on the exact bytes below.** Release settlement now uses the existing canonical participant-wire validators after exact request binding. Invalid terminal evidence retains the outstanding obligation; valid COMMIT, valid ROLLBACK, and a legitimate durable REFUSED/NOT_COMMITTED rollback all settle correctly. No new validator, decision algorithm, retry owner, or timer was introduced.

This does not approve the overall preservation composition. Prior F1–F4 remain open: missing committed schema installation, removed envelope admission check, missing settlement request/apply receiver, and incompatible participant fixture. No normal production startup, physical recovery, activation, or merge-readiness verdict is implied.

## Exact subject

W = `/mnt/data/peter/projects/.worktrees/rs-raft-recovery-chain-20261011`.
Branch `checkpoint/rs-raft-recovery-chain-20261011`; HEAD `10c2f0610f2924b8e7773497b03ac95fa4f42e58`.
The frozen staged tree remains `be8cd676baf918aa39e721ebde2678930e93ca4a`; the correction is an **unstaged two-file overlay**, not a new commit.

| Path | Corrected SHA256 |
|---|---|
| `src/query/distributed/distributed-transaction-release-settlement.js` | `904da2c331f1fc522623769c1def7683a108e2b49e1715f3e02778b6c580527c` |
| `test/query/transaction-release-settlement.test.js` | `bc67711f88234c158d858fd1a0ad637b5e2207c5e4f7d2c9e6b04574273f32b8` |

Author evidence A = `W/test-output/recovery-checkpoint-20261011/f5-release-terminal/`:

- `correction-manifest.sha256`: `97a9f1db78bd485f5b848a940b411ac24ead421082f8c59e23de58f3530e361c`.
- `correction.patch`: `58557169697a0366c849faf05bdcc80e8aa9ebb418b99a90835ab264c1dab265`.
- `semantic-red.log`: `b38f3906a393c51a1dd90fae7feae674bd24506f01ff09fb9de6f9445b0cd292`.
- `semantic-green.log`: `932453bef22223370ad26cf967b68904ce4881ce6db6b1ec59879bac99be1181`.
- `four-file-green.log`: `101f39c369e43e2e833d7eaaa2838ad1a5af1880dda133a76052f1756dec8b04`.

All hashes verified. `git diff --check` passes. The reviewer did not edit source, tests, metadata, index, Quest logs, or prior evidence.

## Correction and decisive proof

`participantAnswerComplete` at source lines 141–153 first calls `participantAnswerSnapshotOf(answer, expected)`, which captures strict own data and binds operation/partition/transaction/participant. It then invokes `committedAnswerOf(captured)` or `rolledBackAnswerOf(captured, true)`. These are exactly the validators used by the normal coordinator callbacks (`sql-query-engine-instance-initializer.js:219-232`). The old outcome-only/state-only terminal predicate is gone. The decision is already canonical COMMIT or ROLLBACK (`releaseRowOf:75-82`); the non-COMMIT branch does not admit a new decision vocabulary.

A failure returns false before `settleOne` can issue PROGRESS (`:196-203`). There is no await between binding capture and canonical tuple validation. A validator re-captures the safe null-prototype own-data copy, not the original input, so an original getter cannot be evaluated on a second pass.

Independent evidence E = `/mnt/data/peter/projects/.worktrees/rs-raft-candidate-20261011/test-output/continuation-20261011/checkpoint-release-terminal-review/`:

1. `node --test test/query/transaction-release-settlement.test.js`: **8 reported tests, 8 pass**. `review-f5-release-terminal-green.log`, SHA256 `7d450fe6e4ed0090fcffb22ff09f38ebc7c67178646fe4cc684df438e6bee867`.
2. `node --test test/query/transaction-review-adversarial.test.js test/query/transaction-coordinator-participant-protocol.test.js test/query/transaction-release-settlement.test.js test/query/transaction-evidence-binding-production.test.js`: **51 reported tests, 51 pass**. `review-f5-four-file-green.log`, SHA256 `92c6d3ecf6dc9801cd9087a318910c12a3a4c692a3a39a0841846cd4ec413423`.
3. Re-ran the prior independent `checkpoint-composition-review/release-answer-matrix.mjs` (script SHA256 `edcbda380d91f0e1fe0262377b54ddc9d0f643f313264804d549a6d84af6a388`) from W. Corrected result `E/review-f5-release-answer-matrix-green.json`, SHA256 `cc33ca22a30c60f4af5d26c9726c94338bf55b2056cfe932922cb82d4398e9f7`. Prior frozen-tree result remains separately retained as `checkpoint-composition-review/release-answer-matrix.json`, SHA256 `d2cafbda52c0782be82c87e1a6236b2257bf3ad5e65fbb97a65fb74442a32f42`.

The independent matrix retains complete durable rows before and after, every participant delivery and every settlement command:

| Evidence | Durable result after correction | Settlement command |
|---|---|---|
| COMMIT `durable:false, ACTIVE/COMMITTED` | COMMITTING/COMMIT unchanged | None |
| Valid durable COMMITTED/COMMITTED | COMMITTED/COMMIT | PROGRESS |
| ROLLBACK `durable:false, ROLLED_BACK/COMMITTED` | ROLLING_BACK/ROLLBACK unchanged | None |
| Valid durable ROLLED_BACK/NOT_COMMITTED | ROLLED_BACK/ROLLBACK | PROGRESS |
| Valid durable REFUSED/NOT_COMMITTED | ROLLED_BACK/ROLLBACK | PROGRESS |
| Foreign transaction, foreign participant, wrong operation (three cases) | COMMITTING/COMMIT unchanged | None |

For every case, transaction identity and exact decision text/digest are unchanged. Every attempted participant delivery carries the original bound decision. No DECIDE/FREEZE, remint, opposite decision, or application SQL reexecution occurs in the release algorithm. The normal outcome reader still accepts durable COMMITTED, prepared UNKNOWN and volatile UNKNOWN classes and refuses contradictory state/outcome pairs; no outcome-read fallback was added to release settlement.

The new production-engine witness (`transaction-release-settlement.test.js:128-224`) goes through SQLQueryEngine, its real coordinator and QueryExecutor, plus real SQLite transaction-state mutation SQL. It creates a real nonempty transaction, gets a durable COMMIT, refuses invalid bound and foreign replies while requiring whole-row equality, then accepts valid reentry under the same ID/decision. It asserts one PREPARE, four COMMIT attempts and no ROLLBACK. PREPARE term 1 is retained by the original evidence; this test does **not** enact a real leadership change, and its wording about an older term must not be promoted into leadership-change acceptance.

The participant transport is scripted. The `handleApplicationMessage` fixture calls the real `applyTransactionSettlement` inside SQLite directly; it is not the currently missing production partition receiver. These limits are material and unchanged by the approval. Invalid-data refusal and successful reentry are proved at the consumer where F5 occurred; normal startup and actual participant application remain separate obligations.

Author negative: eight reported entities, three pass and five fail. Four direct semantic failures engage the old acceptance defects: production-engine invalid COMMIT acceptance, malformed COMMIT, malformed ROLLBACK, and valid REFUSED rollback rejection. The fifth is their failed parent container, not an additional independent defect. The retained log names behavioral assertions; no import/setup failure accounts for the red. The earlier independent frozen-tree matrix supplies separate old-source semantic evidence, so this conclusion does not rely solely on the author's red provenance.

## Complete applicable checklist (41 items)

Notation: S = corrected `distributed-transaction-release-settlement.js`; T = corrected `transaction-release-settlement.test.js`; WIRE = `sql-query-engine-participant-wire.js`; INIT = `sql-query-engine-instance-initializer.js`; SET = `distributed-transaction-settlement.js`.

### Admission (7)

| Item | Verdict and evidence |
|---|---|
| A1 | PASS. S:142–148 binds then consumes WIRE:239/264, the same owner as INIT:219–232. No copied terminal predicate remains. |
| A2 | PASS. Independent matrix leaves invalid COMMIT pending with unchanged decision; legitimate REFUSED rollback becomes ROLLED_BACK through WIRE:264–279. |
| A3 | PASS, unchanged. S:191 receives the existing invocation time; the delta introduces no clock/deadline/attempt change. This does not certify the separately open activation deadline chain. |
| A4 | PASS. Canonical validators require strict success/durable/state/outcome tuples; exception maps to incomplete evidence at S:151–152, never a committed success. |
| A5 | PASS at existing consumer reentry. T:190–210 invalid→foreign→valid retains the same transaction; eventual valid result completes. Production driver reachability remains F3/open. |
| A6 | PASS. S:179–185 binds the current decision request's exact operation, partition, transaction and participant; capture and tuple consumption are synchronous. Foreign matrix controls remain refused. |
| A7 | PASS for delta. No new diagnostic fabricates IDs or failure reasons. Existing null result honestly means incomplete settlement; T whole-row equality and emitted messages identify the held transaction. Richer refusal diagnostics are not claimed. |

### Transport (5)

| Item | Verdict and evidence |
|---|---|
| T1 | PASS. WIRE:143–146 requires acknowledged true and refuses noHandler; canonical terminal tuple validation now follows it in S:145–148. ACK alone cannot discharge. |
| T2 | PASS. Expected request binding WIRE:149–153, S:179–185; independent foreign transaction/participant/wrong operation controls produce no PROGRESS. No new late-response handler was introduced. |
| T3 | PASS. WIRE:239–279 remains the sole terminal tuple contract. Refusal exceptions are handled as incomplete release evidence; normal coordinator disposition mapping is unchanged. |
| T4 | Unchanged bounded dependency. Delivery remains engine-owned and S:164–178 catches failed delivery. The missing production settlement receiver F3 remains explicit, not waived or given a fake success. |
| T5 | PASS with stated ceiling. T:144–164 scripts participant router replies, but SQLQueryEngine/QueryExecutor are real; T:182–187 directly applies the fixed settlement owner to SQLite. No production receiver/startup claim. |

### Recovery (5)

| Item | Verdict and evidence |
|---|---|
| R1 | PASS for changed acceptance. Invalid evidence returns before PROGRESS; T:192–200 compares entire durable row and E matrix retains each row. SET:181–183 preserves a terminal row instead of rewinding its status on an older progress request. |
| R2 | PASS. S:128 follows an existing canonical decision; T creates COMMIT through production engine before release. Changed code does not reconstruct or replace it. |
| R3 | PASS. T nonempty application partition and E matrix nonempty manifest exclude empty-fanout success. A missing participant answer cannot append to replies (S:179–186). |
| R4 | PASS at algorithm seam. T:211–224 requires one original PREPARE, four same-ID/digest COMMIT attempts, zero ROLLBACK. S only sends transaction decision operations; no SQL replay path added. Actual physical apply/restart is not measured. |
| R5 | PASS. WIRE canonical tuple requires durable terminal evidence; missing/malformed/UNKNOWN cannot become completion. The unchanged authoritative read at S:105–115 returns no authority on unavailable input. |

### Harness fidelity (6)

| Item | Verdict and evidence |
|---|---|
| H1 | PASS. A semantic-red log reaches false terminal advancement and valid REFUSED rejection; four direct failures plus one parent failure counted precisely. Prior independent matrix is the source-bound old behavior control. |
| H2 | PASS. Real engine/coordinator/QueryExecutor and SQLite with scripted participant delivery; direct settlement application fixture explicitly separated from actual receiver. No claim beyond that seam. |
| H3 | PASS. No production timer changed. T disables background recovery and stubs coordinator sleep; decisive malformed tuple is a definitive refusal, not expiry. Explicit release reentry proves ordering, not production elapsed time. |
| H4 | PASS. Positive fixtures now carry durable:true; production-engine decision and prepare evidence are full owner-created records. E includes full request/reply/row and canonical decision bytes. |
| H5 | PASS. T compares nonempty durable COMMITTING row unchanged, then checks preserved text/digest and emitted operation counts. Matrix covers both decisions and valid/invalid nonempty controls. |
| H6 | PASS. Exact two-file hashes and unchanged staged tree recorded; F1–F4 remain open. Eight/51 are local component counts, not canonical Lab/startup/merge acceptance. |

### Owner interaction (10)

| Item | Verdict and evidence |
|---|---|
| O1 | PASS. Canonical wire owner adjudicates terminal tuple; release decides only whether all owed participants have valid evidence (S:141–153). |
| O2 | PASS. Bound request identity plus canonical terminal response is one complete consumer contract. No added boolean option bag except the pre-existing bound-rollback validator argument `true`. |
| O3 | PASS. T:190–224 proves invalid refusal and successful same-ID forward recovery together; typed matrix proves malformed rollback refusal and valid REFUSED rollback acceptance. |
| O4 | PASS. Invalid then foreign then valid reentry uses the same delivery/validator path and unchanged durable decision. Old bad evidence is not stored as a permanent veto. |
| O5 | PASS for delta. No new retry, fanout, queue, memory collection, force flag or budget reset. Existing per-participant sequential delivery stays S:159–188; broader manifest resource work remains open. |
| O6 | PASS for bounded consumer correction / production dependency open. Explicit normal release function reentry succeeds in T; no new wake is invented. Actual startup/release driver and F3 receiver remain unapproved. |
| O7 | PASS. A reply alone cannot invent a decision: canonical durable authority precedes delivery and exact decision follows PROGRESS readback at S:191–210. Delta removes response-projection terminal shortcut. |
| O8 | PASS. Author correction manifest/patch and red/green logs hashed separately; independent old/new matrix outputs retained separately. Negative samples do not count in positive 8/51 runs. |
| O9 | PASS scoped search. Remaining normal callbacks use committedAnswerOf, rolledBackAnswerOf, transactionOutcomeAnswerOf in INIT:219–244; corrected release now imports the first two. S no longer compares hard-coded terminal outcome/state locally. |
| O10 | PASS existing registration. impact-contracts.json:4–27,1016–1048 covers the distributed-transaction prefix and this exact witness; primary:1502 unit, resource:1501 ordinary, subsystem:1521 query-sql. No new test path requires registration. Any later composition metadata regeneration remains its owner's task. |

### JavaScript input boundary (8)

| Item | Verdict and evidence |
|---|---|
| J1 | Unchanged. Delta adds no numeric domain or arithmetic. Existing canonical epoch and complete PREPARE safe-integer predicates remain the owners; no blanket approval of other manifest/deadline domains. |
| J2 | PASS. WIRE:143 strict own-data capture at binding, then same owner validators; inherited or missing identity/durable fields cannot authorize completion. `strict-own-data.js:71–104` accepts only own enumerable data descriptors. |
| J3 | PASS. Original input is captured once into a null-prototype record. Canonical validator re-copies that record; original accessors are rejected before invocation. No await occurs between capture and use. |
| J4 | PASS retained defenses. `strict-own-data.js:5–17` captures intrinsic references and rejects proxies/foreign prototypes; second snapshot is accepted null-prototype owned data. No guard weakened. |
| J5 | PASS. Canonical validators compare `success === true`, `durable === true` and exact enum strings (WIRE:239–279), replacing the weaker release predicate. Boxed/truthy values cannot satisfy these checks. |
| J6 | PASS within existing strict-input contract. New code introduces only calls to existing owners and enum equality. No expanded arbitrary trusted-host intrinsic replacement promise is made; existing strict-copy defenses preserved. |
| J7 | PASS unchanged. Decision bytes/digest come from canonical recorded authority, are reused in every delivery, and checked after settlement (S:170–174,204–207). E matrix confirms identical before/after bytes across every case. |
| J8 | No new materialization. Existing canonical participant arrays and sequential loop are unchanged; delta copies only the already captured response record. Aggregate manifest bounds remain separately open and are not certified here. |

## Scope conclusion

All five originally observed release behaviors now agree with the canonical owner: invalid COMMIT/ROLLBACK remain pending, valid COMMIT/ROLLBACK succeed, and durable REFUSED rollback succeeds. Exact request binding remains effective. No new finding blocks this F5 correction.

The source change is synchronous normalization at an existing consumer; it adds no retries, concurrency gates, sweep, or formation machinery. Consequently retry/concurrency/sweep/formation design checklists are not newly applicable to this two-path correction. The prior composition rejection and its F1–F4 findings remain in force until their independent repair review.
