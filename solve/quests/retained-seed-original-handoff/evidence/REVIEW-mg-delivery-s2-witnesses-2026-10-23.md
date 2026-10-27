# Independent review: S2 native provisional route witness

Reviewer: `subagent:/root/mg_delivery_design`, 2026-10-23.

**Verdict: REVISE one test-wrapper integration omission before final freeze.**
The native setup, source admission and semantic assertions otherwise match the
approved bounded S2 plan by source inspection. This is not a measured setup,
observed red, passing witness, production approval or full W7 acceptance.

## Exact inputs and review boundary

| Frozen file | SHA256 |
| --- | --- |
| `test/message-group/message-group-native-provisional-route-fixture.js` | `0ad1ba30c274779fddbbf57a199e2a8d4f4ce377f2fc16b62743454d54f71673` |
| `test/message-group/message-group-native-provisional-route.test.js` | `feb4801a3b8d47d70ee588daf69fdc355e2662f6ab0b1e49253bccb50c94e5b2` |

Both hashes were checked at the beginning and after source tracing. Governing
contract SHA256 is
`474182126c3c985feceadb9a1b72d7de9975e1b4c3280af52be884c6c095f383`.
The corrected 248-line fixture plan SHA256 is
`8f23ec9bb697eb686ffb2d7390b857e8360ee7ad37d635d2f89732b8334e0b86`;
its independent premise review is
`REVIEW-mg-delivery-s2-fixture-plan-2026-10-23.md`.

Baseline source owner inspection used `git show` at
`21cfd917d8ceb2f0c1435cade117c0c44a91a03a`. Root's moving production draft was
consulted only to identify the new private-context route; this review does not
approve those moving bytes. No source, test, metadata, Quest log, native runtime
or lab job was edited or executed. This new evidence file is the only repository
write. Static inspection resolved all 24 fixture and 45 test local named imports
against their source export lists/barrel exports; no missing public named export
was found. That check does not substitute for runtime module loading.

The existing native custody handoff, custody fixture and CDC outcome test have
no diff from the baseline. Unrelated observer test deltas in the worktree were
not reviewed or changed. The two new S2 files are currently untracked test
candidate files; root owns their registration, metadata and preservation.

## Required correction R1: preserve the real private delivery context

`connectSubscriber` at test lines 172-178 installs a
`propagatePartitionCDCEvent: async (service, event) => ...` observer wrapper and
calls `bridge.propagatePartitionCDCEvent(service, event)`. It drops the actual
third argument supplied by the production shared subscriber.

The approved F1/F2/F2-P interaction carries its source-owned invocation budget,
currentness, child custody and one-obligation progress through this private
argument. Root has already threaded it through the three production subscriber
constructors and seed/join delegates. This test wrapper must transparently
accept and pass that same third argument to the actual bridge. It must not
mint a substitute context, attach it to the event, or manufacture readiness.

This omission does not change old `21cfd917` two-argument behavior: that baseline
can still exhibit its earlier canonical semantic red. It does prevent the
completed approved interaction from being tested faithfully, and could create
another unengaged owner refusal before the intended S2 route assertion. Make
this finite transparent forwarding correction, refreeze, and independently
review the delta. The corresponding RF1/RF3 tracing wrapper should receive the
same integration check when composing production with that separately preserved
baseline; no earlier measurement is retroactively reclassified.

## Ordinary source admission and exact occurrence

`prepareProducer` uses the existing `formAdmittedGroup` and
`attachPartitionReleaseOwners`, requires actual `CUT_OVER`, then uses ordinary
sessionless `executeQuery`. `writeOrdinarySource` requires all three actual
source voters to retain the same owed row and settled APPLIED statement outcome.
It checks the actual native QUERY entry, parameters, entry ID, log index/term,
commit/applied frontiers, event source partition/replica and command HLC, plus
the persisted SERVICES row. A and B exist before subscribing and have increasing
positions in the same source ledger.

`registrationInsert` uses `MessageGroupServiceRowOwner.buildRegistrationRow`
for canonical STOPPED row bytes and the real SQL/CDC path for authorization and
debt. The comment correctly limits this to ordinary mutation/delivery evidence:
it is not replica registration/activation authority or an original opening
grant. No synthetic INSERT success, private direct-port QUERY fallback, manually
inserted debt, or hand-built native receipt appears.

The corrected `recordOf` requires a nonempty owner identity. Partition callers
explicitly pass `partitionId`; message-group calls use `groupId`. This avoids
the earlier fixture mistake of querying a partition durable record with an
undefined message-group identity.

## Real RF5 setup, retention and fault placement

All five G replicas are real `MessageGroupService` instances, normally opened
and registered. Setup ticks the actual L operation port and requires all five
statuses to name L, share the same five-voter configuration and have an applied
frontier. No role/readiness/participation result is replaced. The RF1 source MG
is a separate actual group, preventing target exclusion from confusing source
and recipient semantics.

F1/F2 normal reopen captures their exact native record, peer reservations,
port and handler; retires the exact handler; closes the old SQLite connection;
then opens the same path/inode. It asserts the unchanged retained record,
reservations, peer identity and configuration, plus new port/handler identities.
Bootstrap hints are empty after reopen. These are ordinary retained-native
reopens, not original-seed reconstruction or full lifecycle activation proof.

The F1 fault captures its actual peer ID and checks it against the durable
reservation. `pump` holds only real G raft-rs envelopes whose native sender
**or** recipient is that exact peer. Application traffic remains on the actual
router and registered handlers. Real campaign output exercises outgoing
isolation; final assertions require observed held traffic in both directions.
F1 is allowed to be a candidate/pre-candidate and is required only to remain
nonleader without a native leader route. The test never relabels it FOLLOWER.

