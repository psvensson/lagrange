# BEGIN uncertain INSERT resolution design review — round 3

Reviewer: `subagent:cdc_continuation_56` · 2026-10-11

## Verdict: REVISE

The round-three amendment closes the ordinary unbound pgwire reentry, shared
absolute reconciliation deadline, aggregate count/sweep bound, canonical mode
and epoch domains, and fixed 15-field INSERT encoding defects from round two.
It remains a narrow creation-uncertainty supplement and does not reopen the
accepted transaction protocol.

Two bounded contradictions still prevent implementation approval. First, the
capacity clause allocates the potentially oversized canonical row and digest key
before reserving their capacity, releases accounting when an object becomes
ACTIVE without requiring the retained byte/key references to be dropped, and
does not name the legitimate matching-advanced-row removal as a release path.
Second, N4 says the authoritative reader and producer use the same validators
and then requires all mutable fields to equal their initial values, while the
same design requires a matching advanced row to retain noninitial participant,
progress and decision state. The producer encoding is correct; the reader needs
a distinct general row-domain validation before normal advanced recovery.

This is a proposal review. It does not require implementation or future runtime
evidence to exist already.

## Bound subject and source ceiling

- Worktree: `/mnt/data/peter/projects/.worktrees/tx1-work-20261010`; base HEAD
  `e7c89f4b5114c0238312d3831b65889a4622f4e9`, with preserved wider dirty and
  untracked transaction work.
- Subject:
  `solve/quests/replicated-transaction-decision-and-apply/design-query-begin-uncertain-insert-resolution-2026-10-11.md`,
  exact SHA256
  `69f91acc2d5a1b69998e9426787ed096c6cdfd6a641e1f1ee9c254da3b696a3a`.
- Preserved round-two subject: SHA256
  `a43e0a4f5d1e4022277200fb02db6ad23d40165a6e079e85194620da3af37c1b`.
- Prior independent review:
  `review-begin-uncertain-design-round2-cdc56.md`, exact SHA256
  `6b27140ae6f3a6ea96abe1fe06d085190902304521333ffe70aa475fc53fdc2f`.
- Frozen diagnostic: `c56-transaction-evidence-matrix/round4-diagnostic/`
  manifest SHA256
  `9cddb866431a74eb444b839cdce0a022b9b3baeddde37e2b0cdeac8a7779dfbb`;
  summary SHA256
  `82f08d7ee657115136c26cf04d3debd736429c97299eed614ecaefdca5aa1d06`.
- Inspected source fingerprints remain coordinator
  `c4a1ff872a4b2a3766cefe8fbd06768a62b96f1574602a592a3bcd7c65b29314`,
  recovery
  `788befbd180bbb70679eae78f201ecf916d88316027770f7dff571a2a6deb98d`,
  statement FIFO
  `3d60e0479dd681a0a304740bf804187b003a6aad9fae0a4aefcef505e3158297`,
  transaction persistence
  `f514a4445521b846457818f54e3fcd05268688d8469f612d4e5e1fcf57f4a031`,
  transaction recovery methods
  `4fdfa146102b7a0704e66f986d65af97ff8ad7aa3dad0d1da3b285b7d20f2137`,
  statement admission
  `fc398002ff8b19e2e34681006917112613f232ac73fd0e5aa8d21f08b24f3055`,
  lifecycle/callback dispatch
  `dc37055accd2a25e4c92d93c8c630f387aeac21146704065151da73b664e8df5`,
  DWC
  `ba683bea66935c573158dedab2fe387af4e8f14bda4b25aa9a475b47ec9dec73`,
  gateway options
  `da68652c630618e49bb1e647e72dd5c26de68b6531b02c969eb3e47788459904`,
  gateway mutation submission
  `4c7553da2e6b58f750c1f796c5ad0aff2b0c20a82309f98ca1ce8624f99c04de`,
  write identity
  `d8a79c43e47cc9d0c2e49398b6043c20414c67454b8b7ed1089e5b83459d36ee`,
  pgwire session
  `15ae54e3c4c1c53e6d2fec03522426fbcb9764689bf9607e1d36ccbae5538b3f`,
  and application database
  `2ab2556849da1953cccc2324436745229cd303778aa020613d082885fcb5ca7f`.
