# Participant manifest whole-operation resource supplement: independent round-four design review

Date: 2026-10-11. Reviewer: `subagent:/root/review_checkpoint_composition`.
Author-distinct, DESIGN ONLY. No source, tests, document, metadata, index or
Quest log was edited. No cluster or proposed implementation was run.

## Verdict

**REVISE DESIGN.** The supplement correctly expands accounting to producer
rows, response copies, recovery construction and retained workflows. It also
preserves the essential separation between query admission and deterministic
committed apply. Six grouped owner-interaction findings remain below:

1. The recovery builder can require progress rows which legitimate admitted
   transactions have never created.
2. Retained workflow admission does not reserve a path to the work which must
   complete before that retained capacity can be released.
3. Remote recipient capacity is not acquired before transport materialization.
4. Multi-source population verification lacks an executable coherence/ABA
   boundary, and the release result digest's identity fields are unspecified.
5. Fixed-workspace apply is specified for a scanner, but not for the actual
   SQL input, result, retained outcome and replay interaction.
6. The proposed recovery discovery still lacks the authoritative ID enumeration
   needed by its claimed durable backstop.

These are contract findings, not a demand for tests of unimplemented code to
already pass. No source implementation, constants/defaults, complete TX1,
activation, FreshMG or main merge is approved. Reviewed BEGIN identity,
uncertain-insert and transition semantics remain separate and unchanged.

## Exact subject and source boundaries

`W` = `/mnt/data/peter/projects/.worktrees/tx1-work-20261010`.
`E` = `/mnt/data/peter/projects/.worktrees/rs-raft-candidate-20261011/test-output/continuation-20261011`.
`I` = `E/manifest-resource-review`.

**D** = `W/solve/quests/replicated-transaction-decision-and-apply/design-query-participant-manifest-resource-budget-2026-10-11.md`.
SHA-256 **`2d0e514c9488d96c9d9c5b7bd0ce81522ebde41908207c4222b86b343a169772`**;
988 lines. All D line references below use these exact bytes. A verbatim
diagnostic copy is retained at I/subject-2d0e514c.md.

The 605-line predecessor is preserved at
`W/solve/quests/replicated-transaction-decision-and-apply/evidence/design-query-participant-manifest-resource-budget-round3-22ec1630.md`,
SHA `22ec16308e7d46183c415ccc8d31797692a343db3d779081ab9c1d57bb8fbb84`.
Independently verified its bytes are an exact prefix of D. The new supplement
starts at D:607 and expressly supersedes the former SQL-row exclusions.

Prior complete reviews read:

- `E/review-c56-8-participant-manifest-budget-fresh56.md`, SHA
  `ebfbfc00d84590b677457f50a23324b0ff2842394481b3641b5e7d41e411573e`.
- `E/review-c56-8-participant-manifest-budget-round2-fresh56.md`, SHA
  `648edb806e04d864054dd0bb142990f832b0e0fcb657e0b182a9167ecc8cba2c`.

Navigation uses immutable **`c6d71665e98be03de916705f272a9d6340e4a842`**, not the
currently mutable BEGIN source. Twenty-one exact source files are retained at
I/navigation-c6 with per-file fingerprints and the tree identity in
I/navigation.json, SHA
`b89381716a2ef88dfdb8b69fb4340c75259e8e128d3bc9bfbcf0e032cd1d48d2`.
The delta to BEGIN proof snapshot `2925863c3e72a17854413fa2c850ce4ff76f6aff` is
recorded there as context only; that proof is not adopted as resource design or
source approval. Every source line reference below is to the pinned c6 file.

Read current W steering rules/router, architecture index, authority-and-recovery
contract, all ten matching verification templates, complete D and predecessors,
and the actual read/recovery/release/apply consumers. Trusted private-network
and existing strict-own-data boundaries were preserved. No arbitrary hostile
host or intrinsic-mutation requirement was added.

### Source reference key

All paths are relative to c6's repository root.

