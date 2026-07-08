/**
 * Operational-probe non-regression guard (spec node-liveness-veto-consolidation,
 * Task 7.1 / R3.1, design §6): the local real-time operational probes MUST NOT
 * import or call the shared eligibility atom `hasLiveTransportEvidence`.
 *
 * These three sites (prior audit
 * `solve/specs/membership-lifecycle-placement-hard-cutover/
 * failure-detector-consolidation-scope.md` items #4 / #5 / #9) each need
 * live-RIGHT-NOW reachability for a specific lease / op / route and keep their
 * own local probe (`getConnectionState`, `pingNode`). Routing them through the
 * eligibility atom — which folds a stale secondary signal into a per-node
 * usability verdict — would be a CORRECTNESS regression (a remove-safety quorum
 * check wants live reachability now, not the shared eligibility grace). So the
 * guard asserts they stay OFF the atom.
 *
 *   #4 remove-safety quorum ping   -> operation-workflow-remove-safety-evaluator.js
 *   #5 recovery-unblock ping       -> operation-workflow-recovery-timeout.js
 *   #9 split-brain routing envelope-> query-executor-partition-service-resolution.js
 */

import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from '../../src/test-helpers/tap.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const OPERATIONAL_PROBE_MODULES = [
  {
    relPath: 'src/rebalancer/operation-workflow-remove-safety-evaluator.js',
    role: '#4 remove-safety quorum ping over voter-ready rows',
  },
  {
    relPath: 'src/rebalancer/operation-workflow-recovery-timeout.js',
    role: '#5 recovery-unblock ping for a waiting recovery op',
  },
  {
    relPath: 'src/query/query-executor-partition-service-resolution.js',
    role: '#9 split-brain routing envelope (connected-only CP-write routing)',
  },
];

const ATOM_NAME_RE = /hasLiveTransportEvidence/;
const ATOM_IMPORT_RE = /live-transport-evidence/;

/**
 * Detect whether a module imports or calls the eligibility atom.
 * @param {string} source Full module source text.
 * @return {boolean} True if the module references the atom by name or import.
 */
function routesThroughAtom(source) {
  return ATOM_NAME_RE.test(source) || ATOM_IMPORT_RE.test(source);
}

test('operational probes do NOT import or call hasLiveTransportEvidence ' +
  '(R3.1)', async (t) => {
  for (const {relPath, role} of OPERATIONAL_PROBE_MODULES) {
    const source = readFileSync(join(REPO_ROOT, relPath), 'utf8');
    t.notOk(
      routesThroughAtom(source),
      relPath + ' (' + role + ') keeps its local live-now probe, off the atom',
    );
  }
});

// ---- Negative-control self-test: prove the detector can actually FAIL. ----

test('NEGATIVE CONTROL: an operational probe that imports/calls the atom trips ' +
  'the guard', async (t) => {
  const tampered =
    'import {hasLiveTransportEvidence} from ' +
    '"../control-plane/live-transport-evidence.js";\n' +
    'export function probe(nodeId, router) {\n' +
    '  return hasLiveTransportEvidence(nodeId, {messageRouter: router});\n' +
    '}\n';
  t.ok(
    routesThroughAtom(tampered),
    'a probe wired to the atom is detected (guard would fail)',
  );
});
