import {readFile} from 'node:fs/promises';
import path from 'node:path';

import {KEYS} from 'eslint-visitor-keys';
import {parse} from 'espree';

import {
  appendOwnArrayValue,
  copyDenseStringArray,
} from
  '../../test/distributed/harness/benchmark-semantic-integrity.js';

const canonicalArrayIsArray = Array.isArray;
const canonicalArrayPop = Array.prototype.pop;
const canonicalArrayPush = Array.prototype.push;
const canonicalSetAdd = Set.prototype.add;
const canonicalSetHas = Set.prototype.has;
const arrayIsArray = canonicalArrayIsArray;
const arrayJoin = Function.call.bind(Array.prototype.join);
const arrayPop = Function.call.bind(canonicalArrayPop);
const arraySort = Function.call.bind(Array.prototype.sort);
const setAdd = Function.call.bind(canonicalSetAdd);
const setHas = Function.call.bind(canonicalSetHas);
const stringSplit = Function.call.bind(String.prototype.split);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const SetConstructor = Set;
const pathDirname = path.dirname;
const pathExtname = path.extname;
const pathIsAbsolute = path.isAbsolute;
const pathRelative = path.relative;
const pathResolve = path.resolve;
const pathSeparator = path.sep;
const localText = objectFreeze({
  ARRAY_IS_ARRAY_METHOD: 'isArray',
  ARRAY_POP_METHOD: 'pop',
  ARRAY_PUSH_METHOD: 'push',
  DYNAMIC_LOCAL_IMPORT:
    'dynamic local import must use a literal module specifier',
  ENCODING: 'utf8',
  ECMASCRIPT_VERSION: 'latest',
  EXPORT_ALL_DECLARATION: 'ExportAllDeclaration',
  EXPORT_NAMED_DECLARATION: 'ExportNamedDeclaration',
  IMPORT_DECLARATION: 'ImportDeclaration',
  IMPORT_EXPRESSION: 'ImportExpression',
  JAVASCRIPT_EXTENSION: '.js',
  LITERAL: 'Literal',
  LOCAL_PREFIX: '.',
  MODULE: 'module',
  OUTSIDE_ROOT: 'local module escaped the repository root',
  PARENT: '..',
  ROOT_SHAPE: 'source closure requires dense entry and additional paths',
  SET_ADD_METHOD: 'add',
  SET_HAS_METHOD: 'has',
  SLASH: '/',
});

function fail(reason) {
  throw new TypeError(`benchmark source closure failed: ${reason}`);
}

function repositoryPath(absolutePath, root) {
  const relative = pathRelative(root, absolutePath);
  if (
    relative.length === 0 ||
    relative === localText.PARENT ||
    stringStartsWith(relative, `${localText.PARENT}${pathSeparator}`) ||
    pathIsAbsolute(relative)
  ) fail(localText.OUTSIDE_ROOT);
  return arrayJoin(
    stringSplit(relative, pathSeparator),
    localText.SLASH,
  );
}

function localSpecifier(node) {
  if (
    node.type === localText.IMPORT_DECLARATION ||
    node.type === localText.EXPORT_NAMED_DECLARATION ||
    node.type === localText.EXPORT_ALL_DECLARATION
  ) return node.source?.value;
  if (node.type !== localText.IMPORT_EXPRESSION) return null;
  if (node.source?.type !== localText.LITERAL) {
    fail(localText.DYNAMIC_LOCAL_IMPORT);
  }
  return node.source.value;
}

function replaceDataMethod(owner, field, value) {
  const descriptor = objectGetOwnPropertyDescriptor(owner, field);
  objectDefineProperty(owner, field, {
    configurable: true,
    writable: true,
    value,
  });
  return descriptor;
}

