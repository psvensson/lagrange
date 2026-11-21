import {buildDeliveryEnvelope} from '../transport/transport-semantic-outcome.js';
const TRANSPORT_TIMEOUT_CODE = 'TRANSPORT_TIMEOUT';
const TRANSPORT_TIMEOUT_MESSAGE = 'Transport delivery failed';

function wrapPlacementTransport(messageRouter) {
  if (!messageRouter) return null;
  if (messageRouter.deliver) return messageRouter;
  if (!messageRouter.sendToAddress) return null;
  return {
    deliver: async (address, message, options) => {
      const response = await messageRouter.sendToAddress(address, message, options);
      if (response?.transport) return response;
      if (response?.delivered === false) {
        return buildDeliveryEnvelope({
          acknowledged: false,
          errorCode: response.errorCode || TRANSPORT_TIMEOUT_CODE,
          errorMessage: response.error || TRANSPORT_TIMEOUT_MESSAGE,
        }, null);
      }
      return buildDeliveryEnvelope({acknowledged: true}, response);
    },
  };
}


export {wrapPlacementTransport};
