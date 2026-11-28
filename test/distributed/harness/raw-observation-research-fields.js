// The fields a research-grade run record adds to the v2 raw observation record:
// the per-statement timeline and statement catalog, the custody of retained
// statement evidence, the substrate descriptor and the round-trip matrices.
// They are validated here, beside their owner, through the helper kit the one
// record validator passes in (raw-observation-record.js), so there is one
// validator and one entry point. Records of earlier campaigns carry none of
// these fields and stay valid; where a field is present it must be well formed.
import {arrayEvery, arrayMap} from './real-product-captured-intrinsics.js';
import {deploymentFailure} from './real-product-deployment-contract.js';

const TIMELINE_ENTRY_LENGTH = 4;
// Matrices of one moment each: right after the containers started (a formation that
// fails keeps it), and before and after the measurement window.
const ROUND_TRIP_SIDES = Object.freeze(['atDeployment', 'before', 'after']);
const ROUND_TRIP_FIELDS = Object.freeze(['transmitted', 'received', 'lossPercent', 'minMs',
  'avgMs', 'maxMs', 'mdevMs']);

// Timeline entry: [catalogIndex, startedMs, endedMs or null (pending), status].
function validateTimeline(checks, timeline, at, catalogSize) {
  const {reject, requireArray, requireCount, requireTiming, requireText, invalidTiming} = checks;
  requireArray(timeline, at).forEach((entry, index) => {
    const where = `${at}[${index}]`;
    const [catalogIndex, started, ended, status] = Array.isArray(entry) &&
      entry.length === TIMELINE_ENTRY_LENGTH ? entry :
      reject(invalidTiming, `${where} is not [index, start, end, status]`);
    if (requireCount(catalogIndex, where) >= catalogSize ||
        requireTiming(started, where) > (ended ?? started)) {
      reject(invalidTiming, `${where} lies outside the catalog or ends early`);
    }
    requireText(status, where);
  });
}

function validateStatementCatalog(checks, catalog, at) {
  checks.requireArray(catalog, at).forEach((sql) => checks.requireText(sql, at));
}

// Custody of retained statement evidence: path, size and its verified digest.
function validateEvidenceCustody(checks, evidence, at) {
  const custody = evidence?.custody;
  if (custody === undefined) return;
  checks.requireText(checks.requireObject(custody, at).path, `${at}.path`);
  checks.requireCount(custody.bytes, `${at}.bytes`);
  if (custody.sha256 !== evidence.sha256) checks.reject(checks.digestMismatch, at);
}

function validateMatrix(checks, matrix, at) {
  const {requireArray, requireIsoTime, requireTiming, requireObject} = checks;
  requireIsoTime(requireObject(matrix, at).startedAt, `${at}.startedAt`);
  requireIsoTime(matrix.endedAt, `${at}.endedAt`);
  requireArray(matrix.entries, `${at}.entries`).forEach((entry, index) => {
    requireObject(entry, `${at}.entries[${index}]`);
    for (const field of ROUND_TRIP_FIELDS) {
      requireTiming(entry[field], `${at}.entries[${index}].${field}`);
    }
  });
}

// observations.network.roundTrip: the matrices measured before and after the
// measurement window.
function validateRoundTrip(checks, roundTrip, at) {
  if (roundTrip === undefined) return;
  checks.requireObject(roundTrip, at);
  for (const side of ROUND_TRIP_SIDES) {
    if (roundTrip[side] !== undefined) validateMatrix(checks, roundTrip[side], `${at}.${side}`);
  }
}

const SUBSTRATE_TEXT_FIELDS = Object.freeze(['kind', 'interNodePath', 'evidenceUse',
  'declaredHostIdentity']);

// The campaign header's substrate descriptor, where one is recorded.
function validateSubstrate(checks, substrate, at) {
  if (substrate === undefined) return;
  checks.requireObject(substrate, at);
  for (const field of SUBSTRATE_TEXT_FIELDS) checks.requireText(substrate[field], `${at}.${field}`);
  checks.requireArray(substrate.hosts, `${at}.hosts`);
  checks.requireArray(substrate.nodeHostMap, `${at}.nodeHostMap`);
  checks.requireCount(substrate.declaredHostCount, `${at}.declaredHostCount`);
}

// The gate event's method text: what the adapter that did the reset reported.
const RESET_METHOD_NOT_REPORTED = 'not-reported';
const RESET_METHOD_FIELD = 'datasetPreparationMethod';

function datasetResetEventMethod(reporters) {
  for (const reporter of reporters) {
    const method = reporter?.[RESET_METHOD_FIELD];
    if (typeof method === 'string' && method !== '') return `adapter ${method}`;
  }
  return `adapter ${RESET_METHOD_NOT_REPORTED}`;
}

// --- the substrate ladder (owner, 2026-11-28) ---------------------------------

const SUBSTRATE_KIND = Object.freeze({
  SINGLE_HOST: 'lab-single-host',
  MULTI_HOST: 'lab-multi-host',
  GCP: 'gcp-same-zone',
});
const INTER_NODE_PATH = Object.freeze({LAN: 'lan', BRIDGE: 'docker-bridge',
  VPC: 'vpc-same-zone'});
const EVIDENCE_USE = Object.freeze({FIRST_LOOK: 'first-look', WORKING: 'working-evidence',
  FINAL: 'final-verification'});
const NODE_COUNT = 3;
// How a node's host identity was declared: the observed machine name (every rung but
// the first look), or a synthetic id of the first look (owner, 2026-11-28: a truthfully
// declared one-host cluster never becomes ready, and one host is only ever a research
// artifact).
const DECLARED_HOST_IDENTITY = Object.freeze({OBSERVED: 'observed', SYNTHETIC: 'synthetic'});
const REFUSED_SUBSTRATE = 'refused_substrate_descriptor';

