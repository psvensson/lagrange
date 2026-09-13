// R27: a probe measures, it never acts. The solver sets LAGRANGE_PROBE=1
// while measuring a doneWhen; a harness - anything that starts a cluster, a
// demo or a network call - refuses under it, so a probe that reaches a
// harness fails loudly instead of running it (a probe started the five-minute
// local formation demo on 2026-09-13).

const PROBE_ENV = 'LAGRANGE_PROBE';
const PROBE_ENV_VALUE = '1';
const REFUSAL_PREFIX = 'refused under LAGRANGE_PROBE=1: a probe never starts ';

/**
 * Whether the process runs as a solver probe.
 * @param {object} [env]
 * @return {boolean}
 */
function isProbing(env = process.env) {
  return env[PROBE_ENV] === PROBE_ENV_VALUE;
}

/**
 * Throw when a harness is entered under a probe.
 * @param {string} what what would have started, e.g. 'a cluster'
 * @param {object} [env]
 */
function refuseUnderProbe(what, env = process.env) {
  if (isProbing(env)) throw new Error(`${REFUSAL_PREFIX}${what}`);
}

export {refuseUnderProbe};
