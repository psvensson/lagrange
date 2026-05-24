import {ADMIN_WEBSOCKET_API_SHARED} from './admin-websocket-api-shared.js';
import {AdminWebSocketAPISegment2} from './admin-websocket-api-segment-2.js';
import {ADMIN_WEBSOCKET_OBSERVATION_METHODS} from './admin-websocket-observation-methods.js';
import {ADMIN_WEBSOCKET_QUERY_EXECUTION_METHODS} from './admin-websocket-query-execution-methods.js';
import {ADMIN_WEBSOCKET_MESSAGE_DISPATCH_METHODS} from './admin-websocket-message-dispatch-methods.js';
import {ADMIN_WEBSOCKET_DIAGNOSTICS_ROUTE_METHODS} from './admin-websocket-diagnostics-route-methods.js';
import {ADMIN_WEBSOCKET_LIFECYCLE_METHODS} from './admin-websocket-lifecycle-methods.js';

const {MessageType, ErrorCode} = ADMIN_WEBSOCKET_API_SHARED;

class AdminWebSocketAPISegment3 extends AdminWebSocketAPISegment2 {
  constructor(...args) {
    super(...args);
    if (this.controlPlaneSnapshotOwner) {
      this.controlPlaneSnapshotOwner.closeStaleSnapshotSockets = () => {
        this.closeStaleSnapshotLaneSockets();
      };
    }
  }
}

Object.assign(
  AdminWebSocketAPISegment3.prototype,
  ADMIN_WEBSOCKET_OBSERVATION_METHODS,
  ADMIN_WEBSOCKET_QUERY_EXECUTION_METHODS,
  ADMIN_WEBSOCKET_MESSAGE_DISPATCH_METHODS,
  ADMIN_WEBSOCKET_DIAGNOSTICS_ROUTE_METHODS,
  ADMIN_WEBSOCKET_LIFECYCLE_METHODS,
);

export {
  AdminWebSocketAPISegment3,
  AdminWebSocketAPISegment3 as AdminWebSocketAPI,
  MessageType,
  ErrorCode,
};
