# Testing recommendations: verification against the repository

Verified 2026-09-23 against `/mnt/data/peter/projects/lagrange` (main
`e3ac0514b`; the draft's `9d85ac283` is #57, on `origin/main` and on the
open worktree branches, one commit ahead of this checkout). Every claim below
carries a file:line or a command whose output I read. Where the repository
cannot support or refute a number from the draft, I say so rather than repeat
it. No repository file was edited.

## 0. Material findings the draft missed (read these first)

**M1. The day's main commits never met the local gate or the publisher.**
All seven main commits after `7466e0014` (#46, #44, #51, #54, #52, #56, #55)
are GitHub squash merges (`git log --format='%cn'` = `GitHub
<noreply@github.com>`). The pre-push hook runs only on a local `git push`
(`.githooks/pre-push`), and the rest-of-corpus + receipt chain runs only from
`npm run publish` (`scripts/publish-head.js:580-592`, `:692-735`). Evidence
that the chain is inert for these commits: `git ls-remote origin
refs/lagrange-proofs/corpus-full-v1/<sha>` is empty for all seven (the last
receipt is on `7466e0014`); the last local-corpus state file under
`.git/lagrange-local-corpus/` is dated 2026-09-19; the last publish receipt is
`7466e0014` (`publishedAt 2026-09-22T05:31Z`); the hosted canary is
`workflow_dispatch` only (`.github/workflows/full-corpus-canary.yml:16-17`)
and was last run 2026-09-18 (`gh run list --workflow full-corpus-canary.yml`).
Nothing in `CLAUDE.md`, `docs/development/solver-runbook.md:166-177` or
`docs/steering/` describes a pull-request merge path; the documented exit is
`npm run publish`. Consequence: since 2026-09-22 07:23 the only proof of any
main commit is the hosted cone (`ci.yml:198-199`, `npm run check`), which is
`safety spine + widened subsystems`, never the corpus. This, not the
selector, is why the #46 consumer reds lived for a day.

**M2. The #46 main push was not "green".** Its ci run (35723494649, push
event, `f4f5b5a6e`) FAILED after 2 minutes in "Ordinary proof":
`impact-graph-seal.json is stale for this tree` followed by `MODULAR PROOF
NOT SAFE` (`gh run view 35723494649 --log-failed`). A refusal is red on the
hosted gate; under the local hook the same refusal runs the whole corpus
(`scripts/checks/push-gate-change-proof.js:14-24,157-159`). The red went
unconsumed because the red-main guard is a pre-push stage
(`.githooks/pre-push`, stage `red-main-guard`) and no local push happened;
the next GitHub merge (#44, which added the `vendor/raft-rs-wasm/` release
prefix, `scripts/checks/change-selection-constants.js:146-148`) was green.

**M3. Keep-going already depends on whether the fleet answered.** A placed
run (plan >= 5 min, clean commit, inventory readable) runs the controller's
own shard and every remote shard with `keepGoing: true`
(`scripts/lab/probe.js:1188`, `:1482`); a run that falls back to local uses
the caller's `keepGoing`, which the gate and `npm test` leave `false`
(`probe.js:1144-1146`; `push-gate-change-proof.js:201-208`;
`select-change-tests.js:623-624`). The same cone can stop at its first red
batch or run to completion depending on the lab.

**M4. Retry-once destroys its own evidence on disk.** The rerun reopens
`.tap/test-results/<file>.tap` with `'w'` (`scripts/run-test-files.js:261`),
so after a `# retried-once pass` only the green run remains; the first
failure exists only in the console stream. No consumer aggregates
`# retried-once` lines except placement (`probe.js:864`), which uses them to
call a shard green.

