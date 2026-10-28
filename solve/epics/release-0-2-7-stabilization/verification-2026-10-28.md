---
audience: development
documentClass: evidence
---

# 0.2.6 audit re-verification for the 0.2.7 stabilization epic

## Identity and method

Checked on 2026-10-28 against released source
`a1e26f6de84433a3913c2ef855d1b787e926d7eb` (`v0.2.6`) and current main
`98e69ba13db8f9a5bbf6bc919d6e9c941b07ac8e`. The latter is a documentation and
documentation-check update. A path-scoped Git comparison confirmed identical
affected runtime, package/lock, vendored binding and release/build/proof-owner
files. Governing rules and router are the 2026-10-28 revision on that main.

Three independent reviewers repeated the query, native-Raft and published
artifact/ingress witnesses. The integration reviewer rechecked source identity,
existing work ownership and the public immutable release-proof receipt.
Environment: Node v24.22.1, native SQLite 3.49.2; text-order run ICU 78.3 with
en-US collation. CI's Node 22 remains a separately required target environment.

The original audit ran seven classified files with 705 passing assertions.
This follow-up reran the concrete failure witnesses and two discriminating
existing suites: unknown-outcome same-entry replay (11 assertions) and snapshot
cadence (19 assertions), both passing. It did not rerun the full corpus, operate
on a production cluster, certify a new release, or perform a Docker/Kubernetes
deployment. The packaged npm consumer used for authoring had originally been
installed with lifecycle scripts disabled; missing JS/WIT content is proven,
while its native database startup is not certified by that installation.

## Findings and disposition

**Reproduced** means the named production/native or artifact interaction was
exercised within the stated boundary. **Source-confirmed** means the path or
configuration was inspected but its longer-run consequence remains unmeasured.
These categories must not be flattened into a full distributed failure claim.

| ID | Verified observation | Evidence ceiling | Work |
| --- | --- | --- | --- |
| F01 | Five admitted INSERT/UPDATE value forms return success and store NULL | Production parser/planner/write/rendering; transport replaced by native SQLite sink | Q01 |
| F02 | UNIQUE, table-level single/composite PK, CHECK and REFERENCES vanish from derived physical DDL | Real parser, intent validation, schema derivation and table bootstrap; native invalid writes | Q02 |
| F03 | For boundary a, Z is placed left by split snapshot routing but normal SELECT/INSERT selects right | Real split/partition resolver with two native SQLite children; not a complete live split | Q03 |
| F04 | Configured application Basic auth gives app 401, while cluster state is 200 and service registration reaches mutation without auth | Real BootstrapAPI/Fastify/authenticator; storage gateway spy | Q04 |
| F05 | Exact released executable reports version but dry-run cannot find better-sqlite3 | Actual checksum-matching downloaded binary, clean standalone directory | Q05 |
| F06 | Installed npm init/test/generate succeeds; build cannot import componentize-js; packed WIT directory absent | Fresh scaffold using installed published CLI; package inventory | Q06 |
| F07 | Source/image lock has four affected production package entries; fresh npm consumer has different vulnerable CLI leaves | Fresh production audits and installed version inventory; exploitability not established | Q07 |
| F08 | 2,000 successful native proposals retain 6,005 durable-store diagnostic objects | Actual operation port, WASM and native SQLite; no OOM measured | Q08 |
| F09 | 10,000 valid accepted heartbeat envelopes cause stack exhaustion on drain; a subsequent status reconstructs a healthy follower | Native boundary with real leader-produced message and virtual clocks; no live-network incident | Q09 |
| F10 | Automatic cadence excludes control-plane partitions and followers; message groups do not use that cadence | Source census and passing test that expects follower refusal; disk exhaustion not measured | Q10 |
| F11 | Timer discards the typed cadence result, including TICK_FAILED | Source-confirmed observation gap; not a claim that all lower-level logging is absent | Q11 |
| F12 | Registered release proof is validly resolved but records producer as an empty object | Exact immutable public receipt inspected; no inference that proof was not run | Q12 |
| F13 | Current WASM/glue hashes match integrity checks; designated historical build attempt disagrees with current hash | Rehashed current files and inspected build metadata | Q13 |
| F14 | Public read/retry, transaction bounds and upgrade/recovery claims need precise support limits | Source/contract review; internal idempotence and TX1 preserved | Q14 |
| F15 | Image UID0 and chart lacks default spreading, NetworkPolicy/PDB/nonroot profile | Image metadata and chart source; no outage/exploit or deployed-cluster claim | Q15 |
| F16 | Flat-download checksum path mismatch; release smokes stop short of real journeys; old chart prose fixed on main; next tag lag is deliberate policy | Published content and workflow inspection | Q16 |
| F17 | Green focused tests and matching artifacts do not cover the discovered semantic failures or establish sustained public-service correctness | Scope comparison of actual witnesses and existing release/certification contracts | Q17 |
| F18 | Ratcheted complexity/duplication and stale planning instructions need targeted owner cleanup | Historical CI/source observations; no whole-rewrite or zero-debt acceptance claim | Q18 |

