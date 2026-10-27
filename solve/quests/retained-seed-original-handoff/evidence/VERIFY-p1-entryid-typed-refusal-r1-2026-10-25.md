---
audience: development
documentClass: evidence
---

# VERIFY P1: entryId-less committed SQL command fails closed and typed (r1, 2026-10-25)

**Verdict: APPROVE.** Keep f3591e873 as it is. Nothing needs to change. One follow-up is recorded under (E); it does not block.

## Identity

- Commit: f3591e8733abea9abd18b196c1135c0de8d3f566 (`refs/wip/lab-p1-1`). Parent: 747a5f80a.
- Worktree: `/mnt/data/peter/projects/.worktrees/partition-entryid-typed-refusal-20261025`. Its HEAD is f3591e873 and it is clean. I edited nothing and committed nothing there.
- I worked in detached scratch worktrees under `.../scratchpad/p1v/`: `head`, `base`, `census` (instrumented, not committed) and `hook` (soft reset to base). All four are removed and pruned.
- I did not touch the primary checkout.

## Per-claim table

| Claim | Result | Evidence |
|---|---|---|
| (A) One gate, `committedCommandGate`, with two checks through one helper `committedCommandRefusal` | CONFIRMED | `partition-service-entry-apply-base.js:65-79` (helper) and `:88-106` (gate). Both throws pass the same `{message, code, outcome, reason}`, and the helper builds the same Error shape for each. |
| (A) Old vs new COMMAND_UNKNOWN path | CONFIRMED: `detail.code` is the only change | Same message template `${MSG}: ${JSON.stringify(type)} at index ${index}`. Same code, outcome and reason. Same rollback: `scheduleEffect(ROLLBACK, () => rejectCommittedWrite(command?.entryId, error))`, scheduled before the throw. `detail` grows from `{index, commandType}` to `{index, commandType, code}`. B5 still passes. A null command still throws in the gate before `command.type` (`:629`) is read. |
| (A) Runtime turns the throw into a typed HOST_FAILURE | CONFIRMED | `raft-rs-runtime-owner.js:1134-1137` catches it, calls `applyTransactionRolledBack`, then `groupHostFailure(APPLICATION, applicationFailureOf(error))`. `:173-176` maps a typed `reason` and `detail` to `{message: reason, detail}`. `:159-168` stores them as `failure.reason` and `failure.detail`, with `recoveryRequired: true`. U1 and U2 assert reason, `detail.code` and `detail.commandType` on `readStatus()`. |
| (A) Applied index unchanged, nothing executed | CONFIRMED | The gate (`:626`) runs before the HLC witness (`:635`), the debug log, the dispatch and the statement (`:670`). U1 (all three replicas) and U2 compare appliedIndex, row, outcome rows and obligations, deepEqual before and after. U2 restart: CONSENSUS_INIT_REFUSED naming the reason. |
| (A) Constants | CONFIRMED | `partition-service-constants.js`: HOST_FAILURE_REASON.ENTRY_ID_MISSING = `committed-command-entry-id-missing`, OUTCOME.ENTRY_ID_MISSING_REFUSED, ERROR_CODE.ENTRY_ID_MISSING = `partition_committed_command_entry_id_missing`, ERROR_MSG.COMMITTED_STATEMENT_ENTRY_ID_MISSING. All sit next to COMMAND_UNKNOWN or UNRECOGNISED. |
| (B) Fallback key deleted | CONFIRMED | `partition-committed-statement-outcome.js:84-92`: `isCommittedStatementKeyed`, and `committedStatementEntryKey` returns either `entry:<id>` or NO_COMMITTED_STATEMENT_KEY. The `PARTITION_SERVICE_LITERAL` and `STRING` imports are gone. A grep of src finds no remaining tuple builder and no reader that parses the key (startsWith, split, LIKE). |
| (B) Can NO_COMMITTED_STATEMENT_KEY be reached after the gate? | Unreachable on the apply path, still used before admission | Apply: SQL types are gated. The coordinator settlement, the only other `getCommittedEntryKey` caller on apply, requires pinned bytes with `entryId === bytes.entryId` (`partition-coordinator-settlement-command.js:18-29`). The null value still matters before admission: `applyWrite` (`write-metrics-base.js:641`) computes the key before `admitCommittedCommand`, so an `entryId: ''` yields null, `answerSettledWrite` (`:600`) returns undefined, and admission then refuses ENTRY_ID_INVALID. `isSettledRedelivery` (`:143-145`) guards first. The value is not dead: it is the named "no key" state (R07). |
| (C) Producer census | CONFIRMED: no production producer can omit an entryId | See the census section. |
| (D) Witnesses go red on base with the NOT NULL leaf | CONFIRMED | On base, U1 and U2 both fail with `actual: 'NOT NULL constraint failed: _cdc_obligations.entry_id'` (failure `{"phase":"application","reason":"NOT NULL..."}`, no detail). |
| (D) Owning tests, all green except the two pre-existing size-split reds | CONFIRMED | 11 owning files: head 592/590/2, base 588/586/2. The failing leaves are identical. The two reds are the size-split-transport "Replica transport handler left registered" tests. |
| (D) Ratchets tightened only on hints | CONFIRMED | Base prints "can be tightened 692->689, 26237->26148" and "1416->1415". Head: duplication OK 689/689 and 26148/26148, unused OK 1415/1415, cycles 0/0. |
| (D) Hook passes, metadata drift zero | CONFIRMED | I replayed `.githooks/pre-commit` on base with the commit's changes staged: rc 0. After its inventory and test-metadata regeneration, `git write-tree` equals the f3591e873 tree (499bd5ae...), with no unstaged diff. |
| Lab | NOT RE-RUN on f3591e873 | As stated in the claim. This is a limit, not a finding. |

