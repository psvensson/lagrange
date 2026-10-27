# Independent D1 review: REVISE

Reviewed candidate **e1d26e0eb2e0947f56440427fc1be5ccb56c65a2** against
**b32f0eca960891cf937655077616e77a7e25e47b** on the same host. The compact
prefix mechanism works for honest acknowledgements in the measured schedules,
but this candidate does not satisfy the complete D1 acceptance. Two changes
are required: preserve exact ACK identity semantics across reclamation, and
bound admitted owed debt at its owner. No source approval, Quest closure,
publication, merge or release approval is given.

## Identity and custody

- Reviewer: `subagent:/root/cdc_d1_review`, independent of the author.
- Candidate author tree: `/mnt/data/peter/projects/.worktrees/cdc-d1-reclamation-20261028`.
  HEAD was the candidate and clean at intake and final inspection.
- Reviewer candidate tree: `/tmp/session-worktree-jgoTxb/tree`, created with
  `node scripts/session-worktree.js snapshot` after inspecting the utility.
- Reviewer base tree: `/tmp/session-worktree-jgoTxb/base`, detached at the full
  base SHA above. Source is unchanged in both reviewer trees; only `review/`
  artifacts are untracked in the candidate tree.
- Integration reference supplied: `af8a0381be10bebbb3daf78bd331f7aa3fcacbbf`.
  Read its owner decision and retained-seed log line 181. The integration tree
  was not edited or tested here. It had advanced to
  `840d99ab9e638ca10f4e75aa50fd9b717d97b531` at final inspection; no claim below
  is about that composed head.
- Host: `peter-System-Product-Name`; Node `v22.23.2`; measured 2026-10-25.
  The local thermal gate passed (CPU 64 C, NVMe 68 C); committed test runners
  also applied their thermal policy. No remote workload was launched.
- Steering was read at the supplied primary checkout, then reconciled with
  the candidate's AGENTS, rules and router in that order. Candidate steering
  revision is 2026-10-26, last steering commit
  `be968204dd298c9da91c3bc99efdfba0e4ea1e1d`.
- Inputs: D1 design, accepted D2 r2 and D4 stage-A reports, D4 design and
  retained-seed log line 146, owner-review decision 4, runtime contracts,
  authority-and-recovery, review templates, test guidelines, home-lab policy.
  Historical reports informed attacks and were not substituted for measurements.

## Required changes

### F1: a compact position is accepted as proof of an arbitrary event identity

**Candidate regression; blocking for the D1 replay-distinguishability contract.**

`src/partition/partition-cdc-obligation-ledger.js:228-246` labels every coordinate
at or below the prefix `RECLAIMED`, including positions with no source event.
`src/partition/partition-cdc-obligation.js:230-234` takes that branch before
the digest check at lines 240-242. Lines 300-309 then return success,
`alreadyDelivered`, `alreadyReclaimed`, and `REPLAYED`. The prefix proves that
no actual owed row remains below it; it does not prove that the supplied
`eventKeyDigest` ever belonged to the supplied position.

Independent `ack-identity` witness through the real acknowledgement proposer
and committed application owner:

| Request after three events drained | Base | Candidate |
| --- | --- | --- |
| Exact original ACK replay | success, alreadyDelivered=1 | success, alreadyDelivered=1, alreadyReclaimed=1 |
| Same position, different digest | `cdc_acknowledgement_position_mismatch` | success, alreadyDelivered=1, alreadyReclaimed=1 |
| Source log index with nonexistent ordinal 100 below the prefix | `cdc_acknowledgement_unknown_event` | success, alreadyDelivered=1, alreadyReclaimed=1 |
| Generation-origin log index, which never emitted CDC | `cdc_acknowledgement_unknown_event` | success, alreadyDelivered=1, alreadyReclaimed=1 |

The invariant assertion is **red on candidate, green on base**, not a setup
failure. See `logs/ack-identity-candidate.{jsonl,stderr}` and
`logs/ack-identity-base.{jsonl,stderr}`. Reproduce from the candidate tree:

