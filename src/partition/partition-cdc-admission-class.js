// The CDC admission class of a committed partition write (dead-recipient
// measure 1, owner ruling 2026-11-11): one closed, typed class that decides
// how much of the durable CDC ledger the write may use. ORDINARY writes are
// admitted below OWED_MAX_EVENTS; a RECIPIENT_RETIREMENT write - the write
// that records a recipient's retirement, the evidence the source lane needs to
// detach it (DETACHED{lifecycle}) - may also use the reserve of
// OWED_RETIREMENT_RESERVE_EVENTS above it, so the cap never refuses the very
// write that relieves it.
//
// Who sets it, and how it travels (one form per boundary, no inference):
// - In process the class is an INTENT: the frozen token
//   RECIPIENT_RETIREMENT_WRITE under CDC_ADMISSION_INTENT_FIELD of a write's
//   options. Only the owner of a lifecycle transition that retires or removes
//   a node, a message-group replica or a message group passes it; it is never
//   derived from a table name, SQL text or a caller-supplied string. A token
//   has identity, so no JSON client request can carry it.
// - At the partition boundary (the partition QUERY request, the local-leader
//   leg and the committed write entry) it is the wire value
//   CDC_ADMISSION_CLASS_FIELD = RECIPIENT_RETIREMENT. The one conversion is
//   cdcAdmissionClassOfIntent; the one decode of a committed command is
//   committedCdcAdmissionClassOf (partition-cdc-owed-admission.js). A leaf: the
//   engine, the CDC service, the gateway and the lifecycle owners import it.
// - A client statement, or any non-token value, is refused typed
//   (CDC_ADMISSION_CLASS_ERROR.REFUSED) at the engine entry and again at the
//   partition.
//
// The committed form: a committed SQL write entry carries the field only for
// RECIPIENT_RETIREMENT; its absence is ORDINARY. That is the format's
// definition, not a fallback: every write before this field existed was
// ordinary, so an entry written by an earlier build decodes to exactly what it
// was, on every replica, with one decoder. Participant transaction commands
// (PREPARE / DECISION / ORIGIN) carry no class: a lifecycle write is one
// single-partition statement (DIRECT_AUTOCOMMIT), never a participant
// transaction, and a write that would become one is refused typed instead of
// losing its class (NOT_DIRECT_WRITE).
const PARTITION_CDC_ADMISSION_CLASS = Object.freeze({
  ORDINARY: 'ordinary',
  RECIPIENT_RETIREMENT: 'recipient_retirement',
});

// The in-process option a lifecycle owner sets (value: the token below).
const CDC_ADMISSION_INTENT_FIELD = 'cdcAdmissionIntent';
// The partition-boundary field: request, partition options, committed entry.
const CDC_ADMISSION_CLASS_FIELD = 'cdcAdmissionClass';

/** The one in-process intent of a recipient-retirement write. */
const RECIPIENT_RETIREMENT_WRITE = Object.freeze({
  admissionClass: PARTITION_CDC_ADMISSION_CLASS.RECIPIENT_RETIREMENT,
});

/**
 * The write-option fragment a lifecycle owner spreads into a retirement
 * write's options (the only way the intent is set).
 */
const RECIPIENT_RETIREMENT_WRITE_OPTIONS = Object.freeze({
  [CDC_ADMISSION_INTENT_FIELD]: RECIPIENT_RETIREMENT_WRITE,
});

const CDC_ADMISSION_CLASS_ERROR = Object.freeze({
  REFUSED: 'cdc_admission_class_refused',
});

// Why a carried class was refused.
const CDC_ADMISSION_CLASS_REFUSAL_REASON = Object.freeze({
  CLIENT_INGRESS: 'client_ingress',
  NOT_OWNER_INTENT: 'not_owner_intent',
  INVALID_VALUE: 'invalid_value',
  NOT_DIRECT_WRITE: 'not_direct_write',
});

const CDC_ADMISSION_CLASS_MESSAGE = Object.freeze({
  REFUSED: 'The CDC admission class of a write is set only by a lifecycle owner ' +
    'in process; this write carried one it may not, and nothing executed',
});

const CLASSIFIED = Object.freeze({
  [PARTITION_CDC_ADMISSION_CLASS.ORDINARY]: Object.freeze({
    admissionClass: PARTITION_CDC_ADMISSION_CLASS.ORDINARY}),
  [PARTITION_CDC_ADMISSION_CLASS.RECIPIENT_RETIREMENT]: Object.freeze({
    admissionClass: PARTITION_CDC_ADMISSION_CLASS.RECIPIENT_RETIREMENT}),
});

