// The rowid rules of the statement-admission owner (TX1 design revision 10,
// section 3.3, R1-R3; owner rowid acceptance conditions 1-3). Random rowid
// allocation happens only when a table's maximum rowid is 2^63-1 at the
// moment of allocation; these rules keep that moment unreachable on every
// ordinary write path:
// - R1 (text): an alias token (rowid, _rowid_, oid; bare, quoted, or the last
//   part of a qualified name) is admitted only inside the top-level WHERE of
//   an UPDATE or DELETE head (the schema-migration backfill's rowid range);
//   anywhere in an INSERT, REPLACE or WITH write it refuses.
// - R2 (text, params, schema): on an INTEGER PRIMARY KEY table, a statement
//   that can allocate a key (some row's key is NULL, omitted, an expression,
//   SELECT-sourced, or a param that is neither an integer number nor
//   canonical decimal text of an int64) refuses REPLACE resolution and a
//   DO UPDATE that assigns the key: those could delete or rekey the top row
//   after an allocation and hide it from the post-statement check.
// - R3 (state): the own table's maximum rowid, read as an exact BigInt, must
//   be below 2^62 before an allocating statement (legacy state) and after it.
//   Without R1/R2 refusals an allocating statement only adds rows, so its
//   final maximum bounds every intermediate one.
import {asciiLower} from './partition-statement-admission-lexer.js';
import {setListTargets} from './partition-statement-admission-names.js';
import {
  PARTITION_ROWID_ALIASES as ROWID_ALIASES,
  PARTITION_ROWID_LIMIT as ROWID_LIMIT,
  PARTITION_STATEMENT_CHAR as CHAR,
  PARTITION_STATEMENT_INTEGER_TEXT as INTEGER_TEXT,
  PARTITION_STATEMENT_KEYWORD as KEYWORD,
  PARTITION_STATEMENT_SHAPE_SQL as SHAPE_SQL,
  PARTITION_STATEMENT_TOKEN as TOKEN,
} from './partition-statement-admission-constants.js';

// --- the table shape: read through the owner's own code-built statements
// (prepared once per connection), fresh for every admitted statement ---

const ABSENT_SHAPE = Object.freeze({exists: false, withoutRowid: false,
  columns: Object.freeze([]), integerPrimaryKey: null, maxRowid: null});
const statementsByConnection = new WeakMap();

function quoteIdentifier(name) {
  return CHAR.DOUBLE_QUOTE +
    String(name).replaceAll(CHAR.DOUBLE_QUOTE, CHAR.DOUBLE_QUOTE + CHAR.DOUBLE_QUOTE) +
    CHAR.DOUBLE_QUOTE;
}

function connectionStatements(db) {
  let statements = statementsByConnection.get(db);
  if (statements === undefined) {
    statements = {
      tableList: db.prepare(SHAPE_SQL.TABLE_LIST),
      tableInfo: db.prepare(SHAPE_SQL.TABLE_INFO),
      primaryKeyIndex: db.prepare(SHAPE_SQL.PRIMARY_KEY_INDEX),
      mainIndexTable: db.prepare(SHAPE_SQL.MAIN_INDEX_TABLE),
      tempIndexTable: db.prepare(SHAPE_SQL.TEMP_INDEX_TABLE),
      maxRowidBySql: new Map(),
    };
    statementsByConnection.set(db, statements);
  }
  return statements;
}

// The own table's maximum-rowid read, as an exact BigInt.
function maxRowidStatement(db, statements, rowidName, tableName) {
  const sql = SHAPE_SQL.maxRowid(rowidName, quoteIdentifier(tableName));
  if (!statements.maxRowidBySql.has(sql)) {
    statements.maxRowidBySql.set(sql, db.prepare(sql).safeIntegers(true));
  }
  return statements.maxRowidBySql.get(sql);
}

// SQLite's own alias rule, read from the schema: a rowid table whose primary
// key is one column and has no primary-key index (`INTEGER PRIMARY KEY DESC`
// and `INT PRIMARY KEY` get one, and are not aliases).
function aliasKeyColumn(statements, tableName, keys) {
  if (keys.length !== 1 ||
      statements.primaryKeyIndex.get(tableName).count !== 0) {
    return null;
  }
  return asciiLower(keys[0].name);
}

/**
 * The shape of a main-database table on a connection, read now: whether it
 * exists, is a WITHOUT ROWID table, its columns (ASCII lower-case,
 * declaration order), its INTEGER PRIMARY KEY alias column (or null), and its
 * maximum-rowid read (null without a rowid, or when a column shadows each of
 * the three alias names).
 * @param {Object} db - The partition's connection.
 * @param {string|null} tableName - The table.
 * @return {Object} The frozen shape.
 */
