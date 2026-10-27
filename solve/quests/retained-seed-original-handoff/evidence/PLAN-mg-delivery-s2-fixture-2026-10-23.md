---
audience: development
documentClass: evidence
---

# S2/W7 source-backed fixture proposal

Author: `subagent:/root/retained_effects_tests`, 2026-10-23.
Read-only source inspection against `c11c4ca266e78c815c9cd41954e351d20b182a41`.
Authority: approved MG contract SHA256
`474182126c3c985feceadb9a1b72d7de9975e1b4c3280af52be884c6c095f383`.
This is a proposed setup, not implemented fixtures, measured formation or a
new contract. No runtime was launched and no pinned repository file changed.

## Result

A genuine two-hop strict-CDC relay can supply the missing convergence
prerequisite without a readiness snapshot, join flag or caller-created relay
depth. The smallest simple **all-voter** construction justified here is one
RF5 target group: three healthy voters form a native quorum while two other
replicas exercise the first-hop and addressed-recipient roles. This is not a
claim that five is minimal across learner/reconfiguration architectures.

The old premise is insufficient. A direct strict event has relayDepth 0, and
missing leader address alone reaches DEFER before addressed fallback:
`src/message-group/message-group-service-cdc-propagation-runtime-methods.js:26-66`.
A stale cache leader alone is also insufficient: the forwarding owner prefers
an eligible live leader route at
`src/message-group/message-group-forwarding-owner-routing-methods.js:332-337`.

## Actual owners and reuse

- Ordinary source: `formAdmittedGroup` and `attachPartitionReleaseOwners` from
  `test/partition/partition-admitted-group-fixture.js` and
  `test/partition/partition-release-fixture.js`; use the actual SERVICES schema,
  real CUT_OVER answer and sessionless `PartitionService.executeQuery`.
  No original opening grant or direct-port fallback can satisfy this admission.
- Recipient: generalize the real `MessageGroupService`, `MessageRouter`,
  `registerMessageGroupTransportHandler`, owned native-envelope queue/pump and
  per-replica durable-file pattern in
  `test/message-group/message-group-native-custody-fixture.js`. Do not reuse its
  RF3/all-replicas-know-the-leader setup assertion for the deliberately partial
  post-reopen observation described below.
- Real initial/fresh native operation ports, `raft.campaign`/`raft.tick`,
  `raft.readStatus`, `readCommittedMembership` and retained native records own
  leadership/configuration evidence. Never replace their returned state.
- Existing shared partition subscriber -> seed/join bridge ->
  `CDCGroupPropagationService` -> registered MessageRouter handler ->
  `receiveMessage` -> `handleLatencyCdcPropagationMessage` owns the application
  path. The single-router schedule proves that path/native custody, not physical
  network latency or WebSocket frame behavior.

## Initial native and routing population

Use distinct group/replica identities. S is a separate, actual source MG;
G is the target group with voters L, H1, H2, F1 and F2. S must not be G because
`buildSafeTargets` excludes the source group. The source routing projection
must contain G as an ACTIVE, explicitly addressed group through F1. Record the
complete captured group set; never drop a group to make the witness progress.
The target resolver consumes `service_id`, `group_id`, `service_type`, `status`,
`address`, `node_id` and relevant cached role/leader rows; see
`src/topology/cdc-group-propagation-routing.js:23-35,98-131`.

One faithful construction is to form all five actual voters first, retain
their databases, then shut down and normally reopen F1/F2 with independently
stale/partial cache inputs and bootstrap hints. This permits the first
formation assertion to remain strong. Native leader identity is volatile and
must be observed after reopening; it must never be assigned. Retire each old
handler and complete old resource cleanup before replacing its service at the
same address. The three other actual voters continue holding quorum.

| Replica | Required actual observation/input before A |
| --- | --- |
| L, H1, H2 | L is actual native leader; these three exchange real native messages and maintain the RF5 quorum. All retained configurations name the same five voters. |
| F1, first addressed hop | Actual port has no native leader identity/route. Hold incoming native envelopes to this replica before reopening through the existing transport schedule, so no leader announcement has been delivered. Its independent cache has a stale, eligible same-group F2 leader candidate with a real registered address. An eligible native leader must not exist and then be overridden by that cache hint. |
| F2, relayed recipient | Native leader identity is L and role is FOLLOWER, learned through actual L heartbeats/APPENDs. L's location is absent from both its cache **address and node_id** and from bootstrap hints, so its owned leader/peer address observation is UNAVAILABLE. Keep actual incoming leader traffic running so this addressed replica remains FOLLOWER. |

F1 starts as a follower after reopen; the proof requires it to remain a
nonleader with no native leader route. It cannot claim to remain FOLLOWER if
its real timer enters a candidate state. F2 is the specific recipient whose
FOLLOWER role must remain unchanged across the F3 transition. A learner-based
smaller population would require actual admission/retention/reopening proof;
none is substituted here.