```sh
node review/d1-independent/probe.mjs . ack-identity
node review/d1-independent/probe.mjs /tmp/session-worktree-jgoTxb/base ack-identity
```

The candidate design explicitly acknowledges the loss in section 5.2; documenting
it does not satisfy preserving distinguishability. The existing O7 witness was
also changed from checking a wrong digest at a valid delivered position to a
wrong digest only at a retained position (`test/partition/partition-cdc-obligation.test.js:478-483`).
The retained-seed correspondence owner still requires a real source, ordinal
zero and matching digest (`src/bootstrap/seed-retained-partition-effects.js:130-144`).
Its meaning and the live ACK answer therefore diverge for these commands.

**Evidence ceiling:** this demonstrates removed validation at the private
consensus/application boundary and false delivered evidence. It does not show
that an honest delivery lane manufactures the malformed command, nor claim
that a valid owed row was lost in an ordinary delivery schedule.

**Narrow repair boundary:** keep one ledger progress owner, and distinguish a
positional reconciliation fact from a new event-identity claim. The existing
source lane may reconcile its own known-valid pending positions against a
committed prefix. A fresh ACK must not acquire exact-event success merely
because its coordinate is old. Resolve an exact previously committed command
through the existing authoritative command/outcome owner where available;
otherwise expose the loss of identity evidence as a typed compacted/unknown
identity outcome with an owned retry/reconciliation consequence. Preserve
deterministic legitimate replay and the retained-row digest checks. This is a
boundary proposal, not an implemented or verified replacement. Do not solve it
by retaining an unbounded digest/tombstone per event or adding a second progress
authority. Any contract change requires explicit owner treatment rather than
another weakening of O7.

### F2: the new backpressure bounds completed holes, not admitted owed work

**Inherited production gap, but blocking for complete D1 acceptance as stated.**

Owner-review decision 4 explicitly requires pending work under budget and
backpressure without silently dropping it. The design's section 5.3 labels
owed growth as pending work and names the subscriber lifecycle owner, but
provides no count/byte admission bound. D2 reduces which tables record; it does
not bound updates to those tables while a subscriber is unavailable.

`retainedDeliveredBackpressured` at
`src/partition/partition-cdc-obligation-delivery.js:531-538` counts only retained
delivered rows plus volatile pending acknowledgements. The recorder at
`src/partition/partition-cdc-obligation.js:164-171` inserts every recorded event.
The write path's proposal capacity (`partition-service-raft-write-commit.js:321-342`)
is released by the source write's own commit, independently of later CDC debt.
`startAdmittedPartitionWrite` at lines 441-453 checks cutover, reservation and
leadership; none of those accounts for accumulated CDC debt.

Independent measurements with a registered, refusing subscriber and only ten
live application rows:

| Accepted writes | Candidate owed rows | Candidate ledger b-tree pages | Pending ACKs |
| --- | --- | --- | --- |
| 1000 | 1000 | 86 | 0 |
| 2000 | 2000 | 173 | 0 |
| 3000 | 3000 | 256 | 0 |
| 4000 | 4000 | 340 | 0 |
| 5000 | 5000 | 427 | 0 |
| 6000 | 6000 | 511 | 0 |

All entries apply. This is `:memory:` SQLite b-tree allocation and row-count
evidence, not a filesystem/RSS measurement. The source inspection proves that
no finite CDC count/byte threshold is consulted on the path; 6000 is a witness
population, not a proposed product limit. The same-host base also grows to
6000 owed rows. After the subscriber recovers the candidate delivers all 6000,
returns to zero ledger rows and one progress row; safety and eventual progress
are green, admitted-debt boundedness is not.

To exclude a direct-apply-only artifact, `pressure-ingress` first retains 2048
owed rows, then calls the actual `PartitionService.executeQuery`, observes its
consensus proposal, applies that proposal, and receives `success:true` with
the durable commit witness at log index 2051. The ledger now owes 2049. Both
heads behave identically. See `logs/probes-candidate-attempt2.jsonl`,
`logs/probes-base.jsonl`, and `logs/pressure-ingress-{candidate,base}.jsonl`.