function readTableShape(db, tableName) {
  if (typeof tableName !== 'string' || tableName.length === 0) {
    return ABSENT_SHAPE;
  }
  const statements = connectionStatements(db);
  const listed = statements.tableList.get(tableName);
  if (listed === undefined) {
    return ABSENT_SHAPE;
  }
  const withoutRowid = listed.wr === 1;
  const columns = statements.tableInfo.all(tableName);
  const names = columns.map((column) => asciiLower(column.name));
  const rowidName = withoutRowid ? null :
    ROWID_ALIASES.find((alias) => !names.includes(alias)) ?? null;
  return Object.freeze({
    exists: true,
    withoutRowid,
    columns: Object.freeze(names),
    integerPrimaryKey: withoutRowid ? null : aliasKeyColumn(statements, tableName,
      columns.filter((column) => column.pk > 0)),
    maxRowid: rowidName === null ? null :
      maxRowidStatement(db, statements, rowidName, tableName),
  });
}

/**
 * The table an index of the given name belongs to: in the temporary schema
 * (searched first by an unqualified DROP INDEX) or the main one.
 * @param {Object} db - The partition's connection.
 * @param {string} indexName - The index name.
 * @return {{temporary: boolean, tableName: (string|null)}} Its table.
 */
function readIndexTable(db, indexName) {
  const statements = connectionStatements(db);
  const temporary = statements.tempIndexTable.get(indexName);
  if (temporary !== undefined) {
    return {temporary: true, tableName: temporary.tableName};
  }
  const main = statements.mainIndexTable.get(indexName);
  return {temporary: false, tableName: main?.tableName ?? null};
}

// --- R3: the ceiling ---

/**
 * Whether a table's maximum rowid is at or above 2^62 (an exact BigInt
 * comparison). A WITHOUT ROWID or absent table has no rowid; a table whose
 * three alias names are all shadowed by columns fails closed.
 * @param {Object} shape - The table's shape (readTableShape).
 * @return {boolean} Whether an allocating statement is refused.
 */
function isAtRowidCeiling(shape) {
  if (!shape.exists || shape.withoutRowid) {
    return false;
  }
  if (shape.maxRowid === null) {
    return true;
  }
  const maximum = shape.maxRowid.get()?.maximum ?? null;
  return maximum !== null && BigInt(maximum) >= ROWID_LIMIT.CEILING;
}

// --- R1: alias tokens ---

function isAliasToken(tokens, index) {
  const token = tokens[index];
  return token.identifier !== null && ROWID_ALIASES.includes(token.identifier) &&
    tokens[index + 1]?.text !== CHAR.DOT;
}

const WHERE_REGION_ENDS = new Set([KEYWORD.RETURNING, KEYWORD.ORDER,
  KEYWORD.LIMIT]);
const WHERE_REGION_HEADS = new Set([KEYWORD.UPDATE, KEYWORD.DELETE]);

// The token range of an UPDATE's or DELETE's top-level WHERE clause: from
// WHERE at depth 0 to the next RETURNING, ORDER, LIMIT or `;` at depth 0.
function topLevelWhereRegion(tokens) {
  const start = tokens.findIndex((token) => token.depth === 0 &&
    token.upper === KEYWORD.WHERE);
  if (start < 0) {
    return null;
  }
  const after = tokens.slice(start + 1).findIndex((token) => token.depth === 0 &&
    (WHERE_REGION_ENDS.has(token.upper) || token.text === CHAR.SEMICOLON));
  return {start, end: after < 0 ? tokens.length : start + 1 + after};
}

/**
 * R1 on the ordinary path: whether the statement carries an alias token
 * outside an UPDATE's or DELETE's top-level WHERE clause.
 * @param {{head: string, tokens: Array<Object>}} lexed - The lexed write.
 * @return {boolean} Whether R1 refuses it.
 */
function hasUnadmittedRowidAlias(lexed) {
  const {tokens} = lexed;
  const region = WHERE_REGION_HEADS.has(lexed.head) ?
    topLevelWhereRegion(tokens) : null;
  return tokens.some((token, index) => isAliasToken(tokens, index) &&
    !(region !== null && index > region.start && index < region.end));
}

// --- R2: allocation on INTEGER PRIMARY KEY tables ---

function hasReplaceResolution(tokens) {
  return tokens.some((token, index) => token.upper === KEYWORD.REPLACE &&
    tokens[index + 1]?.text !== CHAR.OPEN_PAREN);
}

