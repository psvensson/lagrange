/**
 * Fail-closed readiness polling for the comparative-benchmark deployers. A
 * component is ready only when its probe - which reads the product's own
 * documented contract - says so; a probe that throws is a not-ready attempt
 * whose error is the diagnostic. Exhaustion throws `readiness_exhausted`
 * carrying the LAST diagnostic, so measurement never starts on a component
 * nobody saw ready.
 */
import {
  DEPLOYMENT_FAILURE,
  READINESS_STATE,
  deploymentFailure,
} from './real-product-deployment-contract.js';
import {errorText} from './real-product-remote-shell.js';

/**
 * @param {{component: string, probe: Function, attempts: number,
 *   intervalMs: number, sleep: Function, now?: Function}} input
 * @return {Promise<{state: string, component: string, attempts: number,
 *   observedAt: string, evidence: *}>}
 */
async function pollReadiness({component, probe, attempts, intervalMs, sleep,
  now = Date.now, stablePolls = 1}) {
  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new Error(`readiness for ${component} needs a positive attempt budget`);
  }
  const startedAt = now();
  let last = null;
  let consecutive = 0;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const outcome = await probe();
      last = outcome?.diagnostic ?? null;
      consecutive = outcome?.ready === true ? consecutive + 1 : 0;
      if (consecutive >= stablePolls) {
        const readyAt = now();
        return {state: READINESS_STATE.READY, component, attempts: attempt, stablePolls,
          observedAt: new Date(readyAt).toISOString(), timeToReadyMs: readyAt - startedAt,
          evidence: last};
      }
    } catch (error) {
      consecutive = 0;
      last = {error: errorText(error)};
    }
    if (attempt < attempts) await sleep(intervalMs);
  }
  throw deploymentFailure(DEPLOYMENT_FAILURE.READINESS_EXHAUSTED,
    `${component} did not report ready after ${attempts} attempts`,
    {component, attempts, elapsedMs: now() - startedAt, last});
}

/**
 * Wrap a readiness owner that throws a plain Error on timeout (the TiDB
 * lifecycle and placement owners) into the typed exhaustion.
 */
async function typedReadiness(component, run) {
  try {
    return await run();
  } catch (error) {
    if (error?.code) throw error;
    throw deploymentFailure(DEPLOYMENT_FAILURE.READINESS_EXHAUSTED,
      `${component} readiness failed: ${errorText(error)}`,
      {component, last: {error: errorText(error)}});
  }
}

export {pollReadiness, typedReadiness};
