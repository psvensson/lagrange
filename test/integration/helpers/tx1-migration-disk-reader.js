// Read-only, new-process verification of the seed M1 witness's exact database
// files after orderly shutdown. This is not a coordinator restart or power-loss
// simulation. No runtime, cache or query-gateway implementation is loaded here.
import fs from 'node:fs';
import Database from 'better-sqlite3';

const requests = JSON.parse(fs.readFileSync(process.stdin.fd, 'utf8'));
const observations = requests.map(({replicaId, dbPath, sql, params}) => {
  const db = new Database(dbPath, {readonly: true, fileMustExist: true});
  try {
    return {replicaId, rows: db.prepare(sql).all(...params)};
  } finally {
    db.close();
  }
});
process.stdout.write(JSON.stringify(observations));
