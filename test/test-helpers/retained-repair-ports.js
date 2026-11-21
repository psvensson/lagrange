// A repository constructed outside the coordinator composition declares its
// retained placement repair ports explicitly. These are the owner's typed
// unavailable outcomes: no ledger route, no preparation, no native answer.
import {PLACEMENT_ADMISSION_ERROR} from '../../src/partition/partition-placement-admission-constants.js';
import {unavailableRepairOwnerReply, unavailableRepairPreparation} from
  '../../src/partition/partition-placement-repair-preparation-result.js';
import {RETAINED_REPAIR_BINDING} from '../../src/rebalancer/replica-operation-retained-repair-record.js';

function unavailableRetainedRepairPorts() {
  return {
    repairRetainedPlacement: async () => unavailableRepairOwnerReply(),
    resolveRetainedPlacementRepairRoute: () => ({state: RETAINED_REPAIR_BINDING.UNAVAILABLE}),
    prepareRetainedPlacementRepair: async () =>
      unavailableRepairPreparation(PLACEMENT_ADMISSION_ERROR.OWNER_UNAVAILABLE),
  };
}

// The retained owner's leadership-edge interface of a workflow-owner double
// whose node holds no retained record: both edges find nothing to rebind or
// release. A real repository is used wherever a record exists.
function retainedRepairOwnerWithoutRecords() {
  return {
    observeRetainedLedgerLeadershipStart() {},
    retireEndedRetainedTenures() {},
  };
}

export {retainedRepairOwnerWithoutRecords, unavailableRetainedRepairPorts};