| Key | Path |
| --- | --- |
| MAN | `src/query/distributed/distributed-transaction-participant-manifest.js` |
| SET | `src/query/distributed/distributed-transaction-participant-set.js` |
| AUTH | `src/query/distributed/distributed-transaction-recovery-authority.js` |
| REC | `src/query/distributed/distributed-transaction-recovery.js` |
| CENSUS | `src/query/distributed/distributed-transaction-release-census.js` |
| RELEASE | `src/query/distributed/distributed-transaction-release-settlement.js` |
| SETTLE | `src/query/distributed/distributed-transaction-settlement.js` |
| READ | `src/query/sql-query-engine-transaction-set-methods.js` |
| LOAD | `src/query/sql-query-engine-transaction-recovery-methods.js` |
| PERSIST | `src/query/sql-query-engine-transaction-persistence-methods.js` |
| INIT | `src/query/sql-query-engine-instance-initializer.js` |
| APPLY | `src/partition/partition-coordinator-settlement.js` |
| PROOF | `src/partition/partition-participant-release-contract.js` |
| BYTES | `src/partition/partition-participant-transaction-bytes.js` |
| WF | `src/workflow/durable-workflow-coordinator.js` |
| SCHEMA | `src/bootstrap/system-table-workflow-schema-definitions.js` |
| IDS | `src/bootstrap/system-table-schemas-constants.js` |
| RI | `src/transport/message-router-inbound-dispatch.js` |
| RD | `src/transport/message-router-delivery-behaviors.js` |
| ATX | `src/raft/raft-rs-application-transaction-owner.js` |
| STRICT | `src/utils/strict-own-data.js` |

## Complete findings, grouped by owner boundary

### MR1 — missing participant progress cannot prevent recovery of an admitted manifest

**Recovery compatibility/progress blocker.** D:853–863 says manifest pairs are
matched to authoritative participant pages and missing child rows refuse the
complete bundle. It does not distinguish an absent progress hint from an
incomplete page/population proof. Under the natural one-row-per-manifest-pair
reading, this removes a legitimate recovery path.

The actual sequence is deliberate: SET:32–48 first durably retains the manifest
and creates local unknown participant records. SET:73–86 then begins the
participant and persists progress. Its comment at SET:39–40 explicitly requires
the admitted identity to survive failure of BEGIN or progress persistence.
Consequently a crash after the manifest CAS, including one after the actual
participant BEGIN but before coordinator progress persistence, can leave a
complete authoritative manifest and no corresponding child row.

AUTH:22–50 builds the registry from every manifest pair. Missing progress becomes
unknown/FAILED with no retained PREPARE evidence; it is not an empty registry or
permission to COMMIT. AUTH:111–139 then retains the identity and follows the
existing decision/recovery path. A recorded COMMIT is re-driven regardless of
missing progress; it is never replaced with a rollback decision. A canonical
rollback can likewise settle a participant whose BEGIN never happened. RELEASE
also accepts a subset of correctly bound progress rows at RELEASE:59–83 while
re-driving every manifest pair.

**Required correction:** state separately (a) complete enumeration of whatever
progress rows actually exist and (b) complete reconstruction of all admitted
manifest identities. Reject missing pages, duplicate/foreign/extra progress and
contradictory evidence. Preserve manifest members without progress as unknown,
without manufacturing PREPARE evidence or shrinking the participant set. Use the
existing AUTH/participant-wire decision rules for their recovery. Do not require
some other worker to first create a progress row that only this recovery path
can establish. Write-operation bookkeeping also must not silently acquire new
decision authority (PERSIST:365–374 calls it bookkeeping, not decision-bearing).

Required paired future witness: crash immediately after manifest CAS and after
participant BEGIN but before progress persistence; recover the full same-ID set
through the authoritative builder and existing protocol. Add recorded-COMMIT,
legitimate rollback/no-participant-effect and foreign/duplicate-row refusal
controls. This preserves accepted transaction semantics rather than reopening
the transaction design.

### MR2 — retained leases can consume the capacity required to finish and release themselves

**Resource admission/liveness blocker.** D:660–680 puts producer pages,
transient operations and retained workflows into one work balance. Live work
reserves retained state before effects and grows that lease incrementally.
D:865–873 keeps a published workflow charged until terminal removal. Completion
still requires authoritative rows, manifest/decision work, CAS and transport
from that same balance. No rule preowns sufficient completion capacity or
provides a completing winner among already published workflows.

