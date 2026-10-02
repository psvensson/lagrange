#!/usr/bin/env node
import {
  compareRoutingKeys,
} from '../../src/partition/split-key-comparator.js';

const LEFT = -1;
const EQUAL = 0;
const RIGHT = 1;
const INVALID_VALUES = Object.freeze([
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  Object('boxed'),
  Object(7),
  true,
  Symbol('invalid'),
  Object.freeze({kind: 'invalid'}),
]);
const ABSENT_VALUES = Object.freeze([null, undefined]);

function refusalProblemCount() {
  let problems = 0;
  for (const invalid of INVALID_VALUES) {
    for (const absent of ABSENT_VALUES) {
      for (const [left, right] of [
        [invalid, absent],
        [absent, invalid],
      ]) {
        try {
          compareRoutingKeys(left, right);
          problems += 1;
        } catch (error) {
          if (!/type mismatch/iu.test(String(error?.message || error))) {
            problems += 1;
          }
        }
      }
    }
  }
  return problems;
}

function validAbsentProblemCount() {
  let problems = 0;
  const supported = [
    7,
    'a',
    Buffer.from('a'),
  ];
  if (compareRoutingKeys(null, undefined) !== EQUAL) problems += 1;
  if (compareRoutingKeys(undefined, null) !== EQUAL) problems += 1;
  for (const value of supported) {
    for (const absent of ABSENT_VALUES) {
      if (compareRoutingKeys(absent, value) !== LEFT) problems += 1;
      if (compareRoutingKeys(value, absent) !== RIGHT) problems += 1;
    }
  }
  return problems;
}

const metric = refusalProblemCount() + validAbsentProblemCount();
if (metric !== 0) {
  process.stderr.write(
    'partition-key-ordering-owner-completion-v6: outstanding problems=' +
    String(metric) + '\n',
  );
}
process.stdout.write(String(metric) + '\n');
process.exitCode = metric === 0 ? 0 : 1;
