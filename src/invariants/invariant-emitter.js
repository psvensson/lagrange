import {createInvariantRecord, INVARIANT_EVENT} from './invariant-catalog.js';

const LOCAL_STR_FUNCTION = 'function';

function emitInvariant(target, options = {}) {
  const record = createInvariantRecord(options);
  if (typeof target?.emit === LOCAL_STR_FUNCTION) {
    target.emit(INVARIANT_EVENT.RUNTIME, record);
  }
  return record;
}

export {
  emitInvariant,
  INVARIANT_EVENT,
};