```sh
node review/d1-independent/probe.mjs . owed-pressure
node review/d1-independent/probe.mjs . pressure-ingress
node review/d1-independent/probe.mjs /tmp/session-worktree-jgoTxb/base pressure-ingress
```

**Owning repair surface:** the durable CDC ledger supplies authoritative debt;
the existing partition write admission/proposal owner must propagate bounded
pressure before accepting further event-producing writes. Pair that admission
with the atomic recorder for ordinary statements
(`partition-service-entry-apply-base.js:686`) and participant operation batches
(`partition-participant-transaction-apply.js:372,404`). The existing transient
proposal queue alone is insufficient. Count/byte reservation, multi-operation
transactions, leader changes and concurrent proposals require one consistent
owner contract; ACK application and draining must remain possible at the bound.
Do not delete admitted debt, use subscriber-local counts as replicated
authority, or silently reinterpret the acceptance as a delivered-row-only bound.
This can be an explicit dependent repair unit; D1 completion remains withheld
until its required bound is supplied.

## Positive measurements and limits

All log paths below are under this artifact directory.

| Witness | Measurement | Evidence |
| --- | --- | --- |
| Existing D1 a-f, O1-O21, retained-seed owner tests | 200 assertions pass | `logs/owning-tests.log` |
| Native custody handoff and D4 hydration handoff | 4 assertions pass | `logs/handoff-candidate.log` |
| Subscriber registration during captured awaited delivery | A is blocked, B registers and reads P=3, 600 later events commit; B receives all 600 above P; final owed=0, rows=0 | `probe.mjs`, `registration-race` in `logs/probes-candidate-attempt2.jsonl` |
| Same registration schedule on base | No missing events, but 601 delivered rows remain | `logs/probes-base.jsonl` |
| File-backed restart with compact prefix plus lost ACK | 20 delivered events compacted; 7 still owed; close/reopen preserves both exactly; only those 7 redeliver and settle, final reclaimed=27 | `restart` in candidate/base JSONL; retained databases `/tmp/d1-review-restart-Wklcq8` and `/tmp/d1-review-restart-iWWHgL` |
| Reclamation rollback | Applied-state trigger raises `SQLITE_CONSTRAINT_TRIGGER`; delivered flags, prefix and applied index roll back together; retry and drain succeed | `rollback` in candidate/base JSONL |
| Provisional hole | Candidate retains at most 1024 delivered rows, pending high-water 256 in this schedule, observes ACK backpressure, then drains all 1600 after release; base retains 1599 delivered rows with no such backpressure | `holes`/`holes-release` in candidate/base JSONL |
| Lexicographic source index/ordinal holes | Out-of-order completion yields reclaimed counts 0,0,1,1,1,4,6,8; source through=30 is separate from advancing ACK=88 | `ledger-probe.mjs`, `logs/ledger-probe.jsonl` |
| Per-apply reclamation bound | Synthetic existing delivered backlog of 5000: first apply deletes exactly 4096, next 904; final source through=5000, advancing marker=5003 | `ledger-probe.mjs`, `logs/ledger-probe.jsonl` |
| ESLint, impact registry | Pass; registry reports 71 contracts/44 coupled pairs | `logs/eslint.log`, `logs/impact-contracts.log` |
| Scoped complexity | Same inherited handshake complexity 26 on both heads; no candidate addition | `logs/complexity-{candidate,base}.log` |

The main independent witness uses real PartitionService, SQLite application
transactions, ledger, registration, lane, proposer and write admission owners.
Its consensus port is controllable; subscriber receipts are built by the
existing acknowledging test subscriber, not by native recipients. It is not
physical-host, network-failure or full native-delivery certification. The
existing native custody test supplies narrower native evidence. No source was
repaired to produce approval.

