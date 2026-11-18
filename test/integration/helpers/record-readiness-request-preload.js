// Harness instrumentation, loaded before the public embedded consumer starts.
// Records every HTTP readiness probe a node answers and every join-admission
// readiness read, with the wall-clock instant, so a proof can state that no
// probe arrived and that no join request arrived after formation. It answers
// nothing itself: each call runs the product's own method unchanged.
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {BootstrapAPI} from '../../../src/bootstrap/bootstrap-api.js';
import {BootstrapReadinessOwner} from
  '../../../src/bootstrap/owners/bootstrap-readiness-owner.js';

const evidencePath = join(process.env.LAGRANGE_READINESS_REQUEST_EVIDENCE_DIR,
  `${process.env.NODE_ID}.json`);
const observation = {installed: true, probes: [], joinAdmissionReads: []};
const record = () => writeFileSync(evidencePath, JSON.stringify(observation));

function recordCalls(prototype, method, sink) {
  const product = prototype[method];
  if (typeof product !== 'function') {
    throw new Error(`readiness-request recorder cannot bind ${method}`);
  }
  prototype[method] = function recordedReadinessRequest(...args) {
    sink.push({method, atMs: Date.now()});
    record();
    return product.apply(this, args);
  };
}

for (const method of [
  'handleStartupProbeRequest',
  'handleReadinessProbeRequest',
  'handleBootstrapReadinessProbeRequest',
]) {
  recordCalls(BootstrapReadinessOwner.prototype, method, observation.probes);
}
recordCalls(BootstrapAPI.prototype, 'getBootstrapJoinAdmissionSnapshot',
  observation.joinAdmissionReads);
record();
