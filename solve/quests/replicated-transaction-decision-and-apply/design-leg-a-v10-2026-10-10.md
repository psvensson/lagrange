---
audience: development
documentClass: planning
---

# TX1 Leg A design, revision 10 (2026-10-10)

Quest `replicated-transaction-decision-and-apply` (sealed df51b799a).
**Revision 10 is a narrow delta on [revision 9](design-leg-a-v9-2026-10-10.md)**
after the round-9 re-check (REVISE: R9-1, R9-2, N9-1 and N9-2, recorded by
e33959438). Section 0.0 is that delta, and section 0.0.9 is revision 9's.
Citations are on HEAD e33959438; `git diff f7967ef32..e33959438 -- src test
scripts` is empty.

**Revision 9 was a narrow delta on [revision 8](design-leg-a-v8-2026-10-10.md)**
after the owner-ordered bounded review of revision 8 (REVISE: R8-1..R8-3 and
N8-1..N8-14, recorded by e2a9ec768). Section 0.0 is that delta. The rest of
this text is revision 8, amended only where 0.0 says. Revision 8 completed
[revision 7](design-leg-a-v7-2026-10-10.md). It did two things:

- it answers the round-7 design vet (REVISE: 2 bounded blockers R7-1 and R7-2,
  and nits N7-1..N7-13, recorded in `log.ndjson` by e984cb8db);
- it applies the cloud/query owner's decisions and seam agreement
  ([`owner-decisions-2026-10-10.md`](owner-decisions-2026-10-10.md), committed
  by 0c398d50b; the seam file's section "Cloud/query owner agreement after
  revision 6").

Revisions 1-7 stay as history. Revision 8 is revision 7 amended: unchanged
text is carried over. Every change answers a round-7 blocker or nit, an owner
decision, or one of the lead's revision-8 decisions AN-AP. Deviations from the
brief are listed in section 0.5.

Citations are `file:line` on HEAD e2a9ec768. `git diff 8b76e1de7..e2a9ec768 --
src test scripts` is empty, so the review's citation check still holds. Every
new citation in revision 9 was checked on this head.

Witness files (revision 8's first run: `evidence/red-v8-first-run.tap`;
revision 9's: `evidence/red-v9-first-run.tap`; revision 10's:
`evidence/red-v10-first-run.tap`, counts in 0.0):

| File | Role | Tests | Result |
| --- | --- | --- | --- |
| [`test/partition/partition-transaction-replicated-apply-v3.test.js`](../../../test/partition/partition-transaction-replicated-apply-v3.test.js) | participant witnesses, amended in place | 37 (978 lines) | 37 red |
| [`test/query/partition-transaction-seam-falsifiers.test.js`](../../../test/query/partition-transaction-seam-falsifiers.test.js) | query-lane seam falsifiers, plus the separate owner's F-DET witness | 14 | 14 red |
| [`test/partition/partition-transaction-replay-cursor-v4.test.js`](../../../test/partition/partition-transaction-replay-cursor-v4.test.js) | replay cursor; statement-admission and classifier witnesses W6n, W6s, W6p, W6r, W6r-b (named `TX1 v3 ...`); the four positive controls | 11 | 7 red, 4 controls green |
| [`test/test-helpers/participant-transaction-fixture.js`](../../../test/test-helpers/participant-transaction-fixture.js) | shared fixture | n/a | n/a |
| [`test/test-helpers/controllable-consensus-port.js`](../../../test/test-helpers/controllable-consensus-port.js) | port double, unchanged since revision 7 | n/a | n/a |

## 0. Dispositions

### 0.0 Revision 10: a narrow delta after the round-9 re-check

The round-9 re-check of revision 9 (recorded by e33959438) closed R8-1, R8-2
and all fourteen N8 nits. It returned REVISE with two blockers that revision
9's own delta introduced, R9-1 and R9-2, and two nits, N9-1 and N9-2.

Revision 10 amends only:
- 3.3: R2's key values, and the envelope paragraph;
- 2.3 step 0, which is the same envelope rule;
- 0.5 item 5;
- the envelope row of 0.3;
- premise item 4;
- L4, L7 and L10;
- the W20 description (10.1);
- 8.3 point 5 (the batching owner);
- 9.2 derivation 3 (the pgwire Bind path).

The seam's revision-10 section replaces the revision-9 census item. Section
0.0.9 below is revision 9's delta, kept as history.

Witness files (first run: `evidence/red-v10-first-run.tap`, sha256
36d797d3296c7fa1...):

| File | Tests | Result |
| --- | --- | --- |
| participant (984 lines) | 37 | 37 red |
| seam falsifiers | 14 | 14 red |
| replay-cursor sibling | 11 | 7 red, 4 controls green |

Receipt membership and counts are unchanged: 3/10/14+5/4+3/5+1/7/3+3, with M1
and A1-A5 absent.

#### The 2 blockers

| # | Blocker (round 9) | Revision-10 disposition | Section | Witness |
| --- | --- | --- | --- | --- |
| R9-1 | "A string param in a key position is never an explicit integer" refused every parameterised integer-key write arriving over the PostgreSQL extended protocol. The pgwire Bind parser decodes every parameter as text (`src/runtime/pgwire-message-parsers.js:75-102`), and the text reaches the partition unconverted (`pgwire-protocol-handler.js:619-623`, `src/query/pg/postgres-wire-adapter.js:190-231`). This hits transactional inserts and PostgreSQL upserts alike | Decision AT. A string param is an explicit integer key iff it is canonical decimal text (`^-?(0\|[1-9][0-9]*)$`) and its exact BigInt is a valid int64. In a session it must also lie in [-2^62, 2^62). Non-canonical text (leading zeros, whitespace, a `+` sign, an exponent, anything else) is not an explicit integer: it is refused at `implicit_key` in a session, and makes an ordinary statement "can allocate". `'9223372036854775807'` stays refused in a session (out of range), and R3 still catches it on the ordinary path | 3.3 (R2), 9.2 | W6r-b: a session INSERT with key `'9'` stages; an ordinary REPLACE with key `'5'` applies identically on two replicas; a wire REPLACE with key `'10'` is proposed; the non-canonical `'011'` is refused at `implicit_key`. Positive control: `pgwire-command-tag-real-engine.integration.test.js:597-604` (9.2) |
| R9-2 | A census taken once, before the first replica switches, does not cover the rolling window. An old-build leader can still commit old-envelope commands that an upgraded replica can never apply | Decision AU. **The envelope becomes diagnostic, not a stall.** Every replica applies a committed transaction command exactly as carried, whatever its envelope. A mismatch between the command's envelope and the applying replica's own build is recorded as a typed diagnostic: the log message `PARTITION_SERVICE_LOG_MSG.TRANSACTION_ENVELOPE_MISMATCH`, and a counter read through `readTransactionEnvelopeDiagnostics()`. It is never a refusal or a host failure. The residual risk is stated as L10. The release obligation for SQLite or classifier-list bumps is stated with its owner and falsifier. The permanent-stall hazard and the revision-9 one-instant census are removed | 3.3, 2.3, 0.5 item 5, L10, seam rev-10 | W20: a command with a mismatched envelope is applied as carried and the diagnostic is counted; PREPARE and COMMIT carry the leader's envelope on the wire |

**Why apply-as-carried is safe for the envelope (AU).** The apply side never
classifies (AB, 3.3), so a classifier-list difference between replicas cannot
change any replica's disposition of a committed command. What the envelope
could still signal is a SQLite semantic difference between builds for the
supported SQL population: the same bytes computing a different result. That is
the same class of risk that ordinary writes carry today, since they have no
envelope and run on whatever build each replica has. A refusal would turn that
risk into a permanent stall (round-8 R8-3, round-9 R9-2), which is worse. The
diagnostic gives the release owner the evidence.

**The release-owner obligation (AU)**, for every release that changes the
SQLite build, its compile options or the classifier list:
1. **At the start of the rolling upgrade: the L6 drain.** No transaction
   command is in flight, and every replica of every partition, its snapshot
   floor included, has applied past the last committed `PARTICIPANT_PREPARE` or
   `PARTICIPANT_DECISION`.
2. **Then no transaction admission until every replica reports the new
   build.** The participant's existing typed BEGIN refusal path (3.3) consumes
   the signal; the signal itself is the release owner's. No such signal exists
   in `src` today: a search for an upgrade, maintenance or per-node build
   signal finds none. It is therefore recorded as a release-owner obligation,
   not as a new TX1 mechanism.

**Falsifier for the release owner:** an envelope-changing release in which any
replica records an envelope diagnostic for a command committed after the drain,
or in which a BEGIN was admitted before every replica reported the new build,
is a failed upgrade. The release owner reads both from W20's surface (the
counter and the last mismatch) and from the admission log.

#### Nits

| Nit | Disposition |
| --- | --- |
| N9-1 | L7 declares it: R1 also refuses alias tokens in WITH-headed UPDATE and DELETE writes. That is a conservative false refusal with no consumer |
| N9-2 | 8.3 point 5 names the batching owner: `partition-cdc-delivery.js` (the CDC delivery owner) batches acknowledgements per committed entry, one replicated write per batch. The batch size and the per-event cost are that owner's open item |
| N9-3 | Recorded: the pgwire `:768` timeout is confirmed unrelated to TX1 (round 9 traced the test's import closure). Its cause is still unattributed, between the takeover/FreshMG base and earlier |

#### Deviations in revision 10

1. **The diagnostic's read surface is pinned.** It is
   `readTransactionEnvelopeDiagnostics()` on the partition, returning
   `{mismatchCount, lastMismatch: {commandType, carried, own, index}}`, so W20
   can read the counter. This is a read-only participant surface. The release
   owner's signal stays outside TX1.
2. **The revision-9 W20 stall witness is replaced, not kept.** W20 now asserts
   the opposite of revision 9: the command applies, and the mismatch is only
   counted.

#### Final open decisions

- **F-DET (L11):** the engine freezes per-replica values, or the partition
  apply refuses them, or the exposure is accepted.
- **The release-owner obligation for envelope-changing releases (AU):** the
  drain and the admission pause, with the release owner's admission signal and
  a home in the release runbook.
- **The batching of receipt 8's delivered flag (N9-2):** the CDC delivery
  owner.
- **Retirement of `partition_write_consensus_host_failure`** with AD.
- **An index-DDL command type** (optional).
- **The classifier owner's acceptance** of the 116-opcode population.
- **A dedicated admission-witness file.**
- **Red or flaky tests for their owners:** F-aj in
  `partition-write-answer-consumers`, and the pgwire `:768` timeout.
- **Shard census and `evidence/receipt.json`:** regenerated by the lead.

### 0.0.9 Revision 9: a narrow delta after the owner-ordered review of revision 8 (history)

The owner-ordered bounded review of revision 8 (recorded by e2a9ec768) returned
REVISE with 3 bounded blockers, R8-1..R8-3, and nits N8-1..N8-14. Everything
else in revision 8 holds. Revision 9 amends only:
- 3.3: R1, R2 and R3, the self-check's ceiling probe, the lexer note, the
  prepare-site claim and the execution envelope;
- 0.5 item 5 and L10;
- 9.2 derivations 3 and 4;
- the retirement map's replay control;
- receipt 8's citations (8.3);
- the stale cross-references of N8-13.

Sections 0.1-0.7 below are revision 8's, except where this subsection
supersedes them.

**Branches (N8-14).** Per the owner record, the FreshMG integration and the TX1
work are separate branches:
- `freshmg/integration-20261010` does not contain the TX1 seal 0a25d29bd;
- `tx1/work-20261010` carries this work.

Witness files (first run: `evidence/red-v9-first-run.tap`, sha256
e6b4fecf550792f0...):

| File | Tests | Result |
| --- | --- | --- |
| participant (983 lines) | 37 | 37 red |
| seam falsifiers | 14 | 14 red |
| replay-cursor sibling | 11 | 7 red, 4 controls green |

Receipt membership is unchanged; the counts are 3/10/14+5/4+3/5+1/7/3+3, plus
M1 and A1-A5 absent.

#### The 3 blockers

| # | Blocker (review of revision 8) | Revision-9 disposition | Section | Witness |
| --- | --- | --- | --- | --- |
| R8-1 | R2's REPLACE refusal disabled existing explicit-key upserts on INTEGER PRIMARY KEY tables (the PostgreSQL `ON CONFLICT` rendering, plain `INSERT OR REPLACE`, the split/merge snapshot backfills, `upsertData`) | Decision AQ. R2's two in-statement refusals apply only to a statement that **can allocate**: some row's key is NULL, omitted, an expression, SELECT-sourced, or a param that is not an integer (strings included). An `INSERT OR REPLACE` or `ON CONFLICT DO UPDATE` whose keys are all explicit integers is admitted on both paths: it never reaches `NewRowid`. Derivation 3 now lists the four senders, and the pgwire test is a positive control | 3.3 (R2), 9.2 | W6r-b: explicit-key REPLACE, single- and multi-row, applies identically and proposes on the wire; REPLACE with a NULL or omitted key is refused at apply, and on the wire at `rowid_allocation`; a session explicit-key REPLACE stages |
| R8-2 | The positional alias rule admitted `ON CONFLICT (k) WHERE ... DO UPDATE SET rowid = ...`, because the conflict-target WHERE fell inside the "top-level WHERE" region. On a TEXT key this reaches random rowids that the post-check cannot see (SQLite draws the fallback below 2^62, `sqlite3.c:99167`) | Decision AR. On the ordinary path an alias token is admitted **only** inside the top-level WHERE clause of a statement whose head is UPDATE or DELETE. The schema-migration backfill, an UPDATE, is its only consumer. Any alias token anywhere in an INSERT, REPLACE or WITH write is refused on both paths. R2 states that alias tokens and row-value targets count as the key, and rejects string params in key positions | 3.3 (R1, R2) | W6r: the TEXT-key conflict-target-WHERE upsert is refused at `rowid_alias` on the wire and identically at apply. W6r-b: the same on an integer key, and the string-param top key |
| R8-3 | The execution envelope holds in one upgrade direction only. A replica upgraded past an old-envelope command can never apply it, but the design said it applies "once its build matches" | Decision AS. Disposition: a **release-owner precondition** for every envelope change. Before any replica runs a new envelope, every replica of every partition, its snapshot floor included, has applied past the last transaction command. The stall is typed and visible: a host failure with reason `execution-envelope-mismatch` and both envelopes in its detail, never silent. The existing release preflight (`scripts/release-preflight.js:1-22`) checks five facts about the checkout and nothing about cluster state, so the census is recorded as a release-owner obligation with its falsifier (3.3, L10) | 3.3, 0.5 item 5, L10, seam rev-9 | W20: every envelope field perturbed on PREPARE; an old-envelope COMMIT met by this replica stalls, typed, with both envelopes, and every retry alike |

#### Nits

| Nit | Disposition |
| --- | --- |
| N8-1 | The lexer note adds space (0x20). It also states that VT inside a whitespace run is consumed by SQLite but refused by the owner at the start of a run: fail-closed |
| N8-2 | String params are rejected in key positions (R2). W6r-b adds the string-param top key and a carried PREPARE (top key, then NULL) on an integer-key replica. The "compares only with 2^63-1" wording (0.4 row 1) now reads "a pre-check that compares only with 2^63-1" |
| N8-3 | W20 perturbs each of the four envelope fields on PREPARE, and also the envelope on a COMMIT decision |
| N8-4 | S4c's `phaseSafe` requires the setter after both branches, before `partition.sqlQueryEngine = cdcQueryEngine`, and with no `await` in between. S4d records what the engine held when the phase published it to the partition |
| N8-5 | Derivation 4 adds `executeOnePhaseCommitStage`, `onePhaseCommitSupported` and `transaction-owned-commit-mode-guard.test.js:55` (re-checked against S2) |
| N8-6 | W9 re-applies the same bound COMMIT (expects rows 1 and one `txop:` outcome); the retirement map's replay control maps to it |
| N8-7 | The claim reads "every site that prepares caller-supplied SQL text". The code-built SELECT sites are listed as outside the claim |
| N8-8 | R2 pins SQLite's alias rule and covers `UPDATE ... SET <key> = ?` in sessions |
| N8-9 | Premise item 1 and L11 say "per-replica values" (functions, connection state, replica-local tables) |
| N8-10 | The ceiling probe uses an in-range integer key on integer-key tables |
| N8-11 | W6p adds `executeQuery` called directly, and `DROP INDEX` of a schema-declared index |
| N8-12 | 8.3 cites `buildEventIdentity` (`cdc-event-buffer.js:37-43`) and defines where "owed" lives |
| N8-13 | Fixed: the 3.6 seam-V sentence; the S7 title (prepare-first is final); the 10.4 line count; the 10.1 "36 `actual` blocks"; the five stale "0.5 item N" cross-references |
| N8-14 | The branch pointer above |

#### Deviations in revision 9

1. **The release-owner census has no existing preflight to live in.**
   `release-preflight.js` is a pre-tag repository check (`:3-17`). The census
   is a live-cluster fact. It is recorded as an obligation of the release
   owner, to be added to the upgrade runbook (`RELEASE.md`, which has no
   upgrade section today), with its falsifier in L10.
2. **R2's ordinary-path refusal gets its own layer name, `rowid_allocation`.**
   It is neither an alias token nor the ceiling, and the answer should say
   which rule refused.
3. **The pgwire positive control is red today, for a reason unrelated to
   TX1.** `test/integration/pgwire-command-tag-real-engine.integration.test.js`
   imports no file this revision changed. In all three runs here it timed out
   (`timeout!`, `:768`, 300 s budget) after subtest 49 or 50. That is before
   the tag cases at `:145-167`, so the upsert case was never reached. Its owner
   must restore it. At cutover, the R8-1 positive is required to stay green
   there.

#### Remaining open decisions

- **F-DET (L11):** the engine freezes per-replica values, or the apply refuses
  them, or the exposure is accepted.
- **The release-owner envelope census (R8-3):** accept the obligation and give
  it a home in the release runbook.
- **Retirement of `partition_write_consensus_host_failure`** with AD.
- **An index-DDL command type** (optional).
- **The classifier owner's acceptance** of the 116-opcode population.
- **A dedicated admission-witness file.**
- **Flaky or red tests for their owners:** the F-aj flakiness and the pgwire
  timeout (deviation 3).
- **Shard census and `evidence/receipt.json`:** regenerated by the lead.


### 0.1 The landing rule (owner decision)

The cloud/query owner has **agreed the seam**: items A, B/S, C, C', D, E, F, G,
H, U, V, T/AD, S4b and S4c, under the exact choices and qualifications of the
owner record. Section 11.1 lists them as agreed.

Agreement is not acceptance of this design, participant source, or Quest
landing. Each of those is a separate milestone:

- after design acceptance, each lane implements in its own worktree;
- shared owner edits are serialized;
- the lanes integrate one compatible protocol cutover candidate.

TX1 stays OPEN until all of these hold for the exact candidate:

- every sealed receipt is green;
- the real three-replica witnesses A1-A5 and the persisted-migration witness M1
  pass;
- the source and gate checks pass.

Revision 6's "receipts still red by design" exception (11.3) does not apply to
Quest landing. The bounded AD kernel correction may land on its own, with its
own acceptance and source verification; it does not close TX1.

### 0.2 The 2 round-7 blockers

| # | Blocker (round 7) | Revision-8 disposition | Section | Witness |
| --- | --- | --- | --- | --- |
| R7-1 | The ceiling guard runs before a statement. One statement can assign the top key and then allocate (`VALUES (2^63-1, ...), (NULL, ...)` on an INTEGER PRIMARY KEY table; `INSERT INTO t AS x (rowid, ...)` evades the assignment parse), so random rowids stay reachable | Decision AN. The ceiling becomes a **post-statement** invariant at four sites: session staging inside c'; each PREPARE dry-run operation; each COMMIT-apply operation; each ordinary committed SQL apply. After the statement, `max(rowid)` of the own table, read as an exact BigInt (`safeIntegers`), must be below 2^62; otherwise the statement's effects roll back and it is refused `rowid_ceiling`. Inside an allocating statement on an INTEGER PRIMARY KEY table, the shapes that could lower the top key again (REPLACE resolution, a key-assigning `DO UPDATE`) are refused, so the post-statement check sees every intermediate maximum. On the ordinary path the alias rule refuses an alias token anywhere outside the top-level WHERE clause, so `AS alias` needs no special parse. The pre-check stays for legacy state | 3.3 | W6r-b (new), W6r (AS alias, dry-run half) |
| R7-2 | Premise item 1 was stated as held, but F-DET and the unreplicated `executeLocalQuery` break it; `executeLocalQuery` is also a prepare site outside the kind owner | Decision AO. (1) `executeLocalQuery`, the CDC bootstrap direct path's head checks and the `executeSystemTableRead` fallback route through the statement-admission owner. (2) Premise item 1 lists its breakers with owners. (3) F-DET is not fixed in TX1. Limit L11 states the consequence, K is conditional on it, F-DET is an R17 finding with a red witness owned by a separate owner, and the owner choice is presented | 3.3, 6.2, 9.3, 11.3 | W6p (`executeLocalQuery` case), seam FDET (separate owner) |

### 0.3 The owner decisions, applied section by section (decision AP)

| Owner decision | Applied as | Section | Witness |
| --- | --- | --- | --- |
| Prepare-first is final; retire the ONE_PHASE_COMMIT fast path and its incompatible assertions and documentation; DIRECT_AUTOCOMMIT unchanged | 11.2 states the choice. Derivation 4 (9.2) inventories every ONE_PHASE_COMMIT site in `src`, `test` and the documents, each with its supersession | 9.2, 11.2 | S7 |
| L5 and L3 accepted as an availability trade-off, not an R12 exception | 3.6 and 8.4 restated. A deadline bounds a caller's wait, never the PREPARED obligation. PREPARED never expires into permission. An eligible recovering engine returns and releases a PREPARED row only by the authoritative decision | 3.6, 8.4 | W16 (uncontended and after-interference positives), W12d, S4a, S8 |
| Rowid: owned admission guards for the supported SQL population; WITHOUT ROWID deferred | The five acceptance conditions mapped one by one to mechanisms and witnesses | 3.3 | W6r, W6r-b, W6p, L9 |
| L6: a pre-cutover census that every partition table's max rowid is below 2^62 | In the L6 precondition | 11.3 | n/a |
| The opcode check enforces a stated supported SQL population with default refusal; it is never a proof; observing a new opcode never expands it | 3.3 restated; `SoftNull` is vetted into the population on an explicit argument, and `NotFound` and `Filter` stay refused (L7) | 3.3 | W6n |
| Pin the execution compatibility envelope for all replicas, restored followers included | Transaction commands carry an execution envelope. Revision 10 (AU): every replica applies the command as carried and records a typed diagnostic on a mismatch; the release-owner drain and admission pause cover envelope-changing releases; L10 states the residual risk | 2.3, 3.3, 11.3 | W20 |
| No 50 ms bound promise | The replay budget drops its wall-clock clause; work is bounded by operation and byte counts | 3.1 | n/a |
| S4c option 1 is final: call `setCDCIntegrationService` on the seed SQL engine after CDC creation or upgrade, through the existing setter; no `autoStartDistributedTransactionRecovery` flip; keep the refusal case | S4c's structural check requires that call after both branches. S4d runs the real phase in both construction branches. M1 names the persisted two-participant migration through actual production composition | 9.2, 11.1 | S4c, S4d (new), M1 (named) |
| Receipt 8: named owners and a durable obligation | 8.3 names the owners and specifies the obligation | 8.3 | receipt 8 stays absent |
| Trust boundary | 2.4 states it: decision records are authoritative through the trusted coordinator route; a self-computed digest is content identity, not authentication; no second decision lookup during committed apply | 2.4 | n/a |
| H: register the coupled pair through the impact-contract owner | 11.1 | 11.1 | gate |
| Retirement map for the revision-2 file | 9.2 maps P1, P2, P3 and both controls to stronger live witnesses, with an explicit retirement entry | 9.2 | n/a |
| Current counts are inventories, not seal thresholds | 10.2 | 10.2 | n/a |
| Agreed items are no longer open | 0.7 and 11 | 0.7, 11 | n/a |

### 0.4 The witnesses round 7 requires (its section 3)

| # | Requirement | Witness | Red on e984cb8db because | Not greenable by |
| --- | --- | --- | --- | --- |
| 1 | W6r-b: the multi-row INTEGER PRIMARY KEY insert, committed on two replicas, refused `rowid_ceiling` with equal rows; `INSERT INTO t AS x (rowid, ...)` refused at `rowid_alias` on the wire; the owner's counterexample (existing max 2^63-2, then two automatic insertions) | W6r-b, W6r | W6r-b: both statements apply; the rowids of the inserted rows differ between the two replicas (random allocation). The four session cases on the INTEGER PRIMARY KEY leader all stage. W6r: the AS-alias insert is proposed | a before-statement guard (both statements start below the top); a pre-check that compares only with 2^63-1 (the owner's counterexample starts at 2^63-2); refusing every explicit integer key (the in-range key must stage) |
| 2 | The kind owner on every prepare site, the lexer case and the N7-2 heads | W6p | 10 wire cases and the `executeLocalQuery` PRAGMA all prepare (9 are proposed, one fails to compile); the leader's flag is 1 | a deny-list of PRAGMA and DROP (ATTACH, CREATE TRIGGER, ANALYZE, `;PRAGMA` and the comment-terminator cases are measured); a JavaScript lexer that ends `--` at CR or U+2028; a kind check missing from `executeLocalQuery` |
| 3 | F-DET: a red witness if closed, L11 if accepted | seam FDET (separate owner), L11 | the two replicas store different values | n/a (separate owner) |
| 4 | The PREPARE dry-run ceiling half | W6r | the PREPARE is UNRECOGNISED | a staging-only ceiling |
| 5 | Recommended: the backfill positive half, an aggregate probe, the RC2 converse | W6r, W6s, RC2 | W6r: the backfill update is proposed and applies today, while the rest of W6r is red; W6s: the module is absent; RC2: the applied-first sequence mirrors `replayed-r` twice | refusing every rowid reference (the backfill must still propose and apply); first- or last-occurrence de-duplication (RC2 measures both orders) |
| 6 | Still owed: CDC exactly-once, the mirror sender, A1-A5 | unchanged (10.3), plus M1 | n/a | n/a |

### 0.5 The brief and every deviation (R16, R21)

**Lead decisions** (recorded by the lead):

- A-P, Q-Z, AA-AG, AH-AJ and AK-AM are as recorded in revisions 3-7.
- **AN (R7-1):** the post-statement ceiling, exact BigInt, at four sites; the
  assignment rule handles `AS alias`; W6r-b with the owner's counterexample;
  the backfill and the persisted cutover kept as positive witnesses.
- **AO (R7-2):** `executeLocalQuery` and the CDC bootstrap head checks through
  the kind owner; premise item 1's breakers with owners; F-DET not fixed in
  TX1, limit L11, K conditional, an R17 finding with a separate owner's red
  witness, and the owner choice; nits N7-1..N7-13.
- **AP:** the owner decisions applied section by section (0.3).

Revision 7's deviations 1-8 stand, except where noted. New in this revision:

1. **(Superseded in revision 9 by AR: R1 now admits an alias token only in the
   top-level WHERE of an UPDATE or DELETE.)** **The ordinary-path alias rule
   is positional, not an assignment parse.** AN
   asks for an assignment rule that parses `AS alias`. I took the vet's
   simplest safe form instead: on the ordinary path an alias token is refused
   anywhere outside the top-level WHERE clause. It needs no grammar for `INTO
   [schema.]name [AS alias] (`, quoted names or row-value targets, and it still
   admits the backfill. The cost is that `SET x = rowid` (a value copy) is also
   refused; no consumer sends it (derivation 3).
