# W07 first native runtime-service result

**Semantic RED retained.** The first whole-file execution has 3 passing controls
and 1 failing service case, exit 1. Four post-cut inbound steps precede the
selected ordinary proposal; the independently reviewed, pre-execution bound
was one. All four accepted occurrences retained their message bytes and
produced native replies. No production correction was made or tested.

## Identities and ownership

| Identity | Exact value |
| --- | --- |
| Reviewed base | `ec6a14832e843080e1079c19efe3c0d2fce1bab8` |
| Executed test-only checkpoint | `cf34d0b73b294e38b836a971d3b54d6c0799addb` |
| Review branch | `review/native-runtime-service-w07-20261015` |
| Test | `test/raft/raft-rs-backend/runtime-captured-inbound-service-native.test.js` |
| Test Git blob | `debc16f442ba63b100332d93b285865d36d1c376` |
| Test SHA256 | `07f9cd3a396b1036f96e2130efa454f1702b7acc6ad7e45b14274c5c3a3bce8d` |
| Frozen plan SHA256 | `f5c79702e99802631c2d56bf2183fd29b6720e04c282547944f4fb6e474c81fd` |
| Exact pre-run approval SHA256 | `f7015e4a4e85b0d35345235dad6b27264198037e7806becf47af003037bfae39` |

Own isolated worktree: `/mnt/data/peter/projects/.worktrees/native-runtime-service-w07-20261015`.
Fresh shared-checkout observation: `integrate/rs-raft-2026-09-30`, HEAD
`0996d7576516af24f5f4d3e1e9aee37c775aabae`, 18 staged paths, staged-patch
SHA256 `0b2ea79142a13f4dcada523f01108fbd8a4809492838e23f7a0246a7159953fc`.
Twenty relevant process cwd observations were recorded, not treated as leases.
No existing process, agent-owned tree, shared staged work or dependency install
was modified. Review workers were read-only; the principal alone authored this
new test and evidence. No harnessd dependency.

Single semantic owner is `raft-rs-runtime-owner.js`: accepted inbound custody,
turn serialization, Ready continuations and generation validation remain there.
The operation port retains lifecycle/codec admission; transport produces and
delivers actual native envelopes; the durable store retains log facts. This
witness introduces no authority. Impact registration is in the existing runtime
application contract's tests list, not a newly declared coupled-pair witness.

## First execution

Locked host `lenovo-laptop`, Node v22.23.2, one exact committed checkout and
unchanged matching dependency graph. `runLabTest` uses the existing bounded
machine-lock/placement wrapper; its recorded `placement-head` is the executed
SHA above. Normalized dependency graph SHA256 is
`0b49533effbed7e3577dd212628a99e56c630068f76a9dc148cfc8dc96b28bf0`.
Native binding bytes are recorded in `raw/identities.json`; they are unchanged
from the base and integrity-checked by the existing loader.

Command (the retained wrapper imports the existing executor; it is not a new harness):

```sh
LAGRANGE_LAB_AGENT=codex:native-runtime-service-w07-20261015 \
LAGRANGE_RETRY_FAILED_ONCE=0 node run-one-capture.mjs ROOT NEW-EVIDENCE \
  cf34d0b73b294e38b836a971d3b54d6c0799addb lenovo-laptop \
  test/raft/raft-rs-backend/runtime-captured-inbound-service-native.test.js
```

Classified whole-file duration: **3,005 ms**. TAP body duration: 2,537.702018 ms.
Four subtests, 3 pass / 1 fail, zero cancelled/skipped/todo. Whole file failed;
controls do not relabel it green. `raw/native-first/raw.tap` and `run.log` retain
the first failure and full diagnostics. `event-traces.json` is a derived JSON
extraction from that TAP, not a second execution. No retries or threshold edits.

| Case | Native observation | Result |
| --- | --- | --- |
| Quiet | predecessor propose 484; selected propose 493; zero post-cut inbound | PASS |
| Replacement | accepted heartbeat core step 1122 in generation 1; real reconstruction; old invocation HOST_FAILURE/runtime-generation-changed; retained occurrence step 1170 in generation 2 and real reply; no selected proposal entry | PASS |
| Refusal/tail | C's actual removed-peer response refused once; valid forwarded marker durably appended at index 4, selected local marker at 5, both term 1 | PASS |
| Recurring inbound | predecessor propose 2360; steps 2369, 2378, 2387, 2396; selected propose 2405; four actual replies; same bytes for all four deliveries | FAIL: 4 > 1 |

Minimal exposed interval in the longer frozen trace:

```text
predecessor owns a native forwarding await
-> selected ordinary proposal queues
-> occurrence 1 accepted
-> predecessor resumes; selected turn steps occurrence 1 and awaits its reply
-> occurrence 2 accepted during that await
-> reply 1 resumes; live-queue recursion steps occurrence 2 before selected propose
```

The executed extension adds occurrences 3 and 4 under the same rule. The
selected proposal eventually enters and returns CORE_OK after finite input
stops. This demonstrates late service against the selected finite-round rule,
not measured infinite starvation, election failure or committed release effects.

## Passive evidence and qualifications

No measured service-interval status polling, settle/deliverAll, manual tick
loop or unrelated command rescued the selected proposal. Native internal
`status` entries in the trace belong to the runtime's own Ready drain; they
are not observer port reads. Observers append records/hash arguments only.
The replacement control deliberately uses two declared ticks of a separate
group's owned clock and the existing fault seam to inject a core-fatal tick
and exercise actual native reconstruction. This is deliberate fault injection,
not an observed spontaneous WASM defect. Its later target
clock wake is the existing accepted-input owner, not a status-read rescue.
The refusal diagnostic read occurs after both input steps and proposal entry;
the durable log proof uses a passive database read.

All four cleanup records report settled, with no retained unsettled directory.
The fixed passive cleanup unwind is specific to this finite fixture; it proves
no general production deadline or cleanup liveness contract. Existing partial
failure inside the fixture constructor remains a limitation. The transport
uses held native send Promises and inboxes, not physical cross-host networking.
RF3 forms before measurement; the refusal control legally removes C and is RF2
while measured. Heartbeat duplicates are delivery-schedule choices, not invented
consensus decisions. Entry/output proves service, not quorum commitment of the
selected forwarded proposal. Durable indexes 4/5 are log append evidence only.

Pre-run review rejected weaker preservation/cleanup checks; its report and
unexecuted draft are preserved. Final exact bytes were approved before the only
native run. Syntax, scoped ESLint, impact validation and normal pre-commit pass.
Inventory refresh reported inherited source complexity/duplication debt; the
source corpus and debt counts are unchanged. This is no whole-corpus pass.
Inherited RC1/RC2 F-MIR and lint/complexity integration obligations remain
separate and were not rerun or waived.

See `SOURCE-CORRECTION-PROPOSAL.md` for the smallest proposed runtime increment.
The accepted retirement mechanisms remain unchanged. Production implementation,
merge, successor sealing and activation remain HOLD; shared-control-wave HELD;
Runner/TAP PARKED; PR122 and bde70cec remain rejected. The review branch carries
rejected predecessor source and must not be merged wholesale.
