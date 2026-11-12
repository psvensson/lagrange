// The real ControlPlanePublicationsOwner over an in-memory row store, for
// unit tests of the membership coordinator's decisions. The store stands in
// for the publications partition only at the gateway seam the owner writes
// through: an insert that never replaces, an update that applies when every
// predicate column matches, and the leader's keyed read. Claims about
// committed state belong to the real-table witnesses
// (membership-publication-guarded-write-witness.test.js).
import {TABLES} from '../../src/constants/index.js';
import {ControlPlanePublicationsOwner} from
  '../../src/control-plane/owners/control-plane-publications-owner.js';

const PUBLICATIONS = TABLES.CONTROL_PLANE_PUBLICATIONS;
const KEY = 'publication_id';

function storedValue(value) {
  return value !== null && typeof value === 'object' ?
    JSON.parse(JSON.stringify(value)) : value;
}

function sameValue(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

/**
 * @param {Object} [options]
 * @param {Object[]} [options.rows] - Rows already durable (a row without a
 *   publication_revision is stored at revision 1, as an admitted row is).
 * @return {Object} {owner, gateway, row(id), rows(), writes, landed, reads,
 *   control}.
 */
function createPublicationStore(options = {}) {
  const durable = new Map();
  for (const row of options.rows || []) {
    durable.set(row[KEY], storedValue({publication_revision: 1, ...row}));
  }
  const writes = [];
  const reads = [];
  // The durable row after each write that landed, in order.
  const landed = [];
  // `readsUnavailable` answers every keyed or list read as unavailable;
  // `beforeWrite`/`afterWrite` run around each write (afterWrite may throw
  // to lose the write's answer).
  const control = {readsUnavailable: false, beforeWrite: null,
    afterWrite: null};
  async function write(entry, apply) {
    writes.push(entry);
    if (control.beforeWrite) {
      await control.beforeWrite(entry);
    }
    const affectedRows = apply();
    entry.affectedRows = affectedRows;
    if (affectedRows === 1) {
      landed.push(storedValue(durable.get(
        entry.row?.[KEY] ?? entry.whereClause?.[KEY])));
    }
    if (control.afterWrite) {
      await control.afterWrite(entry);
    }
    return {success: true, partitionResult: {affectedRows}};
  }
  const gateway = {
    async readAuthoritativeRows(tableName, _sql, params = [], readOptions) {
      reads.push({tableName, params, options: readOptions});
      if (control.readsUnavailable) {
        return {success: false, error: 'authoritative read unavailable'};
      }
      const rows = params.length > 0 ?
        [durable.get(params[0])].filter(Boolean) : [...durable.values()];
      return {success: true, rows: rows.map((row) => storedValue(row))};
    },
    async readProjectionRows(_tableName, readOptions = {}) {
      return typeof readOptions.readFromCache === 'function' ?
        readOptions.readFromCache(readOptions.systemTableCache || null) : [];
    },
    async insertSystemTableRow(tableName, row, writeOptions = {}) {
      return write({operation: 'insert', tableName, row: storedValue(row),
        options: writeOptions}, () => {
        if (durable.has(row[KEY])) {
          if (writeOptions.ignoreExisting !== true) {
            throw new Error(`UNIQUE constraint failed: ${PUBLICATIONS}.${KEY}`);
          }
          return 0;
        }
        durable.set(row[KEY], storedValue(row));
        return 1;
      });
    },
    async updateSystemTableRow(tableName, whereClause, data,
      writeOptions = {}) {
      return write({operation: 'update', tableName,
        whereClause: storedValue(whereClause), data: storedValue(data),
        options: writeOptions}, () => {
        const row = durable.get(whereClause[KEY]);
        if (!row || !Object.keys(whereClause).every((column) =>
          sameValue(row[column], whereClause[column]))) {
          return 0;
        }
        durable.set(row[KEY], {...row, ...storedValue(data)});
        return 1;
      });
    },
  };
  const owner = new ControlPlanePublicationsOwner({
    controlPlaneSystemTableGateway: gateway,
    controlPlaneWriteRetryTimeoutMs: 0,
  });
  return {
    owner,
    gateway,
    control,
    writes,
    reads,
    landed,
    row: (publicationId) => storedValue(durable.get(publicationId) ?? null),
    rows: () => [...durable.values()].map((row) => storedValue(row)),
    // Another writer's change of the durable row (advances its revision).
    changeDurably(publicationId, data) {
      const row = durable.get(publicationId);
      durable.set(publicationId, {...row, ...storedValue(data),
        publication_revision: row.publication_revision + 1});
    },
  };
}

/**
 * A publications owner for a unit test that keeps its durable row in its
 * own closure: the test's read methods as it wrote them, and the REAL
 * owner's write entries (admitPublication, applyPublicationChange) and
 * durable read (readDurablePublication) over
 * a gateway seam backed by the test's `getPublication` (the durable read)
 * and `storeRow` (the whole durable row after a landed write). A row the
 * test holds without a publication_revision reads the column default, 0.
 * @param {Object} rowAccess - {getPublication, storeRow, ...read methods}.
 * @param {Object} [options] - {durableRead(publicationId)}.
 * @return {Object} The owner the coordinator is given.
 */
function publicationsOwnerOverRows(rowAccess, options = {}) {
  const {storeRow, ...reads} = rowAccess;
  // The owner's own durable reads: the test's `durableRead` when it keeps
  // them apart from the reads it observes, else its getPublication.
  const readRow = options.durableRead ??
    ((publicationId, readOptions) =>
      rowAccess.getPublication(publicationId, readOptions));
  // A keyed read answers only that key's row: a test row carrying another
  // publication_id is not the durable row of the key asked for.
  const durableRead = async (publicationId, readOptions) => {
    const row = await readRow(publicationId, readOptions);
    return row && (row[KEY] === undefined || row[KEY] === publicationId) ?
      {publication_revision: 0, ...row} : null;
  };
  const gateway = {
    async readAuthoritativeRows(_tableName, _sql, params = [], readOptions) {
      const row = await durableRead(params[0], readOptions);
      return {success: true, rows: row ? [storedValue(row)] : []};
    },
    async insertSystemTableRow(_tableName, row, writeOptions = {}) {
      if (await durableRead(row[KEY], writeOptions)) {
        return {success: true, partitionResult: {affectedRows: 0}};
      }
      await storeRow(storedValue(row), writeOptions);
      return {success: true, partitionResult: {affectedRows: 1}};
    },
    async updateSystemTableRow(_tableName, whereClause, data,
      writeOptions = {}) {
      const row = await durableRead(whereClause[KEY], writeOptions);
      if (!row || !Object.keys(whereClause).every((column) =>
        sameValue(row[column], whereClause[column]))) {
        return {success: true, partitionResult: {affectedRows: 0}};
      }
      await storeRow({...storedValue(row), ...storedValue(data)},
        writeOptions);
      return {success: true, partitionResult: {affectedRows: 1}};
    },
  };
  const owner = new ControlPlanePublicationsOwner({
    controlPlaneSystemTableGateway: gateway,
    controlPlaneWriteRetryTimeoutMs: 0,
  });
  return {
    ...reads,
    admitPublication: (row, writeOptions) =>
      owner.admitPublication(row, writeOptions),
    applyPublicationChange: (publicationId, change, writeOptions) =>
      owner.applyPublicationChange(publicationId, change, writeOptions),
    readDurablePublication: (publicationId, readOptions) =>
      owner.readDurablePublication(publicationId, readOptions),
  };
}

export {createPublicationStore, publicationsOwnerOverRows};
