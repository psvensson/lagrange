# C0 adversarial self-review — 2026-10-08

Status: requested author self-review; NOT independent approval, C0 closure,
source-repair authority, release certification, or a GitHub publication claim.

Reviewed published head: `41a8cdfb33ddc4acddafa192f7f5141a6ae38119`.
Runtime target: `82b54ef9b7c8d6be9f2d6450cbc5e6713ade00af`.
Reviewed local input: `lagrange-c0-continuation.zip`, SHA-256
`b0236d31651f8b4abee45c90e8d8e2afb75bb5eaad04489586f98714c02d3071`.

## Verdict

ACCEPT the bounded reconstruction observations at their explicit fixture and
process-loss limits. REJECT unqualified claims of end-to-end recovery, release
readiness, or C0 closure. The original local crash harness needs stronger
engagement assertions before being relied on as a regression guard. The
supplemental revision in this packet addresses three demonstrated harness
blind spots; it does not repair or change runtime source.

Self-review was explicitly requested. No `subagent:` identity is fabricated,
no independent-review receipt is marked passing, and no earlier review verdict
or sealed acceptance record is rewritten. The existing independent rejection
is not erased by this document.

## Publication and reconciliation

Live PR #104 has advanced beyond the earlier reported `0219a7fe` head. At the
reviewed head it already contains six real-owner/repository process-loss cases
measured on GCP and their retained evidence. The separate local packet contains
nine lower-level fixture cases and a different J1 proposal. They are not the
same work and must not overwrite one another.

Both packets use `scripts/quest-evidence/cutover-workflow-crash-baseline.js`
for DIFFERENT implementations. Applying the old patch wholesale is wrong:
it was based on a head before the current six-case implementation existed.
The original ZIP and its original patch are retained as immutable historical
input under this packet's evidence directory, NOT applied to the active tree.
The revised supplemental harness has the distinct name
`cutover-workflow-crash-projection-baseline.js`.

The accompanying patch adds preservation, review and supplemental-diagnostic
files only. It does not modify either existing GCP workflow, the published
six-case harness, existing policy proposals, log entries, receipts or sealed
Quest records. Thus it does not silently merge conflicting policy choices and contains
no new distributed-run instruction. A later bounded attempt can integrate any
accepted harness corrections into the existing canonical workflow.

This session exposes read-only GitHub actions. Plugin discovery confirmed the
installed hybrid GitHub integration, but no write/dispatch action is exposed;
the standard CLI network attempt failed DNS resolution and no CLI credentials
are configured. Nothing in this packet has been pushed. The current repository
is not silently assumed to have received the local files.

## Verification performed

1. Rehashed the original Actions workspace archive and verified all 1,851
   extracted `src/` blobs against its Git tree manifest.
2. Re-downloaded GCP artifact 11534404586 from run 37743852151. Archive hash
   `91f3c052db86c3da9ca0ab09ada9738787bba259a0669c9be8c18122155f2bb4`
   matches; all 17 listed member hashes match.
3. Inspected the six raw writer/reopen records. The recorded SQL row,
   transaction-open flag, local committed marker and subsequent recovered
   state match the named cuts. These are valid historical measurements, not
   merely a copied green summary. No claim of a new GCP execution is made.
4. Re-executed the local nine-case diagnostic against the unchanged extracted
   runtime: nine pass, with seven SIGKILL writer cases and fresh reader
   processes. This uses node:sqlite, a fixture CAS, and manual orchestration;
   it does NOT execute the production repository or distributed SQL/Raft.
5. Ran three controlled HARNESS mutants: omit SQL entirely in the
   inside-transaction case; omit the after-local-mark action; replace the
   readonly refusal with an unrelated error. The original harness reports
   all nine cases passing for EACH mutant.
6. Strengthened only the supplemental harness to assert actual transaction
   state, SQL change count, writer-visible row state, local committed marker,
   distinct writer/reader PIDs, and the SQLITE_READONLY error kind.
   Nine real cases pass. All three mutants now fail at the intended assertion.
7. Checked Node syntax and probe refusal: LAGRANGE_PROBE=1 exits nonzero and
   creates no output file. Runtime blob verification is repeated after review.

A hash match establishes retained-byte identity, not correctness of every
assumption in the harness. SIGKILL is not power loss. The GCP archive was
inspected, not re-executed in this session. Counts from different test layers
must not be summed into a fictitious larger production acceptance suite.

## Findings

### F1 — competing J1 policies must not both become active

The published proposal chooses forward recovery from PROMOTION AUTHORIZATION.
The local proposal permits abandonment of an already-promoted target before
SOURCE-REMOVAL AUTHORIZATION, provided an exclusive durable removal direction
is selected and all outstanding commands are fenced. These differ in
availability, required durable state, and proof surface.

Neither is proved solely by a current configuration observation. A delayed
ADD/PROMOTE or REMOVE S can outlive a local timeout, cached stage or writer
process. The runtime's `staleTransitionFence` is a current-generation,
same-key local observation; it is not a durable cancellation or exclusive
removal-direction protocol. The existing repository/permit interaction must
supply the missing authority. This is a prerequisite for new implementation,
not evidence that the still-parked production FreshMG path already violates it.

Recommendation for the first cutover: use the smaller published policy—no
automatic target rollback after promotion is durably authorized. Before that
boundary, failed-learner removal still requires definitive resolution/fencing
of outstanding admission and promotion work. After it, preserve target T,
retain the obligation, and progress only from current owner facts. Never use
successful REMOVE S and failed-target REMOVE T interchangeably.

