import {TYPEOF} from '../../constants/index.js';

const LOCAL_STR_1IWB9 = 'Detached bootstrap-owned CDC propagation subscriber';

function isBootstrapOwnedCdcPropagationActive(currentPhase, completePhase) {
  return currentPhase !== completePhase;
}

function detachBootstrapOwnedCdcSubscriber(options = {}) {
  const partition = options.partition || null;
  const subscriber = options.subscriber || null;
  if (!partition ||
      typeof partition.unsubscribeFromCDC !== TYPEOF.FUNCTION ||
      !subscriber) {
    return false;
  }
  partition.unsubscribeFromCDC(subscriber);
  if (typeof options.logger?.debug === TYPEOF.FUNCTION) {
    options.logger.debug(
      options.logMessage ||
        LOCAL_STR_1IWB9,
      {
        nodeId: options.nodeId || null,
        tableName: options.tableName || null,
        partitionId: options.partitionId || null,
        replicaId: options.replicaId || null,
        lifecyclePhase: options.lifecyclePhase || null,
      },
    );
  }
  return true;
}

export {
  detachBootstrapOwnedCdcSubscriber,
  isBootstrapOwnedCdcPropagationActive,
};
