# Independent lab review — native MG fixture trace R2, 2026-10-23

Reviewer: `subagent:/root/retained_effects_review`. Review is read-only with respect to source, tests and lab execution. The reviewer reconciled the existing job and retrieved its original worker log through read-only controller evidence requests; no source workload was resubmitted and no local runtime was executed.

## Verdict and material findings

**The measured job is FAIL. The RF1 intended semantic red is engaged. RF3 proves premature source-leader ACK at the recorded uncommitted-recipient cut, but its later leader-loss/suffix-replacement/redrive witness is incomplete.** This is usable, exact-source baseline evidence, not implementation approval, runtime PASS, full MG acceptance or Quest closure.

1. **RF1: intended receipt failure, not a setup miss.** The actual durable source event passes through the real subscriber, seed bridge and initialized topology. The real propagation result says `success:true`, `status:"delivered"`, `strategy:"direct_fanout"`, `mode:"safe"` and `targetGroupCount:0`, but supplies no `cdcCommitted`. At the inner bridge-return continuation, the recipient cache already contains the row while its durable history contains only the index-1 no-op; commit/applied are both 1 and there is no native CDC entry. `RF1_ACCEPTANCE_REQUIRES_NATIVE_AFTER_COMMIT` fails at test line 170, called from line 341. This directly discriminates cache/early success from native committed application. The later RF1 `assertSourceAck` path was not executed; at the diagnostic cut all three source peers still owe this event.

2. **RF3: source-leader debt is discharged before recipient commit.** The source leader's actual `CDC_DELIVERED` entry is index 6, term 1, with commit/applied both 6. Its obligation for source index 5, ordinal 0 has `delivered:true`, `deliveredIndex:6`, `deliveredTerm:1`, and its owed census is empty. The ACK's event-key digest and deterministic entry ID independently recompute exactly from the recorded source identity and canonical acknowledged vector. The recipient leader retains one actual CDC entry at index 2, term 1, but its commit/applied remain 1; both recipient followers retain no CDC occurrence and no row. Source followers still owe the event at this immediate cut, so this is explicitly **source-leader applied discharge**, not an assertion that every source peer has already applied the ACK. The recipient command also visibly drops the event-key/source-occurrence envelope and remints its envelope timestamp to `1000-1-mg-custody-native-r1`, while its data retains the source HLC. These are observed existing semantics, not a repaired implementation.

3. **RF3: full loss/recovery assertion is unengaged.** The first failing assertion is `actual remaining recipient quorum elects a leader` at test line 386. The preceding exact retained-proposal and uncommitted-frontier assertions passed. The fixture never reaches rejoin, native suffix replacement, canonical source redrive or `SOURCE_CUSTODY_RELEASED_BEFORE_RECIPIENT_COMMIT`. The failure is an ordinary `ERR_ASSERTION` with false versus true, not a thermal abort, process timeout or setup initialization exception. Election diagnosis must remain source-bound and must not be replaced by a larger pump/time budget. This review does not infer successful suffix replacement, permanent loss or restored custody from the pre-loss cut.

## Exact source and execution custody

