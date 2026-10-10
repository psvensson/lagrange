---
audience: development
documentClass: current
---

# Local takeover: rs-raft safety-first recording

Date: 2026-10-10. Repository: `psvensson/lagrange`.
Existing Quest: `message-group-fresh-identity-membership`.
Existing epic: `raft-rs-full-cutover`.
Handoff branch: `handoff/rs-raft-safety-first-20261010`.
Parent: `60a60b2a6461d6fd9fa0f6f96fd3e25aa94651e4` (PR114).

Continuation: the [adversarial priority handoff](../../epics/raft-rs-full-cutover/local-priorities-2026-10-10.md)
now gives the next work order. If you are already running or ahead of this
published handoff, preserve your actual current work and reconcile its evidence;
do not restart from the original base instructions below. Their source and
verification requirements remain relevant to the original preserved patch.

You are the capable local implementation owner taking over from the cloud agent.
Start from the exact published handoff SHA supplied with this document, not an
old local integration tree or an earlier attachment. All twelve changed files,
including the earlier invocation prerequisites, are already applied. Do not
apply `changes.patch` or any older package again.

This is WIP preservation, not independent approval, Solver landing, a clean full
cutover gate, main integration, or release certification. Finish the bounded
verification first, then continue the real replacement operation. Report real
progress and blockers; do not stop after merely reading this document.

## 1. Protect existing work and establish identity

Use a new worktree/branch from the pinned handoff. Fetching in an existing clone
is fine; pulling into, resetting, cleaning, stashing, rebasing, or amending an
existing agent's worktree is not. Preserve the historical staged repository-root
inventory on `integrate/rs-raft-2026-09-30`, all salvage refs, lab evidence and
other agents' work. Do not prune worktrees, force-push, delete branches, or kill
foreign processes/containers. Do not push the synthetic `apply-check` repository
found in old diagnostic packages.

Check `origin`, `HEAD`, worktree inventory, staged/unstaged status and existing
lab jobs before writing. The handoff has real upstream ancestry. If its branch
has advanced, record the difference and start from the supplied SHA; inspect any
new descendant before composing it. Never overwrite concurrent work.

Read `AGENTS.md`, then `docs/steering/rules.md`, then
`docs/steering/router.md`. Follow their current routes. Read these specific owners:

- `architecture/contracts/authority-and-recovery.md`;
  `solve/quests/message-group-fresh-identity-membership/safety-first-ruling-20261009.md`.
- `architecture/contracts/message-group-learner-outcome-recording.md` and
  `architecture/contracts/message-group-registered-learner-read.md`.
- The existing Quest's `quest.json`, current/recent `log.ndjson`, and
  `solve/epics/raft-rs-full-cutover/contract-first-2026-10-08.md`.
- `docs/development/solver-runbook.md`, relevant test guidelines, and the
  named owner interactions in `test/shards/impact-contracts.json`.

The separate 0.3 Queryable Core/A1-v13 work is not your next implementation lane.
Do not alter PR74 or certify compatibility against this intermediate candidate.

## 2. Non-negotiable semantics and delegated discretion

The operator prioritizes correctness and recoverability, accepts slower fault
recovery, and requires an efficient healthy path. Adjust design/process rules
when justified, recording old/new criteria and evidence through their owners.
Do not alter safety meaning just to produce green. Never weaken sync/quorum,
remove fault cases, or treat permanent refusal as completed recovery.

The published safety-first ruling narrowly supersedes the old demand that an
already-submitted historical receipt must fail solely because the holder's lease
expires or canonical boot changes. An exact late receipt may commit only if its
full operation-row CAS still matches, its native origin is genuine and exact,
and its write set remains the declared three receipt columns. Original permit
fences, ordinary history, ownership, reservation and membership debt must survive.
A competing claim/terminal/phase update defeats the old CAS. An uncertain caller
returns UNKNOWN; timeouts and cancellation do not prove noncommitment.

A receipt is NOT permission for any new submission, CREATE, promotion, rollback,
source removal, cleanup, lane/debt release, or successor action. Each subsequent
effect needs its existing current authority at the effect boundary. Admission
before every NEW recording attempt still needs current holder/boot/local lifetime.
Do not introduce nondeterministic local clock/cache decisions in replicated apply.

J1 remains binding: after promotion is durably authorized, recover forward rather
than automatically removing the target while source retirement can progress.
Holder takeover is not a successor-action grant. Missing retained history,
UNKNOWN, timeout, socket loss, or a newer term alone is not proof that the earlier
action cannot commit. A successor needs definitive predecessor fencing AND
noncommitment, ordered against delayed predecessor execution.