Do not disguise the availability tradeoff. An irrecoverably lost promoted
T can leave the operation blocked. The supported operator/recovery path and
retained lane must be explicit; a typed operator-required state is not itself
proof that recovery exists. Check compatibility with the original failure
controls before adopting this restriction. Post-promotion abandonment is a
separate, later design only if its cancellation and direction-fence proofs are
actually required. It is not automatically authorized by this self-review.

### F2 — named-cut regression proof was underasserted (demonstrated)

The original local diagnostic can pass when the inside-transaction case never
starts SQL, when the after-mark case never sets a local mark, and when the
readonly fault is an arbitrary error. The returned row states alone cannot
prove that the claimed interruption point engaged. This is a harness defect,
not a database corruption finding.

The supplemental revision kills all three mutants while preserving the nine
positive cases. The six-case published test also does not explicitly assert
all of its recorded pre-cut properties in the parent; extending it with
analogous checks is recommended. That latter mutation campaign has NOT been
run here. The actual retained GCP observations are nevertheless correct at
those points, so this finding does not invalidate the old evidence by fiat.

### F3 — terminal recovery remains a precise coverage gap

The published six-case diagnostic checks the real repository terminal predicate
and then skips live workflow reconstruction. The local ninth case invokes the
row loader, which declines to restore a terminal workflow. Neither exercises
the full production caller chain around `ensureOperationWorkflow`.

That method calls recovery, then creates a fallback workflow record if recovery
did not restore one. The fallback does not itself establish why recovery
skipped the row. Upstream guards or repository refusal may make that safe;
the current tests cannot establish a general no-resurrection claim.

Next required witness: a real production recovery/dispatch entry with a
terminal row and a retained exact membership obligation. Prove no new
admission/dispatch, no lost lane/obligation, and the correct existing recovery
owner receiving the outstanding work. Do not add a terminal guard to an
arbitrary caller until the owner boundary is traced.

### F4 — intact snapshot catch-up is a product gap, not a failed unit count

The current receive/install orchestration shuts the service down before
`requestSnapshotInstall` decides installation and returns INSTALL_REJECTED
without reconstruction on that branch. The current rs-raft image install
requires a fresh CREATE claim, which is not authority for an intact replica.
The source scan also finds declaration/request plumbing for
SNAPSHOT_CATCHUP_NEEDED without a runtime consumer implementing the claimed
automatic path.

The required repair is at the existing receiver-native Ready/application-image
and service-lifetime interaction. Do not forge a CREATE claim or add an
unowned restart fallback. Preserve intact LOCAL_OPEN, known destructive wipe,
native INSTALL_ADMISSION and READ_UNAVAILABLE as separate facts. Existing
legacy-image refusal tests and fresh-learner component tests are not positive
intact-member catch-up proof.

These remain source-trace findings with the limits previously recorded;
no new multi-host failure or universal alias-closure proof was run here.

### F5 — two small published review corrections are valid

The `prepare` job in `cutover-workflow-crash.yml` invokes `node --check`
without first selecting Node 22, whereas the later process-loss job does
select Node 22. Pin the supported runtime before any Node invocation.
The policy heading says three identities but describes four identity
DIMENSIONS: membership subject, executing runtime lifecycle, target progress,
and physical CREATE/cleanup generation. Rename the heading; do not merge the
underlying concepts to fit the old count. These fixes are recommended, not
claimed published or applied by this add-only packet.

## Recommendations and bounded work order

1. Preserve both packets without replacing the current GCP test with the local
   fixture. Retain the original local ZIP, review findings and mutation results.
   Do not turn a stale, conflicting patch into a source integration.
2. Resolve J1 explicitly: conservatively forward from durable promotion
   authorization for the initial cutover, with an honest availability ceiling.
   If the sealed failure contract requires more, make that conflict explicit
   rather than relaxing its tests.
3. Complete the one remaining terminal/obligation entrypoint witness and the
   commit/unknown-result classification necessary for the selected operation.
   Stop adding generic progress-store tests once those named questions are
   answered. Current evidence does not justify another queue or ledger.
4. Review C0 as a CLASSIFICATION gate. It must identify authorities, unknown
   outcomes, recovery obligations and the next bounded repair. It must not
   require future FreshMG/snapshot implementations to be green before those
   source-repair Quests may start. Unknown decisions block C0; classified,
   measured missing implementations belong to the next product Quest.
5. Continue the existing FreshMG owner chain and its snapshot prerequisites,
   with one integration owner and only scoped repairs. Then use existing
   Actions/GCP infrastructure for real two-replacement/off-seed/restart
   acceptance. Do not count this component work as multi-host proof.

No database replacement, external control plane, new generic coordinator,
collapsed identities, or new workflow family is recommended. The governing
principle remains fewer independent decisions, not fewer legitimate facts.

## Source references

All repository paths below are at 41a8cdfb unless another source is stated.
- PR #104: https://github.com/psvensson/lagrange/pull/104
- `scripts/quest-evidence/cutover-workflow-crash-baseline.js` (six-case test).
- `solve/quests/cutover-transition-authority-review/process-loss-conclusions.md`.
- `solve/quests/cutover-transition-authority-review/recovery-policy-proposal.md`.
- `solve/quests/cutover-transition-authority-review/quest.json` (unchanged seal).
- `src/rebalancer/operation-workflow-owner-execution-lane.js:509-534`.
- `src/raft/raft-rs-membership-transition-runtime.js:165-182`.
- `src/raft/raft-rs-membership-transition.js:184-186`.
- `src/raft/snapshot-catchup.js:362-414`.
- `.github/workflows/cutover-workflow-crash.yml`.
- Original local review response is retained inside `local-continuation-original.zip`.