function doUpdateStarts(tokens) {
  const starts = [];
  tokens.forEach((token, index) => {
    if (token.upper === KEYWORD.DO && tokens[index + 1]?.upper === KEYWORD.UPDATE) {
      starts.push(index + 2);
    }
  });
  return starts;
}

// The index of the `)` closing the `(` at `open` (paired by the lexer).
function closingParen(tokens, open) {
  return tokens[open]?.close ?? tokens.length;
}

// Whether some DO UPDATE assigns the key (any DO UPDATE when the key is not
// known, or its SET list cannot be read). A single-quoted target is a name
// (partition-statement-admission-names.js), so `SET 'id' = ...` assigns.
function doUpdateAssignsKey(tokens, keyColumn) {
  return doUpdateStarts(tokens).some((setIndex) => {
    const targets = setListTargets(tokens, setIndex);
    return keyColumn === null || targets === null ||
      targets.some((target) => target.identifier === keyColumn);
  });
}

function isIdentifierToken(token) {
  return token?.identifier !== null && token?.identifier !== undefined;
}

const MAIN_SCHEMA = asciiLower(KEYWORD.MAIN);

// [schema .] name [AS alias] from the name token at `at`: the table's name
// (null outside the main schema) and the index after it.
function qualifiedTarget(tokens, at) {
  const qualified = tokens[at + 1]?.text === CHAR.DOT;
  const nameToken = qualified ? tokens[at + 2] : tokens[at];
  const inMain = !qualified || tokens[at].identifier === MAIN_SCHEMA;
  let next = at + 1;
  if (qualified) {
    next += 2;
  }
  if (tokens[next]?.upper === KEYWORD.AS) {
    next += 2;
  }
  return {tableName: inMain && isIdentifierToken(nameToken) ? nameToken.value : null,
    next};
}

// The target of an INSERT or REPLACE whose keyword is at `start`
// (`INSERT [OR <resolution>] INTO` or `REPLACE INTO`), or null.
function insertTarget(tokens, start) {
  let index = start + 1;
  if (tokens[start].upper === KEYWORD.INSERT && tokens[index]?.upper === KEYWORD.OR) {
    index += 2;
  }
  if (tokens[index]?.upper !== KEYWORD.INTO || !isIdentifierToken(tokens[index + 1])) {
    return null;
  }
  return qualifiedTarget(tokens, index + 1);
}

// The comma-separated elements of the parenthesized list opened at `open`.
function listElements(tokens, open) {
  const close = closingParen(tokens, open);
  const elements = [[]];
  for (let index = open + 1; index < close; index += 1) {
    const token = tokens[index];
    if (token.depth === tokens[open].depth + 1 && token.text === CHAR.COMMA) {
      elements.push([]);
    } else {
      elements.at(-1).push(token);
    }
  }
  return {elements, close};
}

// Whether the token after a VALUES list ends the insert's source: the end of
// the text, `;`, RETURNING or ON CONFLICT. Anything else (UNION, UNION ALL,
// EXCEPT, INTERSECT) makes the source a compound SELECT.
function endsValuesSource(tokens, index) {
  const token = tokens[index];
  return token === undefined || token.text === CHAR.SEMICOLON ||
    token.upper === KEYWORD.RETURNING ||
    (token.upper === KEYWORD.ON && tokens[index + 1]?.upper === KEYWORD.CONFLICT);
}

// The rows of the VALUES list starting at `start`, or null when its source
// is not that list alone (a compound) - then it can allocate.
function valuesRows(tokens, start) {
  const rows = [];
  let index = start;
  while (tokens[index]?.text === CHAR.OPEN_PAREN) {
    const {elements, close} = listElements(tokens, index);
    rows.push(elements);
    index = close + 1;
    if (tokens[index]?.text === CHAR.COMMA) {
      index += 1;
    } else {
      break;
    }
  }
  return endsValuesSource(tokens, index) ? rows : null;
}

/**
 * The parsed INSERT or REPLACE at token `start`: its target table, its column
 * list (null when absent) and its VALUES rows (null for a SELECT or DEFAULT
 * VALUES source); null when the statement does not parse as one.
 * @param {Array<Object>} tokens - The lexed tokens.
 * @param {number} start - The index of the INSERT or REPLACE keyword.
 * @return {Object|null} The parsed insert.
 */
function parseInsert(tokens, start) {
  const target = insertTarget(tokens, start);
  if (target === null) {
    return null;
  }
  let index = target.next;
  let columns = null;
  if (tokens[index]?.text === CHAR.OPEN_PAREN) {
    const list = listElements(tokens, index);
    columns = list.elements.map((element) => element[0]?.identifier ?? null);
    index = list.close + 1;
  }
  const rows = tokens[index]?.upper === KEYWORD.VALUES ?
    valuesRows(tokens, index + 1) : null;
  return {tableName: target.tableName, columns, rows};
}

