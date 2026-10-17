/**
 * Binding-invocation steps of the public-seam durability scenario.
 *
 * Gated by `scenarios.publicSeamDurability.binding.enabled` (default
 * false). When disabled both steps report NOT_RUN with the named reason;
 * when enabled the account-summary WASI service is deployed through the
 * shared service-pipeline mechanism public-path-multinode-baseline uses
 * on docker nodes (local OCI layout under the scenario-artifacts bind
 * mount; lifecycle SQL over an authenticated PostgreSQL-wire session to the
 * listener the public-client step provisioned), and its call Binding is invoked with CALL BINDING through the
 * public PostgreSQL-wire client before the outage and after the restart.
 */

import {
  createServicePipeline,
  deployThroughPipeline,
  prepareServiceProject,
} from './service-pipeline-deployment-helpers.js';
import {
  findTopologyLeaks,
} from '../../../src/test-helpers/topology-leak-check.js';
import {
  PUBLIC_SEAM_BINDING,
  PUBLIC_SEAM_BINDING_SQL,
  PUBLIC_SEAM_NOT_RUN_REASON,
  PUBLIC_SEAM_STEP,
  PUBLIC_SEAM_STEP_OUTCOME,
} from './public-seam-durability-constants.js';
import {
  bindingDatasetRows,
  bindingSummaryOracle,
  projectOracleFields,
} from './public-seam-durability-state.js';

const ZERO = 0;

/**
 * Deploy the account-summary service through the pipeline owner.
 * @param {Object} ctx - Scenario context.
 * @return {Promise<{callBindingName: string}>}
 */
async function defaultDeployBinding(ctx) {
  const source = ctx.config.binding.artifactSource;
  if (source !== PUBLIC_SEAM_BINDING.ARTIFACT_SOURCE_SERVICE_PIPELINE) {
    throw new Error(`unsupported binding artifact source: ${source}`);
  }
  const writeOutput = async () => {};
  const pipeline = createServicePipeline();
  const paths = await prepareServiceProject(
    PUBLIC_SEAM_BINDING.PROJECT_SUBDIRECTORY);
  await pipeline.runGenerate({
    projectDirectory: paths.projectDirectory, writeOutput,
  });
  const build = await pipeline.runBuild({
    projectDirectory: paths.projectDirectory, writeOutput,
  });
  const deployed = await deployThroughPipeline({
    adminNode: ctx.writer,
    nodes: ctx.nodes,
    options: {
      discoverEndpoints: ctx.deps.discoverEndpoints,
      openClient: ctx.deps.openPublicClient,
      sleep: ctx.deps.sleep,
      timeoutMs: ctx.config.publicClient.endpointTimeoutMs,
    },
  }, {pipeline, runId: ctx.deps.runId, writeOutput}, paths, build.layoutPath);
  const callBindingName = (deployed.bindings || []).find((name) =>
    name.includes(PUBLIC_SEAM_BINDING.CALL_BINDING_MARKER));
  if (!callBindingName) {
    throw new Error('deploy produced no call Binding');
  }
  return {callBindingName};
}

async function seedBindingDataset(client) {
  await client.query(PUBLIC_SEAM_BINDING_SQL.CREATE_TABLE);
  for (const row of bindingDatasetRows()) {
    await client.query(PUBLIC_SEAM_BINDING_SQL.INSERT_ROW, row);
  }
}

function callPayload(callBindingName, accountId) {
  return JSON.stringify({
    arguments: {accountId},
    name: callBindingName,
    schema_version: PUBLIC_SEAM_BINDING.CALL_SCHEMA_VERSION,
  });
}

/**
 * Invoke the call Binding for every account through one node's public
 * client, polling (a read-only call) until it answers or the window closes.
 * @return {Promise<{summaries: Object, lastError: string|null}>}
 */
