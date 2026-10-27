---
audience: development
documentClass: evidence
---

# Independent verification: CDC decision D2, recording policy (round 1, 2026-10-26)

## Verdict

**REQUIRED CHANGES (bounded, no `src/` change): APPROVE the source of 33fd9d21d as is; two
documentation/finding obligations must land with it, and the three commits should be squashed.**

- The recording rule, its determinism, the internal-propagation preservation, the typed refusal at
  the two owner entry points, the deletions and the D3 paragraph all hold (per-claim table below,
  every row measured by my own runs).
- Two findings make the unit incomplete as a *record* of what it changes in production, not as code:
  - **F1 (the implementer's GAP, ruled).** A raw `UPDATE tables SET table_policies = ...` is a
    **production path**, not a harness-only shortcut: the Admin WebSocket API executes arbitrary
    client SQL through the engine (`src/admin/admin-websocket-query-execution-methods.js:399`
    `sqlQueryEngine.executeRequest`), the engine dispatches an UPDATE on a system table to the
    ordinary routed write (`src/query/sql-query-engine-statement-execution.js:512` →
    `executeUpdate` → `executePartitionRoutedWrite`, `src/query/sql-query-engine-write-execution.js:319-321`)
    with **no system-table write admission** anywhere on that path (the only system-table awareness
    in the write path is retry classification, `sql-query-engine-write-failure-methods.js:129-139`,
    and delivery priority, `sql-query-engine-table-routing-methods.js:482-510`). The distributed
    harness uses exactly that production surface (`test/distributed/harness/cluster-node-handle-layer.js:232`
    `ws://{ip}:8081/api/admin/stream`; `test/distributed/scenarios/table-distribution-helpers-table-bootstrap.js:968-986`).
    So "never silently accepted" is **unmet** on that path: the JSON lands in `tables.table_policies`,
    is read back by `TablePolicyService.getTablePolicy` (`:255-260`) and the CLI tables view
    (`src/cli/views/tables-view.js:168,341`), and is inert for recording. The fix belongs at the
    system-table write admission, not at recording (R01/R11): today the owner-shaped admission is
    the control-plane system-table gateway (`TablePolicyService.updateTablePolicy` writes through
    `getControlPlaneSystemTableGateway().submitMutation`, `src/policy/table-policy-service.js:340-347`;
    canonicalization `src/control-plane/control-plane-system-table-gateway-mutation-contracts.js:82`
    `canonicalizeControlPlaneMutation`), and client SQL bypasses it entirely. The repair is a
    **bounded follow-up unit** (an owner-boundary change touching every system table and several
    tests that write `tables` directly, e.g. `test/query/sql-query-engine-distributed-transactions.test.js:429,597`
    and the harness helper): refuse or route client INSERT/UPDATE/DELETE on a system table at the
    statement dispatch (`sql-query-engine-statement-execution.js:508-517`) to the gateway/owner.
    **Required for this unit:** record the finding durably (R17) with that owner seam, and state
    in the D2/D3 record that the raw path is admitted-but-inert until that unit lands. **Yes**, the
    harness helper `prepareBenchmarkPartitioningTable` should migrate to
    `TablePolicyService.updateTablePolicy` (its admin surface) in that follow-up; today it cannot
    run against an admission that does not exist.
  - **F2 (unreported production consequence).** The managed split/merge **traffic signal** is the
    CDC pipeline's `EVENTS_GENERATED` counter (`src/partition/managed-split-metrics-provider.js:113-124`
    `readLeaderCounter`; rate at `:188`; consumed by `partition-split-merge-manager-core-methods.js:492-499`).
    That counter is incremented only when an obligation is recorded
    (`partition-cdc-obligation.js:166-168`; the volatile increment at
    `partition-service-cdc-stream-base.js:164` is on the dead `emitCdcEntry: null` path,
    `partition-write-kernel.js:533,556`, `partition-service-raft-write-commit.js:216`). Under D2
    **every user table** records nothing, so every user table now reads a valid 0 queries/minute
    forever: split-on-traffic can never fire for a user table, and the merge traffic criterion
    always holds. Managed-split evaluation is requested only for non-system tables
    (`sql-query-engine-statement-execution.js:316`), so the signal is now inert for exactly the
    tables it serves. No test catches it: the provider tests stub the counter
    (`test/partition/managed-split-metrics-provider.test.js:67,243`). `architecture/process-partitioning.md:169-178`
    now misdescribes production ("Tables on the default policy count every committed write"; the
    opt-out case it describes is now every user table). This is a different owner's defect (R04:
    the split owner borrowed a CDC counter; the doc already names "counting committed writes at the
    partition apply path" as follow-up). **Required for this unit:** record the finding routed to
    the managed-split owner and correct that paragraph; the counter move is a bounded follow-up
    (owner decision whether it precedes the release).
