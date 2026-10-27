# Independent native fixture R4 delta review

Reviewer: `subagent:/root/retained_effects_tests`.
Verdict: **APPROVE the bounded fixture correction for NF1.** No runtime result
or production source approval is implied. This reviews root's new schedule and
assertions; it is not self-approval of this reviewer's earlier source/fixture work.
No test/source, metadata, lab, commit or publication was changed/run for review.

## Exact candidate

Bundle: `/tmp/mg-native-fixture-candidate-r4-20261023`.

| Material | SHA256 |
| --- | --- |
| Manifest | `e9f8522a0ce699b5db5151f8b211e4a0c9c45905455b3345090ab98bc224179a` |
| Handoff R3 before | `e0b0dbcd425c3a87aa15a19886c526d3b5033372521c675056aa4821e5598a6b` |
| Handoff R4 after | `2413080c7eae679e3661d1f0a9f804ea0d6694d16187f24500aa5766132662ee` |
| Unchanged S2 | `f977fc15f679f98b8b4de141ee6d8add85e56008bd3223fadb318d1e9efbb6cf` |
| Delta patch | `1673bc3475b5ff9965f19c3d26ad9cc144c8bb88d1da0933f2fe6bc88f816488` |
| NOTES | `33fdaee89c860d6bbc54f99882ff5d7da887c1f585bd18ca85453cb8926a3d20` |

The before/after and live handoff bytes were checked independently, as was live
S2 identity. The complete patch adds one canonical identity import, two helpers,
one observation at the original uncommitted cut and one explicit deadline/cleanup
schedule before the original redrive. R3's independent record remains intact:
`REVIEW-mg-native-fixture-candidate-r3-2026-10-23.md`, SHA256
`f78c1a0637c17c0ede02d470b7a987af86ba2d0c3b0111bf77ad7165b65dafe9`.
Its accepted timing, subscriber pass-through and S2 descriptor dispositions hold.

## NF1 correction and actual owner path

`observePendingNativeDelivery` (`handoff:227-238`) captures the actual source
invocation and the old recipient's actual ProposalQueue entry under
`cdcCommitWaitIdentity([f.event])`. It asserts both exist. This is the real durable
event already compared to source ledger bytes, not an arbitrary first map entry
or invented operation. The cleanup observer only records fulfillment; it does
not settle, retire or remove any owner resource.

The original uncommitted cut, both-survivor native election, rejoin and suffix
replacement still run first (`:452-495`). The correction then waits, within the
unchanged fixture's 10-second wait, for the original source response to retire.
It requires the same active invocation, unfinished cleanup and exact recipient
entry to remain held, with every source obligation still undelivered
(`:241-256`). Thus observing a public retirement cannot stand in for actual raw
child closure or source ACK authority.

This follows the actual source lifetime owner: `beginCdcDeliveryInvocation`
retains the active slot until dispatch closes and all raw children settle
(`src/cdc/cdc-delivery-invocation.js:171-218`). Its response timer uses the source
creating clock. The test's `signal.aborted` observation proves retirement; the
signal alone is not a cause-specific timer trace. The expected deadline path is
source-supported under the retained source-tenure setup. A distinct lifetime
invalidation must not be reported as an independently measured timer firing.

R4 then advances the original recipient entry's own clock to that entry's current
budget deadline (`:258-264`). `armCdcWait` actually scheduled its completion on
that captured clock, while the admitted operation awaits `wait.completion`
(`message-group-cdc-committed-acceptance.js:69-75,154-169`). Role loss and native
suffix replacement alone do not supply that completion. Advancing the owner
clock is therefore the missing actuation from R3, rather than another zero-time
pump or a test-invented deadline.

`VirtualTimeSource.advance` fires every due timer in due-time order
(`src/time/time-source.js:146-175`). R4 leaves the recipient's real automatic
native timers enabled and pumps their queued packets through the existing
carrier. It does not discard those packets, force a campaign, replace a role,
clear a waiter or forge a receipt. The original LOSS_ROUNDS=200, native tick
configuration, pump quantum and BUDGET_MS=10000 remain unchanged.

After that actual deadline, the test observes cleanup fulfillment, absence of the
exact old queue key and closure of the original source slot; it again checks
all debt is owed before explicit redrive (`:265-274`). Existing automatic source
retry remains enabled (`partition-cdc-obligation-delivery.js:436-458,627-632`).
The asserted boundary must actually be observed; if automatic redelivery has
already begun, that is a setup/scheduling failure to diagnose, not permission
to suppress the owner, clear its timer or relax the assertion. No success is
inferred from the fixed pump alone.

## Discriminators and retained scope

Dropping raw native-child custody fails the held-slot/unfinished-cleanup checks.
Never closing the admitted native operation fails real cleanup after its clock
deadline. Expiry authorizing source discharge fails the repeated retained debt
checks. Omitting the recipient clock advance leaves the exact R3 NF1 failure.
These are source-semantic discriminators; no mutation was executed here.

The original final assertions still demand exact event identity, retained source
SQL data, actual recipient reproposal, commit/applied frontiers and cache rows.
RF1 separately retains the actual receipt-time and source replicated ACK proof.
No timeout-only assertion substitutes for those semantic facts. The required
nine-category considerations are carried forward from R3; the changed timer,
recovery, concurrency and cleanup interactions now have explicit actuation and
observation without new admission, transport, retry or durable-state owners.

Source observations used for this bounded review include native acceptance
`7bb0595056b206384a9128773b53291ddeef11b66c6b7921b6ce78f9837fb5ae`,
source delivery `f3821b9850910c368ba1168fff7f8fcaf870448c5c6eec0c0c9eda4afbac7056`,
and invocation lifetime
`5d02b240662e0784175006884effeb9bbf913a192fed300626f4c2a0464e2d84`.
Their broader source revisions need independent review of their own.

The author reports syntax/normal ESLint passing. Actual setup, clock progression,
closure, fresh redrive and final semantic assertions remain unexecuted on R4.
This approval permits the exact fixture candidate's next root-coordinated lab
proof; it does not establish full W7, protected activation, durable transfer,
two-start acceptance, Quest landing or merge readiness.
