import {AST_TYPE} from '../query/parser-constants.js';

function requiresDistributedBeginAcceptance(context, statementType) {
  return statementType === AST_TYPE.BEGIN_TRANSACTION &&
    typeof context.adapter.acceptDistributedBegin === 'function';
}

function isDistributedBeginResult(context, statementType, result) {
  if (!requiresDistributedBeginAcceptance(context, statementType)) return false;
  return typeof context.adapter.canAcceptDistributedBegin === 'function' &&
    context.adapter.canAcceptDistributedBegin(context.session.sessionId,
      result) === true;
}

function acceptDistributedBeginResult(context, result) {
  try {
    if (context.adapter.acceptDistributedBegin(
      context.session.sessionId,
      result,
      (transactionId) => context.session.enterTransaction(transactionId),
    ) !== true) throw new Error('Distributed BEGIN acceptance refused');
    return true;
  } catch (_error) {
    context.socket.destroy();
    context.destroy();
    return false;
  }
}

export {
  acceptDistributedBeginResult,
  isDistributedBeginResult,
  requiresDistributedBeginAcceptance,
};