Illustrative accounting schedule, not measured constants: a work pool of 100
units admits two workflows retaining 45 units each. Either workflow alone plus
20 units of completion work fits. With both published, only 10 units remain;
neither can acquire the next read/settlement lease. Neither may be evicted, and
neither releases its 45 units until that settlement reaches terminal removal.
There is no failed private builder left to discard, no new load is needed, and
periodic retries merely repeat pressure. Protected-head reservation can make
this worse if it fences the temporary work needed to finish an existing holder.
“Existing leases may finish” at D:341 is not an executable progression argument
for this newly retained lease kind.

**Required correction:** give one non-overlapping admission/completion credit
table for retained workflow plus its peak required producer/consumer/CAS/send
work. Define either completion capacity owned before accepting retained work or
a bounded existing-owner rule that permits a particular accepted workflow to
finish without evicting acknowledged obligations or bypassing the budget. State
how protected-head policy treats completion of existing holders and how local
source/consumer colocation is charged. A caller deadline cannot free the
published state and does not solve this cycle.

Keep configurable historical oversize as an explicit operator-capacity hold;
that is different from two individually affordable accepted workflows stranding
each other. Test both populations in the eventual implementation, including
post-COMMIT completion, before claiming aggregate backpressure is recoverable.

### MR3 — the remote receiver has no pre-materialization credit handoff

**Producer/transport/consumer allocation blocker.** D:703–723 reserves source
descriptor, row and encoded-response copies before their allocations. D:725–731
correctly distinguishes a transferred local claim from disjoint remote copies.
But neither that clause nor the timeline at D:973–980 says when the receiver
acquires the claim before its transport input/string/JSON/result graph exists.
The timeline puts the consumer claim after the source encoded response.

The existing receive path materializes `data.toString()` and JSON at RI:50–52,
before an application consumer can validate a page. RD/RI add actual wrapper
and send/receive copies. An advisory smaller remaining-byte envelope in the
request (D:694–697) is not a reservation: two concurrent reads can each observe
the same free recipient capacity, while their independent source pools both
admit and send. Leasing after each received page has already been parsed cannot
establish the promised before-allocation bound. Late replies after timeout also
remain physical copies even if their application waiter is gone.

**Required correction:** specify recipient byte/count admission before a remote
variable response may be produced/received, bind it to exact request/page/
lifecycle/operation identity, and retain or transfer that credit through actual
receive parsing, decode and builder/digest consumption. Include source and
recipient wrapper/serializer/input copies and late-result/close paths in the
same timeline. Explain local colocation/lease transfer so these are not counted
twice or omitted. Capacity waits/retries must remain with the existing owner;
do not introduce a new generic transport scheduler or raise a global limit.

Required future controls: two overlapping responses into one constrained
recipient, late result after caller timeout, receive-before-source-send-callback,
local transfer, and a supported single large row. Refusal must occur before the
unadmitted copy, while the valid transfer completes with bounded buffering.

### MR4 — population verification needs exact per-source fences and result identity

**Completeness/concurrency contract blocker.** D:841–851 gives a parent row
sandwich plus two child-population count/digest passes, says all pages share one
source lifecycle/applied/configuration witness, and permits unrelated applied
index advances (D:747–751). Those clauses do not define an executable coherent
bundle across the actual table owners.

SQL_TRANSACTIONS, SQL_TRANSACTION_PARTICIPANTS and SQL_WRITE_OPERATIONS have
distinct initial partition IDs (IDS) and independent authoritative routes
(READ:18–29/65–82; INIT:250–265). They need not share a leader, lifecycle,
configuration or applied index. One common witness cannot simply be required
for all three. Conversely, two equal content digests observed through paged
passes do not establish that a relevant source generation stayed unchanged
between them. Repeated insertion/deletion or updates can return to equal bytes;
per-table observations can come from different cuts. The design explicitly
requires mutation/ABA scrutiny and claims changes before/behind the cursor
always change final count/digest at D:819–821; that claim needs a fence or a
stated semantic-equivalence argument, not only a second hash.

