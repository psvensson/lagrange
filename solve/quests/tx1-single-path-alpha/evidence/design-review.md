# TX1 single-path deletion: independent design vet

Verdict: **APPROVE the bounded design**, not implementation, landing, parent
TX1 receipt closure, integrated crash/recovery, or release certification.

Reviewed production baseline: `e6d43bc1acb128a2b83ac89c77a3ec400e7edb1f` in
`/mnt/data/peter/projects/.worktrees/rs-raft-alpha-single-path-20261013`.
Reviewed draft: `solve/quests/tx1-single-path-alpha/design.md`, SHA-256
`cfcb44237c9a87593dea8aa77a6c442b56e5b5685a50591f0804a12c64800d29`.
Reviewed unsealed Quest metadata: SHA-256
`3fe5224dabfecf9ea949071522d403a64e17f3afaf6c07e6ca031b99a0fe3608`.
Reviewed additive test: `test/partition/partition-tx1-single-path-alpha.test.js`,
SHA-256 `ca852049572dd1fa638872ea0ee8d24d869a10af7c0e47564bf19fbba1064ced`.

This reviewer read AGENTS, rules, router, Quest subagent instructions, all seven
applicable sealed templates, and existing production implementations before
reaching the verdict. No production edits, commits, pushes, or test executions
were performed by this reviewer. Root separately reports four behavioral reds
on the unchanged baseline; that execution is root's evidence and must remain
bound to its own retained run artifacts. No elapsed runtime alone is called a
spent timeout.

## Resolved design findings

All findings from this category-complete round are enumerated here; the
approved amended design incorporates the required ownership corrections.

1. **Complete engine deletion, not wire-only.** The fallback at
   `src/partition/partition-service-entry-apply-base.js:414-477` is only one
   entry into the local SQLite engine. Ordinary query interception remains at
   `src/partition/partition-service-write-metrics-base.js:69-143,229-283` and
   the old methods/maps/reconstruction/expiry/outcomes live in
   `src/partition/partition-service-transaction-base.js:106-176,356-478,561-1020`.
   Deleting the entire obsolete engine, standalone duplicate, aliases,
   markers and consumers is APPROVE.
2. **Release shape is a required dependency.**
   `src/partition/partition-participant-release-facts.js:46-69` requires
   integer legacy map sizes; deleting the maps without changing this contract
   makes current release facts UNAVAILABLE. Remove the obsolete fields and
   update its consumers/witnesses atomically. Never substitute zero defaults.
3. **Current activation and cadence survive.** Mirror resumption is nested
   under obsolete reconstruction at
   `src/partition/partition-service-core-base.js:597-610`. Current hold,
   durability-fitness and snapshot cadence share the timer at
   `src/partition/partition-service-transaction-base.js:514-552`. Preserve
   their ordering, interval, injected clock and lifecycle; delete only old
   reconstruction/heal. Move the existing SOLO helper to its present consumer.
4. **Routing collision remains a current safety boundary.**
   `src/partition/partition-participant-transaction-legacy-fence.js:101-106,163-174`
   refuses routing-only QUERY that names current volatile or PREPARED custody.
   Move that decision to the current session/store owner; never infer identity
   from sessionId. Unrelated routing-only QUERY remains ordinary. Move the
   existing current activity composition at `:67-75` once and consume it from
   BEGIN/removal, instead of retaining a legacy alias or duplicate predicates.
5. **Malformed and valid QUERY ordering differ deliberately.**
   `src/partition/partition-service-entry-apply-base.js:712-750` applies epoch
   and leadership gates before current staging. The canonical owner must
   refuse malformed/hostile identity and collisions before those gates, while
   complete valid current identity retains the existing gates and execution
   position. Moving the whole staging handler earlier would weaken current
   behavior and is not approved.
6. **Startup outcome registration cannot remain dangling.**
   `src/partition/partition-service-raft-init-base.js:403` invokes a method of
   the deleted engine. Remove this call, old outcome DDL/read/upsert vocabulary
   and orphan consumers together. This mechanical dependency does not authorize
   lifecycle, migration, or current snapshot redesign.
