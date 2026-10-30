import {
  prepareLagrangeScenarioAPublicPgContext,
} from '../harness/oltp-scenario-a-lagrange-public-pg-context.js';
import {
  executePairedOltpTransactionWithRetry,
} from '../harness/oltp-paired-retry-owner.js';
import {
  OLTP_SCENARIO_A_DURABILITY_PROOF_IDS,
  buildScenarioADurabilityCase,
  evaluateScenarioADurabilityObservation,
} from '../harness/oltp-scenario-a-durability-case.js';
import {
  buildScenarioAPaymentCase,
} from '../harness/oltp-scenario-a-payment-case.js';
import {
  observeLagrangePaymentState,
} from '../reference-client/lagrange-payment-observer.js';
import {
  observeLagrangeOltpStateSnapshot,
} from '../reference-client/lagrange-oltp-state-snapshot.js';
import {
  buildBasePayload,
  createAndValidateAdapter,
  executeScenarioRun,
  runScenarioPreStart,
} from './scenario-a-lagrange-shared.js';

const ZERO = 0;
const ONE = 1;
const PROOF_CASE_ID = 'durability';
const EVIDENCE_ID = 'lagrange-durable-commit-v1';
const OUTPUT_PATH =
  process.env.LAGRANGE_SCENARIO_A_DURABILITY_EVIDENCE_PATH ||
  'test-output/tidb-reference/scenario-a-durability-lagrange.json';

async function resolveNodeIncarnation(node) {
  const direct = node?.bootIncarnation ?? node?.incarnation ?? node?.pid;
  if (direct !== undefined && direct !== null && String(direct).trim()) {
    return String(direct).trim();
  }
  if (node?._dockerProvider &&
      typeof node._dockerProvider.inspectContainer === 'function' &&
      node.containerId) {
    try {
      const info = await node._dockerProvider.inspectContainer(node.containerId);
      const startedAt = String(info?.State?.StartedAt || '').trim();
      const pid = info?.State?.Pid != null ? String(info.State.Pid) : '';
      if (startedAt || pid) {
        return `${node.containerId}:${startedAt}:${pid}`;
      }
    } catch {
      return '';
    }
  }
  if (typeof node?.inspectContainerState === 'function') {
    try {
      const state = await node.inspectContainerState();
      const finishedAt = String(state?.finishedAt || '').trim();
      const status = String(state?.status || '').trim();
      if (finishedAt || status) {
        return `${node.id || ''}:${status}:${finishedAt}`;
      }
    } catch {
      return '';
    }
  }
  return '';
}

async function preStart(options = {}) {
  return runScenarioPreStart(options, PROOF_CASE_ID);
}

async function run(cluster, preflight = null) {
  return executeScenarioRun({
    cluster,
    preflight,
    proofCaseId: PROOF_CASE_ID,
    defaultOutputPath: OUTPUT_PATH,
    execute: async ({context, options}) => {
      const admission = context.admission;
      const definition = buildScenarioADurabilityCase();
      const payment = buildScenarioAPaymentCase();
      const adapter = await createAndValidateAdapter({
        createAdapter: options.createAdapter,
        context,
        workload: definition.identity.workload,
        expectedDatasetSha256: definition.identity.datasetSha256,
        proofCaseId: PROOF_CASE_ID,
      });

      const retryOutcome = await executePairedOltpTransactionWithRetry({
        executeAttempt: () => adapter.executeTransaction(definition.identity.operation),
      });

      const observePayment = options.observePayment || observeLagrangePaymentState;
      const observeSnapshot = options.observeSnapshot || observeLagrangeOltpStateSnapshot;

      const paymentBeforeRestart = await observePayment({
        endpoint: context.endpoint,
        connection: context.connection,
        operation: payment.identity.operation,
      });
      const stateBeforeRestart = await observeSnapshot({
        endpoint: context.endpoint,
        connection: context.connection,
      });

      await adapter.close({dropTables: false});

      let faultEvidence = null;
      if (options.restartCluster) {
        const restartResult = await options.restartCluster({cluster, context});
        faultEvidence = restartResult?.faultEvidence || restartResult || null;
      } else {
        const nodes =
          (typeof cluster.getNodes === 'function' ? cluster.getNodes() : []) || [];
        const nonEndpointReplica = nodes.length > ONE ?
          nodes.find((node) => node.id !== context.serviceEndpoint?.nodeId) :
          null;
        const targetNode = nonEndpointReplica || nodes[ZERO] || null;
        const beforeIncarnation = await resolveNodeIncarnation(targetNode);
        let restartResult = null;
        if (targetNode?.id && typeof cluster.restartNode === 'function') {
          restartResult = await cluster.restartNode(targetNode.id);
        }
        const postRestartNodes =
          (typeof cluster.getNodes === 'function' ? cluster.getNodes() : []) || [];
        const afterNode =
          postRestartNodes.find((n) => n.id === targetNode?.id) || targetNode;
        const afterCandidate =
          restartResult?.afterIncarnation ??
          restartResult?.bootIncarnation ??
          (await resolveNodeIncarnation(afterNode));
        const afterIncarnation = String(afterCandidate || '').trim();
        faultEvidence = Object.freeze({
          faultTarget: Object.freeze({
            nodeId: String(targetNode?.id || ''),
            role: String(targetNode?.role || 'data-replica'),
            isDataReplica: targetNode?.isDataReplica !== false,
            pgHostOnly: targetNode?.pgHostOnly === true,
          }),
          beforeIncarnation,
          afterIncarnation,
          storageContinuity: 'preserved',
          retainedObligations: Object.freeze([
            'committed_payment_rows',
            'full_oltp_state_sha256',
          ]),
        });
      }

      const prepareContext = options.prepareContext ||
        prepareLagrangeScenarioAPublicPgContext;
      const postRestartContext = await prepareContext({cluster, admission});

      const paymentAfterRestart = await observePayment({
        endpoint: postRestartContext.endpoint,
        connection: postRestartContext.connection,
        operation: payment.identity.operation,
      });
      const stateAfterRestart = await observeSnapshot({
        endpoint: postRestartContext.endpoint,
        connection: postRestartContext.connection,
      });

      const paymentObservation = Object.freeze({
        paidCents: Number(retryOutcome.result?.paidCents),
        ...paymentAfterRestart,
      });
      const evaluation = evaluateScenarioADurabilityObservation({
        commitAcknowledged: true,
        paymentObservation,
        stateBeforeRestartSha256: stateBeforeRestart.stateSha256,
        stateAfterRestartSha256: stateAfterRestart.stateSha256,
        faultEvidence,
      });
      const payload = buildBasePayload({
        evidenceId: EVIDENCE_ID,
        definition,
        adapter: null,
        context,
        extra: {
          operation: definition.identity.operation,
          serviceEndpoint: postRestartContext.serviceEndpoint,
          retryEvidence: retryOutcome.evidence,
          paymentBeforeRestart,
          paymentAfterRestart,
          stateBeforeRestartSha256: stateBeforeRestart.stateSha256,
          stateAfterRestartSha256: stateAfterRestart.stateSha256,
          faultEvidence,
          evaluation,
        },
      });

      return {
        adapter: null,
        payload,
        proofIds: OLTP_SCENARIO_A_DURABILITY_PROOF_IDS,
        evaluation,
        serviceEndpoint: context.serviceEndpoint,
      };
    },
  });
}

export {
  preStart,
  run,
  resolveNodeIncarnation,
};
