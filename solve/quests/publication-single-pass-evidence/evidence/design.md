# Single-pass publication evidence

Initial proposal on rule-set revision 5 and source
`566d87b3be615344bbc5548d818e3b01578cc698`. The independent four-cut composition
review applies to that source only. At proposal time the Quest was unsealed
and no receipt was invented to make absent evidence measure red. Actual
original controls from lab job 3410 subsequently measured the policy failure;
job 3488 sealed that original evidence at
`52160e58a09b01f8d4871b7408bd244280a4d442`. Its complete record is retained.
The materializer observations from job 3491 and the directly coupled repair
below follow that seal. Candidate acceptance and final delivery remain pending.

## Existing interaction and correction

The ordinary entry points remain Solver land, the pre-push hook, the exact-HEAD
publisher and the existing CI gate. Their execution owner is
`scripts/run-test-files.js`; classified placement consumes its verdict stream
through `scripts/lab/probe.js`. Structured runner sections flow through
`scripts/test-execution-report.js` to `scripts/proof-authority.js`. The latter's
`corpus-full-v1` and `release-full-v1` contracts already refuse retries.

One scheduled file executes once. Its first failure, zero-assertion outcome or
missing result remains unsuccessful even if a later line is green. Initial
placement may distribute a plan, but an assigned shard is never rerun on another
host or controller. Missing source, base, discovery, capacity or completed
execution is explicit unavailability. Retained stderr and stdout describe the
original host; they cannot manufacture a completed file or native receipt.

Remove the runner's retry branch, placement's retry-marker promotion and
reassignment, and all current producer knobs in pre-push, detached corpus,
Solver land and workflows. Keep per-file/lane bounds and host lock, thermal,
process-group cleanup and cancellation obligations. CI must resolve its actual
base, including an explicit manual-dispatch base, and refuse an absent or
unreachable base instead of substituting `HEAD^`. No hosted/lab route is changed
without established trusted execution capability.

The publisher keeps every exact-head corpus record and original diagnostics.
Another publish does not cancel an older immutable source's running proof.
An existing same-head record or partial evidence blocks automatic restart;
reporting never prunes old evidence. A repaired source SHA owns a fresh attempt.
Separate explicit diagnostic measurements remain separate evidence. Repeated
gate failures retain distinct diagnostic directories at the same existing
owner, preserving the original bytes.
The first state is an exclusive `starting` record, acquired before companion
files. State readers select only the declared `<sha>.json` family; native
execution reports remain companions, and malformed state still refuses.
Generic output pruning reserves this existing diagnostic directory. A copy
failure retains the original checkout and names unavailable storage while the
original gate error remains primary. A thrown or signalled corpus execution is
lost; a measured nonzero test exit is red.

The placement owner installs cancellation before starting shares, observes
each acquired completion immediately, and closes all acquired siblings on a
setup or settlement exception. One cleanup exception does not prevent later
siblings receiving cancellation. Existing bounded grace and deadlines remain;
cleanup uncertainty stays explicit. The wrapper closes partial descriptor
acquisition and every relay even if an earlier output operation failed.
Solver land also stops substituting `test:safety-pregate` for a canonical
`RELEASE_PROOF_REQUIRED` refusal.

## Complete transition

1. **Trigger and producer:** an ordinary check, land or publish supplies the
   existing runner's file list and source identity. The publisher's exact gate
   still uses the pushed head and actual remote base.
2. **Authoritative facts:** exact SHA/tree and clean checkout, canonical scope,
   original child exits, positive assertions, complete runner sections and
   the strict registered proof contract. A later pass supplies no authority
   over an earlier failure.
3. **Shape and identity:** retain the existing runner verdict grammar and
   `lagrange-test-execution-report/v1` history. Remove the unused qualified
   acceptance branch while continuing to reject historical retry evidence.
4. **Ordering:** assign once; retain start before execution and end after
   settlement; aggregate the worst observed file outcome independent of order.
5. **Unavailable versus absent:** a missing source/base/host/result cannot
   invoke a quieter local execution or become green. A malformed retained
   corpus record is an explicit evidence error, not permission to overwrite it.
6. **Durable points:** the existing original artifact/state write retains
   evidence; only validated native proof recording can create its immutable
   proof ref. A mailbox completion is neither point.
