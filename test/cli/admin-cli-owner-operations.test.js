/**
 * The CLI's config edit and node-management commands invoke the admin
 * owner operations; none of them sends system-table SQL.
 */
import http from 'node:http';
import {test} from '../../src/test-helpers/tap.js';
import {ADMIN_CLI_ACTION_METHODS} from
  '../../src/cli/admin-cli-action-methods.js';
import {ConnectionManager} from '../../src/cli/core/connection-manager.js';
import {ADMIN_OWNER_OPERATION_PATH} from
  '../../src/admin/admin-owner-operations.js';

function createCli(connectionManager) {
  const cli = Object.create(ADMIN_CLI_ACTION_METHODS);
  cli.errors = [];
  cli.statuses = [];
  cli.refreshes = 0;
  cli.readOnlyMode = false;
  cli.connectionManager = connectionManager;
  cli.showError = (message) => cli.errors.push(message);
  cli.updateStatus = (message) => cli.statuses.push(message);
  cli.forceRefresh = () => {
    cli.refreshes += 1;
  };
  return cli;
}

function createRecordingConnection(answer) {
  const connection = {
    calls: [],
    sentSql: [],
    sendQuery(queryId, sql) {
      connection.sentSql.push(sql);
      return true;
    },
    requestCacheDump() {
      connection.calls.push(['requestCacheDump']);
    },
  };
  for (const name of ['setConfigValue', 'drainNode', 'removeNode']) {
    connection[name] = async (...args) => {
      connection.calls.push([name, ...args]);
      return answer;
    };
  }
  return connection;
}

test('config edit sends the typed value to the config owner operation',
  async (t) => {
    const connection = createRecordingConnection({success: true});
    const cli = createCli(connection);
    await cli.executeConfigUpdate('raft.electionTimeoutMs', '1500', 'number');
    t.same(connection.calls[0], ['setConfigValue', 'raft.electionTimeoutMs',
      1500], 'the value is parsed to its type');
    t.same(connection.calls[1], ['requestCacheDump']);
    t.same(connection.sentSql, [], 'no SQL is sent');

    await cli.executeConfigUpdate('raft.electionTimeoutMs', 'abc', 'number');
    t.equal(connection.calls.length, 2, 'an unparseable value is not sent');
    t.ok(cli.errors[0].startsWith('Invalid value'));
  });

test('drain and remove-node invoke the owner operations', async (t) => {
  const connection = createRecordingConnection({success: true});
  const cli = createCli(connection);
  await cli.drainNode('node-a');
  await cli.removeNode('node-b');
  t.same(connection.calls, [['drainNode', 'node-a'], ['removeNode', 'node-b']]);
  t.equal(cli.refreshes, 2);
  t.same(connection.sentSql, [], 'no SQL is sent');
});

test('a refused owner operation surfaces its typed code', async (t) => {
  const connection = createRecordingConnection({
    success: false,
    errorCode: 'NODE_DRAIN_REMOTE_UNSUPPORTED',
    error: 'A node drains only itself',
  });
  const cli = createCli(connection);
  await cli.drainNode('node-b');
  t.equal(cli.errors.length, 1);
  t.match(cli.errors[0], /NODE_DRAIN_REMOTE_UNSUPPORTED/);
  t.equal(cli.refreshes, 0);
});

test('read-only mode refuses node management locally', async (t) => {
  const connection = createRecordingConnection({success: true});
  const cli = createCli(connection);
  cli.readOnlyMode = true;
  await cli.removeNode('node-b');
  t.same(connection.calls, []);
  t.equal(cli.errors.length, 1);
});

test('the connection manager calls the admin HTTP operations', async (t) => {
  const requests = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      requests.push({method: req.method, url: req.url,
        body: body ? JSON.parse(body) : null});
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({success: true, outcome: 'applied'}));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.teardown(() => server.close());
  const manager = new ConnectionManager();
  manager.currentAddress = `127.0.0.1:${server.address().port}`;

  t.same(await manager.setConfigValue('logging.level', 'warn'),
    {success: true, outcome: 'applied'});
  await manager.drainNode('node-a');
  await manager.removeNode('node-b');
  t.same(requests, [
    {method: 'PUT', url: ADMIN_OWNER_OPERATION_PATH.configByKey(
      'logging.level'), body: {value: 'warn'}},
    {method: 'POST', url: ADMIN_OWNER_OPERATION_PATH.nodeDrain('node-a'),
      body: {}},
    {method: 'DELETE', url: ADMIN_OWNER_OPERATION_PATH.nodeById('node-b'),
      body: null},
  ]);

  const disconnected = new ConnectionManager();
  t.equal((await disconnected.drainNode('node-a')).success, false);
});