F2 must actually be FOLLOWER and name L while its leader-address observation is
UNAVAILABLE. The whole L cache row is absent, so neither explicit address nor
`node_id` reconstruction can resolve it; hints are empty. L/H1/H2 remain real
healthy quorum members and incoming native traffic to F2 remains enabled.
The same post-reopen F2 operation port, lifecycle incarnation, configuration and
FOLLOWER observation are checked across B and every recorded application ingress.

## Real relay, causal B and native/ACK cuts

The complete hosted selector inventory contains all six MG services, with S
selected by the actual operational selection/readiness owner. Both real topology
services are initialized/started, including tree recomputation and its real
cache-change listener. This addresses the independently established #986
uninitialized-propagation fixture defect without a readiness override.

The sole captured target is G through F1. A is an owner-built STOPPED row for S,
so it does not supply L's missing location. The actual router and handler
observations require topology depth 0 at F1 and a genuine depth-1 relay at F2;
the test does not insert either relay value. Before B dispatch, the target cache
has A but no native G occurrence, S has a real native occurrence, and all source
debt remains owed with no CDC_DELIVERED entry. The actual topology aggregate
must be canonical provisional before the same source scan can reach held B.
This is the contract's permitted mixed native/provisional coverage, not an
all-groups-provisional strengthening.

B is a real later SERVICES insert for L. It supplies the exact configured
leader's location while remaining STOPPED. Source owners justify the distinction:
`message-group-service-peer-resolution.js:135-157` resolves location without an
ACTIVE requirement, whereas `cdc-group-propagation-routing.js` filters safe
targets by ACTIVE status. The test observes the real cache-triggered peer
reconciliation, L's newly RESOLVED address on the same F2 port, no L row in F1,
and unchanged source target selection. It does not patch a peer resolver or
native configuration to cause the transition.

Fresh A redrive then requires the actual F2-to-L depth-2 request and canonical
committed answers. `assertNativeReceipt` reads the durable L record captured at
the actual result time, resolves the receipt's index/term, checks commit/applied
frontiers, and compares the complete retained event to source debt. Source A
still remains owed at the first terminal native answer. Final source completion
requires actual CDC_DELIVERED application on all source replicas, with matching
delivered native positions/terms; both A and B must have actual L receipts.

The old source at `21cfd917` drops occurrence metadata and returns ordinary
success/local-ingress answers. Its expected initial red is the named canonical
result assertion after actual handler return, not a proof that F3 alone failed.
The later F3 assertion is designed to reject an always-local-after-B result by
its concrete provisional answer and missing native receipt. Such a mutation
has not been run. An RF5/setup/readiness/no-return failure must remain classified
as unengaged setup/owner-path evidence, not as the intended semantic red.

## Cleanup and remaining proof limits

Cleanup stops subscription/topology admission, releases the test-owned B gate,
pumps actual work, attempts every exact MG handler/port/database close, awaits
tracked application settlements, and closes router/release/source owners. It
aggregates cleanup failures and retains directories when cleanup does not
settle. Held F1 native packets are never flushed into the reopened successor;
their custody is discarded only after owner closure. The fixture does not
silently reset/remove a failed native resource. Runtime still must demonstrate
these cleanup paths; static review cannot prove a pending owner always settles.

This is one critical target and one real responsible subscriber. It does not
prove a dispatch window overflow, multi-budget provisional accumulation across
several subscribers, expiry fencing, queue-pressure boundedness, lost answers,
restart composition, wire-size liveness, historical cross-member classification,
R1/R2 activation/transfer custody, two-start acceptance, Quest closure or merge.
Those gates remain separate. After R1 is corrected, the bounded next step is
source-only delta approval and exact-source test-only lab preservation; neither
that approval nor a red baseline certifies the implementation.

## R1 bounded correction recheck

Appended 2026-10-23. The preceding review is preserved; its SHA256 was
`6bb343b809209c4d97870f7364b07671a050e0b8d3cf50ecdf52bcc8c07017eb`.

**Verdict: APPROVE these exact two S2 test files for source-only test-candidate
preservation and measured baseline work.** The sole R1 finding is resolved.

| File | Rechecked SHA256 |
| --- | --- |
| `test/message-group/message-group-native-provisional-route.test.js` | `128995ce2c8002b1266ba4eaad14c6f66c1919f43db89c274eba9465887543ab` |
| `test/message-group/message-group-native-provisional-route-fixture.js` | `0ad1ba30c274779fddbbf57a199e2a8d4f4ce377f2fc16b62743454d54f71673` |

The observer now accepts `(service, event, deliveryContext)` and passes that
identical third argument to the real bridge. It does not wrap, replace, store,
manufacture or serialize it. Reversing exactly those two textual substitutions
reproduces the original test hash
`feb4801a3b8d47d70ee588daf69fdc355e2662f6ab0b1e49253bccb50c94e5b2`;
therefore all other fixture behavior and acceptance assertions are unchanged.
The support fixture is byte-for-byte unchanged. `f.subscriber` remains the
direct production factory result, the selection observer passes its options
through, and the router observer preserves its actual `...options` arguments.

This recheck performed no runtime execution or source/test edit. The author's
reported syntax/ESLint checks are not native proof. All preceding setup-versus-
semantic-red distinctions, cleanup requirements and explicit S2/W7/activation/
release limitations remain binding. Root still owns registration, metadata,
exact-source preservation and locked-lab submission.
