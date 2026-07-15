import {canonicalizeOciHostAgentJson} from './oci-host-agent-json.js';
import {validateOciHostAgentIdentity, validateOciHostAgentResult} from
  './oci-host-agent-schema.js';
import {
  OCI_HOST_AGENT_DURABLE_ERROR,
  durableStateError,
} from './oci-host-agent-durable-errors.js';
import {exactKeys, safeInteger} from './oci-host-agent-durable-files.js';

const HARD_MAXIMUM = Object.freeze({
  dispatched: 32,
  queued: 64,
  queuedPerNode: 16,
  queuedPerResource: 8,
});
const DEFAULTS = Object.freeze({
  maximumDispatched: HARD_MAXIMUM.dispatched,
  maximumQueued: HARD_MAXIMUM.queued,
  maximumQueuedPerNode: HARD_MAXIMUM.queuedPerNode,
  maximumQueuedPerResource: HARD_MAXIMUM.queuedPerResource,
  unresolvedFences: Object.freeze([]),
});
const OPTION_FIELDS = Object.freeze([
  'maximumDispatched',
  'maximumQueued',
  'maximumQueuedPerNode',
  'maximumQueuedPerResource',
  'unresolvedFences',
]);
const CANDIDATE_FIELDS = Object.freeze([
  'operationId',
  'intentDigest',
  'operation',
  'identity',
  'deadlineAtMs',
]);
const RECEIPT_FIELDS = Object.freeze([
  'operationId',
  'intentDigest',
  'operation',
  'identity',
  'state',
  'generation',
  'result',
]);
const OPERATIONS = new Set(['pull', 'create', 'start', 'inspect', 'stop', 'remove']);
const OPERATION_ID_PATTERN = /^oci-v1:[0-9a-f]{64}$/u;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const ADMISSION_STATUS = Object.freeze({
  ACTIVE: 'active',
  AMBIGUOUS: 'ambiguous',
  DISPATCH: 'dispatch',
  QUEUED: 'queued',
  REJECTED: 'rejected',
  RETRYABLE_FAILURE: 'retryable_failure',
  TERMINAL: 'terminal',
});
const ADMISSION_ERROR_CODE = Object.freeze({
  AGENT_BUSY: 'agent_busy',
  DEADLINE_BEFORE_DISPATCH: 'deadline_before_dispatch',
  INTENT_CONFLICT: 'intent_conflict',
  OPERATION_IN_PROGRESS: 'operation_in_progress',
  QUEUE_DEADLINE_EXPIRED: 'queue_deadline_expired',
  RESOURCE_FENCED: 'resource_fenced',
});
const UNRESOLVED_FENCE_STATE = 'mutation_unresolved';
const ADMISSION_DECISION = Object.freeze({
  DEADLINE_EXPIRED: 'deadline_expired',
  DISPATCH: 'dispatch',
  EXISTING_CONFLICT: 'existing_conflict',
  EXISTING_IN_PROGRESS: 'existing_in_progress',
  EXISTING_TERMINAL: 'existing_terminal',
  FENCED: 'fenced',
  QUEUE: 'queue',
});

function invalidConfiguration() {
  durableStateError(OCI_HOST_AGENT_DURABLE_ERROR.ADMISSION_CONFIGURATION_INVALID);
}

function invalidSettlement() {
  durableStateError(OCI_HOST_AGENT_DURABLE_ERROR.ADMISSION_SETTLEMENT_INVALID);
}

function clone(value) {
  return structuredClone(value);
}

function sameValue(left, right) {
  return canonicalizeOciHostAgentJson(left) ===
    canonicalizeOciHostAgentJson(right);
}

function resourceKey(identity) {
  return canonicalizeOciHostAgentJson(identity);
}

function nodeKey(identity) {
  return `${identity.clusterIncarnation}\n${identity.nodeId}`;
}

function validateIdentity(identity) {
  try {
    validateOciHostAgentIdentity(identity);
  } catch {
    invalidConfiguration();
  }
}