7. **The original proposed SQLite-BEGIN red was inaccurate.** A natural
   current lifetime starts CLOSED at
   `src/partition/partition-participant-transaction-pause.js:16-38`;
   `src/partition/partition-participant-transaction-legacy-fence.js:133-147`
   refuses legacy BEGIN before origin, and origin subsequently fences it.
   Use wrong typed-refusal and partial-identity QUERY execution as the honest
   baseline mechanisms. Do not manufacture historical admitted work or bypass
   the release owner merely to obtain a stronger red.

## Three scope decisions

- APPROVE current partition wire `BEGIN`/`PREPARE` only. Production wire uses
  them (`src/query/sql-query-engine-participant-wire.js:104-113` and
  `src/query/query-constants.js:44-47`); the fixture's old partition aliases
  (`test/test-helpers/participant-transaction-fixture.js:486-491`) can be
  repointed. Retain legitimate SQL AST/public-result homonyms, attributed to
  their separate query/parser owner.
- APPROVE deferring broader stamp/reopen/L6 policy cleanup. Its producer is
  not another transaction executor once the old engine is removed. Required
  release work-shape cleanup remains in this child. Every surviving historical
  surface must be listed for the next alpha unit; this child cannot claim final
  historical-surface absence.
- APPROVE mechanical coherent remote-query and leader-activation extraction
  for the existing size gate. Preserve valid-query gates, leader activation
  ordering, readiness, mirror resumption and other owner calls; copy no helper.

## Category-complete checklist

Every APPROVE below is design-level: implementation must meet the cited
contract and witness obligation on its exact bytes. It is not a claim of
newly executed green evidence.

### Admission / gating

| Item | Verdict and evidence |
| --- | --- |
| Same-state precheck/enforcement | APPROVE: reuse `identityRefusalOf` (`src/partition/partition-participant-transaction-bytes.js:86-95`) and one moved activity/collision owner; durable PREPARE apply remains authoritative (`src/partition/partition-participant-transaction-apply.js:533-549`). |
| Transient vs hard refusal | APPROVE: identity refusals are hard; retain existing deferRetry outcomes. Wire disposition already separates DEFER/UNKNOWN/REFUSED (`src/query/sql-query-engine-participant-wire.js:168-180`). |
| Existing budget | APPROVE: no budget increase/new wait; volatile hold uses configured hold bound (`src/partition/partition-participant-transaction-session.js:134-147,184-196`), in-flight PREPARE keeps its write deadline. PREPARED is released by decision, never time. |
| Reason shape | APPROVE: reuse string failureCode plus existing refusal answer (`src/partition/partition-participant-transaction-request.js:126-142`); consumer copies exact fields (`src/query/sql-query-engine-participant-wire.js:191-209`). |
| Hold release | APPROVE: session end (`src/partition/partition-participant-transaction-session.js:109-113`), decision row transition and post-commit write re-admission (`src/partition/partition-participant-transaction-apply.js:384-387,436-459`). |
| Freshness | APPROVE: evaluate current session/reservation per decision; preserve synchronous release invalidation and final generation check (`src/partition/partition-participant-transaction-pause.js:33-51,63-79`). No cached legacy map substitutes. |
| Honest blocking identity | APPROVE: safe current request snapshot and current owner answer carry partition/transaction/participant (`src/partition/partition-participant-transaction-request.js:126-142`); no invented routing-session identity. |

### Recovery / replay

