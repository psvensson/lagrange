---
audience: development
documentClass: evidence
---

# VERIFY: lifecycle-owner correction stage 1 (Q1/Q2/Q5), round 1

Verifier: Fable (independent; did not write the change). Date 2026-10-26 (machine clock 2026-10-24).

## Verdict: APPROVE for keeping d0ee2fe00

Every claim in the brief reproduces on my own runs; the owner's decision 3 (Q1 exact named
operation from its declared caller under the snapshot precedent, class access still rejected;
Q2 owner-minted incarnation consumed by the declaration; Q5 table constant in an owner module
without a cycle; complete cohort + issuance before the first native effect; partial preparation
explicit and fail closed) is implemented as stated. Findings F1-F9 below are recorded, none blocks
stage 1. The delta does NOT merge cleanly onto the moved lineage head: one trivial one-line
conflict in the unused-export baseline plus the usual derived-metadata regeneration (section F,
"Lineage merge"); that is landing work, not a change to d0ee2fe00.

## Identity

| What | Value |
| --- | --- |
| Subject commit | `d0ee2fe0079e595a9a1e0a8d48c2902f5c61821a` = `refs/wip/lab-lc1-1` = `work/lifecycle-owner-correction-stage1-20261026` |
| Parent (base) | `a51f4992965d4a1ec94bb7c3b1824795887be129` |
| Stat | 26 files, +715 / -193 (10 src/scripts, 11 test, 1 fixture, 4 generated shard/seal, 1 inventory) |
| Lineage head | `work/mg-delivery-resume-r2-20261023` fetched from origin = `a19d9e18907e12f93b733d17f1f9d5dc6b8a74a2`; merge-base with the commit = `a51f49929` (the base is an ancestor; the lineage advanced ~20 commits / 80 files) |
| Scratch worktrees (detached, node_modules symlinked from the primary checkout, removed at the end) | `scratchpad/lc1/wt-commit` (d0ee2fe00), `scratchpad/lc1/wt-base` (a51f49929), `scratchpad/lc1/wt-lineage` (a19d9e189) |
| Source worktree read only | `/mnt/data/peter/projects/.worktrees/lifecycle-owner-correction-stage1-20261026` (clean, HEAD d0ee2fe00) |
| Not touched | `/mnt/data/peter/projects/lagrange` (only its `node_modules` was symlinked; `git fetch origin work/mg-delivery-resume-r2-20261023` updated the shared remote-tracking ref as the brief asked) |
| Thermal gate | `wait-for-thermal-headroom.js` ok before both heavy phases (cpu 62C/70C, nvme 68C); one heavy job at a time |

## Per-claim table

