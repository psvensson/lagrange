# Verification: raft-owner authority items A, B, C

Verifier: independent subagent, read-only (no test executed, no worktree written). Subject: branch
`work/raft-frame-delivery-20261121`, head `d3edaa08c`; commits `1d4125c7b`/`bc949308f` (A), `90021de24`/`97ba4431b`
(B), `adfbbed6a`/`f94291812`/`d3edaa08c` (C). All file:line references are at `d3edaa08c` unless a sha is named.
Method: `git show`/`git grep` of the subject commits, the author's record sections 14-17, the eight lab directories.

Labels: **VERIFIED** = read in the code or the lab file at the named sha (nothing was executed by me);
**INFERRED** = reasoned from raft-rs semantics or from code I did not trace to the end.

What the vendored tree let me check: `vendor/raft-rs-wasm/src/lib.rs` and, of the crate, only
`raft-0.7.0/src/{lib.rs,raft_log.rs,raw_node.rs}` are tracked. `raft.rs` and `status.rs` are NOT in the tree at this
commit, so the author's citations of `raft.rs:1207-1232`, `~2312-2322` (become_leader, pending_conf_index,
step_follower forwarding) could not be read; they are INFERRED (consistent with upstream raft-rs 0.7; the
forwarding itself is VERIFIED by the executed red `lab/raftframes-pf-red`).

## Verdicts

| Item | Verdict |
| --- | --- |
| A `currentTermApplied` | **APPROVE** (consumers and merge) |
| B `observeCurrentAuthority()` | **APPROVE-WITH-CONDITIONS**: merge yes; the authoritative-read consumer must not use it as written in record section 15 until B-1 is closed |
| C proposal term fence | **APPROVE-WITH-CONDITIONS**: merge yes (strictly safer than the base); the "leads another term" arm must not be relied on until C-1 is fixed and witnessed; C-2 must be stated or closed |

## A. `currentTermApplied`

Definition (VERIFIED): `raft-rs-status-observation.js:106-109`: `ROLE[status.raftState] === leader &&
BigInt(appliedTerm) === BigInt(status.term)`. `appliedTerm` is the runtime owner's `group.appliedTerm`, not the
store and not the binding:
- applied slice: `raft-rs-runtime-owner.js:1196` (`tailEntry.term`, set in the same synchronous run right after the
  SQLite apply transaction at `:1189`, before `recordAppliedEntry` `:1197`);
- Ready snapshot: `:1301` (`snapshot.term`, only when the snapshot index is above the applied index);
- opening / reconstruction / replacement: `:425` -> `restoreAppliedTerm` (`raft-rs-participation-gate.js:146-159`):
  entry at the durable applied index, else snapshot metadata term, else **hard-state term**, else 0;
- out-of-band compaction/install: `:1015` (same function); fresh bootstrap `:448` (0).

Every state asked about:

| State | Answer | Basis |
| --- | --- | --- |
| fresh leader before its no-op applies | false | appliedTerm is an older term or 0. VERIFIED by `cta-red`/`cta-green` (`atElection` term 1, applied 0, false) |
| after it applies | true | `:1196`. VERIFIED (`afterTermEntry`) |
| leader applied own-term entry, then its conf change | true | conf entry is an entry of its term. VERIFIED red->green (`afterItsConfChangeApplied`) |
| restart, same node leads again | false until the new term's entry applies | restored value <= old term; a restored core is a follower and must campaign (term + 1). VERIFIED by the witness for the entry-at-applied-index path; INFERRED for the two fallbacks |
| snapshot install | snapshot term | `:1301`, `:1015`. Not witnessed; harmless (see below) |
| follower | false | role test |
| term changes without an announced role edge (leader T -> follower -> leader T+2 between two announcements) | a fresh read says leader, term T+2, false until a T+2 entry applies | computed from the status it is shaped with, never from `lastStatus` |