| Item | Verdict and evidence |
| --- | --- |
| No stale overwrite | APPROVE: delete whole marker reconstruction (`src/partition/partition-service-transaction-base.js:106-176`); current durable row owner survives (`src/partition/partition-participant-transaction-store.js:178-182`). |
| Restart vs live | APPROVE: no new reconstruction discriminator or second registry; current leader-loss discards only volatile sessions (`src/partition/partition-service-raft-lifecycle-wiring.js:38-49`). Mirror resumption survives. |
| Lost enlistment | APPROVE for unchanged coordinator cone: no participant-set/recovery changes; preserve witnesses named by `test/shards/impact-contracts.json:1012-1053`. Child does not certify integrated restart recovery. |
| Idempotent replay / rollback dedup | APPROVE: exact durable decision and operation outcome keys remain (`src/partition/partition-participant-transaction-apply.js:400-413,448-470`); delete bare local heal rather than copy its dedup/reset logic. |
| Unreadable/absent never terminal | APPROVE: current absent outcome stays UNKNOWN (`src/partition/partition-participant-transaction-store.js:283-286`), unreadable durable state must fail through current owner; no legacy outcome fallback. |

### Concurrency / serialization

| Item | Verdict and evidence |
| --- | --- |
| Synchronous gate vs async observation | APPROVE: BEGIN checks/opens synchronously (`src/partition/partition-participant-transaction-request.js:263-288`); activity consumes current volatile and durable owners. Serving admission increments before await (`src/partition/partition-service-entry-apply-base.js:298-316`). |
| Revalidate after awaits | APPROVE: new input classification uses one safe snapshot; retain release final no-await generation check (`src/partition/partition-participant-transaction-pause.js:68-79`) and existing pending-outcome joins. No new asynchronous state authority. |
| Single winner | APPROVE: deterministic PREPARE/decision entryId joins remain (`src/partition/partition-participant-transaction-request.js:368-371,467-470`); pending registration precedes proposal (`src/partition/partition-service-raft-write-commit.js:329-343,460-474`). |
| Timer interleaving | APPROVE: current sweep skips in-flight PREPARE (`src/partition/partition-participant-transaction-session.js:134-147`); delete SQL rollback timer. Keep durability/snapshot owners' role behavior. |
| Resource identity keys | APPROVE: session registry is per service/participantId with transactionId match (`src/partition/partition-participant-transaction-session.js:23-35,62-75`), pending writes use exact entryId. No sessionId mutex/ownership replacement. |

### Sweep / timer

| Item | Verdict and evidence |
| --- | --- |
| Injected clock / unref | APPROVE: retain timer source.now and unref (`src/partition/partition-service-transaction-base.js:528-542`); sweep accepts nowMs (`src/partition/partition-participant-transaction-session.js:184-196`). |
| Role / SOLO authority | APPROVE: current sweep has no SQL terminal action on any role; PREPARED reports only (`src/partition/partition-participant-transaction-session.js:150-172`). Retain current durability-fitness/SOLO consumer, delete old rollback authority (`src/partition/partition-service-transaction-base.js:422-508`). |
| Memory crash equivalence | APPROVE: no new crash-mimicking heal; current volatile discard owns its map (`src/partition/partition-participant-transaction-session.js:121-128`). Existing durable outcomes stay transactional. |
| Legal hold windows | APPROVE: budgets unchanged; explicitly injected expiry can test fail-closed consequence but is excluded from healthy proof. A real spent wait remains a red owner defect, not successful cleanup. |
| Starvation / circular wait | APPROVE for deletion: sweep reads local durable rows directly and never settles them (`src/partition/partition-participant-transaction-session.js:152-196`); bound decisions bypass new-mutation pause through existing participant commit path (`src/partition/partition-participant-transaction-request.js:457-486`). No new routing-dependent sweep. |

### Owner interaction