// The positional value of each plain `?` param: resolvable only when every
// param token is a plain `?` and every bound value is a scalar (better-sqlite3
// spreads arrays and binds objects by name).
function positionalParams(tokens, params) {
  const paramTokens = tokens.filter((token) => token.type === TOKEN.PARAM);
  const scalar = (value) => value === null || typeof value !== 'object' ||
    Buffer.isBuffer(value);
  if (!paramTokens.every((token) => token.text === CHAR.QUESTION) ||
      !params.every(scalar)) {
    return new Map();
  }
  return new Map(paramTokens.map((token, ordinal) => [token, {value: params[ordinal]}]));
}

function isInt64(value) {
  return value >= ROWID_LIMIT.INT64_MIN && value <= ROWID_LIMIT.INT64_MAX;
}

// An integer number, or canonical decimal text of an int64 (revision 10, AT).
function isExplicitIntegerValue(value) {
  if (typeof value === 'number') {
    return Number.isInteger(value);
  }
  return typeof value === 'string' && INTEGER_TEXT.CANONICAL_DECIMAL.test(value) &&
    isInt64(BigInt(value));
}

function isSign(token) {
  return token?.text === CHAR.DASH || token?.text === CHAR.PLUS;
}

// An integer literal, optionally signed, within the int64 range.
function isIntegerLiteral(element) {
  const signed = element.length === 2 && isSign(element[0]);
  const digits = signed ? element[1] : element[0];
  if (element.length !== (signed ? 2 : 1) || digits.type !== TOKEN.NUMBER ||
      !INTEGER_TEXT.LITERAL_DIGITS.test(digits.text)) {
    return false;
  }
  const magnitude = BigInt(digits.text);
  return isInt64(element[0].text === CHAR.DASH ? -magnitude : magnitude);
}

function isExplicitKey(element, positional) {
  if (element === undefined) {
    return false;
  }
  if (element.length === 1 && element[0].type === TOKEN.PARAM) {
    const bound = positional.get(element[0]);
    return bound !== undefined && isExplicitIntegerValue(bound.value);
  }
  return isIntegerLiteral(element);
}

// Whether some row's key is not an explicit integer.
function canAllocateKey(insert, shape, tokens, params) {
  if (insert === null || insert.rows === null || insert.rows.length === 0) {
    return true;
  }
  // SQLite takes the INTEGER PRIMARY KEY's LAST mention in a column list
  // (sqlite3Insert's ipkColumn).
  const columns = insert.columns ?? shape.columns;
  const keyPosition = columns.lastIndexOf(shape.integerPrimaryKey);
  if (shape.integerPrimaryKey === null || keyPosition < 0) {
    return true;
  }
  const positional = positionalParams(tokens, params);
  return insert.rows.some((row) => !isExplicitKey(row[keyPosition], positional));
}

const INSERT_KEYWORDS = new Set([KEYWORD.INSERT, KEYWORD.REPLACE]);

/**
 * R2 on the ordinary path: whether a write on an INTEGER PRIMARY KEY table
 * that can allocate a key carries REPLACE resolution or a DO UPDATE that
 * assigns the key. A WITH write can always allocate (its source is not read);
 * a target the owner cannot resolve is treated as an INTEGER PRIMARY KEY
 * table whose key is unknown.
 * @param {Object} db - The partition's connection.
 * @param {{head: string, tokens: Array<Object>}} lexed - The lexed write.
 * @param {Array} params - The bound params.
 * @param {string|null} ownTableName - The partition's own table.
 * @return {boolean} Whether R2 refuses it.
 */
function refusesKeyAllocation(db, lexed, params, ownTableName) {
  const {tokens} = lexed;
  const replace = hasReplaceResolution(tokens);
  if (!replace && doUpdateStarts(tokens).length === 0) {
    return false;
  }
  const start = tokens.findIndex((token) => token.depth === 0 &&
    INSERT_KEYWORDS.has(token.upper));
  const insert = start < 0 ? null : parseInsert(tokens, start);
  const shape = readTableShape(db, insert === null ? ownTableName : insert.tableName);
  if (shape.exists && shape.integerPrimaryKey === null) {
    return false;
  }
  if (!replace && !doUpdateAssignsKey(tokens, shape.integerPrimaryKey)) {
    return false;
  }
  return lexed.head === KEYWORD.WITH || canAllocateKey(insert, shape, tokens, params);
}

export {
  hasUnadmittedRowidAlias,
  isAtRowidCeiling,
  readIndexTable,
  readTableShape,
  refusesKeyAllocation,
};
