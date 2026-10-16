// Caller custody: the supplied storage adapter owns durable atomic revision CAS.
// This helper never claims a volatile adapter survives a process loss.
import {WASM_WRITER_PROFILE as P, WRITER_STATUS as S, WRITER_REASON as R,
  WRITER_ACTION as A, WRITER_ENCODING} from './wasm-writer-profile.js';
import {canonicalWriterCommand, writerCommandFromDelivery, writerDigest,
  writerIdentity, boundedJson, exactWriterPosition, writerError} from './wasm-writer-codec.js';

function validateTerminal(command, response) {
  const receipt = response?.receipt;
  if (response?.status !== S.RECORDED || receipt?.version !== P.version ||
      receipt.commandDigest !== writerDigest(command) ||
      JSON.stringify(receipt.identity) !== JSON.stringify(command.identity) ||
      typeof receipt.outcome?.accepted !== 'boolean' || response.accepted !== receipt.outcome.accepted) {
    throw writerError(R.RESPONSE);
  }
  exactWriterPosition(receipt.index, receipt.term);
  boundedJson(receipt, P.receiptBytes);
}

function validateCallerRecord(record) {
  if (!Number.isSafeInteger(record?.revision) || record.revision < 0 || !record.state) {
    throw writerError(R.STORAGE);
  }
  const state = structuredClone(record.state);
  const identity = writerIdentity({...state.token, sequence: 1});
  const token = {...identity};
  delete token.sequence;
  if (state.lastReceipt !== null) {
    const receipt = state.lastReceipt;
    const prior = writerIdentity(receipt?.identity);
    if (prior.serviceId !== token.serviceId || prior.incarnation !== token.incarnation ||
        prior.slot !== token.slot || prior.generation !== token.generation ||
        receipt.version !== P.version || typeof receipt.outcome?.accepted !== 'boolean') {
      throw writerError(R.STORAGE);
    }
    exactWriterPosition(receipt.index, receipt.term);
    boundedJson(receipt, P.receiptBytes);
  }
  const sequence = state.lastReceipt === null ? 1 : state.lastReceipt.identity.sequence + 1;
  if (state.pending !== null) {
    const pending = canonicalWriterCommand(state.pending);
    if (pending.action !== A.WRITE || JSON.stringify(pending.identity) !==
        JSON.stringify({...token, sequence}) || pending.ack !==
        (state.lastReceipt === null ? null : writerDigest(state.lastReceipt))) {
      throw writerError(R.STORAGE);
    }
    state.pending = pending;
  }
  return {revision: record.revision, state: {...state, token}, sequence};
}

class WasmWriterClient {
  constructor({storage, deliver}) {
    if (typeof storage?.load !== 'function' || typeof storage.compareAndSwap !== 'function' ||
        typeof deliver !== 'function') throw writerError(R.STORAGE);
    this.storage = storage;
    this.deliver = deliver;
    this.busy = false;
  }

  write(payload) {
    return this.owned(() => this.send(payload));
  }

  retry() {
    return this.owned(() => this.send(null));
  }

  owned(work) {
    if (this.busy) return Promise.resolve({status: S.REFUSED, reason: R.BUSY});
    this.busy = true;
    return Promise.resolve().then(work).catch((error) => ({
      status: S.UNKNOWN, reason: error.code ?? R.STORAGE,
    })).finally(() => {
      this.busy = false;
    });
  }

  async persist(revision, state) {
    // An ambiguous throw is UNKNOWN. Never compensate by deleting/resetting storage.
    const saved = await this.storage.compareAndSwap(revision, structuredClone(state));
    if (saved?.swapped !== true || !Number.isSafeInteger(saved.revision) ||
        saved.revision <= revision) throw writerError(R.STORAGE);
    return saved.revision;
  }

  async send(payload) {
    const loaded = validateCallerRecord(await this.storage.load());
    let {revision} = loaded;
    const {state, sequence} = loaded;
    if (payload !== null) {
      if (state.pending !== null) return {status: S.REFUSED, reason: R.BUSY};
      state.pending = writerCommandFromDelivery({operation: 'write', ...payload,
        requestId: {...state.token, sequence},
        ack: state.lastReceipt === null ? null : writerDigest(state.lastReceipt)});
      revision = await this.persist(revision, state);
    }
    if (state.pending === null) return {status: S.REFUSED, reason: R.SEQUENCE};
    const command = state.pending;
    // Deliver a detached value; caller/transport mutation cannot alter retained bytes.
    const response = await this.deliver({operation: 'write', requestId: {...command.identity},
      ack: command.ack, sessionId: command.sessionId, key: command.key,
      value: Buffer.from(command.value, WRITER_ENCODING)});
    if (response?.status !== S.RECORDED) return response;
    validateTerminal(command, response);
    state.lastReceipt = structuredClone(response.receipt);
    state.pending = null;
    await this.persist(revision, state);
    return response;
  }
}

export {WasmWriterClient};