| # | Claim | Verified where (file:line) | Result |
| --- | --- | --- | --- |
| Q1.1 | `prepareReplicaLifecycleForOriginalAllocation({db, groupId, peerId, replicaIdentity})` exists and is exported | `src/raft/raft-rs-replica-lifecycle-owner.js:408-426`, export `:727` | HOLDS |
| Q1.2 | Requires the caller's open transaction, throws `opening-history-transaction-required` before any write incl. CREATE TABLE | owner `:410-412` precedes `ensureLifecycleTable` `:414`; probe B1: throw, `sqlite_master` empty; witness leaf 5 | HOLDS |
| Q1.3 | Refuses `CORE_REFUSED original-allocation-lifecycle-row-present` for either identity half in any state | `lifecycleIdentityRow` `:113-119` (`peer_id = ? OR replica_identity = ?`, no state filter) used at `:415-418`; probe B3 exact / peer-half / replica-half / retired -> refused, rows byte-identical; witness leaf 3 (4 cases) | HOLDS |
| Q1.4 | Refuses `lifecycle-record-missing` when durable native history exists without a row; creates nothing | constructor `:149-161` sets MISSING without INSERT, op returns the admission `:421-422`; probe B4 rows=0 | HOLDS for rows; see F3 (the CREATE TABLE IF NOT EXISTS DDL has run inside the caller's transaction) |
| Q1.5 | Success births active NEVER_OPENED with the owner's `randomUUID`, returns frozen `{outcome: CORE_OK, reason, detail:{incarnation}}`, no functions | constructor `:163-170` (default `mintIncarnation = randomUUID` `:141-142`), op `:420-425`; probe B2: frozen at both levels, no function values, `row.incarnation === detail.incarnation`, `native_history_state = never-opened`; witness leaves 1-2 (caller-passed `mintIncarnation`/`incarnation` ignored) | HOLDS |
| Q1.6 | CREATE TABLE and identity-row query moved to `ensureLifecycleTable` / `lifecycleIdentityRow`, shared by constructor and operation | `:93-110`, `:113-119`; constructor `:147-148`; op `:414-415`; diff shows the SQL text moved unchanged | HOLDS |
| Q1.7 | Preparation imports exactly that one symbol; `bearOriginalMember` calls it inside the same `commitDurably` as the peer-identity rows | `src/raft/raft-rs-original-allocation-preparation.js:16-17`, `:54-71` (`commitDurably` `:58-68`, registry rows `:59-60`, op `:63-64`); `commitDurably` refuses nesting and wraps `db.transaction` (`raft-rs-durable-store.js:192-208`), so the op's `inTransaction` requirement is met exactly there | HOLDS |
| Q1.8 | Audit gains `LIFECYCLE_OPERATION_CALLERS` (caller, symbol) pairs incl. the two snapshot entries; `isLifecycleOperationImport` admits only an import declaration with exactly one named specifier matching its caller's symbol | `scripts/checks/raft-rs-operation-boundary-audit.js:30-39`, `:284-290`, used `:361-365`; snapshot constants `:26-29` identical to base | HOLDS |
| Q1.9 | Mutants refused | copied-src audit: class (M1), op+class (M2), second op in its own import (M3), namespace (M4), snapshot symbol at the preparation (M5), second caller = store (M6), dynamic import (M8), string-literal specifier (M10), class from `src/bootstrap` (M11), respelled relative path (M12) -> all `lifecycle-owner-import-bypass`; aliased named import (M7) accepted by design (the symbol, not the local name). Through the tests in wt-commit (restored after each): MT1 class, MT2 namespace, MT3 second op -> `operation-port-boundary` leaf 2 and the witness's leaf 21 both red (26/28); MT4 audit reverted to base -> 4 red (named, aliased, both census leaves) | HOLDS; see F1 for one uncensused shape |
| Q1.10 | Real-tree census `[]`; operation-port-boundary subtest 2 green | my audit run on the commit src: `[]` (all codes); tap: base `not ok 2 ... lifecycle-owner-import-bypass` (6/7) -> commit 7/7 | HOLDS |
| Q1.11 | Nothing else in src imports the class outside the lifecycle lane | grep: `raft-rs-lifecycle-administration.js:1-6` (admin verbs, LIFECYCLE_ADMIN), `raft-rs-operation-port.js:45-49` (class + register/unregister, PORT_CONSTRUCTOR), `snapshot-install.js:41-42` (staging op), `snapshot-receiver-admission.js:4` (inspect op), preparation `:16-17` (this op). No other importer | HOLDS |
| Q1.12 | Runtime reachability | No runtime guard exists: the operation is a plain export (probe B6 called it from a scratch module); the census scans only `root/src` (audit `:293`), so `scripts/` and `test/` (e.g. the new fixture) can call it. Confinement is static-only, exactly like the snapshot precedent | STATED (F2) |
| Q2.1 | `createSeedOriginalAllocation` produces a draft without incarnations | `src/bootstrap/seed-original-allocation-declaration.js:77-95`; probe D0 false; prep leaf "the declaration chooses no incarnation" | HOLDS |
| Q2.2 | `validateOriginalSeedDraft` refuses a member carrying its own incarnation | `:132-134` -> `validateAllocation(.., false)` -> `incarnationRefused` `:196-197` (`Object.hasOwn`); probe D1: HOLD `original-allocation-identity-mismatch`, no member file; prep leaf "prepare refuses a caller-chosen incarnation before any member file" | HOLDS |
| Q2.3 | `completeSeedOriginalAllocation(draft, incarnations, identity)` adds owner stamps and validates whole | `:144-149`; whole validation `:191`, `:198-199` (string, non-empty, distinct from every token and stamp) | HOLDS |
| Q2.4 | `prepare(draft)` order | `preparation.js:247-283`: validate draft `:254` -> whole-cohort virgin inventory `:257` -> mkdir/open/bear every founder collecting stamps `:259-264` -> complete declaration `:265` -> `prepareOriginalAllocationRow` every member `:267-269` -> `verifyMemberBinding` `:270-272` -> `markOriginalAllocationIssued` on the anchor `:275` -> `LIVE_ISSUER` `:281` -> return `:282` | HOLDS |
| Q2.5 | Complete cohort and issuance precede the first native effect | first native effect = `createRuntimeDispatcher` (`raft-rs-operation-port.js:280-281`; `raft-rs-runtime-owner.js:1885`, core at `:338`), reached only through `createRaftRsOperationPort` consuming an `originalAllocationOpening` (`port:176-187`); an opening exists only via `openingFor` (`prep:356-373`) which throws AUTHORITY while `#openingMode === null` (`:358`), i.e. until `:281` after `markOriginalAllocationIssued`. `new RaftRsDurableStore(db)` at `prep:69` only creates record tables (`durable-store:297-303`). Port's final cut re-reads the row (`prep:165-175`, `:479-485`) | HOLDS |
| Q2.6 | Failure after births leaves no declaration; born files make every later attempt HOLD | witness "a cohort born before its declaration fails closed" (exec fault on the first allocation ALTER): all founders active NEVER_OPENED, no durable record, `readDeclaration` ABSENT, retry HOLD `HISTORY` (`assertVirginMember` `:39-49`), `openingFor` HOLD `CLOSED`. Other cut points: anchor PREPARING -> `readDeclaration` PRESENT -> classification hold -> `inspectColdMember` `:102-107` HOLD `HISTORY`. `#fail` `:505-513` closes and rethrows: explicit, never a silent half-cohort | HOLDS |
| Q2.7 | Retained-path classification binds to rows, not to the declaration alone | `inspect`/`observeRetainedEffects` -> `inspectColdMember` -> `verifyMemberBinding` -> `originalAllocationRow` -> `exactLifecycleRow` (`store:11-19`) requires `row.incarnation === member.incarnation` and `state = active`; `seed-retained-effects.js` reads no incarnation; probe D3: tampering one row -> `inspect` and `observeRetainedEffects` both HOLD `IDENTITY` | HOLDS (row cross-checked against the declaration read from the anchor row; neither trusted alone) |
| Q5.1 | New `src/raft/raft-rs-replica-lifecycle-constants.js` (REPLICA_LIFECYCLE_TABLE, LIFECYCLE_STATE); removed from original-allocation-constants | `:1-11`; diff of `raft-rs-original-allocation-constants.js` drops the constant and its export | HOLDS |
| Q5.2 | Readers updated | owner `:14-15`, store `:8-9`, preparation `:30`, administration `:7`; 6 test files + the fixture; grep finds no remaining `LIFECYCLE_STATE` import from the owner module nor `REPLICA_LIFECYCLE_TABLE` from the original constants | HOLDS |
| Q5.3 | Cycles 0/0 | `test:cycles` at commit: `0/0 cycle group(s)` | HOLDS |
| Q5.4 | `as LIFECYCLE_TABLE` alias kept for the one-writer regex until Q4, recorded | owner `:14` alias; regex `UPDATE\s+\$\{LIFECYCLE_TABLE\}` in `operation-port-boundary.test.js:182-187`; commit message "Where stage 2 cuts" Q4 paragraph records it | HOLDS |
| W1 | New witness: 21 leaves incl. 15-case table and real-tree census | tap at commit: 21/21 (5 behaviour + 15 table + 1 census); lab log: 21 assertions ok | HOLDS |
| W2 | 5 new leaves in the preparation test | tap 24 -> 29; the five added names listed in section F | HOLDS |
| W3 | One shared fixture | `test/test-helpers/original-allocation-declaration-fixture.js:16-29` consumes the declaration owner's builder and the owner operation (no hand-written stamps); used by preparation test and `seed-retained-effects-fixture.js:11-12,40-43` | HOLDS (conforms to "test doubles consume the owner") |
| W4 | 20 owning files identical leaves | my owning set = 25 pre-existing files importing a changed module (+ the new witness): 23 identical at commit vs base, the 2 expected differences only (table in section F) | HOLDS |
| W5 | Lab adams-gamla 720 files 666/54 | `test-output/placement/d0ee2fe0079e-mvmpop18-1179891-adams-gamla.log`: lane summary lines sum to 720 / 666 / 54; 727 unique `placement-results` rows (671 ok / 56 fail) - 7 rows outside the lane summaries (F8). "all base reds" not independently checked on the lab (no base lab log); locally every red in my owning set is a base red | HOLDS as recorded; limit noted |
| S1 | unused 1412 hint-driven | `check-unused-exports.js` at commit: `1412/1412 ... across 333 file(s)`; the same-commit comment names the hint | HOLDS |
| S2 | scoped complexity 6/1 vs 7/1 | commit: 6 cyclomatic / 1 cognitive in 9 targets; base: 7 / 1 in 8 targets (the `validateMember` 13 is gone; `validateOriginalSeedDeclaration` 21 became `validateAllocation` 21); new files strict: clean | HOLDS |
| S3 | eslint / node --check | 21 changed JS files: eslint exit 0; `node --check` ok on all | HOLDS |
| S4 | duplication | `46/46 groups, 1439/1439 lines` (src+scripts), `679/679, 25717/25717` (test): OK | HOLDS |
| S5 | metadata zero drift + hook replay | `git reset --soft a51f49929` in wt-commit, `bash .githooks/pre-commit`: exit 0 in 233 s (import-graph `--refresh` + `test:metadata:refresh` ran); `git write-tree` = `d0ee2fe00^{tree}` = `69a78aa2c178e51ae49421f2fd0f36a552bf89b9` -> inventory.json, 3 shards and the seal regenerate byte-identically | HOLDS |
| S6 | both raft-rs audits through their tests | `operation-port-boundary.test.js` 7/7, `lifecycle-retirement-census.test.js` 6/6, `snapshot-lifecycle-staging.test.js` 21/21 (snapshot table unchanged and green), `lifecycle-registry-runtime-generation.test.js` 6/6, `original-birth-scope-lint.test.js` 1/1 | HOLDS |
| S7 | repo-wide complexity ratchet (not claimed; checked because the hook printed "ratchet exceeded") | `check-complexity.js`: commit `FAILED: 1772 violations exceeds baseline of 1755`; base `FAILED: 1773 ... 1755` (inherited lineage red, the commit lowers it by one; `BASELINE_COUNT = 1755` unchanged per owner decision 7). Cognitive: green at both, hint "can be tightened 152 -> 151" pre-exists at base | INHERITED RED, not introduced; see F10 |
| M1 | Delta merges cleanly onto the lineage head | NO: one content conflict in `scripts/check-unused-exports.js` (both sides tightened 1413 -> 1412 with different dated comments; lineage comment "fresh-seed-activation C1-C4"); the five derived files (`inventory.json`, 3 shards, seal) auto-resolve through the repo's merge driver "kept ours ... the merged tree owes: test:metadata:refresh and generate-global-owner-debt-inventory". Overlap set is exactly those 6 files; no source overlap. Measured on the mechanically resolved merged tree (wt-lineage, then `reset --hard`): unused ratchet `1412/1412` OK with no tightening hint; `test:cycles` 0/0; eight targeted witnesses (the new operation witness, preparation, operation-port-boundary, snapshot staging, store, opening, custody, seed-retained-effects-preparation) 129/129 | NOT CLEAN; trivially resolvable; delta holds on the merged tree |

## Owning-file results (tap 21.5.0, `npx tap --reporter=tap -j1 <file>`, per file, commit vs base)

| File | commit | base |
| --- | --- | --- |
| test/bootstrap/seed-original-attempt-lifetime.test.js | 21/21 | 21/21 |
| test/bootstrap/seed-registration-election-scheduling.test.js | 16/16 | 16/16 |
| test/bootstrap/seed-registration-phase.test.js | 49/49 | 49/49 |
| test/bootstrap/seed-retained-effects.integration.test.js | 3/3 | 3/3 |
| test/bootstrap/seed-retained-effects-preparation.test.js | 8/8 | 8/8 |
| test/bootstrap/seed-retained-effects.test.js | 145/145 | 145/145 |
| test/control-plane/incarnation-reuse-cross-owner-anchor.test.js | 19/19 | 19/19 |
| test/integration/message-group-learner-runtime-authorization.integration.test.js | 69/69 | 69/69 |
| test/node/replica-lifecycle-durable-generation.test.js | 169/169 | 169/169 |
| test/raft/raft-rs-backend/durable-commit-sync.test.js | 4/4 | 4/4 |
| test/raft/raft-rs-backend/lifecycle-registry-runtime-generation.test.js | 6/6 | 6/6 |
| test/raft/raft-rs-backend/lifecycle-retirement-census.test.js | 6/6 | 6/6 |
| test/raft/raft-rs-backend/operation-port-boundary.test.js | 7/7 | 6/7 (leaf 2 red: `lifecycle-owner-import-bypass`) |
| test/raft/raft-rs-backend/original-handoff-lifecycle-claim.test.js | 12/12 | 12/12 |
| test/raft/raft-rs-backend/reseed-hold-durability.test.js | 1/3 (D1, D2 red) | 1/3 (same) - F5 |
| test/raft/raft-rs-backend/runtime-opening-history.integration.test.js | 16/16 | 16/16 |
| test/raft/raft-rs-original-allocation-cold-inspection.test.js | 22/22 | 22/22 |
| test/raft/raft-rs-original-allocation-custody.test.js | 4/4 | 4/4 |
| test/raft/raft-rs-original-allocation-lifecycle-operation.test.js | 21/21 | (new) |
| test/raft/raft-rs-original-allocation-preparation.test.js | 29/29 | 24/24 |
| test/raft/raft-rs-original-allocation-store.test.js | 34/34 | 34/34 |
| test/raft/raft-rs-original-opening-authority.test.js | 22/22 | 22/22 |
| test/raft/raft-rs-original-opening-effect-cut.test.js | 4/4 | 4/4 |
| test/raft/raft-rs-original-opening.test.js | 5/5 | 5/5 |
| test/raft/snapshot-lifecycle-staging.test.js | 21/21 | 21/21 |
| test/closure/original-birth-scope-lint.test.js | 1/1 | 1/1 |

The five preparation leaves added at the commit: "the declaration chooses no incarnation; it consumes
each lifecycle-owner stamp"; "prepare refuses a caller-chosen incarnation before any member file"; "a
complete declaration is not a draft: prepare refuses retained stamps"; "inspection refuses a
declaration that lacks its lifecycle-owner stamps"; "a cohort born before its declaration fails closed
and is never reissued".

## Findings

- F1 (census limit, route to Q4 / census owner; not a stage-1 defect). An indirect re-export passes the
  audit: with the allowed `import {prepareReplicaLifecycleForOriginalAllocation} from ...` followed by a
  separate `export {prepareReplicaLifecycleForOriginalAllocation};`, `auditRaftRsOperationBoundary`
  returns `[]` (mutant M9). Only `export ... from` is refused (`importSource` `:181-193` sees
  `ExportNamedDeclaration` with a source). The snapshot precedent has the same hole. It is the same
  "static confinement, not protection against arbitrary trusted-host code" class the 2026-10-12
  disposition recorded; worth one rule in the Q4 census strengthening (an `ExportNamedDeclaration`
  whose local names include an imported lifecycle symbol in a declared caller).
- F2 (statement, no change). Reachability of the operation is enforced statically only: no runtime
  guard, any importer can call it, and `scripts/`/`test/` are outside the census (`audit:293`). Same as
  the snapshot operations; the design and the owner review accept static confinement.
- F3 (precision, no change). The `lifecycle-record-missing` refusal path runs `CREATE TABLE IF NOT
  EXISTS` (`op:414`) before refusing at `:420-422`; no row is inserted. The DDL sits inside the caller's
  transaction and is rolled back when `bearOriginalMember` throws (probe B5: caller abort leaves no
  table). "Creates nothing" is exact for rows; for DDL it is "nothing survives the refusal".
- F4 (naming, optional at Q3). The operation reuses `RAFT_RS_OPENING_HISTORY_ERROR.TRANSACTION_REQUIRED`
  (`'opening-history-transaction-required'`) as its transaction-required error although it is a birth,
  not an opening-history write (same module, same semantic). When Q3 moves the store writes into
  owner operations, a lifecycle-owner-wide transaction-required code would read truer (R07).
- F5 (pre-existing, unrelated, route to the rs-raft runtime owner). `reseed-hold-durability.test.js`
  D1/D2 are red at the commit AND at its parent locally, and red on the lab log: `SQLITE_BUSY: database
  is locked` thrown by `createRuntimeDispatcher` (`raft-rs-runtime-owner.js:1970`) during the reopen in
  `partition-node-cluster.js:235`. Not touched by this change (no preparation path involved).
- F6 (landing). Lineage merge: resolve the one-line `BASELINE_UNUSED_EXPORT_COUNT` conflict (keep one
  value, carry both dated comments), run `npm run -s test:metadata:refresh` and
  `node scripts/generate-global-owner-debt-inventory.js --refresh`, then re-measure the unused ratchet
  (two different exports were removed on the two sides, so the measured count may be below 1412 and
  should be tightened on the hint), and rerun the two census tests on the merged tree. See M1.
- F7 (recorded debt, fine). The constructor `mintIncarnation` hook is now reached only by the snapshot
  path (`owner:377-380`) and two tests (`raft-rs-original-allocation-store.test.js:26`; the new
  witness `:65` passes it to prove it is ignored). The commit message schedules its removal with Q3.
- F8 (limit). The lab log holds 727 unique `placement-results` rows (671/56) while its ten lane
  summary lines sum to 720/666/54 (the claimed numbers); 7 rows are not attributable from the log.
- F9 (observation). `test/closure/original-birth-scope-lint.test.js` imports a raft-rs audit script
  but was not in the lab run; it passes locally at both trees.
- F10 (inherited, lineage-wide, not stage 1). The repo-wide cyclomatic ratchet is red at the base
  already (`1773 violations exceeds baseline of 1755`) and the commit lowers it to 1772 (the
  `validateMember` violation gone, no new one). The pre-commit hook's `--refresh` printed "ratchet
  exceeded in check-complexity.js ... elevated debt will be recorded" for that reason. Owner decision 7
  keeps the baseline; the 17-over state belongs to the lineage's integration owner (memory:
  "complexity ratchet outside solve's static gate"), not to this commit.

