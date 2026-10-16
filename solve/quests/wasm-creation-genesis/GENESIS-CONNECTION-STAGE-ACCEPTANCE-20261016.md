# Bound INIT and committed membership observation: staged author review

This is the implementing ChatGPT session's staged author review under the
operator's explicit instruction. It is not independent verification, terminal
Quest landing, serving activation, a main merge, or release approval.

Verdict: ACCEPT this bounded genesis continuation/observation stage for continued
WIP integration. Serving, event-driven progress, full recovery and release remain
held. This acceptance follows the exact-source lab results below.

## Exact measured source

Base / PR132: 50c64ac476bca16c607d42e8c11d3b8606a01f53.
Frozen final test-only checkpoint: d5fe21d6bb9b18f25d943ab6506685920a34f549.
Candidate: c090b63b28c3ab980a1e40802d71e26acfeba1f4.
Branch: work/rs-raft-genesis-observation-20261016.
Tree: 2c10c3b074a1dab9ae2f17cf5362c0c2803d2629.
Source subtree: 5e193fa018a7b29fc2943f13d8d562c1e7b9f98d.
Test subtree: c1b896fa1c1a70b5c52555522bd699c75107f555.
This acceptance record is a subsequent documentation-only commit. Source and
test bytes remain the exact candidate measured below.

## Interaction reviewed

The bound opening owner derives the one canonical INIT command from the already
retained binding, including its original request nonce and supported profile.
The writer-state owner requires that exact command both at admission and when
validating retained initialization. The held WASM lifecycle calls the existing
writer-completion owner on normal START/reconciliation reentry; only a leader
submits. Duplicates join its existing interest, bounds and original deadline.
Followers observe their own applied state without minting or forwarding INIT.

Proposal submission or forwarding is not genesis completion. The continuation
rereads the applied writer owner, requires a recorded accepted result, and
consumes the current port's canonical validated committed membership stamp.
The native group identity, exact founding voter identities, absence of learners,
open participation gate, and applied index/term covering the INIT receipt are
required. Invalid, joint, refused, unavailable, stale or uncovered observations
never become GENESIS_OBSERVED. A successful observation carries the binding,
physical group/replica identities, receipt and original canonical membership.

GENESIS_OBSERVED is evidence, not serving authority. The existing result stays
BOOTSTRAPPED_HELD, with no ACTIVE route, endpoint, START_SUCCESS, completed
creation journal, user read/write permission, leader publication or safety timer.
No new scheduler, timer, queue, metadata table, native drain driver or retry loop
was added. WriterCompletion remains the only pending-interest owner.

## Findings and corrections before source publication

The new wait introduced a shutdown race: a stopped native replica could still
return BOOTSTRAPPED_HELD. The existing lifecycle now rechecks the exact current
registered replica and initialized state after the await. The actual native
shutdown witness proves no stale bootstrapped reply or retained DB/port/handler.
A rejected retained INIT receipt was incorrectly treated as successful because
RECORDED alone was checked. The explicit accepted outcome is now required;
the new fault writes the real SQLite record and restores it in finally.
These were two engaged failures in the expanded twelve-case suite, followed by
passing unchanged assertions after the owner corrections.

Another first-run failure exposed the native publication ordering: the existing
writer interest can settle after SQLite apply but before the native membership
observation advances. Source correctly returns APPLICATION_NOT_COVERED in that
gap. The unsealed fixture's immediate-success assumption was corrected: it
requires HELD first, then OBSERVED on one explicit normal lifecycle reentry after
the original native delivery schedule completes. No read-side tick, drain, poll
or stale-membership acceptance was added. This stage does not wire an external
APPLIED_PROGRESS/leader-event wake or claim autonomous progress after the first
pre-election bootstrap call.

The final fourteen-case extension adds orderly reopening and a different-cohort
read fault. That fault initially removed the leader because raw native peer IDs
were compared to a resolved replica ID; the fixture now consumes the original
identity mapping and removes a follower. Its valid-stamp precondition and final
refusal assertions were not weakened. This is an apparatus correction, not an
additional safety violation. The two container-level interrupted local attempts
have no terminal verdict; all first completed results and diagnostic files remain
retained. Not every intermediate local source tree has an exact retained identity;
only the named frozen/publication candidate and source-only controls do.

