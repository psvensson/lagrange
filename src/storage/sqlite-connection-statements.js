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

const CONNECTION_STATEMENTS = Symbol('sqliteConnectionStatements');

/**
 * The prepared statements and committed facts of one SQLite connection.
 */
class SqliteConnectionStatements {
  #db;
  #statements = new Map();
  #exactStatements = new Map();
  // fact -> Map<subject, value>
  #facts = new Map();
  // fact -> Set<subject>: forgotten inside a transaction not yet seen to end.
  #forgottenInTransaction = new Map();

  /**
   * @param {Object} db - The better-sqlite3 connection whose statements and
   *   committed facts are held.
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

  // Whether the connection is open. A closed connection releases everything
  // it held; a connection outside any transaction ends the forgetting of the
  // transactions it has left (committed or rolled back, the next derivation
  // reads what they left).
  #observeConnection() {
    if (this.#db.open !== true) {
      this.#statements.clear();
      this.#exactStatements.clear();
      this.#facts.clear();
      this.#forgottenInTransaction.clear();
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
 * The prepared statements and committed facts of one connection, created on
 * first use and held on the connection for its lifetime.
 * @param {Object} db - A better-sqlite3 connection.
 * @return {SqliteConnectionStatements} Its connection-held statements.
 */
function sqliteConnectionStatements(db) {
  if (!Object.hasOwn(db, CONNECTION_STATEMENTS)) {
    Object.defineProperty(db, CONNECTION_STATEMENTS,
      {value: new SqliteConnectionStatements(db)});
  }
  return db[CONNECTION_STATEMENTS];
}

export {sqliteConnectionStatements};