## What I ran (logs under `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/c74561e1-2969-4696-bd5a-1d3a410f38a7/scratchpad/lc1/logs/`)

- Reading: `docs/steering/rules.md`, `test/guidelines/*.md`, the owner review, the design
  `DESIGN-original-allocation-lifecycle-owner-boundary-2026-10-24.md`, the full commit diff, the
  changed modules and tests, `raft-rs-operation-port.js:170-290`, `raft-rs-durable-store.js:192-208`,
  `.githooks/pre-commit`, the lineage head's quest-log entry (a19d9e189).
- `run-batch.sh` -> `wt-commit/summary.tsv`, `wt-base/summary.tsv`, per-file tap logs (26 files x 2).
- `probe/semantics.mjs` (run from inside wt-commit under `test-output/verify/`, removed after) ->
  `probe-semantics.log` (B1-B6, D0-D3).
- `probe/audit.mjs` against a copied `src/` tree with 12 import mutants (M1-M12) - output in the
  conversation transcript; the copy (`scratchpad/lc1/mutant/`) was removed at the end.
- Cleanup: the three scratch worktrees removed (`git worktree remove --force` + `prune`), the probe
  deleted from wt-commit before removal, no process of mine alive; the source worktree is clean at
  d0ee2fe00. Other files in `scratchpad/lc1/` (`after.log`, `base6.log`, ...) predate this run and
  belong to the implementer's session; untouched.
