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

// One readiness attempt: the probe's verdict {ready, diagnostic}, or, when the
// probe throws, a not-ready attempt whose diagnostic is the error. An answer
// outside that contract is a harness defect and is raised, never read as a
// verdict.
async function probeOnce(component, probe) {
  let outcome;
  try {
    outcome = await probe();
  } catch (error) {
    return {ready: false, diagnostic: {error: errorText(error)}};
  }
  if (!outcome || typeof outcome.ready !== 'boolean' || !('diagnostic' in outcome)) {
    throw new Error(`readiness probe of ${component} answered outside {ready, diagnostic}`);
  }
  return outcome;
}

/**
 * @param {{component: string, probe: Function, attempts: number,
 *   intervalMs: number, sleep: Function, now?: Function, stablePolls?: number}} input
 *   probe answers {ready: boolean, diagnostic}
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
    const outcome = await probeOnce(component, probe);
    last = outcome.diagnostic;
    consecutive = outcome.ready ? consecutive + 1 : 0;
    if (consecutive >= stablePolls) {
      const readyAt = now();
      return {state: READINESS_STATE.READY, component, attempts: attempt, stablePolls,
        observedAt: new Date(readyAt).toISOString(), timeToReadyMs: readyAt - startedAt,
        evidence: last};
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
