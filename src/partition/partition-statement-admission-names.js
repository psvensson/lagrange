// The statement-admission owner's reading of names (TX1 design revision 10,
// section 3.3; independent review of increment 2, B1 and B2). SQLite takes a
// name wherever its grammar reads `nm`, and `nm` is an identifier or a
// single-quoted string (nm ::= ID | STRING). So `INSERT INTO t ('rowid', id)`
// names the rowid, `UPDATE t SET 'id' = 5` assigns the key, and
// `FROM 'pragma_optimize'(1)` calls a table-valued function. A STRING token
// in one of these positions (measured on SQLite 3.49.2) is the identifier it
// names; anywhere else it is a literal:
// - either side of a `.` (a qualified name: `t.'v'`, `'main'.t`);
// - right before `(` (a table-valued function: `FROM 'pragma_x'(...)`);
// - right after INTO, FROM (not IS DISTINCT FROM), JOIN, AS, INDEX, TABLE,
//   INDEXED BY, and an UPDATE verb (UPDATE [OR <resolution>] <name>);
// - an element of an INSERT column list or of a USING list;
// - an assignment target of a SET list (UPDATE SET and DO UPDATE SET), a
//   row-value target's names included.
// The module also reads a write's target table and the two text rules that
// refuse whatever the statement kind: refused functions and OR ROLLBACK.
import {asciiLower} from './partition-statement-admission-lexer.js';
import {
  PARTITION_STATEMENT_CHAR as CHAR,
  PARTITION_STATEMENT_DETERMINISTIC_WRITE_FUNCTIONS as DETERMINISTIC_WRITE_FUNCTIONS,
  PARTITION_STATEMENT_KEYWORD as KEYWORD,
  PARTITION_STATEMENT_REFUSED_FUNCTION as REFUSED_FUNCTION,
  PARTITION_STATEMENT_TOKEN as TOKEN,
} from './partition-statement-admission-constants.js';

const NAME_INTRODUCERS = new Set([KEYWORD.INTO, KEYWORD.JOIN, KEYWORD.AS,
  KEYWORD.INDEX, KEYWORD.TABLE]);
const SET_LIST_ENDS = new Set([KEYWORD.WHERE, KEYWORD.FROM, KEYWORD.ON,
  KEYWORD.RETURNING]);
const DML_VERBS = new Set([KEYWORD.INSERT, KEYWORD.REPLACE, KEYWORD.UPDATE,
  KEYWORD.DELETE]);
const MAIN_VERBS = new Set([...DML_VERBS, KEYWORD.SELECT]);
const MAIN_SCHEMA = asciiLower(KEYWORD.MAIN);

function markName(token) {
  if (token?.type === TOKEN.STRING) {
    token.identifier = asciiLower(token.value);
  }
}

function isUpdateVerb(tokens, index) {
  return tokens[index]?.upper === KEYWORD.UPDATE &&
    tokens[index - 1]?.upper !== KEYWORD.DO;
}

// Whether the keyword before the STRING at `index` introduces a name.
function followsNameIntroducer(tokens, index) {
  const before = tokens[index - 1]?.upper;
  if (before === KEYWORD.FROM) {
    return tokens[index - 2]?.upper !== KEYWORD.DISTINCT;
  }
  if (before === KEYWORD.BY) {
    return tokens[index - 2]?.upper === KEYWORD.INDEXED;
  }
  if (NAME_INTRODUCERS.has(before) || isUpdateVerb(tokens, index - 1)) {
    return true;
  }
  // UPDATE OR <resolution> <name>
  const or = index - 2;
  return tokens[or]?.upper === KEYWORD.OR && isUpdateVerb(tokens, or - 1);
}

function isNamePosition(tokens, index) {
  return tokens[index - 1]?.text === CHAR.DOT || tokens[index + 1]?.text === CHAR.DOT ||
    tokens[index + 1]?.text === CHAR.OPEN_PAREN || followsNameIntroducer(tokens, index);
}

// The single-token elements of the parenthesized list opened at `open`.
function markListNames(tokens, open) {
  const close = tokens[open]?.close;
  if (tokens[open]?.text !== CHAR.OPEN_PAREN || close === undefined) {
    return;
  }
  for (let index = open + 1; index < close; index += 1) {
    const separatedBefore = tokens[index - 1].text === CHAR.OPEN_PAREN ||
      tokens[index - 1].text === CHAR.COMMA;
    const separatedAfter = tokens[index + 1].text === CHAR.COMMA || index + 1 === close;
    if (separatedBefore && separatedAfter) {
      markName(tokens[index]);
    }
  }
}