Why this is robust (my own argument, INFERRED from raft-rs election rules): the field can only be true when
`appliedTerm == current leader term`. A stale-low `appliedTerm` can only yield false. Equality can arise only by
applying an entry of the current term in this core incarnation (sets it directly, `:1196`), because every other
writer of `appliedTerm` yields a term at or below a persisted hard-state term, and a core that leads after a
restore leads a strictly higher term. raft-rs delivers for application only entries up to
`min(committed, persisted)` (VERIFIED `raft_log.rs:423-426`), so the applied own-term entry is locally durable.

Findings:
- **A-1 (note, VERIFIED).** `readStatus()` shapes the field from the recorded observation
  (`:1559-1577`, `appliedTerm` captured at `:1470` with the status of the same record), so mid-turn or with queued
  inbound it inherits the cache's staleness in both directions (true for a leader the core has since stopped being).
  The field is exact only on a fresh read (`readGroupStatus`, a queued turn) or through B.
- **A-2 (low, VERIFIED).** `restoreAppliedTerm`'s third fallback returns the hard-state term when the applied
  index has no entry and no snapshot (nothing applied yet). `appliedTerm` is then not "the term of the last applied
  entry". Harmless to A (strict term increase), but B now publishes `appliedTerm` as "the rows' position", and
  `raft-rs-committed-membership-context.js:313` compares against it (pre-existing, outside the subject).
- **A-3 (as the author reported, VERIFIED).** `hasAppliedOwnTermEntry` (`raft-rs-conf-change-admission.js:236-248`)
  keeps its `applied >= pendingConfIndex` fallback when `appliedTerm == 0`. Reachable only for a leader with
  `status.applied > 0` and `appliedTerm == 0`; I found no such state (INFERRED). Left for its owner.

A2 consumers (VERIFIED by grep at `bc949308f`, four readers in `src/`, none elsewhere outside tests/docs):
- `raft-rs-committed-membership-read.js:287` -> `message-group-membership-authorization.js:396-399`
  (`absenceFencesLearnerAction`): its written argument needs exactly "applied an entry of a term above the permit's";
  the new meaning is that fact. Its status is a queued fresh read (`COMMAND_OPERATION[READ_COMMITTED_MEMBERSHIP]`,
  owner `:1723-1725`).
