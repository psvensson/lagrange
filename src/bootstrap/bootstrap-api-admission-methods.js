import {
  HOST,
  NUM,
  TYPEOF,
} from '../constants/index.js';
import {
  BOOTSTRAP_API_LOG_MSG,
  BOOTSTRAP_API_SUBSYSTEM,
} from './bootstrap-api-constants.js';
import {installBootstrapApiMethods} from './bootstrap-api-method-installer.js';

const BOOTSTRAP_ADMISSION_ID_PREFIX = 'bootstrap-admission';
const BOOTSTRAP_ADMISSION_ID_SEPARATOR = ':';
const BOOTSTRAP_ADMISSION_PEER_HINT_EMPTY = Object.freeze([]);

const bootstrapApiAdmissionMethods = {
  synchronizeBootstrapAdmissionCount() {
    this.inFlightBootstrapRequestCount = this.bootstrapAdmissionLeases.size;
    return this.inFlightBootstrapRequestCount;
  },

  expireStaleBootstrapAdmissionPeerHints(now = Date.now()) {
    for (const [nodeId, hint] of this.bootstrapAdmissionPeerHints) {
      if (hint.hintExpiresAt > now) {
        continue;
      }
      this.bootstrapAdmissionPeerHints.delete(nodeId);
    }
  },

  expireStaleBootstrapAdmissions(now = Date.now()) {
    const expiredAdmissions = [];
    for (const [admissionId, admission] of this.bootstrapAdmissionLeases) {
      if (admission.leaseExpiresAt > now) {
        continue;
      }
      this.bootstrapAdmissionLeases.delete(admissionId);
      expiredAdmissions.push(admission);
    }
    this.expireStaleBootstrapAdmissionPeerHints(now);
    this.synchronizeBootstrapAdmissionCount();
    if (expiredAdmissions.length > NUM.ZERO) {
      this.logger.warn(BOOTSTRAP_API_LOG_MSG.BOOTSTRAP_ADMISSION_EXPIRED, {
        seedNodeId: this.seedNodeId,
        expiredAdmissionCount: expiredAdmissions.length,
        inFlightBootstrapRequests: this.inFlightBootstrapRequestCount,
        maxConcurrentBootstrapRequests: this.maxConcurrentBootstrapRequests,
        bootstrapAdmissionLeaseMs: this.bootstrapAdmissionLeaseMs,
        expiredAdmissions: expiredAdmissions.map((admission) => ({
          admissionId: admission.admissionId,
          nodeId: admission.nodeId,
          nodeAddress: admission.nodeAddress,
          startedAt: admission.startedAt,
          leaseExpiresAt: admission.leaseExpiresAt,
        })),
      });
    }
    return expiredAdmissions;
  },

  recordBootstrapAdmissionPeerHint(admission) {
    if (
      !admission ||
      typeof admission.nodeId !== TYPEOF.STRING ||
      admission.nodeId.length === NUM.ZERO ||
      typeof admission.nodeAddress !== TYPEOF.STRING ||
      admission.nodeAddress.length === NUM.ZERO
    ) {
      return;
    }
    this.bootstrapAdmissionPeerHints.set(admission.nodeId, {
      nodeId: admission.nodeId,
      nodeAddress: admission.nodeAddress,
      hintExpiresAt: admission.leaseExpiresAt,
    });
  },

  getBootstrapAdmissionPeerHints(now = Date.now()) {
    this.expireStaleBootstrapAdmissionPeerHints(now);
    if (this.bootstrapAdmissionPeerHints.size === NUM.ZERO) {
      return BOOTSTRAP_ADMISSION_PEER_HINT_EMPTY;
    }
    return Array.from(this.bootstrapAdmissionPeerHints.values()).map((hint) => ({
      nodeId: hint.nodeId,
      nodeAddress: hint.nodeAddress,
    }));
  },

  acquireBootstrapAdmission(snapshot = {}) {
    const now = Number.isFinite(snapshot.now) ?
      Math.floor(snapshot.now) :
      Date.now();
    const admissionId = [
      BOOTSTRAP_ADMISSION_ID_PREFIX,
      String(this.bootstrapAdmissionSequence),
      String(now),
    ].join(BOOTSTRAP_ADMISSION_ID_SEPARATOR);
    this.bootstrapAdmissionSequence += NUM.ONE;
    const admission = {
      admissionId,
      nodeId: snapshot.nodeId || BOOTSTRAP_API_SUBSYSTEM,
      nodeAddress: snapshot.nodeAddress || HOST.LOCALHOST,
      startedAt: now,
      leaseExpiresAt: now + this.bootstrapAdmissionLeaseMs,
    };
    this.bootstrapAdmissionLeases.set(admissionId, admission);
    this.recordBootstrapAdmissionPeerHint(admission);
    this.synchronizeBootstrapAdmissionCount();
    return admission;
  },

  releaseBootstrapAdmission(admission) {
    const admissionId = admission?.admissionId;
    if (typeof admissionId === TYPEOF.STRING) {
      this.bootstrapAdmissionLeases.delete(admissionId);
    }
    this.synchronizeBootstrapAdmissionCount();
  },
};

function installBootstrapApiAdmissionMethods(BootstrapAPI) {
  installBootstrapApiMethods(BootstrapAPI, bootstrapApiAdmissionMethods);
}

export {installBootstrapApiAdmissionMethods};