// The index after `<name> [. <name>]` starting at `at`.
function afterQualifiedName(tokens, at) {
  const next = at + 1;
  return tokens[next]?.text === CHAR.DOT ? next + 2 : next;
}

// The index after a verb and its optional `OR <resolution>`.
function afterResolution(tokens, verb) {
  const next = verb + 1;
  return tokens[next]?.upper === KEYWORD.OR ? next + 2 : next;
}

// The `(` of the column list of the INSERT whose INTO is at `into`, or -1.
function insertColumnListOpen(tokens, into) {
  let next = afterQualifiedName(tokens, into + 1);
  if (tokens[next]?.upper === KEYWORD.AS) {
    next += 2;
  }
  return tokens[next]?.text === CHAR.OPEN_PAREN ? next : -1;
}

/**
 * The assignment-target tokens of the SET list whose SET is at `setIndex`
 * (each target, and each name of a row-value target), or null when no SET
 * list starts there. The list ends at WHERE, FROM, ON, RETURNING or `;` at
 * its own depth.
 * @param {Array<Object>} tokens - The lexed tokens.
 * @param {number} setIndex - The index of the SET keyword.
 * @return {Array<Object>|null} The target tokens.
 */
function setListTargets(tokens, setIndex) {
  if (tokens[setIndex]?.upper !== KEYWORD.SET) {
    return null;
  }
  const depth = tokens[setIndex].depth;
  const targets = [];
  let expectTarget = true;
  for (let index = setIndex + 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.depth === depth && (SET_LIST_ENDS.has(token.upper) ||
        token.text === CHAR.SEMICOLON)) {
      break;
    }
    if (expectTarget && token.text === CHAR.OPEN_PAREN) {
      const close = token.close ?? tokens.length;
      targets.push(...tokens.slice(index + 1, close).filter((inner) =>
        inner.text !== CHAR.COMMA));
      index = close;
    } else if (expectTarget) {
      targets.push(token);
    }
    expectTarget = token.depth === depth && token.text === CHAR.COMMA;
  }
  return targets;
}

function markListPositions(tokens, index) {
  const token = tokens[index];
  if (token.upper === KEYWORD.INTO) {
    markListNames(tokens, insertColumnListOpen(tokens, index));
  } else if (token.upper === KEYWORD.USING) {
    markListNames(tokens, index + 1);
  } else if (token.upper === KEYWORD.SET) {
    (setListTargets(tokens, index) ?? []).forEach(markName);
  }
}

/**
 * The assignments of the SET list whose SET is at `setIndex`: for each, its
 * target tokens (one name, or the names of a row-value target) and the tokens
 * of its value expression; null when no SET list starts there. The list ends
 * as setListTargets reads it.
 * @param {Array<Object>} tokens - The lexed tokens.
 * @param {number} setIndex - The index of the SET keyword.
 * @return {Array<{targets: Array<Object>, value: Array<Object>}>|null} The
 *   assignments.
 */
function setListAssignments(tokens, setIndex) {
  if (tokens[setIndex]?.upper !== KEYWORD.SET) {
    return null;
  }
  const depth = tokens[setIndex].depth;
  const assignments = [newAssignment()];
  for (let index = setIndex + 1; index < tokens.length &&
      !endsSetList(tokens[index], depth); index += 1) {
    const token = tokens[index];
    const atDepth = token.depth === depth;
    if (assignments.at(-1).assigned && atDepth && token.text === CHAR.COMMA) {
      assignments.push(newAssignment());
    } else {
      readAssignmentToken(assignments.at(-1), token, atDepth);
    }
  }
  return assignments.map(({targets, value}) => ({targets, value}));
}

function newAssignment() {
  return {targets: [], value: [], assigned: false};
}

// The SET list's end at its own depth: WHERE, FROM, ON, RETURNING or `;`.
function endsSetList(token, depth) {
  return token.depth === depth &&
    (SET_LIST_ENDS.has(token.upper) || token.text === CHAR.SEMICOLON);
}

const ROW_VALUE_PUNCTUATION = new Set([CHAR.OPEN_PAREN, CHAR.CLOSE_PAREN, CHAR.COMMA]);