- `message-group-promotion.js:228-232` (`leaderTermApplied`): the workaround's second branch is now implied; harmless.
- `message-group-removal.js:141-150` (`leaderMatchesStamp`): the only reader for which the change is permissive -
  under the old form `true` implied "no configuration change pending", under the new one it does not. The removal
  proof can now be issued with a change pending. The proposal itself is still refused natively
  (`confChangeProposalRefusal` `:355-357` pending deferral; configuration stamp and term in the membership
  transition turn). No path to a second concurrent configuration change found (VERIFIED for the propose step;
  the workflow's handling of a permit issued then deferred is INFERRED, not traced).
- `confChangePending` readers (5 sites) are untouched and its definition is unchanged.

## B. `observeCurrentAuthority()`

B1 non-driving and uncached (VERIFIED): port `raft-rs-operation-port.js:459-460` -> `dispatch` (lifecycle admission
`raft-rs-replica-lifecycle-owner.js:255-272`, closed-port refusal `:353-356`, containment `:151-160`) -> dispatcher
`raft-rs-runtime-owner.js:2326-2327` -> `raft-rs-current-authority.js:96-109`: two `invokeCoreAt` calls, `status`
and `has_ready`. Both are `&self` in the crate (`raw_node.rs:721-723`, `:553-586`) and plain reads in the binding
(`lib.rs:562-564`, `:694-736`). No `enqueue`, `ensureExecution`, `drainInbound`, Ready cycle, store write, apply,
`announce`, `recordStatusObservation`, native status observer, reconstruction or replacement is reachable. Always a
settled turn, so `.result` is never undefined.

Holds (VERIFIED): runtime not HEALTHY (replacing or unhealthy) -> `runtimeRecoveryOutcome`; reseed hold -> the hold;
`RECOVERY_REQUIRED` (including a group awaiting resumption after a replacement, `:738-740`) -> `recoveryOutcome`;
closed / freed handle / generation change -> `refusedExecution` (`:362-373`); retired lifecycle or closed port ->
typed `CORE_REFUSED`. Never a stale object.

B2 per field:

| Field | Source | Mid-turn | Error direction |
| --- | --- | --- | --- |
| role | core in memory | follower/candidate reported at once (i: conservative). LEADER without an own-term applied entry is `NOT_SETTLED` while `group.tail !== null` or `has_ready` (ii) | NOT_SETTLED for a real leader: liveness only. **LEADER can be stale-positive: B-1** |
| leaderPeerId | `status.lead` | as role | same |
| term | core in memory (`hs.term`) | equals durable after each taken Ready (take and `persistReady` are one synchronous run, `:1311-1316`); ahead only while a Ready is held (`:1308-1310`) | high: conservative for refusal. Not to be used as proof with role NOT_SETTLED |
| commitIndex | core in memory | may exceed durable commit and applied | never names an uncommitted entry (INFERRED); not the rows' position |
| appliedIndex (iii) | runtime mirror `group.appliedIndex` (`:1197`, `:1302`, `:1016`), NOT a store read and NOT the core's `applied` | advanced synchronously after the apply transaction | equal to the rows on every apply path of the runtime owner (VERIFIED); may be below the rows after an out-of-band snapshot install until the next turn runs `syncCompactedStorage` (B-3, INFERRED, non-leader only) |
| appliedTerm | `group.appliedTerm` | as appliedIndex | see A-2 |
| currentTermApplied | fresh status + `group.appliedTerm` | exact | - |

Case (ii) holds (VERIFIED by read): at every point where other code can interleave with a turn, the Ready that was
taken has already been written to the store; a Ready not taken shows as `readyHeld`; a multi-voter candidate's vote
requests leave only after its term and vote are persisted (`:1228-1237`); a sole voter that wins inside `campaign`
is covered by `turnPending`/`readyHeld`.

Findings:
- **B-1 (condition; VERIFIED by code read, not executed): a leader with its term applied is reported LEADER
  mid-turn while proof of its deposition is already queued in the same process, and its election clock is
  frozen.** `roleSettled = role !== LEADER || ownTermApplied || settled` (`raft-rs-current-authority.js:59`).
  Interleaving: (1) A leads T with an own-term entry applied; a turn X of A awaits a peer send or the persistence
  admission (`finishReady` `:1238`, `:1262`; admission bound `PERSISTENCE_ADMISSION_WAIT.BOUND_MS = 120000`,
  `raft-rs-runtime-owner-constants.js:240`). (2) A's ticks are commands queued behind X
  (`raft-rs-operation-port.js:392` -> owner `:2149` -> `:1073-1078`): the core sees no time, so check-quorum
  cannot depose it and it sends no heartbeat. (3) B and C elect B at T+1 and commit writes W; B's envelopes at T+1
  reach A and are pushed to `group.inbound` (`:2312`); their drain is queued behind X. (4) `observeCurrentAuthority()`
  on A answers `role: LEADER, term: T, currentTermApplied: true, turnPending: true, inboundQueued >= 1`. (5) A
  receiver following record section 15 ("need not use `settled`; a leader with its term applied is authoritative
  mid-turn") serves a leader-qualified read without W. The author names "a deposed leader whose core has not yet
  received the newer term" as residual; here the process HAS received it and the usual check-quorum bound does not
  apply while the turn pends. Minimal closure without driving anything: report role/leader `NOT_SETTLED` (or a
  named flag) when a queued inbound envelope's `message.term` exceeds `status.term` - a read of the runtime's own
  queue. Independently, the record's guidance must say that B is the replica's local belief, not a linearizable
  read authority (no ReadIndex round, no lease; the binding exports no read-index).
- **B-2 (low, VERIFIED).** `turnPending` is `group.tail !== null`. A resumption started by a status read on an
  unhealthy runtime runs outside the queue (`:1545-1551` -> `replaceRuntime` -> `resumeRuntimeGroup` `:633-669`), so
  `turnPending: false` and possibly `settled: true` while that drain is in flight. Role durability is unaffected
  (argument under (ii)); only the two flags are dishonest.
- **B-3 (low, INFERRED).** See appliedIndex row. Not confirmed: I did not trace `snapshot-install.js`.
- **B-4 (note, VERIFIED).** A throw inside the observation is contained by `containUnexpectedThrow`, which marks
  the group `RECOVERY_REQUIRED` and announces no role (`raft-rs-operation-port.js:151-157`, owner `:264-273`); a
  core trap marks the runtime unhealthy (author states this). I found no throw site in the module.

B3 liveness (VERIFIED by read): a leader that has applied an own-term entry is reported LEADER regardless of pending
turns, so a steadily writing leader does not starve authoritative reads. `NOT_SETTLED` is confined to the window
between election and the first own-term apply; outside turns in that window the answer is LEADER with
`currentTermApplied: false`. If the term-start entry cannot commit (no quorum) the refusal is permanent and correct.
"Turn pending" is coarser than needed only inside that window (the author says so). `settled` itself is false most
of the time on a busy leader: a consumer that gates on `settled === true` would starve; none exists on this branch
(no `src` consumer of the operation at all).

## C. Proposal term fence

C1 every path into a native propose (VERIFIED by grep of `src/raft` and the binding exports):

| Path | Fenced by | Leader at step | Term at step |
| --- | --- | --- | --- |
| immediate `propose` | `invokePrimitive` `:1789-1794`, after `drainInbound` `:2007-2008` | yes | yes |
| queued batch, first | same, via `drainQueuedProposalBatch` `:2121-2129` | yes | yes |
| queued batch, each further member | `finishBatchedPropose` `:1843` | yes | yes (own status read each) |
| `propose-conf-change` raw | `refusedConfChange` -> `confChangeProposalRefusal` (`admission:340-344`), fresh status in the same run | yes | **no** (C-2) |
| typed conf-change operation | `decideTypedConfChangeOperation` (`admission:757-762`) | yes | tenure re-synced per term; not the submitter's |
| `PROPOSE_MEMBERSHIP_TRANSITION` | `confChangeProposalRefusal` + `promotionRefusal(.., currentTerm)` | yes | yes, caller-supplied |
| transfer leader | local `step(MsgTransferLeader)` decided on a fresh read | n/a (no log entry) | n/a |
| read-index | not exported by the binding | - | - |
| inbound `MsgPropose` from a peer | ingress admits it (`raft-rs-ingress.js:44`) and `stepOneInbound` steps it | **no fence** (C-4) | no |

C5 (VERIFIED): the fence's read is `invokeCoreAt(..., 'status')` (`raft-rs-proposal-term.js:59`), a direct core
read in the same synchronous run as the `propose` that follows; it cannot be the cached observation. The submitted
term is `group.lastStatus.term` (`:44-45`), the last announced raw status; both are the binding's decimal strings,
so the strict comparison is sound.

Findings:
- **C-1 (medium; VERIFIED by code read, not executed, no witness): the "leads another term" arm is not answered
  as the record says; it is answered as a leadership transfer in progress, and the write kernel re-proposes on
  that answer.** `proposeUnderSubmittedTerm` returns the dropped-proposal refusal for both arms; then
  `settlePrimitiveInvocation` (`:1783-1785`) -> `answerRefusedProposal` (`:1706-1714`) -> `droppedByLeadershipTransfer`
  (`raft-rs-leadership-transfer.js:164-168`) is true for ANY "proposal dropped" refusal on a core whose status is
  LEADER, so the answer becomes `HOST_FAILURE / leadership-transfer-in-progress / retryable: true`. Interleaving:
  proposal P submitted with announced term T; at its propose step the core leads T+2; refusal built; core is LEADER
  -> reclassified. The kernel's `portDeferralOf` (`partition-service-raft-write-commit.js` ~`:73-78`) treats that
  reason as a port deferral and `proposeWithinDeferralBudget` re-proposes the SAME entry on its own clock; the retry
  records the then-announced term and enters under T+2. What stands between this and the invariant is only the
  kernel's own release of the pending write on leadership loss (`markCommittedWriteProposal` returning false), i.e.
  the kernel, not the port. Also: the non-leader arm answers `CORE_REFUSED / retryable: false`, so the two arms of
  one rule give contradictory answers. Repair direction: the fence's refusal must be its own named outcome (or be
  excluded from the transfer classification by comparing the term), with a witness for the same-node-re-elected
  schedule.
- **C-2 (condition, VERIFIED): the invariant is not enforced for configuration-change proposals.**
  `withSubmittedTerm` returns any non-`propose` command unchanged (`raft-rs-proposal-term.js:43`) and
  `invokePrimitive` fences only `propose` (`:1791`). A raw or typed conf change submitted under leadership T and
  queued across a deposition and re-election is proposed under T+2 if the core leads then; the admission validates
  the core's state at the step, not the submitter's tenure. Record section 16 says "every proposal"; the commit
  message scopes it to non-leaders for conf changes. Either extend the rule or state the exclusion where the
  placement owner will read it.
- **C-3 (low, VERIFIED): the recorded term is the last announced term whatever the announced role.** A proposal
  submitted while this replica was an announced candidate at T+1 is proposed if it wins T+1 ("submitted under no
  leadership" yet proposed). A proposal submitted while an announced follower at T is refused (a leader's term is
  above any term it followed; INFERRED). More generally the port binds to its own last announcement, not to the
  caller's tenure: a caller whose belief lags the announcements gets the newer term recorded. The membership
  transition path's caller-supplied term is the stronger form.
- **C-4 (condition, VERIFIED): ingress still admits a peer's `MsgPropose`.** No sender in this system produces one
  any more (three production `propose` callers, VERIFIED by grep: write kernel, message group, WASM replica; a core
  that does not lead no longer proposes). A `MsgPropose` in flight from a build without the fence is still appended
  by a leader under its own term: no worse than the base, but it is exactly the repaired defect and bypasses the
  rule. With no legitimate sender left it should be a typed ingress refusal (and the local-log guard branch
  deleted) by the raft owner.
- **C-5 (liveness, VERIFIED): `retryable: false` on an answer every caller must retry.**
  - Write kernel: classifies by outcome, `CORE_REFUSED` -> `partition_write_consensus_refused`, "the write was not
    proposed", in `RETRYABLE_WRITE_FAILURE_CODES` and reroutable (`partition-write-kernel.js:443-448`, `:81-95`,
    `constants/errors.js:69-74`). Correct; the flag is carried into the answer as `consensus.retryable: false`
    beside a retryable code.
  - Message group: retryable only through `isRoutingMiss`, which reads `readStatus()` - the cached status
    (`message-group-proposal-routing.js:80-88`, `:98-109`). If that cache still says leader, the refusal is surfaced
    non-retryable although nothing entered the log.
  - WASM writer: any refused proposal finishes the writer as UNKNOWN (`wasm-writer-completion.js:62-64`). In the
    deposed-leader race a write that used to commit through forwarding is now answered unknown. Conservative, but
    not "not proposed, safe to retry".
  The author's choice to keep the core's shape is the cause of C-1 as well; one named retryable refusal would
  remove all three.