- **Squash:** yes. c3cc73f42 alone leaves `partition-cdc-delivery-progress`,
  `cdc-topology-progress-fixture` consumers, the size-split CDC tests and the catch-up integration
  red (they host their partition under a user table until d8224b770/33fd9d21d move them). One
  commit keeps every commit green; the two follow-ups carry no independent decision.
- Not blocking: the out-of-scope rename `alreadyDelivered` → `deliveredEarlier` in
  `acknowledgementJudgementOf` (`partition-cdc-obligation.js:218-234`; no gate depends on it, measured);
  the inherited lineage red of the aggregate complexity ratchet (1773 vs 1755 on base and commit
  alike).

## Identity

| Item | Value |
| --- | --- |
| Subject | `work/cdc-d2-recording-policy-20261026` at **33fd9d21d50c0241b91fe031ca7d0f0de2e03b08** (c3cc73f42 src+tests+D3, d8224b770 and 33fd9d21d test follow-ups) |
| Base | **a51f4992965d4a1ec94bb7c3b1824795887be129** (owner review recorded) |
| Lineage head for the merge probe | `work/mg-delivery-resume-r2-20261023` = **f6677d22034645bfebd5d29ce2c9175b905c9c2e** (local == origin after fetch; the brief named a19d9e189, which is two docs commits behind) |
| Diff | 26 files, +533/-293; src: `cdc-table-policy.js`, `partition-cdc-obligation.js`, `partition-cdc-delivery.js`, `partition-service-cdc-stream-base.js`, `partition-service-core-base.js`, `table-policy-service.js`, `table-creation-service-create-table.js`; `scripts/check-unused-exports.js` 1413→1411 |
| Scratch trees | `.../scratchpad/d2/wt-commit` (33fd9d21d), `wt-base` (a51f49929), `wt-merge` (f6677d220, dry-run merge), `wt-hook` (hook replay), all detached, `node_modules` symlinked, removed at the end |
| Untouched | `/mnt/data/peter/projects/lagrange` and the D2 worktree (read only); nothing committed or pushed |
| Thermal gate | `scripts/checks/wait-for-thermal-headroom.js` ok before the heavy runs (cpu 70C, nvme 68C); heavy runs serialized |

## Per-claim table

