/**
 * Guest-safe distributed-operation authoring: a descriptor holds the
 * declared statement plus the authored run and reduce functions. It
 * carries no id of its own — the service definition assigns identity
 * from its explicit operations keys, never from Function.name.
 */
import {AUTHORING_DESCRIPTOR_KIND, deepFreeze} from './define-service.js';

function distributed({
  statement,
  params = undefined,
  parameters = undefined,
  run,
  reduce,
}) {
  const declaredParameters = parameters !== undefined ? parameters : params;
  return deepFreeze({
    kind: AUTHORING_DESCRIPTOR_KIND.DISTRIBUTED_OPERATION,
    ...(declaredParameters !== undefined ?
      {parameters: declaredParameters} :
      {}),
    reduce,
    run,
    statement,
  });
}

export {distributed};
