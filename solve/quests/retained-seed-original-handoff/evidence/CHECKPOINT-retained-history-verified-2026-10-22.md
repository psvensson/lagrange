# Retained native history and participant origin: verified lab checkpoint

## Disposition and exact candidate

The corrected candidate completed its declared runtime and metadata/fast-static
lab measurements. All fourteen selected runtime files passed, with 221
runner-reported TAP assertions from this one candidate and one batch. Both real
integration cases passed. This closes the bounded unit's lab verification;
the complete original startup handoff and its eight receipts remain unfinished.

| Binding | Identity |
| --- | --- |
| Tested commit | `d7ef793be58af944639e6fae69a2c023c85e9002` |
| Frozen candidate branch | `work/original-retained-rf3-correction-20261022` |
| Repository tree | `3806e8bad05150ccb5ede2e2363a03e108ec8f03` |
| Production tree | `d2ce2fdae880c6b2ec9c78fbcc03f164ec3213ba` |
| Test tree | `8fd5261465147e3ed8e321c62122bd6a5d6a9143` |
| Diagnostic parent | `164479277f58f6075e0c6bfd214ba3d2654da3db` |
| Original production candidate | `cb822d6fcf8c7b78b34a718772d06488490bc0da` |
| Measured malformed-history baseline | `79fa766ed290c5545cf4017ee589b86e440e0e47` |
| Separate proof-record branch | `work/original-retained-final-proof-20261022` |

Production is byte-identical to cb822d6f. The only test-source correction is
the RF3 setup witness's consumption of canonical configuration identity. The
normal hook regenerated derived metadata. Proof-record commits may follow the
tested commit without changing its frozen candidate ref or its measured bytes.

## Completed lab results