// What each rung is: its inter-node path, the use of its evidence and how many
// distinct hosts carry the three nodes.
const RUNG = Object.freeze({
  [SUBSTRATE_KIND.SINGLE_HOST]: Object.freeze({interNodePath: INTER_NODE_PATH.BRIDGE,
    evidenceUse: EVIDENCE_USE.FIRST_LOOK, hosts: 1}),
  [SUBSTRATE_KIND.MULTI_HOST]: Object.freeze({interNodePath: INTER_NODE_PATH.LAN,
    evidenceUse: EVIDENCE_USE.WORKING, hosts: NODE_COUNT}),
  [SUBSTRATE_KIND.GCP]: Object.freeze({interNodePath: INTER_NODE_PATH.VPC,
    evidenceUse: EVIDENCE_USE.FINAL, hosts: NODE_COUNT}),
});

// The statement a research report makes about what its rung's evidence may be used for.
const EVIDENCE_USE_NOTE = Object.freeze({
  [EVIDENCE_USE.FIRST_LOOK]: 'first look: three nodes on one host declaring synthetic host ' +
    'identities, no network between them; not speed or efficiency evidence',
  [EVIDENCE_USE.WORKING]: 'working evidence: three separate hosts with the network as it is',
  [EVIDENCE_USE.FINAL]: 'final verification: same-zone cloud hosts',
});

function refuseSubstrate(message, details) {
  throw deploymentFailure(REFUSED_SUBSTRATE, message, details);
}

/**
 * The substrate descriptor of a research campaign, or a typed refusal: the kind
 * names its rung, the inter-node path is the rung's own, the node-to-host map
 * has one node per distinct host (three hosts) or all three nodes on the one
 * host of the first look, and the load generator is a fourth machine except on
 * the first look, where it is that same host.
 * @param {Object} input {kind, interNodePath, hosts, loadGeneratorHostId, nodeHostMap,
 *   declaredHostCount, storage}
 * @return {Object} the frozen descriptor
 */
function buildSubstrateDescriptor(input) {
  const rung = RUNG[input?.kind];
  if (!rung) refuseSubstrate(`unknown substrate kind ${JSON.stringify(input?.kind)}`, {input});
  if (input.interNodePath !== rung.interNodePath) {
    refuseSubstrate(`${input.kind} has inter-node path ${rung.interNodePath}, not ` +
      `${JSON.stringify(input.interNodePath)}`, {kind: input.kind});
  }
  const nodes = input.nodeHostMap;
  const nodeHosts = new Set(arrayMap(nodes, (node) => node.hostId));
  if (nodes.length !== NODE_COUNT || nodeHosts.size !== rung.hosts ||
      input.declaredHostCount !== NODE_COUNT) {
    refuseSubstrate(`${input.kind} places ${NODE_COUNT} nodes on ${rung.hosts} distinct ` +
      `host(s) and declares ${NODE_COUNT}; the map names ${nodeHosts.size}`, {kind: input.kind});
  }
  const identity = input.kind === SUBSTRATE_KIND.SINGLE_HOST ?
    DECLARED_HOST_IDENTITY.SYNTHETIC : DECLARED_HOST_IDENTITY.OBSERVED;
  const synthetic = identity === DECLARED_HOST_IDENTITY.SYNTHETIC;
  const declared = new Set(arrayMap(nodes, (node) => node.declaredHostId));
  const honest = arrayEvery(nodes, (node) => node.declaredHostIdentity === identity &&
    typeof node.machineHostName === 'string' &&
    (node.declaredHostId === node.machineHostName) === !synthetic);
  if (!honest || (synthetic && declared.size !== NODE_COUNT)) {
    refuseSubstrate(`${input.kind} declares ${identity} host identities: ` +
      (synthetic ? 'one distinct synthetic id per node, marked synthetic, never the machine ' +
        'name' : 'each node declares its observed machine name, marked observed'),
    {kind: input.kind});
  }
  const loadGeneratorOnProductHost = nodeHosts.has(input.loadGeneratorHostId);
  if (loadGeneratorOnProductHost !== (input.kind === SUBSTRATE_KIND.SINGLE_HOST)) {
    refuseSubstrate(`${input.kind}: the load generator ` +
      `${loadGeneratorOnProductHost ? 'is' : 'is not'} a product host`, {kind: input.kind});
  }
  return Object.freeze({kind: input.kind, evidenceUse: rung.evidenceUse,
    declaredHostIdentity: identity,
    interNodePath: rung.interNodePath, hosts: input.hosts,
    loadGenerator: Object.freeze({hostId: input.loadGeneratorHostId}),
    nodeHostMap: input.nodeHostMap, declaredHostCount: input.declaredHostCount,
    storage: input.storage, note: EVIDENCE_USE_NOTE[rung.evidenceUse]});
}

/**
 * Whether a run's substrate puts its load generator on the product's host (the first look only).
 * @param {Object} run a run record
 * @return {boolean}
 */
function loadGeneratorSharesProductHost(run) {
  return run?.substrate?.kind === SUBSTRATE_KIND.SINGLE_HOST;
}

export {
  DECLARED_HOST_IDENTITY,
  EVIDENCE_USE,
  EVIDENCE_USE_NOTE,
  INTER_NODE_PATH,
  NODE_COUNT,
  SUBSTRATE_KIND,
  buildSubstrateDescriptor,
  datasetResetEventMethod,
  loadGeneratorSharesProductHost,
  validateEvidenceCustody,
  validateRoundTrip,
  validateStatementCatalog,
  validateSubstrate,
  validateTimeline,
};