The first independent rollback script incorrectly assumed the first flushed
ACK contained all five newly applied events; the captured-tail lane legitimately
flushed only one. Its assertion failed after showing correct atomic rollback.
That verifier error is preserved in
`logs/probes-candidate-attempt1.{jsonl,stderr}`. The corrected witness asserts
against the command's actual named count and then drains the rest. The
candidate's production bytes were unchanged.

Snapshot implication: `src/raft/snapshot-checkpoint-store.js:373` backs up the
whole SQLite image, so it does not select out the new progress table. However
`src/partition/partition-snapshot-cadence.js:8-15,60-78` still reports the
rs-raft checkpoint path unsupported. This review establishes neither a new
snapshot-install acceptance nor full F-SNAP closure. The prefix and owed rows
must travel atomically with application state in any future supported path.

The fixed 4096 summary reduction in retained-seed inspection is explicitly
restricted to foundation history (`seed-retained-partition-effects.js:233-255`),
not a general post-snapshot census. The measured retained-seed tests include
typed pre-D1 refusal and malformed progress fields; that observation grants
no startup rights.

## Same-host inherited failures

`npm run test:file --` was run on both exact source heads with the same three
files. Both report 3 failed files / 16 assertions, with the same nine failed
cases. Raw outputs are `logs/inherited-{candidate,base}.log`.

- `partition-cdc-delivery-progress.test.js`: one failure, null `.prepare` at
  the fixture setup for the one-payload-per-await case.
- `partition-cdc-topology-progress-currentness.test.js`: six currentness
  replacement cases and one captured-group omission case (seven failures).
- `message-group-native-provisional-route.test.js`: leader resolution is null
  instead of `mg-provisional-target-l`, before the migrated ACK assertions.

These are not D1 regressions and do not turn into passing delivery evidence.
The latter is target-not-reached for the D1 acknowledgement assertions.

Prior author lab evidence was inspected at
`/tmp/claude-1000/-mnt-data-peter-projects-lagrange/c74561e1-2969-4696-bd5a-1d3a410f38a7/scratchpad/d1`.
Its candidate log names the exact e1d26e0 head, lenovo-laptop, 957 files,
887 pass/70 fail. Its base-cone log names snapshot
`92a967c8602d0566dede6f4409353087b1f55699`, 910 files, not the exact b32 source
head used in this independent comparison. Those are historical runs, not an
independently rerun clean corpus claim. A new broad lab run would not resolve
the two source-bound blockers and was not launched.

## Checklist dispositions

PASS below is bounded by the evidence ceiling above; SOURCE means inspected,
not an independently measured native/physical claim. N/A names a scope reason.

| Recovery/replay item | Disposition and evidence |
| --- | --- |
| 1 Durable authority, no stale replacement | PASS: committed transaction owns prefix and rows; restart/rollback witnesses; ledger `:297-313` |
| 2 Restart versus live registration | PASS: tenure reset in lane `:110-159`, registration epoch checks `:644-654`; restart and registration-race |
| 3 No empty registry laundering debt | PASS: `drivePrecondition :507-514` returns NO_SUBSCRIBERS; recorder retains owed work; no per-subscriber durable entitlement exists in current contract |
| 4 Replay/dedup/rollback | PARTIAL: rollback and exact replay pass; F1 loses exact-event discrimination for fresh below-prefix claims |
| 5 Absence not completion | REVISE: F1 promotes position-only absence below prefix into exact delivered success; unknown above prefix remains refused |
| 6 Useful recovery/safety/bounds | Safety/progress PASS in lost-ACK restart and finite refusal; bounded admitted debt REVISE F2 |

