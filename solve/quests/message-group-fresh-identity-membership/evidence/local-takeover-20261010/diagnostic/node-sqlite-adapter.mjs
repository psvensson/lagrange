// Diagnostic adapter only. This is NOT better-sqlite3 or a production binding.
// The existing low-level Raft fixture needs these synchronous SQLite methods.
import {DatabaseSync, backup} from 'node:sqlite';

export default class DiagnosticDatabase {
  constructor(filename, options = {}) {
    this.db = new DatabaseSync(filename, {readOnly: options.readonly === true});
    this.name = filename;
    this.readonly = options.readonly === true;
  }
  // Observe actual SQLite resource/transaction state, including raw BEGIN.
  // Do not let a hand-maintained boolean serve as reconstruction evidence.
  get open() { return this.db.isOpen; }
  get inTransaction() { return this.db.isTransaction; }
  exec(sql) {
    this.db.exec(sql);
    return this;
  }
  prepare(sql) {
    const s = this.db.prepare(sql);
    const statement = {
      reader: s.columns().length > 0,
      safeIntegers(enabled = true) {
        s.setReadBigInts(enabled);
        return statement;
      },
      get: (...args) => { const row = s.get(...args.map(value => value === undefined ? null : value)); return row === undefined ? undefined : {...row}; },
      all: (...args) => s.all(...args.map(value => value === undefined ? null : value)).map(row => ({...row})),
      run: (...args) => s.run(...args.map(value => value === undefined ? null : value)),
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
        if (this.inTransaction) this.exec('ROLLBACK');
        throw error;
      }
    };
    return run;
  }
  backup(destination) { return backup(this.db, destination); }
  close() {
    this.db.close();
  }
}