// One token of a SET list, read into the assignment it belongs to: a target
// name (a row value's parentheses and commas dropped), the `=`, or a value
// token.
function readAssignmentToken(current, token, atDepth) {
  if (current.assigned) {
    current.value.push(token);
  } else if (atDepth && token.text === CHAR.EQUALS) {
    current.assigned = true;
  } else if (!ROW_VALUE_PUNCTUATION.has(token.text)) {
    current.targets.push(token);
  }
}

/**
 * Read every STRING token in a name position as the identifier it names
 * (token.identifier, ASCII lower-case), as SQLite does.
 * @param {{tokens: Array<Object>}} lexed - The lexed statement (mutated).
 * @return {Object} The same lexed statement.
 */
function resolveNamePositions(lexed) {
  const {tokens} = lexed;
  tokens.forEach((token, index) => {
    if (token.type === TOKEN.STRING && isNamePosition(tokens, index)) {
      markName(token);
    }
    markListPositions(tokens, index);
  });
  return lexed;
}

/**
 * The index of the verb of a DML statement (its head, or a WITH statement's
 * first top-level verb), or -1 when the statement is not DML.
 * @param {{head: string, tokens: Array<Object>}} lexed - The lexed statement.
 * @return {number} The verb's token index, or -1.
 */
function dmlVerbIndex(lexed) {
  if (lexed.head !== KEYWORD.WITH) {
    return DML_VERBS.has(lexed.head) ? 0 : -1;
  }
  const verb = lexed.tokens.findIndex((token, index) => index > 0 &&
    token.depth === 0 && MAIN_VERBS.has(token.upper));
  return verb >= 0 && DML_VERBS.has(lexed.tokens[verb].upper) ? verb : -1;
}

// The index of the target table's name after the verb at `verb`, or -1.
function targetNameIndex(tokens, verb) {
  const keyword = tokens[verb].upper;
  if (keyword === KEYWORD.UPDATE) {
    return afterResolution(tokens, verb);
  }
  if (keyword === KEYWORD.DELETE) {
    return tokens[verb + 1]?.upper === KEYWORD.FROM ? verb + 2 : -1;
  }
  const into = afterResolution(tokens, verb);
  return tokens[into]?.upper === KEYWORD.INTO ? into + 1 : -1;
}

/**
 * Whether a DML statement writes the partition's own table: its target is
 * `<own>` or `main.<own>` (names compared as SQLite does, ASCII
 * case-insensitive). A statement that is not DML is not judged here.
 * @param {{head: string, tokens: Array<Object>}} lexed - The lexed statement,
 *   its name positions resolved.
 * @param {string|null} ownTableName - The partition's own table.
 * @return {boolean} Whether the write is refused (`statement_table`).
 */
function writesForeignTable(lexed, ownTableName) {
  const verb = dmlVerbIndex(lexed);
  if (verb < 0) {
    return false;
  }
  const {tokens} = lexed;
  const at = targetNameIndex(tokens, verb);
  const qualified = at >= 0 && tokens[at + 1]?.text === CHAR.DOT;
  const schema = qualified ? tokens[at].identifier : MAIN_SCHEMA;
  const table = at < 0 ? null : tokens[qualified ? at + 2 : at]?.identifier ?? null;
  return typeof ownTableName !== 'string' || schema !== MAIN_SCHEMA ||
    table !== asciiLower(ownTableName);
}

const NON_FUNCTION_PAREN_KEYWORDS = new Set([
  'ALL', 'AND', 'AS', 'BETWEEN', 'BY', 'CASE', 'CAST', 'CHECK', 'COLLATE',
  'CONFLICT', 'DEFAULT', 'DISTINCT', 'ELSE', 'ESCAPE', 'EXCEPT', 'EXISTS',
  'FILTER', 'FROM', 'GROUPS', 'HAVING', 'IN', 'INDEXED', 'INTERSECT', 'INTO',
  'IS', 'JOIN', 'LIMIT', 'MATERIALIZED', 'NOT', 'OFFSET', 'ON', 'OR', 'OVER',
  'PARTITION', 'RANGE', 'RECURSIVE', 'RETURNING', 'ROWS', 'SELECT', 'SET',
  'TABLE', 'THEN', 'UNION', 'USING', 'VALUES', 'WHEN', 'WHERE', 'WINDOW',
  'WITH',
]);

