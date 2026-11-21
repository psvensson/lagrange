// An in-process port clash answers the address-in-use error, never a
// TypeError (line-regression-causes stage 3, item 4 hand-over):
// router-server-manager.js builds it from ROUTER_ERROR_MSG.addressInUse, a
// member src/constants/transport.js does not define, so the clash throws
// "ROUTER_ERROR_MSG.addressInUse is not a function". Red until that member
// is defined at the vocabulary's owner (handed over: the file is under edit
// on another active branch).
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {RouterServerManager} from '../../src/transport/router-server-manager.js';

const PORT = 47911;
const EADDRINUSE = 'EADDRINUSE';

function manager(routerId) {
  const quiet = () => undefined;
  return new RouterServerManager({nodeId: `clash-${routerId}`, routerId,
    logger: {debug: quiet, info: quiet, warn: quiet, error: quiet}, wsPort: PORT,
    inProcess: true, nodeConnections: new Map(), onMessage: quiet,
    onConnectionClose: quiet, emit: quiet});
}

test('an in-process port clash rejects with the address-in-use error', async () => {
  const first = manager('router-a');
  await first.startServer();
  try {
    await assert.rejects(manager('router-b').startServer(), (error) => {
      assert.equal(error?.name, 'Error', `not a ${error?.name}: ${error?.message}`);
      assert.equal(error.code, EADDRINUSE);
      assert.ok(String(error.message).includes(String(PORT)), 'the message names the port');
      return true;
    });
  } finally {
    await first.shutdown();
  }
});
