# Coordinator exact table identity follow-up

Base a97f79c35b7e1f6428032493918e16e623339688. Source frozen pending serialized normal-hook checkpoint and independent review. Worktree /mnt/data/peter/projects/.worktrees/codex-coordinator-table-identity-20261025; branch work/codex-coordinator-table-identity-20261025. No Quest landing, composition, main merge or publication.

This supersedes the old uppercase coordinator alias expectation and the a97 finding that left coordinator-specific folding outside the case unit. One exported predicate at the existing distributed-transaction-schema-enforcement owner consumes resolveLogicalTableName and TABLES.SQL_TRANSACTIONS. Source/committed schema enforcement and remote ALTER already call this owner; participant admission and generation-origin trigger selection now share its predicate too. No duplicate folding classifier, alias branch, column normalization or recovery algorithm change. Parent authorized this full affected interaction before edits.

Predecessor a97 failed all four new cases through actual PartitionService owners: source refused before proposal, committed application refused enforcement, remote ALTER refused before proposal, uppercase BEGIN refused. Final canonical run passed 3 files and 92 runner assertions with retries 0 and cap 1. New four-case proof uses the established controllable consensus fixture with real SQLite application, not native formation. It engages ordinary source proposal+application, follower committed application, remote ALTER and uppercase BEGIN; lowercase generation origin installs triggers, replay repairs a removed trigger, missing-enforcer source writes refuse, and lowercase participant/ALTER exclusions remain strict. Existing transaction schema and system-write admission tests remain green.

Dependency path is participant-admission -> schema-enforcement -> workflow-schema -> shared constants/tables, with no return edge to participant-admission or participant-apply. Existing TX1 coupled pair now includes the engaged test; exact identity impact contract names the three source owners. Scoped lint and diff check pass. Standalone impact audit currently sees stale generated primary classification; normal hook will regenerate it and must pass before checkpoint.

## Canonical command

```sh
LAGRANGE_RETRY_FAILED_ONCE=0 LAGRANGE_LANE_JOBS_CAP=1 npm run test:file -- test/partition/coordinator-table-exact-identity.test.js test/query/transaction-schema-enforcement.test.js test/query/sql-query-engine-system-table-write-admission.test.js
```

## Current full manifest

- solve/quests/coordinator-exact-table-identity/evidence/receipt.json
- solve/quests/coordinator-exact-table-identity/log.ndjson
- solve/quests/coordinator-exact-table-identity/quest.json
- src/partition/partition-participant-transaction-apply.js
- src/query/distributed/distributed-transaction-participant-admission.js
- src/query/distributed/distributed-transaction-schema-enforcement.js
- test/partition/coordinator-table-exact-identity.test.js
- test/query/transaction-schema-enforcement.test.js
- test/shards/impact-contracts.json

## Proof logs

- /tmp/codex-coordinator-table-identity-20261025/green-final.log: SHA256 e57b5db6677ad99505058d0f74d8c88a1c1622789535f6163a9736ef34fc79ab
- /tmp/codex-coordinator-table-identity-20261025/green-r1.log: SHA256 161dc5a81ad9152a349f97c91fb96320379c7b2f95cf1115335ce9474e6bcfe8
- /tmp/codex-coordinator-table-identity-20261025/red.log: SHA256 62f5b50ec8253d0c9edbeb574d38120e7d9981678db5a24f91fcedaa9d30f5d2
