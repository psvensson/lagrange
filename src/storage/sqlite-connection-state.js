// What one SQLite connection's owners compile and derive from it, held on the
// connection itself for exactly the connection's lifetime.
//
// Statements. Code-built SQL that runs per raft turn, per message or per
// apply is compiled once per connection and then only executed: compiling is
// most of such a statement's cost (seed CPU profile 2026-11-18: db.prepare
// was 15.8% of the busy seed). The two integer modes are held apart, so no
// caller's safeIntegers choice changes what another caller reads. A schema
// change needs nothing here: SQLite recompiles a held statement whose schema
// changed when it next runs, so it reads the current schema (an added column
// appears; a dropped table answers "no such table" as a fresh prepare does).
// A connection that is no longer open holds nothing: what it held is released
// and a request answers what a prepare on that connection answers.
//
// Committed facts. A value an owner derives from this connection's rows (a
// raft group's snapshot index, the peer-identity view) is derived once and
// then answered from memory. The owner that writes those rows forgets the
// fact at each write, so the next read derives the new value once: the fact
// follows the write that changes it and is never re-read in between. A write
// made inside a transaction may still roll back, so until this connection is
// next seen outside a transaction a fact forgotten there is not held: each
// read derives it from the connection, which sees its own uncommitted rows
// exactly as SQL does, and nothing uncommitted outlives the transaction.

const CONNECTION_STATE = Symbol('sqliteConnectionState');

/**
 * The statements and committed facts of one SQLite connection.
 */
class SqliteConnectionState {
  #db;
  #statements = new Map();
  #exactStatements = new Map();
  #boundedStatements = new Map();
  // fact -> Map<subject, value>
  #facts = new Map();
  // fact -> Set<subject>: forgotten inside a transaction not yet seen to end.
  #forgottenInTransaction = new Map();
  // fact -> {schemaVersion, values: Map<subject, value>}
  #schemaFacts = new Map();
  // fact -> {appChanges, dv, sv, value}
  #appStampedFacts = new Map();
  #nonApplicationChanges = 0;

  /**
   * @param {Object} db - The better-sqlite3 connection this state belongs to.
   */
  constructor(db) {
    this.#db = db;
  }

  /**
   * The connection's statement for `sql`, compiled on first use.
   * @param {string} sql - Code-built SQL text.
   * @return {Object} The statement, in the connection's integer mode.
   */
  statement(sql) {
    return this.#held(this.#statements, sql, () => this.#db.prepare(sql));
  }

  /**
   * The connection's exact-integer statement for `sql`: every integer it
   * reads is a BigInt.
   * @param {string} sql - Code-built SQL text.
   * @return {Object} The statement, with safe integers on.
   */
  exactStatement(sql) {
    return this.#held(this.#exactStatements, sql,
      () => this.#db.prepare(sql).safeIntegers(true));
  }

  /**
   * A fact derived from this connection's committed rows: held after its
   * first derivation until its writer forgets it.
   * @param {string} fact - The fact's name, owned by the module deriving it.
   * @param {*} subject - What the fact is about (a group id, a table).
   * @param {Function} derive - Reads the fact from the connection.
   * @return {*} The fact.
   */
  committedFact(fact, subject, derive) {
    if (!this.#observeConnection() ||
        this.#forgottenInTransaction.get(fact)?.has(subject) === true) {
      return derive();
    }
    let held = this.#facts.get(fact);
    if (held === undefined) {
      held = new Map();
      this.#facts.set(fact, held);
    }
    if (!held.has(subject)) {
      held.set(subject, derive());
    }
    return held.get(subject);
  }

  /**
   * Forget a fact: called by its writer at each write of the rows it is
   * derived from.
   * @param {string} fact - The fact's name.
   * @param {*} subject - What the written rows are about.
   */
  forgetFact(fact, subject) {
    this.#facts.get(fact)?.delete(subject);
    if (this.#db.inTransaction !== true) {
      return;
    }
    let forgotten = this.#forgottenInTransaction.get(fact);
    if (forgotten === undefined) {
      forgotten = new Set();
      this.#forgottenInTransaction.set(fact, forgotten);
    }
    forgotten.add(subject);
  }

  /**
   * Record DML row changes performed exclusively on non-application bookkeeping
   * tables (such as durable Raft log/state tables) so application-table change
   * stamps can distinguish application writes from consensus bookkeeping.
   * @param {number} changes - Row-change count returned by SQLite `.run()`.
   */
  recordNonApplicationChanges(changes) {
    if (Number.isSafeInteger(changes) && changes > 0) {
      this.#nonApplicationChanges += changes;
    }
  }

  /**
   * Execute a prepared non-application DML statement and record its row-change
   * count against this connection's non-application change tally.
   * @param {string} sql - Code-built DML SQL text targeting non-application tables.
   * @param {...*} params - Bound parameters.
   * @return {Object} The statement's run result.
   */
  runNonApplication(sql, ...params) {
    const result = this.statement(sql).run(...params);
    if (result && result.changes > 0) {
      this.#nonApplicationChanges += result.changes;
    }
    return result;
  }

