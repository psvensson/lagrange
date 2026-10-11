import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import Database from 'better-sqlite3';
import {
  buildInitialTransactionDeliveryKey,
  encodeInitialTransactionRow,
} from '../../../../src/query/distributed/distributed-transaction-creation-contract.js';

const evidencePath = fileURLToPath(new URL(
  './begin-round10-resource-domain-feasibility.json', import.meta.url));
const reviewPath = '/mnt/data/peter/projects/.worktrees/rs-raft-candidate-20261011/' +
  'test-output/continuation-20261011/begin-design-round9-independent/' +
  'independent-feasibility.json';
const subjectPath = fileURLToPath(new URL(
  '../design-query-begin-uncertain-insert-resolution-2026-10-11.md',
  import.meta.url));
const sourcePath = fileURLToPath(new URL(
  '../../../../src/query/distributed/distributed-transaction-creation-contract.js',
  import.meta.url));

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function initialRow(sessionId) {
  return {
    transaction_id: 'a'.repeat(32),
    session_id: sessionId,
    status: 'ACTIVE',
    transaction_epoch: 7,
    timeout_deadline: 1700000030000,
    transaction_mode: 'EXPLICIT',
    participant_set_state: 'OPEN',
    participant_set_text: '[]',
    commit_mode: 'NOT_SELECTED',
    frozen_participant_count: 0,
    updated_at: 1700000000000,
    decision: null,
    decision_text: null,
    decision_digest: null,
    created_at: 1700000000000,
  };
}

function deliveryKey(sessionId) {
  const row = initialRow(sessionId);
  return buildInitialTransactionDeliveryKey(
    row.transaction_id, encodeInitialTransactionRow(row));
}

const db = new Database(':memory:');
const scalarStatement = db.prepare(`SELECT
  typeof(?) AS storage_class,
  length(?) AS sqlite_text_length,
  octet_length(?) AS sqlite_octets,
  hex(CAST(? AS BLOB)) AS stored_hex`);

const scalarCases = [
  ['ordinary', 'ordinary-session'],
  ['bom-only', '\uFEFF'],
  ['leading-nul', '\u0000'],
  ['leading-nul-plus-a', '\u0000a'],
  ['embedded-nul', 'a\u0000b'],
  ['supplementary', '\u{1F4BE}'],
].map(([name, value]) => {
  const sqlite = scalarStatement.get(value, value, value, value);
  const bytes = Buffer.from(value, 'utf8');
  return {
    name,
    javascriptCodeUnits: value.length,
    utf8Bytes: bytes.length,
    utf8Hex: bytes.toString('hex'),
    sqlite,
    fatalOrdinary: new TextDecoder('utf-8', {fatal: true}).decode(bytes),
    fatalBomPreserving: new TextDecoder(
      'utf-8', {fatal: true, ignoreBOM: true}).decode(bytes),
    deliveryKey: deliveryKey(value),
  };
});
db.close();

const fixedRequest = {
  contract_version: 1,
  credit_id: 'c'.repeat(32),
  transaction_id: 'f'.repeat(32),
  attempt_key: 'e'.repeat(64),
  attempt_row_bytes: Number.MAX_SAFE_INTEGER,
  phase: 'IMMUTABLE_PAGE',
  page_offset: Number.MAX_SAFE_INTEGER,
  page_bytes: 4096,
  resource_generation: Number.MAX_SAFE_INTEGER,
  original_deadline_at_ms: Number.MAX_SAFE_INTEGER,
  turn_deadline_at_ms: Number.MAX_SAFE_INTEGER,
};
const fixedCreditRequest = {
  contract_version: 1,
  transaction_id: 'f'.repeat(32),
  attempt_key: 'e'.repeat(64),
  target_node_id: 'node-target',
  target_replica_id: 'replica-target',
  source_node_id: 'node-source',
  source_incarnation: 'd'.repeat(32),
  resource_generation: Number.MAX_SAFE_INTEGER,
  original_deadline_at_ms: Number.MAX_SAFE_INTEGER,
  turn_deadline_at_ms: Number.MAX_SAFE_INTEGER,
};
const fixedCreditGrant = {
  credit_id: 'c'.repeat(32),
  resource_generation: Number.MAX_SAFE_INTEGER,
  expires_at_ms: Number.MAX_SAFE_INTEGER,
  target_connection_generation: Number.MAX_SAFE_INTEGER,
};
const fixedPageResult = {
  transaction_id: 'f'.repeat(32),
  attempt_key: 'e'.repeat(64),
  identity_state: 'KEY_MATCH',
  initial_match: 0,
  session_octets: Number.MAX_SAFE_INTEGER,
  page_offset: Number.MAX_SAFE_INTEGER,
  session_page_hex: 'ff'.repeat(4096),
  resource_generation: Number.MAX_SAFE_INTEGER,
};