## 3. What is implemented, and what is not

The handoff changes seven existing production modules. It retains actual invoked
callback/router identity, exact handler retirement, the owner's configured read
timeout, immutable queued inputs, and the existing retained operation lane. Local
invocation validity survives observation through submission. The gateway checks
admission before each retry, including a final synchronous lifetime/lease check
after asynchronous boot admission; host-only callbacks do not enter wire options.

`OperationWorkflowOwner.recoverMessageGroupLearnerOutcomeFromRecipient(operationId,
recipient)` reconstructs original recording inputs through the authoritative
repository inside its retained lane. The witness is explicitly selected and
already hosted, never implicitly the not-yet-created target. A committed permit
is readback-only for an already-recorded coherent result. It is not reauthorized
or converted back to an in-flight permit. Missing/unavailable rows and inconsistent
committed rows are refused rather than replaced with caches or old packets.

Automatic discovery/reconciliation does not yet invoke that entry. Current CREATE
and ordered successor issuance are inactive. Native-to-operation recovery and
checkpoint/install foundations exist upstream, but a set of passing components
is not a complete distributed replacement proof.

## 4. Retained evidence and its limits

Current package evidence is under:
`solve/quests/message-group-fresh-identity-membership/evidence/local-takeover-20261010/`.
Read `REPORT.md`, `measurements.json`, `apply-check.json`,
`ORIGINAL-ARCHIVE.txt`, and `RETAINED-SHA256SUMS`. Historical report sentences saying
"local/not pushed" describe the measurement time; this handoff publishes those
bytes without rewriting historical reports. The publication manifest binds the
actual parent and file blobs. Redundant pre/post file copies are represented by
those hashes and Git objects. The full original attachment also retains an older
nested prerequisite archive; it remains an attachment, not a claimed Git asset.

Original full attachment SHA256:
`9e6ee95d25ef8db3440cff378f08baec798137e7d771a832622944b70367cbf6`.
Original patch SHA256:
`e7d93018023cb691bb4d887cfe99c16d0f1f352aa7a620754667536547dd2d4a`.

Retained local diagnostics report 37 recipient entries, 54 native/recording,
4 process-loss and 7 ordinary-handler entries: 102 Node entries, including parent
entries, not 102 individual assertions. Twelve source mutations hit their named
failing assertion and source was restored. The old strict authority test remains
2-pass/2-fail under its old requirement; it is preserved, not relabeled green.

Those runs use disclosed diagnostic adapters, including `node:sqlite`, not normal
`better-sqlite3`. Normal dependency preparation, strict ESLint and dependency-graph
refresh did not complete. Local syntax, scoped size, impact-registry and three
classification checks passed; complete metadata/static/change-impact, canonical
file timing and independent source approval remain unproven. The upstream
Actions37963538484 / 313-entry result predates this patch and must not certify it.

## 5. First work unit: canonical verification and finite corrections

Use the checkout's normal Node/npm requirements and locked dependencies. No
adapter loader, replacement logger/config validator, mock package, npm audit fix,
or lockfile upgrade is authorized merely to obtain a pass. Missing prerequisites
are blockers to fix through their existing owners, not success.

From the isolated handoff checkout, after reading the owners above:

```sh
TOOLS=solve/quests/message-group-fresh-identity-membership/evidence/local-takeover-20261010/proofs
OUT="$HOME/.local/state/lagrange-lab-reports/safety-first-canonical-$(date -u +%Y%m%dT%H%M%SZ)"
bash "$TOOLS/verify-canonical.sh" "$PWD" "$OUT"
```

OUT must be a new absolute path. The script refuses probe mode, records commands,
exit codes and times, runs npm ci, real metadata producers, shard checks, scoped
lint/complexity/size, twelve classified files with the existing one-worker cap,
per-file budgets and twelve named-assertion mutations. It retains failures and
restores mutated source. Read it before execution. A prerequisites failure means
later checks did not run. Do not repeatedly rerun unchanged to fish for green.

Metadata generation may create intended changes. Preserve the before/after and
first result, fix actual source/test/static defects, and commit scoped generated
outputs from their producers. Then measure the exact final committed bytes with
clean status for any gate claim; a preparation-tree pass is not exact-head proof.
Do not manually fabricate an impact graph seal. Run the applicable full changed-
path/static tests as well; this bounded script does not stand for all of them.

