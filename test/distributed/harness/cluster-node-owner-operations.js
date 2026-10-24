/**
 * The harness's one route to the admin owner operations: every harness
 * system-table change that has an owner goes through that owner's admin
 * operation, never through raw SQL on the admin query channel.
 */
import {ADMIN_OWNER_OPERATION_PATH} from
  '../../../src/admin/admin-owner-operations.js';
import {CLUSTER_BASE_LAYER} from './cluster-base-layer.js';

const {FETCH_TIMEOUT_MS, httpRequest, resolvePositiveTimeoutMs} =
  CLUSTER_BASE_LAYER;
const HTTP_METHOD_PATCH = 'PATCH';
const NO_ANSWER = 'admin owner operation returned no answer';

/**
 * Merge policy overrides into one table's policy through its owner
 * (TablePolicyService.updateTablePolicy behind the admin table-policy
 * operation).
 * @param {{ip: string, adminApiPort: number}} node
 * @param {string} tableId
 * @param {Object} policy - Policy overrides.
 * @param {Object} [options]
 * @param {number} [options.timeoutMs]
 * @return {Promise<{status: number, success: boolean, outcome?: string,
 *   errorCode?: string, error?: string, policy?: Object}>}
 */
async function requestTablePolicyUpdate(node, tableId, policy, options = {}) {
  const response = await httpRequest({
    url: 'http://' + node.ip + ':' + node.adminApiPort +
      ADMIN_OWNER_OPERATION_PATH.tablePolicy(tableId),
    timeoutMs: resolvePositiveTimeoutMs(options.timeoutMs, FETCH_TIMEOUT_MS),
    method: HTTP_METHOD_PATCH,
    body: {policy},
    includeBody: true,
  });
  const body = response?.body && typeof response.body === 'object' ?
    response.body : {success: false, error: NO_ANSWER};
  return {...body, status: response?.status};
}

export {requestTablePolicyUpdate};
