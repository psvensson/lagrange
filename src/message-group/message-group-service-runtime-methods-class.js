import {defineMessageGroupServiceForwardingRuntimeMethods} from './message-group-service-forwarding-runtime-methods.js';
import {defineMessageGroupServiceRebalancerRuntimeMethods} from './message-group-service-rebalancer-runtime-methods.js';
import {defineMessageGroupServiceOutboundDispatchRuntimeMethods} from './message-group-service-outbound-dispatch-runtime-methods.js';
import {defineMessageGroupServiceInboundIngressRuntimeMethods} from './message-group-service-inbound-ingress-runtime-methods.js';
import {defineMessageGroupServiceCdcReplicationRuntimeMethods} from './message-group-service-cdc-replication-runtime-methods.js';
import {defineMessageGroupServiceLeadershipStateRuntimeMethods} from './message-group-service-leadership-state-runtime-methods.js';
import {defineMessageGroupServiceCacheAndLifecycleRuntimeMethods} from './message-group-service-cache-and-lifecycle-runtime-methods.js';

function createMessageGroupServiceRuntimeMethodsClass(deps = {}) {
  class MessageGroupServiceRuntimeMethods {}

  defineMessageGroupServiceOutboundDispatchRuntimeMethods(
    MessageGroupServiceRuntimeMethods.prototype,
    deps,
  );
  defineMessageGroupServiceInboundIngressRuntimeMethods(
    MessageGroupServiceRuntimeMethods.prototype,
    deps,
  );
  defineMessageGroupServiceCdcReplicationRuntimeMethods(
    MessageGroupServiceRuntimeMethods.prototype,
    deps,
  );
  defineMessageGroupServiceLeadershipStateRuntimeMethods(
    MessageGroupServiceRuntimeMethods.prototype,
    deps,
  );
  defineMessageGroupServiceCacheAndLifecycleRuntimeMethods(
    MessageGroupServiceRuntimeMethods.prototype,
    deps,
  );
  defineMessageGroupServiceForwardingRuntimeMethods(
    MessageGroupServiceRuntimeMethods.prototype,
  );
  defineMessageGroupServiceRebalancerRuntimeMethods(
    MessageGroupServiceRuntimeMethods.prototype,
    deps,
  );

  return MessageGroupServiceRuntimeMethods;
}

export {createMessageGroupServiceRuntimeMethodsClass};
