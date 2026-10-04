#!/usr/bin/env node
import fs from 'node:fs';

const SOURCE =
  'solve/quests/partition-key-ordering-owner-completion-v13/evidence/candidate-src-partition-split-routing.js';
const TEST =
  'solve/quests/partition-key-ordering-owner-completion-v13/evidence/candidate-test-partition-split-routing.test.js';
const source = fs.existsSync(SOURCE) ? fs.readFileSync(SOURCE, 'utf8') : '';
const test = fs.existsSync(TEST) ? fs.readFileSync(TEST, 'utf8') : '';
const requiredSource = [
  'const objectHasOwn = Function.call.bind(Object.prototype.hasOwnProperty)',
  'const stringTrim = Function.call.bind(String.prototype.trim)',
  'const stringToUpperCase = Function.call.bind(String.prototype.toUpperCase)',
  'const stringStartsWith = Function.call.bind(String.prototype.startsWith)',
  'const stringIncludes = Function.call.bind(String.prototype.includes)',
  'const arrayIsArray = Array.isArray',
  'const numberIsInteger = Number.isInteger',
  'const MapCtor = Map',
  'const mapGet = Function.call.bind(Map.prototype.get)',
  'const mapSet = Function.call.bind(Map.prototype.set)',
];
const requiredWitness = [
  'Map.prototype.get',
  'Map.prototype.set',
  'Object.prototype.hasOwnProperty',
  'String.prototype.trim',
  'String.prototype.toUpperCase',
  'String.prototype.startsWith',
  'String.prototype.includes',
  'Array.isArray',
  'Number.isInteger',
];
let metric = 0;
for (const needle of requiredSource) metric += source.includes(needle) ? 0 : 1;
for (const needle of requiredWitness) metric += test.includes(needle) ? 0 : 1;
process.stdout.write(`${metric}\n`);
process.exitCode = metric === 0 ? 0 : 1;