## F01-F03: SQL semantics and key order

The retained mutation witness calls `SQLQueryEngine.executeQuery` with production
parsing/planning/rendering, replacing only partition execution with a native
SQLite sink and supplying fixture catalog metadata. Each of these returns
`success: true`, `affectedRows: 1` while emitting/storing NULL:

```sql
UPDATE t SET amount = amount + 1 WHERE id = 1;
INSERT INTO t(id, amount) VALUES (2, 2 + 3);
INSERT INTO t(id, txt) VALUES (3, $$hello$$);
UPDATE t SET amount = CAST(5 AS INTEGER) WHERE id = 1;
UPDATE t SET txt = UPPER('hi') WHERE id = 1;
```

The first emits `UPDATE t SET amount = NULL WHERE (id = 1)`. The conversion
default returns a NULL literal for unhandled value AST shapes. See
[value conversion](../../../src/query/sql-parser-expression-methods.js),
[statement parser](../../../src/query/sql-parser.js),
[statement execution](../../../src/query/sql-query-engine-statement-execution.js)
and [SQL rendering](../../../src/query/query-executor-sql-command-rendering.js).

Constraint verification traverses the real parser, `validateUserTableCreateIntent`,
`buildSchemaDefinition` and `createPartitionServiceTable`, including index
generation. The emitted DDL and native PRAGMA observations show the missing
constraints; invalid inserts are accepted. The stronger FK run enables
`foreign_keys`, creates a parent table, and proves a declared-FK control rejects
the same dangling reference. The Lagrange-derived table still accepts it.
See [schema derivation](../../../src/query/table-creation-service-schema-derivation.js),
[CREATE flow](../../../src/query/table-creation-service-create-table.js) and
[physical bootstrap](../../../src/partition/partition-service-table-bootstrap.js).
This does not prove every malformed schema passes every later transaction gate.

For text routing, `compareSplitKey('Z', 'a')` returns -1 while
`compareRoutingKeys('Z', 'a')` returns +1 under the measured collation. The split
snapshot puts Z in the left native child; normal SELECT and INSERT resolve to
the right child. The SELECT misses the row, which remains physically present
on the left. See [comparison owner](../../../src/partition/split-key-comparator.js),
[split placement](../../../src/partition/partition-split-routing.js) and
[normal resolver](../../../src/query/partition-resolver.js). Numeric-key fixes
already exist; this finding is a text-order disagreement, not a blanket claim
that all numeric keys are lexicographic.

## F04-F07: ingress and delivered artifacts

With application Basic authentication active and no Authorization header:

| Request | Observed result |
| --- | --- |
| GET /application-example | 401 |
| GET /cluster/state | 200, seed node/address information |
| POST /bootstrap with empty body | 400, nodeId required: validation reached, successful admission not proven |
| POST /register-service with a valid fresh self-hosted registration | 200 and one services INSERT reaches the storage spy |

