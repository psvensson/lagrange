// Fixed application records. All apply calls join the existing Raft SQLite transaction.
import {WASM_WRITER_PROFILE as P, WRITER_ACTION as A, WRITER_STATUS as S,
  WRITER_REASON as R, WRITER_ENCODING} from './wasm-writer-profile.js';
import {KV_TABLE_NAME} from './session-kv-store.js';
import {readWasmCreationRoot, WASM_CREATION_OPENING} from './wasm-service-creation-storage.js';
import {canonicalWriterCommand, writerDigest, boundedJson, exactWriterPosition,
  writerError} from './wasm-writer-codec.js';

const META = '_wasm_writer_meta';
const SLOTS = '_wasm_writer_slots';
const SQL = Object.freeze({
  TABLES: 'SELECT name FROM sqlite_schema WHERE type=\'table\' AND name NOT LIKE \'sqlite_%\'',
  CREATE: `CREATE TABLE ${META} (id INTEGER PRIMARY KEY CHECK(id=1), record TEXT NOT NULL);
    CREATE TABLE ${SLOTS} (slot INTEGER PRIMARY KEY, record TEXT NOT NULL);`,
  META: `SELECT record FROM ${META} WHERE id=1`,
  PUT_META: `INSERT OR REPLACE INTO ${META} (id,record) VALUES (1,?)`,
  SLOT: `SELECT record FROM ${SLOTS} WHERE slot=?`,
  ALL: `SELECT slot,record FROM ${SLOTS} ORDER BY slot`,
  PUT_SLOT: `INSERT OR REPLACE INTO ${SLOTS} (slot,record) VALUES (?,?)`,
});

function responseIdentity(command) {
  return command.identity ?? {serviceId: command.serviceId, incarnation: command.incarnation,
    action: command.action, nonce: command.nonce};
}

function refused(command, reason) {
  return {status: S.REFUSED, reason, identity: responseIdentity(command)};
}

function recorded(receipt) {
  return {status: S.RECORDED, accepted: receipt.outcome.accepted, async: false, receipt};
}

function requireFormat(condition) {
  if (!condition) throw writerError(R.FORMAT);
}

