import {FORMATION_OWNER} from './formation-diagnostics-contract.js';
import {runFormationOwner} from './formation-turn-attribution.js';

const HANDLE_MESSAGE_METHOD = 'handleMessage';
const MISSING_HANDLE_MESSAGE_ERROR =
  'MessageRouter.handleMessage must exist before formation attribution installs';
const objectDefineProperty = Object.defineProperty;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const reflectApply = Reflect.apply;

/**
 * MessageRouter/formation-diagnostics interaction contract.
 *
 * MessageRouter owns every inbound transport decision. This module owns only
 * the mapping of its already-composed handleMessage entry point into the
 * exclusive transport_message formation bucket. With no active attribution
 * window, runFormationOwner invokes the original method directly.
 */
function installTransportMessageFormationAttribution(serviceClass) {
  const descriptor = objectGetOwnPropertyDescriptor(
    serviceClass.prototype,
    HANDLE_MESSAGE_METHOD,
  );
  if (typeof descriptor?.value !== 'function') {
    throw new Error(MISSING_HANDLE_MESSAGE_ERROR);
  }
  const handleMessage = descriptor.value;
  objectDefineProperty(serviceClass.prototype, HANDLE_MESSAGE_METHOD, {
    ...descriptor,
    value: function handleMessageWithFormationAttribution(...args) {
      return runFormationOwner(
        FORMATION_OWNER.TRANSPORT_MESSAGE,
        () => reflectApply(handleMessage, this, args),
      );
    },
  });
}

export {installTransportMessageFormationAttribution};