function validateOptions(rawOptions) {
  if (rawOptions !== undefined && !exactKeys(rawOptions, [], OPTION_FIELDS)) {
    invalidConfiguration();
  }
  const options = {...DEFAULTS, ...rawOptions};
  const limits = [
    [options.maximumDispatched, HARD_MAXIMUM.dispatched],
    [options.maximumQueued, HARD_MAXIMUM.queued],
    [options.maximumQueuedPerNode, HARD_MAXIMUM.queuedPerNode],
    [options.maximumQueuedPerResource, HARD_MAXIMUM.queuedPerResource],
  ];
  if (limits.some(([value, maximum]) =>
    !safeInteger(value, 1) || value > maximum) ||
      !Array.isArray(options.unresolvedFences)) {
    invalidConfiguration();
  }
  const fencedResources = new Set();
  for (const fence of options.unresolvedFences) {
    if (!fence || typeof fence !== 'object' || Array.isArray(fence)) {
      invalidConfiguration();
    }
    validateIdentity(fence.identity);
    fencedResources.add(resourceKey(fence.identity));
  }
  return {...options, fencedResources};
}

function validateCandidate(candidate) {
  if (!exactKeys(candidate, CANDIDATE_FIELDS) ||
      !OPERATION_ID_PATTERN.test(candidate.operationId) ||
      !DIGEST_PATTERN.test(candidate.intentDigest) ||
      !OPERATIONS.has(candidate.operation) ||
      !safeInteger(candidate.deadlineAtMs, 1)) invalidConfiguration();
  validateIdentity(candidate.identity);
  return clone(candidate);
}

function validateNow(nowMs) {
  if (!safeInteger(nowMs)) invalidConfiguration();
  return nowMs;
}

function candidateMatches(left, right) {
  return left.operationId === right.operationId &&
    left.intentDigest === right.intentDigest &&
    left.operation === right.operation &&
    sameValue(left.identity, right.identity);
}

function terminalReceiptMatches(receipt, candidate) {
  if (!exactKeys(receipt, RECEIPT_FIELDS) ||
      receipt.state !== ADMISSION_STATUS.TERMINAL ||
      !safeInteger(receipt.generation, 1) ||
      !candidateMatches(receipt, candidate)) return false;
  try {
    validateOciHostAgentResult(receipt.result, receipt.operationId);
  } catch {
    return false;
  }
  return receipt.result.operation === candidate.operation &&
    receipt.result.intentDigest === candidate.intentDigest &&
    sameValue(receipt.result.identity, candidate.identity);
}

function retryable(errorCode) {
  return {status: ADMISSION_STATUS.RETRYABLE_FAILURE, errorCode};
}

function admissionDecision(candidate, nowMs, existing, fenced, dispatchable) {
  if (existing && !candidateMatches(existing.candidate, candidate)) {
    return ADMISSION_DECISION.EXISTING_CONFLICT;
  } else if (existing?.status === ADMISSION_STATUS.TERMINAL) {
    return ADMISSION_DECISION.EXISTING_TERMINAL;
  } else if (existing) {
    return ADMISSION_DECISION.EXISTING_IN_PROGRESS;
  } else if (candidate.deadlineAtMs <= nowMs) {
    return ADMISSION_DECISION.DEADLINE_EXPIRED;
  } else if (fenced) {
    return ADMISSION_DECISION.FENCED;
  } else if (dispatchable) {
    return ADMISSION_DECISION.DISPATCH;
  }
  return ADMISSION_DECISION.QUEUE;
}

class OciHostAgentAdmissionTable {
  #activeResources = new Map();
  #fencedResources;
  #leases = new Map();
  #operations = new Map();
  #options;
  #queue = [];

  constructor(options) {
    this.#options = options;
    this.#fencedResources = options.fencedResources;
  }