The release side does improve matters: its final complete census is within one
synchronous SQLite read transaction (D:763–781). That is a real local snapshot.
However D:791–809 does not define the fields of the canonical invocation result
or expected-result digest. The current result fields are only transaction ID,
decision, decision digest, status and participant IDs (RELEASE:40–42). They do
not include session/transaction epoch or complete immutable creation content.
A final row-generation digest compared only with another final census cannot
by itself bind the earlier re-drive to a changed row identity whose projected
terminal result happens to be equal. A harmless ABA returning the exact same
semantic identity need not be rejected merely because bytes were rewritten;
the contract must distinguish that from a replaced identity or missed
population obligation. This is not a request for a new generic version store.

**Required correction:** define a per-owning-partition witness tuple and the
existing owner fact that fences relevant population changes across pages and
final publication/consumption. State the linearization or semantic-equivalence
claim precisely, including which unchanged monotonic facts suffice and how
stale/changed pages restart without restarting on every unrelated write. Pin
the exact fields/encoding of both result digests, binding each re-drive to its
immutable transaction/request identity and exact decision/participant set. Keep
final complete local read transactions and current release/membership fences.

Required future controls: child tables on different source nodes; insertion and
deletion behind a cursor; a changed child population between verification
passes; same-key changed-identity ABA versus exact same-identity replay; and
mutation between final census and proof consumption. Missing/unknown evidence
must stay a hold. No terminal-status-only shortcut may satisfy these controls.

### MR5 — a fixed-workspace scanner does not yet cover the committed apply interaction

**Deterministic apply/resource contract blocker.** The decision to exclude
dynamic pressure/config from committed apply is correct and must remain.
D:880–897 nevertheless calls command/SQLite row strings base bytes already
owned by the log/database and says *all additional apply work* is fixed
workspace. That is not yet compatible with the actual input/output consumers:

- SETTLE:202 fetches a new complete JavaScript row with `SELECT * ...get`;
  SETTLE:219–220 fetches/read-decodes the resulting decision again. A durable
  SQLite TEXT value is not already the same JavaScript string returned by get.
- SETTLE:48–90 returns a canonical `recordedDecision` whose shape includes the
  variable `participants` array. READY/REFUSED are not the only outcomes;
  APPLIED/REPLAYED/ALREADY_RECORDED can carry that record.
- APPLY:91–99 canonicalizes that result, serializes it with `JSON.stringify`
  into `ownerResultText`, stores it atomically and retains the result in an
  afterCommit callback. APPLY:34–43 parses/reconstructs it on replay or retained
  request retry. A fixed parser over manifest/decision text does not remove
  those variable arrays, strings, retained results or new row copies.

These are concrete adjacent consumers, not a request for all database memory
to become query-admitted. The supplement explicitly supersedes the earlier
SQL-produced-row exclusion at D:614–616, so its new fixed-workspace claim must
name the real ownership of these additional copies. Reusing an allocating
canonical result helper after a constant-space scan would preserve the gap.

Canonical scanner parity also needs an exact definition of its string domain.
MAN:5–18 uses JSON.stringify/JSON.parse and JavaScript string sort. A canonical
JSON `"\\ud800"` partition string can round-trip through that codec; BYTES:59–60
derives participant identity by exact string concatenation. D:519's “invalid
surrogates” must mean invalid under that existing canonical domain, not a new
blanket rejection of escaped lone UTF-16 code units or a switch to UTF-8 BINARY
ordering. This is a retained text compatibility boundary, not hostile-host
intrinsic hardening.

**Required correction:** extend the deterministic owner contract through row
production, result construction, atomic retained-outcome persistence,
afterCommit delivery and replay. Either explicitly own/bound the unavoidable
base copies through the existing application/log owner, or give a deterministic
streaming representation and compatible typed result shape consumed by those
actual callers. Do not add a pressure/config branch to committed apply, skip
entries, hide allocation in a result validator, or reinterpret a leader
precheck as follower authorization. Include byte-for-byte codec/scanner and
result/replay parity, including long token/decision/result bytes and canonical
escaped string edges, in the future leader/follower/restart matrix.

### MR6 — the durable discovery backstop still has no authoritative enumerator

**Recovery dependency/progress contract blocker.** D:829–839 replaces cache
bulk reads with versioned shared-reference pages and then fetches authoritative
bundles only for discovered IDs. D:865–914 and earlier D:304–330 rely on periodic
durable rediscovery for omitted registrations, discarded builders and restart.
The concrete existing sweep does not supply that durable census:

- INIT:264–265 wires `loadRecoveryStateForSweep` to
  `loadDistributedTransactionRecoveryState`.
- LOAD:128–159 obtains rows from cache `getAll`/`filter` and returns cache table
  arrays. The supplement replaces those with cache pages, not an authoritative
  unknown-ID scan.
- REC:228–243 preserves already known IDs if discovery fails. REC:245–251 then
  iterates known workflows. That is useful for a live process, but a restart
  clears those IDs/registrations/builders.

If a valid durable transaction is absent from an empty/not-yet-hydrated cache
after restart, no per-ID authoritative call can discover it. Repeating that
cache scan or waking the same sweep on gateway availability still has no ID to
query. Similarly, restarting a cache cursor on every unrelated table mutation
does not by itself establish eventual discovery of a tail ID. Calling the cache
non-authoritative correctly avoids false completion, but does not provide the
promised progress path.

**Required correction:** bind durable ID discovery to an actual bounded
enumeration through the existing authoritative producer/gateway and canonical
sweep, with a defined cursor/deadline/restart rule and no all-ID population
array. Cache pages remain optional hints and may not gate this backstop.
Preserve existing source authority and recovery admission while ordinary
application mutation admission is closed. This is the missing consumer of the
new transaction-purpose producer, not permission for raw SQL outside its owner
or a second recovery timer/store.

Future witness: retain a nonempty durable transaction while clearing the cache,
workflow registry, wake registrations and private builder; normal existing
sweep/gateway reentry must discover and recover it without another user write
or a manually invoked helper. Include metadata-map saturation and cache
mutation while a later durable ID still needs discovery. The complete normal
startup acceptance remains a separate gate.

## Preserved direction and measurement ceiling

The following prior corrections remain valid design inputs:

- Staged old decode, incremental unique-input capture, exact union upgrade and
  held-through-CAS lifetime (D:205–281), with no growth refusal for an unchanged
  duplicate-only union.
- Immediate pressure plus bounded keyed wake metadata and one coalesced
  successor sweep (D:283–331), rather than an awaited/unbounded waiter list.
- One frozen two-key configuration generation (D:370–413), work capacity after
  metadata (D:462–491), and an oversized-head classification which permits
  smaller independent debt.
- Full retained identity/key accounting (D:542–566), not an assumed modern
  32-hex width, and authoritative MISSING versus UNAVAILABLE/INVALID
  discrimination (D:568–588).
- Dynamic query admission separated from deterministic committed apply
  (D:493–540). MR5 completes that owner interaction; it does not revoke the split.
- Producer descriptor preflight, compact local census, exact send custody,
  private workflow construction and installed lease transfer are useful
  directions. MR1–MR6 identify the remaining interactions which prevent calling
  their composition executable.

All numeric factors, fixed overhead, 1 MiB/32 MiB defaults, descriptor/page
metadata, queue entry size and runtime amplification remain measurement inputs.
No count cap or a global-limit increase may substitute for the full operation
accounting. Existing historical rows over current capacity remain retained
pressure; increases must re-enter under the same identity. Invalid evidence
must not create a decision, definitive collision, absence or terminal success.

The six findings are not claimed as newly executed source regressions. This is
a design review of a proposed replacement, supported by exact existing owner
surfaces and explicit contract schedules. The required tests and metadata are
proposals, not current passing gates.

## Category-complete 63-item disposition

“Covered direction” means a coherent stated rule within this design scope,
not implementation or measurement approval. MR references below are effects of
the six grouped findings, not additional findings.

### A — admission and evidence consumption

