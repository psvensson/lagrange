/**
 * Guest-safe request-handler authoring: an http surface keyed by
 * lowercase method whose factories build frozen route descriptors from
 * explicit fields. A route's identity comes from the service
 * definition's handlers key — never from the handle function's name or
 * from parsing the path.
 */
import {AUTHORING_DESCRIPTOR_KIND, deepFreeze} from './define-service.js';

const HTTP_METHOD = Object.freeze({
  GET: 'GET',
  POST: 'POST',
});

function requestHandler(method, path, {calls = [], handle} = {}) {
  return deepFreeze({
    calls,
    handle,
    kind: AUTHORING_DESCRIPTOR_KIND.REQUEST_HANDLER,
    method,
    path,
  });
}

const http = deepFreeze({
  get(path, route) {
    return requestHandler(HTTP_METHOD.GET, path, route);
  },
  post(path, route) {
    return requestHandler(HTTP_METHOD.POST, path, route);
  },
});

export {HTTP_METHOD, http};