  /**
   * Cumulative DML row changes recorded via non-application writes on this open
   * connection.
   * @return {number} Non-application change count.
   */
  getNonApplicationChanges() {
    this.#observeConnection();
    return this.#nonApplicationChanges;
  }

  /**
   * The connection's statement for `sql`, retained in a bounded LRU map so
   * dynamic SQL templates stay compiled without unbounded memory growth.
   * @param {string} sql - Parameterized SQL text.
   * @param {number} maxEntries - Maximum retained compiled statements.
   * @return {Object} The prepared statement.
   */
  boundedStatement(sql, maxEntries) {
    if (!this.#observeConnection()) {
      return this.#db.prepare(sql);
    }
    let statement = this.#boundedStatements.get(sql);
    if (statement !== undefined) {
      this.#boundedStatements.delete(sql);
      this.#boundedStatements.set(sql, statement);
      return statement;
    }
    statement = this.#db.prepare(sql);
    if (this.#boundedStatements.size >= maxEntries) {
      this.#boundedStatements.delete(this.#boundedStatements.keys().next().value);
    }
    this.#boundedStatements.set(sql, statement);
    return statement;
  }

  /**
   * A schema-derived fact for `(fact, subject)` retained while `schemaVersion`
   * matches and the connection is outside an uncommitted transaction.
   * @param {string} fact - Fact name owned by caller.
   * @param {*} subject - Subject key (e.g. table name).
   * @param {number} schemaVersion - Connection's current `pragma_schema_version`.
   * @param {Function} derive - Computes the fact when not already held.
   * @return {*} The derived fact.
   */
  schemaVersionedFact(fact, subject, schemaVersion, derive) {
    if (!this.#observeConnection()) {
      return derive();
    }
    let held = this.#schemaFacts.get(fact);
    if (held !== undefined && held.schemaVersion === schemaVersion) {
      const existing = held.values.get(subject);
      if (existing !== undefined) return existing;
    }
    const value = derive();
    if (this.#db.inTransaction !== true) {
      if (held === undefined || held.schemaVersion !== schemaVersion) {
        held = {schemaVersion, values: new Map()};
        this.#schemaFacts.set(fact, held);
      }
      held.values.set(subject, value);
    }
    return value;
  }

  /**
   * An application-table fact stamped by `(appChanges, dv, sv)` where
   * `appChanges = stamp.tc - nonApplicationChanges`. Safe to reuse across
   * non-application Raft-store writes and inside transactions prior to any
   * application mutation; uncommitted derivations are never retained.
   * @param {string} fact - Fact name owned by caller.
   * @param {{tc: number, dv: number, sv: number}} stamp - Connection change stamp.
   * @param {Function} derive - Computes the fact when stamp advances.
   * @return {*} The derived fact.
   */
  applicationStampedFact(fact, stamp, derive) {
    if (!this.#observeConnection()) {
      this.#appStampedFacts.delete(fact);
      return derive();
    }
    const appChanges = stamp.tc - this.#nonApplicationChanges;
    const held = this.#appStampedFacts.get(fact);
    if (held !== undefined &&
        held.appChanges === appChanges &&
        held.dv === stamp.dv &&
        held.sv === stamp.sv) {
      return held.value;
    }
    const value = derive();
    if (this.#db.inTransaction === true) {
      this.#appStampedFacts.delete(fact);
    } else {
      this.#appStampedFacts.set(fact, {
        appChanges,
        dv: stamp.dv,
        sv: stamp.sv,
        value,
      });
    }
    return value;
  }

  // Whether the connection is open. A closed connection releases everything
  // it held; a connection outside any transaction ends the forgetting of the
  // transactions it has left (committed or rolled back, the next derivation
  // reads what they left).
  #observeConnection() {
    if (this.#db.open !== true) {
      this.#statements.clear();
      this.#exactStatements.clear();
      this.#boundedStatements.clear();
      this.#facts.clear();
      this.#forgottenInTransaction.clear();
      this.#schemaFacts.clear();
      this.#appStampedFacts.clear();
      this.#nonApplicationChanges = 0;
      return false;
    }
    if (this.#db.inTransaction !== true) {
      this.#forgottenInTransaction.clear();
    }
    return true;
  }

  #held(statements, sql, prepare) {
    if (!this.#observeConnection()) {
      return prepare();
    }
    let statement = statements.get(sql);
    if (statement === undefined) {
      statement = prepare();
      statements.set(sql, statement);
    }
    return statement;
  }
}

/**
 * The state of one connection, created on first use and held by the
 * connection for its lifetime.
 * @param {Object} db - A better-sqlite3 connection.
 * @return {SqliteConnectionState} Its state.
 */
function sqliteConnectionState(db) {
  if (!Object.hasOwn(db, CONNECTION_STATE)) {
    Object.defineProperty(db, CONNECTION_STATE,
      {value: new SqliteConnectionState(db)});
  }
  return db[CONNECTION_STATE];
}

export {sqliteConnectionState};