2. **(Narrowed in revision 9 by AQ: only in a statement that can allocate.)**
   **Two in-statement shapes are refused on INTEGER PRIMARY KEY tables, beyond
   AN's post-check.** A post-statement check proves "no random allocation" only
   if the table's maximum cannot fall during the statement. On an INTEGER
   PRIMARY KEY table it can fall: an allocating statement can delete the top
   row (REPLACE conflict resolution) or rekey it (`ON CONFLICT DO UPDATE SET
   <key> = ...`) after a random allocation, and leave a final maximum below
   2^62 on one replica only. In an allocating statement on such a table, those
   two shapes are therefore refused, on both paths. Without them, an INSERT
   only adds rows, so the maximum is monotonic and the final check sees every
   intermediate maximum. TEXT-key tables need no such rule, because there no
   statement can assign a rowid at all (the alias rule).
3. **Transactions get an exact INTEGER PRIMARY KEY contract** (owner condition
   1). In a session write on an INTEGER PRIMARY KEY table, the key's value must
   be a bound param or an integer literal inside [-2^62, 2^62). A NULL, an
   omitted key, an expression or a SELECT source is refused at
   `implicit_key`. Ordinary writes keep automatic allocation (product
   behaviour), under the post-statement check.
4. **`SoftNull` is vetted into the supported population (116 opcodes).** Every
   INSERT into an INTEGER PRIMARY KEY table compiles to it, and the owner
   requires normal explicit integer keys to work. Vetting it is safe only
   together with item 2, item 3 and the post-check. `NotFound` (a correlated
   IN) and `Filter` (an IN over a non-key column) stay refused and are declared
   in L7.
5. **The execution envelope is carried, and diagnostic (revision 10, AU).**
   The owner asks for the compatibility envelope to be pinned for all replicas.
   `PARTICIPANT_PREPARE` and `PARTICIPANT_DECISION` carry `executionEnvelope:
   {sqliteVersion, sqliteSourceId, compileOptionsDigest,
   classifierListVersion}`, stamped by the leader. Every replica applies the
   command as carried, whatever its envelope. A mismatch with the replica's
   own build is recorded as a typed diagnostic (a log message and a counter,
   3.3), never a refusal or a host failure.
   - Revisions 8 and 9 refused the command instead. That left a replica that
     met an older envelope stalled for good (round-8 R8-3, round-9 R9-2), and
     it is withdrawn.
   - The pin is kept as evidence plus a release-owner obligation: the L6 drain
     at the start of an envelope-changing upgrade, then no transaction
     admission until every replica reports the new build (0.0, L10).
   - Ordinary writes do not carry an envelope; their mixed-build risk is the
     same class (L10, L11).
6. **The statement-admission owner gets its own module.** The kind rule, the
   rowid rules and the ceiling check move to
   `src/partition/partition-statement-admission.js`. The session classifier
   (`partition-transaction-determinism.js`) calls it. This answers N7-13: the
   module that governs every statement on the connection is named for that.
7. **The persisted two-participant migration is named, not built.** M1 lives
   in `test/integration/seed-migration-cutover-persisted.integration.test.js`,
   which does not exist yet; receipt 6 binds it the way receipts 2-4 bind
   A1-A5. Building it needs the real system-table partitions; that is the
   source lane's.
8. **The F-DET witness sits in the seam file and is bound to no TX1 receipt.**
   Its owner is the query engine (freeze `NOW()`/random before fanout) or the
   partition apply (refuse). The witness has the partition-apply shape (two
   replicas must store the same thing). Under the engine option, its owner
   supplies an engine-level witness instead.
9. **Revisions 6 and 7 still trip the documentation audit.** The audit reads a
   grep character class followed by `(` as a broken local link
   (`design-leg-a-v6-2026-10-10.md:1561`, `design-leg-a-v7-2026-10-10.md:1770`,
   `:1828`). Those files are history and outside this revision's write scope.
   Revision 8 writes the class as `[...]+(`, which does not parse as a link.

### 0.6 Round-7 nits

| Nit | Disposition | Where |
| --- | --- | --- |
| N7-1 (kind lexer) | SQLite's lexical rules are pinned with citations. W6p adds the CR and U+2028 comment-terminator cases | 3.3, W6p |
| N7-2 (W6p deny-list) | W6p adds ATTACH, CREATE TRIGGER, ANALYZE, `;PRAGMA`, both lexer cases, unbound and foreign index DDL, and `executeLocalQuery` | W6p |
| N7-3 (W6r gaps) | The backfill positive half (proposed, and applied on two followers), the quoted, `oid`, `_rowid_` and qualified forms, `AS alias`, and the PREPARE dry-run ceiling half | W6r |
| N7-4 (index DDL scope) | Narrowed to `CREATE INDEX [IF NOT EXISTS] <name> ON <own table> (...)` and `DROP INDEX [IF EXISTS] <name>` of an index on the own table. `CREATE UNIQUE INDEX` is refused (no `src` file sends it) | 3.3, W6p |
| N7-5 (L9 overclaims) | L9 names its three refused shapes and lists the admitted order-sensitive ones. It also says that L9b makes the admitted WITH-write head VALUES-only in practice | 3.3 |
| N7-6 (undeclared false refusals) | `SoftNull` is vetted (0.5 item 4). `NotFound` and `Filter` are in L7 | 3.3, 11.3 |
| N7-7 (apply-side checks change committed dispositions) | Justified from derivation 3: no sender of a refused head or of an alias outside WHERE exists. Added to L6 as the mixed-version disposition window; the release-owner drain and admission pause close it for transaction commands, and the envelope records any disagreement (0.5 item 5, revision 10) | 3.3, 11.3 |
| N7-8 (self-check coverage) | Two probes added: `aggregate_insert` (refused at `row_order`) and `ceiling_insert` (refused at `rowid_ceiling`, inside a sentinel transaction) | 3.3, W6s |
| N7-9 (RC2 last-occurrence de-dup) | RC2 measures both orders: refused-then-applied, and applied-then-replayed | 8.1, RC2 |
| N7-10 (S4c brittleness) | `phaseSafe` is now a positive pattern: the setter call on the seed engine, positioned after both CDC branches. Renaming or reordering fails it, never passes it. S4d adds a behavioural check through the real phase | S4c, S4d |
| N7-11 (port fidelity) | The 3.3 root-page table is labelled fixture-specific. The residue is recorded: the double opens the store unconditionally, and opens neither the peer-identity registry nor the lifecycle owner (`raft-rs-operation-port.js:163`, `:181-183`, `:204`) | 3.3 |
| N7-12 (init-time index re-creation) | Premise item 2 names it: a `DROP INDEX` of a schema-declared index comes back on a restarted replica only (`system-table-schema-sql.js:42-53`, run at `partition-service-table-bootstrap.js:179-181`). Owner: the index owner. The narrowed index rule refuses a `DROP INDEX` of a schema-declared index | 3.3 |
| N7-13 (owner placement) | Moved: `partition-statement-admission.js` (0.5 item 6) | 3.3 |

### 0.7 Open decisions (after the owner record)

The owner record settles every earlier seam and design choice. Still open:

- **F-DET (L11):** the query owner freezes nondeterministic values before
  fanout, or the partition apply refuses them, or the exposure is accepted as
  stated in L11.
- **Retirement of `partition_write_consensus_host_failure`** with AD (the
  write-kernel owner).
- **Index DDL as its own command type** (index-management and partition
  owners). It is optional now that the rule is narrowed to the own table.
- **The classifier owner's acceptance** of the 116-opcode supported population.
- **A dedicated witness file** for the statement-admission witnesses (the
  lead's).
- **`partition-write-answer-consumers.test.js` F-aj flakiness:** its owner
  (round 7 judged it unrelated to TX1).
- **Shard census and `evidence/receipt.json`:** regenerated by the lead at
  commit.
### 0.0.11 Lead corrections from the AD source verification (2026-10-10)

The independent source verification of the AD kernel repair (quest log,
verifier subagent:ae6f8e01fdce4344a) found three statements of this design
false against the code. They are corrected here; the mechanism in section 7 is
otherwise unchanged.

- Census of `unansweredWriteResult`'s default branch (section 7, "controllable
  port only"): on a real multi-replica rs-raft group the leader's own
  environmental apply failure after the quorum commit also reaches the default
  branch, so it is the production path for that case, not a port artefact. A
  throw from the post-commit side-effect plan (split/merge mirror enqueue at
  capacity) was reachable through the same catch; the repair runs the plan
  outside the answering catch, logs the throw with the entryId
  (`COMMITTED_WRITE_SIDE_EFFECT_FAILED`) and answers the committed result,
  because the write is applied and a redelivery is idempotent. UNRECOGNISED
  stays an unknown outcome as section 7 admits.
- "Cause retained" (9.2 row for `committed-statement-outcome.test.js:776-790`):
  the cause is retained in the kernel's answer and logged by the leader
  (`WRITE_OUTCOME_UNKNOWN_CAUSE`); it does not cross the typed hop, whose
  envelope carries the typed fields (`failureCode`, `entryId`, the error text,
  `consensus` on a refused proposal) but not the cause; `failureCode` and
  `entryId` are what every classifier needs. The SQLite code is observable in the leader's log, not at the seam.
  Owner reading recorded under R09 in the `TYPED_WRITE_ANSWER_FIELDS` comment.
- Text-only retry (9.2 row for `control-plane-error-classification.test.js`):
  the kernel's answers for a write that failed while it was proposed or
  applied (a host failure while proposing, a failure of its own committed
  apply, an unrecognised command) carry a text of their own
  (`WRITE_OUTCOME_UNKNOWN_AFTER_FAILURE`) that the text-only retry classifiers
  (`isRetryableWriteError`, the control-plane fragments) never match, so an
  Error carrying only that text is not retried by them; the typed answer is
  what the routers retry, under its entryId. The other two may-have-committed
  answers, a proposed release (`partition-write-kernel.js:388`) and CORE_FATAL
  (`:440-441`), keep the release text `WRITE_OUTCOME_UNKNOWN`, which the
  text-only classifiers do retry, as on HEAD. This is what the witnesses
  measure (the kernel answer passed to `buildSystemTableMutationError`). It is
  NOT an end-to-end guarantee: the query executor rewrites an unresolved
  write's text to the release text `WRITE_OUTCOME_UNKNOWN` at the end of its
  budget (`query-executor-unknown-outcome.js:201-207`), which
  `isRetryableWriteError` matches, and the distributed write coordinator's
  aggregate text ("Distributed operation failed due to participant failures")
  is a retryable control-plane fragment carrying typed `participantFailures`;
  through those owners a host-failure UNKNOWN is re-driven under a fresh
  participant entryId exactly as on HEAD (measured end to end on HEAD and on
  the repair; the environmental case is inferred from the same coordinator
  path, not separately measured). The 9.2 row's "Error of its text is retried" half is withdrawn; the
  end-to-end re-drive is routed below, not promised closed here.
- Leader cause log level: the cause log `WRITE_OUTCOME_UNKNOWN_CAUSE` is
  emitted at warn so it is observable at the default log level (a failure
  path, not a hot path); the witnesses pin emission at the default level.

Findings routed to other owners (R17): the CDC mutation owner's
`buildSystemTableMutationError` drops `failureCode` and `entryId` (R07); the
control-plane identity, lifecycle, CDC and classifier owners: loop identities
are not threaded through `persistReplicaStatusWithRetry` and the state
machine's persistence options, the executor rewrites unresolved texts to the
release text, and the write coordinator's aggregate text is a retryable
fragment, so release, host-failure and environmental UNKNOWN re-drives mint a
fresh participant entryId end to end (the host-failure case measured on HEAD
and on the repair by the real-engine lifecycle probe `lifecycle-fresh-key-e2e`
in the verification record, through the write coordinator's aggregate
retryable text and its typed participantFailures; the release and
environmental cases are inferred, not separately measured): a pre-existing
finding, not introduced by AD; the mirror enqueue
at capacity after commit leaves the committed delta unmirrored (limit L1 class);
a held-group propose refusal is answered UNKNOWN (conservative).

### 0.0.12 Lead record from the increment-2 source verification (2026-10-11)

The statement-admission owner's independent verification (quest log, verifier
subagent:ad9cf46de3adf7901) found three divergence channels in the first
attempt's SQL reading (single-quoted names in name positions, the first mention
of a duplicated INTEGER PRIMARY KEY column where SQLite takes the last, and
compound VALUES sources), a `PRAGMA optimize` reachable through an admitted
read via the `pragma_optimize` table-valued function, and a retry answered by
the ceiling pre-check before the settled-outcome lookup. The corrective
attempt reads names as SQLite 3.49.2 does (a new names module), follows the
last-mention rule, treats anything after the VALUES rows other than ON
CONFLICT / RETURNING / `;` / end as SELECT-sourced, answers a settled entryId
from its outcome row before any admission rule, and adds three text rules on
every ordinary path, reads included:

- `statement_function`: any `pragma_` name, `fts3_tokenizer`, `load_extension`
  (closes the pre-existing heap-pointer leak through an admitted SELECT);
- `statement_table`: INSERT/REPLACE/UPDATE/DELETE and WITH-headed writes may
  target only the partition's own table (closes the pre-existing hole that
  ordinary DML could write `_raft_rs_*` and `_partition_statement_outcomes`);
  sender inventory: the index service, CDC routed writes, the CDC bootstrap
  direct path, the migration backfill and the split/merge copies all write
  their own partition's table; `handleSystemTableWrite` has no sender;
- `statement_conflict`: `OR ROLLBACK` is refused (it ends the apply's SQLite
  transaction and breaks its atomicity; pre-existing, HIGH).

