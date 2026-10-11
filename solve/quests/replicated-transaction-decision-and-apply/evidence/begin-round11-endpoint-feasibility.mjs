import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import Database from 'better-sqlite3';
import {
  installTransactionSchemaEnforcement,
  readTransactionSchemaEnforcement,
} from '../../../../src/query/distributed/distributed-transaction-schema-enforcement.js';

const root = new URL('../', import.meta.url);
const outputPath = fileURLToPath(new URL(
  './begin-round11-endpoint-feasibility.json', import.meta.url));
const subjectPath = fileURLToPath(new URL(
  './design-query-begin-uncertain-insert-resolution-2026-10-11.md', root));
const predecessorPath = fileURLToPath(new URL(
  './evidence/design-query-begin-uncertain-insert-resolution-round10-df779a90.md',
  root));
const reviewPath = '/mnt/data/peter/projects/.worktrees/rs-raft-candidate-20261011/' +
  'test-output/continuation-20261011/' +
  'review-begin-uncertain-design-round10-independent.md';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function fileSha256(path) {
  return sha256(readFileSync(path));
}

const MAX = Number.MAX_SAFE_INTEGER;
const TX = 'a'.repeat(32);
const ATTEMPT = 'b'.repeat(64);
const SCAN = 'c'.repeat(32);
const CREDIT = 'd'.repeat(32);

const creditRequest = {
  contract_version: 1,
  scan_id: SCAN,
  classification_role: 'SERVER_RECONCILIATION',
  transaction_id: TX,
  attempt_key: ATTEMPT,
  attempt_row_bytes: MAX,
  phase: 'IMMUTABLE_PAGE',
  page_offset: MAX,
  page_bytes: 4096,
  origin_resource_generation: MAX,
  original_deadline_at_ms: MAX,
  turn_started_at_ms: MAX - 1,
  turn_deadline_at_ms: MAX,
};

const grant = {
  contract_version: 1,
  scan_id: SCAN,
  classification_role: 'SERVER_RECONCILIATION',
  transaction_id: TX,
  attempt_key: ATTEMPT,
  phase: 'IMMUTABLE_PAGE',
  page_offset: MAX,
  page_bytes: 4096,
  origin_resource_generation: MAX,
  credit_id: CREDIT,
  target_resource_generation: MAX,
  grant_sequence: MAX,
  grant_expires_at_ms: MAX,
};

const classificationRequest = {...creditRequest, ...grant};
const pageResult = {
  contract_version: 1,
  scan_id: SCAN,
  credit_id: CREDIT,
  classification_role: 'SERVER_RECONCILIATION',
  transaction_id: TX,
  attempt_key: ATTEMPT,
  identity_state: 'KEY_MATCH',
  initial_match: 0,
  transaction_epoch: MAX,
  timeout_deadline: MAX,
  transaction_mode: 'AUTOCOMMIT',
  created_at: MAX,
  session_octets: MAX,
  phase: 'IMMUTABLE_PAGE',
  page_offset: MAX,
  page_bytes: 4096,
  session_page_hex: 'ff'.repeat(4096),
  origin_resource_generation: MAX,
  target_resource_generation: MAX,
  grant_sequence: MAX,
};
const outerLeaderWitness = {
  state: 'OBSERVED',
  partitionId: 'sql_transactions-p0',
  servingNodeId: 'node-' + 'x'.repeat(64),
  servingReplicaId: 'replica-' + 'y'.repeat(64),
  term: MAX,
  role: 'LEADER',
  observedAtMs: MAX,
};
const ack = {type: 'ACK', messageId: 'e'.repeat(32), acknowledged: true};
const pressure = {
  contract_version: 1,
  scan_id: SCAN,
  transaction_id: TX,
  attempt_key: ATTEMPT,
  outcome: 'TRANSACTION_CREATION_TARGET_PRESSURE',
  retryable: true,
};
const expired = {
  contract_version: 1,
  scan_id: SCAN,
  credit_id: CREDIT,
  transaction_id: TX,
  attempt_key: ATTEMPT,
  outcome: 'GRANT_EXPIRED',
  retryable: true,
};