- **C-6 (note, VERIFIED).** A refused proposal's turn drains no Ready and announces nothing (`:1776-1786`). A
  spurious refusal from a lagging announcement therefore repeats until another turn (a tick) announces: bounded by
  one tick interval on a scheduled group, not for ever.

C4 mixed versions: harmless relative to the base (the old build has the defect anyway); see C-4.

## D. Evidence (VERIFIED from the lab files: sha in the log file name, `exit.json`, `test-results.ndjson`)

| Run | Sha (file name) | Host | Exit | Result |
| --- | --- | --- | --- | --- |
| `raftframes-cta-red` | `1d4125c7b6f4` | adams-gamla | 1 | 1 file red; the log shows only `afterItsConfChangeApplied` differing (false, expected true) |
| `raftframes-cta-green` | `bc949308fc9c` | adams-gamla | 0 | 12 / 12 files |
| `raftframes-cao-red` | `90021de24752` | adams-gamla | 1 | witness file red, 4 assertions (I read the first failure line only) |
| `raftframes-cao-green` | `97ba4431b5fb` | adam-laptop | 0 | 18 / 18 files |
| `raftframes-pf-red` | `adfbbed6a2fa` | adam-laptop | 1 | both C witnesses red, W4 green |
| `raftframes-pf-green` | `f94291812b95` | adam-laptop | 1 | 26 green, 3 red: `inbound-drain-owned-timer` 7, `runtime-ordering-native-companion` 3 (D3), `transfer-leadership-drain-order` 7 |
| `raftframes-pf-red-consumers` | `adfbbed6a2fa` | adam-laptop | 0 | those three green before the fix |
| `raftframes-pf-tests` | `d3edaa08ca13` | adam-laptop | 0 | 6 / 6 |