| Concurrency item | Disposition and evidence |
| --- | --- |
| 1 Atomic committed apply | PASS: applied-state trigger rollback, ledger `:297-313`, acknowledgement `:282-289` |
| 2 Check-await-act revalidation | PASS: lane `:476-494,620-654`, progress `:42-48`; captured-registration witness |
| 3 One durable settlement winner | PASS for valid commands: delivered flag update and prefix mutation occur in one application; O7/exact replay; F1 qualifies identity claims |
| 4 Timer interleavings | PASS: single-flight lane `:677-702`; no await in reclaim; provisional-hole pressure/release witness |
| 5 Identity/lock scope | SOURCE/PASS: partition-owned connection and lane; wrapper plus subscription epoch; registration-race and same-replica restart |
| 6 Timeout/cancellation custody | SOURCE: invocation `:173-273` retains actual child cleanup after timeout, active invocation gates new dispatch; D1 does not change custody; no new physical cancellation experiment |

| Retry item | Disposition and evidence |
| --- | --- |
| 1 Retry fires or typed stop | PASS: backpressure schedules existing retry `:574-580`; hole release completes without new source traffic |
| 2 Frozen bound/unreadable state | SOURCE: captured scan tail bounds each pass; SQLite errors propagate, no fallback success added; no I/O-failure retry certification |
| 3 Observable exits/log bounds | SOURCE/PARTIAL: named lane/flush states and held reason; subscriber holds log on failures. No aggregate log-volume bound demonstrated; F2 retains unresolved source-pressure requirement |
| 4 Mutual suppression | PASS in hole schedule: lowest owed row exempt from retained-delivered cap, release frees prefix and resumes following debt |
| 5 Worst-case attempts/logs | SOURCE: pure timer exponential retry starts 50 ms and caps at 10 s (roughly six timer attempts/minute/partition after ramp); committed-entry drives can add attempts. No finite total outage/log bound claimed; F2 |
| 6 Late-success duplicate effects | PASS for legitimate replay and lost ACK: O9/O14 plus independent restart; F1 qualifies arbitrary claimed identity |
| 7 Reset semantics | SOURCE/PASS: aggregate exact coverage precedes acknowledge; no transport ACK-only path added; old O3/O15 pass |
| 8 Finite failure recovery | PASS: 6000 refusing-source debt and 1600 provisional-hole debt drain after release; resource boundedness separately fails F2 |

| Owner interaction item | Disposition and evidence |
| --- | --- |
| 1 One standing/prefix owner | SOURCE/PASS: ledger exports the standing and prefix predicate; no new per-subscriber progress authority. Bootstrap's independent correspondence reduction is observation only |
| 2 Typed boundary | REVISE F1: RECLAIMED is positional but consumed as exact-event success; caller/observer semantics must be aligned |
| 3 Paired reclamation/no-loss | PASS in registration-race and D1c; candidate reclaims, base retains, neither misses post-P events. Required pending-budget pair fails F2 |
| 4 Stale then fresh evidence | PASS: refusing subscriber and provisional hole resume through same lane on release; registration changes invalidate captured branches |
| 5 Pressure/backoff | PARTIAL: 1024 completed-hole cap works, no bypass; owed ingress budget absent F2 |
| 6 Wake/release | PASS: afterCommit settlement `:161-186`, retry `:449-471`; hole drain and lost ACK witnesses |
| 7 Projection authority | SOURCE/PASS: diagnostics/counts are observations; readHydrationImage uses durable applied index, not CDC max/source marker |
| 8 Controlled negative | PASS: exact base/candidate shared witness; ACK identity candidate-red/base-green; independent reclamation base retains rows; no negatives included in positive certification |
| 9 No alternate escape hatch | SOURCE: no new fallback/retry owner; F1 is a weakening inside the canonical decision path rather than a second path |
| 10 Contract/registry/proof alignment | PARTIAL: registry checker passes and touched owners are registered; new D1 witness is not explicitly in impact-contracts' named tests, though its imports/metadata select it. More importantly F1's altered identity semantics lack an accepted replacement contract |

