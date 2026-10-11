import {
  compareCdcSourceScopeEpoch,
  eventCdcSourceScope,
  isActiveCdcSourceScopeEvidence,
  readCompleteCdcCoverage,
} from './partition-cdc-source-coverage.js';
import {handleCoverageTransferRequest} from
  './partition-cdc-coverage-transfer.js';

function createPartitionServiceCdcCoverageMethods() {
  return {
    readCompleteCdcCoverage(options = {}) {
      return readCompleteCdcCoverage(this, options);
    },
    handleCdcCoverageTransferRequest(options = {}) {
      return handleCoverageTransferRequest(this, options);
    },
    installCdcSourceScopeEvidence(evidence) {
      if (!isActiveCdcSourceScopeEvidence(evidence)) return false;
      const previous = this.cdcSourceScopeEvidence;
      if (isActiveCdcSourceScopeEvidence(previous)) {
        if (previous.scopeId === evidence.scopeId) return true;
        if (previous.partitionId !== evidence.partitionId ||
            previous.tableId !== evidence.tableId ||
            compareCdcSourceScopeEpoch(evidence, previous) <= 0) return false;
      }
      this.cdcSourceScopeEvidence = evidence;
      if (eventCdcSourceScope(this) === null) {
        this.cdcSourceScopeEvidence = previous;
        return false;
      }
      return true;
    },
  };
}

export {createPartitionServiceCdcCoverageMethods};
