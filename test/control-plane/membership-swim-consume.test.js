// Increment 4: asymmetric SWIM consumption in the projection. A SWIM `alive` verdict
// protects a node from a false readiness/liveness-grace trim; SWIM `dead`/`suspect` and
// the consume-flag-off path change nothing; status/member-state trims still apply.
import {test} from '../../src/test-helpers/tap.js';
import {
  isCanonicallyActiveNode,
  resolveProjectedActiveNodeIds,
} from '../../src/control-plane/active-node-projection.js';
import {isMembershipSwimConsumeEnabled} from '../../src/control-plane/membership-swim-detector.js';

// A healthy node (status active) whose connection looks not-ready locally and which
// has no fresh lease/heartbeat -> the readiness/liveness gate would trim it.
const TRIMMABLE_HEALTHY_NODE = Object.freeze({
  node_id: 'peer-B',
  status: 'active',
  connection_state: 'connecting',
});

test('consume flag is default-on (opt-out via =false)', (t) => {
  t.equal(isMembershipSwimConsumeEnabled({}), true, 'absent => on (default-on)');
  t.equal(
    isMembershipSwimConsumeEnabled({LAGRANGE_MEMBERSHIP_SWIM_CONSUME: 'false'}),
    false,
    'explicit false => off',
  );
  t.equal(
    isMembershipSwimConsumeEnabled({LAGRANGE_MEMBERSHIP_SWIM_CONSUME: 'true'}),
    true,
  );
  t.end();
});

test('without consumption a grace-trimmable healthy node is excluded', (t) => {
  t.equal(
    isCanonicallyActiveNode(TRIMMABLE_HEALTHY_NODE, {}),
    false,
    'baseline: trimmed by the readiness/liveness gate',
  );
  t.end();
});

test('SWIM alive + consume protects the node from the false trim', (t) => {
  t.equal(
    isCanonicallyActiveNode(TRIMMABLE_HEALTHY_NODE, {
      membershipSwimConsumeEnabled: true,
      swimVerdictByNodeId: {'peer-B': 'alive'},
    }),
    true,
    'SWIM alive retains the node',
  );
  t.end();
});

test('asymmetric: SWIM dead/suspect does NOT protect (no false retain)', (t) => {
  t.equal(
    isCanonicallyActiveNode(TRIMMABLE_HEALTHY_NODE, {
      membershipSwimConsumeEnabled: true,
      swimVerdictByNodeId: {'peer-B': 'dead'},
    }),
    false,
    'dead verdict gives no protection',
  );
  t.equal(
    isCanonicallyActiveNode(TRIMMABLE_HEALTHY_NODE, {
      membershipSwimConsumeEnabled: true,
      swimVerdictByNodeId: {'peer-B': 'suspect'},
    }),
    false,
    'suspect verdict gives no protection',
  );
  t.end();
});

test('protection requires the consume flag (verdict alone does nothing)', (t) => {
  t.equal(
    isCanonicallyActiveNode(TRIMMABLE_HEALTHY_NODE, {
      swimVerdictByNodeId: {'peer-B': 'alive'},
    }),
    false,
    'verdict present but consume flag off => unchanged',
  );
  t.end();
});

test('protection does NOT override status: a draining node stays trimmed', (t) => {
  const draining = {node_id: 'peer-B', status: 'draining', connection_state: 'connecting'};
  t.equal(
    isCanonicallyActiveNode(draining, {
      membershipSwimConsumeEnabled: true,
      swimVerdictByNodeId: {'peer-B': 'alive'},
    }),
    false,
    'a non-active (draining) node is not protected by a SWIM alive verdict',
  );
  t.end();
});

test('SWIM alive bypasses the transport-evidence exclusion (the rejoiner case)', (t) => {
  // Canonical WS endpoints exist for A, so the transport-evidence block is active; the
  // rejoiner has no endpoint/service/transport evidence for peer-B (it cannot reach it).
  const opts = {
    nodeEndpointRows: [
      {node_id: 'A', transport_type: 'websocket', status: 'active', address: 'ws://127.0.0.1:8080'},
    ],
    serviceRows: [],
  };
  t.equal(
    isCanonicallyActiveNode(TRIMMABLE_HEALTHY_NODE, opts),
    false,
    'trimmed without consumption (no local transport evidence for the peer)',
  );
  t.equal(
    isCanonicallyActiveNode(TRIMMABLE_HEALTHY_NODE, {
      ...opts,
      membershipSwimConsumeEnabled: true,
      swimVerdictByNodeId: {'peer-B': 'alive'},
    }),
    true,
    'SWIM alive (peer-attested) supersedes the local transport-evidence check',
  );
  t.end();
});

test('projection retains a SWIM-alive node it would otherwise trim (and only it)', (t) => {
  const nodeRows = [
    {node_id: 'A', status: 'active', connection_state: 'ready'},
    {node_id: 'peer-B', status: 'active', connection_state: 'connecting'},
    {node_id: 'peer-C', status: 'active', connection_state: 'connecting'},
  ];
  const baseOptions = {nodeRows, localNodeId: 'A', localNodeResponsive: true};
  const without = resolveProjectedActiveNodeIds(baseOptions);
  t.equal(without.includes('peer-B'), false, 'B trimmed without consumption');

  const withConsume = resolveProjectedActiveNodeIds({
    ...baseOptions,
    membershipSwimConsumeEnabled: true,
    swimVerdictByNodeId: {'peer-B': 'alive'}, // C deliberately NOT protected
  });
  t.equal(withConsume.includes('peer-B'), true, 'B retained via SWIM alive');
  t.equal(withConsume.includes('peer-C'), false, 'C (no alive verdict) still trimmed');
  t.end();
});