## Census (C), done independently

**Static.** Every `propose` in src:

- The only partition proposal site is `partition-service-raft-write-commit.js:85` (`proposeUnlessDeferred`, keyed on `entry.entryId`).
- `message-group-proposal-routing.js:120` and `wasm-service-replica.js:492` belong to other services with their own `applyCommittedEntry`. They are not partition SQL.

**Callers of `startPartitionRaftWriteCommit` / `startAdmittedPartitionWrite`:**

- CDC obligation, coordinator settlement and participant request. None of these is an SQL type: they are pinned bytes or carry a deterministic entryId (`distributed-transaction-settlement.js:130`, `distributed-write-coordinator.js:577`).
- `applyWrite` (`write-metrics-base.js:621-627`). It always rebuilds the entry with `buildPartitionWriteEntry`. `resolveEntryId` (`partition-write-kernel.js:239-241`) mints a UUID when the id is undefined or null. Any other non-string or empty id is refused by admission as ENTRY_ID_INVALID (`partition-committed-command-admission.js:165-169`).
- Both `applyWrite` callers (`write-metrics-base.js:430`, `entry-apply-base.js:405`, the forwarded write) go through that rebuild.

**Seed retained effects:** `canonicalQuery` requires a non-empty entryId (`seed-retained-partition-effects.js:37-39`).

**Dynamic.** I instrumented the gate in the `census` tree to append every unkeyed SQL command it sees to `census.ndjson`. Then I ran 223 files: all 163 in `test/partition` plus every test file that contains `.propose(`, `buildPartitionWriteEntry` or `applyCommittedEntry(`. That adds raft-rs-backend, convergence, node, bootstrap, message-group, wasm-service, integration and closure tests.

- Only U1 (6 hits) and U2 (3 hits) appear.
- The implementer's census had only u1 hits. U2 was most likely written after that census ran. My census covers U2.

**Suite vs base, same 223 files at concurrency 6:**

- Head: 4631 tests, 31 failing top-level tests. Base: 4627 tests, 31 failing.
- The failing leaf sets, nested lines included, are byte-identical.
- The only `ok` lines added on head: U1, U2, and the two new asserts in `partition-service.test.js` ("its statement ran", "the committed entry is applied on this replica").
- The 31 base reds are all pre-existing.