| Item | Verdict and evidence |
| --- | --- |
| One semantic owner | APPROVE: request/bytes owner answers current protocol; session/store owns held work. Delete competing local engine and old apply fallback (`src/partition/partition-participant-transaction-apply.js:552-569,653-657`). |
| Typed boundary | APPROVE: preserve full identity, exact PREPARE/decision bytes and durable state/outcome (`src/query/sql-query-engine-participant-wire.js:7-28,220-309`); no fallback/boolean option bag. |
| Paired invariant / revert | APPROVE design; witness must pair malformed refusal/current success and collision isolation/ordinary routing in one sample (`test/partition/partition-tx1-single-path-alpha.test.js:90-132,134-199`). Proof gaps listed below must be repaired before source approval. |
| Stale then fresh | APPROVE: classify against current session/PREPARED owner each request; ended or decided work cannot leave a cached sessionId veto. Preserve release invalidation (`src/partition/partition-participant-transaction-pause.js:33-51`). Include temporal reevaluation witness. |
| Pressure / backoff | APPROVE: current pending queue, park/re-admission and budgets survive (`src/partition/partition-service-raft-write-commit.js:261-307,329-343`); typed identity refusal introduces no repair loop. |
| Owned wake / release | APPROVE: PREPARED decision post-commit calls canonical re-admission (`src/partition/partition-participant-transaction-apply.js:384-387`); existing leader-loss release survives (`src/partition/partition-service-raft-lifecycle-wiring.js:45-49`). Timer is not a new terminal mechanism. |
| Projection authority | APPROVE: changed release facts read existing owners and expose canonical work only (`src/partition/partition-participant-release-facts.js:46-69`); exact release contract/admission remains adjudicator (`src/partition/partition-participant-release-contract.js:105-137`). |
| Treatment fingerprint | APPROVE: baseline is exact e6d43bc; new red must name behavioral assertion and retain output. No import/setup/timeout red, fake admitted old session, or altered expected criterion as treatment. |
| No escape hatch | APPROVE: no raw-state repair, force flag, new identity validator, duplicate activity predicate, replacement log scan or retained executable compatibility branch. Audit old marker admission and outcome registration too. |
| Registry + live endpoints + proof | APPROVE design obligation: update `test/shards/impact-contracts.json:655-679,1012-1053,1607-1639` and primary test classification with removed owners/new current consumers. Contract prose must stop describing legacy sessions. |

### Harness fidelity

| Item | Verdict and evidence |
| --- | --- |
| Behavioral red | APPROVE amended mechanism: canonical refusal versus old fallback answer, partial QUERY ordinary answer, accessor reads, collision old fence. Source anchors are finding 7; additive witness enters production `handleApplicationMessage`. Root's retained baseline run, not reviewer execution, owns measured red evidence. |
| Binding seam | APPROVE: controllable port drives consensus but production service dispatch/SQLite/classifier run (`test/partition/partition-service-test-support.js:29-55`). This proves scheduling/binding, not real native durability or integrated recovery. |
| Clock ordering | APPROVE: no compressed healthy timeout needed for the red. Intentional expiry witnesses must preserve hold/in-flight deadline ordering and remain outside healthy proof (`src/partition/partition-participant-transaction-session.js:131-147`). |
| Field completeness | APPROVE design: full current fixture identity (`test/test-helpers/participant-transaction-fixture.js:128-141`) and malformed own/inherited fields. Include null/empty/undefined, numeric/exotic cases and actual durable effects. |
| Anti-vacuity | REVISE additive test before source approval: empty ordinary result, unmeasured durable rows, and unmeasured staged bytes leave gaps (`test/partition/partition-tx1-single-path-alpha.test.js:67-86,123-131,180-198`). See complete proof obligations below. |
| Live observable | APPROVE honest scope: child binding/locked-lab regression evidence does not certify full startup/restart/interrupted COMMIT/split/merge/replacement/seed-loss/five-host closure required by human authority. |

### Adversarial JavaScript input