Omitting only address is ineffective: `resolvePeerAddressFromCache` rebuilds an
address from node_id (`message-group-service-peer-resolution.js:135-157`), and
native consensus explicitly permits bootstrap hints
(`message-group-consensus-port.js:75-84`). A resolver failure is recorded as a
peer delivery failure, not a host/Ready failure
(`raft-rs-peer-delivery.js:88-117`); status represents the missing address as
UNAVAILABLE (`raft-rs-status-observation.js:24-65`). Actual setup must still
verify that these expected observations hold.

## Genuine relay and B's causal effect

1. Commit A and B, in that order, through the same legitimately released
   SERVICES partition. Read their actual retained outcomes and CDC obligations,
   exact native positions and event JSON before subscription. Their entry IDs,
   event keys, timestamps and payloads come from that ledger, never cache rows.
   A must not change the selected target location (for example a canonical
   STOPPED registration row for the distinct source MG's own replica).
2. The real topology owner sends A to F1 without relayDepth; this is depth 0.
   F1's actual owner selects its eligible stale same-group F2 target and returns
   FORWARD. The real handler calls `forwardCDCEventToLeader` with depth + 1
   (`cdc-propagation-runtime-methods.js:98-105`). Capture the actual delivered
   envelope: F2 must receive depth 1 without the test inserting that field.
3. F2's genuine relayed context enables canonical convergence ingress
   (`message-group-forwarding-owner-routing-methods.js:398-402,429-448`). Before
   B there is no usable native route. After the approved implementation, this
   yields an exact provisional outcome; current source only establishes the
   existing local-ingress branch, not a canonical provisional success.
4. Let only full source/target/subscriber weak coverage release A's scan cursor.
   A remains owed and no source ACK is proposed. Then the existing scan reaches
   B. Use a canonical STOPPED registration row for L, supplying service_id,
   group_id, service_type, node_id and address. `MessageGroupServiceRowOwner`
   builds the row at `message-group-service-row-owner.js:339-400`; the actual
   registration operation requires STOPPED at `:425-444`.
5. F1 forwards B without applying it locally. F2 applies B through the actual
   CDC/cache path, which triggers `handleSystemTableCacheChange` and scheduled
   peer reconciliation (`message-group-service-peer-resolution.js:188-220`).
   The configured leader's address resolver now reads the new location. This
   is a route update for an already configured identity, not new membership.
   A STOPPED row supplies that location without becoming a topology candidate:
   native peer address lookup does not require ACTIVE, whereas safe target
   enumeration does. Check the captured group/target population stays intact.
6. A fresh source invocation redrives unchanged A. F1 retains its same stale
   projection and performs the genuine first relay. F2 is still FOLLOWER but
   now observes its actual native L route. The approved terminal native request
   consumes the remaining hop, depth 2, and L proposes/applies it. No depth reset
   or extra hop is allowed. Require actual native afterCommit receipts, then
   the source CDC_DELIVERED apply. B also remains an obligation until its own
   later complete native delivery/ACK; local B hydration cannot discharge B.

Canonical builder bytes are not registration authorization. For a bounded
source/delivery fixture, owner-built row bytes plus the real released
executeQuery path prove the ordinary mutation and its debt. They do not prove
full replica registration/activation, ACTIVE publication or original opening.
Invoking actual `registerReplica` instead requires a genuine gateway/CDC write
composition. A bare `ControlPlaneSystemTableGateway` without CDC refuses with
CDC_REQUIRED unless its existing phase-scoped fallback is authorized
(`control-plane-system-table-gateway-mutation-submission.js:242-263`);
do not manufacture that scope or a writer success answer.

## W7 expansion and setup gates

Prove the one-critical-target relay premise before expanding to several actual
subscribers and more target groups than one dispatch window. Other real native
leaves may provide NATIVE_COMMITTED, while the critical G leaf provides
PROVISIONAL_COVERAGE: the approved combination rule explicitly accepts either
tag for weak coverage and requires at least one provisional tag for aggregate
PROVISIONAL (contract lines1075-1084). If the witness's phrase "provisional
coverage for every binding" is intended to require a provisional leaf in
**every distinct target group**, one SERVICES row B cannot repair several
different leader-service identities. That stronger population requires an
explicit owner-produced metadata sequence; never share an invented identity
across groups or silently weaken the population.

Setup must independently establish:

- Real SERVICES CUT_OVER and executeQuery acceptance; retained row, outcome,
  debt and native position/HLC correspondence. A setup refusal is not delivery
  failure evidence.
- Actual RF5 configuration/quorum and the precise F1/F2 observations above,
  including all cache/node_id/hint resolution alternatives and real connected
  target addresses. No role, readiness or participation override is allowed.
- F1's real FORWARD result at depth0, F2's received depth1 and actual local
  convergence decision. Missing source/target/group selection is a setup defect.
- B's exact cache row is absent beforehand and applied afterward; the real
  reconciliation wake occurred; F2's port/lifetime, configuration and FOLLOWER
  role remain the same while its leader address changes from unavailable to L.
- Same captured source/target/subscriber identity through the bounded schedule;
  exact late-answer fencing and all unresolved local cleanup charges remain
  owned before the next invocation starts.
- Under the old always-local addressed predicate, the same post-B schedule
  returns a retaining provisional result with no required native A occurrence
  or source ACK. Assert that semantic result/frontier difference, not only an
  outer timeout. The weak-accumulation mutation separately prevents B traversal.

A smaller direct-ingress readiness alternative is not established here. Real
`LifecycleController` evaluation is an owner, but hand-setting its phase or
dependencies would not prove actual startup readiness. Production
`bootstrap-readiness-snapshot-evaluator.js:156-229` supplies startup, SQL,
leader metadata, runtime wiring, transport and recovery observations; the
existing strict-convergence tests use controlled ports/snapshots. They cannot
supply the missing native prerequisite for this composite.

Each source group, recipient group and router owns independent cleanup. Stop
topology/source retry admission, await pending callback/transport/native work,
retire exact handlers and close databases before deleting directories. A failed
close retains its directory and identity; an old cleanup cannot clear a reopened
successor. No uncontrolled processes, physical multi-host claim or activation
permission is introduced by this proposal.

## Independent-review correction: native isolation and mixed coverage

Appended 2026-10-23. The original 187-line proposal remains unchanged; its
SHA256 is `2e004b641fec68e7f25e551151cda833e67719e26fd50a67f031893c32fa6ba1`.
This correction supersedes the incoming-only F1 isolation wording above and
resolves the previously explicit mixed-coverage interpretation question. It
adds no implementation or runtime evidence.

**Isolate both directions of G/F1 native traffic.** Capture F1's actual native
peer identity and group binding from the formed group's owned observation and
retained identity record, then verify that exact identity after its normal
reopen. The transport schedule holds every real raft-rs envelope belonging to
G whose native sender **or** destination is that F1 peer. Match the real
groupId and exact native from/to identities, without deriving a peer number
from an array position, synthesizing an identity or changing envelope bytes.
Keep this two-direction cut engaged before reopening F1 and throughout the
pre-B and post-B witness. Record each held envelope and its direction.

The cut includes votes, pre-votes and their responses, not only APPEND or
heartbeat messages. Incoming-only isolation permits F1's scheduled election
traffic to reach the other voters and disrupt their actual quorum/term; that
would invalidate the intended source-bound fixture. Continue delivering real
native traffic among L/H1/H2 and the allowed F2 paths. Keep application CDC
traffic to and from F1 open through the real registered handlers and router:
only `isRaftRsTransportEnvelope` traffic with the exact G/F1 binding belongs to
this fault schedule. The test must observe the real depth0 -> depth1 relay,
not set a relay depth, readiness result or role to compensate for the cut.

**Keep the two role claims separate.** F1 is required to be a native nonleader
with no known native leader route. Its real clock may make it a candidate or
pre-candidate while isolated; that is admissible and must be recorded rather
than normalized to FOLLOWER. It must never acquire native leadership or a
leader route that the stale cache then overrides. F2 is the addressed F3
recipient and must remain an actual FOLLOWER across B, with the same captured
post-reopen port/lifetime and configuration. Actual leader traffic, rather
than a frozen role or disabled timer, must sustain that F2 observation.

**Mixed native/provisional leaves are the approved requirement.** The
independent review confirms that the contract's existing combination rule
(lines1075-1084) permits NATIVE_COMMITTED and PROVISIONAL_COVERAGE leaves in
the same complete weak-coverage vector. There is no additional requirement
that every distinct target group return provisional. One critical target G
can therefore depend on B while the other required groups supply their real
native receipts. Every captured source/target/subscriber binding still needs
its own exact validated evidence; an unvisited leaf remains UNCOVERED.

This resolution preserves the complete W7 schedule: more targets than one
dispatch window, several actual responsible subscribers, enough individually
live deliveries to require multiple unchanged invocation budgets, at least
one real provisional leaf, expired callers UNKNOWN, no early source ACK,
and the later B -> fresh native A -> source ACK transition. It does not permit
omitting a captured group, shortening the required multi-budget schedule or
replacing a recipient result with a synthesized receipt.

Cleanup retains independent custody of the held native envelopes and of all
actual service/router resources. Do not flush old held native traffic into a
reopened successor or release its directory while old callbacks remain open.
The ordinary reopen and STOPPED-row/native-route premises still require their
own source review and measured setup gates; this append does not claim them
proved.