**M5. Inert or honour-system mechanisms.** `LAGRANGE_PUSH_SKIP_TESTS=1`
skips the hook's test stage on the operator's word, with no check that the
exact tree was gated (`.githooks/pre-push`, header and the test-stage branch).
`scripts/lab.js test <profile>` runs `npm` LOCALLY, not on a lab node
(`scripts/lab/lagrange-lab.js:110-116`, `:420-424`). `writeProofScope`
stamps `fullCorpus: true` before the verdict (memory `corpus-proof-reuse-live`,
open follow-up). The canary's `workflow_run` branches (`full-corpus-canary.yml:30-32,52,109`) are dead code since the trigger was removed.

**M6. A clean checkout cannot plan a support-file change until it regenerates
the graph.** In this main checkout both `node scripts/select-change-tests.js
--base ef9151f2c --head 8ed8f889c --explain` (#52) and the #46 range refuse
with `import graph unavailable ... (import graph is not the one the committed
seal binds)`: the graph lives in gitignored `test-output/`
(`scripts/checks/impact-proof-cone-constants.js:11-13`) and only the digest
is committed. So the draft's "PR #52 cone 527 tests (WIDENED)" could not be
reproduced here; I do not dispute it, I cannot measure it without writing
`test-output/`.

**M7. Fifteen of the twenty failed hosted gate runs since 2026-09-22 ended in
under four minutes** (`gh run list --workflow ci.yml --limit 60 --json ...`);
the two I opened failed at "Prepare generated test metadata: stale"
(35766846742) and the stale seal (35723494649). The pre-commit hook
regenerates and stages all four files (`.githooks/pre-commit:168-184`) and
the hook's static stage runs `audit:shards`
(`scripts/checks/run-static-audits.js:139`), so a locally committed tree is
fresh; staleness is manufactured when GitHub merges two branches whose
generated files both moved. Recommendation 6's real cost is M1 again.

## 1. Per-recommendation verification

### R1. Prove a SHA once, anywhere (cone receipt keyed by SHA + cone digest)

(a) Exists in part. `scripts/proof-authority.js` records immutable-SHA
receipts as `refs/lagrange-proofs/<proof-id>/<sha>` (`:9-21`) for exactly two
contracts, `release-full-v1` and `corpus-full-v1` (`:105-134`); there is no
cone contract. The cone's scope IS recorded, as `test-output/proof-scope.json`
with `testPaths` (`scripts/select-change-tests.js:644-656`), and the publisher
consumes it to run only the rest (`publish-head.js:692-735`); the canary
consumes receipts (`scripts/checks/canary-corpus-needed.js:1-17`). Nothing
lets the hook or ci skip a cone on a receipt; the only skip is the unverified
`LAGRANGE_PUSH_SKIP_TESTS` (M5). A cone receipt cannot be minted inside the
gate for a commit not yet on `origin/main` without re-entering the hook -
the exact trap `push-gate-change-proof.js:233-242` documents and the
tag-only arm of the hook exempts only for commits already on main.

(b) Evidence partly wrong. "The remote change gate re-runs the same cone the
hook proved": true only for a local push of `main` (hook exports the remote
sha as `LAGRANGE_CHECK_BASE`; ci uses `github.event.before`,
`ci.yml:99-119`). For a branch push the hook proves against the publication
merge-base (`scripts/checks/changed-paths.js:153,175`; `MAIN_REMOTE_SHA` is
set only for `refs/heads/main`) and the PR run against `pull_request.base.sha`
- the same set only while the branch is current. "Lab runs repeat it": no,
placed shards are part of the one run (`probe.js:1141-1200`), not a repeat.
And per M1, for every main commit of the day the remote cone was the ONLY
proof; there was nothing local to honour.

(c) Payback: the hook's test stage is 110-300 s (draft; not verifiable from
the repo) and includes contracts, static audits, model contracts and the graph
refresh before the cone (`test/manifests/project-hardening-proof-postpush-manifest.json`,
commands `focused-contracts` .. `change-proof`), so a cone receipt saves at
most part of that per push. Hosted main runs take 12-24 min end to end
(`gh run list`, e.g. `8ed8f889c` 06:57-07:21), mostly setup
(`ci.yml:127-172`); skipping `npm run check` there saves hosted minutes but no
local minutes, and the red-main guard reads only that workflow's conclusion.
Size: new contract + record path inside the exact checkout + ci/canary/publisher
consumers, 4-5 files, 2-3 days with witnesses. Risk: a receipt keyed on SHA
alone is wrong (same SHA, different base = different cone); the key must be
(sha, base, plan digest). The owner parked `test-file-content-receipts` as
"a content-keyed skip cache ... is a large correctness surface in the layer
that silently failed twenty coupled pairs" (`solve/epics/apparatus-release-consolidation.md:187-192`);
the same objection applies one level up.