| ID | Evidence and disposition |
| --- | --- |
| A1 | D:462–491/660–723 uses one work balance and pre-source-row admission. MR2/MR3 leave completion and recipient admission before materialization incomplete. |
| A2 | D:93–117/568–588/711–719 distinguishes pressure, malformed, missing and unavailable. MR1 must distinguish absent progress from incomplete authority rather than hold all canonical manifests. |
| A3 | D:901–907 binds queries/pages/delivery/CAS to the original operation deadline; no renewal or new wait budget. Committed apply remains a different owner lifetime, MR5. |
| A4 | D:733–751 cursor and 768–817 compact proof; actual RELEASE/PROOF and SETTLE/APPLY typed consumers. MR4/MR5 require exact population/result shapes through those consumers. |
| A5 | D:323–330/899–926 names release/config/cache/gateway wake. MR2/MR6 identify where an asserted wake has no completing capacity or undiscovered ID. |
| A6 | D:243–252/412–413/746–751/794–802 requires fresh config/row/source before consumption. MR4 must define per-source coherence and final identity fence. |
| A7 | D:487–491/542–566/711–714/779–781 charges actual IDs and reports gross/work/metadata capacity. No fixed-width or truncated identity authority; concrete diagnostic measurements pending. |

### Y — retry and bounded progress

| ID | Evidence and disposition |
| --- | --- |
| Y1 | D:283–331/909–914 reuses one successor flag and periodic owner; REC:204–345 is actual sweep. MR2/MR6 prevent complete eventual-progress approval. |
| Y2 | D:575–582/901–907 preserves debt under unreadable evidence and bounds the call. Missing child progress is not unreadable authority: MR1. |
| Y3 | D:93–117/479–491/568–588/753–759/865–873 gives explicit pressure/runtime/stale/invalid outcomes. No partial digest is success; retained release obligations remain explicit. |
| Y4 | D:340–368/660–680/865–873 combines protection and retained holders. MR2 gives the self-starvation schedule; a nonblocking refusal alone does not release published capacity. |
| Y5 | D:313–330/542–566 bounds metadata and coalesces wakes; bytes must also bound concurrent producer/receiver/builder work. MR2/MR3 and later measured log/attempt ceilings remain open. |
| Y6 | D:246–252/791–825/853–863 uses exact CAS, same-ID builder and current invocation redrive; MR4 must preserve identity through changed population and replay. |
| Y7 | D:340–348/901–907 forbids ACK/page/cache activity renewing priority or deadline. Pressure cannot authorize identity remint; reviewed BEGIN remains untouched at D:671–678/875–878. |

### T — delivery and copies

| ID | Evidence and disposition |
| --- | --- |
| T1 | RELEASE:93–103 requires committed canonical settlement; RI ACK-before-handler is not evidence. D:720–731/783–809 keeps actual send and terminal readback distinct from ACK. |
| T2 | D:720–731/745–751/905–907 requires exact late-response custody, no source free on caller timeout. MR3 requires the receiver's still-owned late-copy lease. |
| T3 | D typed pressure/STALE_PAGE versus invalid and incomplete census is coherent direction; MR1/MR4/MR5 need concrete consumer distinctions/result forms. Actual gateway/participant wire owner remains canonical. |
| T4 | D:899–914 one deadline covers absent route/noHandler/read failure. Retained debt survives; MR6 names missing discovery reentry and MR3 missing pre-receive capacity behavior. |
| T5 | D:935–961 proposes producer/transport/builder witnesses. Actual RI/RD and APPLY request/commit/replay must be exercised; no fake ACK or codec-only stub may stand in for them. Pending implementation evidence. |

### S — clocks, lifecycle and authority

| ID | Evidence and disposition |
| --- | --- |
| S1 | D:323–331/899–914 retains injected existing unref periodic sweep, no new timer. REC:352–363 is the existing timer owner. Deadline sequencing must be tested without artificial renewal. |
| S2 | D:502–540/880–897 forbids query pressure/config selecting committed outcomes; exact existing role/decision/CAS checks preserved. MR5 requires deterministic result/replay ownership too. |
| S3 | D:865–873/912–914 clears private builders/wakes on restart but retains durable rows. MR6 shows why known-ID live retries alone do not reconstruct after JS state loss. |
| S4 | D:407–413/681–690/901–907 preserves valid historical obligations and held leases; deadline does not free external send/published state. MR2 must ensure those legal holders can finish. |
| S5 | READ/PERSIST/RELEASE inventory uses coordinator metadata through its owning gateway. D:653–658/909–914 must let recovery run while ordinary admission is closed; MR2/MR6 identify resource/discovery circularity. |

### R — recovery and replay