Check the latest review threads on PR113/114. The new code intends to answer
callback retirement, exact unregister, configured timeout and post-delivery
ownership findings; intentions are not approval. Obtain a genuinely independent
adversarial review of the final source and tests. Do not manufacture a verifier
identity or resolve threads solely because this handoff exists. Preserve the
Quest seal, eight receipts, and append-only history; record attempts/findings
through the available Solver commands once dependencies work.

## 6. Continue the production operation, in this order

### A. Owned discovery and reentry

Connect existing OperationWorkflowOwner discovery/reconciliation to ID-based
recovery. Reuse the existing lane; do not recursively acquire it and deadlock.
Existing events, restart scans and retries must converge on one algorithm, not a
new scheduler/ledger. Include ordinary-failed operations with outstanding
membership debt. Obtain an explicit hosted witness through the existing discovery
owner; metadata is a route hint, never evidence that an action committed.

Prove duplicate/stale wakeups, unavailable witness followed by recovery, holder
replacement, shutdown after delivery, lost recording answers and restart using
only the operation ID, including an already-committed permit. Assert no duplicate
native proposal and no physical action merely because recording returns success.
Audit direct and indirect consumers of learner phase/stamp, including CDC/cache
reactions; an unproven authority-upgrading consumer keeps effect activation blocked.

### B. Current CREATE, through its existing owners

Complete a positive path from actual ordinary admission/reentry, through native
learner commit, recording, leader-produced join descriptor, exact physical
generation/sole-worker admission, install/open and running target. No fixture-
written SENDING, manual phase change, or payload receipt counts as driver proof.

Keep negative schedules for a stale descriptor after later REMOVE, wrong group or
target, replacement generation/boot, competing terminal state, duplicate requests,
lost answers, and process loss around admission/install. Show ordering at the
actual effect boundary, not just another earlier read. Retain a positive current
CREATE/recovery control so blanket refusal cannot pass. Historical ADD must not
resurrect an incompatible replica or authorize removal/cleanup of another one.

### C. Ordered successor and completion

Implement successor attempts only when the predecessor is definitively fenced
and authoritatively noncommitted, ordered against a delayed old execution. Exact
committed outcomes are recovered; unresolved outcomes retain debt. Do not refresh
an old permit or permit sequence2 simply to escape STALE_LEADERSHIP.

Then finish actual state transfer/replay, catch-up/promotion, leadership handoff,
source removal, source-own applied absence, quorum absence, exact-generation
cleanup and reservation release through their separate existing owners. Preserve
J1 and ordinary terminal history. Prove safe progression, not only refusal.

## 7. Broader and physical gates

After deterministic owner-path readiness, run applicable static/change-impact and
ordinary gates on one composed candidate. The original 941-file lab result
(918 process passes, 23 failures) remains historical FAIL, with inherited failure
attribution and timing debt still requiring resolution. Do not call old failures
exempt, or infer budget compliance from a zero process exit.

Use the existing locked lab inventory or Actions/GCP infrastructure. Read
`docs/development/home-lab.md`, `test/distributed/operational-ground-truth.md` and
the harness README/doctor first. Do not bypass machine locks with raw SSH tests,
count two providers on one machine as two physical hosts, kill foreign jobs,
reconfigure lab machines or remove unrelated cloud stacks.

Known approved GCP route: existing project `something-2e584`, runner
`lagrange-ci-runner`, zone `europe-north1-a`; inspect current workflow/harness
configuration before use. Provision only via its scoped action-authority path.
Use exact source fingerprints, unique run identities, node-to-physical-host and
storage-root maps, full per-node logs and owned teardown on success and failure.
A GCP runner executing unit tests is not multi-host acceptance.

Final cutover needs the existing two serial off-seed replacements, restart,
seed-storage loss, continuing quorum and new authoritative SQL write/read, CDC,
cache and routing recovery. No main merge/tag/release is authorized by this
handoff. Merge commits may compose reviewed branches when appropriate, but do not
waive final proof. The final main SHA and A1-v13 compatibility remain separate gates.

## 8. Publication and response discipline

Work in your new branch, commit bounded coherent increments, and push each finished
increment using the existing non-main preservation route. Do not leave completed
work only on disk. Push without force, verify remote SHA and clean status. Keep
PRs draft until their actual gates are met. Preserve original failed runs, command
outputs and manifests; no credential/private-key/environment dumps in public Git.

Return exact branch/HEAD/remote SHA, changed paths by owner, measured SHA versus
later documentation SHA, commands and exits, actual selected files and budgets,
first real failure with owner attribution, mutation leaf/assertion and restored
positive, evidence paths/hashes, independent verdict and remaining gates. Report
what is still running and who owns cleanup. Do not present a requested review,
local diagnostic, successful push, or retained artifact as source approval.
