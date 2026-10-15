# Ordered recovery closeout: review checkpoint

Production implementation remains HOLD. The successor remains unsealed and
unactivated; shared-control-wave HELD; Runner/TAP PARKED; PR122 and bde70cec
remain rejected. This evidence branch includes rejected predecessor production
source and must not be merged wholesale.

Source baseline and unchanged native test head:
`c425ef42e18236ff1187e1112a971588bb02b496`.
Worktree `/mnt/data/peter/projects/.worktrees/ordered-release-recovery-20261015`;
branch `review/ordered-release-recovery-20261015`.

## Selected mechanism

[ORDERED-RECOVERY-CONTRACT.md](ORDERED-RECOVERY-CONTRACT.md) selects one
RETIRE_AND_APPROVE command, carrying an immutable next-generation APPROVE.
Retirement, that exact disposition, the fixed receipt and applied position
commit in the existing application transaction. No interval exists for another
retirement or competing result to intervene. All real D2 checks still apply.
[DESIGN-DRAFT-1.md](DESIGN-DRAFT-1.md) and independent criticism are preserved;
the proposed split durable handoff was replaced, not implemented.

Runtime owns occurrence custody and service; result/application owns exact
outcomes, history and atomic exchange; the existing release continuation owns
intent. TX/query keep settlement; snapshot owners keep application import.
[RIFL and etcd precedents](RELATED-SYSTEMS.md) supplied limited cross-checks,
not protocol authority.

## Evidence and limits

| Observation | Exact result | Claim boundary |
| --- | --- | --- |
| Unchanged persistence-admission.test.js, locked lenovo-laptop | whole file 4 tests pass, exit 0, 1,773 ms | Existing native runtime persistence admission and held Ready; includes direct-store unit case. |
| Unchanged operation-port-ready-recovery.test.js, locked adams-gamla | whole file 7 tests pass, exit 0, 804 ms | Existing native reconstruction, apply rollback/progress and stale Ready generation fencing; mixed direct-store primitives identified. |
| New executable ordering traces | 14 scenarios and all 729 specified six-stage action strings pass, exit 0 | Design projection only; no real release commands, distributed election or D2 provenance implementation. |
| Same trace bytes with retirement-overtaking mutation | exit 1, ADMITTED != NOT_ADMITTED at protected maintenance assertion | Detects removal of the selected admission exclusion; not native protocol RED. |
| Old split schedules | Six repeated saturation cycles and six repeated overtaking cycles, zero approvals | Executed counterexamples of the prior rules; historical original packet is unchanged. |

The two native files ran concurrently on different locked hosts, each using its
own native fixture. They are not one physical cross-host cluster. The accepted
recorder and local-PAUSE ROLLBACK control were not rerun. No timeout changed.
First preflight dependency failure and all trace revisions are retained.
Independent review found a v2 trace defect: duplicated interpreted fields were
not fully bound to canonical bytes. Its executable counterexample is preserved;
v3 validates those fields and adds an actual-prefix competing-APPROVE trace.
This was a design-evidence defect, not a demonstrated native bug.
No new inherited RC1/RC2/F-MIR, lint/complexity or whole-corpus classification
is inferred from these focused observations; their prior failures remain open.

Raw logs, exact source/test hashes, commands, controller bytes and exits are in
[raw](raw). Trace executable SHA256 is recorded in source-and-run-identities.json.
Git stores executable evidence as exact `.mjs.txt` byte mirrors; the release
archive additionally preserves the original `.mjs` files. Those traces are not
repository production code or a replacement transaction model. Independent
reports live in [reviews](reviews), including their exact reviewed hashes.

## Retained limitations and acceptance matrix

| Contract / owner | This packet | Required next witness / remaining gate |
| --- | --- | --- |
| Atomic retirement + carried disposition / application-result | Selected, executable narrow traces, existing native atomic-apply control | Real command/schema and native saturated result exchange at one actual position. |
| Exact M/K; timeout and duplicates / runtime-result | Selected entitlement vs physical occurrence rules | Real local + forwarded custody, deferred Ready, duplicate occurrence and late commit. |
| Leader loss and discard / runtime-store | Explicit authoritative interface assumed by traces | Current-term prefix reconciliation, actual suffix discard and reconstruction before admission. No map-miss proof. |
| Fair service / runtime | Owed tick + one inbound envelope, then cyclic maintenance/HOLD/settlement/ordinary | Actual continuous-ingress native schedule. Current drain-until-empty and Promise tail do not provide it. |
| Closure when H history saturates / release-runtime-result | Explicit remaining blocker | OPEN-state maintenance wake and protected HOLD opportunity; competing refusals can refill H. Do not claim whole-protocol nonstarvation. |
| Intake and backlog / runtime-store-native | Source-mapped unresolved | Bounded volatile acceptance and reconstruction; preserve over-profile follower history; no quota-dropping replication. |
| Result encoding/profile / bytes-result | Conditional 4,273,152-byte leader projection only | Maximum variants, pinned-obligation policy, durable inventory and activation. No system/disk/memory bound. |
| Snapshot/import / existing snapshot owners | Existing refs preserved | Exact application image provenance, native accepted Ready, atomic application/consensus import and receiver-local eligibility. |
| TX1/query settlement and size | Existing owners unchanged | Closure reservation before new obligations; acknowledged larger DECISIONs retain a path; ROLLBACK is not COMMIT. |
| Prefix provenance, durable discharge, INIT, binding, D3/D4, deadline | Existing separate gates preserved | Complete release/HOLD -> ordinary write/first PREPARE -> durable outcome/replay unit. |

The smallest later increment is the existing runtime/store custody and bounded
service seam plus typed compound application/result exchange, with its native
RED-first witnesses. It remains part of one complete partition-level release
unit. No fragment is accepted or independently landed on focused greens.

## Ownership and preservation

Fresh takeover observed shared integration HEAD
`0996d7576516af24f5f4d3e1e9aee37c775aabae`, branch
`integrate/rs-raft-2026-09-30`, 18 staged paths; staged patch SHA256
`0b2ea79142a13f4dcada523f01108fbd8a4809492838e23f7a0246a7159953fc`.
Existing processes/worktrees were inventoried, not treated as leases or stopped.
Raw process command lines and shared staged patch remain private local evidence
and are intentionally excluded from this review publication.

Snapshot work refs remain preserved, not reassigned:
`9554f689ef1fd4560e23ed8ca4f386266539f83f`,
`458076e64b4e36ac1525f93f6daa41bbf3fadc5c`,
`2384216d16d11dc6d62a682ffef192dc944a7a15`,
`82b54ef9b7c8d6be9f2d6450cbc5e6713ade00af`.
No parallel snapshot path, production changes, harnessd dependency, main merge,
successor seal or activation was introduced. Prior sealed Quest/witnesses and
accepted/rejected evidence bytes remain unchanged. Publication receipt binds
the final archive, reviewed content and non-force review branch separately.