| # | Claim (implementer) | Verified how | Result |
| --- | --- | --- | --- |
| 1 | Predicate `isTableCdcObligationRecorded` = `icp === true \|\| externalCdcAllowed === true` over the static map, `cdc-table-policy.js:547` | Read `:547-551`; probe `predicate.probe.mjs` | **Holds.** 46 system tables, 23 recorded == `CDC_PROPAGATED_TABLES` == `CACHE_HYDRATION_TABLES` (subscription gate set); user/null names → false |
| 2 | User tables always `USER_NO_CDC`; `USER_TABLE_EXTERNAL_CDC_POLICY`, `USER_EXTERNAL_CDC` class, `options` override, `isExternalCdcAllowedForTable` deleted | Read diff; grep whole tree | **Holds.** No reader of any deleted name remains in `src/`, `test/`, `scripts/` (only historical evidence docs). No two-argument caller of `getTableCdcPolicy`/`isTableInternalCachePropagationEnabled`/`isTableCdcReadinessRelevant` |
| 3 | Guards at `captureCommittedOperationCdc :106`, `recordCommittedStatementCdc :137`, funnel `:160` via `partitionOwesCdc(service)` on `service.tableName` | Read; grep every producer | **Holds and complete.** `insertCdcObligation` has exactly one caller (`partition-cdc-obligation.js:165`, inside the funnel). The funnel's two entries are the statement path (`partition-service-entry-apply-base.js:685`) and the participant path (`partition-participant-transaction-apply.js:371` via `:403` capture). Snapshots copy the whole SQLite image (`snapshot-checkpoint-store.js:373` `db.backup`) and never produce rows. `service.tableName` is assigned once at construction (`partition-service-core-base.js:81`); the subscription gate keys on the same name (`bootstrap/shared/cdc-propagation-filter.js:20-22`) |
| 4 | Deterministic: no subscriber set, no cache, no per-node config | Trace of the three sites; O21 run | **Holds.** Inputs are the static map and the partition's table name only. O21 (three replicas, subscriber on the leader only) byte-identical ledgers per table: 40/40/40 for `message_groups`, 0/0/0 for user/logs/sql_write_operations |
| 5 | Per-node `tables.table_policies` cache read deleted (`parseExternalCdcAllowedOverride`, `isExternalCdcAllowedForTable`, `shouldBufferCdcWithoutSubscribers`, logs set) | Read diff of `partition-cdc-delivery.js`, `partition-service-cdc-stream-base.js` | **Holds.** Imports of `TABLES`/`SYSTEM_TABLE_NAME`/`getTableCdcPolicy` removed with them |
| 6 | Dead volatile path calls the same predicate (not deleted; D4 owns it) | Read `partition-cdc-delivery.js:264`, `cdc-stream-base.js:93,122` | **Coherent.** Same rule, same key; path unreachable (`emitCdcEntry: null` at all three producers) |
| 7 | Unused `externalCdcAllowed` constructor option removed | Read `partition-service-core-base.js` diff; grep | **Holds.** No production constructor passed it (grep: harness configs and tests only) |
| 8 | Refusal `assertTablePolicyCdcRequestSupported` (`:561`, code `external_cdc_unsupported`) at `resolveCreateTablePolicy` (`table-creation-service-create-table.js:29`) and `updateTablePolicy` (`table-policy-service.js:310`); explicit `false` admitted | Read; ran `create-table-policy-option.test.js`, `table-policy-service.test.js` | **Holds** at both owner entry points, before any write (0 submitted mutations / 1 write for the explicit-false case). **Gap F1 stands** (above) |
| 9 | Internal propagation untouched; 23 tables record and deliver | O20 run; propagation and census runs | **Holds.** O20: `message_groups` 40 recorded, 40 delivered, ledger owed 0/delivered 40; user/logs/sql_write_operations 0 with `EVENTS_GENERATED` 0. `cdc-group-propagation-service`, `-foreground-boundary`, `seed-retained-effects` (+ `-preparation`) green (153/153); `cdc-subscription-catchup.integration` green (moved to CDC_TABLE). The seed census tables (`message_groups`, `tables`, `partitions`) all recorded |
| 10 | Seed hydration / message-group cache paths unaffected | `test/bootstrap/cache-hydration-*.test.js` (5 files) | **Green** at the commit (part of the 173-assert run; the only reds were `admin-cdc-propagation.integration`, see 16) |
| 11 | Measurement 1000 writes: user/logs/sql_write_operations 1000→0, message_groups 1000→1000 | Re-ran `probes/ledger-measure.probe.mjs` at base and commit | **Reproduced exactly** (base owed 1000 in all four cases; commit 0/0/0/1000, no apply failures) |
| 12 | O20/O21, partition-service #23/#24, policy-owner test, both refusal tests red on base | Ran the commit's test files against the base source | O20, O21, both partition-service witnesses **red on base** (4 reds, 123 passes); the policy/refusal tests import names absent on base (red by construction) |
| 13 | CDC tests moved to `CDC_TABLE` = `latency_groups` via the fixture | Read fixture `:65-73,385-400`; ran the moved files at commit and base | Holds; identical leaves (see 15). `latency_groups` is `icp:true` (`cdc-table-policy.js:247-254`). Note: the fixture hosts a system-table *name* over its own `(id, value)` schema (`extra.schema` defaults) — the recording rule reads only the name, so the measured property is real; O20/O21 use the owner schemas via `getSchemaByTableName`. Mild "double restates owner" smell (fixtures.md), not a defect |
| 14 | Unused-export ratchet 1413→1411 hint-driven; complexity constructor 53→52 | `node scripts/check-unused-exports.js` at commit; `--scoped` at commit and base | **1411/1411 OK**; constructor 53→52; `subscribeToCDCWithHandshake` 26 and the `systemTableCache` setter 14 are pre-existing (same on base) |
| 15 | Owning files identical reds at commit vs base except greened witnesses | Ran 7 moved/consumer files + 2 CDC-lane files at both trees | Identical leaves: `partition-cdc-delivery-progress` 1 red, `partition-cdc-topology-progress-currentness` 7 reds, size-split 2 handler-identity reds — all the same on base (the lineage repairs the latter two: merged tree 592/592) |
| 16 | Lab cone 1377/119 vs base 1378/118, 99 identical reds | Not re-run (lab); spot-checked | `admin-cdc-propagation.integration` 3 reds (`bootstrap().success === false`) **identical on base** — environment/seed-harness red, not D2 |
| 17 | D3 paragraph in `alpha-single-path-closeout-20261013.md` | Read `:34-44` | **Consistent** with the closeout and owner D3: no migration of earlier owed rows, no retirement/purge/upgrade step, qualification and restart/pending-work recovery on current-build storage, earlier data directories unsupported |
| 18 | Hook replay, eslint, `node --check`, duplication, cycles, metadata zero drift | See "What I ran" | All green; zero drift after `test:metadata:refresh` and the inventory `--refresh` |
| 19 | Dry-run merge onto the lineage head | `wt-merge` at f6677d220, `git merge --no-commit --no-ff 33fd9d21d` | **One content conflict**: `scripts/check-unused-exports.js` (lineage 1413→1412 for C1-C4 vs D2 1413→1411). The merged tree's true count is **1411** (not 1410): resolve the constant to 1411 and keep both comment lines. Derived metadata (`subsystem-classes.json`, `impact-graph-seal.json`, `inventory.json`) auto-resolved "kept ours" by the merge driver and owes a regen after the merge. **No conflict** with D1e or the composed CDC test rewrites; `partition-service-size-split-transport.test.js` auto-merged cleanly (11 `CDC_TABLE` + 3 `createIdentityTransport` references coexist) and the merged D2 witnesses + catch-up integration pass 592/592 |

