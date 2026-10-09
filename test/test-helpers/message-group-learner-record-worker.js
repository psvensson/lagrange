/** Isolated operation worker for the commit-before-record process-loss witness.
 * Native state lives in the parent's actual ports; IPC transports their answers.
 * Operation SQL uses its own normal-driver connection, never canned row replies.
 */
import Database from 'better-sqlite3';
import {ReplicaOperationRepository} from '../../src/rebalancer/replica-operation-repository.js';
import {recordMessageGroupLearnerCommit} from
  '../../src/rebalancer/replica-operation-message-group-membership-authorization.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {refuseUnderProbe} from '../../src/test-helpers/probe-guard.js';

refuseUnderProbe('the learner operation recording process witness');
const options = JSON.parse(process.env.LAGRANGE_RECORD_WORKER);
const db = new Database(options.file);
db.pragma('journal_mode = WAL'); db.pragma('synchronous = FULL');
const pending = new Map();
let serial = 0;
process.on('message', (message) => {
  const request = pending.get(message.id);
  if (message.type !== 'answer' || !request) return;
  pending.delete(message.id);
  if (message.error) request.reject(new Error(message.error));
  else request.resolve(message.answer);
});
function readMembership(request) {
  return new Promise((resolve, reject) => {
    serial += 1; pending.set(serial, {resolve, reject});
    process.send({type: 'read', id: serial, request});
  });
}
function execute(sql, params = []) {
  const statement = db.prepare(sql);
  return statement.reader ? {success: true, rows: statement.all(...params)} :
    {success: true, affectedRows: statement.run(...params).changes};
}
const gateway = {
  async executeQuery(sql, params) {
    if (options.hold && sql.includes('SET message_group_membership_phase')) {
      process.send({type: 'before-row-write', nativeReads: serial,
        inTransaction: db.inTransaction,
        phase: db.prepare('SELECT message_group_membership_phase AS phase FROM replica_operations ' +
          'WHERE operation_id = ?').get(options.request.operationId).phase});
      await new Promise(() => {}); // Parent's measured SIGKILL is the only release.
    }
    return execute(sql, params);
  },
  async readAuthoritativeRows(_table, sql, params) {
    return execute(sql, params);
  },
};
const noLog = {debug() {}, info() {}, warn() {}, error() {}};
const repository = new ReplicaOperationRepository({nodeId: options.nodeId,
  membershipOwnerBootIncarnation: 1, timeSource: new VirtualTimeSource({startMs: options.now}),
  controlPlaneSystemTableGateway: gateway, logger: noLog,
  systemTableCache: {get: () => null, getAll: () => [], filter: () => []},
  cdcIntegrationService: {waitForCacheUpdate: async () => {}},
  authoritativeVisibilityTimeoutMs: 0, authoritativeVisibilityRetryDelayMs: 0});
try {
  const answer = await recordMessageGroupLearnerCommit(repository, options.request, readMembership);
  process.send({type: 'result', outcome: answer.outcome, nativeReads: serial});
} finally {
  db.close(); process.disconnect();
}
