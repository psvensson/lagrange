/**
 * Guest-safe distributed-operation authoring: a descriptor holds the
 * declared statement plus the authored run and reduce functions. It
 * carries no id of its own — the service definition assigns identity
 * from its explicit operations keys, never from Function.name.
 */
import {AUTHORING_DESCRIPTOR_KIND, deepFreeze} from './define-service.js';

function distributed({statement, run, reduce}) {
  return deepFreeze({
    kind: AUTHORING_DESCRIPTOR_KIND.DISTRIBUTED_OPERATION,
    reduce,
    run,
    statement,
  });
}

export {distributed};
