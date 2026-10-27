# Independent review: currentness component witnesses R1

Reviewer: `subagent:/root/mg_delivery_design`. Date: 2026-10-23.

Verdict: **REVISE**, limited to two finite fixture/proof corrections: use issued
boot-incarnation values, and explicitly exercise the captured-ingress exception
while published readiness is false. No other blocking defect was established in
this three-file static pass. The production source corrections have their own
bounded approval; these findings do not call for production changes.

No runtime, test execution, semantic mutation, source/test/metadata edit, Quest
log, commit, push or lab action was performed. This new review file is the only
write. The existing assertions and all three R1 files must remain preserved when
the author produces an R2 test freeze.

## Exact reviewed bytes and scope

Worktree: `/mnt/data/peter/projects/.worktrees/mg-source-occurrence-delivery-20261023`.
Base: `21cfd917d8ceb2f0c1435cade117c0c44a91a03a`.
All three hashes below were independently checked before and after inspection.

| File | SHA256 | Lines |
| --- | --- | ---: |
| `test/test-helpers/cdc-topology-progress-fixture.js` | `ad71c1fdde8f1bdd70746b5cc30b6ad0e4f8d0527874b6d6b583f799c087045b` | 157 |
| `test/partition/partition-cdc-topology-progress-currentness.test.js` | `c0e4b95531e93101a309b9116fbc64d09cadc7cc3a3811cfdbe67db5f5c372ea` | 159 |
| `test/bootstrap/cdc-propagation-source-owner-currentness.test.js` | `65689b8ab9aa0c53a142da1e8c55a34b469e6fa4241bc5873372a8262459522a` | 87 |

Related source freeze: `/tmp/mg-root-selection-topology-r2-20261023/manifest.json`,
SHA256 `094fe3b3c23d4021dc39afeea72e777c5428158fe9778104585c30cc56aa0d9c`.
Its bounded source review is
`REVIEW-mg-delivery-root-selection-topology-r2-2026-10-23.md`, SHA256
`462fcd8cf8cd4693d9e5ef8b03a9c1e1e66368cc951bd833be0365c9444fe004`.
The governing MG contract remains
`474182126c3c985feceadb9a1b72d7de9975e1b4c3280af52be884c6c095f383`.

These are deliberately component witnesses. The fixture uses the real partition
application, SQLite obligation ledger, subscription and topology owners, with
the existing controllable consensus fixture. Recipient results and route
projections are controlled inputs. A value named NATIVE is a canonical builder
result supplied to test the source consumer; it is not evidence that a real
recipient proposed, committed or applied. No system-row registration/publication
or native Raft proof follows from mutating these projection records.

## W1: boot-incarnation control is outside the owner's issued domain

The fixture creates target `boot_incarnation: 'boot-b-1'`, and the node-boot
replacement case changes it to `'boot-b-2'`. The actual
`src/bootstrap/boot-incarnation-contract.js:1-20` owner issues positive safe
integers, beginning at 1. Neither string can be a published issued incarnation.

The test currently measures arbitrary string metadata replacement. The source
comparison is meaningful, but the fixture should exercise the real field domain
required by the harness-fidelity template. Use two valid issued values, such as
1 then 2, and pin them with `isIssuedBootIncarnation` from that owner. Preserve
the existing first-coverage/expired-other sequence, route re-observation count,
native source-fact reuse, debt/no-ACK assertions, and repaired positive. This is
a two-value fixture correction, not authorization to mint boot authority or run
the persistent boot owner inside this component fixture.

## W2: captured ingress with temporarily false readiness is unmeasured

The selector fixture defines `preferred.ready`, but every live preferred-owner
case leaves it true. The first test proves that the same preference outranks an
earlier relay and that `initialized = false` moves selection to another service.
It does not prove the approved captured-ingress exception while the preferred
owner is initialized but published metadata-ingress readiness is temporarily
false.

A partial selector repair that consumes `preferredService` only when its
published readiness is true would pass these cases while preserving the second
original R2 formation veto. The prior source review specifically required that
captured-ingress readiness case, and the actual production subscriber passes
`reuseCapturedIngress: true` with its captured service.