7. **Obligations:** an older corpus process retains its own source obligation;
   a newer publication neither cancels it nor claims its proof. Incomplete
   execution remains owed, with its original record and owning integration
   action visible.
8. **Cleanup:** keep existing bounded child/remote process cleanup and host
   locks. Remove automatic supersession and evidence deletion, not cleanup of
   resources actually owned by an ended run.

## Historical and external precedent

`3827c9d3f5d34313663f09a9763eabc833bff804` corrected a verifier-rejected proof
aggregation attempt: later clean results had erased retry and zero-assertion
evidence. Reuse its worst-verdict policy throughout this interaction. The
sealed `land-retry-parity` and `local-corpus-canary` Quests proved older active
semantics. The user's current no-fallback direction supersedes those semantics;
their records remain unchanged and do not claim this new behavior.
`failed-gate-keeps-evidence` at
`6929b84de5626e1672f1f362d6152f9a51f6ce40` also sealed last-verdict-wins and
retry-green omission. Those two active verdict policies are superseded; its
single retention owner and synchronous runner constraints remain applicable.
`fc6db88ee4d9a5d0d9ac120cd85d0a04b7a805fc` records three approximately
17-minute August19 attempts losing diagnostics; the direct gate repeated that
failure in October. `placement-fixture-followups` at
`b5f975d0d0c97e2d6e2a10e48bdac743c20e9b46` records orphaned children after
SIGHUP and the bounded remote-shell cleanup before local cut. Preserve that
same bounded abort owner across placed and manual split-lab execution.

