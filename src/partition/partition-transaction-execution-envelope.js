// The execution compatibility envelope of the participant's transaction
// commands (TX1 design revision 10, sections 2.3 step 0 and 3.3; decision
// AU): the leader stamps PARTICIPANT_PREPARE and PARTICIPANT_DECISION with its
// own build ({sqliteVersion, sqliteSourceId, compileOptionsDigest,
// classifierListVersion}); every replica applies a committed command exactly
// as carried, whatever its envelope, and records a mismatch with its own
// build as a typed diagnostic - a log message and a counter - never a
// refusal or a host failure. The apply side never classifies, so a
// classifier-list difference cannot change a committed command's
// disposition; the residual risk (a SQLite semantic difference between
// builds) is limit L10, and the release owner's drain and admission pause
// cover envelope-changing releases. The diagnostic is volatile evidence of
// this replica's process.
import {createHash} from 'node:crypto';
import {
  PARTICIPANT_TRANSACTION_BYTES as BYTES,
  PARTICIPANT_TRANSACTION_LOG_MSG as LOG_MSG,
} from './partition-participant-transaction-constants.js';
import {
  TRANSACTION_CLASSIFIER_LIST_VERSION,
  TRANSACTION_CLASSIFIER_SQL as SQL,
} from './partition-transaction-determinism-constants.js';

const ENVELOPE_FIELDS = Object.freeze(['sqliteVersion', 'sqliteSourceId',
  'compileOptionsDigest', 'classifierListVersion']);
const COMPILE_OPTION_SEPARATOR = '\n';
// Per connection: this build's envelope, read once.
const OWN_ENVELOPES = new WeakMap();
// Per partition service: {mismatchCount, lastMismatch}.
const DIAGNOSTICS = new WeakMap();
const NO_MISMATCH = Object.freeze({mismatchCount: 0, lastMismatch: null});

/**
 * This build's execution envelope, as the leader stamps it and a replica
 * compares a carried one with it: sqlite_version(), sqlite_source_id(), the
 * sha256 of PRAGMA compile_options joined by LF, and the classifier's list
 * version.
 * @param {Object} db - The partition's connection.
 * @return {Object} The frozen envelope.
 */
function executionEnvelopeOf(db) {
  let envelope = OWN_ENVELOPES.get(db);
  if (envelope === undefined) {
    const engine = db.prepare(SQL.ENGINE).get();
    const options = db.pragma(SQL.COMPILE_OPTIONS_PRAGMA)
      .map((row) => row[SQL.COMPILE_OPTIONS_PRAGMA]).join(COMPILE_OPTION_SEPARATOR);
    envelope = Object.freeze({
      sqliteVersion: engine.sqliteVersion,
      sqliteSourceId: engine.sqliteSourceId,
      compileOptionsDigest: createHash(BYTES.DIGEST_ALGORITHM).update(options)
        .digest(BYTES.DIGEST_ENCODING),
      classifierListVersion: TRANSACTION_CLASSIFIER_LIST_VERSION,
    });
    OWN_ENVELOPES.set(db, envelope);
  }
  return envelope;
}

/**
 * Whether a value is an execution envelope in the pinned form: an object
 * whose four fields are non-empty strings (the admission owner asks before a
 * PREPARE or decision is proposed).
 * @param {*} value - A command's executionEnvelope.
 * @return {boolean} Whether it is one.
 */
function isExecutionEnvelope(value) {
  return value !== null && typeof value === 'object' &&
    ENVELOPE_FIELDS.every((field) => typeof value[field] === 'string' &&
      value[field].length > 0);
}

function matchesOwn(carried, own) {
  return carried !== null && typeof carried === 'object' &&
    ENVELOPE_FIELDS.every((field) => carried[field] === own[field]);
}

/**
 * Compare a committed transaction command's carried envelope with this
 * replica's build, before it applies (design 2.3 step 0). A mismatch is
 * counted and logged once the command's application transaction commits;
 * the command applies as carried either way.
 * @param {Object} service - The partition.
 * @param {Object} committed - {command, index, afterCommit}.
 */
function noteExecutionEnvelope(service, {command, index, afterCommit}) {
  const own = executionEnvelopeOf(service.db);
  const carried = command.executionEnvelope ?? null;
  if (matchesOwn(carried, own)) {
    return;
  }
  afterCommit(() => {
    const lastMismatch = Object.freeze({commandType: command.type,
      carried, own, index});
    DIAGNOSTICS.set(service, Object.freeze({
      mismatchCount: (DIAGNOSTICS.get(service)?.mismatchCount ?? 0) + 1,
      lastMismatch}));
    service.logger.warn(LOG_MSG.TRANSACTION_ENVELOPE_MISMATCH, {
      partitionId: service.partitionId, commandType: command.type, index,
      carried, own});
  });
}

/**
 * The envelope diagnostics this replica recorded (design 3.3, W20): how many
 * applied transaction commands carried an envelope other than its own build,
 * and the last one.
 * @param {Object} service - The partition.
 * @return {{mismatchCount: number, lastMismatch: (Object|null)}} The
 *   diagnostics.
 */
function readTransactionEnvelopeDiagnostics(service) {
  return DIAGNOSTICS.get(service) ?? NO_MISMATCH;
}

// The partition service's read surface for the diagnostics (W20), mixed
// into the service by its assembly.
const TRANSACTION_ENVELOPE_SERVICE_METHODS = Object.freeze({
  readTransactionEnvelopeDiagnostics() {
    return readTransactionEnvelopeDiagnostics(this);
  },
});

export {
  TRANSACTION_ENVELOPE_SERVICE_METHODS,
  executionEnvelopeOf,
  isExecutionEnvelope,
  noteExecutionEnvelope,
};
