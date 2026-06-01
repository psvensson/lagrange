import fs from 'node:fs';
import path from 'node:path';

const ENCODING_UTF8 = 'utf8';
const EMPTY_TEXT = '';
const PLACEHOLDER_EXACT_PATTERN =
  /^(?:tbd|placeholder|example|unknown|fill[- ]?me)$/iu;
const PLACEHOLDER_MARKER_PATTERN = /<[^>]+>/u;

function isObjectRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasConcreteText(value) {
  if (typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 &&
    !PLACEHOLDER_EXACT_PATTERN.test(trimmed) &&
    !PLACEHOLDER_MARKER_PATTERN.test(trimmed);
}

function readTextFile(filePath) {
  return fs.readFileSync(filePath, ENCODING_UTF8);
}

function readJsonFile(filePath) {
  return JSON.parse(readTextFile(filePath));
}

function pathExists(filePath, rootDir = process.cwd()) {
  return fs.existsSync(path.resolve(rootDir, filePath));
}

function listFiles(rootDir, {suffix = '', recursive = false} = {}) {
  const resolvedRoot = path.resolve(rootDir);
  if (!fs.existsSync(resolvedRoot)) {
    return [];
  }
  const entries = fs.readdirSync(resolvedRoot, {withFileTypes: true});
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(resolvedRoot, entry.name);
    if (entry.isDirectory() && recursive) {
      files.push(...listFiles(entryPath, {suffix, recursive}));
    } else if (entry.isFile() && (!suffix || entry.name.endsWith(suffix))) {
      files.push(entryPath);
    }
  }
  return files.sort();
}

function parseEmbeddedJson(content, marker) {
  const escapedMarker = marker.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const pattern = new RegExp(
    `<!--\\s*${escapedMarker}\\s*\\n([\\s\\S]*?)\\n\\s*-->`,
    'iu',
  );
  const match = content.match(pattern);
  if (!match) {
    return null;
  }
  return JSON.parse(match[1].trim());
}

function requireConcreteField(errors, filePath, fieldPath, value) {
  if (!hasConcreteText(value)) {
    errors.push(`${filePath}: ${fieldPath} must be concrete text.`);
  }
}

function requireConcreteArray(
  errors,
  filePath,
  fieldPath,
  value,
  {minLength = 1, allowObjects = false} = {},
) {
  if (!Array.isArray(value)) {
    errors.push(`${filePath}: ${fieldPath} must be an array.`);
    return;
  }
  if (value.length < minLength) {
    errors.push(
      `${filePath}: ${fieldPath} must contain at least ${minLength} item(s).`,
    );
  }
  value.forEach((entry, index) => {
    const entryPath = `${fieldPath}[${index}]`;
    if (allowObjects && isObjectRecord(entry)) {
      return;
    }
    if (!hasConcreteText(entry)) {
      errors.push(`${filePath}: ${entryPath} must be concrete text.`);
    }
  });
}

function validateEnum(errors, filePath, fieldPath, value, allowedValues) {
  if (!allowedValues.includes(value)) {
    errors.push(
      `${filePath}: ${fieldPath} must be one of ${allowedValues.join(', ')}.`,
    );
  }
}

function uniqueValues(values) {
  return new Set(values).size === values.length;
}

function relativeToCwd(filePath) {
  return path.relative(process.cwd(), filePath) || filePath;
}

function mainResultToExitCode(result) {
  return result.errors.length === 0 ? 0 : 2;
}

function renderValidationResult(result) {
  if (result.json === true) {
    return `${JSON.stringify(result, null, 2)}\n`;
  }
  const lines = [];
  lines.push(`${result.label}: ${result.errors.length === 0 ? 'ok' : 'failed'}`);
  lines.push(`Checked files: ${result.checkedFiles.length}`);
  for (const filePath of result.checkedFiles) {
    lines.push(`- ${filePath}`);
  }
  if (result.errors.length > 0) {
    lines.push('Errors:');
    for (const error of result.errors) {
      lines.push(`- ${error}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

export {
  EMPTY_TEXT,
  hasConcreteText,
  isObjectRecord,
  listFiles,
  mainResultToExitCode,
  parseEmbeddedJson,
  pathExists,
  readJsonFile,
  readTextFile,
  relativeToCwd,
  renderValidationResult,
  requireConcreteArray,
  requireConcreteField,
  uniqueValues,
  validateEnum,
};