The three consumer tests changed in `d3edaa08c` (diffs read): no safety assertion weakened.
- `inbound-drain-owned-timer` 7: only how follower B's turn is held (a stepped heartbeat plus a tick instead of a
  forwarded proposal).
- `transfer-leadership-drain-order` 7: asserts no native `propose`, the tail `[status, status, conf_state]`, and
  the decision after the last delivered envelope; answer assertions (`CORE_REFUSED`, not the transfer reason,
  `retryable: false`) unchanged. Stronger than before.
- `runtime-ordering` D3: "V enters native before the proposal" is replaced by "the proposal never reaches native
  propose"; "V accepted before the selected turn begins" is kept. The decision-after-drain ordering is held by the
  drain-order test and by witness c.

Evidence gaps: at the head `d3edaa08c` only 6 files ran (source is identical to `f94291812`, so the 29-file run
carries over); no `test/partition/**` file is in any C run although C changes what the write kernel receives
(`partition-write-leadership-transfer-committed.test.js` exercises the very deferral C-1 lands in); no full corpus.

## E. Not covered by any witness (a mutant survives)

A: `restoreAppliedTerm`'s snapshot and hard-state fallbacks; `appliedTerm` on a Ready snapshot (`:1301`) and on
compaction sync (`:1015`); the cached-observation pairing (`:1470`). (By the argument above none can make the field
wrongly true.)