function validCounter(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function validateReceipt(command, receipt) {
  requireFormat(receipt?.version === P.version && receipt.commandDigest === writerDigest(command));
  exactWriterPosition(receipt.index, receipt.term);
  boundedJson(receipt, P.receiptBytes);
  requireFormat(typeof receipt.outcome?.accepted === 'boolean');
}

function validateSlot(row, slot, meta) {
  requireFormat(row.slot === slot && validCounter(row.generation) && validCounter(row.completed));
  boundedJson({slot, generation: row.generation, completed: row.completed}, P.bookkeepingBytes);
  if (row.generation === 0) {
    requireFormat(row.completed === 0 && row.admin === null);
  } else {
    const command = canonicalWriterCommand(row.admin?.command);
    requireFormat(command.action !== A.WRITE && command.action !== A.INIT &&
      command.serviceId === meta.serviceId &&
      command.incarnation === meta.initialization.command.incarnation &&
      command.slot === slot && command.newGeneration === row.generation);
    validateReceipt(command, row.admin.receipt);
    boundedJson(row.admin, P.adminBytes);
  }
  if (row.completed === 0) {
    requireFormat(row.write === null);
    return;
  }
  const command = canonicalWriterCommand(row.write?.command);
  requireFormat(command.action === A.WRITE && command.identity.slot === slot &&
    command.identity.serviceId === meta.serviceId &&
    command.identity.incarnation === meta.initialization.command.incarnation &&
    command.identity.generation === row.generation && command.identity.sequence === row.completed);
  validateReceipt(command, row.write.receipt);
  requireFormat(JSON.stringify(row.write.receipt.identity) === JSON.stringify(command.identity));
}

class WasmWriterState {
  constructor(db, serviceId, creation = null) {
    this.db = db;
    this.creationBound = creation?.kind === WASM_CREATION_OPENING.BOUND;
    const tables = db.prepare(SQL.TABLES).all().map((row) => row.name);
    if (tables.length === 0 || creation?.fresh === true) {
      boundedJson({serviceId}, P.metadataBytes);
      db.exec(SQL.CREATE);
      db.prepare(SQL.PUT_META).run(JSON.stringify({format: P.id, serviceId, initialization: null}));
    } else {
      requireFormat(tables.includes(META) && tables.includes(SLOTS) &&
        tables.includes(KV_TABLE_NAME));
    }
    this.readMeta = db.prepare(SQL.META);
    this.writeMeta = db.prepare(SQL.PUT_META);
    this.readSlot = db.prepare(SQL.SLOT);
    this.writeSlot = db.prepare(SQL.PUT_SLOT);
    this.allSlots = db.prepare(SQL.ALL);
    this.validate(serviceId);
    if (this.creationBound) {
      const root = readWasmCreationRoot(db);
      requireFormat(root.serviceDefinitionId === serviceId &&
        (this.meta().initialization === null ||
         this.meta().initialization.command.incarnation === root.incarnation));
    }
  }

  validate(serviceId) {
    const meta = this.meta();
    requireFormat(meta?.format === P.id && meta.serviceId === serviceId);
    boundedJson(meta, P.metadataBytes);
    const rows = this.allSlots.all();
    if (meta.initialization === null) {
      requireFormat(rows.length === 0);
      return;
    }
    const command = canonicalWriterCommand(meta.initialization.command);
    requireFormat(command.action === A.INIT && command.serviceId === serviceId);
    validateReceipt(command, meta.initialization.receipt);
    requireFormat(rows.length === P.slots);
    for (let slot = 0; slot < P.slots; slot += 1) {
      requireFormat(rows[slot].slot === slot);
      validateSlot(JSON.parse(rows[slot].record), slot, meta);
    }
  }

  meta() {
    const row = this.readMeta.get();
    requireFormat(row !== undefined);
    return JSON.parse(row.record);
  }

  slot(slot) {
    const row = this.readSlot.get(slot);
    requireFormat(row !== undefined);
    return JSON.parse(row.record);
  }

  classify(command) {
    const meta = this.meta();
    const identity = responseIdentity(command);
    if (identity.serviceId !== meta.serviceId) return refused(command, R.INCARNATION);
    if (this.creationBound) {
      const root = readWasmCreationRoot(this.db);
      if (identity.serviceId !== root.serviceDefinitionId ||
          identity.incarnation !== root.incarnation) {
        return refused(command, R.INCARNATION);
      }
    }
    if (command.action === A.INIT) {
      if (meta.initialization === null) return {status: S.NEW};
      return writerDigest(command) === writerDigest(meta.initialization.command) ?
        recorded(meta.initialization.receipt) : refused(command, R.CONFLICT);
    }
    if (meta.initialization === null) return refused(command, R.UNINITIALIZED);
    if (identity.incarnation !== meta.initialization.command.incarnation) {
      return refused(command, R.INCARNATION);
    }
    return command.action === A.WRITE ? this.classifyWrite(command) : this.classifyAdmin(command);
  }

  classifyAdmin(command) {
    const row = this.slot(command.slot);
    if (row.admin && writerDigest(row.admin.command) === writerDigest(command)) {
      return recorded(row.admin.receipt);
    }
    if (command.expectedGeneration < row.generation) return refused(command, R.FENCED);
    const currentAck = row.write === null ? null : writerDigest(row.write.receipt);
    if (command.expectedGeneration !== row.generation ||
        command.expectedCompletedSequence !== row.completed ||
        command.expectedReceiptDigest !== currentAck ||
        (command.action === A.ENROLL && row.generation !== 0) ||
        (command.action === A.RECYCLE && row.generation === 0)) {
      return refused(command, R.EXPECTED);
    }
    return {status: S.NEW};
  }

  classifyWrite(command) {
    const {generation, sequence, slot} = command.identity;
    const row = this.slot(slot);
    if (generation < row.generation) return refused(command, R.FENCED);
    if (generation !== row.generation) return refused(command, R.SEQUENCE);
    if (sequence < row.completed) return refused(command, R.RETIRED);
    if (sequence === row.completed) {
      return writerDigest(row.write.command) === writerDigest(command) ?
        recorded(row.write.receipt) : refused(command, R.CONFLICT);
    }
    if (sequence !== row.completed + 1) return refused(command, R.SEQUENCE);
    const ack = row.write === null ? null : writerDigest(row.write.receipt);
    return command.ack === ack ? {status: S.NEW} : refused(command, R.ACK);
  }

  apply(input, kvStore, index, term) {
    const command = canonicalWriterCommand(input);
    exactWriterPosition(index, term);
    const prior = this.classify(command);
    if (prior.status !== S.NEW) return prior;
    const receipt = {version: P.version};
    if (command.action === A.WRITE) receipt.identity = command.identity;
    receipt.commandDigest = writerDigest(command);
    receipt.outcome = command.action === A.WRITE ? kvStore.applySet(
      command.sessionId, command.key, Buffer.from(command.value, WRITER_ENCODING),
      {sessionBytes: P.sessionValueBytes, serviceBytes: P.serviceValueBytes}) :
      {accepted: true, token: this.adminToken(command)};
    receipt.index = index;
    receipt.term = term;
    boundedJson(receipt, P.receiptBytes);
    if (command.action === A.INIT) this.initialize(command, receipt);
    else this.completeSlot(command, receipt);
    return recorded(receipt);
  }

  adminToken(command) {
    const token = {serviceId: command.serviceId, incarnation: command.incarnation};
    if (command.action !== A.INIT) {
      token.slot = command.slot;
      token.generation = command.newGeneration;
    }
    return token;
  }

  initialize(command, receipt) {
    const meta = {...this.meta(), initialization: {command, receipt}};
    this.writeMeta.run(boundedJson(meta, P.metadataBytes));
    for (let slot = 0; slot < P.slots; slot += 1) {
      this.writeSlot.run(slot, JSON.stringify({slot, generation: 0, completed: 0,
        write: null, admin: null}));
    }
  }

  completeSlot(command, receipt) {
    const slot = command.identity?.slot ?? command.slot;
    const row = this.slot(slot);
    if (command.action === A.WRITE) {
      row.completed = command.identity.sequence;
      row.write = {command, receipt};
    } else {
      row.generation = command.newGeneration;
      row.completed = 0;
      row.write = null;
      row.admin = {command, receipt};
      boundedJson(row.admin, P.adminBytes);
    }
    this.writeSlot.run(slot, JSON.stringify(row));
  }
}

export {WasmWriterState, responseIdentity, recorded, refused};
