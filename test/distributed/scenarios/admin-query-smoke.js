/**
 * Scenario: Admin Query Smoke
 *
 * Starts a cluster and validates that basic admin SQL queries
 * execute successfully through the distributed harness.
 */

async function run(cluster) {
  const node = cluster.getNodes()[0];
  const now = Date.now();
  const logId = 'smoke-' + now;
  const queries = [
    'INSERT INTO logs (log_id, timestamp, level, node_id, message, created_at) ' +
      'VALUES (\'' + logId + '\', ' + now + ', \'info\', \'' + node.id +
      '\', \'smoke\', ' + now + ')',
    'SELECT * FROM logs WHERE log_id = \'' + logId + '\'',
  ];
  for (const sql of queries) {
    try {
      await node.query(sql);
    } catch (err) {
      throw new Error(
        'Admin query failed for SQL "' + sql + '": ' + err.message,
      );
    }
  }

  return {queries: queries.length};
}

export {run};
