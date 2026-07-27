// The calculator's input-integrity surface. The intrinsics-independent
// primitives graduated to the shared canonical-JSON-data owner
// (src/utils/canonical-json-data.js) after the same attack class recurred
// across quests; this module keeps the import surface its verified consumers
// and tests were reviewed against.

export {
  appendOwnArrayValue,
  concatenateArraysByIndex,
  copyArrayByIndex,
  digest,
  isDenseDataArray,
  isNonEmptyText,
  isRecord,
  isSha256Digest,
  joinArrayByIndex,
  replaceExactSuffixByIndex,
  serializeJsonData,
} from '../utils/canonical-json-data.js';