## Findings

### F1. Raw SQL writes to `tables.table_policies` are a production path with no owner admission (ruling on the GAP)

See the verdict. Evidence chain: admin stream → engine `executeRequest` (`src/admin/admin-websocket-query-execution-methods.js:399`)
→ statement dispatch `case QUERY_AST_TYPE.UPDATE` (`src/query/sql-query-engine-statement-execution.js:512`)
→ `executeUpdate` → `executePartitionRoutedWrite` (`src/query/sql-query-engine-write-execution.js:319-321`,
`:338ff`, no `isSystemTable` admission; grep of `isSystemTable(` in `src/query` finds only retry
classification, select-side handling, delivery priority and the split-evaluation skip). The owner
path is the control-plane system-table gateway (`TablePolicyService.updateTablePolicy` →
`submitMutation`, `src/policy/table-policy-service.js:340-347`), which the raw statement never
enters. Under fixtures.md "System-Table Mutation Test Requirements" every change to writes to
`tables` names a direct writer/owner path; the raw statement is a second, unowned writer (R01, R11).
Classification: **bounded follow-up unit** (owner-boundary change, affects all system tables and
the tests/harness that write them directly), with a **required durable finding** in this unit.

### F2. Managed-split traffic signal goes inert for every user table (unreported)

See the verdict. `managed-split-metrics-provider.js:113-124` reads `EVENTS_GENERATED`; D2 stops the
only live increment for user tables (`partition-cdc-obligation.js:166-168`). The signal is a valid 0
qpm (not null), so `shouldSplit` by traffic is permanently false and the merge traffic criterion
permanently true for user tables. `architecture/process-partitioning.md:169-178` is now false.
Classification: owner defect of the split/merge metrics provider (R04), **finding + doc correction
required in this unit**, counter relocation to the apply path (`advancePartitionWriteGeneration`
already runs there, `partition-service-entry-apply-base.js:687`) as a bounded follow-up; owner
decision whether it is release-blocking.

### F3. Out-of-scope rename (minor)

`acknowledgementJudgementOf` renames `alreadyDelivered` → `deliveredEarlier` and then maps it back
(`partition-cdc-obligation.js:218-234`). Reverting it in scratch changes neither the duplication
ratchet (46/46, 679/679 either way) nor any other gate. R16 scope noise; drop it or leave it.

### F4. Test-shape notes (not defects)

- `cdc-generation.property.test.js` now fixes `tableNameArbitrary = fc.constant(CDC_TABLE)`: the
  property lost its random-table-name dimension. Acceptable (a user table generates nothing), but
  the generator's name handling is no longer property-tested.
- `partition-service-cdc-log-suppression.test.js:86-123` still drives the dead volatile
  `generateCDCEvent` path directly; it passes under the predicate and remains a D4 deletion item.

### F5. Inherited lineage red (not D2)

`node scripts/check-complexity.js` fails identically on base and commit: 1773 violations vs
baseline 1755. Owner decision 7 keeps the baseline; the lineage owes the repair before publish
(R23: never raised). D2 adds none (constructor 53→52).

### F6. Merge resolution recipe

`scripts/check-unused-exports.js`: `BASELINE_UNUSED_EXPORT_COUNT = 1411` with both the C1-C4 and the
D2 comment lines (measured on the merged tree: 1411/1412 → hint "tighten to 1411"). Then
`npm run -s test:metadata:refresh` and `node scripts/generate-global-owner-debt-inventory.js --refresh`,
commit the regenerated `subsystem-classes.json`, `impact-graph-seal.json`, `inventory.json`.

