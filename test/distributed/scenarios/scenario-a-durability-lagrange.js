import {
  prepareLagrangeScenarioAPublicPgContext,
} from '../harness/oltp-scenario-a-lagrange-public-pg-context.js';
import {
  executePairedOltpTransactionWithRetry,
} from '../harness/oltp-paired-retry-owner.js';
import {
  OLTP_SCENARIO_A_DURABILITY_PROOF_IDS,
  OLTP_SCENARIO_A_FAULT_ROLE,
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

const arrayFind = Function.call.bind(Array.prototype.find);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayJoin = Function.call.bind(Array.prototype.join);
const stringTrim = Function.call.bind(String.prototype.trim);

// The named state of a node whose boot incarnation nothing observes: absent,
// never an empty identity. The durability evaluation refuses a missing
// before/after incarnation (fault_incarnation_unchanged).
const NO_OBSERVABLE_INCARNATION = null;

// One incarnation read; an unreadable incarnation fails the proof explicitly
// and is never read as "no incarnation".
async function readIncarnation(read) {
  try {
    return await read();
  } catch (error) {
    throw new Error(`durability fault target incarnation unreadable: ${error?.message}`,
      {cause: error});
  }
}

// The incarnation a node reports itself (bootIncarnation, incarnation or its
// process id), or null when it reports none.
function reportedIncarnation(node) {
  for (const field of ['bootIncarnation', 'incarnation', 'pid']) {
    const value = node[field];
    if (value !== undefined && value !== null && stringTrim(String(value)) !== '') {
      return stringTrim(String(value));
    }
  }
  return null;
}

// A Docker-backed node: its container's start time and process id, both of
// which `docker inspect` always reports for a container.
function dockerIncarnation(node) {
  return readIncarnation(async () => {
    const info = await node._dockerProvider.inspectContainer(node.containerId);
    const {StartedAt: startedAt, Pid: pid} = info.State;
    if (typeof startedAt !== 'string' || !Number.isInteger(pid)) {
      throw new Error(`container ${node.containerId} inspection carries no StartedAt/Pid`);
    }
    return `${node.containerId}:${startedAt}:${pid}`;
  });
}

// A process-backed node: its reported container state (status, finishedAt).
function processIncarnation(node) {
  return readIncarnation(async () => {
    const state = await node.inspectContainerState();
    const status = stringTrim(String(state.status));
    const finishedAt = stringTrim(String(state.finishedAt));
    return status || finishedAt ? `${node.id}:${status}:${finishedAt}` :
      NO_OBSERVABLE_INCARNATION;
  });
}

/**
 * The boot incarnation of a node, read from the source its shape offers: the
 * identity it reports, its Docker container, or its process handle's state;
 * NO_OBSERVABLE_INCARNATION (null) when it offers none.
 * @param {Object} node
 * @return {Promise<string|null>}
 */
async function resolveNodeIncarnation(node) {
  const reported = reportedIncarnation(node);
  if (reported !== null) return reported;
  if (node._dockerProvider && node.containerId) return dockerIncarnation(node);
  if (typeof node.inspectContainerState === 'function') return processIncarnation(node);
  return NO_OBSERVABLE_INCARNATION;
}

// The default fault: restart one node of the cluster that is not the PG-wire
// endpoint's node (the only node of a one-node cluster) and record its
// incarnation before and after the restart.
// The proof plan names the fault target's role; a missing or unknown role
// refuses the case (a node is never presumed to be a data replica).
function plannedFaultRole(options) {
  if (!arrayIncludes(Object.values(OLTP_SCENARIO_A_FAULT_ROLE), options.faultRole)) {
    throw Object.assign(new Error('fault_role_unplanned: the durability proof plan must ' +
      `name the fault target role (${arrayJoin(Object.values(OLTP_SCENARIO_A_FAULT_ROLE), ', ')}), ` +
      `got ${JSON.stringify(options.faultRole)}`), {code: 'fault_role_unplanned'});
  }
  return options.faultRole;
}

async function restartReplicaFault(cluster, context, role) {
  if (typeof cluster?.getNodes !== 'function' || typeof cluster.restartNode !== 'function') {
    throw new Error('durability proof needs a cluster that lists and restarts its nodes');
  }
  const nodes = cluster.getNodes();
  const target = nodes.length > ONE ?
    arrayFind(nodes, (node) => node.id !== context.serviceEndpoint?.nodeId) : nodes[ZERO];
  if (!target) throw new Error('durability proof found no node to restart');
  const beforeIncarnation = await resolveNodeIncarnation(target);
  await cluster.restartNode(target.id);
  const after = arrayFind(cluster.getNodes(), (node) => node.id === target.id);
  if (!after) throw new Error(`restarted node ${target.id} is absent from the cluster`);
  return Object.freeze({
    faultTarget: Object.freeze({
      nodeId: String(target.id),
      role,
      isDataReplica: role === OLTP_SCENARIO_A_FAULT_ROLE.DATA_REPLICA,
      pgHostOnly: role === OLTP_SCENARIO_A_FAULT_ROLE.PG_HOST_ONLY,
    }),
    beforeIncarnation,
    afterIncarnation: await resolveNodeIncarnation(after),
    storageContinuity: 'preserved',
    retainedObligations: Object.freeze([
      'committed_payment_rows',
      'full_oltp_state_sha256',
    ]),
  });
}

// The fault evidence: the caller's restart (it answers the evidence, or
// nothing, which the evaluation refuses as fault_evidence_missing), else the
// default replica restart.
async function faultEvidenceOf({options, cluster, context}) {
  if (!options.restartCluster) {
    return restartReplicaFault(cluster, context, plannedFaultRole(options));
  }
  const evidence = await options.restartCluster({cluster, context});
  return evidence === undefined ? null : evidence;
}

async function preStart(options = {}) {
  return runScenarioPreStart(options, PROOF_CASE_ID);
}

// The proof body, independent of how its context was admitted: the live
// Lagrange run and the PG-wire proof journey (Lagrange, PostgreSQL) share it.
async function executeProof({context, options = {}, cluster = null}) {
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

  const faultEvidence = await faultEvidenceOf({options, cluster, context});

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
}

async function run(cluster, preflight = null) {
  return executeScenarioRun({
    cluster,
    preflight,
    proofCaseId: PROOF_CASE_ID,
    defaultOutputPath: OUTPUT_PATH,
    execute: ({context, options}) => executeProof({context, options, cluster}),
  });
}

export {
  executeProof,
  preStart,
  run,
  resolveNodeIncarnation,
};
