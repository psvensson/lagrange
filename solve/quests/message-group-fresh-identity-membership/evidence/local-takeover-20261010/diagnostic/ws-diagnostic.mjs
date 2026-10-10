// Explicit diagnostic only: existing InProcWebSocket uses these constants.
// Actual external WebSocket/client/server construction is forbidden here.
export default class WebSocket {
  static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
  constructor() { throw new Error('diagnostic must not construct an external WebSocket'); }
}
export class WebSocketServer {
  constructor() { throw new Error('diagnostic must not construct a WebSocket server'); }
}
