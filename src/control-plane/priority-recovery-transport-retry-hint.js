// The re-read hint of a priority-recovery diagnostics answer whose failure
// is a transport failure a re-read may cure (a read changes nothing, so its
// re-send is identity-keyed): the failure's own hint when it carries one,
// else this owner's. Decided by the transport's one delivery-failure
// decision, never by an error text. One function for the readiness owner
// and the bootstrap owner alike.
import {classifyTransportDeliveryFailure, mayResendAfterTransportFailure} from
  '../transport/transport-delivery-failure.js';

const PRIORITY_RECOVERY_TRANSPORT_RETRY_AFTER_MS = 15000;

function priorityRecoveryTransportRetryAfterMs(error) {
  if (!mayResendAfterTransportFailure(classifyTransportDeliveryFailure(error),
    {identityKeyed: true})) {
    return undefined;
  }
  return Number.isFinite(error.retryAfterMs) && error.retryAfterMs > 0 ?
    error.retryAfterMs : PRIORITY_RECOVERY_TRANSPORT_RETRY_AFTER_MS;
}

export {
  PRIORITY_RECOVERY_TRANSPORT_RETRY_AFTER_MS,
  priorityRecoveryTransportRetryAfterMs,
};
