# Retained creation to held native bootstrap: bounded author acceptance

Verdict: ACCEPT the measured held-bootstrap connection for continued WIP
integration under the operator's instruction to use this ChatGPT session as
reviewer between stages. This is author review, not independent verification,
terminal Quest landing, serving activation, a main merge or release approval.

## Exact source

Base / PR130: 609f35524a40d3f7ce8ee6c5a2fdfe89c0859203.
Frozen test-only checkpoint: 5e3ae57f6a8ab2ab3f477c405970cca79a082de4.
Measured candidate: 8200dd4529b4fa19b72e0450fee1a91493eb942a.
Branch: work/rs-raft-bound-bootstrap-20261016.
Tree: 5a71eed4fdda72f6c9f1056d05df2ba86ef623b3.
Source subtree: d4361a9c67c7480a28be633f283e9e300377d0c1.
Test subtree: c2c149387ad5e9c3ac705f2bbe1d243c6380dcac.
This report is a later documentation-only checkpoint. No source or test bytes
changed after the measurements below.

## Accepted interaction and its limits

The existing manager, runtime adapter, runtime lifecycle, WASM driver, WASM
lifecycle and native replica now consume one retained creation origin. The
original operation, binding and reservation token survive the handoff; no
nested PREPARE/START journal supplies a second identity. Physical group and
peer identities derive from the existing canonical runtime identity owner.

The original operation journal records its first-opening claim conditionally
before file creation. Only the exact winning claim may create a fresh file.
Retained claims require the existing file, common binding root, receiver-local
ADMITTED record, token and the storage owner's real-path/device/inode identity.
A missing or exercised different-file copy is refused, not initialized again.
This is not protection against malicious same-user filesystems, inode reuse or
whole-machine cloning. The local record is not copied serving permission.

A real native three-voter group can bootstrap and apply matching INIT while
remaining BOOTSTRAPPED_HELD. The common root rejects a different incarnation.
The bound path does not publish ACTIVE, an endpoint, START_SUCCESS, journal
completion, leader/role updates, safety timers or user read/write permission.
Direct legacy command and writer proposal entry points also refuse held work;
INIT remains the existing explicitly trusted administrative operation.

Actual runtime shutdown now joins native closure before clearing bookkeeping,
propagates cleanup rejection and still attempts the other driver owners. An
uncertain or failed native teardown retains custody. A physical close here is
NOT semantic RETIRED, metadata CLOSED, or a successor serving grant.

## Review corrections, with first results retained

The initial five-case missing-method baseline is an unimplemented-capability
result, not a semantic falsifier. An initial implementation passed those five.
Expanded review then reproduced storage-loss fresh bootstrap, deleted-root
identity loss, direct held-admission bypass, orphaned native shutdown and
suppressed cleanup rejection. These were corrected through the existing
journal, opening, command, lifecycle and shutdown owners.

A subsequent 9-pass/1-fail attempt had an apparatus expectation of a direct
rather than nested AggregateError. The test now checks actual causal nesting,
restores its fault in finally, and strengthens the shutdown requirement.
The sixteen-case extension initially gave 15 pass / 1 fail at
HELD_GENESIS_QUEUED_LEADER_PUBLICATION. Both existing role queues and their
flush paths now retain the hold. No failed result or recorded history was
rewritten. LOCAL-FIRST-RESULTS.json binds the retained local diagnostic files.

The final local nine-file run passed 322 reported assertions. It is distinct
from the physical lab measurements, not substituted for them.

## Completed first local-lab results

All requests used exact named remote branch tips, normal locked dependencies,
the existing classified executor, machine lock and thermal owners, retry=0,
and no controller test fallback or timeout override.

| Actual host and treatment | Files | Result | Relevant whole-file duration |
| --- | ---: | --- | --- |
| Lenovo candidate: native bootstrap and seven neighbors | 8 | 203 reported assertions, all files pass | native 4534 ms; shutdown 1437 ms |
| TV candidate: driver/lifecycle/journal/idempotency/native completion | 6 | 272 reported assertions, all files pass | lifecycle 2041 ms; native completion 1493 ms |
| Lenovo wrong-root source-only mutation | 1 | 15 pass / 1 fail | 6163 ms |
| Lenovo retained-as-fresh source-only mutation | 1 | 13 pass / 3 fail | 5745 ms |

Positive total: 14 distinct files, 475 reported assertions, no failed files.
Reported counts include parent entries where the runner counts them; these
are not 475 independent cluster scenarios. Candidate Lenovo factor was 2.3,
wrong-root 2.4, retained-as-fresh 2.3, TV 1.5. Same-host comparisons do not
claim identical scheduling or a speed improvement. Lenovo CPU observations
were 50-53 C and NVMe unmeasured; TV CPU 61 C and NVMe Sensor 1 45 C.

The native fixture uses actual raft-rs groups, native durable files and owned
process-directory locks, but an explicit shared SQLite metadata/journal read
adapter, virtual setup clock and queued loopback transport. The matching INIT
is explicitly submitted by the fixture through the existing administrative
path; automatic production genesis is not implemented. Module execution is a
disclosed fixture collaborator, not actual guest/artifact verification.
Intact-file native history reopening is orderly close/reopen, not native
SIGKILL recovery. The inherited PR130 process-loss neighbor tests do not
upgrade that claim. No physical multi-host or metadata-quorum proof is claimed.