## Completed source-bound physical-lab measurements

All four source jobs reached COMPLETE. No behavioral test was retried to obtain
PASS. Existing classified placement, machine locks, normal locked dependencies,
thermal policy and hardware calibration were used without policy changes or
controller-side test fallback. Each job named its exact current remote branch tip.

| Actual host / treatment | Files | Result | Whole-file duration |
| --- | ---: | --- | --- |
| Lenovo candidate: genesis and eight neighbors | 9 | 217 reported assertions; all files PASS | new genesis 9496 ms; old bootstrap 4559 ms |
| TV candidate: driver and lifecycle neighbors | 6 | 272 reported assertions; all files PASS | native completion 1782 ms; WASM lifecycle 2629 ms |
| Lenovo exact-INIT-content source-only mutation | 1 | 13 pass / 1 intended assertion failure | 10787 ms |
| Lenovo participation-gate source-only mutation | 1 | 13 pass / 1 intended assertion failure | 11008 ms |

The candidate passed 15 distinct files with 489 reported assertions and no failed
files. Runner counts can include parent entries; they are not 489 independent
cluster scenarios. Lenovo candidate factor 2.3, CPU 51-52 C, NVMe unmeasured.
TV candidate factor 1.8, CPU 64 C, NVMe Sensor 1 48 C. These are actual reported
observations, not a sensor-coverage or performance-improvement claim. Negative
comparison scheduling/calibration is not claimed identical to the positive.

The first source-only control, 1c5d552a24b0034bece87805c0381e1648bef5dc,
removes only exact bound INIT-content admission. Test 3 fails at
FOREIGN_INIT_CONTENT_WAS_RECORDED: actual RECORDED instead of REFUSED for a
same-incarnation command with a different original nonce. The other 13 cases pass.
Branch: proof/rs-raft-genesis-init-content-20261016.

The second, 416ab8079db8e4ff0e6e4e5c4d04f1d9a5d47981, removes only
stamp.gateOpen from the continuation's founding-cohort check. Test 9 fails:
GENESIS_OBSERVED instead of GENESIS_HELD for a canonical valid membership shape
with its applied participation gate closed. The other 13 cases pass. The fault
uses the disclosed native port-read seam, not an actual native gate transition.
Branch: proof/rs-raft-genesis-membership-gate-20261016.

Both proof commits have the unchanged candidate test subtree. Their observed
failures are semantic assertions rather than missing methods, import/setup,
cancellation or timeout failures. Neither wrong source was substituted for the
product branch. The full returned positive executor logs were copied and their
byte length/SHA256 rechecked in the cloud. Negative terminal tails, named failure
stacks and full TAP counts were inspected; normalized observations were retained.
The complete negative raw logs/native archives were not exported or rehashed.
The raw hashes below are bridge declarations for those negatives, not a false
cloud verification claim.

### Immutable requests and retained log identities

Private lab #90: 1e9f75d9ff614a96b703923dc5b873ce, COMPLETE 2026-10-16T19:21:00Z.
Request SHA256: b415679ed5228989cbbb9eca41564bb3233887380a0e781c166964c0682758be.
Source: c090b63b28c3ab980a1e40802d71e26acfeba1f4; exit 0.
Raw log: 2445 bytes, 830fed6576bdf92d275aef3225780abb38d101bec91f2340010f396838abf785.

Private lab #91: 749860d3718d481abc6d6d98e37bd3b0, COMPLETE 2026-10-16T19:22:26Z.
Request SHA256: 0a4ead51100bd7ae3ec5aa8a141ad6c2a287a6c38026e04a23ca34ae0cf9b7af.
Source: c090b63b28c3ab980a1e40802d71e26acfeba1f4; exit 0.
Raw log: 1575 bytes, 4076c2bc980bb9ddb5ed636e82e6725bfc0f93875c75cc4676611905815b95ae.

