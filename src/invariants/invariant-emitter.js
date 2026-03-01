import {createInvariantRecord, INVARIANT_EVENT} from './invariant-catalog.js';

function emitInvariant(target, options = {}) {
  const record = createInvariantRecord(options);
  if (typeof target?.emit === 'function') {
    target.emit(INVARIANT_EVENT.RUNTIME, record);
  }
  return record;
}

export {
  emitInvariant,
  INVARIANT_EVENT,
};