These three restrictions are Leg A refusals of unproved raw statement forms
under the owner record ("Leg A may explicitly refuse unproved raw statement
forms before admission"); they are declared in the admission constants and
belong in the query contract's documented restrictions (query owner).

Explicit supersessions added to the 9.2 inventory (meaning kept, statement
changed, because a write to a table other than the partition's own is now a
typed refusal before SQLite):

| Test | Was | Now |
| --- | --- | --- |
| `test/partition/committed-statement-outcome.test.js` F-i | `INSERT INTO statement_outcome_missing_table` asserting /no such table/ | a missing-column insert on the own table asserting /no column named missing_column/ (still a deterministic schema error, consumed and reported) |
| `test/partition/partition-service-write-commit.test.js` "a failed statement ... is a consumed outcome" | `INSERT INTO missing_table` | `INSERT INTO test_table (missing_column)`, regex matched |
| `test/partition/partition-service-transactions-query-routing.test.js` | the partition's own table differed from the table the test writes | the partition is created with `tableName: 'test_data'`, the written table |

L6 dispositions added: non-own and missing-table committed writes are refused
typed at apply; committed SELECT / read-only WITH entries (HEAD proposed
CTE reads as writes) are refused at apply, outcome rows only. Routed (R17):
rowid precision above 2^53 in answers; a sessionless caller can enter the
session path by naming an active sessionId (closed by the c' increment);
migration ALTER proposed with no pre-check and admitting any table (migration
owner); the index service ignores `success:false` answers; R2 and DROP INDEX
reads see uncommitted session schema until c'.

### 0.0.13 Lead decision: the write generation has a committed origin (2026-10-11)

The increment-3 verification (verifier subagent:a8825d45068289746) showed that a
generation row created `(1, 0)` at every partition open is not a function of
the committed log prefix: a replica that applied part of the log before this
build exists counts fewer writes than one that replays every entry on it, so
the same committed PREPARE can be REFUSED on one replica and PREPARED on
another. Sections 3.2 and 5.1 assumed `(1, 0)` identically on every replica,
which holds only for partitions created on this build; L6 said nothing about
where g starts. Decision:

- A participant-owned committed command `PARTICIPANT_GENERATION_ORIGIN`
  (pinned bytes like the other two) is proposed once by the leader when
  transaction admission is enabled on a partition (after the L6 drain). Its
  application, inside the one application transaction, sets the generation
  row to `(1, 0)` and records the origin `(index, term)` in it. From that entry
  on, g is a deterministic function of the committed prefix on every replica,
  old or new, because every replica applies the origin before any later entry.
- Until the origin has applied on the leader, a BEGIN carrying a
  transactionId is refused typed (`generation_origin_pending`); a PREPARE
  carries the origin index in its validation text and the apply refuses a
  PREPARE whose carried origin differs from the replica's recorded origin
  (typed, a bug path: Raft order makes it unreachable without one).
- The witness is the verifier's reproduction: a database written on the
  increment-2 build and reopened on the candidate (g 0) against a replica that
  replayed every entry on the candidate (g 3) converge after the origin command
  and then agree on the same PREPARE and COMMIT; a BEGIN before the origin is
  refused on the request path.
- The pre-cutover census (L6) gains: the origin command has applied on every
  replica of every partition before transaction admission is enabled.

## 1. Consumed surfaces (verified)

Participant transaction owner, current behaviour to replace:

- `beginTransaction` opens `BEGIN IMMEDIATE` on the shared connection:
  `partition-service-transaction-base.js:560-637` (`:611`); one non-terminal
  transaction per partition `:598-603`; removal fence `:591-597`.
- `prepareTransaction` returns `LOCAL_STAGING` without proposing anything:
  `:643-701` (`:679-700`); conflict check on leader memory `:666-678`.
- `commitTransaction` records the outcome and runs `COMMIT` before proposing a
  fire-and-forget marker: `:707-796` (`:732-743`); CDC per op `:746-748`;
  leader-only conflict memory `:749-765`; on failure it erases prepared state
  `:786-793`; missing session throws `:721-723`; PREPARE_LOST `:712-717`.
- `rollbackTransaction` answers success for an unknown session: `:801-884`
  (`:815-824`).
- Marker proposal is fire-and-forget and silent on a non-leader: `:971-990`
  (`:979-981`); markers carry no entryId `:948-956`, `:1003-1010`.
- Outcome: `recordTransactionCommitOutcome` UPSERT with `Date.now()` `:901-911`;
  `resolveTransactionCommitOutcome` answers NOT_COMMITTED from absence `:913-936`
  (`:935`).
- Log-scan reconstruction `reconstructPreparedState` `:104-174`, run on every
  leader activation `partition-service-core-base.js:593-604`; volatile maps
  `:176-186`.
- Hold sweep: `:354-478`; leader heal deferral `:421-441`; bare `ROLLBACK`
  `:442-449`; PREPARED erasure + PREPARE_LOST `:453-464`. The bound is
  `TIMEOUT_BUDGET_DEFAULT.PREPARED_HOLD_TIMEOUT_MS` = 60000
  (`src/control-plane/timeout-budget.js:22`, read at
  `partition-service-core-base.js:192-196`); `transaction-base.js:18` is only
  the reporting string (round-2 B18 corrected).
- Epoch snapshot filter and conflict memory: `checkWriteConflicts` `:242-265`,
  `isSnapshotExpired` `:289-301`, `applySnapshotReadFilter` `:309-339`, used by
  session reads at `partition-service-write-metrics-base.js:76-81`.
- Default-session absorption: `resolveActiveTransactionSessionId`
  `partition-service-transaction-session-methods.js:26-41` (`:37-39`),
  `DEFAULT_TRANSACTION_SESSION_ID = 'default'`
  `partition-service-shared.js:221`.
- Session write staging on the shared connection:
  `partition-service-write-metrics-base.js:193-243` (admission `:216-220`, run
  `:221-223`, staged `changes` stored on the op `:224`, reply `:228-235`).
- Wire entry: `handleTransactionMessage` / `executeTransactionControl`
  `partition-service-entry-apply-base.js:393-457` (epoch only to BEGIN and
  OUTCOME, `:436-453`); removal admission `:311-327`.

Committed-entry application and its owners:

- `applyCommittedEntry` `partition-service-entry-apply-base.js:970-1106`:
  unknown type fails closed `:989-1002`; SQL apply `:1015-1074` (settled replay
  `:1024-1029`, statement `:1031-1039`, outcome row `:1040-1046`, proposer
  answer and leader CDC in afterCommit `:1050-1073`); `TRANSACTION_COMMIT`
  records the outcome without running operations `:1075-1092`.
- Admission owner `admitCommittedCommand`
  `partition-committed-command-admission.js:125-138` (marker origin rule
  `:89-101`, origins `:40-43`).
- Committed-statement outcome owner: read `partition-committed-statement-outcome.js:92-109`,
  record `:119-127`, deterministic classifier `:180-187`, settled answer
  `:220-251` (a non-APPLIED row answers `success:false, committed:true` without
  `deferRetry`, `:243-250`), settled replay `:262-282`, failed statement
  `:295-324`. Table and bound: `partition-committed-statement-outcome-constants.js:6-43`
  (rows grow one per statement until the log-bound owner compacts them,
  `:16-19`); deterministic codes `:87-93`.
- Entry key `entry:${entryId}`: `partition-service-cdc-stream-base.js:419-436`.
- Command type lists: `partition-service-constants.js:173-191`; outcomes
  `:202-209`; error codes `:213-223`; `_transaction_outcomes` DDL and UPSERT
  `:89-108`; `LOCAL_STAGING` `:63-65`.

Application transaction (the real owner of applied-index atomicity):

- `applyCommittedEntryTransaction` `src/raft/raft-rs-application-transaction-owner.js:51-98`:
  `store.transaction` `:60`, application callback `:61-68`, `putAppliedState`
  `:77-78`, admission index `:81-83`, rollback effects then rethrow `:85-94`,
  afterCommit effects only after commit `:95-97`. Called from the runtime's
  `applyEntryDurablyOrFailure` `src/raft/raft-rs-runtime-owner.js:920-941`,
  whose failure is the group's `groupHostFailure(APPLICATION)`.
  (`test/raft/raft-rs-backend/durable-ready-loop.test.js:259`, cited in
  revision 2, proves only configuration + applied index; corrected, B18.)
- Store: `transaction()` refuses a foreign open transaction
  `src/raft/raft-rs-durable-store.js:385-395`, `persistenceAdmission`
  `:358-362`; applied-state UPSERT `:483-497`.
- Port adapter decodes once: `src/raft/raft-rs-operation-port.js:90-97`;
  codec is `JSON.stringify`/`JSON.parse` with no canonicalization
  `src/raft/raft-rs-proposal-codec.js:33-60`.
- `buildPartitionWriteEntry` spreads the caller's operation first, so key order
  follows each caller (`src/partition/partition-write-kernel.js:215-231`;
  revision 2's "fixed key order" corrected, B18). Revision 3 never digests a
  re-encoded object: it digests carried strings (section 2.3).

Write path, await and release:

- `applyWrite` `partition-service-write-metrics-base.js:657-728`: pending
  outcome `:672-676`, admission `:680-689`, settled answer `:693-701`
  (`answerSettledWrite` `:635-649`), leadership `:703-720`, commit `:723-727`.
- `startPartitionRaftWriteCommit` / `executePartitionRaftWriteCommit`
  `src/partition/partition-service-raft-write-commit.js:133-252`:
  `waitForCommittedWrite` registered before propose `:146`, deferral budget
  `:89-105` (`USER_TRANSACTION_WRITE_DEFER_BUDGET_MS`
  `partition-service-constants.js:56`), failed result returned `:192-202`,
  side-effect plan `:203-220`.
- `waitForCommittedWrite` `partition-service-cdc-stream-base.js:313-347` with
  `PENDING_REQUEST_TIMEOUT_MS` = 30 s (`partition-service-constants.js:26`),
  deadline release `:329-337`; pending outcomes `:357-376`; resolve/reject
  `:377-401`; release-all `:405-407`, wired to leadership loss
  `partition-service-raft-lifecycle-wiring.js:34-40`.
- Proposal queue refuses a duplicate pending entryId
  `src/partition/proposal-queue.js:96-99`.
- Typed answers: refusal codes `partition-write-kernel.js:34-44`, retryable list
  `:57-66`, release causes and unproposed answers `:71-92`, leadership refusal
  `:338-362`, released answer (OUTCOME_UNKNOWN only if proposed) `:370-387`,
  side-effect plan `:469-500`.

Determinism of ordinary writes (the class transactions inherit):

- The entry carries the client's SQL and params; each replica executes them at
  apply (`partition-service-entry-apply-base.js:1032`); the proposer's own
  apply answers `changes`/`lastInsertRowid` (`:1050-1056`), retained for replay
  (`partition-committed-statement-outcome.js:119-127`, `:136-145`).
- `NOW()`/`CURRENT_TIMESTAMP` become SQLite `datetime('now')`
  (`src/query/pg/pg-function-registry.js:88-94`, `:174-175`): evaluated per
  replica at apply. Nothing pins nondeterministic SQL values today (R17
  finding F-DET, section 9.3).

Mirror, checkpoint, CDC (section 8): side-effect chain
`partition-service-raft-write-commit.js:203-220` ->
`partition-service-write-metrics-base.js:729-769` (`:751-762`) ->
`partition-service-split-mirror-queue-methods.js:44-67` /
`partition-service-merge-replication-methods.js:461-500`; mirror delivery
throws on any failure `partition-split-routing.js:200-246` (`:241-245`); durable
replay cursor `partition-mirror-replay-cursor.js:89-128`; mirror source lookup
`:143-163`. Checkpoint: `src/raft/snapshot-checkpoint-store.js:208-227`
(legacy gate), `:295-309` (rs-raft copy), `:311-332` (legacy copy refuses
rs-raft), `:339-357` (rs-raft scrub keeps only `raft_rs_peer_identity`),
`:397-416`; partition cadence `src/partition/partition-snapshot-cadence.js:8-18`,
`:55-71`; catch-up creation without a group id `src/raft/snapshot-catchup.js:210-215`.
CDC: `generateCDCEvent` `partition-service-cdc-stream-base.js:129-138`;
in-process sequence `src/partition/partition-cdc-delivery.js:215-219`; volatile
buffer `src/partition/cdc-event-buffer.js:1-10`.

Coordinator (query lane, consumed only):

- Identity: `createTransactionId` = `tx-${sessionId}-${now()}-${seq}`
  `src/query/distributed/distributed-transaction-records.js:79-82`;
  `createParticipantId` `:101-103`; sequence and clock-seeded epoch
  `distributed-transaction-coordinator.js:115-124`; `begin` `:204-273`
  (`:237`, `:261`); participant BEGIN `:331`.
- Durable owner: `DurableWorkflowCoordinator.registerWorkflow`
  `src/workflow/durable-workflow-coordinator.js:61-65`; status row UPSERT
  `src/query/sql-query-engine.js:114-147` (silently skipped without a gateway,
  `:115-117`); `sql_transactions` schema
  `src/bootstrap/system-table-workflow-schema-definitions.js:14-33`; gateway
  mutation kinds `src/control-plane/control-plane-system-table-gateway-constants.js:153-158`.
- Protocol: `abortTimedOutTransaction` `distributed-transaction-protocol.js:258-275`
  and its call sites `:296`, `:313`, `:324`, `:344`, `:351`, `:366`, `:392`;
  `runCommitProtocol` `:289-424`; `resolveParticipantCommitMiss` `:669-689`
  (2PC NO_TRANSACTION -> COMMITTED `:673-675`).
- Recovery: `resumeRecoveredTransactions` `distributed-transaction-recovery.js:269-363`
  (`:310-320`); `runRecoverySweep` `:365-512` (`:404-431`); status sets
  `distributed-transaction-coordinator-constants.js:27-36`; sweep interval 1000
  ms `:46`; transaction budget 60000 ms `src/control-plane/timeout-budget.js:20`;
  every engine loads every row `sql-query-engine-transaction-recovery-methods.js:151-159`;
  started by `sql-query-engine-lifecycle-and-callback-dispatch.js:185-197`.
- Engine wire: participant callbacks `sql-query-engine-instance-initializer.js:190-244`;
  `deliverTransactionOperation` `sql-query-engine.js:569-627`; delivery
  identity `{sessionId, partitionId, operation}` `:66-96`; session id onto
  QUERY requests `src/query/query-executor-partition-request-builders.js:80`;
  1PC selection `distributed-transaction-commit-mode.js:29-40`.

Added for revision 4 (verified at 0643090d7):

- Statement ownership: one-partition statements are DIRECT_AUTOCOMMIT and never
  reach the coordinator; multi-partition statements are STATEMENT_AUTOCOMMIT
  transactions (`src/query/sql-query-engine-write-execution.js:83-90`, BEGIN at
  `:110-147`); the autocommit finish returns a failed COMMIT without retrying
  (`:159-176`).
- Client in-doubt answer: a failed COMMIT whose `commitPointReached` is not false
  becomes `TRANSACTION_OUTCOME_UNKNOWN` (`src/query/application-database.js:123-149`);
  the coordinator stamps it (`distributed-transaction-commit-point.js:51-65`,
  `distributed-transaction-coordinator.js:505-510`).
- FAILED after COMMITTING: set at `distributed-transaction-protocol.js:396-398`;
  `runCommitProtocol` re-enters FAILED at PREPARING (`:299-310`); recovery skips
  FAILED when resuming (`distributed-transaction-recovery.js:297-306`) and when
  sweeping (`:404-410`).
- Answers on committed entries: an environmental statement failure rejects the
  pending write in afterRollback (`partition-committed-statement-outcome.js:297-300`);
  `unansweredWriteResult` answers a rejection as a failure
  (`partition-service-raft-write-commit.js:122-131`); a host failure while
  proposing is `CONSENSUS_HOST_FAILURE` (`partition-write-kernel.js:390-397`).
- Release of one pending write at its deadline: `proposal-queue.js:202-222`.
- Leadership-loss wiring: `partition-service-raft-lifecycle-wiring.js:70-83`
  (`releasePendingWrites()` at `:79`); no session hook exists yet.
- Real-log replay-cursor fixture: `test/partition/partition-rs-raft-restart-fixture.js:98-145`,
  used by `test/partition/durable-replay-cursor.test.js:252-300`.

Surfaces this design must create (no citation exists):

- the two committed command types;
- `_participant_transactions`;
- the write generation table `_partition_write_generation`;
- the determinism classifier, owned by a new
  `src/partition/partition-transaction-determinism.js`;
- the reservation waiters of the write commit owner;
- the session-discard hook on demotion;
- the `partition_write_reserved` refusal;
- the participant answer fields;
- the coordinator's insert-once transaction row and decision record;
- the engine's statement-autocommit retry.

## 2. Protocol and identity

### 2.1 Identity (decisions B and S)

- `transactionId` is a 128-bit random identifier: 32 lowercase hex characters
  from `crypto.randomBytes(16)`, minted by the coordinator's
  `createTransactionId`. The function replaces `tx-${sessionId}-${now()}-${seq}`
  (`distributed-transaction-records.js:79-82`).
- Uniqueness comes from an **insert-once** write of the `sql_transactions` row
  (primary key `transaction_id`, `system-table-workflow-schema-definitions.js:17`),
  made by `registerWorkflow` inside `begin` (`distributed-transaction-coordinator.js:261`)
  before any participant BEGIN (`:331`). It uses the gateway's INSERT kind
  (`control-plane-system-table-gateway-constants.js:153-158`), never the status
  UPSERT (`sql-query-engine.js:119-134`). Behaviour on the insert:
  - a primary-key collision is the typed `TRANSACTION_ID_COLLISION`, and the
    coordinator mints again (bounded at 3 attempts, then a typed BEGIN failure);
  - an insert whose outcome is unknown is resolved by reading the row, never
    assumed;
  - only the primary-key collision class re-mints; any other persistence
    error is a typed BEGIN failure (W10c);
  - the insert-once mutation carries no `sql-transaction:${id}` coalescing key
    (`sql-query-engine.js:142-144`), so a pending status UPSERT can never
    replace it;
  - (AF, narrowed) an engine without a usable gateway refuses an explicit BEGIN
    and a multi-partition statement, typed
    (`TRANSACTION_STATE_PERSISTENCE_UNAVAILABLE`), instead of the silent return
    at `sql-query-engine.js:115-117`. DIRECT_AUTOCOMMIT single-partition
    statements never reach the coordinator
    (`sql-query-engine-write-execution.js:83-90`, `:120-121`) and are
    unchanged (S4b).

  Every later write of the row is an UPDATE of an existing row.
- No component is taken from the node id, boot incarnation, sequence, session
  or clock. The revision-3 premises (node-id uniqueness, per-data-directory
  incarnation) are withdrawn. Two coordinators on one node and incarnation
  cannot share an id (W10a). A collision of 128 random bits is refused by the
  primary key, not assumed impossible (W10c).
- `participantId = ${transactionId}:${partitionId}`
  (`distributed-transaction-records.js:101-103`). The participant refuses any
  request or command whose `participantId` is not exactly that with its own
  `partitionId` (`participant_transaction_identity_mismatch`). It also refuses
  any request missing one of `transactionId`, `participantId`, `commitMode` or
  `transactionEpoch` (`participant_transaction_identity_required`).
- `commitMode` is `NOT_SELECTED` on BEGIN and session writes
  (`distributed-transaction-commit-mode.js:29-40`). It carries the selected mode
  on PREPARE, decision and outcome requests. A decision whose mode differs from
  the PREPARED row's is an identity mismatch.
- `transactionEpoch` is carried and pinned per `transactionId`. It has no
  isolation meaning.
- `sessionId` is routing context only. The delivery identity becomes
  `{transactionId, partitionId, operation}` (replacing `sessionId` at
  `sql-query-engine.js:66-96`; seam A, falsifier S5).

Identity anchoring when it moves: a leader change discards volatile sessions
(section 7). The durable row is keyed by the identity, so a COMMIT reaching a
new leader finds the same row. A coordinator restart re-reads its rows, and the
ids it mints afterwards are fresh random values checked by the same insert.

### 2.2 Requests (the participant's wire)

`TRANSACTION` messages (`PARTITION_SERVICE_MESSAGE_TYPE.TRANSACTION`) carry an
`operation` in `{BEGIN_TRANSACTION, PREPARE_TRANSACTION, COMMIT, ROLLBACK,
TRANSACTION_OUTCOME}` and the identity fields. Session reads and writes are
`QUERY` messages carrying the same identity. COMMIT and bound ROLLBACK add
`{decision, preparedDigest, decisionText, decisionDigest}`; an unbound ROLLBACK
omits them.

Every answer carries `{success, operation, partitionId, transactionId,
participantId, state, outcome}`. Where relevant it also carries `failureCode`,
`deferRetry`, `preparedDigest`, `prepareIndex`, `prepareTerm`,
`decisionIndex`, `decisionTerm`, `refusalCause`, `results` and `provisional`.

### 2.3 Committed commands (pinned bytes)

Two new committed command types replace the three legacy markers in
`PARTITION_COMMITTED_MARKER_COMMAND_TYPES` (`partition-service-constants.js:182-186`).

- **`PARTICIPANT_PREPARE`**: `{type, entryId, sessionId, transactionId,
  participantId, commitMode, transactionEpoch, operationsText, validationText,
  preparedDigest, executionEnvelope, timestamp, proposedBy, proposedAt}`.
  - `operationsText` is the leader's `JSON.stringify` of the staged operations
    `[{entryId, sql, params}]`, each exactly the client's statement and params.
  - `validationText` is `JSON.stringify([["partition", partitionId,
    sha256("generation:" + g)]])`, where `g` is the BEGIN-time write generation
    of section 3.2.
  - `preparedDigest` is `sha256(operationsText + "\n" + validationText)`.
- **`PARTICIPANT_DECISION`**: `{type, entryId, sessionId, transactionId,
  participantId, commitMode, transactionEpoch, decision, preparedDigest,
  decisionText, decisionDigest, executionEnvelope, timestamp, proposedBy,
  proposedAt}`.
  - `decisionText` is `JSON.stringify({transactionId, decision, participants:
    [[participantId, preparedDigest|null], ...sorted]})`.
  - `decisionDigest` is `sha256(decisionText)`.
  - It carries no operations.
- **`executionEnvelope`** (revision 8, owner decision): `{sqliteVersion,
  sqliteSourceId, compileOptionsDigest, classifierListVersion}`, stamped by the
  leader. Every replica checks it first (3.3).
- **Deterministic entryIds**: `${participantId}:prepare` and
  `${participantId}:decision:${decisionDigest}`. A retry joins the pending
  outcome (`partition-service-write-metrics-base.js:672-676`).
- **Per-operation outcome keys**: `txop:${participantId}:${ordinal}`, never
  `entry:${entryId}` (W12e).
- **Legacy marker types are removed.** A legacy `TRANSACTION_COMMIT`,
  `PREPARE_TRANSACTION` or `ROLLBACK` marker reaching apply fails closed as
  UNRECOGNISED (`partition-service-entry-apply-base.js:989-1002`). The upgrade
  precondition is in 11.3.

**PREPARE apply check order** (pinned, nit N4; revision 6 reorders steps 1-3
for round-5 nit N-B; first match wins, every step a deterministic function of
the committed prefix and the command bytes):

0. (Revisions 8-10) Execution envelope: the carried envelope is compared with
   the replica's own build. Since revision 10 a mismatch is never a refusal:
   the command applies as carried, and the mismatch is recorded as a typed
   diagnostic (3.3, W20). The same comparison runs for a decision.
1. Identity: an exact `participantId`. A mismatch is typed
   (`identity_mismatch`) with no row written.
2. Existing row for this identity (looked up before the digest is judged;
   revision 7 orders the cases, round-6 nit N6-8):
   - a row in any state but PREPARED: `terminal`, whatever the digest;
   - a PREPARED row and an invalid digest (`sha256(operationsText + "\n" +
     validationText) !== preparedDigest`): a typed `prepare_refused` answer
     with `refusalCause: digest_invalid`;
   - a PREPARED row and a valid digest equal to the row's: an idempotent
     PREPARED answer;
   - a PREPARED row and a valid, different digest:
     `prepare_content_conflict`.

   No write in any case, and the apply returns normally: the entry is
   consumed, so apply continues (W17's same-identity case). Revision 5 wrote
   the REFUSED row first, which collides with the existing primary key: a
   throw, hence a host failure on every replica and a permanent stall.
3. Digest integrity, with no row for this identity: a mismatch writes a
   REFUSED row with cause `digest_invalid`. It is a control row, so `g` does
   not move.
4. Reservation: if another row is PREPARED, the disposition is
   `reserved_refused`. It is non-settling: no write, deferRetry.
5. (Revision 5) no classification at apply: the operations are applied as
   carried (AB, W3c).
6. Generation: if the current `g` digest differs from `validationText`, a
   REFUSED row, cause `conflict`.
7. Dry run of the operations in a nested `db.transaction` that throws a
   sentinel:
   - (revisions 7 and 8) around each operation that can allocate a rowid, the
     ceiling of 3.3 (R3): before it for legacy state, and after it as an exact
     BigInt comparison. At or above 2^62, a REFUSED row with cause
     `rowid_ceiling`, identical on every replica;
   - a deterministic failure writes a REFUSED row, cause `statement_failed`;
   - an environmental failure is the host failure (nothing recorded).
8. INSERT the PREPARED row. `g` does not move: a PREPARED row is a control
   row (AA).

Under "reserved and conflicted", the answer is therefore `reserved_refused`.

### 2.4 Decision binding (decision C)

A decision applies only if all of these hold:

- `sha256(decisionText) === decisionDigest`;
- `decisionText` names this `transactionId`, the same `decision`, and an entry
  for this `participantId`;
- for COMMIT, that entry's digest and the command's `preparedDigest` both equal
  the PREPARED row's `prepared_digest`.

Otherwise it is refused `participant_transaction_decision_digest_mismatch`, and
nothing is written. For ROLLBACK the entry's digest may be null; if it is
present, it must match.

An **unbound ROLLBACK** (no `decisionDigest`) is a request-level action only:

- it discards a volatile ACTIVE session;
- it is refused against PREPARED (`participant_transaction_decision_binding_required`).

**Limit L8 (nit N6).** The binding is self-certifying. Any caller can build a
`decisionText` and its digest, so the participant cannot tell a persisted
decision from a fabricated one. Safety against an unauthorized terminal rests
on seam C: only the coordinator sends decisions, and only after the
insert-once decision record. The binding protects against mixing decisions and
prepared contents, not against a forging coordinator.

**Trust boundary (owner decision, revision 8).** Decision records are
authoritative through the existing trusted coordinator route. A self-computed
digest establishes content identity, not authentication, and not proof that an
arbitrary caller owns the global decision. The participant does not add a
second decision lookup during committed apply.

## 3. Isolation and the conflict rule

### 3.1 Staging under F6 c' (no SQLite transaction across requests)

- **BEGIN** creates a volatile session `{identity, sessionId, operations[],
  generationBase, bytes, startedAt, phase}` on the leader. It reads `g` at
  BEGIN (3.2). No SQLite transaction is opened (W5a).
- **A session write** goes through three steps:
  1. Admission: `admitCommittedCommand`, WRITE_PATH.
  2. The parameter check (below) and the whole-program classifier (3.3). A
     refusal leaves nothing staged.
  3. Synchronous validation in ONE `db.transaction(fn)()`. `fn` replays the
     staged operations decoded from their JSON text, runs the new statement,
     captures `{changes, lastInsertRowid}` and throws a private sentinel.
     better-sqlite3 rolls the transaction back on any throw
     (`node_modules/better-sqlite3/lib/methods/transaction.js:52-77`).

  The reply is `{success, provisional: true, changes, lastInsertRowid}`. A
  deterministic failure of the new statement is `statement_failed` (not
  staged). A failed replay of an earlier operation is `replay_diverged`, which
  dooms the session.
- **A session read** is classified like a write (3.3, revision 6), then uses
  the same synchronous replay, a bounded read, and a sentinel rollback. It sees current committed state plus the session's own
  operations (W5a `sessionSeesLaterCommit`). A private snapshot database would
  not.
- **Parameter narrowing (named contract change, V11).** Staged params must
  survive the proposal codec's JSON round trip unchanged
  (`raft-rs-proposal-codec.js:33-60`): string, finite number, or null. A
  Buffer/BLOB, BigInt, Date, boolean, undefined or object param is refused
  `participant_transaction_session_write_param_unsupported` (W6n). Today a
  session write binds such values directly on the connection
  (`partition-service-write-metrics-base.js:221-223`). Ordinary replicated
  writes already lose them at the codec: a Buffer becomes an object at apply,
  and a BigInt fails to encode. The narrowing therefore aligns transactions
  with the replicated class.
- **Bounds**: 256 operations and 1 MiB of encoded bytes (proposed new
  constants). Exceeding either is `replay_budget_exceeded`. Revision 8 drops
  the earlier "50 ms of replay work" clause (owner decision): a check made
  after a synchronous statement finishes bounds nothing. No wall-clock bound
  on an arbitrary statement is promised. The replay's cost is bounded only by
  the admitted operations and bytes.
- **Observer scope** is unchanged from revision 3:
  - no other reader sees staging;
  - `persistenceAdmission` (`raft-rs-durable-store.js:358-362`) never defers
    consensus because of a session;
  - default-session absorption is deleted (W5b);
  - Leg A admits one non-terminal transaction per partition.

### 3.2 First-committer-wins from a dedicated write generation (decisions D and R)

- **The write generation `g`** is one row of the sibling table
  `_partition_write_generation (singleton INTEGER PRIMARY KEY CHECK (singleton =
  1), generation INTEGER NOT NULL)`, created with `(1, 0)` at partition
  initialization, identically on every replica.
- **Why a sibling table and not a reserved row in `_participant_transactions`.**
  The participant table's rows have a per-transaction lifecycle, a state domain
  `{PREPARED, COMMITTED, ROLLED_BACK, REFUSED}`, a reservation query (`state =
  'PREPARED'`) and a retention rule. A sentinel row would need a fake identity
  and a fifth state that every reader would have to exclude. A one-row table
  has a single writer and a single meaning.
- **When `g` increments (decision AA; revision 5).** Only when application
  data changes. It is incremented by exactly 1, inside the application
  transaction, by:
  - every committed SQL command whose statement is APPLIED: ordinary writes,
    mirror applies, and schema changes (`MIGRATION_ALTER_TABLE` is one of
    `PARTITION_COMMITTED_SQL_COMMAND_TYPES`, `partition-service-constants.js:173-181`);
  - a COMMIT decision that applies at least one operation (once per decision,
    not per operation).

  **A zero-operation COMMIT decision does not move `g`** (revision 6, round-5
  nit N-E). It changes no application data: it moves the row to COMMITTED
  and records no `txop:` outcome. Either rule would be consistent, because the
  reservation holds every other writer either way. This one keeps the
  definition "g counts application-data changes" exact (W19).

  Control rows never move it: a PREPARED row, a REFUSED row (including
  `digest_invalid`, `conflict` and `statement_failed`), a TOMBSTONE, a
  ROLLED_BACK transition, a `reserved_refused` disposition, a STATEMENT_FAILED
  write, a settled replay, a refused decision, and the bootstrap-only
  `executeLocalQuery` (`partition-service-write-metrics-base.js:133-185`).

  So nothing that may apply while a row is PREPARED can move `g`:
  - writes, schema changes and other PREPAREs are reserved (W18: a
    `MIGRATION_ALTER_TABLE` applied while PREPARED is `reserved_refused`; it
    reaches the partition through `proposeWrite` -> `applyWrite`,
    `partition-service-entry-apply-base.js:818-830`,
    `partition-service-write-metrics-base.js:452-466`, so it is parked on the
    leader like any write);
  - a foreign decision can only be a ROLLBACK, because a foreign COMMIT needs
    its own PREPARED row, which the reservation prevents;
  - a foreign TOMBSTONE or REFUSED row is a control row.

  W17 witnesses this. It closes round-4 R4-1.
- **No compaction.** No owner ever deletes or lowers `g`. It is part of the
  partition's application state, so any partition image (SN1) carries it
  (8.2). Compaction of `_partition_statement_outcomes`
  (`partition-committed-statement-outcome-constants.js:16-19`) cannot move it,
  so ABA is impossible (W13 deletes every outcome row and still expects
  `conflict`).
- **The base is read at BEGIN** and carried unchanged. A lagging leader reads
  an older value, which only refuses conservatively.
  - W14: a base read at PREPARE fails it.
  - W15: the proposed `validationText` is the BEGIN-time digest.
- **PREPARE request (leader, advisory).** If `g` has moved since BEGIN, the
  answer is `{success:false, failureCode: participant_transaction_prepare_refused,
  refusalCause: conflict}` and nothing is proposed. The session is doomed.
- **PREPARE apply (authority).** The check order is in 2.3. The reservation
  then blocks every other applying write until the decision, so `g` cannot
  move between PREPARE apply and COMMIT apply on a consistent replica.
- **COMMIT apply** re-checks `g`: `sha256("generation:" + g)` must equal the
  digest carried in the PREPARED row's `validation_text` (no "+1": the PREPARE
  did not move `g`; round-4 nit N7). A mismatch is impossible on consistent
  replicas. Under K it is settled REFUSED with cause `commit_base_moved`
  identically, with an alarm.

Consequence: a transaction commits only if its partition applied no other
write between its BEGIN and its PREPARE. Every read it made saw one committed
prefix, so each partition is optimistically serializable. Aborts are
partition-granular (limit L5, 3.6).

### 3.3 Determinism: one fail-closed classifier over the whole program (decisions I, Q, AB, AH, AK, AN, AO)

**What this section claims (owner decision, revision 8).** The classifier does
not prove determinism. It enforces a stated **supported SQL population** with
default refusal. The opcode check enforces that contract; observing a new
opcode never expands it. Each extension is an explicit act of the classifier
owner, with its own argument. SQLite's bytecode is not an application API.


- **One classifier, leader only.** It is owned by the new
  `src/partition/partition-transaction-determinism.js` and runs at staging, on
  the leader, before the c' validation (3.1). **The apply side never
  re-classifies.** A committed PREPARE is applied exactly as carried (step 5 of
  2.3; W3c applies a `datetime('2020-01-01')` operation as carried, identically
  on two replicas). A classifier change across versions therefore changes only
  what a new leader admits, never the disposition of a committed command.
  Because of that, the classifier is the single guard of K, and it must be
  fail-closed over everything a statement can read (round-5 R5-1).
- **Reads and writes alike (revision 6).** Every session statement is
  classified, reads included. A session read runs on the leader's connection
  inside the c' sentinel transaction, and a PRAGMA escapes that rollback
  whichever wire carried it (round 5 measured `reverse_unordered_selects`
  still set after the sentinel).
- **Pinned engine.** better-sqlite3 11.10.0 (`package-lock.json:6703-6706`)
  bundles SQLite 3.49.2 (`node_modules/better-sqlite3/deps/sqlite3/sqlite3.h:149`,
  source id dated 2025-05-07 at `:151`; `SELECT sqlite_version()` answers
  `3.49.2`). Its build enables `dbstat`, FTS3/4/5, R-tree, Geopoly, JSON1 and
  the math functions (`node_modules/better-sqlite3/deps/defines.gypi:18-30`).
  The lists below are vetted for this build only. The module records the
  version it was vetted for, and the self-check compares it with
  `sqlite_version()`. Any other version fails the self-check, so an upgrade
  fails closed until the lists are re-vetted.
- **One statement-admission owner on the shared connection (AK, AO; revision
  8).** It is owned by the new `src/partition/partition-statement-admission.js`
  (0.5 item 6). It holds the statement-kind rule, the rowid rules and the
  rowid-ceiling check. The session classifier calls it as its first layers.
  The kind rule is a pure function of the SQL text. Nothing it refuses is ever
  prepared or EXPLAINed on a partition's connection: preparing a flag PRAGMA
  already sets the flag (round 6 measured `afterPrepareOnly: 1` and
  `afterExplainOnly: 1`), and EXPLAIN does not suppress prepare-time PRAGMA
  effects (owner record). Every site that prepares **caller-supplied** SQL text
  on a partition connection routes through it (revision 9, N8-7). Prepare
  sites with a fixed SELECT head built by code are outside this claim, because
  none of them can set connection state:
  - `partition-sql-parser.js:188`, `:248`;
  - `partition-cdc-parameterized-sql.js:240`, `:331`;
  - `bootstrap-topology-snapshot-owner-authoritative-rows.js:490`;
  - `partition-service-split-accessor-base.js:336`.

  The routed sites:
  - **the participant's `executeQuery`**
    (`partition-service-write-metrics-base.js:52-131`), before any `prepare`,
    for sessionless and session statements alike. It replaces that method's
    `startsWith(SELECT)` read/write split (`:64-67`). The query wire
    (`handleRemoteQuery`, `partition-service-entry-apply-base.js:749-758`) and
    every internal caller reach it there;
  - **`executeLocalQuery`** (`partition-service-write-metrics-base.js:140-185`,
    with its own split at `:153-156`), the unreplicated bootstrap path
    (revision 8, R7-2). Its callers:
    - the CDC bootstrap direct path (`cdc-bootstrap-direct-sql.js:95-100`, a
      third head rule, and `:118-163`);
    - `executeSystemTableRead` (`cdc-integration-service-local-system-table-routing.js:199-207`),
      whose raw `partitionService.db.prepare(sql)` fallback (`:202-207`) is
      replaced by a call through the owner;
    - the seed partitions phase (`seed-partitions-phase.js:755`).

    `executeLocalQuery` admits only the sessionless heads below; a refusal
    returns `{success: false, failureCode: partition_write_statement_refused,
    refusalLayer}`;
  - **the committed SQL apply**, for every type in
    `PARTITION_COMMITTED_SQL_COMMAND_TYPES`
    (`partition-service-constants.js:173-181`), before the statement is
    prepared. An offending committed statement is recorded STATEMENT_FAILED
    with `failureCode: partition_write_statement_refused`. That is a
    deterministic function of the command bytes and premise item 2, identical
    on every replica: the entry is consumed, the applied index advances, and
    `g` does not move.

  The partition's own storage initialization (table creation, init-time
  indexes, journal and synchronous PRAGMAs) stays explicit and separate: it is
  code, not SQL text from a caller (owner condition 4).

  **Lexical rules of the head (pinned to SQLite's own tokenizer, N7-1):**
  - whitespace is SQLite's: space, tab, LF, FF and CR (`aiClass`,
    `node_modules/better-sqlite3/deps/sqlite3/sqlite3.c:179855`), plus a UTF-8
    BOM read as space (`:180854-180858`). U+2028 is not whitespace. Inside a
    whitespace run SQLite also consumes VT (`sqlite3Isspace`), but `aiClass`
    marks VT illegal at the start of a run. The owner refuses VT anywhere
    before the head, which only refuses more (revision 9, N8-1);
  - a `--` comment ends only at LF (`:180567-180571`), never at CR or U+2028;
  - a `/*` comment ends at the first `*/`, or at the end of the text
    (`:180599-180607`);
  - anything else before the head refuses: a `;`, a `(`, a BOM sequence that
    is not a BOM, any other character.

  The admitted heads per path:

  | Path | Admitted heads |
  | --- | --- |
  | session write | INSERT, UPDATE, DELETE, REPLACE; WITH when `Statement#readonly` is false (VALUES-only in practice, because L9b refuses `AS (SELECT`) |
  | session read | SELECT; WITH when `readonly` and `reader` |
  | sessionless `executeQuery` and `executeLocalQuery` | SELECT, and WITH when `readonly` and `reader` (reads); INSERT, UPDATE, DELETE, REPLACE, and WITH when not `readonly` (writes); and index DDL of exactly two shapes (below) |
  | committed QUERY/WRITE/INSERT/UPDATE/DELETE/UPSERT apply | the sessionless write heads, the two index-DDL shapes included |
  | committed `MIGRATION_ALTER_TABLE` apply | ALTER TABLE only |

  **Index DDL, narrowed (N7-4).** The index service sends exactly two shapes
  (`index-service.js:258`, `:407`, `:622-623`, `:704-706`):
  - `CREATE INDEX [IF NOT EXISTS] <name> ON <own table> (<columns>)`, where
    `<own table>` is the partition's table name;
  - `DROP INDEX [IF EXISTS] <name>`, where the named index, if it exists,
    belongs to the own table and is not declared by the schema
    (`sqlite_master.tbl_name`, read at admission and at apply; premise item 2).

  `CREATE UNIQUE INDEX` is refused (no `src` file sends it), and so is index
  DDL on any other table. Index DDL itself is deterministic: SQLite refuses
  `random()` and `datetime('now')` in expression and partial indexes (round 7).

  Everything else is refused before any `prepare`:
  - on the wire: `{success: false, failureCode:
    partition_write_statement_refused, refusalLayer: statement_kind}`, with
    nothing proposed;
  - at apply: as above.

  The refusal touches no engine-routed statement: the engine forwards only
  SELECT, INSERT, UPDATE and DELETE to partitions
  (`sql-query-engine-statement-execution.js:497-546`). CREATE TABLE and ALTER
  TABLE go to their own owners, and BEGIN, COMMIT and ROLLBACK to the
  coordinator.

  **Apply-side checks and committed dispositions (N7-7).** Revision 5's
  principle was that no classifier change ever changes the disposition of a
  committed command. The apply-side kind, alias and ceiling checks do change it
  across versions: in a mixed-version window, an entry that an old replica
  applies is refused by a new one. Three things bound this:
  - derivation 3 (9.2) finds no sender of a refused head, of an alias outside
    WHERE, or of a statement at the ceiling, so no such entry is expected;
  - transaction commands carry the execution envelope, recorded as a
    diagnostic on a mismatch (0.5 item 5, revision 10);
  - L6 requires the drain and the census before the cutover. The window is
    recorded in L6.

  W6p witnesses every path.
- **Layers of the session classifier, in order.** The first refusal wins and
  names its layer in the answer's `refusalLayer` (the witness vocabulary
  `V3.CLASSIFIER_LAYER`). Layers 2, 3, 8 and 11 apply to session writes only;
  the others apply to session reads too:
  1. **Statement kind (`statement_kind`).** The rule above, with the pinned
     lexical rules. Cross-check: a write head whose statement is `readonly`,
     or a read head whose statement is not `readonly` or not a `reader`, is
     refused too. better-sqlite3 refuses more than one statement per `prepare`
     ("The supplied SQL string contains more than one statement", measured),
     so the head is the head of the only statement.
  2. **Rowid alias (`rowid_alias`; text).** Any `rowid`, `_rowid_` or `oid`
     token, bare or quoted, outside string and blob literals and comments (the
     rowid rules below).
  3. **Row order, text part (`row_order`; L9).** A LIMIT or OFFSET keyword
     token, or a subquery opened by `(SELECT` or `(WITH` that is not the
     operand of IN or EXISTS (the L9 rules below).
  4. **Compile (`compile`).** `db.prepare(sql)` and `EXPLAIN <sql>` run on the
     leader's connection, with the params bound as null placeholders. A
     compile error is the client's deterministic error: `statement_failed`,
     nothing staged (revision 6, 0.5 item 4).
  5. **Opcode allow-list (`opcode`).** Every opcode of the compiled program must
     be on the list below. Anything else is refused, so a renamed or new opcode
     in another build refuses and never admits. Absent from the list, among
     others:
     - every virtual-table opcode: `VOpen`, `VFilter`, `VColumn`, `VNext`,
       `VUpdate`, `VBegin`, `VCreate`, `VDestroy`, `VRename`, `VCheck`,
       `VInitIn`. This covers every `pragma_*()` table-valued function,
       `dbstat` and `json_each`;
     - trigger sub-programs: `Program`, `Param`;
     - pragma and schema opcodes: `Expire`, `Pagecount`, `MaxPgcnt`,
       `JournalMode`, `ReadCookie`, `SetCookie`, `CreateBtree`, `Destroy`,
       `ParseSchema`;
     - control and maintenance: `AutoCommit`, `Savepoint`, `Vacuum`,
       `LoadAnalysis`, `TableLock`, `IntegrityCk`, `SqlExec`, `RowData`
       (`WITH RECURSIVE`).
  6. **Database (`database`).** Each of these must address the main database
     only:
     - every `OpenRead`, `OpenWrite` and `ReopenIdx` has `p3 = 0` (1 is the
       temporary database, above 1 an attached one,
       `node_modules/better-sqlite3/deps/sqlite3/sqlite3.c:97756-97765`), and
       no `OPFLAG_P2ISREG` bit (`0x10`, `:20319`, a root page held in a
       register) in `p5`;
     - every `Transaction` has `p1 = 0` (`:97542`);
     - every `Clear` has `p2 = 0` (`:100404-100411`).
  7. **Root page (`root_page`).** The root page of every open (`p2`) and every
     `Clear` (`p1`) must belong to the partition's application table or one of
     its indexes:
     - the set is `SELECT rootpage FROM main.sqlite_master WHERE tbl_name = ?
       AND type IN ('table', 'index') AND rootpage > 0`, read at each
       classification on the leader's connection;
     - it is bound to the partition's own table name: `this.tableName =
       options.tableName || options.tableId`
       (`partition-service-core-base.js:83`), the field the partition's schema
       reader already uses (`partition-service-entry-apply-base.js:80-81`).

     Measured on a fresh fixture leader (the port double), after the R6-2
     repair and before any commit. These numbers are fixture-specific (N7-11,
     the premise notes below); production resolves them per classification:

     | Table | Root pages |
     | --- | --- |
     | `_transaction_outcomes` | 2, 3 |
     | `_partition_statement_outcomes` | 4, 5 |
     | the application table and its primary-key index | 6, 7 |
     | `_raft_rs_log` | 8, 9 |
     | `_raft_rs_hard_state` | 10, 11 |
     | `_raft_rs_applied_state` | 12, 13 |
     | `_raft_rs_snapshot` | 14, 15 |
     | the schema table | 1 |

     So every `_raft_rs_*`, `_partition_*` and `_participant_transactions`
     table, `_transaction_outcomes`, the schema table and every other table is
     refused.
  8. **Row order, program part (`row_order`; L9).** Any `AggStep`, `AggValue`,
     `AggInverse` or `AggFinal` opcode. `count(*)` without WHERE compiles to
     `Count` (measured) and stays admitted.
  9. **Function names (`function`; the inner layer, unchanged from revision
     5).** Every `Function`, `PureFunc`, `AggStep`, `AggInverse`, `AggValue`
     and `AggFinal` must name an allow-listed function in `p4`. In a write, the
     aggregate opcodes are already refused at layer 8.
     - Only built-in collations exist: better-sqlite3 11.10.0 has no
       collation-registration API (no `collation` in
       `node_modules/better-sqlite3/lib/`).
     - A user function registered on the connection (`db.function`) appears
       under its own name, which is not on the list.
  10. **Implicit keys (`implicit_key`).** As in revision 5 (below).
  11. **Rowid ceiling (`rowid_ceiling`; state).** For a write that can allocate
      a rowid: R3 below. The maximum is checked before the statement, and again
      after it, inside the c' transaction, as an exact BigInt.
- **The opcode allow-list: 116 opcodes, SQLite 3.49.2** (revision 8 adds
  `SoftNull`; 0.5 item 4). `Add`, `AddImm`,
  `Affinity`, `AggFinal`, `AggInverse`, `AggStep`, `AggValue`, `And`,
  `BeginSubrtn`, `BitAnd`, `BitNot`, `BitOr`, `Blob`, `Cast`, `Clear`,
  `Close`, `CollSeq`, `Column`, `Compare`, `Concat`, `Copy`, `Count`,
  `DecrJumpZero`, `DeferredSeek`, `Delete`, `Divide`, `EndCoroutine`, `Eq`,
  `FilterAdd`, `FinishSeek`, `FkCheck`, `Found`, `Function`, `Ge`, `Gosub`,
  `Goto`, `Gt`, `Halt`, `IdxDelete`, `IdxGE`, `IdxGT`, `IdxInsert`, `IdxLE`,
  `IdxRowid`, `If`, `IfNot`, `IfNotZero`, `IfPos`, `Init`, `InitCoroutine`,
  `Insert`, `Int64`, `IntCopy`, `Integer`, `IsNull`, `IsTrue`, `Jump`, `Last`,
  `Le`, `Lt`, `MakeRecord`, `Move`, `Multiply`, `MustBeInt`, `Ne`,
  `NewRowid`, `Next`, `NoConflict`, `Noop`, `Not`, `NotExists`, `NotNull`,
  `Null`, `NullRow`, `OffsetLimit`, `Once`, `OpenDup`, `OpenEphemeral`,
  `OpenPseudo`, `OpenRead`, `OpenWrite`, `Or`, `Prev`, `PureFunc`, `Real`,
  `Remainder`, `ReopenIdx`, `ResetSorter`, `ResultRow`, `Return`, `Rewind`,
  `RowSetAdd`, `RowSetRead`, `RowSetTest`, `Rowid`, `SCopy`, `SeekGE`,
  `SeekGT`, `SeekLE`, `SeekLT`, `SeekRowid`, `Sequence`, `ShiftLeft`,
  `ShiftRight`, `SoftNull`, `Sort`, `SorterData`, `SorterInsert`, `SorterNext`,
  `SorterOpen`, `SorterSort`, `String8`, `Subtract`, `Transaction`,
  `Variable`, `Yield`.

  **How the list was derived.** It is the union of the opcodes in the compiled
  programs of 56 statement shapes on this build, over a table shaped like the
  partition's (a text primary key and one other column). The shapes are:
  - INSERT with one and several VALUES rows, INSERT ... SELECT, INSERT OR
    REPLACE, INSERT OR IGNORE and REPLACE;
  - UPSERT (DO UPDATE with and without WHERE, DO NOTHING), and RETURNING on
    INSERT, UPDATE and DELETE;
  - UPDATE with and without WHERE, with CASE, subqueries and IN lists;
  - DELETE by equality, by range, by LIKE, by an IN subquery, and without
    WHERE;
  - a CTE-headed INSERT;
  - SELECT by equality and by range in both directions (with ORDER BY DESC),
    with every comparison, arithmetic and bit operator, IS, IS NOT and IS
    TRUE, AND/OR as values, real, int64 and blob literals, CAST, COLLATE
    NOCASE, GROUP BY with HAVING, DISTINCT, ORDER BY with LIMIT and OFFSET,
    UNION, EXISTS, correlated subqueries, self and LEFT joins, CTEs and
    window frames.

  No admitted shape opened anything but database 0 and root pages 6 and 7.

  **`SoftNull` (revision 8).** Every INSERT or REPLACE into an INTEGER PRIMARY
  KEY table compiles to it: it marks the key register NULL before the key is
  computed. The owner requires a normal explicit integer key to work in a
  transaction. It is vetted into the population on this argument: the key's
  value is constrained by R2, and allocation is excluded by R3. Without R2 and
  R3 it would not be safe (round 7, R7-1). `NotFound` (a correlated IN) and
  `Filter` (an IN over a non-key column) stay outside the population and are
  declared in L7.
  `PureFunc` was not produced by the corpus. It is admitted only under the
  function-name layer, for an expression index or a generated column that a
  `MIGRATION_ALTER_TABLE` may add. A legitimate shape outside the corpus that
  compiles to an unlisted opcode is refused: a false refusal (L7), never a
  false admission. The classifier owner extends the list only with a vetting
  note per opcode.
- **The channels of round 5, and the layer that refuses each** (measured on
  this build):

  | Channel | What the program contains | Refused at |
  | --- | --- | --- |
  | `pragma_page_count()`, `pragma_database_list`, `pragma_freelist_count()`, `pragma_data_version()`, `pragma_compile_options()`, `pragma_table_info(...)` | `VOpen`, `VFilter`, `VColumn`, `VNext` | opcode |
  | `dbstat`, `json_each` | the same | opcode |
  | a read of `_raft_rs_log` or `_raft_rs_applied_state` | `OpenRead` with `p3 = 0` on root 9 or 12 | root_page |
  | a read of `_partition_statement_outcomes` or of the schema table | `OpenRead` on root 5 or 1 | root_page |
  | a temporary table, `temp.sqlite_master` | `OpenRead` with `p3 = 1` | database |
  | `PRAGMA page_count`, `PRAGMA reverse_unordered_selects = 1` | `Expire` (and `Pagecount`) | statement_kind |
  | `random()` | `Function` naming `random(0)` | function |
  | (revision 7, N6-3) `pragma_table_info(...)`, `json_each(...)` | V-opcodes | opcode |
  | (revision 7) `sqlite_master`, `_partition_statement_outcomes` reads | `OpenRead` on root 1 or 5 | root_page |
  | (revision 7) a `VALUES` head | n/a | statement_kind |
  | (revision 7, R6-1) `rowid` in a session write; LIMIT/OFFSET; a scalar subquery; an aggregate | text; text; text; `AggStep` | rowid_alias; row_order; row_order; row_order |

- **Leader self-check (AH; probes added in revisions 7 and 8).** It runs when
  the replica becomes leader, and in any case before the leader's first staged
  statement (memoized per connection). The leader classifies nine fixed probes
  on its own connection:

  | Probe | Must be |
  | --- | --- |
  | `random`: `SELECT random()` | refused at `function` |
  | `raft_log_read`: `SELECT count(*) FROM _raft_rs_log` (present from group creation, `raft-rs-runtime-owner.js:1652-1653`) | refused at `root_page` |
  | `pragma_table_valued`: `SELECT page_count FROM pragma_page_count()` | refused at `opcode` |
  | `pragma_statement`: `PRAGMA page_count` | refused at `statement_kind` |
  | `temp_schema_read`: `SELECT count(*) FROM temp.sqlite_master` | refused at `database` |
  | `implicit_key_insert`: `INSERT INTO <table> (<a non-key column>) VALUES (NULL)`, classified only | refused at `implicit_key` |
  | `aggregate_insert` (revision 8, N7-8): `INSERT INTO <table> (<key>, <column>) SELECT 'k', count(*) FROM <table> WHERE <column> IS NULL`, classified only | refused at `row_order` |
  | `ceiling_insert` (revision 8, N7-8): an insert classified while a row at rowid 2^62 exists, inside a sentinel transaction that plants the row and rolls back. On an INTEGER PRIMARY KEY table the probe carries an in-range integer key, so it passes `implicit_key` and reaches the ceiling (revision 9, N8-10) | refused at `rowid_ceiling` |
  | `partition_table_read`: `SELECT count(*) FROM <table>` | admitted (the control) |

  Each negative probe exercises a different layer and must be refused at
  exactly that layer. A disabled layer therefore either admits its probe or
  refuses it at a later layer, and both fail the self-check. The text layers
  (`rowid_alias`, the text part of `row_order`) are pure functions and have no
  probe.

  These also fail the self-check:
  - a probe that does not compile;
  - an execution envelope other than the vetted one.

  While it is failed:
  - BEGIN is refused `participant_transaction_determinism_self_check_failed`,
    and nothing is staged;
  - ordinary writes are unaffected.

  The module surface pinned by W6s is `runDeterminismSelfCheck(db, {tableName,
  classify?})`, which returns `{passed, cases: [{name, admitted, layer}]}` in
  the probe order above. The partition takes its self-check from the
  construction option `transactionDeterminismSelfCheck`, whose default is the
  module's.

  The self-check runs on the leader; it never sees a follower's build. The
  execution envelope (below) records every replica's disagreement as a
  diagnostic (revision 10).
- **The execution compatibility envelope (owner decision; revision 8;
  diagnostic since revision 10, AU).**
  `PARTICIPANT_PREPARE` and `PARTICIPANT_DECISION` carry `executionEnvelope:
  {sqliteVersion, sqliteSourceId, compileOptionsDigest,
  classifierListVersion}`:
  - `sqliteVersion` is `sqlite_version()`;
  - `sqliteSourceId` is `sqlite_source_id()`;
  - `compileOptionsDigest` is the sha256 of `PRAGMA compile_options`, joined by
    LF;
  - `classifierListVersion` is the module's list version, `tx1-leg-a-1`.

  The leader stamps its own envelope (W20 checks both commands on the wire).

  **Every replica applies a committed transaction command exactly as carried,
  whatever its envelope.** Before step 1 of 2.3, and before applying a
  decision, the replica compares the carried envelope with its own build. On
  a mismatch it:
  - logs `PARTITION_SERVICE_LOG_MSG.TRANSACTION_ENVELOPE_MISMATCH`, with the
    command type, the index and both envelopes;
  - increments the counter read through `readTransactionEnvelopeDiagnostics()`,
    which returns `{mismatchCount, lastMismatch: {commandType, carried, own,
    index}}`;
  - then applies the command normally.

  It never refuses and never raises a host failure for it, so there is no
  stall in either upgrade direction.

  **Why this is safe.**
  - The apply side never classifies (AB), so a classifier-list difference
    cannot change a committed command's disposition on any replica.
  - The residual risk is a SQLite semantic difference between builds for the
    supported SQL population. That is the class ordinary writes carry today,
    without any envelope, and it is stated as L10.

  **The release-owner obligation**, for a release that changes the SQLite
  build, its compile options or the classifier list:
  1. at the start of the rolling upgrade, the L6 drain: no transaction command
     in flight, and every replica of every partition, its snapshot floor
     included, has applied past the last committed transaction command;
  2. then no transaction admission until every replica reports the new build.

  The participant's existing typed BEGIN refusal path (the self-check
  refusal's path above) consumes the release owner's signal. No such signal
  exists in `src` today, so it is the release owner's obligation, not a TX1
  mechanism. Its falsifier and the existing release preflight's scope
  (`scripts/release-preflight.js:1-22`, checkout facts only) are in 0.0.
- **Rowid rules (AK, AN; owner rowid decision).** Random rowid allocation
  happens only when a table's maximum rowid is 2^63-1 at the moment of
  allocation (SQLite's documented NULL/ceiling behaviour). Round 6 showed that
  one random allocation breaks premise item 1, and an admitted statement then
  splits PREPARED/REFUSED. The rules below keep that moment unreachable on
  every replicated write path. Each is owned by the statement-admission owner
  and is deterministic.
  - **R1, the alias rule (text; revision 9 exact text, AR, N8-8).** It is a
    token rule, case-insensitive. Tokens are read outside string literals
    (`'...'`, with `''` escapes), blob literals and comments, under the pinned
    lexical rules. A bare or quoted identifier (`"..."`, `[...]`, `` `...` ``)
    equal to `rowid`, `_rowid_` or `oid` is an **alias token**, and so is the
    last part of a qualified name (`main.t.rowid`, `t.oid`). `SQLITE_DQS=0`
    (`node_modules/better-sqlite3/deps/defines.gypi:17`) makes `"rowid"` an
    identifier, which SQLite resolves to the alias when no real column has that
    name.
    - Session writes: any alias token is refused (`refusalLayer: rowid_alias`).
    - Ordinary writes (`executeQuery`, `executeLocalQuery`, the committed
      apply):
      - **INSERT, REPLACE and WITH heads:** any alias token anywhere is refused
        (`rowid_alias`). This covers `AS alias` column lists, upsert `SET`
        targets, and the conflict-target `WHERE` of `ON CONFLICT (k) WHERE ...
        DO UPDATE` (round-8 R8-2).
      - **UPDATE and DELETE heads:** an alias token is admitted only inside the
        statement's top-level WHERE clause, from `WHERE` at parenthesis depth 0
        to the next `RETURNING`, `ORDER` or `LIMIT` at depth 0, or to the end.
        Anywhere else it is refused. An UPDATE or DELETE has no conflict
        clause, so this region can never hold an assignment target.
      - The only consumer of an admitted alias token is the schema-migration
        backfill: `UPDATE <table> SET <column> = ... WHERE ... rowid > ? AND
        rowid <= ?` (`migration-coordinator-stage-methods.js:626-631`,
        `migration-coordinator.js:51`; derivation 3).
    - Reads are exempt.
  - **R2, the INTEGER PRIMARY KEY contract (owner condition 1; revision 9 AQ,
    AR, N8-8).**
    - **Which tables.** SQLite's own alias rule: a rowid table whose primary
      key is a single column with a declared type of exactly `INTEGER`, with
      the `DESC` quirk (`INTEGER PRIMARY KEY DESC` is not an alias), read from
      `PRAGMA table_info` and the table's DDL. Partition schemas normalise
      `INT`, `BIGINT` and `INTEGER` keys to `INTEGER`
      (`table-creation-service-schema-derivation.js:38-41`) and emit `<name>
      INTEGER PRIMARY KEY` (`partition-service-table-bootstrap.js:150-160`).
    - **What counts as the key.** On such a table, the key column, the alias
      tokens of R1 and row-value targets that name either are all the key.
    - **Key values.** A key value is "an explicit integer" only if it is one
      of:
      - an integer literal;
      - a bound param of JavaScript type number that is an integer (`bigint` is
        already refused by the param rule);
      - (revision 10, AT) a bound string param that is canonical decimal text,
        matching `^-?(0|[1-9][0-9]*)$`, whose exact BigInt is a valid int64.
        This is how the PostgreSQL extended protocol delivers every key: the
        Bind parser decodes each parameter as text
        (`src/runtime/pgwire-message-parsers.js:75-102`), and the text reaches
        the partition unconverted (`pgwire-protocol-handler.js:619-623`,
        `src/query/pg/postgres-wire-adapter.js:190-231`).

      Any other string param in a key position is not an explicit integer:
      leading zeros, whitespace, a `+` sign, an exponent, or anything else
      (round-9 R9-1). Integer affinity would otherwise silently turn such text
      into some key. A canonical string is compared as its exact BigInt, so
      `'9223372036854775807'` is the top key and is treated as one.
    - **In a session write** (INSERT, REPLACE, and `UPDATE ... SET <key> = ...`
      alike), every key value must be an explicit integer inside [-2^62,
      2^62), canonical string params included. A NULL, an omitted key, an
      expression, a SELECT source, or a string param that is not canonical
      decimal text in range is refused at `implicit_key`.
    - **A statement "can allocate" (AQ)** if it has an INSERT, REPLACE or WITH
      write head and some row's key value is not an explicit integer: NULL,
      omitted, an expression, SELECT-sourced, or a param that is neither an
      integer number nor canonical decimal text of an int64. This is decided
      on the command bytes and params, so it is deterministic at apply.
    - **In a statement that can allocate, on both paths,** REPLACE conflict
      resolution (a `REPLACE` head, `INSERT OR REPLACE`) and an `ON CONFLICT
      ... DO UPDATE` that assigns the key are refused: on the wire with
      `refusalLayer: rowid_allocation`, at apply as STATEMENT_FAILED.
    - **A statement whose keys are all explicit integers never reaches
      `NewRowid`.** Its REPLACE or key-assigning `DO UPDATE` is therefore
      admitted on both paths. This keeps the existing explicit-key upserts
      working (derivation 3, R8-1).
    - **Ordinary writes otherwise keep automatic allocation**, under R3.
    - Partition tables declare no conflict clause of their own.
  - **R3, the ceiling, post-statement (AN).**
    - Which statements: those that can allocate a rowid: an INSERT or REPLACE
      head (UPSERT included) or a WITH write.
    - Before the statement (legacy state): `max(rowid)` of the own table at or
      above 2^62 refuses at once.
    - After the statement: `max(rowid)`, read with better-sqlite3's
      `safeIntegers(true)` and compared as an exact BigInt, must be below 2^62.
      Otherwise the statement's effects roll back and it is refused
      `rowid_ceiling`.
    - The four sites:
      1. session staging (inside c', after the statement);
      2. each operation of the PREPARE dry run (step 8 of 2.3: a REFUSED row
         with cause `rowid_ceiling`);
      3. each operation at COMMIT apply;
      4. each ordinary committed SQL apply (STATEMENT_FAILED
         `partition_write_statement_refused`).

    On the leader, an ordinary write is also checked before it is proposed.
  - **Why the post-check excludes random allocation throughout a statement
    (owner condition 2).**
    - A statement that cannot allocate (every key an explicit integer, R2)
      never reaches `NewRowid`. A statement that can allocate has no REPLACE
      resolution or key-assigning `DO UPDATE` (R2) and no alias token (R1), so
      it only adds rows. It never deletes or rekeys the top row. So the table's
      maximum is non-decreasing during the statement, and the final maximum is
      at least every intermediate one (revision 9).
    - On a TEXT-key table, no statement can assign a rowid (R1 refuses every
      alias token in an INSERT, REPLACE or WITH write, and every one outside an
      UPDATE's or DELETE's WHERE). So rowids only grow by increment, and the
      random fallback is unreachable except from legacy state, which the
      pre-check refuses.
    - A final maximum below 2^62 therefore means no allocation in the
      statement ever saw a maximum of 2^63-1.
    - Allocation by increment cannot climb the gap within a statement: a
      database holds at most 4294967294 pages of at most 65536 bytes
      (`sqlite3.c:14212`, `:14250`), about 2^48 bytes, so fewer than 2^48 rows.
      The gap from 2^62 to 2^63-1 is about 2^62.
    - The refusal is deterministic. The explicit top key (or the existing
      maximum) is the same row on every replica, so every replica sees the same
      maximum and refuses alike.
    - The owner's counterexample, an existing maximum of 9223372036854775806
      followed by two automatic insertions, is refused by the pre-check and by
      the post-check (W6r-b). R3 never compares with 2^63-1 alone.
  - **COMMIT never turns into a local abort (owner condition 3).** The COMMIT
    applies the same operations, against the same frozen state, as the PREPARE
    dry run. The reservation holds the table, and `g` is unchanged. So a
    ceiling refusal at COMMIT is unreachable once the dry run passed, like
    `commit_base_moved`. If a bug made it happen, it would be settled REFUSED
    identically, with an alarm (6.2).
  - **Existing and restored state, every ingress (owner condition 3).** Every
    mutation ingress runs R1-R3 through the one owner:
    - the committed SQL apply (ordinary writes, split mirror applies, the
      migration backfill);
    - transaction COMMIT;
    - `executeLocalQuery`;
    - the CDC bootstrap direct path.

    Restored state (a snapshot install, an SN1 image) is not rekeyed. The
    pre-check refuses allocating writes on a table whose maximum is at or above
    2^62. L6 adds a census that every partition table's maximum is below 2^62
    before the cutover. An image must preserve rowids (F-SNAP; VACUUM preserves
    them on this build, round 6).
  - **The owner's five rowid conditions, mapped:**

    | # | Condition | Mechanism | Witness |
    | --- | --- | --- | --- |
    | 1 | Schema semantics for `rowid`, `_rowid_`, `oid`, shadowing columns and true INTEGER PRIMARY KEY aliases; keep a normal explicit non-null integer key within a declared exact range; refuse uncontrolled alias assignment, omitted/NULL alias allocation and unsafe expressions | R1 (bare, quoted and qualified forms; no shadowing column exists: the census in revision 7, 0.5 item 6); R2 (the key type from `table_info`; [-2^62, 2^62); NULL, omitted, expression and SELECT refused in transactions) | W6r (session and ordinary alias forms), W6r-b (the in-range key stages; NULL, out-of-range and omitted are refused) |
    | 2 | No random allocation throughout a statement or batch, hidden keys of TEXT-key tables included; exact integers; a proved bound, or refusal before admission | R3 post-statement with exact BigInt; R2's monotonicity; the page-count bound | W6r-b (a top key then NULL on an INTEGER PRIMARY KEY table; two automatic insertions after 2^63-2 on a TEXT-key table) |
    | 3 | Existing and restored state and every ingress through one owner; no silent rekey; COMMIT never becomes a local abort | the one owner on all ingress; the pre-check; the L6 census; the dry-run equivalence | W6r (dry-run half, apply half), W6p (`executeLocalQuery`) |
    | 4 | Sessionless and session connection-state mutation closed before `db.prepare`; storage initialization separate | the kind owner on `executeQuery`, `executeLocalQuery` and the apply | W6p |
    | 5 | The row-order-dependent mutation refused before proposal, or identical effects proven; positive normal-transaction controls | L9 refuses the reproduced shapes at staging; normal transactions stage (W6, W1a) | W6r (L9 cases), W6n (`upper(?)` stages), W6r-b (in-range key stages) |

  - **WITHOUT ROWID** stays deferred (owner decision). It has its own key and
    result differences, and the migration owner pages by rowid
    (`migration-coordinator-stage-methods.js:415-416`, `:626-631`).
- **Limit L9: three order-dependent shapes are refused in session writes (AK;
  wording per N7-5).** These rules can be implemented exactly and refuse by
  default:
  - **L9a.** A LIMIT or OFFSET keyword token anywhere in a session write
    (`DELETE ... LIMIT` and `UPDATE ... LIMIT` included; the build enables
    `SQLITE_ENABLE_UPDATE_DELETE_LIMIT`, `defines.gypi:30`).
  - **L9b.** A `(` immediately followed by `SELECT` or `WITH`, unless the token
    before the `(` is IN or EXISTS: scalar subqueries, derived tables and CTE
    bodies (`AS (SELECT`). So the admitted WITH-write head is VALUES-only in
    practice.
  - **L9c.** An aggregate opcode (`AggStep`, `AggValue`, `AggInverse`,
    `AggFinal`): bare columns under aggregates, `group_concat` order, window
    frames, floating-point summation order.

  L9 does not refuse every order-sensitive shape. These are admitted and are
  order-sensitive when rows tie (round 7):
  - `INSERT OR IGNORE`, `INSERT OR REPLACE` and UPSERT, each `... SELECT` with
    duplicate keys;
  - `UPDATE ... FROM` with several matching rows.

  All of them, and the three refused shapes, compute identically while premise
  items 1-4 hold. The owner's condition 5 is met for the reproduced shape: it
  is refused before proposal. L9 is defence in depth against a premise break,
  and does not claim completeness. Session reads are exempt: a read changes no
  replicated state.
- **The premise of K, stated (AK, AO).** Identical command bytes produce
  identical results on every replica only while this state is equal on all of
  them:

  | # | State | Equal because | Owner | What breaks it, and its owner |
  | --- | --- | --- | --- | --- |
  | 1 | application rows, including rowids | every change is a committed command applied in log order through the statement-admission owner; no rowid is assigned (R1), none is allocated at random (R2, R3) | the write kernel and the statement-admission owner | **F-DET** (L11): ordinary writes store per-replica values (functions such as `random()` and `datetime('now')`, connection state, pragmas, replica-local tables); reachable through `NOW()` (`pg-function-registry.js:88-94`, `:174-175`); owner: the query engine or the partition apply (0.7). **The CDC bootstrap direct fan-out** writes every local initialized replica outside the log when the raft lane fails (`cdc-bootstrap-direct-sql.js:118-163`); owner: the CDC bootstrap owner (finding F-BOOT). **A row-level rebuild** that renumbers rowids; owner: the snapshot owner (F-SNAP). **Legacy state at or above 2^62**; owner: the cutover owner (the L6 census) |
  | 2 | schema, including indexes | created at initialize from the partition's schema (`partition-service-table-bootstrap.js:146-190`); changed only by committed `MIGRATION_ALTER_TABLE` and committed index DDL on the own table; init-time column upgrades (`:170-177`) are the same code on every replica | the partition bootstrap, migration and index owners | **init-time index re-creation** (`system-table-schema-sql.js:42-53`, run at `partition-service-table-bootstrap.js:179-181`) happens at each replica's restart, not at a log position: a `DROP INDEX` of a schema-declared index would come back on a restarted replica only (N7-12; the narrowed rule refuses that drop). **Different init-time upgrades** on mixed releases (the L6 drain) |
  | 3 | connection flags | no PRAGMA is prepared on a partition connection from any wire, `executeLocalQuery` or apply (the kind owner). The partition's own PRAGMAs are journal and synchronous settings at init (`partition-service-raft-init-base.js:357-358`), the durable store's synchronous toggling (`raft-rs-durable-store.js:195-203`) and page-count reads (`partition-service-cdc-stream-base.js:673-676`); none changes a query result | the statement-admission owner | a future owner that sets a result-affecting PRAGMA on the connection |
  | 4 | SQLite version and compile options | one pinned build per release; the execution envelope records disagreement on every transaction command as a diagnostic (revision 10) | the release owner (the drain and the admission pause of 3.3); the participant apply (the diagnostic) | a mixed-build window: transaction commands applied during it (prevented by the release-owner obligation, else L10), and ordinary writes (L10, L11) |

  **K is conditional on L11.** A transaction that reads or constrains rows
  written by an ordinary write with a per-replica value can split
  PREPARED/REFUSED. After a global COMMIT it can then answer `not_prepared` on
  that follower, and NOT_COMMITTED after a leader change.

  **Test-fixture note (N7-11).** The root-page table above was measured on the
  port double. Production opens the durable store only when `lifecycle.active`
  (`raft-rs-operation-port.js:204`). It also opens the peer-identity registry
  (`:163`) and the lifecycle owner (`:181-183`) on the same database, which the
  double does not. Root pages are resolved at each classification, so the
  classifier does not depend on these numbers.
- **Date/time functions are refused entirely in Leg A, whatever their
  arguments** (revision 5, 0.5 item 2). This covers `datetime()` and `unixepoch()` (which
  assume 'now' when the time-value is omitted), a bound param `'now'` in any
  case, a column holding 'now', and the host-dependent `'localtime'`/`'utc'`
  modifiers. `NOW()`/`CURRENT_TIMESTAMP` reach the participant as
  `datetime('now')` (`pg-function-registry.js:88-94`, `:174-175`). Every other
  function passes through the registry unchanged (`:199-205`), which is why the
  census is an allow-list.
- **Implicit keys.** The table's primary key is read with `PRAGMA
  table_info(<table>)` on the leader's connection at staging; the partition
  already reads its schema this way (`partition-service-entry-apply-base.js:81`).
  That schema comes from initialization (`partition-service-table-bootstrap.js:146-190`)
  plus committed `MIGRATION_ALTER_TABLE` commands, and is the same on every
  replica. Because classification is leader-only, the classifier does not need
  to be a function of the committed bytes. An INSERT/REPLACE is refused when it
  has no column list, or its column list (the parenthesized identifiers after
  the target table) omits the primary-key column. If the table has no declared
  primary key, every INSERT is refused (the rowid would be implicit).
  Round-5 nit N-H: this is a text rule. It must parse quoted and
  schema-qualified names and `WITH ... INSERT`, and it does not see `(id, ...)
  VALUES (NULL, ...)` on an INTEGER PRIMARY KEY. That case is `NewRowid`
  (`max + 1`), deterministic on consistent replicas except at the int64
  ceiling, where SQLite picks at random. Revision 6 recorded this under L4
  (its 0.5 item 9); R1-R3 now close it.
- **Answer.** A refusal at any layer but `compile` is
  `participant_transaction_session_write_nondeterministic`, and nothing is
  staged. Every refusal carries `refusalLayer` (revision 7, N6-3). W6n (24
  cases, listed with their layers in the fixture's `classifierRefusalCases`)
  covers:
  - `datetime('now')`, `DATETIME('NOW')`, `datetime()`, `unixepoch()`,
    `strftime('%s')`, `datetime(?)` with `'now'` and with `'NOW'`, and
    `datetime('2020-01-01', ?)` with `'localtime'`;
  - `random()`, `randomblob`, `sqlite_version()`, and an implicit key;
  - revision 6: `pragma_page_count()`, `pragma_database_list`, `dbstat`, a
    `_raft_rs_log` read in INSERT ... SELECT, a read of a temporary table
    planted on the leader's connection, `PRAGMA page_count`, and `PRAGMA
    reverse_unordered_selects = 1`. W6n also requires that pragma to read 0
    on the leader afterwards: a refused statement never runs, not even inside
    the sentinel transaction;
  - revision 7: `pragma_table_info`, `json_each`, a `sqlite_master` read, a
    `_partition_statement_outcomes` read, and a `VALUES` head.

  W6r covers the rowid-alias, L9 and ceiling refusals on both paths.

  A Buffer param is refused with its own code. An allowed `upper(?)` stages.
- **Consequence.** With params restricted to JSON scalars (3.1), and programs
  restricted to listed opcodes and functions over the partition's own table in
  the main database, every staged operation is a deterministic function of
  premise items 1-4 above (revision 7: the premise is explicit, and the
  rowid and flag channels of round 6 are closed by the kind owner and the
  rowid rules). The PREPARE dry run and the
  COMMIT execution compute identical results on every replica that runs the
  same SQLite semantics for the allow-listed functions. An allow-listed function
  whose semantics differ between SQLite versions is a classifier-owner defect,
  recorded under L4.
- **Results**: staged replies are `provisional: true`; the COMMIT answer
  carries `results` from the committed apply (W6).
- **Limit L7.** Transactions cannot use date/time or random functions, unknown
  functions, implicit keys or non-JSON params. They also cannot read any table
  but their partition's own, any virtual table or pragma, or compile to an
  opcode outside the list. Applications must supply such values as params.
  Limit L9 (order-dependent writes) and the rowid rules are stated above.
- **Finding F-DET** (R17). Ordinary replicated writes still evaluate such
  functions per replica.

### 3.4 Explicit supersession of epoch snapshot isolation

The promise "epoch-based snapshot isolation (committed-before-epoch visibility
+ read-your-own-writes) and first-committer-wins write-conflict detection at
prepare" is superseded by: **reads in a session see committed state plus the
session's own staged operations (c' replay); a transaction commits only if no
committed write was applied to its partition between its BEGIN and its PREPARE
apply (partition-granular first-committer-wins, validated from committed state
on every replica).** Documents to change in the cutover change set:

- `architecture/process-replication.md:348-354` (also the claim that PREPARE is
  a durable `PREPARE_TRANSACTION` entry);
- `architecture/runtime-components.md:226-235` (also "reconstructs prepared
  state from Raft log entries" and "PREPARE_LOST after autonomous timeout
  release");
- `architecture/postgres-wire.md:284-286`;
- `architecture/postgres-locking-reads.md:7-8`;
- `architecture/INDEX.md:96-98`;
- `docs/development/product-roadmap.md:88-89`;
- `docs/development/agpl-feature-map.md:127-131`.

Tests: Property 1, 10 and 11 of `partition-transaction.property.test.js`
(section 9). Code deleted with the promise (R11): `checkWriteConflicts`,
`getOldestRetainedCommitEpoch`, `isSnapshotExpired`, `applySnapshotReadFilter`,
`pruneCommittedWriteLog`, `trackTransactionWriteSetKey`,
`resolveTransactionWriteSetKey`, `rowCommitEpoch`, `committedWriteLog`
(`transaction-base.js:195-348`, `core-base.js:185-191`).

### 3.5 Cached-view audit

| View | Invalidated by | Stale at the read site | Why staleness cannot unsafely decide |
| --- | --- | --- | --- |
| Volatile session (ACTIVE/PREPARING) | leader loss, restart, sweep, terminal decision | a request finds no session: `not_active` | no durable decision is read from it; outcome reads use rows only |
| `generationBase` (the BEGIN-time value of `_partition_write_generation`) | none (fixed at BEGIN) | older than committed state | only causes a refusal; authority is recomputed at apply |
| Leader prechecks (reservation, terminal row, digest) | the next apply | may park a write the apply would admit (released at the decision or its own deadline), or propose a decision the apply refuses | prechecks only refuse or answer from immutable terminal rows; apply decides |
| Reservation waiters (parked writers, volatile, leader only) | the decision apply's afterCommit re-admission; the writer's own deadline; leadership loss (`releasePendingCommittedWrites`) | a parked writer whose wake was missed waits at most to its own 30 s deadline | it holds no durable state; it is answered typed and retryable (unproposed), never applied twice: its entryId is unsettled |
| Pending outcome map | settle of the outcome promise `cdc-stream-base.js:369-374` | none | joins retries of one entryId only |

### 3.6 Contention: population, retry owner, budget (decision V; L5 accepted by the owner)

**Owner decision (revision 8).** L5's typed predecision conflict is accepted
for Leg A as an availability/concurrency trade-off, not an R12 exception. Row
MVCC and predicate locking are not introduced. W16 now also requires
uncontended success, and success after bounded interference has ended, so an
always-conflicting implementation fails it. Repeated requests can starve under
continuous writes. Finer granularity is a measured future choice, not an
automatic TX2 requirement. Seam V (agreed): the whole statement-autocommit
attempt is retried only after a definitive conflict or noncommitment.


- **Population affected.**
  - Every explicit transaction.
  - Every multi-partition statement without an explicit transaction: it runs as
    a STATEMENT_AUTOCOMMIT distributed transaction
    (`sql-query-engine-write-execution.js:83-90`, BEGIN at `:129`).
  - Internal coordinator users, such as migrations driven through the seed
    engine's coordinator.
- **Population not aborted.** Single-partition statements without an explicit
  transaction are DIRECT_AUTOCOMMIT: they never reach the coordinator and are
  ordinary replicated writes (`:83-90`, `:120-121`). They never abort with
  `conflict`. They are delayed, though: while a PREPARED row exists on their
  partition they are parked up to their own 30 s deadline. Today a session
  defers them for up to 2 s (`USER_TRANSACTION_WRITE_DEFER_BUDGET_MS`,
  `partition-service-constants.js:56`). Under L3 they are refused at the
  deadline for as long as the reservation lasts (round-4 N5).
- **Regression.** Today a session's `BEGIN IMMEDIATE` makes concurrent writers
  wait (deferral up to `USER_TRANSACTION_WRITE_DEFER_BUDGET_MS`). Under Leg A,
  concurrent writers proceed, and any committed write to a participant
  partition between BEGIN and PREPARE refuses the transaction (`conflict`). A
  sustained stream of single-partition writes can starve a multi-partition
  statement.
- **Retry owner and budget (revision 5, deviation 0.5 item 7).** The unit retried is the
  whole statement-autocommit transaction:
  1. roll back;
  2. BEGIN again (a new transactionId and base);
  3. re-execute;
  4. COMMIT.

  The owner is the engine's statement-autocommit path. The unit spans
  `openWriteTransaction`, execute and `finishWriteTransaction` at three call
  sites (`sql-query-engine-write-execution.js:225-294`, `:392-462`,
  `:559-629`); `finishWriteTransaction` alone (`:159-176`) cannot re-execute.
  The retry:
  - fires only on a durable REFUSED `conflict`, never on UNKNOWN;
  - is bounded by the 60 s transaction budget (`timeout-budget.js:20`);
  - waits between attempts with the coordinator's participant backoff of 3
    retries at 10-250 ms (`distributed-transaction-protocol.js:714-718`,
    `distributed-transaction-coordinator-constants.js:38-42`).

  Seam V is agreed by the query owner (owner record): the existing statement
  owner retries the whole attempt only after a definitive conflict or
  noncommitment, within one budget. Explicit
  transactions are not retried by the system: the client receives the typed
  conflict through the facade. Starvation is bounded by the budget and then
  becomes a typed failure, never a hang.
- **Measurement, not promise.** W16 drives four transactions, each with a
  concurrent committed writer. It asserts only that every PREPARE answer is
  typed (PREPARED, or refused `conflict`), and reports the measured abort rate
  as a test diagnostic. Under the design the rate with a writer in every round
  is 4/4; on this head the answers are untyped.
- **Owner decision.** Accepting this exposure for Leg A is an explicit owner
  decision (R12: load may degrade throughput but not correctness; here it
  turns waiting into typed aborts). It is recorded as limit L5, with W16 as its
  falsifier.
- **Refinement for Leg B.** Hybrid bases: per-row base digests for statements
  whose write set is provably a single primary key (the structured
  insert/update/delete builders, `partition-service-write-metrics-base.js:250-332`).
  The partition generation stays the base for everything else.

## 4. State x command transition table (decision G)

Legend:

- `W` = writes durable state in the application transaction; `g+1` marks
  the only cells that advance the write generation (application data, AA);
  `-` = writes nothing.
- "req" is the leader's request handling, before any proposal; "apply" is the
  committed command's application on every replica.
- Codes are `participant_transaction_*` unless prefixed `partition_write_*`.
- "unreachable" marks a combination the check order or the reservation makes
  impossible; it names no behaviour.
- "Reserved" means some PREPARED row exists on the partition.
- Missing identity fields, or a mismatching `participantId`/epoch, answer
  `identity_required` / `identity_mismatch` in every cell (-).
- Any request whose committed command may still commit answers `{success:false,
  outcome: UNKNOWN}` when it is released (deadline, leader loss, own apply's
  environmental failure, host failure while proposing; section 7).

| State | BEGIN | session write | session read | PREPARE | COMMIT (bound) | ROLLBACK (bound) | ROLLBACK (unbound) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ABSENT | req: self-check failed -> `determinism_self_check_failed` (-); else fences (removal, topology, `already_active` if another non-terminal) -> ACTIVE; `g` read as base (-) | `not_active` (-) | `not_active` (-) | req: `not_leader` on a non-leader; else `not_active`, outcome UNKNOWN (-). apply: steps 1-8 of 2.3 -> PREPARED (W) or REFUSED+cause (W) or `reserved_refused` (-) | req: propose. apply: `not_prepared` (-), alarm | req: propose. apply: TOMBSTONE (W) | `success`, `durable: false` (-) |
| ACTIVE (volatile) | same identity: idempotent; other: `already_active` (-) | classifier/param refusal (`session_write_nondeterministic`, `session_write_param_unsupported`; a compile error `statement_failed`); else c' validate: STAGED provisional / `statement_failed` / `replay_diverged` (doomed) / `replay_budget_exceeded` (-) | classifier refusal as for a write (-); else replay + read: committed state plus own operations (-) | req: `g` moved since BEGIN -> refused `conflict`, nothing proposed (-); else seal -> PREPARING, propose | `not_prepared` (-) | discard; propose; apply TOMBSTONE (W) | discard, `durable: false` (-) |
| PREPARING (volatile, proposer only) | same: PREPARING; other: `already_active` (-) | `preparing` (-) | replay + read of the sealed operations (-) | join the pending outcome (-) | `preparing`, deferRetry (-) | propose; apply after the PREPARE: ROLLED_BACK (W); before it: TOMBSTONE (W) | `preparing`, deferRetry (-) |
| PREPARED | same: `sealed`; other: `already_active` (-) | `sealed` (-) | `sealed`: reads go sessionless (-) | req: PREPARED + digest from the row (-). apply duplicate: idempotent or `prepare_content_conflict` (-); same identity with an invalid digest: typed `prepare_refused`/`digest_invalid`, the row unchanged, apply continues (-) (W17) | req: digest/text check else `decision_digest_mismatch` (-); propose. apply: recheck binding and `g` (digest of the current `g` equals the carried digest, else REFUSED `commit_base_moved` (W)); run operations, per-op outcomes, `UPDATE ... SET state='COMMITTED' WHERE state='PREPARED'`, `g+1` if at least one operation applied (zero operations: no `g` move, W19), applied index, one transaction (W); environmental -> host failure (-) | apply: `UPDATE ... SET state='ROLLED_BACK' WHERE state='PREPARED'` (W); a present, different digest: `decision_digest_mismatch` (-) | `decision_binding_required` (-) |
| COMMITTED | `terminal` (-) | `terminal` (-) | `terminal` (-) | `terminal` (-) | same digest: replayed, answered from per-op rows (-); other: `decision_conflict` (-) | `decision_conflict` (-) | `decision_conflict` (-) |
| ROLLED_BACK | `terminal` (-) | `terminal` (-) | `terminal` (-) | `terminal` (-) | `decision_conflict` (-) | same digest replayed; other `decision_conflict` (-) | `success`, durable not committed (-) |
| REFUSED | `terminal` (-) | `terminal` (-) | `terminal` (-) | `terminal` (-) | `not_prepared` (-), alarm | answered NOT_COMMITTED, REFUSED stays (-) | `success`, durable not committed (-) |
| TOMBSTONE | `terminal` (-) | `terminal` (-) | `terminal` (-) | apply: `terminal`, late PREPARE refused, no reservation (-) | `decision_conflict` (-) | replayed / `decision_conflict` (-) | `success` (-) |

| State | outcome read | hold sweep | restart | leader loss | ordinary write while reserved | mirror apply while reserved | schema change (`MIGRATION_ALTER_TABLE`) while reserved | foreign decision / tombstone / refused PREPARE while PREPARED |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ABSENT | UNKNOWN, ABSENT (-) | n/a | n/a | n/a | not reserved: applies (W, `g+1`) | applies (W) | not reserved: applies (W, `g+1`) | n/a (no reservation) |
| ACTIVE | UNKNOWN, ACTIVE (-) | past `PREPARED_HOLD_TIMEOUT_MS`: discarded on any role, no SQL; later requests `not_active` (-) | lost -> ABSENT | discarded by the demotion hook -> ABSENT | not reserved: applies (the transaction will refuse `conflict`) | applies | not reserved: applies (W, `g+1`; the transaction will refuse `conflict`) | n/a (no reservation) |
| PREPARING | UNKNOWN (-) | not swept (the pending write owns its 30 s deadline) | lost; the proposal may still commit | released: UNKNOWN if proposed, `not_leader` if not | not reserved until the PREPARE applies | same | same | n/a (no reservation) |
| PREPARED | UNKNOWN, PREPARED, digest, prepare index/term (-) | reported only (`held_reported`), never terminalized (-) | row survives with its reservation | row unaffected | req: **parked** unproposed in the proposal queue under its own `PENDING_REQUEST_TIMEOUT_MS` deadline; re-admitted by the decision apply's post-commit effect; deadline -> `partition_write_commit_deadline_exceeded` (unproposed, retryable) (-). apply (a write proposed elsewhere, or raced): `reserved_refused`: no statement, no outcome row, `g` unchanged, applied index advances; the proposer (if it is this leader) re-parks it, and any other proposer is answered `partition_write_reserved`, retryable (-) | same as ordinary write; the mirror sender throws on a refusal (`partition-split-routing.js:241-245`, L1, unverified) | same as ordinary write: req parked on the leader; apply `reserved_refused`: no ALTER, no outcome row, `g` unchanged, applied index advances; the migration's partition retry re-sends it (`migration-coordinator-stage-methods.js:106-131`); T1's COMMIT applies over the old schema (W18) | foreign bound ROLLBACK: that transaction's TOMBSTONE row (W, control, `g` unchanged); a foreign ROLLED_BACK row is unreachable here (that transaction cannot be PREPARED while T1 is, step 4 of 2.3); a foreign COMMIT for an absent transaction: `not_prepared` (-) (W17); a foreign COMMIT for a prepared transaction cannot occur (it needs its own PREPARED row, which the reservation prevents); a foreign PREPARE with a bad digest: REFUSED `digest_invalid` (W, control, `g` unchanged); T1's own identity with a bad digest: typed, no write; this row and its reservation are unaffected, and `g` is the same before and after, so its COMMIT applies (W17) |
| COMMITTED | COMMITTED (-) | n/a | survives | n/a | applies | applies | applies | n/a (no reservation) |
| ROLLED_BACK | NOT_COMMITTED (-) | n/a | survives | n/a | applies | applies | applies | n/a (no reservation) |
| REFUSED | NOT_COMMITTED + `refusalCause` (-) | n/a | survives | n/a | applies | applies | applies | n/a (no reservation) |
| TOMBSTONE | NOT_COMMITTED (-) | n/a | survives | n/a | applies | applies | applies | n/a (no reservation) |

Another transaction's PREPARE while the partition is reserved is
`reserved_refused` at apply and `reserved` with deferRetry at request (the
coordinator's participant retry owns it), so contention never forces an abort.

## 5. Durable row and outcome vocabulary (decision F)

### 5.1 One transaction table, one generation row

`_participant_transactions` REPLACES `_transaction_outcomes`
(`partition-service-constants.js:89-108`). It is a new table because SQLite
cannot change a primary key in place, and the old key `(session_id,
transaction_epoch)` is non-unique. The old table and its UPSERT are dropped in
the cutover, after the drain (11.3).

```
_participant_transactions (
  transaction_id TEXT NOT NULL, participant_id TEXT NOT NULL,
  session_id TEXT, commit_mode TEXT NOT NULL, transaction_epoch INTEGER NOT NULL,
  state TEXT NOT NULL,               -- PREPARED | COMMITTED | ROLLED_BACK | REFUSED
  operations_text TEXT, validation_text TEXT, prepared_digest TEXT,
  prepare_entry_id TEXT, prepare_index INTEGER, prepare_term INTEGER,
  decision TEXT, decision_digest TEXT, decision_entry_id TEXT,
  decision_index INTEGER, decision_term INTEGER,
  refusal_cause TEXT, refusal_detail TEXT,
  PRIMARY KEY (transaction_id, participant_id)
)  + INDEX ON (state)

_partition_write_generation (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  generation INTEGER NOT NULL
)                                     -- (1, 0) at initialization; never deleted
```

Writes happen only inside the application transaction:

- `INSERT` of a PREPARED, REFUSED or TOMBSTONE row;
- `UPDATE ... WHERE ... AND state = 'PREPARED'`, whose `changes` must be 1 (an
  invariant: otherwise throw, host failure);
- `UPDATE _partition_write_generation SET generation = generation + 1`.

There is no UPSERT and no `Date.now()`: time is the entry's `(index, term)`.
The reservation read is `SELECT 1 FROM _participant_transactions WHERE state =
'PREPARED' LIMIT 1`.

Retention (R13): one row per transaction per participant, like
`_partition_statement_outcomes` (`partition-committed-statement-outcome-constants.js:16-19`).
Rows are removed only by a committed command of the log-bound owner after the
coordinator's record is terminal; Leg A adds none. The generation row is never
removed. An unbound ROLLBACK of an ACTIVE session costs no round and no row.

### 5.2 `resolveTransactionCommitOutcome` mapping (unchanged)

| Durable/volatile state | Answer |
| --- | --- |
| COMMITTED row | COMMITTED |
| ROLLED_BACK row (incl. TOMBSTONE) or REFUSED row | NOT_COMMITTED |
| PREPARED row | UNKNOWN |
| no row (ABSENT), ACTIVE, PREPARING | UNKNOWN |

- NOT_COMMITTED is answered only from a durable ROLLED_BACK or REFUSED row,
  never from absence.
- Any replica may answer.
- The answer carries `{transactionId, participantId, state, preparedDigest,
  prepareIndex, prepareTerm, decisionIndex, decisionTerm, refusalCause}`.
- `PARTICIPANT_COMMIT_OUTCOME` (`src/constants/transactions.js:17-21`) is
  unchanged.

## 6. Atomicity and faults (decisions J and K)

### 6.1 The one transaction

The transaction is the `store.transaction` opened by
`applyCommittedEntryTransaction` (`raft-rs-application-transaction-owner.js:60`).
Inside it, in order, the partition's `applyCommittedEntry` callback (`:61-68`):

1. re-checks the binding and `g`;
2. runs the decision's operations;
3. records each per-operation committed-statement outcome (`txop:` keys,
   APPLIED, with `changes`/`lastInsertRowid`);
4. applies the conditional row UPDATE to COMMITTED;
5. increments `g` once (application data changed, AA).

Then `putAppliedState` runs (`:77-78`). Everything commits together or not at
all. The proposer's answer, the CDC events, the size update and the parked
writers' re-admission are afterCommit effects (`:95-97`). A throw inside rolls
everything back and rethrows (`:85-94`); the runtime makes it the group's host
failure (`raft-rs-runtime-owner.js:920-941`).

- W2a: a planted failure of the applied-state write leaves no row, no `txop:`
  outcome and the state PREPARED, with the applied index unchanged.
- W2b (V1, R4-3): records, from inside the applied-state write, the row
  count, the participant state, the `txop:` count and `g`: `[{rows:1,
  state:'COMMITTED', txop:1, generation:1}]`. An afterCommit write of any of
  them shows the old value.
- W2c (R4-3): an ordinary write's applied-state write sees its own increment
  of `g` (`[{rows:1, generation:2}]` after a warm-up write). On this head the
  probe's read of the absent table fails the apply: a new-surface red.

### 6.2 Typed failure edges and K restated

| Edge | Typed outcome | Fails closed | Caller observes |
| --- | --- | --- | --- |
| A sessionless or committed statement with an unadmitted head (PRAGMA, ATTACH, non-index DDL, ...), or an assigned rowid alias on the ordinary path | wire: `partition_write_statement_refused` with `refusalLayer`, nothing proposed (-); apply: STATEMENT_FAILED with that code, identical, applied index advances (W) | yes | statement refused; connection unchanged (W6p, W6r) |
| An allocating statement at or above the rowid ceiling (2^62) | leader: `rowid_ceiling` refusal (-); apply: STATEMENT_FAILED, or a REFUSED PREPARE with cause `rowid_ceiling` (W), identical | yes | write refused everywhere alike (W6r) |
| Leader self-check failed (a classifier layer not live on this binary, or an unvetted SQLite version) | `determinism_self_check_failed` on BEGIN (-) | yes | no transaction starts on this leader; ordinary writes unaffected (W6s) |
| Nondeterministic operation at staging (any layer of 3.3 but `compile`) | `session_write_nondeterministic` (-) | yes | statement refused, nothing staged |
| Session statement that does not compile | `statement_failed` (-) | yes | statement refused, nothing staged |
| Unsupported parameter at staging | `session_write_param_unsupported` (-) | yes | write refused |
| Operation the staging classifier would refuse, inside a committed PREPARE | applied as carried; no apply-side classification (AB) | n/a | identical on every replica (W3c) |
| Deterministic failure at PREPARE dry run | REFUSED `statement_failed` (W), identical | yes | PREPARE refused; NOT_COMMITTED |
| `g` moved before PREPARE apply | REFUSED `conflict` (W) | yes | PREPARE refused |
| `g` digest differs from the carried digest at COMMIT apply (impossible on consistent replicas: control rows never move `g`, W17) | REFUSED `commit_base_moved` (W), identical, alarm | yes | COMMIT answered not committed; atomicity alarm |
| Deterministic failure at COMMIT apply (impossible under the classifier + reservation) | REFUSED `commit_statement_failed` (W), identical, alarm | yes | same |
| Environmental failure at any apply | host failure, nothing recorded, applied index unchanged | yes | UNKNOWN (section 7) |
| Replay of an earlier staged op fails | `replay_diverged`, doomed | yes | session request refused |
| Replay budget | `replay_budget_exceeded` | yes | write refused |
| Digest or decision text mismatch | `decision_digest_mismatch` (-) | yes | refused |
| Opposite terminal | `decision_conflict` (-) | yes | first terminal stands |
| COMMIT on ABSENT/REFUSED | `not_prepared` (-), alarm | yes | refused |
| PREPARE while reserved | `reserved`, deferRetry, non-settling | yes | retry |
| Same-identity PREPARE with an invalid digest | typed `prepare_refused`/`digest_invalid`, no write, entry consumed (-) | yes | apply continues; the PREPARED row is unchanged (W17) |
| Schema change while reserved | `reserved_refused` (-), non-settling | yes | the migration retry re-sends it after the decision (W18) |
| Zero-operation COMMIT decision | COMMITTED (W), `g` unchanged | n/a | W19 |
| Zero-operation PREPARE (read-only participant) | PREPARED, reserves the partition until the decision | n/a | cost (nit N11): a read-only participant blocks the partition's writers for its PREPARE-to-decision window; the coordinator may omit read-only participants (seam F) |
| Late PREPARE after TOMBSTONE | `terminal` (-) | yes | refused |

K precisely:

- **K is conditional on L11** (revision 8): ordinary writes with per-replica
  values break premise item 1.
- On consistent replicas (premise items 1-4 of 3.3) the PREPARE dry
  run and the COMMIT run the same allow-listed deterministic programs over the
  partition's own table (AB, AH, AK), against frozen committed state
  (the reservation, and `g`, which only application data moves). So a COMMIT-time failure is
  unreachable except through a bug.
- If a bug makes it happen, it is identical everywhere and settled REFUSED,
  with an alarm.
- A single-replica environmental failure is the host failure (W3b, control 3).
- Limit L4 stands: a replica whose rows silently diverged records alone,
  exactly as for ordinary writes (`partition-committed-statement-outcome.js:180-187`).

## 7. Await, deadline, leader loss, and the answer owner (decisions H, T, X)

- **Proposing.** PREPARE, COMMIT and bound ROLLBACK requests:
  1. build their command;
  2. ask `admitCommittedCommand` (origin TRANSACTION_OWNER, identity required);
  3. check leadership as `applyWrite` does (`partition-write-kernel.js:294-312`,
     `:338-362`);
  4. join a pending outcome of the same entryId;
  5. otherwise call `startPartitionRaftWriteCommit`
     (`partition-service-raft-write-commit.js:237-252`, with
     `waitForCommittedWrite` registered before the proposal at `:146`).
- **The answer owner is the write kernel (decision AD; revision 5).** The
  kernel's answer builders own the fact "committed or may be committed":
  `unansweredWriteResult` (`partition-service-raft-write-commit.js:122-131`)
  and `buildPartitionWriteProposalRefusal` (`partition-write-kernel.js:390-414`).
  For every write, ordinary or transactional, they answer `{success:false,
  failureCode: partition_write_outcome_unknown, entryId}` for:
  - a proposed release at the deadline or on leader loss (already so,
    `partition-write-kernel.js:370-387`): W11a, W11b;
  - a rejection by the proposer's own committed apply with an environmental
    failure (`partition-committed-statement-outcome.js:294-300`). Today
    (corrected in revision 6, round-5 R5-2) it is answered in one of two ways:
    - on the real port, the apply's throw becomes the group's host failure,
      and the proposal's refusal reaches `hostFailureProposalAnswer`, whose
      environmental branch answers `failureCode:
      partition_committed_statement_environment_failed` with the environmental
      text and the port's consensus fields (`partition-write-kernel.js:390-395`;
      pinned by `committed-statement-outcome.test.js:776-790`);
    - where the rejection reaches `unansweredWriteResult`'s default branch
      instead (the controllable port), a plain `{success: false}` with no code
      (`partition-service-raft-write-commit.js:130`).

    W11e and W11e-ord witness it;
  - a port refusal with outcome `HOST_FAILURE` whose rejection is not
    environmental: today `partition_write_consensus_host_failure`
    (`partition-write-kernel.js:396-397`). W11f and W11f-ord witness it;
  - `CORE_FATAL`, already OUTCOME_UNKNOWN (`:410-413`; round-4 N3 corrected).

  **Scope of the default-branch change (revision 7, N6-6).** The rejections
  that reach `unansweredWriteResult`'s default branch
  (`partition-service-raft-write-commit.js:130`) all come from
  `rejectCommittedWrite` (`grep -rn "rejectCommittedWrite(" src/partition`,
  three call sites):
  - the environmental failure of the write's own committed apply
    (`partition-committed-statement-outcome.js:299`);
  - an UNRECOGNISED committed command
    (`partition-service-entry-apply-base.js:989-1001`, rejected at `:999`);
  - the proposal refusal (`partition-service-raft-write-commit.js:178-180`),
    which is answered by `buildPartitionWriteProposalRefusal` through the
    REFUSED arm (`:123-125`), not by the default branch.

  `portWriteDeferral` (`:109-111`) also rejects, but returns its own unproposed
  answer to the caller before any proposal. So AD's default branch covers every
  rejection of an entry that was proposed and may be in the log, the
  environmental and UNRECOGNISED ones included. Both answer
  `partition_write_outcome_unknown`, with the code in `cause`. A deterministic
  STATEMENT_FAILED is resolved, not rejected (`:315-322`), and keeps its
  answer.

  **The AD answer** is `{success: false, error: ERRORS.WRITE_OUTCOME_UNKNOWN,
  failureCode: partition_write_outcome_unknown, entryId, partitionId,
  consensus, cause: {failureCode, error}}`. The replaced code and text,
  including the SQLite code, are kept in `cause`, and the port's consensus
  fields are kept (0.5 item 8). `partition_write_consensus_host_failure` then
  has no producer (0.7). Every assertion this rewrites is listed in 9.2
  (revision-6 rows, derived by grep).

  The transaction owner consumes that typed code. Its answer adds `outcome:
  UNKNOWN` one-to-one for `partition_write_outcome_unknown` and classifies no
  causes itself. Answers that stay refusals are those proving that nothing
  entered the log, plus one committed non-mutating disposition:
  - `partition_write_not_leader` (unproposed);
  - `partition_write_consensus_recovery_required` and
    `partition_write_consensus_session_open` (unproposed leadership refusals,
    `partition-write-kernel.js:338-362`; round-5 nit N-I);
  - `partition_write_backpressure`;
  - `partition_write_commit_deadline_exceeded` (unproposed);
  - `partition_write_consensus_refused` (the core refused the proposal);
  - `partition_write_service_shutdown` (unproposed);
  - the committed, non-mutating `reserved` PREPARE answer (round-4 N4).

  This kernel fix is landable on its own (revision 5, 0.5 item 4). The ordinary-write
  defect is finding F-ANS.
- **Parked writers (X).** `applyWrite` asks the reservation
  (`SELECT 1 ... WHERE state = 'PREPARED'`) after its settled-answer check
  (`partition-service-write-metrics-base.js:693-701`) and before leadership. If
  the partition is reserved:
  - it registers the write's pending commit (`waitForCommittedWrite`, which
    starts its own `PENDING_REQUEST_TIMEOUT_MS` deadline,
    `partition-service-cdc-stream-base.js:313-347`) but does not propose;
  - it parks `{entry, phaseTimings}` in the write commit owner's reservation
    waiters.

  The decision apply schedules an afterCommit effect that re-admits every
  parked writer through the same path, bounded by the proposal queue's
  `MAX_CAPACITY` of 1000 and its backpressure (`proposal-queue-constants.js:13`;
  round-4 N14). A writer already released is never proposed: re-admission goes
  through `proposeUnlessDeferred`, whose `markProposal` refuses an entry no
  longer pending (`partition-service-raft-write-commit.js:67-71`,
  `proposal-queue.js:118-124`; W7b, round-4 N1). A parked writer still
  waiting at its deadline is released unproposed:
  `partition_write_commit_deadline_exceeded` (`proposal-queue.js:202-222`,
  `partition-write-kernel.js:79-92`), retryable (`:57-66`). A raced write that
  reached apply while reserved is `reserved_refused` (non-settling). If this
  leader proposed it, the proposer re-parks it under the same entryId;
  otherwise it is answered `partition_write_reserved`, retryable. A re-park
  puts a second log entry under the same entryId; the replay cursor tells
  them apart by the outcome row's recorded index (8.1, RC2). Witnesses: W7a,
  W7b.
- **Non-leader**: `partition_write_not_leader`, nothing proposed (W11c).
- **PREPARING**: session writes are refused `preparing` (W11d).
- **Demotion**: the session-discard hook at
  `partition-service-raft-lifecycle-wiring.js:79` drops volatile sessions
  (surface to create, N10).
- **Cost on the healthy path**: per 2PC participant, 2 awaited rounds plus the
  coordinator's two insert-once writes (transaction row and decision).

## 8. Mirror, checkpoint, CDC, reservation bound (decisions L and M)

### 8.1 Split/merge mirror (limit L1)

Mirroring is a proposer-side effect of an acknowledged ordinary write:
`executePartitionRaftWriteCommit` builds the side-effect plan
(`partition-service-raft-write-commit.js:203-220`), and
`applyWriteSideEffectPlan` calls `handleSplitReplicationAfterWrite` and, while a
merge is active, `handleMergeReplicationAfterWrite`
(`partition-service-write-metrics-base.js:751-762`). `applyCommittedEntry`
forwards nothing. The durable replay cursor re-sends every committed write-type
entry after the watermark, whatever its outcome
(`partition-mirror-replay-cursor.js:89-128`).

Transactions are not mirrored in Leg A, and are not mirrored today
(`transaction-base.js:707-796`). Leg A adds three things:

1. **An admission fence (a hint, R10).** BEGIN and PREPARE are refused
   `participant_transaction_topology_transition_active` while a split/merge
   handle or durable transition row names the partition (lookup shaped like `findDurableMirrorTransitionForService`,
   `partition-mirror-replay-cursor.js:143-163`).
2. **APPLIED-only replay, bound to the entry's own index.** The replay cursor
   mirrors an entry only if its `entry:` outcome row is APPLIED and records
   that entry's log index. The outcome row stores `index`
   (`partition-service-entry-apply-base.js:1040-1046`). The index binding
   matters because a re-parked write commits a second entry under the same
   entryId (7), and an APPLIED-only cursor keyed by entryId alone would mirror
   the earlier refused entry too (round-5 nit N-J). RC1 (red on this head through the existing
   mechanism, finding F-MIR): a STATEMENT_FAILED source entry `dup-a` is
   mirrored today. RC2 (new-surface red): a `reserved_refused` write and the
   transaction commands are not mirrored; after the decision an applied write
   and then the write re-delivered under the same entryId commit, and the
   cursor mirrors `['insert-c', 'reserved-r']` (revision 7, N6-5: a cursor that
   de-duplicates by entryId would mirror the earlier refused entry first). Both run over a real rs-raft log in
   `partition-transaction-replay-cursor-v4.test.js`.
3. **Unverified mirror-sender behaviour.** A mirror delivery onto a reserved
   partition is refused non-settling. Whether the mirror sender handles that
   correctly is unverified: it throws on any failure
   (`partition-split-routing.js:241-245`).

A PREPARE committed before a split, then committed during it, applies on the
source and not on the target. Closing that is Leg B's barrier.

### 8.2 Checkpoint (rs-raft path, truthfully)

rs-raft partitions own no checkpoint today: the leader cadence answers
`COMMITTED_LOG_UNSUPPORTED` (`partition-snapshot-cadence.js:8-18`, `:55-71`);
catch-up creation calls `createSqliteStateMachineCheckpoint` without a group id
(`snapshot-catchup.js:210-215`), whose legacy copy refuses an rs-raft database
(`snapshot-checkpoint-store.js:311-315`). The rs-raft copy path
(`:295-309`) is reached only with `raftRsGroupId` (message-group callers) and
its scrub drops every table but `raft_rs_peer_identity` (`:339-357`). The
legacy `hasPendingPreparedTransactions` (`:208-227`) runs only inside the
legacy copy (`:323-326`) and is not on any rs-raft path.

Revision 3: PREPARED rows are application state in `_participant_transactions`,
written in the apply transaction. A partition image taken at applied index N
(when SN1 builds one) contains exactly the rows applied at or below N, which
is consistent with the log suffix above N, so no prepared gate is needed. The
SN1 owner must keep `_participant_transactions` and
`_partition_statement_outcomes` in the partition image (the message-group
scrub shape would drop them). Leg A leaves the legacy gate and its legacy-path
tests untouched; deleting them with the legacy path is finding F-CKPT for the
snapshot owner. `reconstructPreparedState` and its leader-activation call
(`core-base.js:593-604`) are deleted: nothing is reconstructed, the row is
read. W12c restarts over the same file and finds PREPARED with its
reservation.

The partition image must also carry `_partition_write_generation`. This
obligation on the snapshot owner (SN1) is finding F-SNAP: no falsifier exists
until that owner builds a partition image. A checkpoint
at index N then holds `g` exactly as applied at N, so a replica installed from
it continues the same monotonic sequence.

### 8.3 CDC: the durable obligation of receipt 8 (owner decision)

Receipt 8 stays sealed and stays red until this obligation exists. The owner
record assigns it. The obligation is crash-surviving CDC, not a promise of
globally exactly-once transport.

**Today.** v3 emits transaction CDC per operation from the decision's
afterCommit on the leader, as ordinary writes do
(`partition-service-entry-apply-base.js:1057-1072`), instead of from
`commitTransaction` (`transaction-base.js:746-748`). Sequence numbers are
in-process (`partition-cdc-delivery.js:215-219`) and the buffer is volatile
(`cdc-event-buffer.js`). A crash after the data commit and before emission
loses the event, for ordinary writes and transactions alike. After-commit
emission alone is insufficient.

**Owners** (local partition lane):

- the committed-entry atomic apply (`raft-rs-application-transaction-owner.js`,
  `partition-service-entry-apply-base.js`);
- `partition-cdc-generator.js`;
- `partition-service-cdc-stream-base.js`;
- `partition-cdc-delivery.js`;
- coordinated with the retention and snapshot owners.

The mirror replay cursor is not automatically this owner. Query owns
coordinator decision recovery.

**The obligation to specify before receipt 8 can be green:**

1. **One recoverable durable obligation, written in the same application
   transaction as the data change it describes.** It is recorded by the
   committed-entry atomic apply, alongside the rows, the per-operation outcomes
   and the applied index.
2. **Stable event identity.** Each event is identified by its committed entry
   and its operation ordinal (`txop:` for transaction operations, `entry:` for
   ordinary writes), so a redelivered event carries the same identity.
3. **No SQL rerun to reconstruct a notification.** Recovery reads the recorded
   obligation; it never re-executes the statement.
4. **No later row version read as an old event.** The obligation holds the
   event's own payload, or an immutable reference to it, as of its commit.
5. **No truncation of an owed event.** Log compaction and retention keep every
   undelivered obligation. "Owed" is defined durably (revision 9, N8-12). Each
   obligation row carries a delivered flag, set by a committed command when
   the consumer acknowledges. Delivery progress therefore lives in the
   partition's replicated state, survives a leader change, and is the same on
   every replica. An obligation is owed until its flag is committed.
   Batching (revision 10, N9-2): the CDC delivery owner
   (`partition-cdc-delivery.js`) batches acknowledgements per committed entry,
   one replicated write per batch, never one per event. The batch size and the
   per-event cost are that owner's open item.
6. **Snapshots retain it.** A partition image carries the undelivered
   obligations (F-SNAP).
7. **Replay through the consumer de-duplication contract.** A lost delivery
   acknowledgement may cause a replay. The existing contract is
   `buildEventIdentity` (`cdc-event-buffer.js:37-43`):
   `table:operation:pk:timestamp`. The stable identity maps into it as
   follows: the event's `timestamp` is the committed entry's own stamp (part
   of the command bytes), and the pair `entry:<entryId>` or
   `txop:<participantId>:<ordinal>` is carried alongside. A replayed event
   therefore yields the same `buildEventIdentity` string.

No seal supersession is selected.

### 8.4 Reservation lifetime (decision M; L3 accepted by the owner)

The owner accepts conservative reservation for Leg A as an
availability/concurrency trade-off, **not an R12 exception**. Blocking is
accepted while the recovery owner or the required quorum is unavailable.

- **A PREPARED row is an obligation, not a lease.**
  - The participant never calls the coordinator, and the hold sweep only
    reports.
  - A PREPARED row is released only by an applied decision. It never expires
    into permission (W12d).
- **A deadline bounds a caller's wait, never the obligation.** Writers on a
  reserved partition are parked and released at their own 30 s deadline with
  `partition_write_commit_deadline_exceeded`, retryable. That release ends a
  wait; it does not release the reservation. Repeated requests can starve
  under a long reservation; this is accepted.
- **The discovery and re-entry obligation is retained.**
  - Every engine loads every `sql_transactions` row
    (`sql-query-engine-transaction-recovery-methods.js:151-159`) and sweeps
    every 1000 ms (`distributed-transaction-coordinator-constants.js:46`).
  - The existing tracked startup recovery handoff is preserved.
- **An eligible recovering engine returns and releases a PREPARED row by the
  authoritative decision.**
  - COMMITTING never becomes FAILED (S3).
  - Recovery completes a FAILED row that has a decision (S4a).
  - Concurrent recovery converges on the single durable decision (S8).
  - The participant applies only a bound decision (W9), and keeps PREPARED
    until then (W12d).
- **No bound is promised.** The 60 s transaction budget plus one sweep plus
  one participant round is the expected release time while some engine runs
  recovery with the control plane readable. It is not a guarantee. The
  removal drain (`transaction-base.js:88-96`) waits on PREPARED rows the same
  way.
- Round 3's two holes stay closed by the agreed seam: COMMITTING never becomes
  FAILED (U), and the transaction row is never silently unpersisted (S4b; the
  seed engine through S4c option 1).

## 9. Supersession inventory (run on this head)

### 9.1 Runs

Revision 3's runs (on cfce28ad0/045c9130e; no src change and no change to an inventoried test file since) are
kept below; the four rows marked v4 were run for this revision on 0643090d7.

`npm run -s test:file -- <file>` one file at a time (thermal ok). Assertion
counts are the runner's.

| File | Exit | Assertions |
| --- | --- | --- |
| test/convergence/dt6-ledger-leader-durability-fitness.test.js | 0 | 45 |
| test/convergence/dt6-zombie-transaction-lifecycle.test.js | 0 | 30 |
| test/partition/partition-runtime-reconstruction-leadership.test.js | 0 | 21 |
| test/transaction/session-transaction-isolation.test.js | 0 | 3 |
| test/transaction/single-partition-acid.property.test.js | 0 | 8 |
| test/transaction/transaction-durability-raft.property.test.js | 0 | 10 |
| test/integration/sql-workflow.integration.test.js | 0 | 71 |
| test/partition/partition-transaction.property.test.js | 0 | 16 |
| test/partition/partition-service.test.js | 0 | 132 |
| test/raft/snapshot-boundary-observability.test.js | 0 | 28 |
| test/raft/snapshot-checkpoint-sqlite-payload.test.js | 0 | 33 |
| test/raft/snapshot-compaction-catchup-integration.test.js | 0 | 37 |
| test/query/distributed-transaction-coordinator.test.js | 0 | 125 |
| test/partition/committed-statement-outcome.test.js | 0 | 18 |
| test/partition/partition-write-typed-releases.test.js | 0 | 7 |
| test/partition/partition-service-role-metadata-publication.test.js | 0 | 91 |
| test/partition/partition-service-transactions-query-routing.test.js | 0 | 94 |
| test/partition/partition-service-write-commit.test.js | 0 | 91 |
| test/partition/partition-transaction-handler.test.js | 0 | 46 |
| test/query/sql-query-engine-transaction-owned-commit-mode.test.js | 0 | 22 |
| test/query/distributed-transaction-wait-bound-spent.test.js | 0 | 22 |
| test/raft/raft-rs-backend/persistence-admission.test.js | 0 | 4 |
| test/partition/partition-port-refusal-outcomes.test.js | 0 | 4 |
| test/integration/public-application-database-transaction-facade.integration.test.js | 0 | 58 |
| test/partition/partition-transaction-replicated-apply.test.js (v2 witnesses) | 1 | 5 (2 pass, 3 fail: P1, P2, P3 red as recorded) |
| v4: test/partition/durable-replay-cursor.test.js | 0 | 11 |
| v4: test/query/transaction-recovery-poison-row-attribution.test.js | 0 | 14 |
| v4: test/distributed/harness/transaction-recovery-poison-row-live-contract.test.js | 0 | 43 |
| v4: test/query/application-database.test.js | 0 | 189 |

Found by grepping `test/` for `LOCAL_STAGING`, `prepareTransaction`,
`commitTransaction`, `TRANSACTION_COMMIT`, `_transaction_outcomes`,
`resolveTransactionCommitOutcome`, `reconstructPreparedState`,
`preparedStateLostSessions`, `hasPendingPreparedTransactions`,
`beginTransaction(`, `rollbackTransaction(`, `checkWriteConflicts`,
`resolveParticipantCommitMiss`, `abortTimedOutTransaction`,
`USER_TRANSACTION_OPEN`, `inTransaction`.

### 9.2 Assertions whose meaning changes (each to be superseded explicitly)

All participant calls change signature from `(sessionId, epoch)` to an identity
object; that mechanical change is not listed per call. Listed are meaning
changes.

| Test (file:line) | Today | New meaning under revision 3 |
| --- | --- | --- |
| dt6-ledger-leader-durability-fitness:133-205 (`:141`, `:151-156`, `:170-171`) | participant BEGIN holds the connection; a sessionless write is deferred `WRITE_DEFERRED_USER_TRANSACTION_OPEN`; `db.inTransaction === true` | participant BEGIN never holds the connection; the zombie fixture must open a raw foreign `BEGIN` on `db` to keep testing the detector; a sessionless write during a session applies |
| dt6-ledger fitness :206, :298, :334, :371, :419, :541 (BEGIN at `:235`, `:305`, `:349`, `:388`, `:448`, `:561`; `:515-523`) | detector driven by a participant session | same detector, driven by a raw foreign transaction; meaning of the detector unchanged |
| dt6-zombie-transaction-lifecycle:127-170 | ACTIVE heal runs SQL `ROLLBACK`, marks `preparedStateLostSessions` | ACTIVE expiry discards a volatile session; no SQL, no PREPARE_LOST set (deleted) |
| dt6-zombie :204-255 | multi-replica leader defers the heal | nothing durable or connection-bound to heal: ACTIVE discarded on any role; PREPARED kept on every role (W12d) |
| dt6-zombie :256-278 | solo leader heals in place via ROLLBACK | as above, no ROLLBACK |
| dt6-zombie :279-305 | a sessionless write is not registered in a foreign session's operations (`activeTransactions` map) | unchanged meaning, measured on the v3 volatile session record; the default-session arm is also deleted (W5b) |
| partition-runtime-reconstruction-leadership:1091-1111 | a user session holds the connection so the held group names USER_TRANSACTION_OPEN | must open a raw foreign `BEGIN` to keep that reason reachable; a participant session can no longer produce it |
| session-transaction-isolation W1 :156-226 | session rollback after BEGIN on the connection | the session never touches the connection; W1's durable-record facts unchanged, its scenario becomes vacuous unless the foreign-transaction fixture is used |
| session-transaction-isolation W2 :228-284 | sessionless write under an open session is deferred or acked | always acked and applied (no deferral from sessions) |
| session-transaction-isolation W6 :286-355 | marker types `TRANSACTION_COMMIT`/`ROLLBACK` after the terminal SQLite statement; `_transaction_outcomes` row | no terminal SQLite statement exists; commands are `PARTICIPANT_PREPARE`/`PARTICIPANT_DECISION`; the outcome row is `_participant_transactions` |
| impact contract `partition-session-transaction-persistence-admission` (`test/shards/impact-contracts.json:565-578`) and pair `:1360-1385` | "ends its session before it proposes a marker" | superseded: no session holds a SQLite transaction; the store refusal stays as enforcement; owners/tests lists change |
| single-partition-acid Property 46 Atomicity/Consistency/Isolation/Durability (:45, :108, :162, :219) | default session absorbs sessionless writes; COMMIT without PREPARE | every write carries the identity; COMMIT requires PREPARED and a bound decision (or the chosen 1PC form) |
| transaction-durability-raft Property 48 (:79, :143 with `:184-187`, :200, :256, :329) | one marker per commit (`commitIndex + 1`), rollback after BEGIN | two committed entries per committed participant (PREPARE + decision); an unbound rollback of an ACTIVE session adds no entry; a bound rollback adds one |
| sql-workflow.integration :298-327, :329-362 | sessionless calls absorbed into the default session; "should see deletion during transaction" via a sessionless read | reads and writes must carry the identity; a sessionless read never sees staging |
| partition-transaction.property Property 1 (:128-194) | conflict by epoch order (an older epoch PREPARE conflicts with a higher-epoch commit even when it began after it) | conflict iff a committed write applied between the transaction's BEGIN and its PREPARE apply |
| Property 5 (:387-452) | CDC emitted by `commitTransaction` | CDC emitted from the decision's afterCommit on the leader, after the PREPARE and decision commands apply |
| Property 6 (:456-514) | rollback of a prepared session succeeds unbound; missing session idempotent | prepared: unbound ROLLBACK refused `decision_binding_required`; bound ROLLBACK terminalizes; missing: `durable: false` success |
| Property 10 (:314-383) | snapshot reader at epoch 200 does not see a row committed at epoch 300 | superseded (section 3.4): the reader sees committed state at read time plus its own operations; the newer row is visible and the reader's later PREPARE is refused `conflict` |
| Property 11 (:55-124) | write set tracked on leader memory | deleted with the key resolver; validation is the partition generation |
| Property 12 (:226-310) | LOCAL_STAGING, no marker until the SQLite COMMIT | PREPARE proposes `PARTICIPANT_PREPARE` and is acknowledged only after it applies (W1a) |
| Property 13 restart (:524-584) | reconstruction from the committed PREPARE log entry | no reconstruction; the PREPARED row is read after restart (W12c) |
| Property 15 (:589-663) | hold timeout releases prepared state autonomously, COMMIT answers PREPARE_LOST | PREPARED is never released by time; sweep reports only (W12d) |
| partition-service.test :365-415 | 1PC COMMIT without PREPARE is COMMITTED after restart; `never-delivered-session` -> NOT_COMMITTED; outcomes keyed by epoch | COMMIT requires PREPARED; absence -> UNKNOWN; outcomes keyed by `(transactionId, participantId)` |
| partition-service-transactions-query-routing :1199-1450 | BEGIN idempotent per session; BEGIN refused while another is prepared; removal fence drains via `isInTransaction` | idempotent per `transactionId`; refused while any PREPARED row exists; drain waits on volatile sessions and PREPARED rows |
| committed-statement-outcome F-ai :625-660 | session write admitted at staging; the commit marker carries string entryIds | admitted at staging; the PREPARE command carries them in `operationsText`; per-op outcomes under `txop:` keys |
| partition-write-typed-releases :265-277 (`withSessionHeldLeader`) | a participant session holds the leader's connection to make proposals defer | needs a raw foreign `BEGIN`; meaning of the releases unchanged |
| partition-service-write-commit :455-500 | legacy `TRANSACTION_COMMIT` outcome rolls back with applied state | legacy type is UNRECOGNISED; the same property is W2a for `PARTICIPANT_DECISION` |
| partition-service-role-metadata-publication :92 | stubs `reconstructPreparedState` | the method is deleted; the stub and its count go |
| distributed-transaction-coordinator :442-502 | recovery treats a 2PC NO_TRANSACTION commit miss as COMMITTED | must read the participant outcome (seam S2); a COMMIT on a COMMITTED row is answered COMMITTED, so the miss disappears |
| distributed-transaction-coordinator :646-673 | "one phase must not prepare" | superseded only if the query owner chooses prepare-first (11.2) |
| distributed-transaction-coordinator :767-810 | 1PC outcome read by `(sessionId, partitionId, epoch)` | by `(transactionId, participantId)`; NOT_COMMITTED only from a durable row |
| sql-query-engine-transaction-owned-commit-mode :180-200 | outcome read keyed by session/epoch | keyed by identity |
| distributed-transaction-wait-bound-spent :55-160 | `abortTimedOutTransaction` from PREPARING rolls back unbound | the rollback fanout carries a bound ROLLBACK decision inserted first (seam C) |
| public-application-database-transaction-facade :1-20, :213-225 | header says followers never run operations; F-2PC-CONCURRENT witness | header claim becomes false (supersede the comment); the concurrent-refusal witness keeps its meaning (one non-terminal transaction per partition), now with a typed `already_active` |
| snapshot-boundary-observability :224-252, snapshot-compaction-catchup :355-380 | legacy-path prepared gate on `_raft_log` | unchanged in Leg A (legacy path only); retired with the legacy path (F-CKPT) |
| partition-transaction-replicated-apply (v2) P1-P3 | legacy-shape witnesses | superseded history; kept red and unchanged; v3 file replaces them |

Added in revision 4 (V11):

| Test or contract (file:line) | Today | New meaning under revision 4 |
| --- | --- | --- |
| durable-replay-cursor :252-300 (legacy marker at `:266-271`) | a legacy `PREPARE_TRANSACTION` control entry is committed through a real lone-leader log and filtered out of the mirror replay | the legacy type fails closed as UNRECOGNISED at apply, so the fixture's control entry becomes a `PARTICIPANT_PREPARE` (RC2 shape); "control entries are not mirrored" keeps its meaning and the cursor additionally requires an APPLIED outcome row (RC1) |
| transaction-recovery-poison-row-attribution :56; poison-row live-contract :234; scenarios/transaction-recovery-poison-row-live.js :61 | fixtures name `ONE_PHASE_COMMIT` | affected only if the query owner chooses prepare-first and deletes the label (11.2): the fixtures then name the surviving mode; otherwise unchanged |
| Transaction parameters (contract change) | a session write binds Buffer/BLOB, BigInt and Date params directly on the connection (`partition-service-write-metrics-base.js:221-223`) | refused `session_write_param_unsupported` at staging; only JSON scalars survive the replicated form (3.1, W6n) |
| Nondeterministic, unknown or date/time functions and implicit keys in transactions (contract change, L7) | allowed (evaluated on the leader's connection) | refused `session_write_nondeterministic` at staging by the allow-list classifier; a committed PREPARE is applied as carried (W6n, W3c). Revision 6 widens it (AH): a read of any table but the partition's own, a virtual table or pragma, a PRAGMA or DDL statement, or an opcode off the vetted list is refused the same way, reads included |
| Multi-partition statements without an explicit transaction (contract change, L5) | statement-autocommit transactions whose concurrent writers wait behind `BEGIN IMMEDIATE` | may abort `conflict` under concurrent writes; retried as a whole statement by the engine's statement-autocommit owner within the 60 s transaction budget (3.6, W16) |
| application-database :687-725 | a failed COMMIT with `commitPointReached` true is `TRANSACTION_OUTCOME_UNKNOWN` | unchanged; seam S1 relies on it for the client answer after a COMMIT decision |

Added in revision 5 (round-4 R4-6; run on bb155b29f, each exit 0):

| Test or contract (file:line) | Assertions | Today | New meaning under revision 5 |
| --- | --- | --- | --- |
| transaction-support :107-120 | 50 | `new SQLQueryEngine({messageRouter, systemCache})` (no gateway, no CDC); `BEGIN TRANSACTION` succeeds and the row is silently unpersisted | an explicit BEGIN without a gateway is refused `TRANSACTION_STATE_PERSISTENCE_UNAVAILABLE`; the fixture must supply a gateway (or a stub with `supportsMutationSubmission`) to keep testing BEGIN |
| application-database (whole file; BEGIN through `db.transaction`) | 189 | transactions run on an engine with no gateway reference | same as above: the fixture supplies a persistence gateway; DIRECT_AUTOCOMMIT statements unchanged |
| postgres-wire-adapter.integration (BEGIN over pgwire) | 77 | BEGIN succeeds with no gateway reference | same as above |
| cross-partition-rejection.property | 8 | BEGIN on a gateway-less engine | same as above; its multi-partition statements are refused typed without a gateway |
| Seed-hydration engine (`seed-cache-hydration-phase.js:220-234`), production | n/a | revision 5 claimed that its migration owners never call `begin`/`commit`. That was wrong: it grepped the coordinator API, not the SQL `BEGIN` path (round-5 R5-2) | superseded by the revision-6 rows below: the cutover is AFFECTED |
| Writes during PREPARED (contract change) | n/a | a write behind an open session is deferred within 2 s (`USER_TRANSACTION_WRITE_DEFER_BUDGET_MS`, `partition-service-constants.js:56`) and then answered deferRetry | parked up to its own `PENDING_REQUEST_TIMEOUT_MS` (30 s, `:26`) and then answered `partition_write_commit_deadline_exceeded` (retryable); under L3 refused at every deadline for as long as the reservation lasts |
| Ordinary-write answers (contract change, AD) | see below | an environmental failure of the proposer's own committed apply, or a host failure while proposing, is answered as a failure | answered `partition_write_outcome_unknown` (W11e-ord, W11f-ord); every consumer that routes `OUTCOME_UNKNOWN` re-delivers only under the same entryId (`partition-write-kernel.js:124-127`). The assertions this rewrites are the revision-6 rows below (derivation 1) |

Added in revision 6 (round-5 R5-2, decision AI). Each row below comes from a
grep whose command is shown; every hit was read in context on 134bbc3e1.

**Derivation 1: the answers AD rewrites.** AD changes three builders: both
branches of `hostFailureProposalAnswer` and the HOST_FAILURE arm of
`buildPartitionWriteProposalRefusal` (`partition-write-kernel.js:390-414`), and
the default branch of `unansweredWriteResult`
(`partition-service-raft-write-commit.js:122-131`). The grep, over `test/` with
the TX1 files excluded:

```sh
grep -rnE "STATEMENT_ENVIRONMENT_FAILED|statement_environment_failed|CONSENSUS_HOST_FAILURE|consensus_host_failure|buildPartitionWriteProposalRefusal|hostFailureProposalAnswer|unansweredWriteResult|buildPartitionWriteFailureResult" test
```

It hits 17 lines in 5 files. A second grep over `src/` for
`CONSENSUS_HOST_FAILURE|consensus_host_failure` finds the code defined at
`partition-write-kernel.js:38` and produced only at `:397`, plus the
retryability comment at `:47-56`.

| Test or source (file:line) | Today | New meaning under AD |
| --- | --- | --- |
| committed-statement-outcome.test.js:776-790 (F-ae, real port) | the environmental failure answers `failureCode: partition_committed_statement_environment_failed`, with error text that starts with the environmental message and carries the SQLite code, and `consensus: {phase: APPLICATION, retryable: true}` | `failureCode: partition_write_outcome_unknown`, carrying the write's `entryId`; the environmental code and text move to `cause` (the SQLite code is still observable there); the consensus fields are kept |
| partition-runtime-reconstruction-leadership.test.js:355-365 (W-B6, lone leader, disk full) | error text starts with the environmental message and contains `SQLITE_FULL` | the answer is `partition_write_outcome_unknown`; the two text assertions read `cause.error` |
| same file :880-897 (F-ae, retried proposals) | every answer is `CONSENSUS_HOST_FAILURE` or `CONSENSUS_RECOVERY_REQUIRED`, at least one of each kind | every answer is `partition_write_outcome_unknown` or `CONSENSUS_RECOVERY_REQUIRED` |
| same file :1030-1040 (B's persistence failure) | `CONSENSUS_HOST_FAILURE`, phase READY_PERSISTENCE, retryable true | `partition_write_outcome_unknown` with entryId `fz-B`, consensus fields kept |
| partition-write-kernel.test.js:395-408 | `hostFailure: CONSENSUS_HOST_FAILURE` | `hostFailure: OUTCOME_UNKNOWN`, as `coreFatal` already is |
| partition-write-kernel.test.js:330-336 (`assertCodeRouting`) | `CONSENSUS_HOST_FAILURE` is neither reroutable nor retryable | the code has no producer; retired with the code, or kept as the definition of an unproduced code (owner choice, 0.7) |
| control-plane-error-classification.test.js:108-121 | a host failure while proposing is not retried by the control plane, as the answer or as an Error of its text | the host failure's answer is `partition_write_outcome_unknown`, which this classifier retries (the test's own `deadlineProposed` case, :92-94). Every router re-delivers it only under its entryId (`partition-write-kernel.js:124-127`; `control-plane-write-identity.js:176-186`, `:221`, `:266`). The case moves from "not retried" to the retryable set |
| partition-write-typed-releases.test.js:380-386 | a hand-built `CONSENSUS_HOST_FAILURE` answer is not retried by the CDC integration | mechanism unchanged; vacuous once the code has no producer, so retired with it |
| partition-write-kernel.test.js:185 | a plain failure plans no side effect | unaffected: AD does not change `buildPartitionWriteFailureResult`, only which answers reach it |
| src: partition-write-kernel.js:47-56 (comment on `RETRYABLE_WRITE_FAILURE_CODES`) | "A host failure while proposing is not among them" | superseded: a host failure is answered OUTCOME_UNKNOWN, which is among them and re-routed only under its entryId |

**Derivation 2: BEGIN/COMMIT reachable through `executeQuery`, and the engines
that cannot persist.** The greps:

```sh
grep -rnE "['\"\`]+(BEGIN|START TRANSACTION|BEGIN TRANSACTION|BEGIN IMMEDIATE|BEGIN DEFERRED|COMMIT|END TRANSACTION)['\"\` ;]" src
grep -rnE "transactionCoordinator\.(begin|commit)\(|\.beginTransaction\(" src
grep -rn "new SQLQueryEngine(" src
grep -rn "wireMigrationWorkflowOwners\|setCDCIntegrationService(" src
```

The first grep's hits fall into three groups:

- **SQL text sent to an engine** (two senders):
  - `application-database.js:30-31`, sent at `:533-540` and `:575-581` through
    the engine bound by `createBoundApplicationDatabaseRuntime(sqlQueryEngine)`
    (`entrypoint-runtime-admin-composition.js:445-446`);
  - `migration-coordinator.js:48-50`, sent by `executeCutoverTransaction`
    (`migration-coordinator-stage-methods.js:507`, `:542`, `:545`) through
    `MigrationCoordinator.executeSql` -> `this.sqlCore.executeQuery`
    (`migration-coordinator.js:352-353`).
- **Constants that are not SQL**: AST types, log messages and tags
  (`query-constants.js:31`, `:42`, `:47`, `:219-220`; `parser-constants.js:19`;
  `sql-transaction-control-grammar.js:46`, `:49`; `pgwire-result-mapper.js:79-80`;
  `pgwire-transaction-outcome.js:68`; `runtime-access-policy-owner.js:110`).
- **The partition's own connection or a file lock**:
  `partition-service-shared.js:163`, `partition-service-constants.js:109`,
  `:111`, `data-directory-process-owner.js:9`.

The second grep finds the engine's own BEGIN (`sql-query-engine.js:377`) and
the statement-autocommit open (`sql-query-engine-write-execution.js:129`).

The third grep finds three engine constructions:

| Engine | Persistence | Migration owners wired | Under AF |
| --- | --- | --- | --- |
| admin composition, `entrypoint-runtime-admin-composition.js:358` | `cdcIntegrationService: options.owner.cdcIntegrationService` (`:361`) | `:374` | unchanged while the owner holds the CDC service; the application database and pgwire BEGIN run here |
| joiner, `node-joining-publication-activation.js:630` | `setCDCIntegrationService` at `:661` | `:646` | unchanged |
| seed hydration, `seed-cache-hydration-phase.js:220-234` | none: no gateway option, no CDC. The engine is referenced only at `:220`, `:236`, `:238`, `:249`, `:264` and `:316`. Neither `setCDCIntegrationService` caller (`node-joining-publication-activation.js:661`, `startup-sql-runtime-handoff.js:138`) receives it, and `CDCIntegrationSetup` sets the service's engine, not the engine's service (`cdc-integration-setup.js:257`). Measured: `canPersistDistributedTransactionState()` is false (`sql-query-engine-transaction-recovery-methods.js:168-174`) | `:235-238` | **AFFECTED** (row below) |

Rows:

| Test or production path (file:line) | Today | New meaning under AF |
| --- | --- | --- |
| Seed-hydration migration cutover: `executeCutoverTransaction` (`migration-coordinator-stage-methods.js:495-551`, called at `:243`) on the seed engine | BEGIN succeeds; the two UPDATEs run inside it, against `tables` (`tables-p1`) and `schema_migration_partitions` (`schema_migration_partitions-p1`) (`migration-coordinator.js:112-118`; `system-table-schemas-constants.js:128`, `:166-167`); COMMIT succeeds; the `sql_transactions` row is never persisted (`sql-query-engine.js:115-117`). A live S4b instance, measured by S4c | without an owner decision, BEGIN is refused `TRANSACTION_STATE_PERSISTENCE_UNAVAILABLE` and the cutover cannot complete on that engine. Owner decision (11.1, 0.7): option 1, give the seed engine persistence; option 2', wire the migration owners only on an engine that persists. Option 2 (DIRECT) is false: two partitions inside one BEGIN |
| Seed engine, other statements: the migration owners' other SQL (system tables, each one partition `-p1`) and the per-partition ALTERs (`executePartitionSql`, `migration-coordinator-stage-methods.js:112-122`) | DIRECT single-partition | unaffected |
| Application database and pgwire BEGIN (admin-composition engine) | persists while the owner holds the CDC service | unaffected; the fixtures without a gateway are the rows above (transaction-support, application-database, postgres-wire-adapter, cross-partition-rejection) |

Reachability: the seed engine's migration coordinator is wired, and any ALTER
TABLE executed through that engine reaches the cutover. This revision found no
production caller that sends ALTER TABLE through the seed engine, and did not
prove that none exists. Option 2' is safe only if none does; option 1 is safe
either way.

Added in revision 7 (round-6 R6-1, decision AK; derived on 6d24e3b4f). The
statement-kind owner, the ordinary-path rowid rule and the apply-side ceiling
check change what ordinary writes may carry, so their inventory is derived the
same way as revision 6's:

**Derivation 3: free-form SQL reaching a partition's `executeQuery`.**

```sh
grep -rn "partition\w*\.executeQuery(\|partitionService\w*\.executeQuery(\|service\.executeQuery(" src
grep -rnE "['\"\`]+(CREATE (UNIQUE )?INDEX|DROP INDEX|DROP TABLE|CREATE TABLE|ALTER TABLE|PRAGMA|ATTACH|VACUUM|ANALYZE|REINDEX)" src
grep -rniE "\browid\b|_rowid_|\boid\b" src
```

| Caller (file:line) | What it sends | Under AK |
| --- | --- | --- |
| `index-service.js:258-270`, `:407-412`, `:622-626`, `:704-707` | `CREATE INDEX`, `DROP INDEX` as committed QUERY commands | admitted (0.5 item 1); owner decision to give them a command type |
| `handleRemoteQuery` (`partition-service-entry-apply-base.js:749-758`) | engine-routed SELECT, INSERT, UPDATE, DELETE (`sql-query-engine-statement-execution.js:497-546`); an ALTER is diverted to `MIGRATION_ALTER_TABLE` at `:740-748` | admitted; a raw QUERY message with any other head is refused (W6p) |
| `runtime-service-call-cell-handler.js:349`, `parallel-query-coordinator.js:532`, `partition-split-merge-manager-core-methods.js:434`, `:446` | reads | admitted (reads) |
| `cdc-routed-mutation-readiness.js:210`, `cdc-integration-service-local-system-table-routing.js:210` | system-table DML built by the CDC owner | admitted; no rowid alias in their builders (third grep) |
| schema-migration backfill (`migration-coordinator-stage-methods.js:626-631`, through `executePartitionSql`, `migration-coordinator.js:585`) | `UPDATE ... WHERE ... rowid > ? AND rowid <= ?` | admitted: an alias token in an UPDATE's top-level WHERE (R1) |
| schema-migration backfill paging read (`migration-coordinator-stage-methods.js:415-416`) | `SELECT rowid AS row_id ... ORDER BY rowid LIMIT ?` | admitted (a read) |
| (revision 9, R8-1) a PostgreSQL `INSERT ... ON CONFLICT (k) DO UPDATE` or `DO NOTHING`: `orReplace`/`orIgnore` (`src/query/pg/pg-translate.js:139-148`, from `sql-parser.js:475-482`), rendered `INSERT OR REPLACE INTO <t> (...)` (`query-executor-sql-command-rendering.js:455-458`, via `executeInsert`) | explicit-key upserts | admitted when every key is an explicit integer (R2). An upsert into an INTEGER PRIMARY KEY table that omits or NULLs the key can allocate, and is refused at `rowid_allocation` (a contract change, declared) |
| (revision 9) a plain SQL `INSERT OR REPLACE` (`sql-parser.js:475`) | as above | as above |
| (revision 9) split and merge snapshot backfills: multi-row `INSERT OR REPLACE INTO <table>` (`partition-split-routing.js:289-291`, `partition-service-merge-replication-methods.js:404-406`), as committed QUERY writes on the target | copied rows with their keys as bound params | admitted: copied integer keys are explicit integers |
| (revision 9) `upsertData` (`partition-service-write-metrics-base.js:338-363`, reached from `partition-service-entry-apply-base.js:511`) | an `INSERT OR REPLACE` of one row | admitted with an explicit integer key; refused at `rowid_allocation` if it omits an INTEGER PRIMARY KEY |
| (revision 10, R9-1) the PostgreSQL extended protocol: the Bind parser decodes every parameter as text (`src/runtime/pgwire-message-parsers.js:75-102`), passed unconverted through `pgwire-protocol-handler.js:619-623` and `src/query/pg/postgres-wire-adapter.js:190-231` | parameterised keys as canonical decimal strings (`2` arrives as `'2'`) | admitted as explicit integers (R2, AT); in a session, inside [-2^62, 2^62) |
| (revision 10) positive control: `test/integration/pgwire-command-tag-real-engine.integration.test.js:597-604` (`INSERT INTO expiry_rows (id, label) VALUES ($1, $2)` with `[2, 'b']` inside a transaction, on `id INTEGER PRIMARY KEY`) | must stay green at cutover | that subtest passes today; the file as a whole is red for the unrelated `:768` timeout (0.0.9, deviation 3; round 9 N9-3) |
| (revision 9) positive control: `test/integration/pgwire-command-tag-real-engine.integration.test.js:145-167` (the `ON CONFLICT (id) DO UPDATE` case on `id INTEGER PRIMARY KEY`, expecting `INSERT 0 1`) | must stay green at cutover | today the file times out before reaching that case (0.0, deviation 3); its owner restores it |

The remaining hits of the second grep are the partition's own connection at
initialization or in its apply (`partition-service-entry-apply-base.js`,
`partition-service-schema-migration-base.js`,
`partition-service-table-bootstrap.js`), other databases (the rs-raft store,
the snapshot store, `sqlite-store.js`, the WASM KV store), and AST or tag
constants. None of them reaches `executeQuery`.

| Test or contract (file:line) | Today | New meaning under revision 7 |
| --- | --- | --- |
| Statements on the query wire (contract change) | any SQL text is prepared on the shared connection, a non-SELECT is proposed, and a PRAGMA's flag is set by its `prepare` | heads outside the admitted set are refused `partition_write_statement_refused` before any prepare (W6p) |
| Committed SQL commands (contract change) | any committed SQL text runs on every replica | an unadmitted head, an assigned rowid alias, or an allocating statement at the ceiling is STATEMENT_FAILED `partition_write_statement_refused`, identically (W6p, W6r) |
| `executeQuery`'s read/write split (`partition-service-write-metrics-base.js:64-67`) | `startsWith(SELECT)`: a WITH ... SELECT read is proposed as a write | the kind owner decides; a WITH read is a read |
| Index tests that send `CREATE INDEX`/`DROP INDEX` through a partition | proposed and applied | unchanged (admitted) |
| Tests that write a rowid alias through a partition (the test grep below) | applied | refused. The grep's hits outside the TX1 files are JavaScript identifiers, a pgwire OID comment and the `last_insert_rowid` column of the outcome table (one identifier, not an alias token); none writes an alias through a partition |

The test grep for the last row:

```sh
grep -rniE "\(rowid|rowid *=|_rowid_|\boid\b" test
```

**N6-7: the seed engine as `cdcIntegrationService.sqlQueryEngine` before the
startup handoff** (`seed-cache-hydration-phase.js:246-254`;
`startup-sql-runtime-handoff.js:124-138`).

```sh
grep -rnE "cdcIntegrationService\??\.sqlQueryEngine" src
grep -rnE "transactionCoordinator\??\.(begin|commit|enlistParticipants|executeWriteStatement)\(" src
```

- The first grep finds 30 references: engine lookups for the control-plane
  gateway (`control-plane-runtime-bundle.js:35-38`), latency reads
  (`latency-measurement-service.js:480-487`), local SELECT rendering for
  runtime call cells (`runtime-service-call-cell-handler.js:281-290`), the
  failure detector (`failure-detector.js:148-149`), metadata reads, join and
  seed bootstrap wiring, and a presence check for the coordinator
  (`control-plane-setup.js:244-253`).
- **BEGIN reach: none.** The second grep finds no caller outside `src/query`,
  and the only SQL BEGIN senders are the application database (the
  admin-composition engine) and the migration cutover (derivation 2).
- **Multi-partition reach: bounded and not proven empty.** These consumers
  write only system tables, through the control-plane gateway. Every system
  table starts with one partition (`INITIAL_PARTITION_IDS`, `system-table-schemas-constants.js:127-181`).
  A write that names one row by its key is DIRECT. This revision did not
  enumerate every gateway mutation. A multi-row mutation on a system table that
  has split would be STATEMENT_AUTOCOMMIT, and would be refused under AF on the
  seed engine before the handoff. The S4c owner decision (option 1) removes
  that window as well.

Added in revision 8 (owner decisions and round 7; derived on e984cb8db).

**Derivation 4: the ONE_PHASE_COMMIT fast path (prepare-first is final).**

```sh
grep -rn "ONE_PHASE_COMMIT\|OnePhaseCommit\|onePhaseCommit" src test
grep -rniE "ONE_PHASE_COMMIT|one-phase|1PC|one phase" architecture docs
```

| Site (file:line) | Today | Under prepare-first |
| --- | --- | --- |
| `src/constants/transactions.js:13` | defines `COMMIT_MODE.ONE_PHASE_COMMIT` | deleted with the fast path; a recovered legacy row carrying it is dispositioned by the L6 precondition |
| `distributed-transaction-commit-mode.js:37` | selects ONE_PHASE_COMMIT for one participant that supports it | always TWO_PHASE_COMMIT |
| `distributed-transaction-protocol.js:305`, `:369` | ONE_PHASE_COMMIT skips PREPARING | the branch is deleted |
| `distributed-transaction-recovery.js:135`, `:141` | recovery treats a 1PC row specially | the branch is deleted, after the L6 disposition of legacy rows |
| `test/query/distributed-transaction-coordinator.test.js:666`, `:847` | expects ONE_PHASE_COMMIT for one participant, and a 1PC recovery row | superseded: expects prepare-first (S7) |
| `test/query/sql-query-engine-transaction-owned-commit-mode.test.js:116` | expects ONE_PHASE_COMMIT | superseded: TWO_PHASE_COMMIT |
| `test/query/transaction-recovery-poison-row-attribution.test.js:50-65`, `:127-144`; `test/distributed/harness/transaction-recovery-poison-row-live-contract.test.js:234`; `test/distributed/scenarios/transaction-recovery-poison-row-live.js:7`, `:61`, `:316`, `:353` | fixtures name ONE_PHASE_COMMIT | the fixtures name TWO_PHASE_COMMIT; the poison-row behaviour they witness is unchanged |
| `architecture/postgres-wire.md:259`, `:273` | "One participant uses 1PC ..."; "1PC replay" | rewritten for prepare-first |
| `architecture/images-distributed-public-seam.md:102` | "one-phase commit for" one coordinator | rewritten |
| `architecture/overview.md:201`; `architecture/process-replication.md:351` | "1PC/2PC phase transitions"; "1PC/2PC phases" | rewritten: prepare-first two-phase only |
| (revision 9, N8-5) `executeOnePhaseCommitStage` (`distributed-transaction-protocol.js:370`, `:426`; `distributed-transaction-coordinator.js:49`, `:705-706`) | the 1PC stage | deleted with the fast path |
| (revision 9) the `onePhaseCommitSupported` capability (`distributed-transaction-commit-mode.js:26`, `:36`, `:48`, `:64`; `distributed-transaction-coordinator.js:494-495`) | lets one participant select 1PC | deleted |
| (revision 9) `test/query/transaction-owned-commit-mode-guard.test.js:55` | asserts that `resolveParticipantCommitOutcome` stays in `protocol.js` | re-checked against S2: after prepare-first, the function serves the NO_TRANSACTION commit miss, which S2 requires to read the participant outcome. The guard stays true and its meaning moves to the 2PC miss path |
| `docs/development/adversarial-risk-review-2026-10-10.md:151`, `:193` | "Leg A must cover one-phase transactions"; "one-phase replay" | historical review: kept, with a note that prepare-first covers single-participant transactions |

**The kind owner's additional prepare sites (R7-2, derivation 3 extended).**

```sh
grep -rn "executeLocalQuery(" src
grep -rn "\.db\.prepare(" src/cdc
```

| Caller (file:line) | What it sends | Under revision 8 |
| --- | --- | --- |
| `cdc-bootstrap-direct-sql.js:95-100`, `:118-163` | system-table DML on every local initialized replica, outside the log, when the raft lane fails | through the statement-admission owner (heads, R1-R3); the out-of-log write itself is finding F-BOOT |
| `cdc-integration-service-local-system-table-routing.js:199-207` | reads through `executeLocalQuery`, else a raw `db.prepare` | through the owner; the raw fallback is replaced |
| `seed-partitions-phase.js:755` | a SELECT of `config` | admitted (a read) |
| `executeLocalQuery` with a PRAGMA (W6p) | runs it today, unreplicated | refused, `statement_kind` |

**Retirement map for the revision-2 file (owner decision).** At TX1 cutover, the
runnable file `test/partition/partition-transaction-replicated-apply.test.js`
is retired explicitly. Its original bytes stay in Git (last changed by
a9d45cf50), and its red evidence stays in `evidence/red-p1p2-original-1bd392159.tap`
and `evidence/red-p1p2p3-v2-first-run.tap`. A retirement entry is appended to
the quest log at that commit. Each test maps to stronger live witnesses:

| Revision-2 test | Replaced by |
| --- | --- |
| P1: a pending commit exposes no row and resolves only after its marker is applied | W1a (PREPARE acknowledged only after its committed command applies; no staged row visible), W5a (no SQLite transaction during ACTIVE) |
| P2: the committed `TRANSACTION_COMMIT` applies its operations, outcome and applied index on a replica that staged nothing | W1b (a replica that staged nothing reaches PREPARED, then COMMITTED), W2a, W2b (one application transaction) |
| P3: a failing second statement applies nothing and records a typed outcome | W3a (a PREPARE whose operation fails is REFUSED identically and never applies) |
| control: an ordinary committed write applies exactly once and advances the applied index | the sibling file's first control (unchanged) |
| control: replaying a committed transaction marker applies nothing twice | W9 (revision 9: the same bound COMMIT re-applied leaves rows 1 and one `txop:` outcome; a later bound ROLLBACK cannot reverse it), W12e (operation outcomes never collide with entry keys), and the real A4 |

All four current files are inventoried (10.1). No still-valid unresolved red is
skipped: every v3, seam and sibling red stays a gate.

Unaffected after reading: `persistence-admission.test.js` (uses raw `BEGIN`,
meaning unchanged), `partition-port-refusal-outcomes.test.js`,
`snapshot-checkpoint-sqlite-payload.test.js`, `partition-transaction-handler.test.js`
(tests `src/partition/partition-transaction-handler.js`, which no `src/` module
imports: finding F-DEAD).

### 9.3 Findings recorded (R17, not absorbed)

- F-DET: nondeterministic SQL (`datetime('now')`, `random()`) in any
  replicated write is evaluated per replica; no owner pins values.
- F-MIR: the durable replay cursor mirrors STATEMENT_FAILED source entries.
- F-DIV: no owner detects logical replica divergence.
- F-CKPT: the legacy prepared gate and its tests outlive the legacy path.
- F-DEAD: `partition-transaction-handler.js` has no production importer.
- F-REC: every SQL engine loads and may drive every recovered transaction
  concurrently; only the insert-once decision makes that safe.
- F-ID: revision 3's identity premises were wrong (two engines per node,
  configured node ids); withdrawn (2.1).
- F-DET is restated in 3.3: for ordinary writes it changes stored values only;
  transactions now refuse such SQL (L7).
- F-MIR is now witnessed (RC1, red on this head).
- F-ANS (revision 5, AD): an ordinary write whose own committed apply failed
  environmentally on the leader, or whose proposal hit a host failure, is
  answered as a failure although the entry is, or may be, in the log and
  re-applies after reconstruction (`partition-service-raft-write-commit.js:122-131`,
  `partition-write-kernel.js:390-397`). Witnessed by W11e-ord and W11f-ord (red
  through the existing mechanism). It is fixed in the write kernel, landable
  on its own.
- F-SEED (revision 6, R5-2): the seed-hydration engine runs the migration
  cutover's BEGIN..COMMIT over two partitions with its `sql_transactions` row
  silently unpersisted (S4c). It is a live instance of the S4b defect, and an
  owner decision (11.1).
- F-PRAGMA (revision 6, R5-1): today a PRAGMA sent as a session statement runs
  on the leader's shared connection and stays in effect after the session (W6n
  measures `reverse_unordered_selects` = 1 on the leader afterwards). Every
  later statement on that connection, ordinary applies included, then runs
  under a setting the followers do not have.
- F-DET, restated (revision 8, AO): L11 is its consequence. TX1 does not fix
  it. The red witness `TX1 seam FDET` belongs to a separate owner: the query
  engine (freeze `NOW()`/random to literals before fanout) or the partition
  apply (refuse). It is bound to no TX1 receipt.
- F-BOOT (revision 8, R7-2): the CDC bootstrap direct fan-out writes every
  local initialized replica outside the log when the raft lane fails
  (`cdc-bootstrap-direct-sql.js:118-163`). That breaks premise item 1 for
  system tables in the earliest-bootstrap window. Owner: the CDC bootstrap
  owner. TX1 routes its statements through the statement-admission owner, but
  does not change the fan-out.
- F-ROWID (revision 7, R6-1(a)): a committed write that assigns a rowid alias
  can move a table's max rowid to 2^63-1, after which `NewRowid` is random per
  replica. Today any ordinary write may do it. W6r witnesses the refusal.
- F-PREPARE (revision 7, R6-1(b)): `executeQuery` prepares any non-SELECT text
  on the shared connection before consensus
  (`partition-service-write-metrics-base.js:64-67`), so a PRAGMA's flag is set
  on the leader whatever the proposal's fate. A committed PRAGMA or DROP TABLE
  applies on every replica. W6p witnesses both.
- F-SNAP (revision 5): the snapshot owner (SN1) must carry
  `_partition_write_generation`, `_participant_transactions` and
  `_partition_statement_outcomes` in any partition image; the message-group
  scrub shape (`snapshot-checkpoint-store.js:339-357`) would drop them.

## 10. Witness ladder and receipts

### 10.1 The witnesses on e984cb8db

Runs, each with `node --test --test-reporter=tap <file>`:

| File | Exit | Tests | Fail | Pass |
| --- | --- | --- | --- | --- |
| participant file | 1 | 37 | 37 | 0 |
| seam file | 1 | 14 | 14 | 0 |
| replay-cursor sibling | 1 | 11 | 7 | 4 (controls) |

The output is in `evidence/red-v8-first-run.tap` (sha256 5c46765cfbabbec1...);
the file hashes are in its header. A second run of each file gave identical
verdicts. Each red names its first
differing facts.

| Witness | Red on this head because (actual) |
| --- | --- |
| W1a | no `PARTICIPANT_PREPARE` proposed; PREPARE settled at once (LOCAL_STAGING); staged row visible (1) |
| W1b, W2a, W3a, W3b, W4, W9, W10b, W12a, W12c, W12e | revision-6 commands fail as `partition_committed_command_unrecognised`; outcome reads answer NOT_COMMITTED with no state |
| W2b | UNRECOGNISED; probe `[]` (expects `[{rows:1, state:'COMMITTED', txop:1, generation:1}]`) |
| W2c (new) | the warm-up write applies; the probed write's apply fails `SQLITE_ERROR` because the probe reads the absent `_partition_write_generation` (new surface); expects `[{rows:1, generation:2}]` |
| W3c (rewritten) | UNRECOGNISED on both replicas; expects COMMITTED with value `2020-01-01 00:00:00` on both (applied as carried) |
| W17 (extended) | UNRECOGNISED for T1's PREPARE, all four control commands (the foreign TOMBSTONE, the foreign COMMIT for an absent transaction, the foreign and the same-identity `digest_invalid` PREPAREs) and T1's COMMIT; generations `[null, null, null]`; T1 is not PREPARED, `digestKept` false, applied advance 0; expects `controls` all null, generations `[0, 0, 1]`, T1 PREPARED with its digest after the controls and COMMITTED after the decision, the absent transaction UNKNOWN/ABSENT, on both replicas |
| W18 (new) | the PREPARE and the decision are UNRECOGNISED; the ALTER applies while T1 should be reserved (columns `id, value, extra`, statement settled, generation null); expects the old columns, an unsettled statement and generation 0 while reserved, then COMMITTED, then the redelivered ALTER applied with generation 2 |
| W19 (new) | the zero-operation PREPARE and COMMIT are UNRECOGNISED; generations `[null, null]`; expects COMMITTED and generations `[1, 1]` |
| W5a | `inTransaction` true; sessionless reader sees 1; the sessionless write fails `RAFT_RS_STORE_USER_TRANSACTION_OPEN`; `sessionSeesLaterCommit` 0 |
| W5b | the write is absorbed into the default session |
| W6 | `provisional` absent; no PREPARE proposed |
| W6n (sibling file since revision 7; layers pinned) | all 24 classifier cases and the Buffer case are staged (`failureCode` and `refusalLayer` null); the PRAGMA case left `reverse_unordered_selects` = 1 on the leader (F-PRAGMA); no PREPARE proposed. Case c4 now reaches classification (the rs-raft tables exist from port creation, R6-2) |
| W6s (sibling; seven probes) | the classifier module is absent (`module: 'absent'`, `passed`, `cases` and `admitAll` null); a BEGIN on a leader whose injected self-check fails succeeds (`success: true`, no `failureCode`) |
| W6p (revision 8: every path, 10 wire cases plus `executeLocalQuery`) | 9 wire cases are proposed and stay pending (the unique-index case on `_participant_transactions` fails to compile, which is not a refusal); `executeLocalQuery` runs the PRAGMA; the flag is 1; at apply the PRAGMA and the DROP both apply on two replicas. Revision 7's reason, kept for history: |
| W6p (revision 7) | the sessionless PRAGMA and DROP are proposed and stay pending; the leader's flag is 1 and the proposals are `PRAGMA, DROP, CREATE`; at apply, both commands apply on two replicas (flag 1, table dropped, outcomes `applied`) |
| W6r (revision 8: AS alias, quoted, `oid`, `_rowid_` and qualified forms, the backfill positive half, the dry-run half) | 10 session cases stage; the alias, AS-alias, backfill and ceiling ordinary writes are all proposed (the backfill is expected; the others are red); at apply the backfill applies (expected), the ceiling insert applies (red), and the dry-run PREPARE is UNRECOGNISED (red). Revision 7's reason, kept for history: |
| W6r (revision 7) | all six session cases stage with no code; the ordinary alias insert and the ordinary insert at the ceiling are proposed (2) and pending; the session insert at the ceiling stages; at apply, the ordinary insert on a ceiling table applies on both followers (rows 1) |
| W7a | the write is proposed at once (1); the raced write applied and settled |
| W7b (extended) | proposed at once (1); the deadline answers `partition_write_outcome_unknown`; the later decision is UNRECOGNISED |
| W11a, W11b, W11e | no PREPARE proposed; immediate LOCAL_STAGING success |
| W11e-ord (new) | the proposer's own apply fails `partition_committed_statement_environment_failed`, and the answer is `{success:false}` with no `failureCode` (existing mechanism, F-ANS) |
| W11f | UNRECOGNISED PREPARE; the COMMIT answer has no `outcome` |
| W11f-ord (new) | `partition_write_consensus_host_failure` (existing mechanism, F-ANS) |
| W11c | the follower's refusal has no `failureCode` |
| W11d | the late write is proposed as an ordinary write and stays pending |
| W12b | absence answers NOT_COMMITTED |
| W12d | `inTransaction` true; the PREPARE apply is refused `USER_TRANSACTION_OPEN`; the swept session still stages |
| W13, W14 | the intervening write fails under the open session; the PREPARE succeeds |
| W15 | no PREPARE proposed |
| W16 | untyped answers (LOCAL_STAGING successes) |
| seam W10a | both coordinators mint `tx-default-1000-1` |
| seam W10c (narrowed; revision 6 adds the engine row) | collision: one attempt, BEGIN throws; other error: BEGIN throws without the insert-once option; the engine submits the `sql_transactions` row as `upsert` with coalescing key `sql-transaction:<id>` (expects `insert`, no key) |
| seam S1 | rollback `['p1','p2']`; transaction ended |
| seam S2 | COMMITTED with 0 outcome reads |
| seam S3 | FAILED; 1 re-prepare |
| seam S4a | no commit; still active |
| seam S4b (narrowed; revision 6 adds the multi-partition and DIRECT halves) | the DIRECT_AUTOCOMMIT write succeeds (the positive half holds today); the explicit BEGIN and the STATEMENT_AUTOCOMMIT open both succeed silently (expect `TRANSACTION_STATE_PERSISTENCE_UNAVAILABLE`) |
| (revision 9) W6r-b | integer-key replicas: the top-key-then-NULL insert, the conflict-target-WHERE upsert and both REPLACEs that allocate apply, with per-replica random rowids; the string-param top key fails `SQLITE_CONSTRAINT_PRIMARYKEY` today (the first statement already inserted the top key), not the typed refusal; the carried PREPARE is UNRECOGNISED; explicit-key REPLACEs apply (expected); the six session cases stage; both wire REPLACEs are proposed |
| (revision 9) W6r | the TEXT-key conflict-target-WHERE upsert is proposed, and at apply gives rowids `['5', <random>]` per replica |
| (revision 9) W6p | the direct `executeQuery` PRAGMA and the schema-declared `DROP INDEX` are proposed |
| (revision 10) W20 | the mismatched-envelope PREPARE and COMMIT and the matching PREPARE are all UNRECOGNISED (rows 0, NOT_COMMITTED); `readTransactionEnvelopeDiagnostics` is absent (diagnostics null); on the leader no PREPARE is proposed, so neither envelope is on the wire |
| (revision 10) W6r-b | additionally: the session `'9'` and `'011'` keys both stage (the second must be refused); the ordinary `'5'` REPLACE applies (expected); the wire `'10'` REPLACE is proposed (expected) |
| (revision 9, superseded by revision 10) W20 | every command is UNRECOGNISED, with reason `committed-command-unknown`, not the envelope reason or detail |
| (revision 9) W9 | the duplicate COMMIT is UNRECOGNISED (rows 0) |
| (revision 9) S4c, S4d | `phaseSafe: false`; `heldAtPublication: false` in both branches |
| W6r-b (revision 8, sibling) | on two INTEGER PRIMARY KEY replicas the top-key-then-NULL insert applies, and the allocated row's rowid differs between them (for example 1461968678065164757 and 1148980007400772355); on two TEXT-key replicas with an existing maximum of 2^63-2, both automatic insertions apply, and the second rowid is random per replica; all four session cases on the INTEGER PRIMARY KEY leader stage |
| W6s (revision 8: nine probes) | the module is absent; a failing self-check still BEGINs |
| W16 (revision 8: positive controls) | today's PREPARE answers carry no `state`, so `answersTyped` is false and both positives read `state: null` |
| W20 (new) | the foreign-envelope and the matching PREPARE are both UNRECOGNISED |
| RC2 (revision 8: both orders) | refused-first: setup `HOST_FAILURE`; applied-first: `['replayed-r', 'insert-c', 'replayed-r']` (F-MIR) |
| seam S4c (revision 8: the setter after both branches) | `phaseSafe: false`, `silentlyUnpersisted: true`; the positive half holds |
| seam S4d (new) | in both branches the seed engine does not hold the phase's CDC service and cannot persist; the migration owners are wired |
| seam FDET (new, separate owner, unbound) | the two replicas store different `hex(randomblob(8))` values |
| seam S4c (revision 7 adds the positive half and the structural check) | `{refusedTyped: false, silentlyUnpersisted: true, phaseSafe: false}`; the positive half holds today (BEGIN, COMMIT and the row submitted through a recording gateway) |
| seam S5 | the request carries no identity |
| seam S6 | no retained digest, index or term |
| seam S7 | `['commit']` |
| seam S8 | no decision recorded |
| RC1, RC2 | as in revision 4: `dup-a` mirrored; setup `HOST_FAILURE: committed-command-unknown`. RC2 now expects `['insert-c', 'reserved-r']` |
| controls 1-4 (now in the sibling) | green |

Lint and ratchets:

- `npx eslint` passes on all five touched JS files.
- The participant file is 978 lines, the sibling 465, the seam file 437 and
  the fixture 626. Duplication is
  measured in 10.4.

**The port double (R6-2) and its consumers.** `createOperationPort` now opens
the durable store over the request's database, as production does
(`raft-rs-runtime-owner.js:1652-1653`). Every test file that uses the double,
directly or through `partition-service-test-support.js`,
`message-group-service-test-support.js` or the TX1 fixture (35 files, found
with `grep -rlE "controllable-consensus-port|partition-service-test-support|message-group-service-test-support|participant-transaction-fixture|cdc-non-leader-propagation-tail|createControllablePartitionService|ControllableConsensusPort" test --include=*.test.js`),
was run once with the change:
- 30 files exit 0, with every test passing (`cdc-non-leader-propagation`: 77
  pass, 5 skipped, as before);
- the TX1 files and the revision-2 witness file
  (`partition-transaction-replicated-apply.test.js`: 2 pass, 3 fail, recorded
  history) are red by design;
- `test/query/partition-write-answer-consumers.test.js` is red: 1 of 2 fails,
  at the F-aj case. **That red predates the change.** It is flaky on the
  unmodified double: 6 of 9 baseline runs failed at the same assertion
  (`:384`, "its client is told the write applied"). With the change, 9 of 10
  runs failed, at the same assertion in all but one, which failed at `:362`
  ("setup: r2 leads"). The samples do not separate the two rates. I did not
  widen the change; this file is reported for its owner.

In revision 7, the participant witnesses' red reasons were unchanged by the
repair: the 36 `actual` blocks of that revision equalled revision 6's after
normalisation.

### 10.2 Receipts (eight sealed ids unchanged; exact counts per file)

| Receipt | Kind | Participant file | Seam file | Real file (absent) | Stays red until |
| --- | --- | --- | --- | --- | --- |
| no-speculative-visibility-before-consensus | subtest | W1a, W5a, W5b (3) | - | - | participant cutover |
| replicated-prepare-committed-and-applied-on-every-replica | shell | W1a, W1b, W12c, W11a, W11b, W11c, W11d, W11e, W15, W20 (10) | - | A1, A2, A3 (3) | cutover and A1-A3 |
| commit-applies-operations-outcome-and-applied-index-atomically | shell | W1b, W2a, W2b, W2c, W3a, W3b, W3c, W4, W6, W13, W14, W17, W18, W19 (14), plus W6n, W6s, W6p, W6r, W6r-b (5) from the sibling file under the prefix `TX1 v3` | - | A5 (1) | cutover and A5 |
| duplicate-and-conflicting-decisions-idempotent-or-refused | shell | W9, W12a, W12e, W10b (4) | W10a, W10c, S5 (3) | A4 (1) | both lanes and A4 |
| exact-participant-outcome-no-transaction-is-not-committed | shell | W12b, W1b, W11f, W11e-ord, W11f-ord (5) | S2 (1) | - | both lanes, plus the kernel fix |
| immutable-coordinator-decision-before-fanout | shell | - | S1, S4b, S4c, S4d, S6, S7, S8 (7) | M1 (1), in `test/integration/seed-migration-cutover-persisted.integration.test.js` (absent) | query lane, the seed setter and M1 |
| no-rollback-after-commit-decision-and-no-prepared-erasure | shell | W9, W12d, W17 (3) | S1, S3, S4a (3) | - | both lanes |
| recovery-and-cdc-survive-deadline-and-crash | absent | - | - | - | a CDC cursor/retention owner, or a seal supersession |

**Shell receipts.** For each file, the receipt runs `out=$(env -u
NODE_TEST_CONTEXT node --test-reporter=tap --test-name-pattern='^<prefix>
(<names>): .*$' <file> 2>&1)`. It then requires the lines `# tests N`,
`# fail 0`, `# skipped 0` and `# todo 0`. Parts are chained with `&&`. The
prefixes are:

- `TX1 v3` for the participant file;
- `TX1 seam` for the seam file;
- `TX1` for the real file, so the patterns read `^TX1 (A1|A2|A3): .*$` etc.

Each named A test must exist and pass, so a missing file or a missing name
fails. That binds which tests run, not what they prove: round 5 measured that
a file holding the five names with trivial bodies passes the real halves
(nit N-F). The content of A1-A5 therefore rests on independent verification
of that file when it lands. Every subset was counted on this head and selects
exactly its declared number (3/10/14+5/4+3/5+1/7/3+3), all failing; the
M1 half fails with `Cannot find module`. **These counts are current
inventories, not seal thresholds** (owner decision): the exact-selection checks
and the eight behavioural receipt ids are what binds. Not bound to any receipt:
W7a, W7b, W16, RC1, RC2, the four controls, and the separate owner's FDET. The exact-count snippet was validated against the green
controls in revision 4: 4 passes, 3 fails.

**The real three-replica witnesses (decision AE).** They are named now in
`test/raft/raft-rs-backend/transaction-leg-a-three-replica.test.js`, which is
still absent:

| Test name | Covers |
| --- | --- |
| `TX1 A1: a PREPARE on a three-replica rs-raft group is PREPARED with the same identity and digest on every replica` | PREPARE replication |
| `TX1 A2: after a leader change following PREPARE the new leader applies the COMMIT and the rows appear exactly once on every replica` | leader change |
| `TX1 A3: a replica restarted after PREPARE reaches the decided terminal state for both a COMMIT and a ROLLBACK decision` | restart |
| `TX1 A4: replayed COMMIT and ROLLBACK deliveries apply nothing twice, emit no duplicate CDC and never reverse the outcome` | duplicate decisions |
| `TX1 A5: a crash and restart after the PREPARE commit, after the coordinator decision and during decision fanout reach one terminal state on every replica` | crash boundaries |

**Producer and receipt file.**

- `node scripts/quest-evidence/replicated-transaction-decision-and-apply.js
  --output <scratch>` exits 1, with 0/7 passing.
- `testFileDigests` record the participant file and the seam file. The fixture
  and the sibling are not recorded, so a fixture change does not stale the
  receipts. That is a harness owner limit (round-4 N2;
  `scripts/quest-evidence/harness-runtime.js:21-33`).
- The tracked `evidence/receipt.json` is regenerated by the lead at commit;
  f9bcfe493 did so for revision 4.
- Not bound to any sealed receipt, held only by the landing gate (round-4
  N13): W7a, W7b, W16, RC1, RC2 and the four controls.

### 10.3 Not expressible yet

- A transaction commit reaching a split target, and the mirror sender's handling
  of a reserved refusal. Both are Leg B. They stay red; the sender's behaviour
  is unverified.
- CDC exactly-once across a crash after the data commit. No durable cursor owner
  exists.
- PR100 A1-A5 on real rs-raft. They are named and bound (10.2).

### 10.4 Duplication

- `npm run -s test:duplication` exits 1 at the same counts as before this
  revision: 698/697 groups and 26410/26369 lines. That red predates this
  revision.
- All four TX1 files are scanned, with 0 clone groups each: the participant
  file (983 lines in revision 9, within jscpd's 1000-line cap), the seam file, the sibling
  and the fixture.

## 11. What remains for the query owner; the single cutover change set

### 11.1 Seam items: AGREED (owner record; falsifiers in the seam file)

Every item below is agreed by the cloud/query owner under the exact choices and
qualifications of `owner-decisions-2026-10-10.md`. Where the earlier seam text
disagrees with that record, the record controls.

| Item | Agreed obligation (summary) | Falsifier |
| --- | --- | --- |
| A | canonical transaction and participant identity, mode and applicable epoch/digest on every request and response, session QUERY included; delivery keys bound to the exact transaction and operation | S5 |
| B/S | a random 128-bit id; the initial `sql_transactions` row inserted once through the canonical gateway, without a coalescing key, before fanout; re-mint only on a confirmed id primary-key collision; uncertain insertion resolved by exact durable identity and content | W10a, W10c |
| C, C' | one insert-once immutable decision; all positive PREPARE evidence retained before COMMIT; a bound ROLLBACK persisted before its fanout, a concurrent winner read and followed; after a durable COMMIT, timeouts yield an in-doubt answer and forward recovery, never rollback | S1, S8 |
| D, E | exact PREPARE digest/index/term retained before deciding; exact durable terminal outcomes read; absence or PREPARED is UNKNOWN | S2, S6 |
| F | prepare-first for one participant too; the ONE_PHASE_COMMIT fast path retired (11.2, derivation 4) | S7 |
| G, U | concurrent recovering engines converge on the single durable decision; COMMITTING never becomes FAILED or re-prepared; recovery finishes legacy FAILED rows that have a decision | S3, S4a, S8 |
| S4b | explicit BEGIN and multi-partition statement BEGIN require persistence before participant work; DIRECT_AUTOCOMMIT preserved | S4b |
| S4c | option 1: `setCDCIntegrationService` on the seed SQL engine after CDC creation or upgrade and before migration execution or publication, through the existing setter; no `autoStartDistributedTransactionRecovery` flip; the refusal case kept | S4c (refusal case, positive half, the setter after both branches), S4d (both construction branches through the real phase), M1 (a persisted two-participant migration through the production composition; named, file absent) |
| V | the whole statement-autocommit attempt retried only after a definitive conflict or noncommitment and any required abort disposition; one end-to-end budget; bounded attempts and backoff; no retry from UNKNOWN or after COMMIT; explicit transactions return the typed conflict | W16 (measurement and the two positive controls) plus query-owned retry and recovery witnesses |
| T/AD | may-have-committed outcomes are UNKNOWN with the cause retained; definitive pre-admission refusals stay distinguishable; redelivery keeps the entry identity; AD may land on its own with its own acceptance and verification, and does not close TX1 | W11e, W11f, W11e-ord, W11f-ord |
| H | the coupled coordinator/participant interaction and its discriminating witnesses registered through the existing impact-contract owner (`test/shards/impact-contracts.json`); generated metadata updated through its producers; no second protocol, coordinator or retry framework | gate |

**Trust boundary (owner record; 2.4).** Decision records are authoritative
through the trusted coordinator route. A self-computed digest establishes
content identity, not authentication. The committed apply does no second
decision lookup.

### 11.2 Single-participant transactions: prepare-first (FINAL)

Every coordinator-managed transaction prepares before its immutable COMMIT
decision, a single participant included. The ONE_PHASE_COMMIT fast path, and
its incompatible assertions and documents, are retired. Derivation 4 (9.2)
inventories every site. DIRECT_AUTOCOMMIT stays the separate ordinary-write
path. Falsifier: S7.

### 11.3 The cutover change set and the landing gate

**Participant lane:**
- the files listed in revision 4, section 11.3;
- `src/partition/partition-statement-admission.js`: the statement-kind owner,
  the rowid rules R1-R3 and the post-statement ceiling;
- `src/partition/partition-transaction-determinism.js`: the session
  classifier and the self-check;
- their calls from `executeQuery`, `executeLocalQuery`, the CDC bootstrap
  direct path, `executeSystemTableRead` and the committed SQL apply;
- the execution envelope on transaction commands;
- the construction option `transactionDeterminismSelfCheck`.

The AD mapping in the write kernel (`partition-write-kernel.js`,
`partition-service-raft-write-commit.js`) may land earlier on its own (0.1).

**Query lane:** the agreed seam items (11.1).

**Seed and CDC (local):**
- the seed engine's setter call (S4c option 1);
- the receipt-8 durable obligation (8.3).

**Landing gate:** TX1 stays OPEN until, on the exact candidate:
1. every sealed receipt is green; no receipt is exempted for being "red by
   design";
2. the superseded tests (9.2, all revisions' rows) are rewritten or retired
   through the retirement map;
3. the shard census and the generated metadata are regenerated through their
   producers;
4. the source is independently verified;
5. the real three-replica A1-A5 and the persisted-migration M1 pass.

**Upgrade precondition (L6):**
- no in-flight transaction at cutover;
- the disposition of retained legacy protocol work and log entries is proven,
  and no old committed obligation is discarded;
- every partition table's max rowid is below 2^62 (the pre-cutover census);
- the mixed-version disposition window of the apply-side checks (3.3, N7-7) is
  closed by the drain;
- mixed-version safety is never assumed.

**Limits:**

- L1: no transaction mirroring.
- L2: CDC is not durable until the receipt-8 obligation (8.3) exists.
- L3: **accepted** (owner): the reservation lasts until the authoritative
  decision is applied, however long recovery or quorum is unavailable. A
  deadline bounds a caller's wait, not the obligation (8.4).
- L4: local divergence of a single replica's storage. Allow-listed function
  semantics across SQLite builds are L10.
- L5: **accepted** (owner): partition-granular conflicts, as an
  availability/concurrency trade-off, not an R12 exception. Finer granularity
  is a measured future choice.
- L6: the upgrade precondition above.
- L7: no date/time, random or unknown functions; no implicit keys, and on
  INTEGER PRIMARY KEY tables no key outside an explicit in-range integer; no
  non-JSON params; no table but the partition's own; no virtual table or
  pragma; no opcode outside the supported population. Declared false refusals
  routed to the classifier owner: `NotFound` (a correlated IN) and `Filter`
  (an IN over a non-key column). Revision 10 also declares:
  - alias tokens in WITH-headed UPDATE and DELETE writes (R1 refuses them;
    conservative, no consumer; N9-1);
  - non-canonical string keys (leading zeros, whitespace, `+`, exponent) on
    INTEGER PRIMARY KEY tables in transactions (R2).
- L8: the decision binding is self-certifying; authority comes from the trusted
  coordinator route (2.4).
- L9: three order-dependent shapes are refused in session writes (3.3); the
  admitted order-sensitive shapes are listed there.
- L10 (revision 10, AU): replicas on different SQLite builds compute the same
  command bytes under each build's semantics. For the supported SQL population
  that is expected to be identical, but nothing in Leg A proves it across
  builds. This is the same class as every ordinary write today.
  - Transaction commands record each disagreement as a typed diagnostic. They
    apply as carried, so no replica stalls in either upgrade direction.
  - The release owner keeps transaction commands out of the mixed-build window
    for envelope-changing releases (the L6 drain, then no admission until
    every replica reports the new build).
  - If that obligation is not met, a transaction applied during the window can
    split PREPARED/REFUSED on a build difference, exactly as an ordinary write
    can diverge today. The diagnostic is the evidence.
- L11 (new, AO; wording per N8-9): ordinary writes that store **per-replica
  values** can make replicas' rows differ (F-DET). The values can come from
  nondeterministic functions (reachable through `NOW()`), from connection
  state (`changes()`, `last_insert_rowid()`, `sqlite_version()`), from
  `pragma_*()`, or from reads of replica-local tables (`_raft_rs_*`). The
  ordinary path has no function, opcode or root-page layer. K is conditional on
  their absence: a later session PREPARE or COMMIT that reads or constrains
  such rows can split PREPARED/REFUSED, or answer `not_prepared` on a follower
  after a global COMMIT. TX1 does not fix ordinary-write nondeterminism. The
  owner chooses one of:
  - the query engine freezes `NOW()`/random to literals before fanout;
  - the partition apply refuses them;
  - the exposure is accepted as stated.

  The seam file's FDET witness is red until one of the first two lands.