function refusedClass(reason) {
  return Object.freeze({admissionClass: null, refusal: Object.freeze({
    success: false, error: CDC_ADMISSION_CLASS_MESSAGE.REFUSED,
    errorCode: CDC_ADMISSION_CLASS_ERROR.REFUSED, reasonCode: reason})});
}

/**
 * The class an in-process write's options declare: ORDINARY when they carry
 * no intent and no class field; RECIPIENT_RETIREMENT only for the owner's
 * token; a refusal for anything else (a raw class string, a forged intent, or
 * a client statement carrying either).
 * @param {Object} options - The write's in-process options.
 * @param {Object} [context] - {client: true} when the statement entered
 *   through a client contract.
 * @return {Object} Frozen {admissionClass} or {admissionClass: null, refusal}.
 */
function cdcAdmissionClassOfIntent(options, {client = false} = {}) {
  const intent = options?.[CDC_ADMISSION_INTENT_FIELD];
  const raw = options?.[CDC_ADMISSION_CLASS_FIELD];
  if (intent === undefined && raw === undefined) {
    return CLASSIFIED[PARTITION_CDC_ADMISSION_CLASS.ORDINARY];
  }
  if (client) return refusedClass(CDC_ADMISSION_CLASS_REFUSAL_REASON.CLIENT_INGRESS);
  if (raw !== undefined || intent !== RECIPIENT_RETIREMENT_WRITE) {
    return refusedClass(CDC_ADMISSION_CLASS_REFUSAL_REASON.NOT_OWNER_INTENT);
  }
  return CLASSIFIED[PARTITION_CDC_ADMISSION_CLASS.RECIPIENT_RETIREMENT];
}

/**
 * The partition-boundary fields of a declared class: the wire field for
 * RECIPIENT_RETIREMENT, nothing for ORDINARY (its definition is absence).
 * @param {string} admissionClass - A PARTITION_CDC_ADMISSION_CLASS value.
 * @return {Object} Fields to spread into a request or partition options.
 */
function cdcAdmissionClassFieldsOf(admissionClass) {
  return admissionClass === PARTITION_CDC_ADMISSION_CLASS.RECIPIENT_RETIREMENT ?
    {[CDC_ADMISSION_CLASS_FIELD]: admissionClass} : {};
}

/**
 * The partition's refusal of a class a request carries: null when it carries
 * none or a valid one from an in-process owner statement; else the typed
 * refusal.
 * @param {Object} options - The partition write options (request fields).
 * @param {boolean} client - The statement's ingress is CLIENT.
 * @return {Object|null} The refusal answer, or null.
 */
function partitionCdcAdmissionClassRefusal(options, client) {
  const carried = options?.[CDC_ADMISSION_CLASS_FIELD];
  if (carried === undefined || carried === null) return null;
  if (client) return refusedClass(CDC_ADMISSION_CLASS_REFUSAL_REASON.CLIENT_INGRESS).refusal;
  return carried === PARTITION_CDC_ADMISSION_CLASS.RECIPIENT_RETIREMENT ? null :
    refusedClass(CDC_ADMISSION_CLASS_REFUSAL_REASON.INVALID_VALUE).refusal;
}

/**
 * The refusal of a classified write whose plan would not reach its partition
 * as one committed write entry (a participant transaction carries no class).
 * @return {Object} The typed refusal.
 */
function cdcAdmissionClassNotDirectRefusal() {
  return refusedClass(CDC_ADMISSION_CLASS_REFUSAL_REASON.NOT_DIRECT_WRITE).refusal;
}

export {
  CDC_ADMISSION_CLASS_ERROR,
  CDC_ADMISSION_CLASS_FIELD,
  CDC_ADMISSION_CLASS_REFUSAL_REASON,
  CDC_ADMISSION_INTENT_FIELD,
  PARTITION_CDC_ADMISSION_CLASS,
  RECIPIENT_RETIREMENT_WRITE,
  RECIPIENT_RETIREMENT_WRITE_OPTIONS,
  cdcAdmissionClassFieldsOf,
  cdcAdmissionClassNotDirectRefusal,
  cdcAdmissionClassOfIntent,
  partitionCdcAdmissionClassRefusal,
};