function jsonBytes(value) {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function serviceMessage(payload) {
  return {
    type: 'SERVICE_MESSAGE',
    messageId: 'f'.repeat(32),
    sourceAddress: 'source-address',
    sourceNodeId: 'source-node',
    targetAddress: 'target-address',
    timestamp: MAX,
    payload,
  };
}

function serviceResponse(result) {
  return {
    type: 'SERVICE_RESPONSE',
    messageId: 'f'.repeat(32),
    sourceAddress: 'source-address',
    result,
    readAuthorityWitness: outerLeaderWitness,
  };
}

const tupleBytes = {
  creditRequest: jsonBytes(creditRequest),
  creditRequestWire: jsonBytes(serviceMessage(creditRequest)),
  grant: jsonBytes(grant),
  grantWire: jsonBytes(serviceResponse(grant)),
  classificationRequest: jsonBytes(classificationRequest),
  classificationRequestWire: jsonBytes(serviceMessage(classificationRequest)),
  pageResult: jsonBytes(pageResult),
  pageResultWire: jsonBytes(serviceResponse(pageResult)),
  ack: jsonBytes(ack),
  pressure: jsonBytes(pressure),
  pressureWire: jsonBytes(serviceResponse(pressure)),
  expired: jsonBytes(expired),
  expiredWire: jsonBytes(serviceResponse(expired)),
};

const connectionFrameBytes =
  tupleBytes.ack * 2 +
  Math.max(tupleBytes.grantWire, tupleBytes.pressureWire) +
  Math.max(tupleBytes.pageResultWire, tupleBytes.expiredWire);

const deadlines = [
  {
    role: 'FOREGROUND_CREATION', now: 4000, originalDeadline: 5000,
    turnBudget: 2000, turnDeadline: 5000, mutationAdmission: true,
    activePublication: true,
  },
  {
    role: 'FOREGROUND_CREATION', now: 6000, originalDeadline: 5000,
    turnBudget: 1000, turnDeadline: 5000, mutationAdmission: false,
    activePublication: false,
  },
  {
    role: 'SERVER_RECONCILIATION', now: 6000, originalDeadline: 5000,
    turnBudget: 1000, turnDeadline: 7000, mutationAdmission: false,
    activePublication: false,
  },
];

const endpointSchedules = {
  fourOrigins: {
    targetNativeLanes: 1,
    capableConnections: 4,
    frameSlotsPerConnection: 4,
    originA: ['credit_ack', 'grant_outcome', 'native_lane'],
    originsBCD: ['credit_ack', 'pressure_outcome'],
    unchargedFrames: 0,
  },
  classifierBeforeGrantCallback: {
    simultaneouslyCharged: [
      'credit_ack', 'grant_outcome', 'classifier_ack',
      'classifier_result', 'native_lane',
    ],
    distinctFrameSlots: 4,
    unchargedFrames: 0,
  },
  expiryWithRetainedGrantFrame: {
    semanticExpiryReleases: ['native_lane'],
    semanticExpiryRetains: [
      'grant_outcome_until_send_callback_error_or_close',
      'compact_retired_credit_binding',
    ],
    doubleReleaseAllowed: false,
  },
  lateClassifierAfterExpiry: {
    chargedBy: ['per_connection_parse_scratch', 'classifier_ack',
      'classifier_outcome'],
    nativeCalls: 0,
    outcome: 'GRANT_EXPIRED',
  },
};

const db = new Database(':memory:');
db.exec(`CREATE TABLE sql_transactions(
  transaction_id TEXT PRIMARY KEY, session_id TEXT NOT NULL,
  status TEXT NOT NULL, transaction_epoch INTEGER, timeout_deadline INTEGER,
  transaction_mode TEXT NOT NULL, participant_set_state TEXT NOT NULL,
  participant_set_text TEXT, commit_mode TEXT NOT NULL,
  frozen_participant_count INTEGER NOT NULL, decision TEXT,
  decision_text TEXT, decision_digest TEXT, created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL)`);
const virgin = readTransactionSchemaEnforcement(db);
const v2 = installTransactionSchemaEnforcement(db);
const v2Trigger = db.prepare(`SELECT sql FROM sqlite_schema
  WHERE type='trigger' AND tbl_name='sql_transactions'`).get().sql;
const v3Trigger = v2Trigger.replace(
  'length(NEW.session_id) > 0', 'octet_length(NEW.session_id) > 0');
const v3Digest = sha256(v3Trigger);
db.close();

const schemaStates = [
  {
    originPresent: false, rowCount: 0, trigger: 'MISSING',
    outcome: 'INSTALL_REQUIRED_V3', next: 'INSTALL_V3_IN_ORIGIN_APPLY',
  },
  {
    originPresent: false, rowCount: 0, trigger: 'EXACT_V2',
    outcome: 'UPGRADE_REQUIRED_V2_TO_V3', next: 'REPLACE_IN_ORIGIN_APPLY',
  },
  {
    originPresent: false, rowCount: 1, trigger: 'MISSING',
    outcome: 'INCOMPATIBLE_RETAINED_LEGACY', next: 'NONE',
  },
  {
    originPresent: true, rowCount: 0, trigger: 'EXACT_V3',
    outcome: 'ENFORCED_V3', next: 'NONE',
  },
  {
    originPresent: true, rowCount: 0, trigger: 'MISSING_OR_V2_OR_FOREIGN',
    outcome: 'INCOMPATIBLE', next: 'NONE',
  },
];

const versionDatabase = new Database(':memory:');
const sqliteVersion = versionDatabase.prepare(
  'SELECT sqlite_version() AS version').get().version;
versionDatabase.close();

const output = {
  scope: 'Design and native/schema feasibility only; no production source, test, ' +
    'metadata, Quest log, transport or schema mutation.',
  provenance: {
    subjectSha256: fileSha256(subjectPath),
    predecessorSha256: fileSha256(predecessorPath),
    reviewSha256: fileSha256(reviewPath),
    sqliteVersion,
  },
  tupleFields: {
    creditRequest: Object.keys(creditRequest),
    grant: Object.keys(grant),
    classificationRequest: Object.keys(classificationRequest),
    pageResult: Object.keys(pageResult),
    outerLeaderWitness: Object.keys(outerLeaderWitness),
  },
  tupleBytes,
  wrapperBound: {
    kind: 'exact_current_connection_generation_measurement',
    sourceNodeId: 'source-node',
    sourceAddress: 'source-address',
    targetAddress: 'target-address',
    note: 'Payload fields have fixed maxima. Wrapper identity/address bytes are ' +
      'measured from the exact immutable connection generation before its ' +
      'private capability is enabled; no peer-ID length cap is inferred.',
  },
  connectionFrameBytes,
  deadlines,
  endpointSchedules,
  generationDomains: {
    origin_resource_generation: 'origin_node_local',
    target_resource_generation: 'target_node_local',
    connection_delivery_generation: 'target_router_connection_local_outer_fact',
    crossDomainNumericEqualityRequired: false,
  },
  schema: {
    actualVirginV2OwnerState: virgin,
    actualInstalledV2OwnerState: v2,
    exactV2TriggerSha256: sha256(v2Trigger),
    proposedV3TriggerSha256: v3Digest,
    proposedV3UsesOctetLength: v3Trigger.includes(
      'octet_length(NEW.session_id) > 0'),
    states: schemaStates,
  },
};

writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
