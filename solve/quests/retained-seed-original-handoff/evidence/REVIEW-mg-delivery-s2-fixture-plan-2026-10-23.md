# Independent review: S2/W7 fixture premise

Reviewer: `subagent:/root/mg_delivery_design`, 2026-10-23.

**Verdict: APPROVE the corrected fixture plan for test-only authoring.** This is
source-bound premise approval, not approval of implemented fixture bytes,
measured RF5 setup, an observed semantic red, a production repair or full W7.

The reviewed input is the frozen 248-line
`/tmp/mg-delivery-s2-fixture-plan-2026-10-23.md`, SHA256
`8f23ec9bb697eb686ffb2d7390b857e8360ee7ad37d635d2f89732b8334e0b86`.
Its original 187-line prefix retains SHA256
`2e004b641fec68e7f25e551151cda833e67719e26fd50a67f031893c32fa6ba1`.
The appended correction governs where the earlier incoming-only F1 wording
conflicts with it. Root owns copying that append to the preserved PLAN; the
repository's frontmatter-bearing copy is not claimed to have the temporary
file's hash.

The governing approved contract remains
`CONTRACT-mg-source-occurrence-delivery-2026-10-23.md`, SHA256
`474182126c3c985feceadb9a1b72d7de9975e1b4c3280af52be884c6c095f383`.
Source inspection uses the unchanged production tree at
`c11c4ca266e78c815c9cd41954e351d20b182a41`. No source, test, metadata, timer,
Quest log or runtime was changed or executed by this review.

## Resolved findings

**F1: native isolation must cover both directions.** The original incoming-only
cut does not itself prevent F1's scheduled election output reaching the healthy
voters. A normal MG port starts scheduling unless the existing scheduling
conditions defer it (`raft-rs-operation-port.js:350-384,515-518`), and the test
must not add an election override to manufacture the desired role. The
corrected plan holds every actual G envelope whose native sender or recipient
is the captured F1 peer, including vote/pre-vote traffic. The existing native
schedule already separates native envelopes from application traffic and can
express sender/destination cuts (`message-group-native-custody-fixture.js:36-55,83-92`).
The new cut must remain group-scoped: different groups' equal numeric peer IDs
must not be cut accidentally. F1 can be a real candidate or pre-candidate;
required evidence is nonleader and no usable native leader identity/route.
The actual F1 -> F2 application relay stays open. Held old envelopes must not
later be flushed into reopened successors.

**F2-P: mixed leaves satisfy complete weak coverage.** Contract lines
1075-1084 explicitly allow each captured leaf to be NATIVE_COMMITTED or
PROVISIONAL_COVERAGE. Complete coverage containing at least one provisional
leaf yields an aggregate provisional result. There is no requirement that
every distinct target group return provisional. Thus one critical G can need
B while other groups supply actual native receipts. Every source, target and
responsible-subscriber binding still needs its own complete validated vector;
unvisited, unknown, wrong-group and expired answers supply no coverage. At
provisional scan release all optimization state, including accumulated native
receipts, is discarded (contract lines1090-1107). A's later native pass must
collect fresh complete coverage before source ACK eligibility.

## Native formation, reopen and role premises

The proposed ordinary reopen is reachable through existing owners. MG builds
the normal operation-port request over its durable file and a valid founder
stamp (`message-group-consensus-port.js:90-131,148-170`). The runtime chooses
the retained record when present, restores the recorded participation gate,
configuration, entries and progress, and passes that record to native creation
(`raft-rs-runtime-owner.js:274-288,416-461,486-535`). Neither a fabricated
original opening grant nor joining/election suppression is needed to reopen
these already formed voters. This is ordinary retained-native reopen; it is
not original allocation recovery or proof of replica activation authority.

The authored fixture must first observe all five actual voters with the same
configuration and an applied native frontier. Before shutdown it captures
F1/F2's exact group/replica/native-peer identities, retained record and
membership generation. It must reopen those same files, prove that native
configuration/progress was retained rather than reconstructed from empty
genesis, and observe new port identities. After reopening, leader identity and
role are fresh native observations. No assignment to `role`, `leaderId`,
`raft`, participation state or readiness can satisfy these gates.

F2 can learn L through incoming native traffic even while it cannot resolve
L's return address: peer address failures are recorded per peer and do not
poison Ready/application or force a role change
(`raft-rs-peer-delivery.js:88-117`). The native status names L while reporting
its address UNAVAILABLE (`raft-rs-status-observation.js:24-65`). L/H1/H2 are
three of five voters and must independently keep making native quorum
progress. Deliver actual L heartbeats/APPENDs frequently enough under the real
clock schedule to sustain F2's FOLLOWER role; a large clock jump followed by
late heartbeats is not evidence that it stayed follower. Check the role at
the operation boundaries and retain actual role/term events throughout the
transition. F1's isolation and the missing F2 return route must remain engaged
while those assertions are made.