function parseWithPristineCollectionIntrinsics(source) {
  const arrayIsArrayDescriptor =
    replaceDataMethod(
      Array,
      localText.ARRAY_IS_ARRAY_METHOD,
      canonicalArrayIsArray,
    );
  const arrayPopDescriptor =
    replaceDataMethod(
      Array.prototype,
      localText.ARRAY_POP_METHOD,
      canonicalArrayPop,
    );
  const arrayPushDescriptor =
    replaceDataMethod(
      Array.prototype,
      localText.ARRAY_PUSH_METHOD,
      canonicalArrayPush,
    );
  const setAddDescriptor =
    replaceDataMethod(
      Set.prototype,
      localText.SET_ADD_METHOD,
      canonicalSetAdd,
    );
  const setHasDescriptor =
    replaceDataMethod(
      Set.prototype,
      localText.SET_HAS_METHOD,
      canonicalSetHas,
    );
  try {
    return parse(source, {
      ecmaVersion: localText.ECMASCRIPT_VERSION,
      sourceType: localText.MODULE,
    });
  } finally {
    objectDefineProperty(
      Set.prototype,
      localText.SET_HAS_METHOD,
      setHasDescriptor,
    );
    objectDefineProperty(
      Set.prototype,
      localText.SET_ADD_METHOD,
      setAddDescriptor,
    );
    objectDefineProperty(
      Array.prototype,
      localText.ARRAY_PUSH_METHOD,
      arrayPushDescriptor,
    );
    objectDefineProperty(
      Array.prototype,
      localText.ARRAY_POP_METHOD,
      arrayPopDescriptor,
    );
    objectDefineProperty(
      Array,
      localText.ARRAY_IS_ARRAY_METHOD,
      arrayIsArrayDescriptor,
    );
  }
}

function importedSpecifiers(source) {
  const program = parseWithPristineCollectionIntrinsics(source);
  const specifiers = [];
  const pending = [program];
  while (pending.length > 0) {
    const node = arrayPop(pending);
    const specifier = localSpecifier(node);
    if (
      typeof specifier === 'string' &&
      stringStartsWith(specifier, localText.LOCAL_PREFIX)
    ) appendOwnArrayValue(specifiers, specifier);
    const keys = KEYS[node.type] ?? [];
    for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
      const child = node[keys[keyIndex]];
      if (arrayIsArray(child)) {
        for (let index = 0; index < child.length; index += 1) {
          if (child[index] !== null) {
            appendOwnArrayValue(pending, child[index]);
          }
        }
      } else if (child !== null && typeof child === 'object') {
        appendOwnArrayValue(pending, child);
      }
    }
  }
  return specifiers;
}

function copyPathList(values, allowEmpty) {
  const copy = copyDenseStringArray(values);
  if (copy === null || (!allowEmpty && copy.length === 0)) {
    fail(localText.ROOT_SHAPE);
  }
  for (let index = 0; index < copy.length; index += 1) {
    if (copy[index].length === 0) {
      fail(localText.ROOT_SHAPE);
    }
  }
  return copy;
}

export async function resolveBenchmarkLocalModuleSourcePaths({
  entryPaths,
  additionalPaths = [],
}) {
  const sealedEntryPaths = copyPathList(entryPaths, false);
  const sealedAdditionalPaths = copyPathList(additionalPaths, true);
  const root = process.cwd();
  const pending = [];
  for (let index = 0; index < sealedEntryPaths.length; index += 1) {
    appendOwnArrayValue(
      pending,
      pathResolve(root, sealedEntryPaths[index]),
    );
  }
  const visited = new SetConstructor();
  const sourcePaths = [];
  while (pending.length > 0) {
    const absolutePath = arrayPop(pending);
    const sourcePath = repositoryPath(absolutePath, root);
    if (setHas(visited, sourcePath)) continue;
    setAdd(visited, sourcePath);
    appendOwnArrayValue(sourcePaths, sourcePath);
    if (pathExtname(sourcePath) !== localText.JAVASCRIPT_EXTENSION) {
      continue;
    }
    const source = await readFile(absolutePath, localText.ENCODING);
    const specifiers = importedSpecifiers(source);
    for (let index = 0; index < specifiers.length; index += 1) {
      appendOwnArrayValue(
        pending,
        pathResolve(pathDirname(absolutePath), specifiers[index]),
      );
    }
  }
  for (let index = 0; index < sealedAdditionalPaths.length; index += 1) {
    const sourcePath = repositoryPath(
      pathResolve(root, sealedAdditionalPaths[index]),
      root,
    );
    if (!setHas(visited, sourcePath)) {
      setAdd(visited, sourcePath);
      appendOwnArrayValue(sourcePaths, sourcePath);
    }
  }
  arraySort(sourcePaths);
  return objectFreeze(sourcePaths);
}