(d) R19: a hosted run skipping on a locally minted receipt makes the hosted
check a reader of local claims; R23 not violated if the receipt is a proof of
the same plan. Owner rule 2026-09-13: no quest may add a script or workflow.

**Verdict: reshape.** Drop "remote honours the hook". Keep the diagnosis, invert
the fix: make the proof chain fire for GitHub-merged heads (see FINAL LIST 1).

### R2. Behavioural net beside the import cone (grep removed members)

(a) The premise misnames the mechanism. A product source change does NOT
select by import cone; it widens to the whole owning subsystem by
test-directory taxonomy (`scripts/checks/change-selection.js:9-16`,
`:404-417`, `:609-631`), plus curated impact-contract witnesses and coupled
pairs (`:175-236`). The import graph is consulted only for changed test
support code (`:466-482`; `scripts/checks/helper-import-closure.js:1-24`,
"v1 scope: import edges only"). The observation census records string
literals that resolve to repository paths, directories or env names in the
test and its helper closure (`scripts/checks/test-subsystem-classification.js:211-260`,
`:316-322`; helper roots `test/`, `scripts/`,
`test-subsystem-classification-constants.js:275`). A member access such as
`learner.raft.term` (`test/convergence/dt6-learner-promotion-progress-proof.test.js:157`
at `f4f5b5a6e^`) is neither an import specifier nor a path literal, so no
authority sees it - by design, not by omission.

(b) Evidence, corrected. The reds named by #52 and #57 are
`test/convergence/dt6-*` (class `convergence-topology`),
`test/query/write-path-internal-pacing.test.js` (`query-sql`) and
`test/raft/snapshot-catchup-end-to-end.test.js` (`storage-raft`)
(`test/shards/subsystem-classes.json`). #46 changed `src/partition/**` and
`src/raft/**` (`storage-partition`, `storage-raft`) plus `vendor/raft-rs-wasm/**`
and `test/shards/impact-contracts.json` (a hook full-corpus trigger,
`change-selection-constants.js:237`). So the convergence and query consumers
were outside every cone that followed; the storage-raft one would have been
inside a widening. But "every gate green" is false (M2), and under the
documented local path the refusal would have run the corpus. The existing
curated route already covers this shape: contract
`partition-raft-operation-port` names the port owners
(`test/shards/impact-contracts.json`) but all three of its witnesses are in
`test/raft/` (storage-raft); no cross-subsystem consumer is a witness.

(c) Payback: prevents a hidden red only when nothing runs the rest of the
corpus; once M1 is fixed, a rest-of-corpus run reports the same reds within
one publish. Cost: a new selection authority is itself selection machinery
(full-corpus trigger on its own push, `change-selection-constants.js:236-248`),
needs `test/shards/selection-golden-corpus.json` updates and a witness;
grepping removed member names (`term`, `state`, `log`) over 2152 files
widens to hundreds of tests and is noisy; false negatives are silent, the
selector's stated worst case (`change-selection.js:32-35`). 2-4 days.

(d) Adds machinery to `scripts/checks` (at its cap, memory
`owner-priorities-2026-09-13`); no gate weakened.

**Verdict: drop as designed; reshape to the curated lever.** Add the
cross-subsystem consumers as witnesses of `partition-raft-operation-port`
(or a coupled pair `partition-port-consumer <-> convergence/query`) in
`test/shards/impact-contracts.json` (owner `owner-interactions`,
`docs/steering/router.md:16`). Zero code, one hour, and the exact "fixture
debt" #52/#57 describe.

