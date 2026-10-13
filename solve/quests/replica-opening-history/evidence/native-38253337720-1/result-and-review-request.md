# Native opening history: measured result and independent review request

Status: focused native history proof PASSED; full selected regressions and global
static gates remain RED. No independent source approval, Quest landing, main merge
or release certification. The existing work branch and review-only PR117 are used.

Input source was 0d9d360049e4d106d4b4e57d58ddd0c0db5420d4. The workflow-only input
commit is 316e5fcdab102ddc562433139d73b3df62748590. The canonical Solver sealed
replica-opening-history against a red seven-receipt probe before source changes.
Measured baseline: 7e2c3e85130590c56da8202ae5079499f3127058.
Measured candidate: ff177c43c60556d6f65d09f7d610fe555fa1a1f3.
Source/evidence publication: 7036fb1bd03144837e00ec040c6ba6ae903bfe42.
Run: 38253337720; artifact: 11748438566.
Archive SHA256: 11629ccf9ad1364824e20f5f86a3890dd9311b6757bcaec0906fc9996cc9b8f1.
The downloaded archive matches that hash. Final hosted tracked status is clean.

## Operator timing ruling

The user explicitly accepts hardware-sensitive elapsed test-case cost within
10x target. The existing test guideline now records 2-second unit and 30-second
integration targets with 20/300-second tolerance ceilings. This is an explicit
performance-policy supersession, not permission to change protocol, election,
lease, retry, seed or caller deadlines; assertion and runner kill bounds remain.
Historical outputs are not rewritten or relabeled. The earlier 5380.348862 ms
boundary case is tolerated under the new ruling. The current same boundary case
is 8892.961534 ms, 4.446480767x its 2000 ms target, and also tolerated. Every
measured case in this run is inside the applicable 10x ceiling.

## Owner interaction corrected

The existing lifecycle row now owns a monotonic exact-incarnation
native_history_state. A new allocation is NEVER_OPENED. ESTABLISHED records that
this incarnation obtained durable native history; legacy NULL is UNKNOWN. This
is not a second copy of the current native log, another database or a
service-specific application-row inference. It survives deletion of native rows.

The canonical operation port supplies private exact-identity read/write closures
to the runtime. All service kinds use this same boundary. The existing opening
predicate preserves host prior-existence and bootstrap checks. With no native
record, ESTABLISHED or UNKNOWN cannot authorize genesis. Unavailable/invalid
owner reads remain typed failures. A genuinely never-opened refused constructor
can retry normally. Intact legacy native history can establish the local witness
before reconstruction; absent legacy history cannot be guessed fresh.

Initial native bootstrap and the lifecycle establishment update share one real
SYNCED SQLite transaction before participation or port publication. Failures
before or after the establishment SQL rolls back both writes. The rejected,
unpublished native node is freed. Imported snapshot staging is marked established
rather than pretending to be a new genesis allocation. This does NOT repair the
separate existing receiver-state/swap concern in comment 4247979520.

## Exact source controls and current counts

- 28 native cases, identical tests across the three arms: baseline 13 pass / 15
  assertion failures; candidate 28 pass / 0 fail; source-only revert 13 pass / the
  same 15 failures. No skipped, todo or cancelled cases. Fifteen failing scenarios
  are not fifteen independent defects. Both negative arms actually run native
  code and report assertions, not import or missing-fixture failures.
- The set includes the existing twelve service-opening/refusal cases, including
  the formerly red WASM lost-history assertion, plus sixteen new native history
  cases. These prove legitimate retry, rollback on either side of the real
  establishment write, legacy intact/unknown handling, all-native-table loss,
  invalid/unavailable history, exact incarnation, deferred host acknowledgement,
  imported staging and real separate-process restart.
- Actual SIGKILL witnesses engage before native bootstrap and after the durable
  bootstrap boundary. The former allows the never-opened retry. After the latter,
  deleting native history still refuses before any native entry. This is a
  process-kill result, NOT power-loss or storage-controller certification.
- The wider selected set is 19 files / 172 cases: 166 pass / 6 fail, zero skipped,
  todo or cancelled. All six failures are in the unchanged
  test/partition/partition-unreadable-durable-record.test.js. Its isolated baseline
  run has the same six failures, at initial write/setup assertions before the
  intended storage-failure scenario. They remain failed preconditions, not
  passing storage-recovery proof and not waived inherited failures.
- Actual operation-boundary audit passes; focused ESLint, changed-production
  literal check, impact registry and new-delta whitespace checks pass. All five
  production content hashes and test hashes are retained. Metadata comes from
  the existing generator. The complete guideline command still stops at 311 new
  literal violations on both baseline and candidate, with 1267 inherited matches;
  later chained checks are not claimed green.

The old durable-commit-sync test's bootstrap-as-NORMAL cost clause was explicitly
superseded: bootstrap now carries a durability-critical establishment fact and
requires FULL once per replica. The real commit observer recognizes bootstrap SQL
inside its transaction; ordinary application/non-must-sync work still requires
NORMAL. The intentional raw-runtime retirement-bypass mutant now supplies a forged
history fact; the genuine retirement and disruptive-term assertions are unchanged.
Neither a missing new callback nor an unengaged fault is counted as safety proof.

## Evidence and remaining boundaries

The execution archive, input/after hashes, raw baseline/candidate/revert TAP,
regression records and every audit outcome are retained here. An earlier local
whole-run attempt hit the outer command limit during candidate metadata refresh;
that incomplete local attempt is separately retained and is not the hosted result.
The Quest receipt remains FAIL because complete current regression proof and
independent review have not been obtained. Native source proof is not Quest land.

The local fact cannot survive loss of the whole database. Host-provided external
prior-existence remains required in that case. This run does not certify complete
file loss without that fact, physical multi-host behavior, full SQL/CDC startup,
all storage-fault permutations or release-wide transaction migration.

All seven findings in ownership-audit-disposition-20261012.md retain their owners.
Finding 2 now has a measured source correction, not complete acceptance. Findings
1/3 retain legacy fences, genuine-admission proof and explicit removal obligations.
Finding 4 retains its staged API and the OPEN receiver-history validation problem.
Maintenance items 5/6 and shared formatting in 7 remain deferred. Shared-runtime
and per-group recovery, and native/SQL/transport evidence, are not collapsed.

## Independent review requested and next work

Review design.md, the five changed production files and exact raw controls for
recovery-replay, admission-gating, concurrency-serialization, owner-interaction
and harness-fidelity. Attack the local fact's distinct lifetime, exact identity,
old NULL state, bootstrap transaction atomicity, actual participation commit
point, all opening/replacement paths, snapshot import state, caller/host fences,
write and release failures, retained native handles and shared-runtime state when
cleanup itself traps. Preserve the whole-file-loss limitation explicitly.

Next safety work is primary typed startup refusal plus secondary cleanup failure
and owned release continuation across all three service initializers; then the
snapshot receiver-state binding before replacement, and genuine partition/TX1
admission needed to make the failed wider fixtures exercise their claimed faults.
Do not bypass the production fences to make those fixtures green. Global literal
failures and the prior retained-patch whitespace disposition remain open. After
independent approvals and all required gates, exact integrated startup/restart,
complete FreshMG replacements, seed-storage-loss and physical lab certification
remain. A separate Copilot review is requested; no directly launched subagent or
approving Solver verification is represented by this document.
