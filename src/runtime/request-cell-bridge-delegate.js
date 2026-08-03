/**
 * Request-Cell call-bridge delegate seam for the WasmComponentDriver
 * (extracted, call-cell-driver-invoke precedent, to keep the driver
 * under the file-size cap).
 *
 * The driver stores one injected async bridge function (the future
 * RequestCellCallBridge owner's invoke) and, for every NON-call-cell
 * invocation, hands the component runtime a per-invocation delegate that
 * carries the replica context and invocation so the bridge can derive
 * identity, authority, and deadline parent-side.
 *
 * Delegate contract (what the bridge owner implements):
 *   bridgeInvoke({name, argumentsJson, invocation, replicaContext})
 *     -> Promise<string>            (the binding call's JSON result)
 *   Typed refusals throw an Error whose `code` is a member of
 *   HOST_CALL_ERROR_CODE (src/runtime/cell-host-call-protocol.js);
 *   retryability is derived from the protocol's canonical map. Any other
 *   throw is normalized to the fixed `target_failed` failure without
 *   leaking parent-side internals to the guest.
 */

const REQUEST_CALL_BRIDGE_REQUIRED =
  'request Cell call bridge must be a function';

function assertRequestCallBridge(bridgeInvoke) {
  if (typeof bridgeInvoke !== 'function') {
    throw new TypeError(REQUEST_CALL_BRIDGE_REQUIRED);
  }
  return bridgeInvoke;
}

function buildRequestCellBridgeDelegate(
  bridgeInvoke,
  replicaContext,
  invocation,
) {
  if (typeof bridgeInvoke !== 'function') return undefined;
  return (call) => bridgeInvoke({...call, invocation, replicaContext});
}

export {assertRequestCallBridge, buildRequestCellBridgeDelegate};
