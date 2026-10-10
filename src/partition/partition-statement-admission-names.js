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

// The index of the verb of a DML statement (its head, or a WITH statement's
// first top-level verb), or -1 when the statement is not DML.
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

/**
 * The function rule: whether the text names a table-valued pragma function
 * or a function that changes connection state, as an identifier or as any
 * single-quoted string (conservative: a literal with that text too).
 * @param {Array<Object>} tokens - The lexed tokens.
 * @return {boolean} Whether the statement is refused (`statement_function`).
 */
function namesRefusedFunction(tokens) {
  return tokens.some((token) => {
    const name = token.identifier ??
      (token.type === TOKEN.STRING ? asciiLower(token.value) : null);
    return name !== null && (name.startsWith(REFUSED_FUNCTION.PRAGMA_PREFIX) ||
      REFUSED_FUNCTION.NAMES.has(name));
  });
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
  hasRollbackResolution,
  namesRefusedFunction,
  resolveNamePositions,
  setListTargets,
  writesForeignTable,
};