| Item | Verdict and evidence |
| --- | --- |
| Numeric lattice | APPROVE reuse of unchanged identity algorithm: safe-integer epoch at `src/partition/partition-participant-transaction-bytes.js:86-95`; no new arithmetic. Verify NaN, infinities, boxed/unsafe values and preserve current minus-zero semantics without inventing a new epoch contract. |
| Own properties | APPROVE design: use existing strict reader (`src/utils/strict-own-data.js:61-87`); inherited identity must never become current authority or ordinary fallback. |
| Accessor traps | APPROVE design: descriptor copy rejects accessors without invoking them (`src/utils/strict-own-data.js:79-85`); witness requires zero getter reads (`test/partition/partition-tx1-single-path-alpha.test.js:112-129`). |
| Prototype pollution | APPROVE design: strict reader uses captured descriptors and null-prototype copy (`src/utils/strict-own-data.js:5-15,68-85`). Verify pollution setup/restore and no inherited fields in the new detector. |
| Boxed/exotic primitives | APPROVE design: existing primitive identity checks remain canonical (`src/partition/partition-participant-transaction-bytes.js:27-28,86-95`), strict reader rejects proxies/arrays/exotic prototype (`src/utils/strict-own-data.js:61-70`). Add boundary cases to witness. |
| Mutable intrinsics | Implementation obligation: strict reader captures its intrinsics (`src/utils/strict-own-data.js:5-15`); identity owner currently calls mutable Number.isSafeInteger (`src/partition/partition-participant-transaction-bytes.js:90`). Keep canonical algorithm; capture its unchanged intrinsic or pin changed guard behavior with adversarial fixture. No general hostile-environment certification is claimed by this deletion. |
| Serialization/coercion | APPROVE: new detector must consume safe primitive snapshot and call current identity algorithm; create no hashes/coercions. Exact decision serialization remains its existing owner (`src/partition/partition-participant-transaction-bytes.js:158-174`). |
| Array authenticity | APPROVE for detector: identity classification introduces no caller array interpretation; use fixed canonical field vocabulary. Existing params/operations remain staging/bytes owners, not a new generic validator. |

## Proof obligations before implementation approval

These are all gaps found in the additive witness during this round, not new
owner redesigns and not approval of its current assertion completeness:

1. Measure durable participant/outcome rows as well as SQLite transaction,
   session, proposals and user data for every refused control. Current table
   presence must be established; absence is not an accidentally passing zero.
2. Collision witness must assert exact PREPARE operationsText remains empty
   after the rejected INSERT. Rows zero and no ordinary proposal alone cannot
   detect unintended volatile staging. Include durable and PREPARING custody.
3. Use an application-owner-seeded nonempty row for the ordinary routing-only
   positive, so an empty constant answer cannot pass as actual ordinary SQL.
4. Cover null/empty/undefined own fields, wrong participant binding, numeric
   and boxed values, proxies/symbol/exotic records, inherited/polluted fields,
   accessors and relevant replaced intrinsics using the existing strict reader
   and canonical identity owner. Preserve valid-current follower/version gates.
5. Add removal-fenced malformed/collision admission, current PREPARED drain,
   stale-then-fresh collision reevaluation, full cadence/mirror preservation,
   current local mutation refusal, and exhaustive unknown committed-command
   rejection to the appropriate current witnesses/registry.
6. No-reference evidence must include deleted methods/maps/aliases, old marker
   types/admission/apply, old outcome schema/init invocation, dead duplicate
   handler and test consumers. Explicitly classify retained current SQL/API
   homonyms and the deferred stamp/reopen surfaces rather than accepting a
   broad grep allowlist.

## Independent obligations kept open

Current raft-rs application snapshot custody remains a separate gap: old marker
gate is only the SQLite-payload path
(`src/raft/snapshot-checkpoint-store.js:311-327`); current raft-rs copy bypasses
it and strips application tables (`:295-308,339-350`), while partition cadence
explicitly reports COMMITTED_LOG_UNSUPPORTED
(`src/partition/partition-snapshot-cadence.js:8-19,64-73`). Do not add a second
TX1 snapshot inference during deletion.

The existing healthy provisioning timeout is an independent systemic red.
Root's baseline assertions, eventual retries, this design approval, or a child
receipt do not convert it into healthy proof. Broader release/reopen/L6 and
retired Raft/startup compatibility cleanup also remain alpha follow-on work.

The approved five child receipts match the unsealed Quest metadata exactly.
The eight parent TX1 receipts remain immutable; this child preserves their
relevant regression cone and does not claim full parent acceptance.