Private lab #92: 47481d6bd872422ab1fdac723c2b8785, COMPLETE 2026-10-16T19:23:36Z.
Request SHA256: 5d78e4a1627db5bc89e3b22030638068b238550eb84bd41f63ab609c109e5fbc.
Source: 1c5d552a24b0034bece87805c0381e1648bef5dc; exit 1.
Raw log: 10508 bytes, dfb17ae29bc756a54eadbc5ecc9d86b916ee941147ce35201ffe68a1122e067e.

Private lab #93: f1b4dd2387c34b498ab0bd362bac490a, COMPLETE 2026-10-16T19:24:47Z.
Request SHA256: c2967fa1140670f8e6144cd350f32e282cd49573109088ea567dc4e05a152686.
Source: 416ab8079db8e4ff0e6e4e5c4d04f1d9a5d47981; exit 1.
Raw log: 10947 bytes, a7e6c234f4a243a92bc421e239dabab3a33a95a3c9b6873f3f48e726b6dbc7de.

## Evidence ceiling

The fourteen-case positive reaches actual native RF3 application without the
fixture submitting the successful INIT. The no-quorum case withholds real native
APPEND_RESPONSE messages, observes pending interest, lets the original owner
deadline return UNKNOWN, then restores the same messages and observes the same
initialization on reentry. It does not claim proposal noncommitment or retry with
a new identity. Concurrent delivery produces one native proposal; reservation
ordinal remains one. The orderly reopen preserves original initialization,
receipt, physical replica and token.

Metadata/journal reads remain disclosed single-database component adapters;
transport is queued loopback and the setup clock is virtual. Membership fault
cases replace the actual port read at an explicit seam; they are not actual
native joint-transition proofs. Guest execution uses the existing fixture
collaborator rather than artifact verification. Orderly native reopen is not
native process-loss/power-loss proof; inherited intent SIGKILL tests are separate.
Neither running different test files on different machines nor native RF3 on one
machine proves a physical multi-host cluster or replicated metadata quorum.

## Publication and gates

Publication-only Actions 38953826991, attempt 1, completed without retry.
Artifact: 12070490315.
ZIP SHA256: 11fdf836fd3d0d37ee15d0173fcb787ca546e130fac719eb3d55ca66fb14b20c.
All seventeen manifest members, both original patches, thirteen changed
postimages, raw candidate/test/proof commits and actual remote ancestry were
verified. The local reconstructed source/test trees matched the actual upstream;
its synthetic local Git history was not published. No product test executes in
the carrier and its success is not behavioral evidence.

Scoped ESLint, strict new module/test cyclomatic and cognitive checks, literal,
decision-boundary, deferred-outcome, silent-catch, boundary-mode and runtime
grammar checks pass. Four inherited decision entries match the existing baseline.
The ambient-intrinsics audit governs none of these files and supplies no extra
coverage. Two new complexity counts of thirteen were simplified through pure
membership/result helpers without raising the threshold of twelve. Canonical
metadata and shard checks pass: 2401 tests, 66 contracts, 37 coupled pairs.

The complete precommit hook, global inventory/analyzer-memory debt, full impact
cone, corpus and exact integrated release gates remain OPEN, not silently waived
or claimed rerun. No baseline, timeout, retry, thermal policy or heap bound changed.

## Next connection remains mandatory

Connect existing native progress/leadership events to the correct existing
reconciliation owner without a competing scheduler or an unbounded retry. Then
combine current metadata permission, committed genesis evidence, local durable
permission/publication and RETIRED-before-CLOSED through joined lifecycle owners.
Finish safe forward recovery of the claim-before-file gap, upstream durable
selection-request K, artifact binding, replicated metadata, actual native
process-loss and physical multi-host qualification. Do not enable serving on
GENESIS_OBSERVED alone. Larger Quest receipts and all wider rs-raft holds remain
unchanged. Main, shared staged work, lab policy, W07/F1, release control, TX1 and
FreshMG implementation lanes were not modified by this stage.
