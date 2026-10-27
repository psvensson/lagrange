import {TABLES} from '../../constants/index.js';
import {SystemMetadataOwnerBase} from './system-metadata-owner-base.js';
import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE, CONTROL_PLANE_READ_LEADER_MODE} from
  '../control-plane-system-table-gateway.js';
import {compileDiagnosticMarker, diagnosticMarkerWasApplied, recordedDiagnosticMarker,
  reconcileDiagnosticMarker, unconfirmedDiagnosticMarker} from './log-diagnostic-marker-contract.js';

const LOCAL_STR_LOGS_OWNER = 'logs-owner';

class LogsOwner extends SystemMetadataOwnerBase {
  static OWNER_NAME = LOCAL_STR_LOGS_OWNER;
  static TABLE_NAME = TABLES.LOGS;

  constructor(options = {}) {
    super(options);
    this.now = options.now || Date.now;
  }

  async appendDiagnosticMarker(request, nodeId, options = {}) {
    // Capture original intent before any await. INSERT uniqueness is the
    // mutation-time fence; reconciliation never overwrites an existing marker.
    const row = compileDiagnosticMarker(request, nodeId, this.now());
    let writeError = null;
    try {
      const result = await this.appendLog(row, options);
      if (diagnosticMarkerWasApplied(result)) return recordedDiagnosticMarker(row);
    } catch (error) {
      writeError = error;
    }
    let observation;
    try {
      observation = await this.readByPrimaryKeyObservation(row.log_id, {
        ...options,
        authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
        leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
      });
    } catch (error) {
      throw unconfirmedDiagnosticMarker(writeError || error);
    }
    return reconcileDiagnosticMarker(observation, row, writeError);
  }

  async getLog(logId, options = {}) {
    return this.readByPrimaryKey(logId, options);
  }

  async listLogs(options = {}) {
    return this.listRows(options);
  }

  async appendLog(row, options = {}) {
    return this.insertRow(row, options);
  }

  async upsertLog(row, options = {}) {
    return this.upsertRow(row, options);
  }

  async updateLog(logId, data, options = {}) {
    return this.updateByPrimaryKey(logId, data, options);
  }

  async removeLog(logId, options = {}) {
    return this.deleteByPrimaryKey(logId, options);
  }
}

export {LogsOwner};
