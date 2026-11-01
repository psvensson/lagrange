/**
 * Owner of editor-typings emission for a code-first service
 * (service-compiler-editor-typings).
 *
 * From the normalized IR the compiler already trusts, this owner emits a
 * deterministic `runtime-types.d.ts` declaring:
 *
 *   - one `...Row` interface per distributed operation, whose properties
 *     are exactly the columns the operation's declared statement selects
 *     (so a handler/run reading an undeclared column is a type error
 *     under `tsc --checkJs`);
 *   - one `...Operation` interface per operation whose `run(rows, args,
 *     {emit})` / `reduce(partials, args)` signatures bind the row shape;
 *   - an `OperationHandles` map keyed by the explicit operation ids, so a
 *     misspelled operation key is a type error;
 *   - a `HandlerContext` whose `call(operation, args)` accepts only the
 *     declared operation handles and an arguments record, so a wrong call
 *     target is a type error.
 *
 * Typing is editor-level only: JSON strings remain the ABI (sealed by
 * the epic), and the emitted `.d.ts` never changes runtime behavior.
 * Emission is deterministic — the text depends only on the IR — so
 * repeated `generate` runs reproduce a byte-identical file.
 */

import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

const EMITTED_FILE_MODE = 'utf8';
const TEXT_NEWLINE = '\n';
const TEXT_SPACE = ' ';
const TS_NULL_KEYWORD = 'null';
const EMPTY_TEXT = '';
const COLUMN_SEPARATOR = ',';

// The generated .d.ts source is assembled from named fragment constants
// (the literal-guideline ratchet requires every string to be owned);
// identifiers from the IR are interpolated into those templates.
const DTS_FRAGMENT = Object.freeze({
  ARGS_TYPE: 'Record<string, unknown>',
  COLUMN_TYPE: 'readonly ',
  CONTEXT_EMIT: 'context: { emit(key: string, partial: unknown): void }',
  DOC_CLOSE: ' */',
  DOC_OPEN: '/**',
  DOC_PREFIX: ' *',
  EMIT_RETURN: 'void',
  EXPORT_INTERFACE: 'export interface ',
  HANDLES_NAME: 'OperationHandles',
  HANDLER_CONTEXT_NAME: 'HandlerContext',
  JSON_METHOD:
    '  json(value: unknown, status?: number): { body: string; status: number };',
  KIND_FIELD: '  readonly kind: \'distributed_operation\';',
  NEVER: 'never',
  OPERATION_SUFFIX: 'Operation',
  PARAMS_SUFFIX: 'Params',
  PARTIALS_TYPE: 'readonly (readonly [string, unknown])[]',
  READONLY_PREFIX: 'readonly ',
  REQUEST_NAME: 'ServiceRequest',
  REQUEST_BODY_FIELD: '  readonly body: Record<string, unknown> | null;',
  REQUEST_HEADERS_FIELD:
    '  readonly headers: Readonly<Record<string, string>>;',
  REQUEST_METHOD_FIELD: '  readonly method: string;',
  REQUEST_PATH_FIELD: '  readonly path: string;',
  REQUEST_QUERY_FIELD:
    '  readonly query: Readonly<Record<string, string>>;',
  HANDLER_CONTEXTS_NAME: 'HandlerContexts',
  ROW_SUFFIX: 'Row',
  TS_BOOLEAN: 'boolean',
  TS_NULL: ' | null',
  TS_NUMBER: 'number',
  TS_STRING: 'string',
  UNKNOWN: 'unknown',
  VOID: 'void',
});

// Non-object-literal fragments used while assembling the generated text.
const CLOSE_BRACE = '}';
const NESTED_CLOSE_BRACE = '  };';
const UNION_SEPARATOR = ' | ';
const GENERATED_DOC = Object.freeze({
  ABI_NOTE: 'component ABI; this file never changes runtime behavior.',
  EDITOR_ONLY: '`lagrange service generate`. Editor-level only: JSON ' +
    'strings remain the',
  HANDLES: 'Operation handles keyed by their explicit object-key ids.',
  HANDLER_CONTEXT: 'The request-handler collaborator surface.',
  HANDLER_CONTEXTS: 'Per-handler contexts: call() accepts only the ' +
    'operations that handler declared in calls.',
  REGENERATE: 'regenerate with',
  REQUEST: 'The serialized request envelope every http handler receives; ' +
    'body is a JSON record or null when absent.',
  TITLE: 'GENERATED editor typings (lagrange service generate).',
});

