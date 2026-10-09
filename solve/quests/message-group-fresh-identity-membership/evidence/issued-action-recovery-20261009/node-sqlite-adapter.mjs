// Diagnostic adapter only. This is NOT better-sqlite3 or a production binding.
// The existing low-level Raft fixture needs these synchronous SQLite methods.
import {DatabaseSync} from 'node:sqlite';

export default class DiagnosticDatabase {
  constructor(filename, options = {}) {
    this.db = new DatabaseSync(filename, {readOnly: options.readonly === true});
    this.name = filename;
    this.open = true;
    this.readonly = options.readonly === true;
  }
  get inTransaction() {
    return this.db.isTransaction;
  }
  exec(sql) {
    this.db.exec(sql);
    return this;
  }
  prepare(sql) {
    const s = this.db.prepare(sql);
    const statement = {
      safeIntegers(enabled = true) {
        s.setReadBigInts(enabled);
        return statement;
      },
      get: (...args) => s.get(...args),
      all: (...args) => s.all(...args),
      run: (...args) => s.run(...args),
    };
    return statement;
  }
  pragma(sql, options = {}) {
    const rows = this.db.prepare(`PRAGMA ${sql}`).all();
    return options.simple ? Object.values(rows[0] || {})[0] : rows;
  }
  transaction(fn) {
    const run = (...args) => {
      if (this.inTransaction) throw new Error('diagnostic forbids nested transaction');
      this.exec('BEGIN');
      try {
        const result = fn(...args);
        if (result && typeof result.then === 'function') {
          throw new Error('diagnostic transaction must not suspend');
        }
        this.exec('COMMIT');
        return result;
      } catch (error) {
        this.exec('ROLLBACK');
        throw error;
      }
    };
    return run;
  }
  close() {
    this.db.close();
    this.open = false;
  }
}
