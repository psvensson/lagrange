import {COLUMN} from '../constants/index.js';
import {copyDenseOwnDataRecordArray} from '../utils/strict-own-data.js';

const MapConstructor = Map;
const mapPrototypeHas = Function.call.bind(Map.prototype.has);
const mapPrototypeSet = Function.call.bind(Map.prototype.set);
const objectFreeze = Object.freeze;
const stringPrototypeTrim = Function.call.bind(String.prototype.trim);

// The committed owner validates before indexing: a skipped row, sparse array
// or duplicate key cannot silently become a different authoritative node set.
function indexCommittedNodeRows(value) {
  const rows = copyDenseOwnDataRecordArray(value);
  if (rows === null) return null;
  const byId = new MapConstructor();
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const nodeId = row[COLUMN.NODE_ID];
    if (typeof nodeId !== 'string' || nodeId.length === 0 ||
        stringPrototypeTrim(nodeId) !== nodeId || mapPrototypeHas(byId, nodeId)) return null;
    mapPrototypeSet(byId, nodeId, objectFreeze({...row}));
  }
  return byId;
}

export {indexCommittedNodeRows};
