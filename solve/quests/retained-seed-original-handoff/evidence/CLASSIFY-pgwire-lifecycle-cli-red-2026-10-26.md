---
audience: development
documentClass: evidence
---

# CLASSIFY: service-install-lifecycle-cli-pgwire red (2026-10-26)

File: `test/integration/service-install-lifecycle-cli-pgwire.integration.test.js`
Composed head: `b6697b509` (work/mg-delivery-resume-r2-20261023)
Mode: read-only, detached scratch worktrees, LAGRANGE_PLACEMENT=local, `npm run -s test:file -- <file>`, thermal-gated.

## Verdict

PRE-EXISTING. The composition did not cause it. It is not in the seed-startup hold or custody family, and the service lifecycle owner is not refusing anything.
It is a **stale hand-written test double**. Commit `2c44a3bb9` (2026-10-05, "pgwire: tag by the executed statement kind") made the wire
answer XX000 for any engine result that carries no `statementType`. That is the owner's contract. The integration test's fake
`executeRequest` (`responseFor`) still returns `{columns, rows, success:true}` with no `statementType`.
**Production is right and the test is wrong.**

## Leaves

| commit | role | leaf 1 envelopes | leaf 2 empty/typed reject | leaf 3 large list | leaf 4 bad creds | verdict |
|---|---|---|---|---|---|---|
| b6697b509 | composed head | FAIL XX000 (install) | ok | FAIL XX000 (list) | ok | red |
| a9a5660c7 | pre-composition base | FAIL XX000 (install) | ok | FAIL XX000 (list) | ok | red, identical |
| bed8c6354 | lineage source checkpoint | FAIL XX000 (install) | ok | FAIL XX000 (list) | ok | red, identical |
| 2c44a3bb9 | introducing commit | FAIL XX000 | ok | FAIL XX000 | ok | red |
| 4476cc4ba | parent of 2c44a3bb9 | pass | pass | pass | pass | GREEN (file ok, 5 assertions) |

The test file blob is `13eef1325` at head, a9a5660c7 and bed8c6354. The mapper blob is `165bc1fe0` at all three, so the inputs are identical.
No bisect over a9a5660c7..HEAD was needed.

## Server-side error text

The CLI masks the message: `src/cli/service-lifecycle-sql-client.js:33-38` prints only `PostgreSQL lifecycle query rejected (<SQLSTATE>)`.
A scratch probe (`scratchpad/diag/probe.mjs`) used the same `createRuntimeStartupWiring` with the same fake executor plus `pg.Client`, and captured:

    XX000 the engine result names no statement kind the PostgreSQL wire can tag; no truthful command tag can be reported (statement kind: null)

That is `PGWIRE_UNKNOWN_STATEMENT_TYPE`. The probe also ran the same fake with the result stamped
`statementType: 'show_services'`, which is what the real engine stamps. The probe then answered `OK SHOW [rows]`.

## Root (file:line, head b6697b509)

- Throw site: `src/runtime/pgwire-result-mapper.js:105-116` (`deriveCommandTag`). It reads `readExecutedStatementType`
  (`src/query/application-database-result.js:142`) and gets null, so it throws XX000. The caller is
  `src/runtime/pgwire-protocol-handler.js:660` (`_executeAndSend`).
- Production stamping that the test bypasses: `src/query/sql-query-engine-service-lifecycle-execution.js:152`
  `withExecutedStatementType(owner.execute(...), parsed.command)`. The command values come from
  `src/service/service-lifecycle-command-contract.js`, for example `SHOW_ALL: 'show_services'`.
- Stale double: `test/integration/service-install-lifecycle-cli-pgwire.integration.test.js:116-145` (`responseFor`).
  None of its success results carry `statementType`.
- Why it was missed: 2c44a3bb9 updated the sibling fakes (`test/runtime/pgwire-tls-policy-cutover.test.js:99,148`,
  `pgwire-password-authentication-cutover.test.js:52`, `service-lifecycle-pgwire-executor-handoff.test.js:64`, which add `statementType`).
  It never touched this integration file, which was outside that commit's cone. 2c44a3bb9 is not on origin/main. It sits on the rs-raft
  lineage branches.

## Repair direction (owner directive 2026-10-24: doubles consume the owner's builder)

Stamp the double's success results through the one owner, `withExecutedStatementType` from
`src/query/application-database-result.js`, using the lifecycle command each statement maps to:
install, remove, show_services and the show-one command from the command contract. Do not hand-write a `statementType` literal.
This is a test-only change. No src change is warranted.

## Side observations (not the root)

1. Leaf 2 passes vacuously on the empty-status half. `status missing-service` also dies on XX000, and its stderr
   `lagrange service status failed: ...` matches `/not found|empty|status/iu` through the word "status". The CLI's own empty-row
   refusal is therefore not exercised. Once the double is fixed, check that this leaf still passes for the right reason. Tightening the
   regex is advisable.
2. In `_executeAndSend` (`pgwire-protocol-handler.js:650-660`), RowDescription and DataRows are written **before** `deriveCommandTag` runs.
   An untaggable result therefore streams its rows and only then sends an ErrorResponse. The client discards them, but a tag-first
   ordering would refuse the result before any row reaches the wire. This is a production nit for the pgwire owner. It is not part of this red.
