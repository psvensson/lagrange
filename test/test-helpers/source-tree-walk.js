/**
 * Shared static-census helpers for tests that parse src/: list every .js
 * file under a directory, and walk an espree AST (range keys skipped).
 */

import fs from 'node:fs';
import path from 'node:path';

export function sourceFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory)) {
    const file = path.join(directory, entry);
    if (fs.statSync(file).isDirectory()) {
      files.push(...sourceFiles(file));
    } else if (file.endsWith('.js')) {
      files.push(file);
    }
  }
  return files;
}

export function walk(node, visit) {
  if (!node || typeof node.type !== 'string') return;
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'range') continue;
    if (Array.isArray(value)) {
      for (const child of value) walk(child, visit);
    } else if (value && typeof value.type === 'string') {
      walk(value, visit);
    }
  }
}
