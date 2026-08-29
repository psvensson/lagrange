// Probe interface + registry.
//
// A probe is the ONLY extension point of the solver. It is a pure reader over real
// artifacts that answers two independent questions for a quest or frontier:
//   - measure(args, ctx) -> { metric, done, evidence, detail? }
//     * metric: number, lower-is-better (the progress gradient) or null
//     * done:   boolean terminal success (the done_when predicate)
//     * evidence: path to the artifact the answer was read from
//
// `done` and `metric` are intentionally separate: success is never inferred from
// metric movement. Concrete probes (e.g. scenario-harness) live in ./probes and are
// registered here.

import {scenarioHarnessProbe} from './probes/scenario-harness.js';
import {oracleProbe} from './probes/oracle.js';
import {invariantHeldProbe} from './probes/invariant-held.js';
import {testReceiptProbe} from './probes/test-receipt.js';
import {attachEvidenceIdentity} from './evidence-identity.js';

const REGISTRY = new Map([
  ['scenario-harness', scenarioHarnessProbe],
  ['oracle', oracleProbe],
  ['invariantHeld', invariantHeldProbe],
  ['test-receipt', testReceiptProbe],
]);

export function registerProbe(name, probe) {
  REGISTRY.set(name, probe);
}

export function getProbe(name) {
  const probe = REGISTRY.get(name);
  if (!probe) throw new Error(`unknown probe: ${name}`);
  return probe;
}

// Evaluate a {probe, args} spec. Returns the probe result, or a null/undone result
// when the spec is absent (e.g. a frontier without its own done_when).
export function evaluate(spec, ctx = {}) {
  if (!spec || !spec.probe) {
    return {metric: null, done: false, evidence: null};
  }
  const probe = getProbe(spec.probe);
  const result = probe.measure(spec.args || {}, ctx);
  const classified = {
    ...result,
    evidenceClass: result?.evidenceClass || probe.evidenceClass,
    evidenceIdentityArgs: result?.evidenceIdentityArgs ||
      (typeof probe.identityArgs === 'function' ?
        probe.identityArgs(spec.args || {}) : undefined),
  };
  return attachEvidenceIdentity(ctx.root || process.cwd(), spec, classified);
}