## What I ran (logs under `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/c74561e1-2969-4696-bd5a-1d3a410f38a7/scratchpad/d2/logs/`)

| Run | Tree | Result | Log |
| --- | --- | --- | --- |
| Thermal gate | - | ok cpu 70C nvme 68C | `thermal-gate-1.log` |
| 5 owner witness files (`partition-cdc-obligation`, `default-cache-sync-table-selection`, `table-policy-service`, `create-table-policy-option`, `partition-service`) | commit | 475/475 | `witness-commit.log` |
| Commit's `partition-cdc-obligation.test.js` + `partition-service.test.js` + fixture on base source | base | 4 red (O20, O21, two partition-service witnesses), 123 pass | `witness-on-base.log` |
| Ledger probe N=1000 × 4 tables | commit | 0/0/0/1000 owed | `probe-commit.log` |
| Ledger probe N=1000 × 4 tables | base | 1000/1000/1000/1000 owed | `probe-base.log` |
| Predicate set-identity probe | commit | recorded == propagated == hydration (23) | `predicate-probe-commit.log`, probe `../predicate.probe.mjs` |
| 5 cache-hydration files + `admin-cdc-propagation.integration` + `cdc-group-propagation-stop-arms-nothing` | commit | 170/173; 3 reds = admin bootstrap | `partB-commit.log` |
| `admin-cdc-propagation.integration` | base | same 3 reds | `admin-cdc-propagation-base.log` |
| `cdc-group-propagation-service`, `-foreground-boundary`, `partition-cdc-topology-progress-currentness`, `partition-cdc-delivery-progress`, `cdc-subscription-catchup.integration` | commit | 59/67; reds 1+7 | `propagation-commit.log` |
| same minus foreground-boundary | base | 52/60; identical reds 1+7 | `propagation-base.log` |
| Moved tests + fixture consumers (7 files) | commit / base | 141/143 both; identical 2 handler-identity reds | `owning-subset-commit.log`, `owning-subset-base.log` |
| `seed-retained-effects.test.js`, `-preparation.test.js` | commit | 153/153 | `census-commit.log` |
| `node --check` 8 src/scripts files; eslint on all 26 changed JS files | commit | clean | `eslint-commit.log` |
| Hook replay (staged = each commit's change set: binary guard, file-size, hot-path, constant names, eslint, literals, decision boundaries, ambient intrinsics, silent catch) | c3cc73f42, d8224b770, 33fd9d21d | all PASS | `hook-replay-<sha>.log` |
| Scoped complexity (7 src files) | commit / base | constructor 52 / 53; others pre-existing | inline |
| Aggregate complexity ratchet | commit / base | FAIL 1773 > 1755 on both (inherited) | `complexity-commit.log`, `complexity-base.log` |
| Unused-export ratchet | commit | 1411/1411 OK | `unused-exports-commit.log` |
| Duplication ratchet; and with the rename reverted | commit | 46/46, 679/679 both | `duplication-commit.log`, `duplication-commit-rename-reverted.log` |
| Cycles | commit | 0/0 | `cycles-commit.log` |
| `test:metadata:refresh` + inventory `--refresh` + `git status` | commit | zero drift | `metadata-refresh-commit.log`, `inventory-refresh-commit.log` |
| Dry-run merge onto f6677d220 | wt-merge | 1 conflict (baseline constant) | `merge-dryrun.log` |
| Unused-export checker on the merged tree | wt-merge | 1411 (hint from provisional 1412) | `unused-exports-merged.log` |
| D2 witnesses + size-split + catch-up on the merged tree | wt-merge | 592/592 | `witness-merged.log` |

## Limits

- The 1496-file lab cone was not re-run; I re-ran the owning subset (16 test files) on both trees
  and spot-checked the implementer's red classification on the two files I could reach
  (`admin-cdc-propagation.integration`, size-split): identical on base.
- `isSystemTable` in the engine tests `SYSTEM_TABLE_NAME` membership; I did not enumerate every
  production constructor of a system-table partition to prove `options.tableName` is always the
  table name (the fallback `|| options.tableId` at `partition-service-core-base.js:81`). The
  subscription gate keys on the same field, so recording and subscription cannot disagree even if
  one were mis-named; a mis-named system partition would both record nothing and attach no
  subscriber (pre-existing coupling, unchanged by D2).
- The merged tree's full gate was not run; only the D2 witnesses and the unused-export checker.
- No pgwire-surface probe of `UPDATE tables` was run; the admin-stream evidence suffices for the
  F1 ruling (one production SQL surface reaching it is enough).