The old handler must retire by exact identity through
`retireMessageGroupTransportHandler`, and old shutdown/port/database cleanup
must settle before replacement registration at the same address
(`bootstrap/shared/message-group-transport-handler.js:40-66`;
`message-group-consensus-port.js:211-240`). A generic unregister or same-address
overwrite is not evidence of that lifecycle boundary. The existing learner
snapshot test demonstrates normal retained-file reopening, but its older raw
handler removal is not a model for this fixture's stricter custody assertions.

## Relay and STOPPED metadata premises

F1's stale cache candidate is an explicit routing input, not evidence of
native leadership. It must contain a complete eligible F2 SERVICES row,
including its same group, ACTIVE state, explicit address and stale leader
projection. The actual connected-node predicate must accept the real route;
do not replace it. Native leader selection precedes the cache candidate
(`message-group-forwarding-owner-routing-methods.js:25-54,95-166,332-346`).
Therefore the no-native-route F1 observation is necessary, and the real depth0
decision must be FORWARD. The real handler adds the first hop
(`message-group-service-cdc-propagation-runtime-methods.js:26-105`). F2's
received depth1 then supplies the convergence prerequisite that the old direct
ingress premise lacked (`message-group-forwarding-owner-routing-methods.js:398-448`).

For F2, all existing L-location sources must be absent before B: cached address,
cached node_id and bootstrap hints. Passing all five membership identities
does not require passing five address hints; peer identities and location
hints have separate owners (`message-group-service-state.js:149-156`;
`raft-rs-operation-port.js:219-232`). Native resolution permits bootstrap hints,
and node_id reconstructs an address, so either surviving alternative would
invalidate the missing-route treatment
(`message-group-consensus-port.js:75-84`;
`message-group-service-peer-resolution.js:81-107,133-157`).

B's canonical STOPPED SERVICES row is sufficient to resolve the location of
already configured L. Native peer resolution accepts the valid address or
node_id without an ACTIVE test. A same-group MG cache change also schedules
the real reconciliation hop (`message-group-service-peer-resolution.js:188-220`).
Reconciliation does not remove absent cache peers, and configured membership
remains the native owner's fact (`message-group-service-raft-lifecycle.js:61-155`).
In contrast, topology's safe target enumeration requires ACTIVE plus explicit
address (`topology/cdc-group-propagation-routing.js:23-35,98-135`). B can therefore
repair F2 without displacing F1 as the selected target. Assert the exact
captured target population and address bindings before and after B, rather
than assuming the status alone guarantees that result.

Use `buildRegistrationRow` with STOPPED row bytes and a real admitted ordinary
SERVICES mutation as proposed. The row builder and `registerReplica` are
different proof boundaries (`message-group-service-row-owner.js:339-400,425-444`).
Actual source admission must pass the real release owner's CUT_OVER result and
the normal sessionless executeQuery path, then expose the retained row,
statement outcome, obligation and native position/HLC. A failed admission is
a setup failure, not a delivery red. This construction makes no claim that
the fixture executed full MG registration, handler-bound activation or ACTIVE
publication.

## Authoring and proof boundary

The current source supports these setup and routing branches; it does not yet
return the required canonical provisional/native outcomes throughout them.
The frozen S1/RF1/RF3 red candidate remains a separate earlier work unit. First
author and measure the one-critical-target setup with honest checkpoints,
then extend the same source-owned sequence to W7. The expansion must retain
more targets than a dispatch window, several actual responsible subscriber
wrappers, and enough live work for multiple unchanged invocation budgets.
Independent small provisional and large native tests cannot replace it.

Keep the actual source-service inventory explicit. The operational resolver
chooses a ready real leader before a relay (`bootstrap/shared/message-group-selection.js:266-365`).
Assert the selected source is S and the topology target is distinct G; do not
accidentally feed G's healthy leader as the source or filter a captured target
out to obtain progress. A's proposed source-MG STOPPED row must be checked not
to change that selected source lifetime or target set. Multiple actual
subscribers each retain their own callback/wrapper identity and coverage.

The paired post-B control must preserve the complete source operation and
fault schedule, changing only the old always-local addressed decision. Its
semantic discriminator is retained provisional delivery with no required
native A receipt/source ACK, not only a timeout. Separately removing weak
coverage aggregation must leave B unreachable behind A. Capture exact event
vectors, group bindings, response/deadline/cell identities and real native
frontiers on both sides of those cuts.

Historical source inspection supports keeping the two owner concerns distinct:
the current strict-convergence regression at
`message-group-service-strict-cdc-join-convergence.test.js:791-875` deliberately
protects addressed local ingress from stale competing-target loops, but uses
controlled role/transport inputs and is not the missing native witness. Native
peer-failure isolation and retained lifecycle semantics are present in
`1aea11baf6ba35a397547be54fa2621e674c1977`. That history is context for the fixture
constraints, not proof that this new RF5 composition has run successfully.

No unresolved source-premise blocker remains in the corrected plan. Implemented
test bytes still need independent review, appropriate metadata/registration,
an exact preserved checkpoint and measured lab setup/semantic results. This
approval grants no physical network, process-crash, original-cohort,
classification, protected activation, durable transfer, composed two-start or
release acceptance claim.
