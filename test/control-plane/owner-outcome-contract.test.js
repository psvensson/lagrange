import {test} from '../../src/test-helpers/tap.js';
import {
  CONTROL_PLANE_MUTATION_OUTCOME,
  CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE,
  buildControlPlaneMutationOwnerOutcomeEnvelope,
} from '../../src/control-plane/control-plane-system-table-gateway-shared.js';
import {
  PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION,
  PUBLICATION_ACTIVE_GATE_HANDOFF_REASON,
  PUBLICATION_ACTIVE_GATE_HANDOFF_STATE,
  buildPublicationActiveGateHandoffContract,
  buildPublicationActiveGateOwnerOutcomeEnvelope,
} from '../../src/control-plane/publication-active-gate-handoff-contract.js';
import {
  OWNER_OUTCOME_DEFAULT,
  OWNER_OUTCOME_STATE,
  buildOwnerOutcomeEnvelope,
  normalizeOwnerOutcomeEnvelope,
} from '../../src/control-plane/owner-outcome-contract.js';

const TEST_NODE_1 = 'owner-outcome-node-1';
const TEST_NODE_2 = 'owner-outcome-node-2';
const TEST_NODE_3 = 'owner-outcome-node-3';
const TEST_PUBLICATION_EPOCH = 11;
const TEST_GATEWAY_REVISION = 41;
const TEST_GATEWAY_RETRY_AFTER_MS = 125;

test('owner outcome envelope fails closed when required fields are missing',
  async (t) => {
    const envelope = buildOwnerOutcomeEnvelope({
      owner: 'runtime_contract_owner',
    });

    t.match(envelope, {
      owner: 'runtime_contract_owner',
      state: OWNER_OUTCOME_STATE.FAILED,
      outcome: OWNER_OUTCOME_DEFAULT.OUTCOME,
      nextAction: OWNER_OUTCOME_DEFAULT.NEXT_ACTION,
      terminal: true,
    });
    t.equal(
      envelope.reasonCodes.includes('missing_field:boundary'),
      true,
      'missing required fields should be explicit',
    );
    t.equal(
      envelope.reasonCodes.includes('missing_field:evidence'),
      true,
      'missing evidence should fail closed',
    );
  });

test('owner outcome envelope rejects null and undefined domain state values',
  async (t) => {
    const envelope = buildOwnerOutcomeEnvelope({
      owner: 'runtime_contract_owner',
      boundary: 'owner_outcome_envelope',
      state: null,
      outcome: undefined,
      reasonCodes: null,
      nextAction: undefined,
      freshness: null,
      revision: null,
      retryAfterMs: undefined,
      terminal: null,
      evidence: null,
    });

    t.match(envelope, {
      state: OWNER_OUTCOME_STATE.FAILED,
      outcome: OWNER_OUTCOME_DEFAULT.OUTCOME,
      terminal: true,
    });
    t.equal(
      envelope.reasonCodes.includes('invalid_field:state'),
      true,
      'null state should not be treated as a valid domain state',
    );
    t.equal(
      envelope.reasonCodes.includes('invalid_field:evidence'),
      true,
      'null evidence should not be accepted',
    );
  });

test('gateway mutation outcome preserves owner detail through envelope round trip',
  async (t) => {
    const envelope = buildControlPlaneMutationOwnerOutcomeEnvelope(
      {
        success: false,
        visibilityState:
          CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE.VISIBLE,
        reasonCodes: ['owner_not_ready'],
        retryAfterMs: TEST_GATEWAY_RETRY_AFTER_MS,
        revision: TEST_GATEWAY_REVISION,
      },
      CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY,
    );
    const normalized = normalizeOwnerOutcomeEnvelope(envelope);

    t.match(normalized, {
      owner: 'control_plane_system_table_gateway_owner',
      boundary: 'control_plane_system_table_gateway_mutation_contract',
      state: OWNER_OUTCOME_STATE.DEFERRED,
      outcome: CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY,
      reasonCodes: ['owner_not_ready'],
      nextAction: 'retry',
      revision: TEST_GATEWAY_REVISION,
      retryAfterMs: TEST_GATEWAY_RETRY_AFTER_MS,
      terminal: false,
    });
    t.match(normalized.evidence, {
      visibilityState:
        CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE.VISIBLE,
      success: false,
    });
  });

test('publication active-gate outcome preserves owner detail through envelope round trip',
  async (t) => {
    const contract = buildPublicationActiveGateHandoffContract({
      nodeRows: [
        {node_id: TEST_NODE_1},
        {node_id: TEST_NODE_2},
        {node_id: TEST_NODE_3},
      ],
      activeNodeViews: {
        effectiveActiveNodeIds: [TEST_NODE_1, TEST_NODE_2, TEST_NODE_3],
        publishedActiveNodeIds: [TEST_NODE_1],
      },
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publishedActiveNodeIds: [TEST_NODE_1],
        missingPublishedNodeIds: [TEST_NODE_2, TEST_NODE_3],
      },
    });
    const envelope = buildPublicationActiveGateOwnerOutcomeEnvelope({
      publicationActiveGateHandoff: contract,
    });
    const normalized = normalizeOwnerOutcomeEnvelope(envelope);

    t.match(contract, {
      state: PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.PENDING,
      reasonCode: PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.OWNER_RECONCILE_PENDING,
      nextAction:
        PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
          .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
    });
    t.match(normalized, {
      owner: 'topology_publication_owner',
      boundary: 'publication_convergence',
      state: OWNER_OUTCOME_STATE.PENDING,
      outcome: PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.PENDING,
      reasonCodes: [PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.OWNER_RECONCILE_PENDING],
      nextAction:
        PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
          .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
      revision: TEST_PUBLICATION_EPOCH,
      terminal: false,
    });
    t.same(
      normalized.evidence.pendingReconcileNodeIds,
      [TEST_NODE_2, TEST_NODE_3],
      'owner-specific pending reconcile evidence should survive envelope normalization',
    );
  });

test('publication active-gate owner outcome fails closed when handoff is unavailable',
  async (t) => {
    const envelope = buildPublicationActiveGateOwnerOutcomeEnvelope({});
    const normalized = normalizeOwnerOutcomeEnvelope(envelope);

    t.match(normalized, {
      owner: 'topology_publication_owner',
      boundary: 'publication_convergence',
      state: OWNER_OUTCOME_STATE.BLOCKED,
      outcome: PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.UNAVAILABLE,
      terminal: true,
    });
  });