- Source: `4ce8fbd31b7c44129a3431752313b2e9c0ae19ab`, ref `refs/heads/work/mg-delivery-fixture-trace-20261023`, repository `psvensson/lagrange`.
- All four committed blobs match R2 manifest SHA256 `8fbaec25e9f2c22323d2d1d5a52bf087b85cbce10b1b80b429655574222cc733`. Authored native test SHA256 is `0c5225055f319df6440cc56028d178a7f16fffd406f169dac6d9e27f6b7a7e9b`. The committed production `src` diff from `21cfd917d8ceb2f0c1435cade117c0c44a91a03a` is empty. Concurrent, later S2 test work in the trace worktree is excluded from this execution review.
- Original source request: `3c0f9ba96a2c42679aa5321cf509194a`; controller `b4a2e06c193c44b09f1b67d02e8d80f4`.
- Envelope SHA256: `686e0369202d482b0c15992796cb5a1c38c1bb733537a98c1687646040733164`.
- One 1,019-byte payload: SHA256 `2ec4281a1ae0276e480b93a353699e095859de933abe11961728a982c5da894b`.
- The remote issue body and sole payload part were compared byte-for-byte to the local packet. Payload digest, exact source and sole selected file `test/message-group/message-group-native-custody-handoff.test.js` were independently verified.
- [Terminal receipt, job #1026](https://github.com/psvensson/lagrange-lab/issues/1026#issuecomment-6361772736): recorded 2026-10-23T09:26:09.911Z; `COMPLETE` with explicit `FAIL`; outer/worker exit 1; one worker, `lenovo-laptop`; source execution started. No source-job duplicate was submitted.

The complete original worker stream is 79,861 bytes, SHA256 `ebd6c7de17da2592ee8683f1e1cc1c5c65655fe0132a8790854d41c4f45a6142`, stream ID `1f797aea165d41816fa75d3032b160ec55af8f20e9fbfc266ae130174768bec8`. Ten chunks cover [0, 79861) contiguously: issue #1027 at offset 0, then #1029–#1037 at offsets 8000 through 72000. Every chunk's request identity, controller, job, host, stream, offset, length, raw/chunk hash, text/base64 equality, original-byte/hash declaration and EOF were independently checked. Every query reports read-only, no source execution, terminal original job, and no truncation. There were no failed evidence queries. The terminal's shorter 8,209-byte controller tail is not substituted for this original stream.

The full log contains no native diagnostic elision. TAP diagnostic escaping was reversed only in a separate decoded analysis file; original bytes are unchanged. The original file records `test-files planned=1`, one failed leaf and final `test-files total=1 pass=0 fail=1 assertions=2`; TAP records two child tests, zero passed, two failed, zero cancelled/skipped/todo. “2 assertions” is the runner's reported count, not a count of JavaScript assertion calls. The generic worker's `completed_test_files:null` is not a substitute for the full runner census.

## Source setup and exact boundary observations

Both cases independently record real `cut_over`, an open source gate and three committed source voters. Ordinary `executeQuery` returns the durable commit witness for source index 5, term 1. On each of the three actual source peers, the retained QUERY command, settled/applied participant outcome, physical row and owed obligation agree on index, term, entry ID and row content. The QUERY timestamp equals the durable event timestamp and its `data.updated_at_hlc`; source commit/applied are at least index 5.

| Case | Source entry ID | Source HLC | First failing boundary |
| --- | --- | --- | --- |
| RF1 | `native-cdc-rf1-write` | `1792747565205-0-config-custody-native-r1` | Missing canonical native after-commit receipt at actual bridge return |
| RF3 | `native-cdc-custody-write` | `1792747565905-0-config-custody-native-r1` | Remaining-recipient leader election after the recorded early source ACK |

The immutable raw log places RF1 setup/release, source-debt and return-cut diagnostics at lines 62–64, and RF3 setup/release, source-debt and source-flush/uncommitted-recipient diagnostics at lines 90–92. RF1 failure is at log lines 39–60; RF3 failure at lines 65–88; final file and TAP census at lines 93–103. Native append messages retained by the RF3 carrier contain the actual index-2 CDC proposal destined for both followers; the observer does not fabricate a committed receipt or remove cache/history to manufacture loss.

This newly engaged baseline does not erase #986. That earlier exact-source run still failed before native acceptance because the original topology fixture had not been initialized. R2 measures the source-reviewed readiness/diagnostic repair; unchanged acceptance bodies distinguish the new engagement from a weakened assertion.

## Cleanup and physical machine observations

The terminal reports outer scope/execution closed and worker containers/execution/thermal scopes closed. Its last CPU sample is 48 C, SSD unavailable, with no thermal-abort reason.

[Pre-fleet #1025](https://github.com/psvensson/lagrange-lab/issues/1025#issuecomment-6361526111) ran at 09:11:44.263–09:11:45.173Z. All six machine locks were free; lenovo CPU was 48 C. This precedes source submission by about twelve minutes and is not represented as the execution lease itself. [Post-fleet #1028](https://github.com/psvensson/lagrange-lab/issues/1028#issuecomment-6361795825) ran at 09:27:24.158–09:27:25.177Z. All six locks were again free; lenovo CPU was 52 C, SSD unavailable, with no probe error. Lenovo's boot ID is unchanged: `18581133-d0d9-4dec-a3f8-266562235699`. Both complete fleet JSON digests were independently verified: pre `63a1b188dfe09358d2da278b4579c470d2ab6d3db11512e940f958a87eb10572`; post `c1454540cdcf9328e5ab75749b0b31fcfae69b83ce48e6d248a025eee96cd1d9`.

These receipts establish execution/lock closure for the failed job; they do not establish a test PASS or complete logical recovery.

## Category-complete applicability

| Category | Measured disposition / limit |
| --- | --- |
| Admission and gating | Real source release/open gate and ordinary QUERY proved on the selected component topology; full original startup cohort remains outside scope. |
| Harness fidelity | Real initialized topology, subscriber, bridge, native histories and physical source row/debt are engaged. RF3 election schedule still needs diagnosis. |
| Transport and delivery | RF1 early success without native receipt and RF3 leader ACK before recipient commit are observed. Only one source MG and zero extra targets are measured here. |
| Recovery and replay | Source obligation/ACK identity is bound. Recipient loss, suffix replacement and redrive were not reached. |
| Concurrency and retry | The actual inner return and pre-loss flush cuts are retained. No eventual-success inference, larger timing budget or retry re-execution was used. |
| Formation circularity | Actual source cutover is recorded; recipient replacement election is the failed prerequisite. This is not startup/formation closure. |
| Owner interaction | Existing release, query apply, durable obligation, subscriber, bridge, topology and native state owners are observed; no second receipt/identity owner was invented. |
| Hostile contract input | This native selection is a valid-envelope witness, not the separate canonical-validator vector suite or full adversarial corpus. |
| Cleanup | Worker/container/thermal scope closure and post-fleet free locks are verified; no leaked source workload was created by evidence collection. |

## Collection artifacts and remaining gate

Authoritative retrieval artifacts are retained under `/tmp/mg-delivery-fixture-trace-r2-runtime-*` for parent preservation:

| Artifact suffix | SHA256 |
| --- | --- |
| `worker.log` | `ebd6c7de17da2592ee8683f1e1cc1c5c65655fe0132a8790854d41c4f45a6142` |
| `log-custody.json` | `bf2a7e3096826eef51bfde41b66c514b19cfff57f3db3cef153d089aea81bb6d` |
| `terminal-receipts.json` | `232b9ea25d7eb31532aa72bbddff57dfa2591e553ab223975ae5ff4c6da554a0` |
| `boundary-verification.json` | `aa71c72fb9465b6d9c366be271188cdb56ccf3f0c350c8442bb7561c2ed388c0` |
| `post-fleet.json` | `d191003865f2dfd6ff9a16e9e649ad028b4a715efb05d5c9c58732e794465bd5` |

The request/observed packet, all ten request/receipt pairs and decoded diagnostics are retained beside them. Original receipt URLs and every byte interval are enumerated in the custody file.

**Disposition: accept the authenticity and bounded applicability of this failed baseline; retain FAIL and the unengaged RF3 recovery gate.** Next, trace the unchanged native election/carrier/peer schedule before proposing a fixture correction. Production delivery completion, target-vector coverage, receipt composition, full retained recovery, protected activation, durable transfer, composed two-start acceptance, Quest landing and merge remain separate requirements.

## Read-only election diagnosis after custody reconciliation

The source schedule repeats a known project failure pattern: a surviving follower's leader lease never advances. This is a source/history diagnosis, not an additional runtime result. The #1026 log emits its final vector before entering the loss loop and does not record the subsequent vote packets or terminal survivor statuses; therefore it cannot independently prove which individual native pre-vote was ignored.

At the executed source, `message-group-native-custody-handoff.test.js:378–385` ticks only survivor `f.services[1]` during the unchanged 200 loss rounds. The shared fixture's `pump` delivers queued packets and advances every virtual clock by **zero**. The other live survivor `f.services[2]` received the original leader during real formation but is never explicitly ticked. Positive-interval native scheduling cannot run merely from `advance(0)`: `VirtualTimeSource.advance` only fires timers whose due instant is no later than its unchanged current instant. Message-group construction passes its provided clock into the actual native port. Thus the ordinary scheduling seam has been replaced by an incomplete test schedule for this survivor.

The project's existing owner requires every opened replica's native clock to advance: `src/raft/raft-rs-group-constants.js` sets both pre-vote and check-quorum true, `raft-rs-runtime-tuning.js` supplies those settings to every core, and the runtime's participation-gate handling explicitly lets non-promotable gated learners tick so their leases do not freeze. This fixture does not need a new gate exemption or disabled safety setting.

The matching upstream mechanism is explicit in [raft-rs v0.7.0's native Raft implementation](https://github.com/tikv/raft-rs/blob/v0.7.0/src/raft.rs#L1239-L1271): a follower with a known leader and unexpired election timer ignores a higher-term vote/pre-vote unless it is a transfer election. Native `tick_election` increments that timer; message delivery alone does not substitute for those ticks. This explains why initial formation can elect by ticking one peer before the other peers know a leader, yet the same schedule cannot replace a leader after formation.

There is exact project precedent:

- `9f7c915bb55968bcf0c84c9d19878a9c8f6c8e50` (2026-10-05) enabled these safety settings and repaired `test/raft/raft-rs-backend/local-log-guard-correct-followers.test.js` by ticking **both** surviving replicas, accepting whichever actually becomes leader, and retaining the existing round bound. Its commit message explicitly identifies setups that ticked one candidate while followers that had heard a leader were never ticked.
- `7f1ef3788` added the native guarded-versus-plain liveness schedules. Current `native-election-liveness.test.js` and `native-election-schedules.js` drive each live survivor through its actual native tick and compare real elections; they do not fabricate leader roles.
- `1839bc347` placed gated-joiner tick ownership at the native owner so a learner's lease could not freeze behind host admission.
- The custody witness's one-survivor loop already exists at `5a3cdc71854c7d97d2e3b688258b73c19dd0c6e4` (2026-10-16), and survives `21cfd917d` and the measured `4ce8fbd31`. The shared carrier/pump file is byte-identical from `21cfd917d` to `4ce8fbd31`, SHA256 `2806d3980b7b4b0392c79e2924984fb23e26147c5c27a3ed2e5d7a9409ff3012`. R2's initialization/diagnostic change did not introduce this scheduling defect.

**Bounded recommended correction, not yet implemented or approved here:** within the existing `LOSS_ROUNDS`, tick each live recipient survivor through its actual port, retain the existing carrier loss cut and pump bounds, and identify the actual native survivor leader rather than requiring r2. Emit the status/packet/frontier vector before the election assertion so a remaining peer-gate, native refusal or carrier failure is visible. Keep all native safety flags, source debt, queued append bytes, acceptance assertions and loss/rejoin obligations. Do not replace native election with a transfer/campaign shortcut, forced role, forged opening, longer timeout or larger pump. The corrected schedule still needs independent source review and fresh exact-source lab measurement; the prior failed attempt remains evidence.