async function invokeSummaries(ctx, node, poll) {
  const client = ctx.clients.get(node.id);
  const summaries = {};
  let lastError = null;
  for (const accountId of PUBLIC_SEAM_BINDING.ACCOUNT_IDS) {
    const answer = await poll(ctx, ctx.config.binding.readyTimeoutMs,
      async () => {
        const rows = await client.query(PUBLIC_SEAM_BINDING_SQL.CALL_BINDING,
          [callPayload(ctx.binding.callBindingName, accountId)]);
        const parsed = JSON.parse(rows[ZERO][PUBLIC_SEAM_BINDING.RESULT_COLUMN]);
        ctx.observations.push({nodeId: node.id, parsed});
        return {done: true, value: parsed};
      });
    summaries[accountId] = answer.value;
    lastError = answer.lastError || lastError;
  }
  return {lastError, summaries};
}

function compareToOracle(summaries) {
  const expected = {};
  const actual = {};
  for (const accountId of PUBLIC_SEAM_BINDING.ACCOUNT_IDS) {
    expected[accountId] = bindingSummaryOracle(accountId);
    actual[accountId] =
      projectOracleFields(summaries[accountId], expected[accountId]);
  }
  return {actual, expected,
    matches: JSON.stringify(actual) === JSON.stringify(expected)};
}

/**
 * The binding steps are gated by config before their requirements are
 * evaluated, so a disabled binding reports its own named reason.
 * @param {Object} ctx
 * @return {Object|null} A NOT_RUN result, or null when enabled.
 */
function bindingGate(ctx) {
  if (ctx.config.binding.enabled) {
    return null;
  }
  return {
    outcome: PUBLIC_SEAM_STEP_OUTCOME.NOT_RUN,
    reason: PUBLIC_SEAM_NOT_RUN_REASON.BINDING_DISABLED,
  };
}

// A binding result is a public result too: a topology-bearing key in it
// (e.g. account-summary's `contributingShards`, a placement count) FAILs the
// step even when every oracle field matches. The oracle compares values;
// it never hides a leaked key.
function invocationResult(comparison, invoked, nodeId) {
  const leakedKeys = findTopologyLeaks(invoked.summaries)
    .map((leak) => leak.path);
  const ok = comparison.matches && leakedKeys.length === ZERO;
  return {
    actual: {leakedKeys, nodeId, summaries: comparison.actual,
      lastError: invoked.lastError},
    expected: {leakedKeys: [], summaries: comparison.expected},
    outcome: ok ?
      PUBLIC_SEAM_STEP_OUTCOME.PASS :
      PUBLIC_SEAM_STEP_OUTCOME.FAIL,
    reason: ok ? undefined : bindingFailureReason(comparison, leakedKeys),
  };
}

function bindingFailureReason(comparison, leakedKeys) {
  const reasons = [];
  if (!comparison.matches) {
    reasons.push('binding result differs from the independent oracle');
  }
  if (leakedKeys.length > ZERO) {
    reasons.push(`binding result carries topology-bearing keys: ${
      leakedKeys.join(', ')} (call owner result shape)`);
  }
  return reasons.join('; ');
}

/**
 * Build the two binding steps around the scenario's bounded poll.
 * @param {Function} poll - pollUntil(ctx, timeoutMs, probe).
 * @return {{before: Object, after: Object}} Step descriptors.
 */
function createBindingSteps(poll) {
  async function before(ctx) {
    ctx.binding = await ctx.deps.deployBinding(ctx);
    await seedBindingDataset(ctx.clients.get(ctx.writer.id));
    const invoked = await invokeSummaries(ctx, ctx.writer, poll);
    return invocationResult(compareToOracle(invoked.summaries), invoked,
      ctx.writer.id);
  }
  async function after(ctx) {
    const invoked = await invokeSummaries(ctx, ctx.stoppedNode, poll);
    return invocationResult(compareToOracle(invoked.summaries), invoked,
      ctx.stoppedNode.id);
  }
  return {
    after: {
      gate: bindingGate,
      name: PUBLIC_SEAM_STEP.BINDING_AFTER_RESTART,
      requires: [PUBLIC_SEAM_STEP.BINDING_BEFORE_OUTAGE,
        PUBLIC_SEAM_STEP.PARTICIPANT_RESTARTED],
      run: after,
    },
    before: {
      gate: bindingGate,
      name: PUBLIC_SEAM_STEP.BINDING_BEFORE_OUTAGE,
      requires: [PUBLIC_SEAM_STEP.PUBLIC_CLIENT_READY],
      run: before,
    },
  };
}

export {
  createBindingSteps,
  defaultDeployBinding,
};