| Measurement | Actual lab worker | Exact result | Finished UTC |
| --- | --- | --- | --- |
| [Runtime #855](https://github.com/psvensson/lagrange-lab/issues/855#issuecomment-6347034607) | local-workstation | PASS, exit 0; 14 selected, 14 completed, 14 passed | 2026-10-22 17:29:46.927 |
| [Metadata/static #856](https://github.com/psvensson/lagrange-lab/issues/856#issuecomment-6347024387) | tv-dator | PASS, exit 0; metadata and all 14 fast-static checks | 2026-10-22 17:29:11.995 |

Execution, thermal and container scopes are closed for both jobs. The selected
runtime batch and its static companion have no queued or running work left.
Both setup and execution explicitly used existing Node v22.23.2; the setup
logs also record npm 10.9.8. No runtime/native tests ran in the agent workspace.

The complete runtime log reports these per-file counts:

| File | Runner-reported assertions |
| --- | ---: |
| participant-decision-canonical-record.test.js | 8 |
| participant-origin-retained-history.test.js | 35 |
| partition-participant-transaction-apply.test.js | 27 |
| durable-store-committed-entries.test.js | 33 |
| durable-ready-loop.test.js | 7 |
| partition-participant-transaction-staging.test.js | 19 |
| persistence-admission.test.js | 4 |
| operation-port-ready-recovery.test.js | 7 |
| restart-from-durable-record.test.js | 4 |
| partition-unreadable-durable-record.test.js | 6 |
| raft-rs-original-allocation-cold-inspection.test.js | 24 |
| raft-rs-original-opening-authority.test.js | 24 |
| seed-original-attempt-lifetime.test.js | 21 |
| participant-origin-retained-history.integration.test.js | 2 |
| **Total** | **221** |

The lane summaries independently total 198 + 21 + 2 assertions and 12 + 1 + 1
passing files. Every selected path appears exactly once. The generic worker's
counter object is empty; these totals come from complete project-runner file
verdicts and matching lane summaries. A green project verdict requires complete
TAP, positive assertions, no skips or TODOs, and no process error, signal or
timeout. The successful aggregate log does not print a separate cancellation
count, so none is invented from that empty generic counter object.

The static job verified 2,440 primary/resource/subsystem classifications and
all fourteen fast-static checks against explicit base
`1262e9c9b306b7289e9768f6ca8cce8f172594d9`. Its range has 51 changed paths,
including 12 JavaScript files. Metadata, fast-static and tracked-tree exit
statuses are all zero. The checked-out tracked tree remained unchanged.

## What the integration result proves

The RF1 case produces an actual committed ENABLE, holds its application,
observes the exact committed-pending origin without writing SQLite, shuts down
the acquired native resources, cold-reopens through the existing durable
bootstrap owner, and applies the same original index, term and command. A
subsequent idempotent ENABLE preserves that origin and native history.

The RF3 case first establishes a real settled admitted three-replica group.
It holds the exact native commit carrier to one follower while ENABLE is
produced and persisted normally. The follower is observed as locally pending,
then committed-pending when that carrier is forwarded under a finite
application fault, then applied through the existing recovery cadence after
the fault is removed. The retained entry bytes and original index and term
remain the same. Both unconditional integration cases completed successfully;
RF3's previously unengaged transition assertions now have runtime evidence.
This RF3 group is on one lab host and does not establish cross-host certification.

All 24 cold-inspection assertions also pass. That 12,401-byte witness is
unchanged from the measured baseline, SHA256
`a1f4d8ee7f4fb5e457195d383c28512be0c23f4e74684b8e0b07caacc346fe3d`.
The eleven baseline negative leaves that failed with Missing expected exception
now pass along with their later callback/custody assertions and positive controls.

## Measured witness defect and preserved failures

Candidate #835 passed thirteen files, but RF3 failed its initial settled-state
assertion before ENABLE or commit-carrier interception. The diagnostic-only
successor #842 retained the entire predicate and all deadlines. Its last
captured evaluation showed applied=commit=last=3, term=1, complete coverage and
pre-origin on all replicas. Membership role sets and autoLeave matched. Only
one replica's voter vector order differed, making the witness's ordered
ConfState comparison the sole false conjunct in that recorded evaluation.

The correction imports the existing `raftRsConfStateKey` owner, already used
by durable storage and committed membership. It compares separate membership
roles and autoLeave independently of vector order. No production byte, native
history, fixture, frontier condition, origin condition, later assertion,
deadline or runner control changed. #842 directly measures this cause; #835
did not record its values and is not retroactively attributed at conjunct level.

| Retained attempt | Outcome and interpretation |
| --- | --- |
| #814, baseline 79fa766e | 24 reported assertions: 12 pass, 12 fail; eleven engaged negative leaves plus their failed parent |
| #820, candidate cb822d6f | npm ci setup failure; zero tests executed |
| #821, candidate cb822d6f | Metadata/fast-static PASS; separate source decision-audit RED remains |
| #835, candidate cb822d6f | 13/14 files pass; RF1 passes, RF3 initial setup fails; 221 reported assertions across the selected batch |
| #842, diagnostic 16447927 | RF1 passes, RF3 setup fails; measured configuration-order defect |
| #855/#856, corrected d7ef793b | Full selected runtime and metadata/fast-static PASS |

The initial submission-format error, diagnostic inventory heap failure and
corrected-witness sandbox Git-subprocess failure also remain in their original
records. The corrected witness's normal precommit passed after rerunning with
the required execution permission and the established 6 GiB static heap. No
hook check, runtime assertion, deadline or ratchet baseline was disabled or raised.

## Evidence and independent review

- [Exact submitted requests and candidate binding](REQUEST-retained-corrected-d7ef793b-2026-10-22.json).
- [Complete receipts, verified hashes and derived results](MEASUREMENT-retained-corrected-d7ef793b-2026-10-22.json).
- [Complete runtime log](RUNTIME-retained-corrected-d7ef793b-2026-10-22.txt): 3,577 bytes, SHA256 `5e960c197713616aeed5c3856fabd9b4edb76c2f2d9c049a6d6352fbcd4b2624`.
- [Complete static log](STATIC-retained-corrected-d7ef793b-2026-10-22.txt): 2,145 bytes, SHA256 `6f4df28e7e75e646049c0861466aba473022d248935ce1dd0a2428ac7868538b`.
- [Diagnostic cause and raw observations](MEASUREMENT-retained-rf3-diagnostic-16447927-2026-10-22.json).
- [Independent review history](REVIEW-retained-history-2026-10-22.md), including exact correction approval and the separately appended final result disposition.

Evidence reads #859/#860 returned each full controller log at offset zero.
The worker logs are explicitly untruncated. Both their byte counts and hashes
were also verified by removing only the controller's exact host prefix and
single appended newline. No additional runtime execution was needed to recover
the logs. Earlier raw failure evidence and review entries remain append-only.

## Remaining boundary

This proves bounded native-history validation and read-only participant-origin
observation. It does not finish SQL/MG producer/effect classification, snapshot
application correspondence, cold membership propagation or autonomous-effect
exclusions. Protected activation, leader acknowledgment, durable transfer,
complete public-admission exclusions and the composed public two-start proof
remain unfinished. Startup retains its named classification/continuation holds.

The inherited three decision-boundary findings in canonicalDecisionRecord and
buildDecisionRecord remain RED; the earlier startup owner finding also remains
recorded. Test-only precommit and metadata/fast-static success do not clear
those source gates. Whole-corpus, certification, publication and release
acceptance require their own applicable proof.

The original seal and all eight handoff receipts are byte-for-byte unchanged.
No Quest landing, main merge or public-serving permission follows from this
checkpoint. The next implementation boundary is complete retained-command
effect classification through the existing application owners.
