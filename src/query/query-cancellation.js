/**
 * Enforce cooperative query cancellation without duplicating token-shape
 * branches inside hot owner methods.
 * @param {Object|null} cancellationToken
 * @return {void}
 */
function throwIfCancellationRequested(cancellationToken) {
  if (
    cancellationToken &&
    typeof cancellationToken.throwIfCancelled === 'function'
  ) {
    cancellationToken.throwIfCancelled();
  }
}

function resolveQueryCancellationToken(context) {
  return context?.cancellationToken;
}

export {resolveQueryCancellationToken, throwIfCancellationRequested};
