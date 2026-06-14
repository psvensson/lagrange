import {MESSAGE_ROUTER_SHARED} from './message-router-shared.js';

const {
  TRANSPORT_PRESSURE_SUMMARY_FIELD,
} = MESSAGE_ROUTER_SHARED;

/**
 * Admission and identification controls for the message router: pending-node
 * connection pressure bookkeeping plus the external-admission toggle that gates
 * remote incoming connections before bootstrap/join opens external transport.
 */
class MessageRouterAdmissionControls {
  recordPendingNodeConnectionSnapshot() {
    this.transportPressureMetrics[
      TRANSPORT_PRESSURE_SUMMARY_FIELD.MAX_OBSERVED_PENDING_NODE_CONNECTION_COUNT
    ] = Math.max(
      this.transportPressureMetrics[
        TRANSPORT_PRESSURE_SUMMARY_FIELD
          .MAX_OBSERVED_PENDING_NODE_CONNECTION_COUNT
      ],
      this.pendingNodeConnections.size,
    );
  }
  /**
   * Set optional payload to include with IDENTIFY messages.
   * @param {Object|null} payload - Additional identify payload.
   */
  setIdentificationPayload(payload) {
    this.identifyPayload = payload || null;
  }
  /**
   * Toggle whether remote incoming node connections are admitted.
   * Self-connection remains allowed so local routing can initialize
   * before bootstrap/join ownership opens external transport.
   * @param {boolean} enabled
   * @return {void}
   */
  setExternalAdmissionEnabled(enabled) {
    this.externalAdmissionEnabled = enabled !== false;
  }
  /**
   * Return whether remote incoming node connections are currently admitted.
   * @return {boolean}
   */
  isExternalAdmissionEnabled() {
    return this.externalAdmissionEnabled === true;
  }
}

function defineMessageRouterAdmissionControls(serviceClass) {
  Object.defineProperties(
    serviceClass.prototype,
    Object.fromEntries(
      Object.entries(
        Object.getOwnPropertyDescriptors(
          MessageRouterAdmissionControls.prototype,
        ),
      ).filter(([name]) => name !== 'constructor'),
    ),
  );
}

export {defineMessageRouterAdmissionControls};
