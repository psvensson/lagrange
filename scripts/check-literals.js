import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {parse} from 'espree';

// Literal rules: only constants modules and module specifiers are allowed.
// Use "literal-ok:" with a short justification for explicit exceptions.

const ROOT = process.cwd();
const TARGET_DIRS = ['src', 'test', 'scripts'];
const CONSTANTS_DIR = path.join(ROOT, 'src', 'constants');
const CONSTANTS_SUFFIXES = ['constants.js', '-constants.js'];
const OVERRIDE_MARKER = 'literal-ok:';

const PARSER_OPTIONS = {
  ecmaVersion: 2022,
  sourceType: 'module',
  ecmaFeatures: {
    globalReturn: false,
  },
  comment: true,
  loc: true,
  range: true,
};

const isConstantsFile = (filePath) => {
  if (filePath.startsWith(CONSTANTS_DIR)) {
    return true;
  }
  return CONSTANTS_SUFFIXES.some((suffix) => filePath.endsWith(suffix));
};

const isJsFile = (filePath) => filePath.endsWith('.js');

const gatherFiles = async (dirPath, files) => {
  const entries = await fs.readdir(dirPath, {withFileTypes: true});
  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      await gatherFiles(entryPath, files);
      continue;
    }
    if (entry.isFile() && isJsFile(entryPath)) {
      files.push(entryPath);
    }
  }
};

const hasOverride = (node, comments) => {
  if (!node.loc) {
    return false;
  }
  const nodeLine = node.loc.start.line;
  return comments.some((comment) => {
    if (!comment.value.includes(OVERRIDE_MARKER)) {
      return false;
    }
    const justification = comment.value.split(OVERRIDE_MARKER)[1]?.trim();
    if (!justification) {
      return false;
    }
    const endLine = comment.loc.end.line;
    return endLine === nodeLine || endLine === nodeLine - 1;
  });
};

const isImportSource = (node, parent) => {
  if (!parent) {
    return false;
  }
  if (parent.type === 'ImportDeclaration') {
    return parent.source === node;
  }
  if (parent.type === 'ExportAllDeclaration') {
    return parent.source === node;
  }
  if (parent.type === 'ExportNamedDeclaration') {
    return parent.source === node;
  }
  if (parent.type === 'ImportExpression') {
    return parent.source === node;
  }
  if (parent.type === 'CallExpression' && parent.callee.type === 'Identifier') {
    return parent.callee.name === 'require' && parent.arguments[0] === node;
  }
  return false;
};

const isDirectiveLiteral = (node, parent) => {
  if (!parent || parent.type !== 'ExpressionStatement') {
    return false;
  }
  return Boolean(parent.directive);
};

const isAllowedLiteral = (node, parent, comments) => {
  if (isImportSource(node, parent)) {
    return true;
  }
  if (isDirectiveLiteral(node, parent)) {
    return true;
  }
  if (hasOverride(node, comments)) {
    return true;
  }
  return false;
};

const recordLiteral = (violations, node, filePath, label) => {
  const loc = node.loc || {start: {line: 0, column: 0}};
  const line = loc.start.line;
  const column = loc.start.column + 1;
  violations.push({
    filePath,
    line,
    column,
    label,
  });
};

const walk = (node, parent, comments, filePath, violations) => {
  if (!node || typeof node !== 'object') {
    return;
  }

  if (node.type === 'Literal') {
    const literalType = typeof node.value;
    if (literalType === 'string' || literalType === 'number') {
      if (!isAllowedLiteral(node, parent, comments)) {
        recordLiteral(violations, node, filePath, JSON.stringify(node.value));
      }
    }
  }

  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    if (!isAllowedLiteral(node, parent, comments)) {
      const text = node.quasis.map((quasi) => quasi.value.raw).join('');
      recordLiteral(violations, node, filePath, JSON.stringify(text));
    }
  }

  for (const key of Object.keys(node)) {
    if (key === 'parent') {
      continue;
    }
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        walk(child, node, comments, filePath, violations);
      }
    } else if (value && typeof value === 'object' && value.type) {
      walk(value, node, comments, filePath, violations);
    }
  }
};

const main = async () => {
  const files = [];
  for (const dir of TARGET_DIRS) {
    const absoluteDir = path.join(ROOT, dir);
    await gatherFiles(absoluteDir, files);
  }

  const violations = [];
  for (const filePath of files) {
    if (isConstantsFile(filePath)) {
      continue;
    }
    const code = await fs.readFile(filePath, 'utf8');
    let ast;
    try {
      ast = parse(code, PARSER_OPTIONS);
    } catch (error) {
      violations.push({
        filePath,
        line: 0,
        column: 0,
        label: `ParseError: ${error.message}`,
      });
      continue;
    }
    walk(ast, null, ast.comments || [], filePath, violations);
  }

  if (violations.length === 0) {
    return;
  }

  const output = violations
    .map((violation) => {
      const relPath = path.relative(ROOT, violation.filePath);
      return `${relPath}:${violation.line}:${violation.column} ${violation.label}`;
    })
    .join('\n');

  console.error('Literal check failed. Replace literals with constants.');
  console.error('Use "literal-ok:" with justification for rare exceptions.');
  console.error(output);
  process.exitCode = 1;
};

await main();