// A conservative SQL SELECT-list projection: split the text between
// SELECT and FROM on top-level commas and keep the trailing identifier
// of each item (handles `col`, `t.col`, and `expr AS alias`). Anything
// that does not reduce to a plain identifier (e.g. `*`, `COUNT(*)`) is
// skipped — typings are advisory, and an unparsable select item yields
// no property rather than a wrong one.
const SELECT_LIST_PATTERN = /^\s*select\s+(?<list>[\s\S]*?)\s+from\s/iu;
const IDENTIFIER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/u;
const TRAILING_IDENTIFIER_PATTERN = /([a-zA-Z_][a-zA-Z0-9_]*)\s*$/u;
const ALIAS_PATTERN = /\bas\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*$/iu;

function selectColumns(statementText) {
  const match = SELECT_LIST_PATTERN.exec(statementText);
  if (!match) return [];
  const columns = [];
  for (const item of match.groups.list.split(COLUMN_SEPARATOR)) {
    const trimmed = item.trim();
    if (trimmed.length === 0) continue;
    const alias = ALIAS_PATTERN.exec(trimmed);
    const trailing = alias?.[1] ?? TRAILING_IDENTIFIER_PATTERN.exec(trimmed)?.[1];
    if (trailing && IDENTIFIER_PATTERN.test(trailing)) {
      columns.push(trailing);
    }
  }
  return columns;
}