### R3. Keep-going by default; fail-fast opt-in

(a) Exists as a flag. `--keep-going` is defined and honoured
(`scripts/run-classified-test-files.js:72-75`, `:389-392`); `test:all` gets
it from the canary (`full-corpus-canary.yml:153-158`) and the local corpus
(`publish-head.js:611-612`). It is NOT passed by the gate's cone
(`push-gate-change-proof.js:201-208`, `--stdin` only), by `npm test`
(`select-change-tests.js:623-624`), hence not by ci's `npm run check` nor by
`solve land`. Plus the placement inconsistency in M3.

(b) Correct. Without the flag the first non-zero batch returns
(`:389-390`); batches are 100 files (`:76`); lanes run ordinary, cpu-heavy,
external-toolchain, bootstrap, exclusive in that order (`:139-145`); dispatch
puts red-or-unknown files first (`:192-200`), so a persisting red ends the run
in its first batch and every later lane goes unrun. Within a batch every file
runs (`run-test-files.js:635-668`). "Twice today" is not verifiable from the
repository; the mechanism is.

(c) Payback: every multi-red push costs one fewer 5-25 min iteration (the
cone's length); cost is that a red gate takes the full plan time instead of
stopping early. Size: flip the default in `runClassifiedTestFiles` and the CLI
(`:357`, `:430-434`), add `--fail-fast`, pass the same policy on the local
fallback in `probe.js:1144-1146`, update `test/scripts/run-classified-test-files*`
witnesses; the push itself trips the `test-runner` full-corpus trigger once.
Half a day. Nothing is weakened: the exit status stays the first failure.

(d) No rule touched.

**Verdict: keep**, widened to make placed and local runs share one policy.

### R4. Lab as a first-class placement (one verb, exact commit, streamed results)

(a) Mostly exists, automatically. The runner CLI places any plan over the
discovered fleet (`run-classified-test-files.js:440-449` ->
`probe.js:1141-1200`): the exact commit ships as a bundle into a throwaway
worktree on the machine (`startRemoteShard`, `probe.js:1482-1510`;
`:1256-1330`), the same classified runner runs there, reds are re-decided on
the controller and misses recorded per machine (`:1217-1247`). Missing
against the draft: (i) no operator verb - `scripts/lab.js test` runs npm
locally (`lagrange-lab.js:110-116,420-424`); (ii) results are relayed at
settle, not streamed (`settleRemoteShards`, `:1217-1225` reads
`outcome.log` after `done`); (iii) the split is per file by measured cost
(`placeTestFiles`, `:960-990`), not per lane, and only for plans >= 5 min on
a clean commit with files that fit 5 min remotely (`:840`, `:847-851`).

(b) The lane sizes hold: from the manifests, `test:all` = 2151 files =
ordinary 1877 (jobs 4), external-toolchain 14, bootstrap 182 (jobs 2),
exclusive 78 (jobs 1) (computed with `planClassifiedTestFiles`); the draft's
2152/1878 are off by one. "Exclusive there, ordinary here" is the shape the
owner's rule already forbids overlapping on one host (`probe.js:826-830`),
and the cost split approximates it when a fleet exists.

(c) Payback: a whole corpus of 37-50 min (draft; memory: 46 min on a
12-thread node) is already shortened by placement when the fleet is up; the
gap is ergonomics (a hand-run of one lane on one machine) and time-to-first-red
(streaming). Size: extend `lab test` to route through `startRemoteShard` with
a `--lane` filter and a machine chosen from `lab fleet` at run time (1-2 days);
stream by tailing the remote log over ssh (1 day). Risk: none to proof - a
lab red is re-decided on the controller.

(d) Host names must stay out of setup (memory
`test-placement-discovery-not-hosts`); a run-time `--on <inventory name>` is
fine, a default host is not. Corpus never on GitHub-hosted: unaffected. A
new verb inside the existing `scripts/lab.js` is not a new script.

**Verdict: reshape**: no new placement layer; (1) `lab test <profile> --lane
<lane> [--on <name>]` dispatching through the existing shard machinery, (2)
streamed per-file lines. Medium payback, medium effort.

### R5. Passed-on-retry files reported as findings with the first failure line

(a) Partly exists. `retryFailedOnce` prints `# retry-failed-once: rerunning N`
and `# retried-once pass|fail <file>` (`run-test-files.js:706-734`); the first
failure was printed in full just before (`printTestResult`, `:553-562`:
`not ok <file>`, reasons, excerpt). Missing: the on-disk first failure (M4),
any ledger, and any reader (the policy comment promises "census-classified",
`:27-39`, but no census file exists under `test/shards/` or `test-output/`).

(b) Correct: a retried pass exits 0 (`:733`) and leaves nothing durable.

(c) Payback: zero minutes per push; the value is a flake list that can be
fixed. Size: write the first attempt to `<file>.tap.retry-0` (or keep the
first `.tap` under a suffix) and append `{sha, file, reasons[0], ms}` to
`test-output/reports/retried-once.ndjson`; one file plus a witness in
`test/scripts/run-test-files.test.js`; half a day; retention already exists
(`scripts/prune-test-output.js`). No new script.

(d) No rule touched.

**Verdict: keep**, folded into one runner change with R7 and R8.

### R6. Stop regenerating per worktree (content-hash seal or merge driver)

(a) The seal already is content digests (`test/shards/impact-graph-seal.json`:
`sourceDigest`, `producerInputDigest`, `resolverStateDigest`,
`snapshotDigest`); the graph itself is gitignored (`impact-proof-cone-constants.js:11-13`).
The three class manifests are "a pure function of the live census plus the
sealed taxonomy" (`test-subsystem-classification.js:173-176`) and are
byte-compared on `--check` (`scripts/generate-test-subsystem-classes.js:7-13`;
`ci.yml:182-192`). They are committed so a stale seal "fails HERE with its name
rather than silently widen the proof" (`ci.yml:178-181`) and so the observation
census is an authority the selector can refuse on
(`change-selection.js:576-590`). Pre-commit regenerates and stages all four
(`.githooks/pre-commit:168-184`); no merge driver exists (`.gitattributes`
has one LFS line; `git config --get-regexp merge..*.driver` empty).

(b) Churn is real: 60 of 140 commits since 2026-09-15 touch the four files.
Failures are real (M7). "Resolved eight times today" cannot be checked in the
repository; the recipe exists (memory `solver-streamlining-quest`: checkout
`--ours`, regenerate). Cause: GitHub merges of two regenerated branches (M1);
a locally committed tree is fresh by construction.

(c) Deriving manifests at selection time removes the drift refusal and the
seal's fail-by-name; it is a change to selection machinery, generators, the
ci step and the hook (full-corpus proof on landing), 3-5 days, and a large
correctness surface (the owner's objection to `test-file-content-receipts`).
A merge driver is 0.5-1 day but is per-clone git config (not committable) and
a new script unless the driver is the existing generator.

(d) No gate weakened either way; the owner's no-new-script rule bites the
driver.

**Verdict: reshape.** First fix the merge path (FINAL LIST 1): a locally
published merge is regenerated by pre-commit and verified by the hook. If
GitHub merges stay, add a `.gitattributes` `merge=lagrange-generated` entry
whose driver is `git checkout --ours` + regenerate, configured by the same
step that sets `core.hooksPath`; do not derive at selection time.

### R7. Timeouts carry load and memory in the failure line

(a) Absent. Failure reasons are fixed strings (`run-test-files.js:103-112`,
`:516-521`); only `scripts/checks/wait-for-load-headroom.js:1-21` reads the
load average, as a staging gate. Budgets scale by
`LAGRANGE_TEST_MACHINE_FACTOR` (`ci.yml:59-62`).

(b) Plausible and recorded: "a GCP-only integration failure with timed out
... is a budget, not a regression" (memory `gcp-proof-runner-speed-variance`);
the runner cannot currently say which.

(c) In `finalizeTestRun`, when `timedOut` or reasons include a timeout, add
`load1m=<os.loadavg()[0]> cores=<n> freeMB=<n> factor=<env>` to the reasons
and to the appended `# time=` comment (`:501-505`). Ten lines, one file, one
witness, a quarter day. The sample is at kill time, not during the run; say so
in the line. Verdicts unchanged.

(d) None.

**Verdict: keep**, tiny, same change set as R5/R8.

### R8. Measure the corpus's own shape (per-file timing, last-red ledger)

(a) Partly exists: each file's last duration and verdict live in
`.tap/test-results/<file>.tap` (`# time=`; read by
`run-classified-test-files.js:192-243`; 2155 files present) and drive
dispatch order and placement cost. The epic's 2026-09-17 shape analysis was
made from exactly these files (`solve/epics/apparatus-release-consolidation.md:343-372`).
Missing: history (every run overwrites), a red ledger, and any
duplicated-claim tool (`impact-coverage.json` and `selection-golden-corpus.json`
are selection artefacts; `hosted-gate-repeatability.js` counts runs).

(b) "The only way the corpus shrinks": the owner's direction is that
apparatus shrinks (memory `owner-priorities-2026-09-13` item 2); no recurring
instrument exists.

(c) Append one line per file result (`sha, file, ok, ms, reasons[0],
retried, machine`) from `run-test-files.js` to
`test-output/reports/test-results.ndjson`; analysis by `jq` ad hoc, no new
script; retention via `prune-test-output.js`. Half a day, same change as
R5/R7. Duplicated-claim detection is a different problem (assertion-level)
and has no cheap owner; drop that clause until a ledger exists.

(d) No new script if the writer lives in the runner; gitignored output.

**Verdict: keep reduced** (ledger only).

## 2. FINAL LIST, by payback per effort

1. **[reshape of R1 + R6 root] Every main head gets the documented proof
   chain.** Evidence: M1, M2, M7. Two acceptable shapes, owner's choice:
   (a) merges land through `npm run publish` from a local checkout (no
   GitHub merge button) - zero code, a rule in
   `docs/development/solver-runbook.md` and `CLAUDE.md`; or (b) a
   post-merge local step, `node scripts/publish-head.js --local-corpus
   <sha>` for a head already on `origin/main` (the entry point exists,
   `publish-head.js:593`, `:753-760`), invoked by the operator after each
   GitHub merge, which runs the rest of the corpus placed over the lab and
   records `corpus-full-v1`. Payback: restores a 25-45 min whole-corpus
   proof per main commit that today never runs, and would have surfaced the
   #46 reds within one cycle. Effort: (a) one doc edit; (b) one CLI arm in
   `publish-head.js` (the `--local-corpus` child already takes a sha) plus a
   guard that the sha is on `origin/main`, about a day. Owner surface:
   `scripts/publish-head.js`, `docs/development/solver-runbook.md:166-177`.

2. **[R3, keep] Keep-going by default, fail-fast opt-in, one policy for placed
   and local runs.** Evidence: `run-classified-test-files.js:389-392`,
   `probe.js:1144-1146` vs `:1188,:1482`; `push-gate-change-proof.js:201-208`.
   Payback: one fewer gate iteration per multi-red push (5-25 min); a red
   gate takes up to the full plan. Effort: half a day, two files and their
   witnesses; the push trips the `test-runner` full-corpus trigger once.
   Owner surface: `scripts/run-classified-test-files.js` (CLI and
   `runClassifiedTestFiles`), `scripts/lab/probe.js:1141-1146`.

3. **[R5 + R7 + R8, keep, merged] One runner change: durable per-file result
   ledger, first-failure retention on retry, host load on timeouts.**
   Evidence: M4; `run-test-files.js:261`, `:501-521`, `:706-734`; no reader of
   `# retried-once` outside `probe.js:864`. Payback: no minutes per push; the
   flake list and the slow/never-red list the owner keeps asking for, and
   load-attributed timeouts, from data the runner already holds. Effort: one
   file (`scripts/run-test-files.js`) plus `test/scripts/run-test-files.test.js`,
   about a day; no new script (owner rule 2026-09-13). Owner surface:
   `scripts/run-test-files.js` (`finalizeTestRun`, `retryFailedOnce`),
   retention in `scripts/prune-test-output.js`.

4. **[R2, reshape] Cross-subsystem consumers as curated witnesses, not a grep
   net.** Evidence: `change-selection.js:9-16,404-417,609-631`;
   `impact-contracts.json` contract `partition-raft-operation-port` with all
   three witnesses in `storage-raft`; the reds were `convergence-topology`
   and `query-sql`. Add `test/convergence/dt6-learner-promotion-*.test.js`,
   `test/query/write-path-internal-pacing.test.js` and
   `test/raft/snapshot-catchup-end-to-end.test.js` as witnesses (or a
   coupled pair whose second endpoint is the consumer owners). Payback: the
   next port change selects them (minutes of cone, hours of hidden red).
   Effort: one JSON edit, `npm run audit:impact-contracts`. Owner surface:
   `test/shards/impact-contracts.json` (`owner-interactions`,
   `docs/steering/router.md:16`). The grep net is dropped: it is new
   selection machinery with unbounded widening and silent false negatives.

5. **[R6, reshape] Generated-file merge conflicts.** Evidence: 60/140
   commits touch the four files; 15 short hosted reds since 2026-09-22;
   pre-commit already regenerates (`.githooks/pre-commit:168-184`). If item 1
   lands as (a), this disappears. Otherwise: `.gitattributes`
   `test/shards/{primary,resource,subsystem}-classes.json
   test/shards/impact-graph-seal.json merge=lagrange-generated` with a driver
   that takes ours and runs `npm run test:metadata:refresh`, configured where
   `core.hooksPath` is set. Effort: half a day; the driver must be the
   existing generator entry point to stay inside the no-new-script rule.
   Do not derive manifests at selection time (loses the fail-by-name seal,
   3-5 days, large correctness surface). Owner surface: `.gitattributes`,
   `.githooks/`, `scripts/generate-test-subsystem-classes.js`.

6. **[R4, reshape] Lab verb and streaming, on top of the existing placement.**
   Evidence: `probe.js:1141-1200,1482-1510,1217-1225`; `lagrange-lab.js:420-424`.
   `lab test <profile> --lane <lane> [--on <name>]` routing through
   `startRemoteShard`, machine chosen from `lab fleet` at run time; per-file
   lines tailed live. Payback: faster first red on long lanes and a hand tool
   for the exclusive lane; the automatic split already saves the wall time.
   Effort: 2-3 days. Must not write a host into setup. Owner surface:
   `scripts/lab/lagrange-lab.js`, `scripts/lab/probe.js`.

7. **[R1 as written, drop]** A cone receipt honoured by the remote gate
   saves no local minutes (the remote runs on a hosted machine), makes the
   hosted check a reader of local claims (R19), needs a (sha, base, plan)
   key, cannot be minted inside the gate without the re-entry trap
   (`push-gate-change-proof.js:233-242`), and repeats the parked
   `test-file-content-receipts` objection
   (`solve/epics/apparatus-release-consolidation.md:187-192`). What it
   diagnoses (duplicate proof of one SHA) is not the day's problem; missing
   proof is (item 1).

## 3. Things I could not verify and did not repeat

The draft's timings (25 min ordinary lane, 37-50 min corpus, 110-300 s test
stages, "twice today", "eight times today") and the 527/453-test cones are
not derivable from the repository in this checkout (M6); the lane sizes,
receipt counts (38 + 14 = 52), the trigger set, the retry cap of five, the
keep-going semantics, the hosted run durations and conclusions, and the
merge-committer identity were checked directly and hold.
