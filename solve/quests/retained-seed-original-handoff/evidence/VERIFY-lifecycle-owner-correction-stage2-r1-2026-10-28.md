---
audience: development
documentClass: planning
---

# VERIFY: lifecycle-owner correction stage 2 (Q4 alias-aware writer census, Q3 owner as sole allocation-field writer), round 1

Verifier: Fable (independent; did not write the change). Report date 2026-10-28 per the brief (machine clock 2026-10-25).

## Verdict: APPROVE for composing 4121eb8c2 onto the lineage

Every claim in the brief reproduces on my own runs (per-claim table below). Owner decision 3 of 2026-10-26 is
implemented as stated for Q3 (the lifecycle owner is the sole writer of the allocation fields and rights
transitions, through owner-defined operations enforcing identity, permitted transition and typed refusal
without a write) and Q4 (the census detects writes behind imported table-name aliases, failing witness first;
the real-tree census returns exactly the owner at the commit, at its parent only after the store is deleted,
and on the lineage head merged tree). The fresh-seed requirements the rights writer must serve hold on the
operation (UNUSED -> SUBMITTED -> TRANSFERRED only, lost answer resolved by exact committed readback, never a
reset; every refusal performs no write). Findings F1-F10 are recorded; none is required for composing. The
delta does NOT merge cleanly onto the current lineage head: one one-line conflict in the unused-export
baseline comment block plus the usual derived-metadata regeneration and a 1411 -> 1410 tightening on the
merged tree (section "Lineage merge"); that is landing work, not a change to 4121eb8c2.

## Identity

| What | Value |
| --- | --- |
| Subject commit | `4121eb8c27bdd9e19f313604a519a80cd7182182` = `work/lifecycle-owner-correction-stage2-20261027` (pushed) |
| Parent (base) | `9fe3d5481e1b1e1f89b011f07e493bc6e905b396` (lineage head at branch time; stage 1 composed there as `794b3e6a7`) |
| Stat | 22 files, +938 / -412: 2 scripts, 4 src (store deleted), 10 test (+1 new witness), 1 inventory, 4 shards/seal |
| Lineage head | `origin/work/mg-delivery-resume-r2-20261023` fetched = `b4b2d59e3601bfaacd6c67676391741cf36e14bd` (one docs commit past `1cb0e13eb`, which is an ancestor; `794b3e6a7` on it); merge-base with the commit = `9fe3d5481`; lineage advanced 20 commits since (TX1 `b21a2c816`, pgwire `a8f2b29c2`, public-API removal `c70285ce7`, unused tighten `65c6b929a`, docs) |
| Scratch worktrees (detached, node_modules symlinked from the primary checkout, removed at the end) | `scratchpad/lc2v/wt-commit` (4121eb8c2), `scratchpad/lc2v/wt-base` (9fe3d5481), `scratchpad/lc2v/wt-lineage` (b4b2d59e3 + dry-run merge) |
| Source worktree read only | `/mnt/data/peter/projects/.worktrees/lifecycle-owner-correction-stage2-20261027` (clean, HEAD 4121eb8c2); `git fetch origin work/mg-delivery-resume-r2-20261023` run from it (shared remote-tracking ref updated, as the brief asked) |
| Not touched | `/mnt/data/peter/projects/lagrange` (its `node_modules` symlinked only) |
| Thermal gate | `scripts/checks/wait-for-thermal-headroom.js` before every heavy phase (three 30 s holds at 76-77C, then ok); one heavy job at a time |

## Per-claim table