// A JS identifier (the IR guarantees operation/handler ids match the
// source contract's identifier grammar), safe to embed as a type or
// property name. Operation ids are camelCase; type names PascalCase.
function pascalCase(id) {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

const PARAM_SLOT_TYPE_BOOLEAN = 'boolean';
const PARAM_SLOT_TYPE_TEXT = 'text';
const SCHEMA_TYPE_STRING = 'string';
const SCHEMA_TYPE_NULL = 'null';
const SCHEMA_TYPE_ARRAY = 'array';
const SCHEMA_TYPE_RECORD = 'record';
const SCHEMA_TYPE_OBJECT = 'object';
const PARTIAL_SUFFIX = 'Partial';
const STATE_SUFFIX = 'State';
const EXPORT_TYPE_PREFIX = 'export type ';
const OPTIONAL_QUESTION = '?';
const GROUP_KEY_TS_TYPE = 'string | number';

function rowInterfaceName(operationId) {
  return pascalCase(operationId) + DTS_FRAGMENT.ROW_SUFFIX;
}

function paramsInterfaceName(operationId) {
  return pascalCase(operationId) + DTS_FRAGMENT.PARAMS_SUFFIX;
}

function partialTypeName(operationId) {
  return pascalCase(operationId) + PARTIAL_SUFFIX;
}

function stateTypeName(operationId) {
  return pascalCase(operationId) + STATE_SUFFIX;
}

function operationInterfaceName(operationId) {
  return pascalCase(operationId) + DTS_FRAGMENT.OPERATION_SUFFIX;
}

function operationArgsType(operation) {
  return Array.isArray(operation?.parameters) ?
    paramsInterfaceName(operation.id) :
    DTS_FRAGMENT.ARGS_TYPE;
}

function tsTypeForPartialSchemaNode(schema) {
  if (!schema || typeof schema !== 'object') return DTS_FRAGMENT.UNKNOWN;
  let baseType = DTS_FRAGMENT.TS_NUMBER;
  if (schema.type === SCHEMA_TYPE_NULL) {
    return TS_NULL_KEYWORD;
  } else if (schema.type === PARAM_SLOT_TYPE_BOOLEAN) {
    baseType = DTS_FRAGMENT.TS_BOOLEAN;
  } else if (schema.type === PARAM_SLOT_TYPE_TEXT ||
      schema.type === SCHEMA_TYPE_STRING) {
    baseType = DTS_FRAGMENT.TS_STRING;
  } else if (schema.type === SCHEMA_TYPE_ARRAY) {
    baseType = `readonly (${tsTypeForPartialSchemaNode(schema.items)})[]`;
  } else if ((schema.type === SCHEMA_TYPE_RECORD ||
      schema.type === SCHEMA_TYPE_OBJECT) && schema.fields) {
    const props = Object.keys(schema.fields).map((key) => {
      const f = schema.fields[key];
      const opt = f.optional === true ? OPTIONAL_QUESTION : EMPTY_TEXT;
      return `readonly ${JSON.stringify(key)}${opt}: ${tsTypeForPartialSchemaNode(f)};`;
    });
    baseType = `{ ${props.join(TEXT_SPACE)} }`;
  }
  return schema.nullable === true ?
    `${baseType}${DTS_FRAGMENT.TS_NULL}` :
    baseType;
}

function emitPartialTypeDeclaration(operation) {
  const typeExpr = tsTypeForPartialSchemaNode(operation.partialSchema);
  return [
    ...doc(
      `Structured partial schema declared by the \`${operation.id}\` operation.`),
    `${EXPORT_TYPE_PREFIX}${partialTypeName(operation.id)} = ${typeExpr};`,
  ].join(TEXT_NEWLINE);
}

function emitStateTypeDeclaration(operation) {
  const typeExpr = tsTypeForPartialSchemaNode(operation.stateSchema);
  return [
    ...doc(
      `Bounded accumulator state schema declared by the \`${operation.id}\` operation.`),
    `${EXPORT_TYPE_PREFIX}${stateTypeName(operation.id)} = ${typeExpr};`,
  ].join(TEXT_NEWLINE);
}

function tsTypeForParameterSlot(slot) {
  let baseType = DTS_FRAGMENT.TS_NUMBER;
  if (slot.type === PARAM_SLOT_TYPE_BOOLEAN) {
    baseType = DTS_FRAGMENT.TS_BOOLEAN;
  } else if (slot.type === PARAM_SLOT_TYPE_TEXT) {
    baseType = DTS_FRAGMENT.TS_STRING;
  }
  return slot.nullable === true ?
    `${baseType}${DTS_FRAGMENT.TS_NULL}` :
    baseType;
}

function emitParamsInterface(operation) {
  const lines = [
    ...doc(
      `Typed selector parameters declared by the \`${operation.id}\` operation.`),
    `${DTS_FRAGMENT.EXPORT_INTERFACE}${paramsInterfaceName(operation.id)} {`,
  ];
  for (const slot of operation.parameters) {
    lines.push(
      `  ${DTS_FRAGMENT.COLUMN_TYPE}${JSON.stringify(slot.name)}: ` +
        `${tsTypeForParameterSlot(slot)};`);
  }
  lines.push(CLOSE_BRACE);
  return lines.join(TEXT_NEWLINE);
}

function docLine(text) {
  return `${DTS_FRAGMENT.DOC_PREFIX} ${text}`;
}

// A single-line JSDoc block: /** text */.
function doc(text) {
  return [
    DTS_FRAGMENT.DOC_OPEN,
    docLine(text),
    DTS_FRAGMENT.DOC_CLOSE,
  ];
}

function emitRowInterface(operation) {
  const columns = selectColumns(operation.statement.text);
  const lines = [
    ...doc(
      `Columns selected by the \`${operation.id}\` operation's statement.`),
    `${DTS_FRAGMENT.EXPORT_INTERFACE}${rowInterfaceName(operation.id)} {`,
  ];
  for (const column of columns) {
    // Columns cross the ABI as scalars; typing is advisory (JSON-level),
    // so the value type is `unknown`.
    lines.push(
      `  ${DTS_FRAGMENT.COLUMN_TYPE}${JSON.stringify(column)}: ` +
        `${DTS_FRAGMENT.UNKNOWN};`);
  }
  lines.push(CLOSE_BRACE);
  return lines.join(TEXT_NEWLINE);
}

function emitAccumulatorSignatures(operation, rowName, argsType, contextEmit) {
  if (!operation?.stateSchema && typeof operation?.init !== 'function') {
    return [];
  }
  const sType = operation.stateSchema ?
    stateTypeName(operation.id) :
    DTS_FRAGMENT.UNKNOWN;
  return [
    `  init(args: ${argsType}): ${sType};`,
    `  step(state: ${sType}, page: readonly ${rowName}[], args: ${argsType}): ${sType};`,
    `  finish(state: ${sType}, args: ${argsType}, ${contextEmit}): ${DTS_FRAGMENT.UNKNOWN};`,
  ];
}

function emitOperationInterface(operation) {
  const rowName = rowInterfaceName(operation.id);
  const argsType = operationArgsType(operation);
  const hasPartialSchema = Boolean(operation?.partialSchema);
  const pType = hasPartialSchema ?
    partialTypeName(operation.id) :
    DTS_FRAGMENT.UNKNOWN;
  const contextEmit = hasPartialSchema ?
    `context: { emit(key: ${GROUP_KEY_TS_TYPE}, partial: ${pType}): void }` :
    DTS_FRAGMENT.CONTEXT_EMIT;
  const partialsType = hasPartialSchema ?
    `readonly (readonly [${GROUP_KEY_TS_TYPE}, ${pType}])[]` :
    DTS_FRAGMENT.PARTIALS_TYPE;
  return [
    ...doc(`The \`${operation.id}\` distributed operation.`),
    `${DTS_FRAGMENT.EXPORT_INTERFACE}${operationInterfaceName(operation.id)} {`,
    DTS_FRAGMENT.KIND_FIELD,
    ...emitAccumulatorSignatures(operation, rowName, argsType, contextEmit),
    `  run(rows: readonly ${rowName}[], args: ${argsType}, ` +
      `${contextEmit}): ${DTS_FRAGMENT.UNKNOWN};`,
    `  reduce(partials: ${partialsType}, ` +
      `args: ${argsType}): ${DTS_FRAGMENT.UNKNOWN};`,
    CLOSE_BRACE,
  ].join(TEXT_NEWLINE);
}

function emitOperationHandles(operations) {
  const lines = [
    ...doc(GENERATED_DOC.HANDLES),
    `${DTS_FRAGMENT.EXPORT_INTERFACE}${DTS_FRAGMENT.HANDLES_NAME} {`,
  ];
  for (const operation of operations) {
    lines.push(
      `  ${DTS_FRAGMENT.READONLY_PREFIX}${JSON.stringify(operation.id)}: ` +
        `${operationInterfaceName(operation.id)};`);
  }
  lines.push(CLOSE_BRACE);
  return lines.join(TEXT_NEWLINE);
}

function emitHandlerContext(operations) {
  const handleUnion = operations.length === 0 ?
    DTS_FRAGMENT.NEVER :
    operations.map((operation) =>
      `${DTS_FRAGMENT.HANDLES_NAME}[${JSON.stringify(operation.id)}]`)
      .join(UNION_SEPARATOR);
  return [
    ...doc(GENERATED_DOC.HANDLER_CONTEXT),
    `${DTS_FRAGMENT.EXPORT_INTERFACE}${DTS_FRAGMENT.HANDLER_CONTEXT_NAME} {`,
    `  call(operation: ${handleUnion}, args: ${DTS_FRAGMENT.ARGS_TYPE}): ` +
      `${DTS_FRAGMENT.UNKNOWN};`,
    DTS_FRAGMENT.JSON_METHOD,
    CLOSE_BRACE,
  ].join(TEXT_NEWLINE);
}

function emitServiceRequest() {
  return [
    ...doc(GENERATED_DOC.REQUEST),
    `${DTS_FRAGMENT.EXPORT_INTERFACE}${DTS_FRAGMENT.REQUEST_NAME} {`,
    DTS_FRAGMENT.REQUEST_METHOD_FIELD,
    DTS_FRAGMENT.REQUEST_PATH_FIELD,
    DTS_FRAGMENT.REQUEST_BODY_FIELD,
    DTS_FRAGMENT.REQUEST_HEADERS_FIELD,
    DTS_FRAGMENT.REQUEST_QUERY_FIELD,
    CLOSE_BRACE,
  ].join(TEXT_NEWLINE);
}

function handlerCallUnion(handler) {
  if (!Array.isArray(handler.allowedOperations) ||
      handler.allowedOperations.length === 0) {
    return DTS_FRAGMENT.NEVER;
  }
  return handler.allowedOperations.map((operationId) =>
    `${DTS_FRAGMENT.HANDLES_NAME}[${JSON.stringify(operationId)}]`)
    .join(UNION_SEPARATOR);
}

function emitHandlerContexts(handlers) {
  const lines = [
    ...doc(GENERATED_DOC.HANDLER_CONTEXTS),
    `${DTS_FRAGMENT.EXPORT_INTERFACE}${DTS_FRAGMENT.HANDLER_CONTEXTS_NAME} {`,
  ];
  for (const handler of handlers) {
    lines.push(
      `  ${DTS_FRAGMENT.READONLY_PREFIX}${JSON.stringify(handler.id)}: {`,
      `    call(operation: ${handlerCallUnion(handler)}, ` +
        `args: ${DTS_FRAGMENT.ARGS_TYPE}): ${DTS_FRAGMENT.UNKNOWN};`,
      `  ${DTS_FRAGMENT.JSON_METHOD.trim()}`,
      NESTED_CLOSE_BRACE,
    );
  }
  lines.push(CLOSE_BRACE);
  return lines.join(TEXT_NEWLINE);
}

function typingsSource(ir) {
  const sections = [
    DTS_FRAGMENT.DOC_OPEN,
    docLine(GENERATED_DOC.TITLE),
    DTS_FRAGMENT.DOC_PREFIX,
    docLine(
      `Derived from the normalized IR of ${ir.name}@${ir.version}; ` +
        GENERATED_DOC.REGENERATE),
    docLine(GENERATED_DOC.EDITOR_ONLY),
    docLine(GENERATED_DOC.ABI_NOTE),
    DTS_FRAGMENT.DOC_CLOSE,
    EMPTY_TEXT,
  ];
  for (const operation of ir.operations) {
    sections.push(emitRowInterface(operation), EMPTY_TEXT);
    if (Array.isArray(operation.parameters)) {
      sections.push(emitParamsInterface(operation), EMPTY_TEXT);
    }
    if (operation.partialSchema) {
      sections.push(emitPartialTypeDeclaration(operation), EMPTY_TEXT);
    }
    if (operation.stateSchema) {
      sections.push(emitStateTypeDeclaration(operation), EMPTY_TEXT);
    }
  }
  for (const operation of ir.operations) {
    sections.push(emitOperationInterface(operation), EMPTY_TEXT);
  }
  sections.push(
    emitServiceRequest(), EMPTY_TEXT,
    emitOperationHandles(ir.operations), EMPTY_TEXT,
    emitHandlerContext(ir.operations), EMPTY_TEXT,
    emitHandlerContexts(ir.handlers || []), EMPTY_TEXT,
  );
  return sections.join(TEXT_NEWLINE);
}

/**
 * Emit `runtime-types.d.ts` for a service IR.
 * @param {object} params
 * @param {object} params.ir - normalized service IR.
 * @param {string} params.outputPath - on-disk .d.ts path to write.
 * @return {Promise<{outputPath: string, bytes: number}>}
 */
async function emitServiceTypings({ir, outputPath}) {
  const source = typingsSource(ir);
  await mkdir(path.dirname(outputPath), {recursive: true});
  await writeFile(outputPath, source, EMITTED_FILE_MODE);
  return Object.freeze({
    bytes: Buffer.byteLength(source, EMITTED_FILE_MODE),
    outputPath,
  });
}

export {emitServiceTypings, selectColumns, typingsSource};