- No source, test, metadata, Quest log, or prior evidence file was changed. This
  report is the only file written.

The production `a01` transaction binding and test-only `20b` scope remain
separate. No implementation, startup, crash-recovery, or compatibility claim
follows from this docs-only review.

## B1–B7 disposition on the current subject

| Item | Disposition |
| --- | --- |
| B1 exact same-insert redelivery | **CLOSED at design level.** D:204-238 retains one fixed row/key, uses the existing explicit idempotency option, storage PK, serialized apply and exact-key readback. Specific PK conflict plus a valid conflicting row is the only re-mint authority. |
| B2 one creation-state gate | **CLOSED at design level.** D:240-259 names every consumer; N1 D:405-436 adds unbound same-session BEGIN reentry through the raw exact owner binding while preserving wrong-ID refusal. |
| B3 one FIFO reentry and real wake | **CLOSED except P1 lifecycle details.** D:261-281 and N1 use one session FIFO reentry; N3 D:505-519 uses only the existing unref sweep, rotating bounded cohort and existing defer/backoff. The reservation teardown defect is P1. |
| B4 honest restart boundary | **CLOSED within the stated normal-adapter domain.** D:283-311 declines reconstruction of volatile bytes, never turns restart MISSING into no-effect, and leaves late durable rows to census under the original ID. |
| B5 original deadline and bounded work | **CLOSED.** N2 D:438-461 captures one absolute turn before FIFO, passes one deadline-bearing budget to INSERT/read and omits the read at zero remaining time. Expiry grants no transaction activity. |
| B6 exact-key strict reader | **PARTIAL; P2.** N4 closes ID/mode/epoch/timestamp domains and fixed encoding, but its common reader/producer initial-value rule contradicts advanced-row recovery. |
| B7 transaction-owned DWC failure policy | **CLOSED at design level.** D:348-363 retains only through a private transaction policy, keeps REMOVE as the generic default and requires exact candidate/map checks. |

## N1–N4 disposition

| Prior round-two finding | Round-three disposition |
| --- | --- |
| N1 ordinary unbound pgwire retry | **CLOSED.** D:405-436 reads the raw live owner binding, reenters an exact uncertain descriptor for absent or matching expected ID, refuses a different ID, and revalidates after FIFO and awaits. This matches pgwire's wire-IDLE failed-BEGIN behavior at `src/runtime/pgwire-protocol-handler.js:679-695` and `src/runtime/pgwire-transaction-outcome.js:155-170,215-225`. |
| N2 one absolute control turn | **CLOSED.** D:438-461 includes FIFO wait, INSERT and read in one checked absolute deadline and uses the gateway's deadline-bearing `timeoutBudget`, whose remaining time is recomputed in `src/control-plane/control-plane-system-table-gateway-options.js:83-100`. |
| N3 aggregate retention/sweep bound | **PARTIAL; P1.** D:463-526 supplies validated defaults 100/1048576/16, a transaction-owned reservation, rotating cohort, existing backoff and folded diagnostics. Allocation order and two exact lifecycle exits remain wrong or incomplete. |
| N4 canonical domains/bytes | **PARTIAL; P2.** D:528-581 uses current mode/epoch domains and a fixed complete 15-field encoding. The vector is correct, but the common reader/producer initial-value clause rejects the advanced rows the design promises to recover. |

## Remaining findings

### P1 — HIGH — capacity is acquired after allocation and does not cover the exact release lifetime

