#!/usr/bin/env python3
"""Register the actual proof responsibility; no budget or acceptance change."""
import json,sys
from pathlib import Path
root=Path(sys.argv[1]).resolve()
phase=sys.argv[2]
test='test/integration/message-group-learner-runtime-authorization.integration.test.js'
if phase=='tests':
    p=root/'scripts/checks/test-subsystem-classification-constants.js';s=p.read_text()
    anchor='export const SUBSYSTEM_OVERRIDES = Object.freeze({\n'
    assert s.count(anchor)==1 and test not in s
    s=s.replace(anchor,anchor+"""  'test/integration/message-group-learner-runtime-authorization.integration.test.js': {
    subsystem: SUBSYSTEM_STORAGE_RAFT,
    reason: 'proves durable operation authorization before native Raft membership; repository storage and inbox transport supply the cross-owner fixture',
  },
""")
    p.write_text(s)
else:
    assert phase=='source'
    p=root/'test/shards/impact-contracts.json';s=json.loads(p.read_text())
    key='message-group-learner-authorization-consumption'
    assert key not in s['contracts'] and key not in s['coupledPairs']
    repository=['src/rebalancer/replica-operation-repository.js',
      'src/rebalancer/replica-operation-message-group-learner-observation.js',
      'src/rebalancer/replica-operation-message-group-membership-owner-claim.js']
    runtime=['src/raft/raft-rs-group-membership-admission.js',
      'src/raft/raft-operation-port-constants.js','src/raft/raft-rs-membership-transition-runtime.js']
    description='The existing repository observes exact issued ADD_LEARNER intent and current host-bound holder/recipient facts; the group-admission owner consumes that observation before reserving the permanent peer identity and invoking the semantic port. The native runtime alone decides term/configuration/lifecycle/generation freshness and proposes. This does not authenticate transport, settle the operation from a proposal reply, or grant CREATE.'
    s['contracts'][key]={'description':description,'owners':repository+runtime,'tests':[test]}
    s['coupledPairs'][key]={'description':description,'endpoints':[
      {'id':'durable-operation-observation','owners':repository},
      {'id':'native-membership-consumption','owners':runtime}],
      'contract':key,'witnessTests':[test]}
    p.write_text(json.dumps(s,indent=2)+'\n')
    p=root/'solve/quests/message-group-fresh-identity-membership/runtime-learner-consumption.md'
    assert not p.exists()
    p.write_text('''# Runtime consumption of the initial learner intent

Bounded subordinate increment under the existing FreshMG Quest. Not source
approval, network activation, CREATE authorization or complete replacement.

The existing ReplicaOperationRepository observes the exact encoded operation,
identity, issued ADD_LEARNER permit, retained lane/obligation and current
execution holder. The receiving repository is bound to its node and issued
boot. Sender and recipient identities are host-composition inputs; they must
come from the actual dispatcher, never from copied payload fields. Canonical
node reads verify both boots. Normal terminal failure after intent issuance
retains that same action; successful/mixed terminal states are not permission
to create a new learner. No observation writes operation state.

The existing group-admission owner consumes this observation through a bound
repository resolver, checks its actual port/group/replica pairing, reserves
only the authorized permanent target identity, then invokes the existing
semantic membership port. Native same-turn checks retain authority over
term, configuration generation, peer address, lifecycle and runtime generation.
No fresh native observation is substituted into an old permit to make it pass.
The resulting configuration entry carries the exact committed operation and
target identity through Ready/apply on the surviving real replicas.

The actual durable intent commit remains authorizeMessageGroupLearner's
operation-row conditional UPDATE, not this read, the local identity reservation
or the proposal reply. The actual configuration commit/apply is the native
Raft owner. Neither effect alone releases the operation obligation or grants
physical CREATE. Accepted committed-receipt settlement and target join admission
remain subsequent work. A refused native request leaves its original intent
owed; unavailable authority remains typed and retryable through the existing
driver, not a new timer or retry ledger here.

Claims about current holder/boot refer to the authoritative observations made
at this boundary, not a cross-Raft-group transaction. An already-issued exact
action is not cancelled by ordinary settlement or lease expiry. Proving exclusion
of all late conflicting actions requires the complete stage/receipt driver and
transport binding; it is not inferred from these bounded read-and-propose tests.
A stale destination boot or native fence is refused; this increment does not
invent a new permit or retarget the original action after recipient restart.

The resolver and port are trusted host dependencies. A callback is not an
unforgeable public credential. No MessageRouter message type or handler is
registered by this increment. The future production composition must supply
the existing repository resolver and actual endpoint/transport bindings; arbitrary
caller-created callbacks, peer claims or status snapshots are not that composition.

The integration witness uses canonical file-backed operation SQL and three
actual raft-rs ports, with the existing in-process inbox transport. It proves
valid intent reaches native proposed and applied learner state and replicated
identity context, while mismatched/absent intent and stale bindings do not
propose. Source-generation facts and node bindings are supplied fixtures;
there is no real target worker, physical state transfer, distributed SQL,
network authentication, full startup, power-loss or multi-host acceptance claim.

The impact-contracts pair message-group-learner-authorization-consumption owns
this interaction and names its executable witness. Broader raw-port capability
confinement and planner/handler activation remain their existing work items.
''')