Add a paired case using the existing component fixture: set
`preferred.ready = false` while `preferred.initialized` remains true and its
existing captured-ingress operation is present. Assert the synchronous selector,
async selector, subscriber currentness accessor and actual subscriber invocation
all use that same preferred object. Keep the later `initialized = false`
replacement/refusal control. No native leader flag, fake committed receipt,
production guard relaxation or new fixture framework is needed.

## Positive source observations and test discriminators

The topology fixture initializes and starts the real topology owner. It creates
a real controlled committed QUERY through the partition application owner,
subscribes while the partition is a follower, and restores leadership through the
controllable port. Readiness holds setup delivery. Before the measured drive it
asserts exactly one owed row and no subscriber calls. This excludes the earlier
uninitialized-topology and unengaged-subscriber failure classes.

The first branch must return a complete controlled source/target result before
the second responsible subscriber is invoked and expires the creating context.
The tests assert both subscriber calls and source/target engagement, not merely a
retained row. The expiration uses the existing VirtualTimeSource and the actual
remaining invocation duration; it changes no production timeout. Its due timer
callbacks run normally. This is not the separate delayed-callback F1 proof, and
no test claims it is.

| Case | Meaningful distinction in the written assertions |
| --- | --- |
| Six route/lifetime replacement controls | A formerly covered branch is revisited, UNKNOWN blocks it, source native fact is reused, then a fresh weak target result permits only provisional release. W1 corrects the boot field domain. |
| Stable unchanged prefix | The second subscriber alone is revisited; source/target calls remain at one and complete weak release clears the optimization cell without ACK. |
| Added required group | The new group is actually visited and UNKNOWN prevents complete coverage; the existing native source fact survives. |
| Requirement growth during the last subscriber callback | Even after the earlier branch returned native coverage, the changed set cannot enter ACK custody; the next drive visits the additional group and only then becomes ACK-eligible. |
| Route replacement during the target await | The old weak result cannot cover the new route; a later drive addresses the new route and remains provisional. |
| Projection omission | The old captured target is still visited while omitted and remains owed until it actually returns a valid controlled result. |
| Grouped source contradiction plus missing coordinator | Source and target call counts remain zero and no ACK is pending/proposed; restoring the source group permits existing conservative fallback. |
| Selector preference, retirement and leader precedence | Real shared selectors and subscriber factory are called. A recorded leader is an explicit selection stub, not proof of native leadership. W2 adds the missing captured-readiness case. |
| Wrong provisional source group | Actual propagation was called once, then the consumer refuses the mismatched result. A setup failure before callback engagement cannot satisfy the call assertion. |

The growth test changes the projection inside the last subscriber callback. It
exercises the observable post-callback/aggregate currentness requirement; it does
not uniquely isolate the final source line from earlier scoped post-await checks.
That is an appropriate behavior test rather than a test that mirrors one helper.
Similarly, these tests do not prove remote service-row mutation authority or
unobserved remote incarnation liveness.

`assertDebtWithoutAck` checks the persisted owed/delivered census, absence of an
ACK proposal, and zero pending acknowledgements. Positive committed cases stop at
ACK eligibility; they do not claim that proposing an ACK has already delivered
the row. Actual ACK-apply proof remains in its existing source-owner witness.
The helper records recipient calls while SQLite is outside a transaction.

All named imports were traced to actual exported owners/helpers, including the
partition obligation constants/census, topology service and harness, canonical
outcome builders/predicates, shared selector/subscriber factory, HLC/time owners,
and participant fixture exports. This check is separate from syntax/ESLint, which
cannot alone prove named-export linking. Setup/teardown resets config/logging,
stops the topology owner, and awaits the existing participant shutdown helper;
the fixture does not intentionally leave a held native child or real socket.

## Remaining proof boundary

The author reports syntax and scoped ESLint/complexity-12 passing. Runtime is
**UNEXECUTED**. No head-red, red-on-revert or semantic mutant result is claimed.
When measured, preserve the actual engagement assertions and failure reasons;
an import/setup failure, timeout before engagement, or empty callback census is
not evidence of the currentness bug.

After W1/W2, this finite suite can be reviewed as component proof of the specified
selection/route-reuse behavior. It still does not replace native held-operation
custody, exact same-text selected-service replacement during a held real child,
large-population progress, complete mixed-vector correspondence, S2/W7, or the
source ACK application's proof. R4's semantic owner and the final integrated
F1/root/F3 source/checkpoint remain separate gates. No production bytes should
be changed merely to accommodate a fixture premise.