| ID | Evidence and disposition |
| --- | --- |
| R1 | D:853–873 private construction then atomic handoff; WF:603–629 existing live-workflow guard must be retained. MR4 final coherence and MR1 full manifest reconstruction remain unresolved. |
| R2 | D:681–690/865–878 distinguishes historical accepted state, private builder and live published workflow; source WF uses exact existing-ID guard. No pressure eviction or BEGIN identity replacement allowed. |
| R3 | MAN/SET manifest is authority; SET:39–46 and AUTH:22–50 permit missing progress without missing participants. D:858–860 needs MR1 correction; legal empty canonical set remains valid. |
| R4 | D:246–252/783–825/880–897 retains exact CAS, participant redrive and deterministic replay. MR4 binds compact proof identity; MR5 covers actual retained-result replay allocations. |
| R5 | D:568–588 exact authoritative MISSING retires only its matching scope/revision. UNAVAILABLE/INVALID/cache absence is not completion; MR6 authoritative enumeration cannot be replaced by empty cache. |

### C — concurrency and ownership

| ID | Evidence and disposition |
| --- | --- |
| C1 | D:660–723 synchronous descriptor/lease admission and D:853–863 single private builder precede publication. MR3 receiver allocation and MR2 complete-operation credit still need admission rules. |
| C2 | D:746–751/847–863/901–907 names post-await fences. MR4 must state which per-partition evidence survives unrelated advances and what excludes relevant changes/ABA. |
| C3 | D:237–252/853–873 uses exact CAS and one transaction/generation builder; WF existing-ID/session guard retained. A resource token is not transaction or collision authority. |
| C4 | D:323–330/395–413/909–926 coalesces release/config/timer reentry and requires once-only release. MR2 includes protected-head interactions with holders; late send remains charged. |
| C5 | D:639–669 changes owner scope to runtime-node shared balance, including query producer/engine. That matches local contended memory; MR3 disjoint remote credits and MR4 per-partition semantic fences must remain separate. |

### F — dependencies and formation

| ID | Evidence and disposition |
| --- | --- |
| F1 | D:623–658 inventory covers SQL parent/children, codec/CAS, recovery, census, settlement and apply. READ/PERSIST/APPLY/RI/RD confirm actual path; MR3/MR5 name omitted materialization/result edges. |
| F2 | INIT:264–265 → LOAD:128–159 → REC:228–251 is cache-backed ID discovery. D's per-ID authoritative builder does not supply unknown IDs; MR6 required. |
| F3 | D:93–117/901–907 keeps formation callers within existing budget and preserves accepted work. MR1/MR2 prevent progress on otherwise lawful data/capacity despite eventual dependencies. |
| F4 | D:963–981 requires whole producer/consumer/builder/retained peak and deadline accounting. MR2/MR3/MR5 prevent complete bound; numeric constants and physical latency remain measurements, not approved thresholds. |
| F5 | D:694–697/984–988 rejects raw SQL/cache authority, second ledger or timer. Required fixes must use existing producer/recovery/application owners; no force-open or generic memory framework is authorized. |

### H — evidence and falsifiers

| ID | Evidence and disposition |
| --- | --- |
| H1 | Prior exact reviews and source c6 pinned; D:935–961 falsifiers retained. MR1 legitimate missing-progress, MR2 retained-holder cycle and MR3 receive-before-admission target concrete mechanisms, not import/setup failures. |
| H2 | READ/PERSIST/RELEASE/APPLY/RI/RD are actual seams. Future real SQLite/transport/recovery witnesses must label injection and use canonical outcomes. No unimplemented feature test was fabricated in this review. |
| H3 | D:901–907 freezes original time; future tests independently control capacity release, receiver receipt/send callback, mutation between passes and caller expiry. No budget compression may change their ordering. |
| H4 | D:733–751 and 804–817 must carry full source/operation/config/identity facts; MR4 exact per-source/digest schema required. Historical long IDs remain charged, not silently narrowed. |
| H5 | D:935–961 includes huge few entries, history over current cap, nonempty recovery, interruption and small/empty controls. Add MR1–MR6 paired negatives without empty-census vacuity. |
| H6 | D SHA/prefix/source census pinned; all tests/metadata and numeric sizes are proposed. No 399-assertion, startup, performance, source or physical acceptance claim follows from this docs review. |