[Node22 child-process semantics](https://nodejs.org/download/release/v22.23.2/docs/api/child_process.html)
distinguish process exit from closed stdio and specify that `spawnSync` blocks
JavaScript execution. The finite `materializer-signal-observation.mjs` records
what a signal delivered during that synchronous gate actually reaches. It is
an investigation, not an acceptance check or a native proof receipt; the outer
signal-handler disposition was pending at proposal time. The actual job 3491
measurement and resulting ownership correction are recorded below.

[Bazel's test-run policy](https://bazel.build/docs/user-manual#flaky_test_attempts)
distinguishes eventual flaky success from a clean pass; that distinction
supports retaining attempt evidence. Its permissive flaky acceptance is not
adopted: Lagrange's registered proof contracts remain stricter.
[GitHub's runner guidance](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners)
and [token scope](https://docs.github.com/en/actions/concepts/security/github_token)
support keeping a trusted private executor and cross-repository delivery
authority explicit. They do not establish an installed capability here.

## Proof preparation and ceiling

The original-compatible root is
`test/scripts/publication-single-pass.test.js`, using the existing placement
fixture and production assignment/settlement methods plus a real CLI child.
Freeze its exact bytes and the fixture with unchanged source first. Its
fail-once child, failed/partial host streams, unavailability and evidence-custody
controls must fail through the named causal assertions on the original.
The separately frozen `test/config/ci-proof-range.test.js` runs the actual CI
YAML step in finite Git repositories, including its explicit dispatch input.
Candidate lifecycle controls in `placement-failure-custody.test.js` cover setup
and settlement exceptions, cleanup failures, missing controller exit status
and actual descriptor acquisition faults. They do not change the frozen
original controls.
The separate split-lab controls exercise the same acquisition and settlement
failure policy through `runLabTest`, including exactly-once planning-checkout
release. Real wrapper controls refuse a missing bounded timeout owner before
any transport starts. The subsequent direct-caller census established that
`scripts/lab/process.js`, the acquired formation holds and their harness
finalizers, capture, and the streaming controller are coupled lifetime owners.
Their group-to-child substitution and first-cause cleanup defects are now in
this bounded correction, with separately frozen original controls. Unrelated
formation policy and tunnel implementation remain outside the change.

After independent candidate review, the sole coordinator runs those same
controls and the existing runner, placement/split/discovery, local-corpus,
publisher/workspace-link, Solver land, acceptance-summary and native-proof
regressions on the immutable candidate. Complete native-proof falsifiers retain
wrong-head, missing-root, skipped/zero-assertion, truncated, failed-command,
retry and disallowed-reuse rejection. Positive clean execution must still work.
The canonical selector owes the whole corpus for these runner/hook/placement
changes; its triggers and acceptance thresholds are unchanged. Regenerate
combined metadata on the lab and prove the final exact candidate.

The installed lab contract permits arbitrary source commands but does not
establish repository-write credentials, native artifact export/proof custody
or a GitHub check bridge. Those remain delivery capability findings. This
repair neither creates a new publisher nor supplies formation/schema-admission
or release acceptance.

## Measured materializer interruption

The retained `materializer-original-3491.log` records two real SIGTERM sends
while the exact-SHA materializer's child was live. The child configured to
exit zero produced materializer zero and lost its diagnostic; the child
configured to exit 42 produced materializer 42 and retained its diagnostic.
The observer itself released each child after signalling. Their observed
closure therefore does not prove cancellation. Root and author independently
verified the complete 5,803-byte stream and its SHA256
`8d4afcf1945b41ab6379026acf330d982f59ebff272502e35c79487604c5ce0d`.

The existing `gateExactSha` producer and its sole `prepareProofCheckout`
collaborator own the correction. Use one asynchronous, owned child wait for
preparation and gate execution. The first interruption or failure stops later
admission and remains primary through bounded child cleanup; a later zero
cannot erase it. The signal handler requests cancellation and does not remove
the checkout or exit around finalization. Ordinary completion and interruption
reach one finalizer, which invokes the existing `retainGateDiagnostics` owner
before removing a failed checkout. Failed retention or uncertain child cleanup
keeps the original checkout and reports the unresolved obligation.

Original-compatible controls extend `proof-checkout-preparation.test.js`
through the real CLI and finite children. A live child acknowledges received
cancellation; the test does not release it after signalling the materializer.
Controls retain normal zero/42 behavior, preparation refusal before gate
admission, bounded forced stop, and original checkout custody when copying
fails. The original observer and earlier 37 control cases stay unchanged.
The synchronous acceptance-manifest runner, remote section relay and native
proof contracts retain their existing scope and requirements.

The required preparation list is an admission contract for current source.
The missing-producer success paths in the local owner and remote placement
shell apply only to older commits; current CI and Solver require the declared
producer. This change supersedes that applicability policy from the sealed
`clean-worktree-generated-import-graph` work (49132b8 and 88663e2), preserving
its historical records and all preparation, stale-metadata and signal refusal
requirements. Both owners must refuse a missing declared producer before gate
or runner admission. Original-compatible controls remove the producer from a
real local fixture and a real placed commit; ordinary finite gate fixtures
deliberately provide it. The historical observer remains immutable evidence
of the earlier source, rather than a current acceptance control.

Ordinary execution becomes terminal after the owned child and its acquired
process group have closed and integrity postconditions have completed.
Cancellation callbacks during acquisition, admission and awaited execution
stop that owned work; the first observed nonzero exit or interruption remains
primary. The following retention/removal work is synchronous and can make an
otherwise successful overall run fail. This does not claim that synchronous
filesystem copying or Git cleanup becomes interruptible, or that a signal not
dispatched before the execution boundary was observed. Both real child call
sites use inherited or ignored output descriptors, with a complete owned file
for gate stdin; an outer collector's inherited pipe does not keep the inner
direct-child close event open. Residual members of the acquired group still
block successful closure and receive bounded cleanup.

The actual finalizer calls `session-worktree.js`. Its original remover warned
after Git refusal, pruned metadata, then recursively deleted the session parent.
That behavior existed at introduction `12cd4e844` and survived the warning
change `50f2a17e6`; `54dd2d7` only changed the Git invocation adapter. It is the
same evidence-custody class as the earlier lost-diagnostic incidents, without
claiming this exact remover caused those incidents. The canonical remover now
uses Git removal once, then removes only an empty owned session parent. A
locked or uncertain checkout is preserved, without prune, repeated force or
recursive deletion. [Git's worktree contract](https://git-scm.com/docs/git-worktree)
supplies the real refusal witness: one `--force` does not remove a locked tree.
Finite zero/42 gates lock their actual checkout and retain bytes/registration
when removal refuses.

Every existing caller preserves its first error or measured result when this
cleanup refuses. `dt-prove` retains its measured tuple and original classifier
in the returned failure record; an earlier failed classification remains
primary, a previously successful classification becomes `cleanup-unavailable`,
and a thrown primary error remains the same error. Its finite locked-snapshot
controls exercise the actual snapshot/revert/restore path. These controls and
the complete/empty synchronous-stdin positives are frozen on original source;
their original outcomes were subsequently measured in job 3656 as recorded
below. The candidate's canonical gates remain pending.

## Placement and shared process custody

Root and author independently read all 22,191 bytes from the original TV
continuation 3656, SHA256
`81563c07f90483599edd60b5d153213b616bfb7ffca133fc6ef91a37d8308648`, at
source `aabc29b487375b76dc0f3b7519ce2c8502d0020b`, tree
`9ae3ed4e00355d4d8acc645dd378e9a08d2e6bc4`.
Preparation reached 20 cases: 11 pass and 9 causal failures. Actual missing
producer, interruption and cleanup refusal were promoted or lost on that
original. The cancellation cases fail first at their returned status; their
later closure assertions were not reached and supply no closure proof.
The actual-prove root reached 9 top-level cases: 6 pass and 3 failures. The
successful tuple stayed green after locked cleanup, and the EISDIR case kept
its original exception but lost its original snapshot. The fixed-23 case kept
its flattened failed classification and failed on the missing explicit
`proof`/cleanup envelope; that assertion does not establish classification
erasure. Actual test/final-guard exits were 1/0; this is original calibration,
not candidate or canonical acceptance.

The remaining same-family removal paths are the placed shell and its planning
checkout release. Their destructive removal and next-attempt purge date to
`b9f156c80fb68b0013883a33f9242d8d56ccade9`; the machine-lock extension and
planning owner appear in `1aea11baf6ba35a397547be54fa2621e674c1977`.
`947fbe658ebb2efe993900b672ded51d5610dbcb` standardized kill syntax; it did
not introduce the group-to-child substitution. The current user direction
supersedes those active deletion/purge policies, preserving the original
`test-placement` and `placement-fixture-followups` seals and evidence.
The latter's one bounded abort grace remains required.

The generated shell is extracted to `scripts/lab/placement-shell.js` behind
the existing `placementScript(files)` entry. It receives the canonical lock,
exit and execution policy. The full-corpus trigger and source-reading
ownership witness follow this file boundary. Preparation and runner groups
are distinct from the shell PID and flock waiter PID. Both phases use complete
file-backed stdin and the same group cleanup. One 2-second TERM stage and
one 2-second forced-closure stage fit within the existing 5-second controller
abort grace; repeated signals cannot renew it. Only confirmed absence ends
scope ownership; permission or other probe errors stay uncertain.
[Linux signal semantics](https://man7.org/linux/man-pages/man2/kill.2.html)
and [systemd's group stop policy](https://www.freedesktop.org/software/systemd/man/latest/systemd.kill.html)
support this distinction between requesting a signal and observing closure.
No systemd dependency or broader orchestration layer is introduced.

A controller attempt claims its script and output files exclusively. Upload
uses [GNU dd exclusive creation](https://www.gnu.org/software/coreutils/manual/html_node/dd-invocation.html)
before consuming bytes; an unavailable tool or collision refuses instead of
overwriting a prior bundle. A placed failure, unavailable setup or interruption
retains its acquired checkout, TAP, ref, list and bundle. An unacquired prior
path remains untouched. A clean closed run removes its own checkout through
Git once; refusal retains the uncertain remainder and makes that run
unavailable. No new attempt sweeps older siblings. Planning release uses the
same strict remover once and caches its actual result. Its CLI and split
caller retain an earlier error or measured nonzero outcome when release fails.
The existing pruner reserves placement, placement-worktrees and
lab-test-worktrees so age pruning cannot undo this custody.

After wrapper acquisition, adverse or uncertain execution and failed output
readout retain the controller's exact script and bundle too. Only observed
zero, complete output and successful local finalization discard those inputs.
An earlier observed error stays primary; a later readout error carries the
already observed adverse wrapper status and its original I/O cause, without
inventing missing output. Before wrapper acquisition, a failed setup closes
every acquired descriptor and releases only its own transient input files;
unknown or preexisting paths remain untouched. That boundary preserves the
earlier real descriptor-failure controls while preventing post-execution
evidence deletion.

The shared signal helper only signals a successfully acquired group greater
than 1; ESRCH is absence, and other OS errors remain errors. A formation hold
now actually acquires that group. Lost HELD-session status is adverse and
cached release preserves it through cleanup. The original-compatible witness
does not assume its foreground reader stays live after shell exit: Node may
close stdin at that exit, so an unbounded hold-pipe hang is not claimed as a
measured cause. The existing 5-second release bound remains. The controller's
actual streaming topology does own stdout/stderr pipes; its finite witness
keeps a same-group descendant alive after direct exit 42 and requires explicit
abort to close it before natural completion. Capture likewise waits for closed
pipes on ordinary completion; at its unchanged timeout it reports incomplete
output and unconfirmed group closure, even after a successful signal.
Every affected harness finalizer attempts its acquired releases, signal
disposal and record publication without replacing the original cause.

Original controls are preserved on the 415d lineage and its additive 90bc
successor, separately from reviewed candidate-only policy/fixture adaptations.
The finite controls use actual Git locks, native stream/process identities and
original artifact bytes; public pre-formation harness controls do not claim a
formation ran. The remote cancellation fixture isolates the actual SSH command
in a separate session, so cutting the controller wrapper cannot impersonate
remote group cleanup. The original FIFO scenario is now an explicit collision
witness; the unchanged 300-second transport timeout is not remeasured by it.
Candidate review, physical execution, fresh generated metadata, canonical
static/full-corpus proof and final delivery remain separate outstanding gates.

Parallel placement requires its controller child collaborator before admitting
any assigned child. The production wiring already supplies that collaborator;
an absent or invalid collaborator now returns the existing unavailable outcome
instead of invoking synchronous controller execution beside live remotes. The
candidate finite shared fixture supplies the declared owned-child shape while
preserving its recorded execution calls. Its bytes deliberately differ from
the original `db4890cfe882427aad11017a4e5e6ab3436bde55` fixture retained with
the original measurements. All original 37 control assertion bodies remain
unchanged; a separate finite control requires refusal before any child starts.

## Responsibility boundaries before closure

The code-style owner requires touched source files to finish within 800 lines;
the earlier observed probe line count was not an exception or a governed
ratchet. The source is divided by its existing responsibilities, without a
new execution layer or changes to measured bodies. The public `probe.js`
retains platform probing and direct named exports of the original bindings.
Internal consumers import their canonical modules directly:

| Module under `scripts/lab/` | Existing responsibility |
| --- | --- |
| `machine-lock-constants.js` | Shared lock convention, status and holder vocabulary |
| `machine-hold.js` | Holder records and formation hold acquisition/release |
| `remote-command.js` | Local/SSH command serialization and transport arguments |
| `test-capability.js` | Measured capability, dependency digest and readiness |
| `worker-provisioning.js` | Worker setup generated from the canary's install steps |
| `fleet-discovery.js` | Live fleet observations and exact source requirements |
| `placement-constants.js` | Shared placement policy and outcome vocabulary |
| `placement-source.js` | Exact Git identity and owned bundle inputs |
| `test-placement.js` | Cost placement, admission and assigned verdicts |
| `placement-execution.js` | Assigned child acquisition, output and bounded cleanup |
| `lab-test.js` | Hand-lab planning checkout, assignments and observed results |

The existing `process.js` remains a dependency leaf and owns the exact shared
child exit/close/line utilities and their primitive declarations. The existing
`placement-shell.js` remains the sole remote shell. The test runner's exact
bounded byte reader moves to `scripts/test-output-reader.js`; its public
binding remains available from `run-test-files.js`.

Native byte comparisons preserve the moved declarations, function bodies,
serialized scripts and retained entrypoint bodies. Source review separately
identified an omitted hand-lab import-graph binding: the existing caller now
consumes `PROOF_CHECKOUT_GENERATORS` directly, as its unchanged producer/seal
witness requires. That correction is isolated in commit `1345d420b`, after
the independently reviewed no-child refusal and reader extraction; it is not
represented as a mechanical move or measured success.

Both `FULL_CORPUS_TRIGGER_RULES` and `SELECTOR_SELF_PATHS` follow every moved
proof-bearing module. Their existing witnesses require full-corpus selection.
The original pruner control demonstrated evidence deletion, so the existing
pruner and its retention constants now have an explicit evidence-retention
rule in both mechanisms. The durable-record integer helper remains ordinary
product source. Native line counts and comparisons are source bookkeeping;
physical static checks, generated metadata and runtime proof remain pending.
