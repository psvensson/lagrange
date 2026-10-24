# Alpha single-path closeout: release 0.3

Decision (human, 2026-10-13): Lagrange is alpha. Release 0.3 supports
**only the current raft-rs and TX1 implementations**. No backward compatibility
with prior development commits, transaction sessions, or disk layouts is
required. Git history is the archive. Clean initialization from the chosen
release is acceptable; do not build migration machinery for old snapshots.

## Acceptance

- Exactly one Raft backend and one active execution path, including startup,
  restore, membership, operation ports, and failure recovery.
- Exactly one transaction protocol: TX1 with durable participant PREPARE,
  immutable coordinator decision, exact bound participant decision, and current
  reservation/generation and caller-deadline owners.
- There is no sessionId-only transaction transport fallback, local-connection
  BEGIN/PREPARE/COMMIT engine, competing prepared-state reconstruction, local
  expiry healing, old outcome producer, or obsolete registration path in
  production. Delete consumers, aliases, duplicated tests, and dead constants.
- Do not keep an old path behind a flag, conditional, or unsupported runtime
  option. Tests exercising earlier designs should be removed/replaced with
  assertions against the single current protocol. This is not a waiver of
  unresolved current correctness tests.
- No release gate requiring pre-L6 admitted transaction migration or an
  old-version file upgrade. Historical code is available through Git.
- No compatibility parser or retired-backend detector whose only role is
  preserving old formats. Fail-closed checks against malformed *current*
  protocol inputs still belong to current owners.
- Current crash safety, exact replica identity, retry bounds, cleanup custody,
  seed restart admission, quorum proofs, CDC, split/merge, and FreshMG
  certification remain mandatory. Removal of historical code must not weaken
  any current safety assertion.

## CDC obligation ledger: clean initialization (owner decision D3, 2026-10-26)

The CDC recording rule records an obligation only for "required internal
propagation OR supported external CDC" (`isTableCdcObligationRecorded`,
`src/cache/cdc-table-policy.js`; decision D2). This release does not migrate
the owed `_cdc_obligations` rows that earlier builds recorded for user tables
and non-propagated system tables: no retirement command, purge or upgrade step
exists for them. Qualification therefore runs on storage initialized by the
current build. Restart and pending-work recovery are proven on current-build
storage, and a data directory from an earlier build is unsupported.
A table policy that asks for external CDC is refused typed
(`external_cdc_unsupported`) at CREATE TABLE and at the table-policy update
owner. A raw client `UPDATE tables SET table_policies = ...` passes no
system-table write admission yet: it is admitted but inert for recording,
until the system-table write admission unit lands.

## Current removal inventory and authority map (initial, not exhaustive)

- `src/partition/partition-service-transaction-base.js`: obsolete
  `beginTransaction`, `prepareTransaction`, `commitTransaction`,
  `rollbackTransaction`, local marker proposals, old timeout sweeps and
  `reconstructPreparedState`. Keep only methods still needed by current TX1
  and partition serving/removal; move those to the existing present owner.
- `src/partition/partition-service-entry-apply-base.js`:
  `handleTransactionMessage` currently routes TX1 requests with a fallback
  to `executeTransactionControl` (old session-only protocol). Delete that
  fallback and old control dispatcher. Invalid/missing TX1 identities must
  fail closed, not be interpreted as session-only work.
- `src/partition/partition-service-transaction-session-methods.js`,
  `src/partition/partition-participant-transaction-legacy-fence.js`,
  `src/partition/partition-participant-transaction-connection.js`:
  delete old session bookkeeping and compatibility checks, preserving the
  current TX1 connection/persistence-admission contract through its single
  existing owner.
- `src/partition/partition-service-core-base.js` and write/entry owners:
  remove old active/prepared session maps, aliases and obsolete result
  reconstruction only after current TX1 references have been repointed.
- `src/partition/partition-legacy-consensus-state.js` and opening consumers:
  remove abandoned consensus format compatibility only after checking that
  current corrupt-state/missing-history checks still fail closed.
- `src/query/` coordinator and SQL-engine call sites: remove old wire
  request producers/readers and session-only fallbacks; keep TX1 coordinator
  workflow, exact decision persistence, recovery, and typed outcome API.
- `test/partition/partition-legacy-session-statement-admission.test.js`
  and other old-session tests: retire obsolete expectations. A witness for
  refused identity-less transaction traffic must target the current TX1
  router; do not fake historical admitted sessions.
- Audit non-transaction compatibility: old Raft references and runtime
  implementations, retired selectors, duplicate recovery logic, old
  documentation and tests. This inventory is not exhaustive and should be
  extended by a source/search census before acceptance.

## Implementation and merge discipline

1. Pin the current review branch and main. Record a complete caller/owner
   census. Do not overlap local-agent owned lifecycle, identity, formation,
   membership or FreshMG implementation.
2. Land removal in independently reviewable units with an unchanged current
   TX1 and raft-rs proof cone, negative current-protocol safety tests, and
   a no-references audit. No temporary compatibility adapter.
3. Run normal startup and restart, interrupted COMMIT recovery with actual
   participant delivery, split/merge, full replacement, loss of seed storage,
   and five-host certification against the same integrated SHA.
4. Obtain independent source approval and exact-candidate static gates.
   Review-only PR #117 is not an implicit merge authorization.

This supersedes the previous historical pre-L6 migration/settlement proof
requirement. It does NOT mark the active coordinator crash/replay or any other
current safety obligation complete.