| # | Claim | Verified where (file:line at 4121eb8c2) | Result |
| --- | --- | --- | --- |
| Q4.1 | `exportedConstants` memoized and cycle-safe | audit `:313-329` (`tables.exports.set(file, exported)` before recursing `:321`; partial table on a cycle) | HOLDS |
| Q4.2 | `importedConstants` covers named imports under any alias, namespace members, `export {X as Y} from`, `export *`, local aliases | `:359-383`, `:331-356` (`addExportedConstants`/`addNamedExportConstants`), `stringConstants(tree, imported)` `:270-290` seeds locals from imports | HOLDS: my V20 (renamed re-export), V21 (`export *`), V16 (namespace), implementer's "local alias" all CAUGHT |
| Q4.3 | `literalValue` as a resolver table | `:177-223` (`LITERAL_VALUE_OF` `:211-217`); scoped complexity: base `literalValue` 20 gone | HOLDS |
| Q4.4 | `sqlText` fills resolvable parts, keeps unresolvable interpolations as `?` | `:385-404` (`AUDIT_SYNTAX.UNRESOLVED` `:99`) | HOLDS (see F1 for what `?` in the TABLE position means) |
| Q4.5 | `lifecycleSqlWrites` reports once at the outermost string | `:408-428` (nested set) | HOLDS: V7 concatenation reported once by the new audit; the old audit reported it twice |
| Q4.6 | `LIFECYCLE_WRITE_SQL` INSERT/UPDATE/DELETE/REPLACE/ALTER/CREATE/DROP on both tables | `:134-135` | HOLDS: V5 INSERT OR REPLACE, V6 WITH...UPDATE, V15 DROP, V19 two-statement exec, V24 UPSERT, V8 upper-case, V14 lower-case keyword, V9 quoted identifier all CAUGHT |
| Q4.7 | `lifecycle-sql-outside-owner` emitted per module outside the owner | `:604-607` | HOLDS |
| Q4.8 | `lifecycleTableWriters({root})` exported `:661-672`, consumed by `operation-port-boundary.test.js` | audit export `:688-690`; test `:182-186` (`assert.deepEqual(lifecycleTableWriters({root: ROOT}), [owner])`) replaces the `UPDATE\s+\$\{LIFECYCLE_TABLE\}` regex | HOLDS |
| Q4.9 | Real-tree census = exactly the owner | my run on wt-commit: `["src/raft/raft-rs-replica-lifecycle-owner.js"]`, all violations `[]`; on the merged lineage tree: same | HOLDS |
| Q4.10 | Witness red on the stage-1 source: store = second writer, four sites | new audit over wt-base: writers `[store, owner]`; four `lifecycle-sql-outside-owner` in the store: `ALTER TABLE ... ADD COLUMN ? TEXT`, the PREPARING `UPDATE ... SET ? = ?, ...`, the ISSUED `UPDATE ... SET ? = ? WHERE ...`, the transition `UPDATE ... SET ? = ?` (`logs/census-real-trees.log`); implementer's `witness-red-stage1-src.tap` shows the same leaf red | HOLDS |
| Q4.11 | Old census misses 8/8 alias-write and 5/5 re-export mutants | replay of the committed witness table against the base audit: writer table RED 8/10 (exactly the 8 detected rows), re-export RED 5/8 (exactly the 5 refused rows); against the new audit 0/10, 0/8 (`logs/witness-table-{old,new}-audit.log`) | HOLDS |
| Q4.12 | F1 indirect re-export refused: `export {op}`, `export {op as x}`, `export const x = op`, `export default op` | `lifecycleReexports` `:619-635`, `exportedBindings` `:637-652`; my R1 (`export * from`), R5 (`export {op as default}`) REFUSED | HOLDS for the listed shapes; see F2 for the shapes it does not cover |
| Q4.13 | Witness 20 leaves | `lifecycle-table-writer-census.test.js`: 1 real-tree + 10 table + 1 owner-is-writer + 8 re-export = 20; 20/20 at the commit and on the merged tree | HOLDS |
| Q3.1 | `prepareOriginalAllocationRow({db, declaration, member})` `:551-584`: current-schema ALTER per missing column, then the PREPARING write of the five columns inside `commitOriginalWrite` | SQL and `.run` argument order identical to the store (`Object.values(COLUMN)` order both sides); the readback predicate checks the same five columns + `native_history_state` | HOLDS; probe B7 (second call IDENTITY, no write) |
| Q3.2 | `markOriginalAllocationIssued` `:586-612` PREPARING -> ISSUED compare-and-swap | same SQL/WHERE as the store; probe B3a-d: second identical call changes 0 rows and returns (readback already ISSUED, idempotent - R14), a different declaration -> INCOMPLETE, a SUBMITTED right or ESTABLISHED history -> INCOMPLETE with ISSUE still PREPARING, two connections on one file: one UPDATE changes a row, the other is a 0-row CAS resolved by readback | HOLDS; see F3 (the brief expected OBSERVATION/SPENT for the second call; the row is ISSUED exactly once either way) |
| Q3.3 | `transitionOriginalRight` `:616-638`: UNUSED -> SUBMITTED -> TRANSFERRED only; IDENTITY/TRANSITION/SPENT refusals without a write; no reset | probe B1a-c: SUBMITTED->UNUSED, TRANSFERRED->{UNUSED,SUBMITTED,TRANSFERRED}, UNUSED->TRANSFERRED -> TRANSITION; UNUSED->SUBMITTED on a TRANSFERRED right -> SPENT; non-right column / forged member / other incarnation -> IDENTITY; every refusal: `total_changes()` unchanged, raw row byte-equal, traced statement list holds no INSERT/UPDATE/DELETE/ALTER (only `SELECT`/`PRAGMA`) | HOLDS |
| Q3.4 | Lost answer re-reads the committed row, never resets | probe B2a: commit succeeded, acknowledgement thrown away -> the operation returns, row SUBMITTED, exactly 1 commit, retry UNUSED->SUBMITTED is SPENT with no second commit, SUBMITTED->TRANSFERRED then proceeds; B2b: readback unavailable after commit -> `AggregateError` named `original-allocation-observation-unavailable`, right stays SUBMITTED; B2c: commit rolled back -> `AggregateError(commit, INCOMPLETE)`, right stays UNUSED and is retryable; B5b: a matching UNCOMMITTED row is OBSERVATION, not success | HOLDS (`commitOriginalWrite` `:521-539`) |
| Q3.5 | `readOriginalAllocationRow` `:486-497` / `exactOriginalRow` `:465-478`: named columns, exact active identity, member text equality | fields returned: `state, incarnation, native_history_state` + the five columns, frozen, missing column -> null; no src or test consumer reads a dropped field (`group_id`, `peer_id`, `replica_identity`, `reason`, `changed_at`, `retirement_evidence`): grep over preparation `:74-107,:475-478`, lifetime test, durable reader, opening tests | HOLDS |
| Q3.6 | `readOriginalAllocationDeclaration` `:505-516`: ABSENT/PRESENT, creates/migrates nothing | probe B4a fresh DB -> `{state: ABSENT}` frozen, `sqlite_master` empty before and after, no statement run but `PRAGMA table_info`; B4b base table without the columns -> ABSENT and `readOriginalAllocationRow` -> INCOMPLETE with no ALTER; B4c readonly handle -> PRESENT with declaration + `issue`, unknown identity -> ABSENT | HOLDS |
| Q3.7 | `commitOriginalWrite` readback is the exact committed row, not a cached object | `:531-534` calls `readOriginalAllocationRow` (fresh `SELECT`) after `commitDurably`; probe B5: an external raw UPDATE is visible on the next read, objects distinct and frozen | HOLDS |
| Q3.8 | Store SQL moved 1:1; semantic change? | diff of the deleted store (`9fe3d5481:src/raft/raft-rs-original-allocation-store.js:50-127`) against owner `:521-638`: identical WHERE clauses, parameter order, refusal order (right -> transition -> row read -> SPENT), readback predicates. Only differences: (a) request objects instead of positional arguments; (b) the row object carries named columns only (Q3.5); (c) `readDeclaration` detects the table through `PRAGMA table_info` instead of `sqlite_master` (equivalent: no table -> no column -> ABSENT), and the owner's PRESENT answer adds `issue`, which the preparation strips `:221-224` so its answer shape is unchanged | HOLDS, no behavioural change found |
| Q3.9 | Store deleted; preparation imports exactly five operations `:19-21` used at `:64,:75,:221,:264,:271` | confirmed by grep; `src/raft/raft-rs-original-allocation-store.js` absent at the commit; no src/test/scripts reference remains (only the regenerated shards and the fresh-seed DESIGN's historical text) | HOLDS |
| Q3.10 | Allowances per (caller, operation) `:36-52`; `isLifecycleOperationImport` `:473-480` accepts only declared specifiers | my probe: `import {prepareReplicaLifecycleForOriginalAllocation, transitionOriginalRight}` at the preparation -> `lifecycle-owner-import-bypass`; `transitionOriginalRight as t` in its own import -> refused; committed test rows "undeclared rights transition", "declared operations with the rights transition", "declared operation at the snapshot caller" red-as-expected (27/27) | HOLDS |
| Q3.11 | `transitionOriginalRight` has no src caller and no allowance | grep: no src importer; not in `LIFECYCLE_OPERATION_CALLERS`; test consumers only (store test, effect-cut test) | HOLDS (the fresh-seed Quest's writer caller will add its row) |
| F7 | `mintIncarnation` hook deleted; `openLifecycleRecord` `:149-176`; constructor always mints `:189-198`; snapshot staging births through it `:395-399` | grep src/scripts: zero hits; test hits are the negative leaves only (`lifecycle-operation.test.js:66,75-78,184`); probe B6: staging on a fresh DB births exactly one row with `incarnation === retained`, same table SQL and same row shape as a constructor birth (differing only in `incarnation`, `changed_at`, and `native_history_state` which staging then records as established); B6b caller mint ignored (randomUUID) | HOLDS |
| F4 | `LIFECYCLE_ERROR.TRANSACTION_REQUIRED` in the constants module, thrown at `:432` | `raft-rs-replica-lifecycle-constants.js:10-15`; probe: throw before any write (`sqlite_master` count 0); the old `RAFT_RS_OPENING_HISTORY_ERROR.TRANSACTION_REQUIRED` remains for `recordOpeningHistory` `:249` (an opening-history write, correct) | HOLDS |
| L1 | Lineage repair: `test/test-helpers/original-allocation-durable-reader.js` consumes the owner's reads | diff: `readIssuedDeclaration` -> `readOriginalAllocationDeclaration` (`state === PRESENT && issue === ISSUED`), `readOwnerRights` -> `readOriginalAllocationRow`; the hand-written `sqlite_master` + `SELECT *` block is gone; `REPLICA_LIFECYCLE_TABLE` now from the owner constants (the sampler's narrow SELECT keeps it) | HOLDS (consumes, not copies) |
| L2 | `fresh-seed-activation.integration` 2/7 = the sealed O3 hold | base: load failure `does not provide an export named 'REPLICA_LIFECYCLE_TABLE'` (0/1); commit: R1-R5 `not ok` each with `ORIGINAL_ALLOCATION_HOLD/original-handoff-continuation-unavailable` at `seed-original-allocation-startup.js:111` <- `seed-partitions-phase.js:388`, rightSequences `["UNUSED"]`, negatives 6-7 ok = DESIGN section 1 and `evidence/receipt.json` reasons verbatim | HOLDS |
| T1 | Implementer's table at both trees | my `table-commit`/`table-base`: identical to `lc2/logs/{before,after}/summary.tsv` counts for all 33 + the witness: commit all green except `fresh-seed-activation` 2/5 (sealed hold) and `reseed-hold-durability` 1/3 (inherited, red at base too); base identical except `lifecycle-operation` 21 (27 at commit: +6 Q3 leaves), fresh-seed 0/1 load failure, witness absent | HOLDS |
| S1 | eslint / node --check on the 16 changed JS files | exit 0; 16 `ok` | HOLDS |
| S2 | Scoped complexity 4 -> 3 inherited | base: 4 in 6 targets (`literalValue` 20, two audit arrows 13/34, `#validateMemberOpening` 28); commit: 3 in 5 (13, 31, 28); the `literalValue` violation is gone, no new one | HOLDS |
| S3 | Repo complexity ratchet | `FAILED: 1772 violations exceeds baseline of 1755` at BOTH trees (equal; inherited lineage red, baseline unchanged per owner decision 7) | INHERITED, unchanged |
| S4 | Unused 1411 | commit `1411/1411 OK` (no hint); merged tree `1410/1411` with the tighten hint (two exports removed on the two sides) | HOLDS; landing tightens |
| S5 | Duplication 46/679; cycles | `46/46, 1439/1439` and `679/679, 25717/25717` OK; `0/0 cycle group(s)` at the commit and the merged tree | HOLDS |
| S6 | File-size: owner 949, 24 -> 25 of 27 | base `24/27 over 800`, commit `25/27` (the owner is the one addition; baseline 27 unchanged) | HOLDS; see F5 for the split judgement |
| S7 | Metadata zero drift; hook replay reproduces the tree | `git reset --soft 9fe3d5481` in wt-commit, `bash .githooks/pre-commit`: exit 0 in 3 m 30 s (import graph refreshed, test metadata refreshed); `git write-tree` = `4121eb8c2^{tree}` = `70181c0fcbe3dbc4f68bf2141bcff1ffb6bf25e3` | HOLDS |
| S8 | Where the audit runs | pre-commit hook: NOT run (staged eslint/guidelines/file-size/scoped complexity only). Land gate `npm test` = `select-change-tests`: the plan for 9fe3d5481..4121eb8c2 lists 389 tests (= the lab's 389) including `lifecycle-table-writer-census`, `operation-port-boundary`, `original-allocation-lifecycle-operation`, `snapshot-lifecycle-staging`; `original-birth-scope-lint` is not selected (stage-1 F9). Publish gate `corpus-full-v1` = `test:all` runs every test | HOLDS for this change; see F6 for the general statement |
| M1 | Dry-run merge onto `b4b2d59e3` | one content conflict: `scripts/check-unused-exports.js` (lineage `65c6b929a` "TX1 composition: 1412 -> 1411" vs stage 2 "lifecycle-owner stage 2: 1412 -> 1411"; same value, different comment); the five derived files auto-resolve "kept ours ... owes test:metadata:refresh"; overlap set = exactly those 6 files; no source overlap; the lineage changed none of the audit, owner, preparation, fresh-seed Quest files or test helpers since 9fe3d5481. Merged tree (mechanical resolution: both comments, one `1411`): unused `1410/1411` hint; cycles 0/0; census writers = owner; 12 targeted witnesses identical to the commit (`fresh-seed-activation` 2/5 hold) | NOT CLEAN; trivially resolvable; delta holds on the merged tree |
| LAB | carinas-windows 389 files, 369/20, all 20 inherited leaf-for-leaf | lab log head `placement-head=4121eb8c2 ... base:9fe3d5481`, `planned=389`, 369 ok / 20 not ok counted. My local sample of 12 of the 20 at both trees: 11 SAME-LEAVES; `raft-leader-election.integration` identical after stripping the measured durations in the leaf names (`took 5026ms` vs `5021ms`), i.e. the same 19 budget failures. The implementer's two "DIFFERENT" rows have the same explanation (`code-path-uniqueness.property`: the fast-check counterexample text differs, same failing property; `raft-leader-election`: durations) | HOLDS |

## Census soundness: my own mutants (section A)

Census root: `src` only (`auditRaftRsOperationBoundary` `:482`, `lifecycleTableWriters` `:664`), so writes in
`scripts/` or `test/` are outside the census by design (V22, V23 MISSED, as stage-1 F2 stated; tests write the
table in fixtures legitimately, e.g. `raft-rs-original-allocation-store.test.js:93`). No script writes the
table (grep). Fixture trees under `scratchpad/lc2v/mutants/`, log `logs/census-mutants-{new,old}.log`.

| Mutant (second src writer) | New audit | Old audit | Class |
| --- | --- | --- | --- |
| V1 tagged template `` sql`UPDATE ${TABLE} ...` `` | CAUGHT | missed | - |
| V3 `` String.raw`UPDATE ${TABLE} ...` `` | CAUGHT | missed | - |
| V5 `INSERT OR REPLACE INTO ${TABLE}` | CAUGHT | missed | - |
| V6 `WITH x AS (...) UPDATE ${TABLE}` | CAUGHT | missed | - |
| V7 `'UPDATE ' + '_raft_rs_' + 'replica_lifecycle'` | CAUGHT (once) | caught (twice) | - |
| V8 `_RAFT_RS_REPLICA_LIFECYCLE`, V9 `"_raft_rs_replica_lifecycle"`, V14 lower-case `update` | CAUGHT | V8/V9 caught, V14 missed | - |
| V13 SQL text in a frozen object constant | CAUGHT | missed | - |
| V15 `DROP TABLE ${TABLE}`, V19 two-statement `db.exec`, V24 UPSERT | CAUGHT | missed | - |
| V16 retirement table via namespace member | CAUGHT | missed | - |
| V20 `export {REPLICA_LIFECYCLE_TABLE as X} from` relay; V21 `export *` relay | CAUGHT | missed | - |
| V2 `['UPDATE ', TABLE, ' SET ...'].join('')` | MISSED | missed | fail-OPEN (no string holds both keyword and table) |
| V4 `UPDATE ${t()}` (table from a call) | MISSED | missed | fail-OPEN: `?` in the TABLE position |
| V10 `${verb} ${TABLE}` (verb unresolvable) | MISSED | missed | fail-OPEN: `?` in the keyword position |
| V11 `const T = {name: TABLE}; ${T.name}` | MISSED | missed | fail-OPEN (local object member not resolved) |
| V12 `'UPDATE __T__ ...'.replace('__T__', TABLE)` | MISSED | missed | fail-OPEN |
| V17 `const [T] = [TABLE]`, V18 default parameter `(db, t = TABLE)` | MISSED | missed | fail-OPEN |
| V22 write in `scripts/`, V23 write in `test/` | MISSED | missed | documented root limit (stage-1 F2) |

Re-export (F1) mutants at the declared caller: R1 `export * from owner` REFUSED (both audits), R5
`export {op as default}` REFUSED (new only); R2 `const ops = {bear: op}; export {ops}`, R3
`export const bear = () => op`, R4 `globalThis.bear = op`, R6 `let alias = op; export {alias}`, R7
`export default {op}` ACCEPTED (fail-open, F2); R8 `export function bear(r) { return op(r); }` accepted by
design (indistinguishable from the real preparation's use).

## Findings

- F1 (census limit, fail-open, route to the census owner; not a stage-2 defect against decision 3). Seven
  write shapes pass the census (V2, V4, V10, V11, V12, V17, V18): an unresolvable TABLE or keyword position
  becomes `?` and the regex then cannot match, so the module is not reported. The audit documents the `?`
  placeholder (`:97-99`) as "a write naming the lifecycle table around it is still a write"; it does not
  document that an unresolvable table position is silently clean. Exposure today: zero. Only two src modules
  import the lifecycle constants module (the owner; `raft-rs-lifecycle-administration.js`, which imports
  `LIFECYCLE_STATE` only), no src module names the table literally outside the constants module, and the real
  tree's many `UPDATE ${table}` / `ALTER TABLE ${this.tableName}` builders are user-table code with no path
  to the lifecycle table name. A cheap fail-CLOSED rule that catches all seven without flagging those
  builders: a module other than the owner that binds a lifecycle table constant (any import shape the
  resolver already tracks) and contains either a write keyword in any string or a write statement with an
  unresolvable table position is reported. Same "static confinement, not protection against arbitrary
  trusted-host code" class the owner accepted in the 2026-10-12 disposition and stage-1 F2.
- F2 (F1-class limit, fail-open, same route). The new re-export refusal covers the four stated shapes and
  `export * from`; a wrapper object, an arrow returning the binding, a `globalThis` assignment, a separate
  `let alias = op; export {alias}` and `export default {op}` hand the capability on unseen (R2-R4, R6, R7).
  A fail-closed rule: in a declared caller, the imported operation identifier may appear only as the callee
  of a call expression; every other reference is `lifecycle-owner-import-bypass`. It accepts the real
  preparation and R8.
- F3 (precision, no change). `markOriginalAllocationIssued` called twice with the same declaration and
  anchor: the second UPDATE matches no row (ISSUE is no longer PREPARING), the readback finds exactly the
  requested ISSUED row, and the operation returns without a write (`total_changes` delta 0). That is
  idempotent (R14) and leaves exactly one ISSUED state; it is not the OBSERVATION/SPENT the brief expected.
  A different declaration or anchor after issuance is INCOMPLETE; a SUBMITTED right or native history before
  issuance is INCOMPLETE with ISSUE unchanged. Nothing can issue a second allocation.
- F4 (precision, inherited from stage 1 F3, no change). `openLifecycleRecord` `:151-155` runs
  `CREATE TABLE IF NOT EXISTS` before the `lifecycle-record-missing` refusal; inside the caller's
  transaction it is rolled back with the refusal. "Creates nothing" is exact for rows.
- F5 (file-size judgement: a non-writer extraction IS available; recommend as a follow-up, not required for
  composing). The owner is 949 lines; the ratchet is green (25/27). Two contract-neutral extractions keep
  one writer file and bring it under 800 (about 791):
  (a) `src/raft/raft-rs-replica-lifecycle-runtime-registry.js`: lines 54 (`RUNTIME_LIFECYCLE_OWNERS`),
  55-56 (`LIFECYCLE_ADMIN_OUTCOME`, `LIFECYCLE_CLAIM_REFUSED`), 735-755 (`registerRuntimeLifecycle`,
  `unregisterRuntimeLifecycle`), 789-866 (`lifecycleClaimError`, `requireClaimGeneration`,
  `withReplicaLifecycleClaim`): about 100 lines, in-memory only, no SQL. `retireReplicaLifecycle`
  (756-787, which reaches `owner.retire` -> `#writeRetired`) stays in the owner and imports one lookup
  (`runtimeLifecycleOwnerOf(runtime)`) from the registry; `frozenResult` (80-82) and `LIFECYCLE_REASON`
  (57-74) move to the Q5 constants module so neither side imports the other (no cycle). Consumers:
  `raft-rs-operation-port.js:47-48,455,459` imports register/unregister from the new module (the port is an
  allowed owner importer; no audit rule binds those two symbols), `raft-rs-lifecycle-administration.js`
  keeps `retireReplicaLifecycle` from the owner; test consumers of `withReplicaLifecycleClaim`
  (`original-handoff-lifecycle-claim.test.js`, `group-retirement-as-a-unit-fixture.js`) re-point.
  (b) `src/raft/raft-rs-replica-lifecycle-durable-read.js`: lines 866-931 (`DURABLE_LIFECYCLE_READ`,
  `retirementEvidenceOf`, `lifecycleRowOf`, `readDurableReplicaLifecycle`): about 66 lines, read-only
  (`Database` readonly handle, `SELECT` only); depends on `REPLICA_LIFECYCLE_TABLE`, `fs`, `Database`,
  `JSON.parse` only. Consumers: `raft-rs-lifecycle-administration.js:3,51` and three tests re-point.
  Not recommended: moving the snapshot inspection (641-733, read-only, 93 lines) or the original reads
  (453-520, 68 lines) would move operations whose `(caller, operation)` allowances bind to the owner's path
  (`SNAPSHOT_RECEIVER`, the preparation's two reads), i.e. an owner-boundary contract change (R02) and an
  audit table edit; possible but not a free extraction. The census stays exact under (a)+(b): neither new
  module holds a write statement, so `lifecycleTableWriters` still returns the owner alone.
- F6 (gate reach, statement). The audit is not in the pre-commit hook. At land it runs only through the four
  tests that import it, selected when a changed file is in their observed closure (it is for this change:
  the plan has the census, boundary, lifecycle-operation and snapshot-staging tests). A brand-new src writer
  module outside that closure would be caught by the publisher's full corpus (`corpus-full-v1`), not by a
  land plan that does not select the census test. The safety spine does not list it. If the census is to be
  a land-time guard for any src change, the spine or an impact contract is where it belongs (owner
  decision, not this commit's).
- F7 (naming debt, no-legacy rule; optional follow-up). `test/raft/raft-rs-original-allocation-store.test.js`
  keeps the deleted module's name (its header says "formerly the separate original-allocation store"). Rename
  with the metadata regeneration in a later commit.
- F8 (observation). `LIFECYCLE_WRITE_SQL` also names `_raft_rs_retirement`, which no src module defines or
  uses (grep); harmless breadth inherited from the previous regex.
- F9 (landing). Lineage merge: keep one `BASELINE_UNUSED_EXPORT_COUNT = 1411` with both dated comments, run
  `npm run -s test:metadata:refresh` and `node scripts/generate-global-owner-debt-inventory.js --refresh`,
  tighten the unused baseline 1411 -> 1410 on the hint the merged tree prints, rerun the two census tests.
  See M1.
- F10 (implementer process, no effect on the commit). The implementer's `lc2/classify.sh` and `run-batch.sh`
  call `scripts/wait-for-thermal-headroom.js` (the script lives at `scripts/checks/`), guarded by `|| true`,
  so those local runs were not thermally gated. My runs used the real gate (three holds observed).

## What I ran (logs under `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/c74561e1-2969-4696-bd5a-1d3a410f38a7/scratchpad/lc2v/logs/`)

- Reading: `docs/steering/rules.md`, `test/guidelines/INDEX.md` and `regression-policy.md`, the owner review,
  `VERIFY-lifecycle-owner-stage1-r1-2026-10-26.md`, `DESIGN-fresh-seed-activation.md`, the fresh-seed
  `quest.json` and `evidence/receipt.json`, the full commit diff, the audit script, the owner module, the
  deleted store at `9fe3d5481`, `.githooks/pre-commit`, `select-change-tests.js`, `test/shards/safety-spine.json`.
- `probe/census-mutants.mjs` (24 write + 8 re-export + 2 mixed-import mutants, verifier's own) against the
  new and the old audit -> `census-mutants-new.log`, `census-mutants-old.log`; real-tree census on the
  commit, base and merged trees -> `census-real-trees.log`; `probe/witness-table-old-audit.mjs` ->
  `witness-table-{old,new}-audit.log`.
- `probe/semantics.mjs` against wt-commit (B1-B7, F4; traced statements, `total_changes`, raw row equality,
  two-connection file DB) -> `semantics-commit.log`: 20/20.
- `chain.sh` (sequential, thermal-gated): `table-commit/`, `table-base/` (34 files x 2, per-file tap);
  `eslint-commit.log`; `complexity-scoped-{commit,base}.log`, `complexity-repo.log`; `unused-commit.log`;
  `duplication-commit.log`; `cycles-commit.log`; `file-size.log`; `hook-replay.log`; `lab-sample/table.tsv`
  (+ 24 taps); `merged-static.log`, `merged/summary.tsv`; `thermal.log`, `chain.log`.
- `merge-dryrun.log`; `select-plan.log` (389 tests).
- Implementer evidence read, not reproduced: `lc2/logs/lab-lc2-1.log` (head identity, 369/20 counted),
  `lc2/logs/classify/table.tsv` and its taps (the two DIFFERENT rows explained), `lc2/logs/{before,after}/`.
- Cleanup: the three scratch worktrees removed (`git worktree remove --force`, `prune`), mutant fixture trees
  removed, no process of mine alive; the source worktree is clean at 4121eb8c2.

## Limits

- Targeted tap runs only (per file, `-j1`); no `npm test` plan execution, no `check:release`, no lab run of my
  own. The lab receipt was read; 12 of its 20 reds were re-measured locally at both trees, not all 20.
- The merge dry run resolved the one-line conflict mechanically to measure the merged tree; the real
  resolution and the metadata regeneration are the integrator's.
- The census mutant set is mine and finite; F1/F2 list the shapes I found open, not a proof that no other
  shape exists.
- Scratch worktrees shared the primary checkout's `node_modules`; eslint caches lived under each scratch
  worktree's private git dir and left with it.
- No subagents; every scratch script ran under `timeout`.