### O — owner interaction

| ID | Evidence and disposition |
| --- | --- |
| O1 | D:639–658 separates manifest semantics, resource budget, gateway authority, workflow, release and apply. MR1 must preserve manifest over progress hints; MR5 must keep one deterministic settlement result owner. |
| O2 | D:703–751/768–817/841–888 proposes typed page, compact proof and scanner handoff. MR3/MR4/MR5 require complete executable consumer/resource shapes instead of a final unowned copy. |
| O3 | D:415–442/935–961 pairs refusal with historical same-ID recovery. Future candidate must jointly close MR1–MR6, with old mechanism negatives kept separate from positives. |
| O4 | D:479–491/568–588/681–684/865–873 allows capacity/source recovery, no permanent stale veto. MR1 missing progress and MR6 unknown discovery must not remain permanent holds. |
| O5 | D:333–368/660–690 intends retained priority and backpressure. MR2 shows policy needs completion capacity for existing holders; no urgency/critical flag may bypass it. |
| O6 | D:909–926 exact release events and one-bit wakes are appropriate. MR2 needs a releasing holder; MR6 needs a discoverable durable ID. Counters/wakes alone establish neither. |
| O7 | D:745–751/811–817/829–835 explicitly denies cache/cursor/digest projections independent authority. MR4 binds live invocation proof to exact identity rather than terminal projection alone. |
| O8 | Predecessor605 lines byte-preserved, subject2d0e and source c6 exact; mutable BEGIN excluded. No source-red/runtime-deadlock claim invented; counter-schedules are design evidence. |
| O9 | CENSUS .all/canonicalRows, LOAD cache arrays, REC recovery maps and APPLY result JSON are actual adjacent allocations. The supplement targets them; MR3/MR5/MR6 name paths not yet covered end-to-end. |
| O10 | D:444–447/532–540/811–817 requires source/consumer pairing. Later registry must include producer descriptor/page, gateway/router, cache discovery, recovery builder/FIFO, release proof, config publishers and apply/result/replay witnesses together. Proposed, not approved metadata. |

### J — numeric, string and container boundaries

| ID | Evidence and disposition |
| --- | --- |
| J1 | D:370–413/462–491/703–719/753–759 requires safe positive sizes/count arithmetic, no overflow/nonfinite/-0 authority. rowid/applied-index/native numeric conversion needs exact future representation tests. |
| J2 | D:58–63/207–236/733–739 and STRICT:1–52 retain own primitive descriptor capture. Wire cursor/page wrappers must consume that same strict boundary before authority use. |
| J3 | One captured string/config reference and per-index data descriptors precede derived work (D:207–252). Source descriptor/full-row consistency must be maintained in the bounded SQLite slice; postallocation mismatch is not permission for an unreserved value. |
| J4 | Existing proxy/prototype/own-data defenses preserved through STRICT. No new arbitrary local-host mutation promise; resource design may not weaken sealed input guards. |
| J5 | D:221–236 refuses boxed/accessor/sparse/exotic entries before retaining candidate growth. D:703–719 type-pins SQLite values; huge primitive content receives pressure, not truncation or invented absence. |
| J6 | STRICT pinned intrinsic assumptions remain the boundary. Scanner/result changes must preserve current canonical behavior; no unrelated mutated-runtime hardening demanded. |
| J7 | D:774–781 field-tagged length-prefixed digest and 511–539 scanner need exact canonical parity. MR4 exact proof identity and MR5 escaped-string/result encoding domain remain required. |
| J8 | D staged unique scan, descriptor pages and retained-byte claims replace all-data materialization without a logical count cap. MR2/MR3/MR5 expose remaining aggregate copies/lifetimes; fixed constants await instrumentation. |

## Completion and next bounded checkpoint

All 63 instantiated obligations have an evidence path and scoped disposition.
Revise MR1–MR6 as one whole-operation owner interaction before source work.
Preserve the existing transaction/BEGIN decision boundaries and the accepted
directional corrections above. The next design checkpoint should make one
supported transaction recover and release under the claimed budget with exact
source/recipient/retained/apply custody and authoritative completeness, while
the corresponding refusals keep the same durable obligations intact.
