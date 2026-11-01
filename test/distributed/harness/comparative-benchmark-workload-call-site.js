/**
 * The ONE call site of the canonical workload entry (stream B1) in the
 * deployment/campaign layer. The deployment layer hands B1 a ready, verified
 * deployment; B1 loads the canonical dataset through the canonical adapter's
 * prepareDataset, then MUST call `beforeMeasurement` - where this layer
 * verifies the loaded dataset through the product's public interface and
 * observes placement - and only then warm up and measure. A B1 run that
 * measured without handing the dataset over is refused here
 * (`dataset_unverified`), whatever B1 returned.
 *
 * Assumed B1 contract (integration point; adjust only this module):
 *   runCanonicalWorkload({targetId, runId, protocol, endpoint: {host, port},
 *     connection, clientHost, sshRun, opts, workload, offeredRatePerSec,
 *     warmup, slo, semanticProfileId, signal, beforeMeasurement})
 *   -> {observations, correctness, loadGenerator?}
 * where `observations`/`correctness` have the chain design's v2 shape and
 * `signal` aborting means stop issuing safely (unissued/unresolved).
 */
import {
  DEPLOYMENT_FAILURE,
  deploymentFailure,
} from './real-product-deployment-contract.js';
import {verifyCanonicalDataset} from './real-product-dataset-verification.js';
import {errorText} from './real-product-remote-shell.js';
import {
  arrayIncludes,
  arrayMap,
} from './real-product-captured-intrinsics.js';

const CANONICAL_WORKLOAD_ENTRY = Object.freeze({
  module: './real-product-canonical-workload.js',
  export: 'runCanonicalWorkload',
});

/**
 * Resolve B1's entry. Absent is an explicit typed unavailability (R11), never
 * a substitute workload.
 */
async function loadCanonicalWorkloadEntry(importModule = (specifier) => import(specifier)) {
  let entry = null;
  try {
    entry = (await importModule(CANONICAL_WORKLOAD_ENTRY.module))?.[
      CANONICAL_WORKLOAD_ENTRY.export];
  } catch (error) {
    throw deploymentFailure(DEPLOYMENT_FAILURE.WORKLOAD_ENTRY_UNAVAILABLE,
      `canonical workload entry ${CANONICAL_WORKLOAD_ENTRY.module} unavailable: ` +
      errorText(error), CANONICAL_WORKLOAD_ENTRY);
  }
  if (typeof entry !== 'function') {
    throw deploymentFailure(DEPLOYMENT_FAILURE.WORKLOAD_ENTRY_UNAVAILABLE,
      `${CANONICAL_WORKLOAD_ENTRY.module} exports no ${CANONICAL_WORKLOAD_ENTRY.export}`,
      CANONICAL_WORKLOAD_ENTRY);
  }
  return entry;
}

function productHostsOf(deployment) {
  return [...new Set(arrayMap((deployment.roles || []), (role) => role.host))];
}

/**
 * @param {{runCanonicalWorkload: Function, sshRun: Function, opts: Object,
 *   clientHost: string, describeLoadGenerator: Function}} input
 * @return {Function} executeWorkloadRun({run, manifest, deployment, signal})
 */
function createWorkloadRunExecutor({runCanonicalWorkload, sshRun, opts, clientHost,
  describeLoadGenerator}) {
  return async ({run, manifest, deployment, signal}) => {
    const productHosts = productHostsOf(deployment);
    if (arrayIncludes(productHosts, clientHost)) {
      throw deploymentFailure(DEPLOYMENT_FAILURE.LOAD_GENERATOR_COLOCATED,
        `load generator ${clientHost} is a product host of ${run.targetId}`, {productHosts});
    }
    const loadGenerator = {...await describeLoadGenerator(), host: clientHost,
      productHosts, notProductHost: true};
    let dataset = null;
    let placement = null;
    let result;
    try {
      result = await runCanonicalWorkload({
        targetId: run.targetId, runId: run.runId, protocol: deployment.endpoint.protocol,
        endpoint: {host: deployment.endpoint.host, port: deployment.endpoint.port},
        connection: deployment.access?.connection ?? null, clientHost, sshRun, opts,
        workload: manifest.plan.workload, offeredRatePerSec: run.offeredRatePerSec,
        warmup: manifest.plan.warmup, slo: manifest.plan.slo,
        semanticProfileId: manifest.plan.semanticProfileId, signal,
        beforeMeasurement: async () => {
          dataset = await verifyCanonicalDataset({workload: manifest.plan.workload,
            readTableRows: deployment.operations.readTableRows});
          placement = await deployment.operations.observePlacement();
        },
      });
    } catch (error) {
      if (error?.code) throw error;
      throw deploymentFailure(DEPLOYMENT_FAILURE.WORKLOAD_FAILED,
        `canonical workload failed: ${errorText(error)}`);
    }
    if (dataset === null) {
      throw deploymentFailure(DEPLOYMENT_FAILURE.DATASET_UNVERIFIED,
        'the workload entry returned without handing the loaded dataset over for ' +
        'verification before measurement');
    }
    if (!result?.observations) {
      throw deploymentFailure(DEPLOYMENT_FAILURE.WORKLOAD_FAILED,
        'the workload entry returned no observations');
    }
    return {observations: result.observations, correctness: result.correctness ?? null,
      dataset, placement, loadGenerator: {...loadGenerator, ...(result.loadGenerator || {})}};
  };
}

export {
  CANONICAL_WORKLOAD_ENTRY,
  createWorkloadRunExecutor,
  loadCanonicalWorkloadEntry,
};