function isRefusedFunctionToken(token) {
  const name = token.identifier ??
    (token.type === TOKEN.STRING ? asciiLower(token.value) : null);
  return name !== null && (name.startsWith(REFUSED_FUNCTION.PRAGMA_PREFIX) ||
    REFUSED_FUNCTION.NAMES.has(name));
}

const PREV_THREE_TOKENS = 3;
const TABLE_PREFIX_KEYWORDS = new Set([
  KEYWORD.INTO,
  KEYWORD.AS,
  KEYWORD.REFERENCES,
]);

function isAlterColumnTypeBeforeParen(tokens, index) {
  const twoBack = tokens[index - 2]?.upper;
  const threeBack = tokens[index - PREV_THREE_TOKENS]?.upper;
  return twoBack === KEYWORD.ADD ||
    (threeBack === KEYWORD.ADD && twoBack === KEYWORD.COLUMN);
}

function isTableOrTypeBeforeParen(tokens, index) {
  const prev = tokens[index - 1];
  if (TABLE_PREFIX_KEYWORDS.has(prev?.upper)) {
    return true;
  }
  if (prev?.text === CHAR.DOT &&
      tokens[index - PREV_THREE_TOKENS]?.upper === KEYWORD.INTO) {
    return true;
  }
  return isAlterColumnTypeBeforeParen(tokens, index);
}

function isSyntaxIdentifierBeforeParen(lexed, index) {
  const {tokens} = lexed;
  if (lexed.head === KEYWORD.WITH && tokens[index].depth === 0 &&
      index < dmlVerbIndex(lexed)) {
    return true;
  }
  return isTableOrTypeBeforeParen(tokens, index);
}

function isWriteFunctionCall(lexed, index) {
  const {tokens} = lexed;
  const token = tokens[index];
  if (tokens[index + 1]?.text !== CHAR.OPEN_PAREN || token.identifier === null) {
    return false;
  }
  if (token.upper !== null && NON_FUNCTION_PAREN_KEYWORDS.has(token.upper)) {
    return false;
  }
  return !isSyntaxIdentifierBeforeParen(lexed, index);
}

function isRefusedWriteCall(lexed, index) {
  if (!isWriteFunctionCall(lexed, index)) {
    return false;
  }
  const name = lexed.tokens[index].identifier;
  return REFUSED_FUNCTION.WRITE_CALLS.has(name) ||
    !DETERMINISTIC_WRITE_FUNCTIONS.has(name);
}

function isRefusedWriteValueKeyword(token) {
  return token.upper !== null &&
    REFUSED_FUNCTION.WRITE_VALUE_KEYWORDS.includes(token.upper);
}

/**
 * The function rule: whether the text names a table-valued pragma function
 * or a function that changes connection state, as an identifier or as any
 * single-quoted string (conservative: a literal with that text too), or in a
 * DML write / ALTER TABLE calls a nondeterministic, time, environment,
 * connection-state, or unlisted function or current-time value keyword.
 * @param {{head: string, tokens: Array<Object>}} lexed - The lexed statement.
 * @return {boolean} Whether the statement is refused (`statement_function`).
 */
function namesRefusedFunction(lexed, {classifyWriteFunctions = true} = {}) {
  const {tokens} = lexed;
  const isWrite = classifyWriteFunctions !== false &&
    (dmlVerbIndex(lexed) >= 0 || lexed.head === KEYWORD.ALTER);
  return tokens.some((token, index) => isRefusedFunctionToken(token) ||
    (isWrite && (isRefusedWriteValueKeyword(token) ||
      isRefusedWriteCall(lexed, index))));
}

/**
 * The conflict rule: whether a write carries `OR ROLLBACK`, which ends the
 * apply's own SQLite transaction when it fires.
 * @param {Array<Object>} tokens - The lexed tokens.
 * @return {boolean} Whether the statement is refused (`statement_conflict`).
 */
function hasRollbackResolution(tokens) {
  return tokens.some((token, index) => token.upper === KEYWORD.OR &&
    tokens[index + 1]?.upper === KEYWORD.ROLLBACK);
}

export {
  dmlVerbIndex,
  hasRollbackResolution,
  namesRefusedFunction,
  resolveNamePositions,
  setListAssignments,
  setListTargets,
  writesForeignTable,
};