  #dispatch(candidate) {
    const entry = {candidate, resource: resourceKey(candidate.identity)};
    const lease = Symbol(candidate.operationId);
    entry.lease = lease;
    entry.status = ADMISSION_STATUS.ACTIVE;
    this.#activeResources.set(entry.resource, entry);
    this.#leases.set(lease, entry);
    this.#operations.set(candidate.operationId, entry);
    return {status: ADMISSION_STATUS.DISPATCH, lease, candidate: clone(candidate)};
  }

  #queueCounts(candidate) {
    const resource = resourceKey(candidate.identity);
    const node = nodeKey(candidate.identity);
    return {
      node: this.#queue.filter((entry) =>
        nodeKey(entry.candidate.identity) === node).length,
      resource: this.#queue.filter((entry) => entry.resource === resource).length,
    };
  }

  #enqueue(candidate) {
    const counts = this.#queueCounts(candidate);
    if (this.#queue.length >= this.#options.maximumQueued ||
        counts.node >= this.#options.maximumQueuedPerNode ||
        counts.resource >= this.#options.maximumQueuedPerResource) {
      return retryable(ADMISSION_ERROR_CODE.AGENT_BUSY);
    }
    const ticket = Symbol(candidate.operationId);
    const entry = {
      candidate,
      resource: resourceKey(candidate.identity),
      status: ADMISSION_STATUS.QUEUED,
      ticket,
    };
    this.#queue.push(entry);
    this.#operations.set(candidate.operationId, entry);
    return {status: ADMISSION_STATUS.QUEUED, ticket};
  }

  admit(rawCandidate, rawNowMs) {
    const candidate = validateCandidate(rawCandidate);
    const nowMs = validateNow(rawNowMs);
    const existing = this.#operations.get(candidate.operationId);
    const resource = resourceKey(candidate.identity);
    const decision = admissionDecision(
      candidate,
      nowMs,
      existing,
      this.#fencedResources.has(resource),
      this.#leases.size < this.#options.maximumDispatched &&
        !this.#activeResources.has(resource),
    );
    switch (decision) {
    case ADMISSION_DECISION.EXISTING_CONFLICT:
      return {
        status: ADMISSION_STATUS.REJECTED,
        errorCode: ADMISSION_ERROR_CODE.INTENT_CONFLICT,
      };
    case ADMISSION_DECISION.EXISTING_TERMINAL:
      return {
        status: ADMISSION_STATUS.TERMINAL,
        receipt: clone(existing.receipt),
      };
    case ADMISSION_DECISION.EXISTING_IN_PROGRESS:
      return retryable(ADMISSION_ERROR_CODE.OPERATION_IN_PROGRESS);
    case ADMISSION_DECISION.DEADLINE_EXPIRED:
      return retryable(ADMISSION_ERROR_CODE.DEADLINE_BEFORE_DISPATCH);
    case ADMISSION_DECISION.FENCED:
      return {
        status: ADMISSION_STATUS.AMBIGUOUS,
        errorCode: ADMISSION_ERROR_CODE.RESOURCE_FENCED,
        fenceState: UNRESOLVED_FENCE_STATE,
      };
    case ADMISSION_DECISION.DISPATCH:
      return this.#dispatch(candidate);
    case ADMISSION_DECISION.QUEUE:
      return this.#enqueue(candidate);
    default:
      invalidConfiguration();
    }
  }

  drain(rawNowMs) {
    const nowMs = validateNow(rawNowMs);
    const expired = [];
    const retained = [];
    for (const entry of this.#queue) {
      if (entry.candidate.deadlineAtMs <= nowMs) {
        this.#operations.delete(entry.candidate.operationId);
        expired.push({
          ticket: entry.ticket,
          candidate: clone(entry.candidate),
          outcome: retryable(ADMISSION_ERROR_CODE.QUEUE_DEADLINE_EXPIRED),
        });
      } else {
        retained.push(entry);
      }
    }
    this.#queue = retained;
    const dispatchable = [];
    while (this.#leases.size < this.#options.maximumDispatched) {
      const index = this.#queue.findIndex(
        (entry) => !this.#activeResources.has(entry.resource),
      );
      if (index < 0) break;
      const [entry] = this.#queue.splice(index, 1);
      this.#operations.delete(entry.candidate.operationId);
      dispatchable.push(this.#dispatch(entry.candidate));
    }
    return {expired, ready: dispatchable};
  }

  settle(lease, rawReceipt, rawNowMs) {
    const entry = this.#leases.get(lease);
    if (!entry || !terminalReceiptMatches(rawReceipt, entry.candidate)) {
      invalidSettlement();
    }
    const receipt = clone(rawReceipt);
    this.#leases.delete(lease);
    this.#activeResources.delete(entry.resource);
    this.#operations.set(entry.candidate.operationId, {
      candidate: entry.candidate,
      receipt,
      status: ADMISSION_STATUS.TERMINAL,
    });
    return this.drain(rawNowMs);
  }
}

function createOciHostAgentAdmissionTable(rawOptions) {
  return new OciHostAgentAdmissionTable(validateOptions(rawOptions));
}

export {
  createOciHostAgentAdmissionTable,
};