## Engaged negative evidence

50418a03f94ff1b03b16c2a57fc1883e9085b522 changes only the common-root
incarnation comparison in wasm-writer-state.js. On the unchanged native
witness, wrong-incarnation INIT actually returns RECORDED instead of REFUSED.
The other fifteen cases pass. Proof branch:
proof/rs-raft-bound-bootstrap-wrong-root-20261016.

a4bf16caa4ba86d1c8361f958ca2fe1256d3542b changes only the existing first-use
record's returned mode from RETAINED to FRESH. The unchanged storage-loss
witness fails at LOST_STORAGE_REOPENED_AS_FRESH with BOOTSTRAPPED_HELD after
file loss. Intact-file reopening and uncertain-first-opening controls also
fail. These three failures arise from one deliberately wrong decision; they
are not three independently discovered product defects. Proof branch:
proof/rs-raft-bound-bootstrap-replay-fresh-20261016.

Both proof commits have the unchanged candidate test subtree. Neither was
substituted for the product branch. Their failures are engaged semantic
results, not import failures, cancellation, timeout or cleanup-only failures.
No test was rerun to obtain a pass.

## Request and raw-log identities

Private lab #83: f3bc098a1a2543cfba43212fca6ed811, COMPLETE 18:13:38Z.
Request SHA256: 32269d159d538ce10e12065d12d4ea1578b663bec2c5a2e6318fcc7047e03245.
Raw log: 2342 bytes, 3ef6e77c2a4f58265a04ee0e93889d1536bc0f32e236048aa9ca3ef35ae33966.

Private lab #84: 366b12bcc11a4dcfb70d626d62aa8d60, COMPLETE 18:14:33Z.
Request SHA256: 1ffea8d34a726c4678299aad6f7c629fd2afb2b85bac7a01309a12c3071edbbc.
Raw log: 1575 bytes, 64f43f85f0f5273f24087edf38a8ceef189369de60d717d667d58ad4276da81f.
Both complete returned positive executor logs were copied and independently
rehashed in the cloud; controller/request/source bindings match the requests.

Private lab #85: 4b952abaa3224df898dbea76ad74dc5f, COMPLETE 18:18:55Z.
Request SHA256: 198a72852371fbc1880aeca034545e6887b0410bf6574ee1c4f5c194fdf0586b.
Raw log: 10043 bytes, c288460e81acef98a55aba2bb530eb2b5e8ce941391fe36e9028b2fe19704dc5.

Private lab #86: c59b1a7816be4d128ac2dcafd29a7ffa, COMPLETE 18:20:01Z.
Request SHA256: 19363c400853b90712b0eda8a497349e2f3cad9821abe1f498f960143246dd18.
Raw log: 11952 bytes, e244842b525c4a5669aee79668b4e18ed14ee4e54ba92e1dd71777214ce36545.
Negative terminal tails and each first 8000-byte window were inspected via
completed evidence requests #87 and #88. Their whole raw/native archives were
not exported or cloud-hash-verified; redacted displays are not raw-byte proof.
All four source jobs and both evidence reads have terminal results.

## Publication and global gate boundary

Original publication-only run 38944956850 verified both patches, 29
postimages and source/test subtrees, then published candidate 8200dd45.
GitHub rejected its first proof-branch push with a workflow-detection timeout.
Artifact 12064004930 ZIP SHA256:
2380881f870c4a2a4331266ffbb2b6400865cbfd3f2a1b8bd37587818c76e580.
Its raw commits and original patches were independently verified, but it has
no final inner checksum/proof manifest because that run did not complete.

A proof-publication-only recovery left the product branch unchanged. Run
38945692921 attempt 1 hit the same GitHub timeout; its identical job retry
succeeded on attempt 2. Artifact 12066030395 ZIP SHA256:
ee5e01495313ee6c34fb247847b99872fe9adc6bc768ce76e9753118ff1462e9.
All seven inner manifest files, raw candidate/proof commits and source-only
diffs were verified. No product tests execute in these carrier workflows.
The failed publication runs remain history, not misreported application reds.

Scoped lint, literal/grammar and new-module complexity/cognitive checks passed.
Canonical metadata completed: 2400 tests, 66 contracts, 37 coupled pairs.
Four unbaselined lifecycle decision findings and the existing journal helper's
silent-catch finding remain red and were directly compared with PR130 source.
The normal hook reported these then was interrupted during full inventory
regeneration; it has no completed exit code and is not claimed green. Global
static/analyzer-memory debt, full impact cone and corpus remain open. No gate,
baseline, heap bound, timeout, retry or thermal policy was weakened.

## Next integration, still required

A permanent opening claim followed by a crash before application-file creation
currently stays held: absence is not proof that a fresh bootstrap is safe.
Forward recovery of that gap is still required, not accepted as complete.

Next connect automatic common genesis and committed membership evidence to
local serving permission and publication; implement RETIRED-before-CLOSED,
joined retirement, last-predecessor-closure wake and recovery. Complete the
upstream durable selection-request intent, actual artifact binding and the
replicated metadata/process-loss/multi-host proof without component adapters.
Do not enable serving merely because INIT or native startup succeeded.

The larger creation/genesis Quest remains open, its receipts unchanged.
Main, shared local staging, lab policy, W07/F1, release-current-control, TX1
and FreshMG implementation lanes were not modified by this stage.