| Harness fidelity item | Disposition and evidence |
| --- | --- |
| 1 Behavioral red | PASS: ACK identity assertion fails after actual proposer/apply; base green; inherited setup failures explicitly separated |
| 2 Binding doubles | PASS with ceiling: controllable consensus and acknowledging subscriber documented; production ledger/lane/apply engaged |
| 3 Time ordering | PASS: virtual time advances existing flush/retry owners; no timeout constants changed; registration uses an explicit pending promise |
| 4 Complete rows | PASS: generated committed source commands and canonical ACK builder; pure ledger algebra explicitly synthetic |
| 5 Nonvacuity | PASS: 601 race obligations, 6000 refused obligations, 1600 hole obligations, 7 persisted lost-ACK obligations |
| 6 Real entry owners | PASS: PartitionService, committed apply and proposer; separate actual executeQuery after2048-debt witness |
| 7 Evidence ceiling | Explicit: local SQLite/control-port tests, narrow native custody test; no new distributed lab, physical crash or native snapshot proof |
| 8 Failure fidelity | PASS: first verifier failure retained/corrected; nine same-host inherited failing cases retained; native route target-not-reached separated |

Transport-delivery template: ACK-is-not-processed is preserved by the unchanged
committed-receipt classifier and native custody witness; late response and
undeliverable behavior are unchanged/source-reviewed through the invocation
owner, not recertified here. No new router response shape or router stub is
introduced by D1, so those shape-specific items are N/A. Admission template:
the retained-delivered gate consumes fresh ledger state and has a measured
release path; the missing durable-debt admission is F2, and below-prefix
terminal/success classification is F1. Existing enums/reason shapes are used.

## History and external failure-mode cross-check

Project history: `git log` of the lane/progress owners shows D1 atop
`947107b63` (preserved reviewed delivery R2), before that `681da1dc1` and
`4151a3ab4`. Inspecting `947107b63` confirms the subscriber-set and epoch
revalidation already existed; D1 did not introduce it. D4's accepted stage-A
commit is `d562a0839a11e91dd382969637f9fff21da20f2d`. Its negative showed the
read-before-register gap; this review specifically attacked the remaining
captured-delivery ordering. D2 r2 acceptance is
`8fdc79a4ab00201c29f693a9e6d91c0a03320a61`; its recording policy does not supply
a debt budget. No prior reclamation implementation was found in the targeted
history search beyond e1d26e0.

Primary external sources were consulted as failure-mode checks, not as Lagrange
contracts:

- [etcd v3.6 API: watch](https://etcd.io/docs/v3.6/learning/api/#watch-api):
  historical watch requests below compaction receive a compact revision and
  cancellation; progress notification identifies a recoverable revision.
  Applicability: an erased historical identity and a known completed event
  are distinct answers. Limitation: etcd watch retention is not Lagrange's
  all-current-subscriber receipt protocol, so its policy is not copied here.
- [Debezium PostgreSQL snapshots](https://debezium.io/documentation/reference/stable/connectors/postgresql.html#postgresql-incremental-snapshots):
  snapshot/stream interleaving can let a later snapshot read supersede an
  already-seen update/delete, requiring explicit ordering/collision handling.
  Applicability: motivated the concurrent registration, coherent P, and delete
  handoff checks. Limitation: Lagrange reads a synchronous SQLite image plus
  applied position, not a chunked PostgreSQL snapshot; Debezium's watermark
  machinery is not required merely by analogy.
- [Debezium DDD-3](https://github.com/debezium/debezium-design-documents/blob/main/DDD-3.md):
  chunked incremental snapshots use explicit window opening/closing and bounded
  chunk buffering. Applicability: distinguish a bounded in-flight buffer from
  retained upstream history/debt. Limitation: this does not establish a valid
  Lagrange queue size, retention interval or exact ACK admission rule.

## Disposition

Return **REVISE** for the exact candidate. Preserve the successful compact-row,
hole, rollback and handoff mechanisms while repairing the two named boundaries.
Root owns the Quest finding/receipt mutation and assignment of the implementer.
This review made no production edits, commits, pushes, seal changes, baseline
changes or integration mutations. No test process remains running.