N3 says the BEGIN FIFO first “builds the exact canonical initial-row bytes and
64-byte lowercase-hex idempotency key” and then reserves their measured bytes
(D:483-490). A session string has no design-level maximum (N4 D:533-536), and
the public engine entry accepts a supplied session ID
(`src/query/sql-query-engine.js:227-233`). Therefore the operation can allocate
the full oversized encoded buffer before the 1 MiB owner refuses it. The design
does not yet provide the claimed preallocation pressure boundary.

The release list has two independent lifetime gaps. It releases when the same
object becomes ACTIVE (D:493-496) but does not require its retained canonical
buffer and key references to be cleared before decrementing the counter. B3
mutates the same object to ACTIVE (D:273-274), so released capacity may still
have retained bytes behind it. Conversely, the valid matching-advanced-row path
removes the uncertain object and hands the row to normal recovery (D:274-276),
but that path is absent from N3's release list. It can permanently leak a count
and byte reservation after a legitimate recovery.

The bounded correction is mechanical and remains transaction-owned:

1. Capture and validate the fixed fields once, compute the exact encoded length
   with checked integer arithmetic, and reserve count plus every retained
   canonical buffer/key byte before allocating the encoded buffer, key string,
   DWC candidate, or issuing delivery. A failed reservation exposes no ID or
   retained copy.
2. Store one retained canonical buffer and one key on the exact candidate. Any
   additional owner-retained copy must consume the same reservation; hashing may
   stream the fixed pieces instead of materializing a second key-input buffer.
3. On exact initial success, synchronously drop the byte/key references and then
   release the exact token before or with the ACTIVE transition. On matching
   advanced state, exact-object removal/handoff must likewise drop and release
   that token once; a stale callback may release neither. Collision, terminal
   no-effect, and process retirement retain their stated exact release rules.
4. Add low-byte evidence that refuses before buffer/candidate/delivery
   allocation, plus separate exact initial-success and advanced-row handoff
   cases proving bytes and count each return once and can be reused.

The defaults, rotating 16-item cohort, existing defer/backoff, folded diagnostic
shape and deadline non-release rule are otherwise coherent.

### P2 — HIGH — the reader's initial-value rule excludes legitimate advanced rows

N4 opens by saying “the strict reader and producer use the same canonical
validators” (D:530-531), then requires `status=ACTIVE`, open/empty participant
state, `commit_mode=NOT_SELECTED`, zero frozen participants and null decisions
(D:544-548). Those are correct producer values for the first INSERT, but an
authoritative row that has advanced to frozen participants, PREPARE/COMMIT
progress or a decision must differ. D:550-552 and B1/B3 expressly require such
matching rows to preserve their progress and enter normal recovery. Applying
the stated common validator makes them INVALID and strands that required path.

Separate the two validations explicitly:

- the attempted producer/digest row must contain the exact 15 fields and exact
  initial constants in D:553-560;
- the authoritative reader must require an own complete row and validate all
  columns under their general persisted domains, then compare only the six
  immutable creation fields for same creation versus foreign collision; and
- a same-creation advanced row must pass the existing normal recovery row and
  participant-census validation without being compared to initial mutable
  constants. Malformed or incomplete mutable state remains INVALID/recovery
  hold and never becomes collision authority.

The fixed vector itself is correct. Independent construction from D:562-575
produced the stated 183-byte row with SHA256
`3a203ee75b7404a614e9061d958d3c18eacdbf70ecb6d984f17aec50de67124c`
and the stated 254-byte key input with SHA256
`d9ff43857c5514ccf70b808cfa2468a018321beeb4c805d234d2ede5cc1ac9a7`.

## Complete 63-item matrix

`OK` means coherent at proposal level and still requires the future
implementation/evidence packet. `REVISE` points to a remaining finding above.
`LIMIT` records an explicit honest scope ceiling rather than a defect.

