import {test} from '../../src/test-helpers/tap.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {TABLES} from '../../src/constants/index.js';
const ID = 'p-1-r1';
const row = (c, s, u, extra = {}) => ({service_id: ID, service_type: 'partition',
  partition_id: 'p-1', node_id: 'node-a', replica_id: ID, status: 'stopped',
  created_at: c, state_entered_at: s, updated_at: u, ...extra});
const pred = (r) => ({service_id: r.service_id, service_type: r.service_type,
  partition_id: r.partition_id, node_id: r.node_id, status: r.status,
  created_at: r.created_at, state_entered_at: r.state_entered_at});

test('A1 skew: delayed G1 delete (G1 clock ahead) vs G2 row with older stamps', async (t) => {
  const cache = new SystemTableCache();
  const g1 = row(5000, 5100, 5100);
  const g2 = row(3000, 3000, 3000); // recreated elsewhere/after clock step-back
  cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', g2);
  cache.applySystemTableChange(TABLES.SERVICES, 'DELETE', pred(g1));
  t.equal(cache.get(TABLES.SERVICES, ID)?.created_at, 3000, 'G2 survives G1 delete whose predicate names another created_at');
});
test('A1b equal ms: delayed G1 delete pred ts == G2 updated_at', async (t) => {
  const cache = new SystemTableCache();
  const g1 = row(4000, 4100, 4100);
  const g2 = row(4000 - 1, 4000, 4000);
  cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', g2);
  cache.applySystemTableChange(TABLES.SERVICES, 'DELETE', pred(g1));
  t.equal(cache.get(TABLES.SERVICES, ID)?.created_at, 3999, 'G2 survives');
});
test('A1c mixed HLC: G2 hydrated w/o HLC, delayed G1 delete with HLC, normal clocks', async (t) => {
  const cache = new SystemTableCache();
  const g1 = row(1000, 1100, 1100);
  const g2 = row(2000, 2000, 2000);
  cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', g2);
  cache.applySystemTableChange(TABLES.SERVICES, 'DELETE', {...pred(g1), updated_at_hlc: '1200-0-node-a'});
  t.equal(cache.get(TABLES.SERVICES, ID)?.created_at, 2000, 'G2 survives');
});
test('A2 G2 after G1 delete tombstone, normal clocks', async (t) => {
  const cache = new SystemTableCache();
  const g1 = row(1000, 1100, 1100);
  cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', g1);
  cache.applySystemTableChange(TABLES.SERVICES, 'UPDATE', {service_id: ID, created_at: 1000, raft_role: 'leader', updated_at: 1500});
  cache.applySystemTableChange(TABLES.SERVICES, 'DELETE', pred(g1));
  const g2 = row(1400, 1400, 1400); // G2 created at 1400 < G1 role-write 1500 (skew/other node)
  cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', g2);
  t.equal(cache.get(TABLES.SERVICES, ID)?.created_at, 1400, 'G2 insert admitted past G1 tombstone');
});
test('A3 late G1 UPDATE after G2 insert cannot rewrite G2', async (t) => {
  const cache = new SystemTableCache();
  const g2 = row(2000, 2000, 2000, {status: 'active'});
  cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', g2);
  cache.applySystemTableChange(TABLES.SERVICES, 'UPDATE', {...row(1000, 1900, 1900), status: 'removing'});
  const got = cache.get(TABLES.SERVICES, ID);
  t.equal(got?.created_at, 2000, 'G2 created_at kept'); t.equal(got?.status, 'active', 'G2 status kept');
});
test('A3b late G1 UPDATE w/ updated_at > G2 (skew)', async (t) => {
  const cache = new SystemTableCache();
  const g2 = row(2000, 2000, 2000, {status: 'active'});
  cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', g2);
  cache.applySystemTableChange(TABLES.SERVICES, 'UPDATE', {...row(1000, 2100, 2100), status: 'removing'});
  const got = cache.get(TABLES.SERVICES, ID);
  t.equal(got?.created_at, 2000, 'G2 created_at kept'); t.equal(got?.status, 'active', 'G2 status kept');
});
test('A4 delayed G1 cleanup-marker release delete vs G2 live row', async (t) => {
  const cache = new SystemTableCache();
  const g2 = row(3000, 3000, 3000, {status: 'active'});
  cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', g2);
  cache.applySystemTableChange(TABLES.SERVICES, 'DELETE', {service_id: ID, service_type: 'partition_cleanup', partition_id: 'p-1', node_id: 'node-a', status: 'cleanup_owned', cleanup_token: 'tok', updated_at: 2900});
  t.equal(cache.get(TABLES.SERVICES, ID)?.created_at, 3000, 'G2 survives');
});
