---
audience: evidence
recorded: 2026-11-15
quest: cdc-oversized-entry-range-scan
---

# CDC Oversized-Entry Range Scan: Post-Closure Applicability and Transaction Tally Finalization (2026-11-15)

## Scope and Review Follow-Up

This applicability note records the closure of Independent Review #2 (Finding 3) and Independent Review #3 (P2 transaction lifecycle finalization of `_cdcOwedEntryBytes`) on quest `cdc-oversized-entry-range-scan` from sealed base `c4f1cd064bee29d174ba63d0d8d52486651bc59f`:

1. **Review #2 (Finding 3) - Single `SELECT_OWED_ENTRY_BYTES` query per oversized entry across full drain (`4202994aa9e7181305a8b10f28d3eb1fa8d495e2`)**:
   - Updated `PARTITION_CDC_OBLIGATION_SQL.MARK_DELIVERED` in `src/partition/partition-cdc-obligation-constants.js` to `RETURNING log_index, octet_length(event_json) AS event_bytes` without modifying the SQLite table, column, index, or trigger schema of `_cdc_obligations` or `_cdc_obligation_progress`.
   - Added connection-scoped `_cdcOwedEntryBytes` on the `db` owner in `src/partition/partition-cdc-obligation-ledger.js` and `owedEntryPositionsAfter` in `src/partition/partition-cdc-obligation-range.js` so `SELECT_OWED_ENTRY_BYTES` executes once per oversized entry across an entire drain and whole-entry tail transitions page by `BOUND.DRIVE_PAGE_ROWS` (`256`).
   - Verified on `adams-gamla` in lab job `9f6d4ede-a952-418b-a775-0dc425c40785` (`docs/evidence/cdc-oversized-entry-range-scan-2026-11/lab-jobs/lab-job-9f6d4ede-a952-418b-a775-0dc425c40785/`).

2. **Review #3 (P2) - Explicit transaction commit/rollback finalization of `_cdcOwedEntryBytes`**:
   - Added `commitOwedEntryByteTallies(db)` and `rollbackOwedEntryByteTallies(db)` in `src/partition/partition-cdc-obligation-ledger.js` and wired them into `applyCdcAcknowledgementCommand` (`src/partition/partition-cdc-obligation.js`) via `committed.afterCommit` and `committed.afterRollback`.
   - On `COMMIT` of a `CDC_DELIVERED` command, `commitOwedEntryByteTallies(service.db)` clears all `tally.unverified` entries and immediately deletes any `logIndex` whose remaining owed bytes reached `0`, preventing retention of completed entry tallies or `unverified` keys without requiring a post-completion `readOwedCdcEntryBytes` call.
   - On `ROLLBACK` of a failed `CDC_DELIVERED` application transaction, `rollbackOwedEntryByteTallies(service.db)` restores and evicts any tally touched during the rolled-back transaction (`tally.unverified.size > 0`), ensuring the next shipping decision re-reads durable SQLite truth.
   - Expanded `R4` and added `R5` in `test/partition/partition-cdc-obligation-oversized-entry-scaling.test.js` to verify both multi-entry commit eviction (`db._cdcOwedEntryBytes.size === 0` after draining `logIndex = 10, 11, 12`) and mid-transaction rollback eviction after `MARK_DELIVERED` mutation.

## Lab Verification on `adams-gamla` (`58cbbc58-c927-4b1a-8ed9-3d3453ab1f1d`)

- **Host**: `adams-gamla` (offline cache base `9c576f3a06be3bf117623f038f43e6b36b5b33a5`)
- **Parent Commit**: `4202994aa9e7181305a8b10f28d3eb1fa8d495e2`
- **Transport Commit**: `743df82b452b08917c026e9f1169f11b15ae46b7`
- **Measured Transport Tree**: `22627ea07b0979b6021e6674e46fbe431e3f5165`
- **Retained Artifacts**:
  - `docs/evidence/cdc-oversized-entry-range-scan-2026-11/lab-jobs/lab-job-58cbbc58-c927-4b1a-8ed9-3d3453ab1f1d/job.json`
  - `docs/evidence/cdc-oversized-entry-range-scan-2026-11/lab-jobs/lab-job-58cbbc58-c927-4b1a-8ed9-3d3453ab1f1d/summary.json`
  - `docs/evidence/cdc-oversized-entry-range-scan-2026-11/lab-jobs/lab-job-58cbbc58-c927-4b1a-8ed9-3d3453ab1f1d/tap.txt`

| File | Assertions | Duration | Result |
| --- | ---: | ---: | --- |
| `test/partition/partition-cdc-obligation-oversized-entry-scaling.test.js` | 5 | 24,616 ms | pass (R1, R2, R3, R4, R5) |
| `test/partition/partition-cdc-obligation-ship-unit.test.js` | 54 | 25,842 ms | pass |
| `test/partition/partition-cdc-obligation-ship-window.test.js` | 34 | 10,817 ms | pass |
| `test/partition/partition-cdc-obligation-range-shipping.test.js` | 21 | 13,270 ms | pass |
| `test/partition/partition-cdc-obligation-reclamation.test.js` | 8 | 16,258 ms | pass |
| `test/partition/partition-cdc-obligation.test.js` | 23 | 8,948 ms | pass |
| `test/partition/partition-cdc-subscriber-vector-contract.test.js` | 7 | 2,541 ms | pass |
| `test/partition/partition-cdc-delivery-progress.test.js` | 6 | 8,382 ms | pass |
| `test/bootstrap/seed-retained-effects.test.js` | 170 | 9,372 ms | pass |

### `R4` Full End-to-End Drain Metrics (Job `58cbbc58-c927-4b1a-8ed9-3d3453ab1f1d`)

| `eventCount` | `waves` | `totalEntryBytesQueries` | `maxWaveQueries` | `tailWaveRows` | `maxComposeSpanMs` | `maxDriveSpanMs` | `fullDrainMs` |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 512 | 387 | 1 | 4 | 128 | 18.904 ms | 564.867 ms | 1,017.812 ms |
| 1,024 | 899 | 1 | 4 | 128 | 50.329 ms | 564.891 ms | 1,916.612 ms |
| 4,096 | 3,971 | 1 | 4 | 128 | 58.702 ms | 554.435 ms | 7,704.896 ms |