B: `readyHeld` in `settled` (a mutant `settled = !turnPending` passes: no witness holds a Ready without a turn);
the `ownTermApplied` term of `roleSettled` (no witness observes a busy leader with its term applied mid-turn, so a
mutant that starves busy leaders passes); each typed hold (unhealthy/replacing runtime, reseed hold,
RECOVERY_REQUIRED, closed, retired); `leaderPeerId` of a non-leader; `inboundQueued`.

C: the term comparison itself (`|| status.value.term !== proposal.submittedTerm`: both witnesses and all three
consumer tests end with a non-leader core); the per-member fence of further batch members (`:1843`: witness c queues
one proposal); recording at submission versus at the step for the immediate path; the answer of the term arm (C-1);
the null submitted term.

## Author claims I could not confirm

- raft-rs `raft.rs` line citations (file not in the tracked tree).
- "timers and writer completion run on the leader" for the WASM service (only `_handleWrite`'s leader gate read).
- "the write kernel ... now tenure-fenced on its side" (another branch; this branch's kernel has no such fence).
- `cao-red` "4 / 4 red, every case reached its observation point" (first failure line read only).
- B's row "applied (runtime's): equal" for the out-of-band snapshot install path (B-3).

Outside the subject, recorded and not absorbed: the off-queue resumption of B-2 leaves `group.tail` null, so
another command could start a second Ready cycle while the resumption's drain awaits a send. Not verified.