The actual [HTTP composition](../../../src/bootstrap/bootstrap-api-server-methods.js)
binds the shared listener and dispatches those internal handlers directly;
wildcard application routes use the authenticated
[request adapter](../../../src/service/request-cell-http-adapter.js).
The [registration owner](../../../src/bootstrap/owners/service-registration-handoff-owner.js)
performs the observed handoff. No external endpoint was attacked and no durable
live-cluster mutation is claimed.

The actual released `lagrange` executable has SHA256
`60c0099e84d23f97095732d7ac9811cdcd638e22028a77c8e9ffa7fc4806e43c`.
`--version` succeeds; `--dry-run` fails with missing better-sqlite3. The
[SEA producer](../../../scripts/build-sea.js) explicitly stages external native,
worker and WASM files, while the [release workflow](../../../.github/workflows/release.yml)
uploads the bare executable. Its in-build-directory smoke cannot detect the
missing downloaded runtime tree.

A new scaffold using the installed published CLI passed service init, its
generated test (1/1) and generate; service build then failed importing
`@bytecodealliance/componentize-js`. The 1,992-entry npm archive has no
`package/wit/`; its compiler is a devDependency. See
[package contents](../../../package.json),
[component build](../../../src/service/service-component-build.js) and
[consumer smoke](../../../scripts/release-npm-package.js). The generate-first
error advice is misleading for this failure. A separate bare wasm-tools CLI
requirement was not established and is not added to the findings.

Fresh dependency inventories differ materially:

| Package | Source/image lock | Installed npm consumer | Interpretation |
| --- | --- | --- | --- |
| Piscina | 4.9.3 | 4.9.4 | Source audit marks critical; upstream calls High and requires a prototype-pollution precondition |
| Fastify | 5.9.0 | 5.12.7 | Source production audit high |
| fast-uri | 3.1.3 | 3.1.9 | Source production audit high |
| find-my-way | 9.6.0 | 9.10.0 | Source production audit high |
| lodash | 4.18.1 | 4.17.23 | Consumer CLI dependency chain remains affected |
| xml2js | 0.6.2 | 0.4.23 | Consumer CLI dependency chain remains affected |