| Item | Result and concrete evidence path |
| --- | --- |
| A1 | **OK.** D:240-259 gives one creation gate to BEGIN, statement/direct read-write, enlistment, commit/rollback, shutdown and recovery; N1 D:405-436 adds the real unbound wire retry without exposing the unusable projection. |
| A2 | **OK.** D:221-231 and D:330-346 separate same creation, specific PK conflict, definitive rejection and uncertainty; wrong/incomplete evidence never reaches collision. |
| A3 | **OK.** N2 D:438-461 preserves the original deadline and gives post-expiry reconciliation one checked absolute control turn captured before FIFO, with no renewal. |
| A4 | **OK.** D:204-238 uses the actual explicit-key gateway delivery and exact-key reader; APPLIED/inferred envelopes do not supply no-effect proof, and four reader states remain canonical. |
| A5 | **OK.** Foreground plain or bound BEGIN and the existing recovery sweep are reachable triggers (D:263-271,405-436,505-519); no gateway event is invented. |
| A6 | **REVISE P2.** The six immutable fields and current identity are captured once, but D:530-548 applies initial mutable constants to authoritative advanced reads. |
| A7 | **OK.** D:515-526 and D:589-590 require held first ID, reservation, oldest deadline, captured reason and durable effects; diagnostics never substitute a new ID. |
| Y1 | **OK.** Real same-socket unbound BEGIN reaches the raw exact descriptor (D:405-436); the existing unref sweep remains the only background wake (D:505-519). |
| Y2 | **OK.** Unavailable/invalid reads retain frozen ID, row bytes, key and original deadline (D:280,315-328,493-503); expiry releases nothing. |
| Y3 | **OK except P1 teardown.** Mismatch, pressure, deadline, stale callback, terminal and shutdown exits are typed/loud; P1 requires the exact advanced release exit to be explicit. |
| Y4 | **OK.** One owned reconciliation runs inside the existing session FIFO; the sweep calls it without a nested queue, and DWC's private failure policy is not another waiter (D:261-281,348-363). |
| Y5 | **REVISE P1.** Defaults bound descriptors to 100, canonical bytes to 1 MiB and sweep work to 16, but the byte cap is checked after allocation and can leak/release early across lifecycle exits. |
| Y6 | **OK.** Same INSERT bytes/key, storage PK and serialized apply make late-first/redelivery converge on one row and no duplicate participant work (D:204-238). |
| Y7 | **OK.** Deadline, generic constraint, stale read and uncertainty cannot renew identity or deadline or enter the bounded re-mint branch (D:226-231,438-455). |
| T1 | **OK.** ACK/APPLIED/no-handler/inferred completion alone is never creation/no-effect proof; exact row plus the specific classified producer result governs (D:204-238). |
| T2 | **OK.** D:263-281,357-363 and 423-426 require exact object, owner key, ID and state after FIFO and every await, preventing retired answers from replacing current bindings. |
| T3 | **OK.** Only specific producer PK refusal plus valid exact-key classification permits collision; generic error, timeout and malformed completion remain uncertain (D:221-231). |
| T4 | **OK.** N2's absolute budget bounds FIFO, INSERT and exact-key read; missing gateway/read availability returns retained uncertainty without a new RPC loop (D:438-461). |
| T5 | **OK as a future requirement.** D:367-386 and 583-590 require the real gateway, SQLite row, controlled late apply and before/after durable evidence, not a scripted terminal boolean. |
| S1 | **OK.** The design keeps the injected coordinator clock, validates clock arithmetic and reuses the existing unref sweep; it creates no timer (D:438-461,505-519). |
| S2 | **OK.** Uncertain creation cannot authorize participant work, rollback or decision on timeout; ordinary recovery roles stay unchanged (D:240-259,313-328). |
| S3 | **OK/LIMIT.** Restart clears volatile descriptor/reservation state while durable rows remain census obligations under the original ID; undurable cross-process reconstruction is explicitly outside scope (D:283-311,493-503). |
| S4 | **OK.** A legitimate pending insertion can settle after transaction expiry within one control turn while activity remains closed and deadline expiry releases no hold (D:313-328,438-455,526). |
| S5 | **OK.** Reconciliation uses existing recovery-eligible gateway delivery/read paths and cannot present an uncertain descriptor as ACTIVE (D:204-238,240-259). |
| R1 | **OK except P1 release accounting.** Exact-object removal/ACTIVE/replacement guards preserve newer owners (D:263-281,357-363); P1 adds matching-advanced reservation teardown without changing row authority. |
| R2 | **OK.** D:283-311 distinguishes live uncertain memory, durable advanced state and a new-process session domain; normal adapters use process/connection random IDs. |
| R3 | **REVISE P2.** Matching advanced rows are promised to preserve participants/progress through normal recovery (D:273-276,377-378), but N4's initial mutable constants would reject them. |
| R4 | **OK.** Same ID/key/bytes plus exact map checks makes late apply and repeated reads idempotent (D:204-238,263-281). |
| R5 | **OK/LIMIT.** Restart MISSING is not no-effect proof and never permits replacement for the retired session; late original rows remain discoverable by ordinary census (D:283-311). |
| C1 | **REVISE P1.** The design adds a synchronous owner reservation before DWC install/delivery, but it currently materializes the variable buffer/key before obtaining that reservation. |
| C2 | **OK.** N1/N2 and B3 require exact object, ID, owner binding, state and deadline revalidation after FIFO, delivery and read awaits (D:263-281,423-455). |
| C3 | **OK.** Foreground retry, sweep and original BEGIN converge through one session FIFO and one exact INSERT attempt identity (D:261-281,405-436). |
| C4 | **OK.** Timer, shutdown, replacement and callback races use the same gate; stale callbacks are typed no-ops and cannot release successor capacity (D:263-281,493-503). |
| C5 | **OK.** Session ID owns FIFO/owner-key contention while transaction ID owns the durable row; both are rechecked around awaits (D:423-426). |
| F1 | **OK.** The supplement inventories the production SQL-transactions INSERT/read and normal census/recovery dependencies; it does not add a private reader or ledger (D:204-238,330-346). |
| F2 | **OK.** Control unavailability retains identity and uses explicit BEGIN plus the independent existing sweep; it neither erases the hold nor depends on a new availability event (D:261-281,505-519). |
| F3 | **OK.** Plain same-socket pgwire BEGIN now reenters the raw owner binding; explicit matching/wrong-ID behavior and one absolute existing query budget are specified (D:405-461). |
| F4 | **OK.** Queue, INSERT and read share one pre-FIFO absolute deadline; no two full relative timeout windows or renewal remain (D:438-461). |
| F5 | **OK.** D:592-595 adds no ledger, attempt-status API, raw SQL path, second retry scheduler or local fallback. |
| H1 | **OK.** Frozen diagnostic and future matrix require an actually engaged first INSERT, response loss/late apply, wrong/incomplete rows and dropped-descriptor semantic failures, not setup throws (D:367-386,583-590). |
| H2 | **OK.** Required proof names the real pgwire, SQLQueryEngine, gateway and SQLite path, with controlled reply boundaries and no claim that a helper fixture is production proof (D:432-436,583-590). |
| H3 | **OK.** N2 requires deterministic latches for FIFO release, INSERT completion, read start and zero-remaining omission while late-first schedules stay in the matrix (D:457-460,375-376). |
| H4 | **OK except P2 classification split.** Six creation fields, 15 initial columns, completion/read/class/result ID and reservation are recorded; P2 clarifies initial bytes versus advanced read domains. |
| H5 | **OK.** D:367-386 and 583-590 require nonempty before/after durable rows, advanced nonempty COMMIT, emitted operations and nonvacuous wrong/malformed controls. |
| H6 | **OK/LIMIT.** D:592-595 states design-only provenance and keeps source frozen; no normal-startup, crash or compatibility result is inferred. |
| O1 | **OK.** Transaction coordinator owns identity/FIFO/capacity, SQL persistence owns classification, gateway owns delivery/read evidence and DWC consumes a private policy (D:29-43,348-363,463-503). |
| O2 | **OK.** Exact delivery answer, four-state reader and private REMOVE/RETAIN disposition are typed separate interactions; booleans/labels cannot grant retention (D:78-118,348-363). |
| O3 | **REVISE P2.** Invalid evidence refusal and legitimate advanced recovery are both required, but the N4 common validator cannot currently admit the latter. |
| O4 | **OK.** Unavailable/invalid evidence retains the exact descriptor; later current matching evidence reenters through the same owner and cannot be vetoed by stale callbacks (D:263-281,423-426). |
| O5 | **REVISE P1.** Count/cohort and session FIFO bounds exist, but allocation precedes reservation and release accounting can diverge from owned bytes. |
| O6 | **OK.** Plain/matching BEGIN provides foreground reentry and the existing unref sweep/backoff supplies the only background wake; no dead registered retry or invented event is claimed (D:405-436,505-519). |
| O7 | **OK.** Client expected ID, cached/projection state, gateway labels and diagnostics never become persistence authority (D:204-238,405-426). |
| O8 | **OK as a future requirement.** D:583-590 requires exact descriptor/reservation/key/bytes, producer/read classification, durable rows and effect fingerprints; implementation must add exact source hashes. |
| O9 | **OK.** No alternate remint, force/boolean path, raw read, new ledger, scheduler or global readiness barrier is added (D:592-595). |
| O10 | **OK with P1/P2 added to landing scope.** Future metadata must couple coordinator, DWC, persistence, recovery and pgwire witnesses, including preallocation/release and advanced-row validation controls. |
| J1 | **OK.** N2/N3/N4 require positive safe limits, checked addition, canonical nonnegative safe timestamps/epoch and refusal of unsafe, fractional, nonfinite and negative-zero values (D:438-461,476-481,533-548). |
| J2 | **OK except P2's mutable domain.** Exact key and fields are own data; dense 0/1 rows are required. Initial producer columns are complete, while P2 requires complete general-domain advanced read validation. |
| J3 | **OK.** Fixed fields, row slot, producer answer and disposition are captured once before encode/hash/compare/policy; post-await checks use the captured exact object (D:208-214,332-340,423-426). |
| J4 | **OK.** Accessor/inherited/prototype-polluted rows cannot grant equality/collision; the fixed encoder does not enumerate objects or coerce values (D:332-340,562-581). |
| J5 | **OK.** N4 pins primitive ID/session/mode/numbers, exact TRANSACTION_MODE values and existing epoch predicate; boxes/exotics are INVALID (D:533-548,577-581). |
| J6 | **OK.** Own data descriptors, no iterator/accessor/coercion and fixed field reads follow the existing strict-own boundary without expanding to an arbitrary hostile host model (D:332-340,562-581). |
| J7 | **OK.** N4 pins type tags, canonical decimal digits, fixed field order, explicit NUL-separated prefixes and SHA-256; the independently recomputed vectors match (D:553-575). |
| J8 | **OK except P1 preallocation.** The read result is own dense cardinality 0/1 before field capture (D:332-340); P1 requires length computation/reservation before materializing a possibly oversized canonical buffer. |

## Required bounded round-four correction

One short amendment can close both findings without changing the accepted owner
or recovery shape:

1. split canonical encoding into capture/checked-length/reserve and then one-copy
   allocation, with explicit exact-token byte/key drop and release for initial
   ACTIVE, matching advanced handoff, collision, terminal no-effect and process
   retirement; and
2. state that initial mutable constants belong to producer/digest validation,
   while an authoritative read uses general persisted row domains and hands a
   same-creation advanced row to normal recovery.

Keep N1's raw same-session reentry, N2's one absolute deadline, N3's
100/1 MiB/16 defaults and rotating existing sweep, and N4's fixed 15-field
encoding and vectors unchanged. Future evidence must add low-byte refusal before
allocation, exact release/drop for both initial and advanced success, and an
advanced nonempty COMMIT row accepted by the reader without weakening malformed
or wrong-key refusal.
