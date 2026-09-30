/**
 * Three production entrypoints, three process-global ownership domains.
 * A transparent proxy forwards B's real readiness, then disconnects the first
 * bootstrap POST: ContactSeedPhase (not startup preselection) must rotate to B.
 */
import {test} from '../../src/test-helpers/tap.js';
import {NODE_STATE} from '../../src/constants/index.js';
import {ENTRYPOINT_LOG_MSG} from '../../src/constants/entrypoint.js';
import {BOOTSTRAP_API_LOG_MSG, BOOTSTRAP_API_ROUTE} from '../../src/bootstrap/bootstrap-api-constants.js';
import {JOINING_SEED_CONTACT_OUTCOME} from '../../src/bootstrap/node-joining-constants.js';
import {SEED_CANDIDATE_SELECTION_STATE} from '../../src/entrypoint-runtime-join-decision.js';
import {FORMATION_CLEANUP_CEILING_MS, createProcessFormationScenario, messageIs, readNodeLog} from
  '../integration/helpers/process-formation-scenario.js';
import {matchesNodeContext} from '../integration/helpers/process-formation-log-context.js';

const SEED_NODE_ID = '550e8400-e29b-41d4-a716-446655440701';
const NODE_B_ID = '550e8400-e29b-41d4-a716-446655440702';
const NODE_C_ID = '550e8400-e29b-41d4-a716-446655440703';
// Acceptance remains 30 seconds including teardown. The runner ceiling leaves
// room to reap children after a typed deadline failure, never to pass late.

test('ContactSeedPhase rotates to a real non-seed node after first POST disconnect',
  {timeout: FORMATION_CLEANUP_CEILING_MS}, async (t) => {
    const scenario = await createProcessFormationScenario(t, import.meta.url);
    t.comment(`Process logs: ${scenario.dataRoot}`);
    const seed = await scenario.startNode(SEED_NODE_ID);
    const seedReady = await scenario.ready(seed);
    t.equal(seedReady.ready, true, 'seed bootstrap should succeed');
    const seedRows = await scenario.query(seed, 'SELECT node_id FROM nodes');
    t.ok(seedRows.some((row) => row.node_id === SEED_NODE_ID),
      'seed system table cache is visible through its production SQL owner');

    const nodeB = await scenario.startNode(NODE_B_ID, [scenario.address(seed)]);
    const joinedB = await scenario.joined(nodeB);
    t.equal(joinedB.nodeId, NODE_B_ID, 'node B joins through the seed');
    t.equal(joinedB.lifecycleState, NODE_STATE.READY, 'node B reaches READY');
    await scenario.ready(nodeB);

    const proxy = await scenario.createBootstrapContactProxy(scenario.address(nodeB));
    const candidates = [proxy.address, scenario.address(nodeB)];
    const nodeC = await scenario.startNode(NODE_C_ID, candidates);
    const joinedC = await scenario.joined(nodeC);
    const readyC = await scenario.ready(nodeC);
    t.equal(joinedC.nodeId, NODE_C_ID, 'node C joins through the non-seed candidate');
    t.same(proxy.ledger.slice(0, 2).map(({method, path, dropped}) => ({method, path, dropped})), [
      {method: 'GET', path: BOOTSTRAP_API_ROUTE.BOOTSTRAP_READY, dropped: false},
      {method: 'POST', path: BOOTSTRAP_API_ROUTE.BOOTSTRAP, dropped: true},
    ], 'real readiness precedes the first failed bootstrap contact');
    t.equal(proxy.ledger.filter((entry) => entry.dropped).length, 1,
      'exactly one bootstrap connection is faulted');

    const logsC = await readNodeLog(nodeC);
    const selection = logsC.find((entry) =>
      messageIs(entry, ENTRYPOINT_LOG_MSG.SEED_CANDIDATE_SELECTED),
    );
    t.match(selection, {
      selectionState: SEED_CANDIDATE_SELECTION_STATE.PROBED_REACHABLE,
      seedNodeAddress: proxy.address,
      seedNodeAddresses: candidates,
    }, 'startup preselection keeps proxy first; it does not absorb the rotation');
    t.match(readyC.seedContact, {
      candidateSet: candidates,
      attempt: 2,
      currentCandidate: scenario.address(nodeB),
      authoritySource: scenario.address(nodeB),
      lastOutcome: JOINING_SEED_CONTACT_OUTCOME.CONTACT_SUCCEEDED,
    }, 'ContactSeedPhase rotates from the disconnected first POST to real B');
    const contact = await scenario.findLog(nodeB, (entry) =>
      messageIs(entry, BOOTSTRAP_API_LOG_MSG.RECEIVED_BOOTSTRAP_REQUEST) &&
      matchesNodeContext(entry, {emitterNodeId: NODE_B_ID, subjectNodeId: NODE_C_ID}) &&
      entry.seedNodeId === NODE_B_ID,
    'bootstrap_rotation_not_observed');
    t.ok(contact, 'real B records C bootstrap contact and its own non-seed authority');
    t.ok(joinedC.messageGroupCount >= 1, 'C hosts at least one local message group');
    t.equal(joinedC.lifecycleState, NODE_STATE.READY, 'C lifecycle reaches READY');
    t.equal(readyC.startupRuntimeHandoff.joinLifecycleState, NODE_STATE.READY,
      'the production readiness tail preserves the READY handoff');
    t.equal(new Set(scenario.cluster.nodes.map((node) => node.process.pid)).size, 3,
      'all three nodes own distinct process-global state');
    await scenario.finish();
  });