## Findings

1. **(E), follow-up, not blocking.** An SQL-type command that has an entryId but no `sql` is consumed silently.
   - What happens: `entry-apply-base.js:648` (`if (command.sql)`) skips execution, emits ENTRY_COMMITTED and returns RECORDED_ONLY (`:711-720`).
   - Reachability: none from production. Admission refuses it as STATEMENT_MISSING before consensus (`admission.js` `sqlCommandRefusal`, a non-empty string check). The only route that proposes SQL types is `applyWrite`, through WRITE_PATH admission. Only a raw port propose (bug or version skew) can commit one.
   - Why it belongs to the same gate: it is the same class, "the application would refuse what admission refuses". The fix would be a third check in `committedCommandGate`, a non-empty-string `sql` for SQL types, which would delete RECORDED_ONLY for SQL types.
   - A related edge: `command.sql` truthy but not a string (an object) would go to `runCommittedPartitionStatement` and be settled as a deterministic statement failure. That is also unreachable past admission.
2. **Observation, outside this commit's scope.** The runtime's `hostFailure` always sets `retryable: true` (`raft-rs-runtime-owner.js:165`), including for this deterministic refusal, which fails identically on every replica. COMMAND_UNKNOWN has the same disposition, so the "one disposition" ruling holds. Whether `retryable` should be decided per error belongs to the runtime owner.
3. **Observation, pre-existing.** The whole-corpus complexity ratchet is red on both trees: base 1781 > 1755, head 1780 > 1755. Head is one lower, from the gate extraction. The hook's owner-debt refresh notes "ratchet exceeded in check-complexity.js". This is not caused by this commit. Scoped complexity and scoped cognitive complexity on the 7 changed JS files: 0 violations.
4. **Mutation check.** Disabling only the entryId check in the gate turns U1 and U2 red again with the NOT NULL leaf. The witnesses therefore depend on the gate, not on the deleted fallback key alone. With the fallback deleted and no gate, the command would still not be consumed silently, but it would fail untyped.

## What I ran (logs in `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/c74561e1-2969-4696-bd5a-1d3a410f38a7/scratchpad/p1v/`)

- `head-cso.tap`: the full `committed-statement-outcome.test.js` at head, 20/20 pass.
- `base-cso-U.tap`: U1 and U2 at base (head's test file copied in, then reverted). 0/2, NOT NULL leaf.
- `census-head.tap`, `census.ndjson`, `base-run.tap`: the 223-file census and suite at head (instrumented tree) and at base. File list in `census-files.txt`; runner `run.sh`.
- `own-head.tap`, `own-base.tap`: the 11 owning files at head and base.
- `mut-nogate.tap`: the gate-ablation mutant.
- `eslint.log`: eslint on the 7 changed JS files, rc 0, and `node --check`, all OK.
- `cx-scoped` results (inline, 0/7). `complexity-head.log` and `complexity-base.log` for the whole corpus.
- `head-test:duplication.log`, `head-test:unused:ratchet.log`, `head-test:cycles.log`, and the matching `base-*.log` files.
- `head-shards.log`: `audit:shards` OK. `head-fs.log`: `audit:file-size` rc 0, no changed file flagged.
- `hook.log`: pre-commit replay, rc 0, staged tree equals the commit tree.
- I ran the thermal gate before every heavy run: CPU 42-59 C, NVMe 68 C.

## Limits

- The head suite comparison ran in the instrumented `census` tree. The only extra code there was an env-gated append in the gate's refusal condition, inert unless that condition fires. The clean head tree was used for `head-cso` and `own-head`.
- I did not run the full corpus, and I did not run anything on the lab.
- The census is test-driven plus static. A raw port propose from an external client process, or from an old-format durable log being replayed (version skew), is exactly what the gate now refuses, typed. Upgrading from logs written before entryId existed is unsupported by an earlier ruling, so those logs would now refuse the restart, typed.
- Base is 747a5f80a, which already carries 31 pre-existing reds in the 223-file set. I compared leaves; I did not judge those reds.