const previous = JSON.parse(readFileSync(reviewPath, 'utf8'));
const old = previous.upgrade;
const fixedIngress = 1;
const protectedCompletion = old.base;
const correctedRetainedCapacity = old.pool - fixedIngress - protectedCompletion;
const totalForTwo = fixedIngress + protectedCompletion + 2 * old.base;

const versionDatabase = new Database(':memory:');
const sqliteVersion = versionDatabase.prepare(
  'SELECT sqlite_version() AS version').get().version;
versionDatabase.close();

const result = {
  scope: 'Design feasibility only. No production source, test, metadata, Quest log, ' +
    'transport or schema mutation was performed.',
  provenance: {
    subjectSha256: sha256(subjectPath),
    creationContractSha256: sha256(sourcePath),
    round9IndependentInputSha256: sha256(reviewPath),
    sqliteVersion,
  },
  fixedEnvelope: {
    immutableSessionPageBytes: 4096,
    creditRequestJsonUtf8Bytes:
      Buffer.byteLength(JSON.stringify(fixedCreditRequest)),
    creditGrantJsonUtf8Bytes:
      Buffer.byteLength(JSON.stringify(fixedCreditGrant)),
    requestJsonUtf8Bytes: Buffer.byteLength(JSON.stringify(fixedRequest)),
    maximumPageResultJsonUtf8Bytes:
      Buffer.byteLength(JSON.stringify(fixedPageResult)),
    request: fixedRequest,
    resultFields: Object.keys(fixedPageResult),
    note: 'JSON sizes are shape witnesses. The design resource census must also ' +
      'pay frame, parsed record, native, send and callback roots.',
  },
  targetCreditModel: {
    creditRequestedBeforeClassificationSend: true,
    targetOwnsReceiveParseNativeAndResponseBeforeClassificationSend: true,
    creditIdentity: [
      'credit_id', 'contract_version', 'transaction_id', 'attempt_key',
      'phase', 'page_offset', 'resource_generation',
      'connection_delivery_generation',
    ],
    releaseEvents: [
      'grant_send_failure', 'unused_grant_expiry', 'classification_send_callback',
      'classification_send_error', 'connection_close', 'shutdown_generation_fence',
    ],
    nonReleaseEvents: ['transport_ack', 'origin_timeout', 'caller_disconnect'],
    ungrantedClassificationRequest: 'REFUSE_WITHOUT_NATIVE_WORK',
  },
  protectedCompletionSchedule: {
    oldCounterexample: old,
    illustrativeUnits: {
      total: old.pool,
      fixedIngress,
      protectedCompletion,
      retainedCapacity: correctedRetainedCapacity,
      recordBytes: old.base,
      recordsAdmitted: Math.floor(correctedRetainedCapacity / old.base),
      secondRecordRefusedBeforeRetention:
        correctedRetainedCapacity < old.base * 2,
      totalRequiredForTwoRecordsAndCompletion: totalForTwo,
      withThatTotalBothRecordsAndCompletionFit:
        totalForTwo >= fixedIngress + protectedCompletion + 2 * old.base,
    },
    note: 'Illustrative units reproduce the review schedule; implementation ' +
      'constants require the complete native/root census and checked arithmetic.',
  },
  scalarDomain: {
    cases: scalarCases,
    bomOnlyOrdinaryDecoderDropsData:
      scalarCases.find(({name}) => name === 'bom-only').fatalOrdinary === '',
    bomOnlyPreservingDecoderKeepsData:
      scalarCases.find(({name}) => name === 'bom-only').fatalBomPreserving === '\uFEFF',
    leadingNulSqliteLengthIsZero:
      scalarCases.find(({name}) => name === 'leading-nul').sqlite.sqlite_text_length === 0,
    leadingNulOctetLengthIsOne:
      scalarCases.find(({name}) => name === 'leading-nul').sqlite.sqlite_octets === 1,
  },
  preliminaryKeyAuthority: {
    keyMatchAlone: 'RETAIN_AND_READ_EXACT_IMMUTABLE_SIX',
    keyDifferentAlone: 'RETAIN_ORIGINAL_IDENTITY',
    keyDifferentPlusDefinitivePrimaryKeyCollision: 'CANONICAL_FOREIGN',
    malformedMissingUnavailableOrPressure: 'RETAIN_ORIGINAL_IDENTITY',
    forbiddenFromKeyAlone: [
      'ACTIVE', 'ADOPT', 'OVERWRITE', 'RELEASE_RECORD', 'REMINT',
      'COMMIT', 'ROLLBACK',
    ],
  },
};

writeFileSync(evidencePath, `${JSON.stringify(result, null, 2)}\n`);