- `mutate-through-test.sh` -> `mt1-class.log`, `mt2-namespace.log`, `mt3-second-op.log`,
  `mt4-audit-reverted.log` (each: the two census tests on the mutated wt-commit, then `git checkout --`).
- `eslint-changed.log`; `node --check` on 21 files; scoped cyclomatic/cognitive at both trees; strict
  on the three new files.
- `heavy-static.sh` -> `unused-commit.log`, `duplication-commit.log`, `cycles-commit.log`.
- `hook-replay.sh` -> `hook-replay.log` (exit 0, 233 s, write-tree equality).
- `chain2.sh` -> `merge-3.log`, `merge-3-conflicts.txt`, `unused-merged.log`,
  `merged-targeted-tap.log`, `cycles-merged.log`, `complexity-repo-wt-{commit,base}.log`,
  `cognitive-repo-wt-{commit,base}.log`.
- Lab evidence read (not run): `test-output/placement/d0ee2fe0079e-mvmpop18-1179891-adams-gamla.log`.

## Limits

- Targeted tap runs only (per file, `-j1`); no `npm test` change proof, no `check:release`, no lab run
  of my own. The lab receipt was read, not reproduced; "all 54 lab reds are base reds" was not
  independently established (no base lab log), only the local owning set.
- The merge dry run resolved the conflict mechanically (took the delta's side of the one-line baseline)
  to measure the merged tree; the real resolution is the integrator's.
- The scratch worktrees share the primary checkout's `node_modules`; eslint caches were written under
  each scratch worktree's private git dir and are removed with the worktrees.
- No subagents; no synthetic load; every scratch script ran under `timeout`; no child process of mine
  is alive at hand-back.