The source audit has 3 high + 1 critical affected package entries; the consumer
has 3 high + 2 moderate, including parent meta-vulnerability entries. Counts
are not independent demonstrated exploits. Root overrides protect the checkout
but are ignored when this package is installed as a dependency, as explained
by the [npm override contract](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#overrides).
The [Piscina advisory](https://github.com/piscinajs/piscina/security/advisories/GHSA-67c8-pqhq-4rmx)
patches 4.9.4; the
[Fastify advisory](https://github.com/fastify/fastify/security/advisories/GHSA-p68q-wchp-6fh7)
patches 5.12.2 for that particular issue. The
[current lodash advisory](https://github.com/lodash/lodash/security/advisories/GHSA-r5fr-rjxr-66jc)
specifies 4.18.1, correcting the earlier audit's 4.18.0 suggestion. Also see
the [xml2js maintainer issue](https://github.com/Leonidas-from-XIV/node-xml2js/issues/663).
These source reports were checked on 2026-10-28; re-audit the eventual candidate.

## F08-F11: resource lifetime and observation

The journal witness passively discovers the actual production store and forwards
every call to its original `record` method. Successful proposal counts of
0/500/1,000/1,500/2,000 retain 5/1,505/3,005/4,505/6,005 records. Applied index
after 2,000 proposals is 2,001. The [durable-store](../../../src/raft/raft-rs-durable-store.js)
array appends unconditionally and its clear method has no production caller.
This proves linear diagnostic retention, not measured OOM or a byte leak rate.

The burst witness uses three native operation ports, on-disk SQLite, virtual
clocks and an actual correctly addressed leader heartbeat. Bursts of 100, 500
and 2,000 drain CORE_OK. All 10,000 messages are accepted, then the
[runtime owner](../../../src/raft/raft-rs-runtime-owner.js) returns HOST_FAILURE,
phase unexpected-throw, reason Maximum call stack size exceeded, retryable true,
recoveryRequired true. A follow-up readStatus reconstructs a healthy usable
follower. No permanent process crash, application data loss or network exploit
was demonstrated. The exact failing count is environment-dependent.

The [cadence owner](../../../src/partition/partition-snapshot-cadence.js) refuses
followers and excludes control-plane/memory partitions; message groups do not
use that PartitionService cadence. A continuously caught-up follower need not
lead or install a snapshot, so its automatic history-reclamation coverage is
incomplete. Native snapshot install and compaction primitives already exist.
The passing [cadence suite](../../../test/raft/snapshot-cadence.test.js) explicitly
expects the follower refusal. No long-run disk-full incident was measured.

The [timer consumer](../../../src/partition/partition-service-participant-transaction-cadence-methods.js)
uses void on the cadence result. The producer returns typed TICK_FAILED on
exceptions and retains only inFlight; that result is not retained/surfaced by
the production consumer. This is the precise observation gap, not proof that
every lower helper is silent.

## F12-F13: proof and native-build provenance

The supported read-only command was rerun:

```sh
node scripts/proof-authority.js check release-full-v1 a1e26f6de84433a3913c2ef855d1b787e926d7eb --json
```

It returns proven, exact-sha, receipt object
`b747fe1fdbbc24f7c3b463a48adf45cc6249db44`, outcome passed, completedAt
`2026-10-28T13:26:44.306Z`, producer `{}`. Identity digest is
`f9ced098c307c6e5a1fc5cdee3d9a062bfb885da547e9c15843bb6b665e35a95`.
The authority and [receipt contract](../../../docs/development/durable-proof-receipts.md)
permit content-based reuse; the empty producer prevents reconstructing the
original measurement from this receipt alone. Preserve the valid registered
claim and improve attribution; do not call it fabricated or force redundant
full reruns merely because multiple consumers use it.

Current WASM SHA256 is
`b285c5eca45ddb6c44301abc0e35c561cd74b24f3e1670b8c49882820aa9e5ad`;
glue SHA256 is `4506be46562d06379c4a1adfb0791bb220096ba780f8cc07eccee6e779e1ab81`.
Both match the [top-level manifest](../../../vendor/raft-rs-wasm/artifact-digest.json)
and [loader integrity checks](../../../src/raft/raft-rs-binding-owner.js).
The nested record names checked-in attempt 3 with a different WASM hash, while
another note says attempt 4 and only attempts 1-3 are listed. BUILD/Cargo prose
still describes an experimental/test-side role. This is inconsistent provenance,
not evidence of wrong or tampered runtime bytes.

## F14-F18: limits, release hygiene and cleanup

- TX1 is real: prepare includes single-participant transactions, positive
  prepare evidence precedes one durable decision, and COMMIT recovery is
  forward-only. No new TX1 atomicity violation was found. See
  [decision protocol](../../../src/query/distributed/distributed-transaction-decision-protocol.js).
- [Participant requests](../../../src/partition/partition-participant-transaction-request.js)
  admit one nonterminal transaction per partition and check partition-wide
  write generation. [Staging](../../../src/partition/partition-participant-transaction-staging.js)
  is replay-based, bounded to 256 operations/1 MiB. These are actual limits,
  not proof of broken atomicity.
- Ordinary SELECT can use an eligible nonleader and local SQLite without a
  consensus read barrier in that path. See
  [query execution](../../../src/query/query-executor-base.js) and
  [local read](../../../src/partition/partition-service-write-metrics-base.js).
  Do not infer linearizability, universal read-your-writes or a global snapshot.
- Internal [SQL write execution](../../../src/query/sql-query-engine-write-execution.js)
  accepts queryOptions.idempotencyKey; its
  [same-entry replay suite](../../../test/query/unknown-outcome-same-entry.test.js)
  passed again. Public [PGwire](../../../src/query/pg/postgres-wire-adapter.js)
  and [application database](../../../src/query/application-database.js) lack
  the equivalent general caller-stable retry contract. Correct any broader
  suggestion that internal idempotence is absent.
- [Current capability facts](../../../docs/current-capabilities.json) retain
  partly-committed wording needing reconciliation with TX1 recovery. The
  existing unsupported upgrade caveat covers older moved-message-group replica
  histories through 0.2.5. Do not prescribe blind old-volume upgrade or claim
  user backup/restore/PITR from replica snapshots.
- The image metadata records linux/amd64 and UID0. The
  [chart values](../../../charts/lagrange-node/values.yaml) have affinity empty,
  with no default failure-domain spreading, NetworkPolicy or PDB. Persistence,
  stable identity, separate health probes and loopback admin protection are
  positive existing defaults. No actual Kubernetes deployment was re-run.
- SHA256SUMS names npm/lagrange-server-0.2.6.tgz although the downloadable
  asset name is flat. The hash is correct; the documented layout needs repair.
  Old shipped chart prose says 0.1.0/0.1; main already fixes it. Ensure the
  next artifact includes that fix rather than reopen it as unfixed source.
- latest=0.2.6 and next=0.2.5 was acknowledged by the release receipt. The
  workflow deliberately separates stable latest, prerelease next and manual
  move-next. This is channel policy, not failed publication.
- Audited CI reported 1,738 inherited cyclomatic and 149 cognitive violations,
  with ratchets passing. Green ratchets mean no forbidden worsening, not zero
  debt. See the [release-source workflow](https://github.com/psvensson/lagrange/actions/runs/40696468544).
  Cleanup should remove duplicated authority in touched interactions; broader
  work stays with existing convergence/apparatus owners.
- Planning revealed stale [epic README](../README.md) guidance mentioning
  overview/contract-v2/no-status, inconsistent with the actual
  [schema](../../../scripts/solve/schema.js), template and supported board/probe
  CLI. This plan follows the executable owner, records the discrepancy, and
  does not introduce a parallel Solver format or silently relax its guards.

## Protected positive results

Published npm, Docker, Helm and GitHub artifact identities were consistent with
0.2.6. The npm artifact includes the vendored WASM. Docker 0.2.6/latest resolved
to `sha256:6fe9153645f28a63b26c6777a9f97b1b4e0d383d1861859fa375029cef63c37a`;
version/revision labels match. Registry identity is not a container startup test.
The [release run](https://github.com/psvensson/lagrange/actions/runs/40696611697)
succeeded and the immutable release proof remains resolvable.

Raft must-sync Ready work uses SQLite FULL before dependent sends; application
mutation and applied-position advancement share a synchronous transaction;
boot incarnation is durably fsynced; pre_vote/check_quorum are configured;
SN1 native capture/catch-up and TX1 replicated participant apply exist. Preserve
these owners and their proofs. Do not turn stale historic planning language
into a claim these implementations are missing.

## Retained reproducer inputs and rerun boundary

The [evidence manifest](evidence/manifest.json) identifies exact source copies
and SHA256s. They are inert `.mjs.txt` audit attachments, not a new production
test runner or sealed regression suite. Restore them to the original relative
locations recorded in the manifest beside a checkout named lagrange-review;
native witnesses use the checkout as cwd. The strengthened FK source is the
authoritative correction to the original FK fixture assumption.

Commands used for the behavioral follow-up, from that checkout:

```sh
node ../lagrange-sql-audit-witness.mjs
node ../lagrange-text-routing-witness.mjs
node ../verification-027/sql/constraint-positive-controls.mjs
node ../review-evidence/raft_journal_growth.mjs
node ../review-evidence/raft_inbound_burst.mjs
node ../verification-027/raft/inbound-burst-recovery.mjs
node ../release-artifacts-audit/http-auth-boundary-witness.mjs
npm run test:file -- test/query/unknown-outcome-same-entry.test.js
npm run test:file -- test/raft/snapshot-cadence.test.js
```

The actual binary/npm commands additionally require the exact published
artifacts identified above and in the manifest; they do not run from source
as a substitute. Raw audit streams remain working evidence rather than being
copied into Git; this reviewed dossier retains the measurements, corrections,
source identities and executable inputs. Future repair acceptance must create
its own candidate-bound receipts through the existing proof/evidence owners.
