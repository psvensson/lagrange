// Declared formation size, configuration side (stage S1 of
// formation-admission-design-2026-11-11.md): one positive-integer input with
// no default, validated at startup with a typed error naming the variable.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {CONFIG_KEY} from '../../src/config/config-key-constants.js';
import {
  FORMATION_TARGET_CONFIG_ERROR_CODE as CODE,
  FORMATION_TARGET_DECLARATION_STATE as STATE,
  FORMATION_TARGET_NODE_COUNT_ENV as ENV,
  declareFormationTarget,
  requireDeclaredFormationTarget,
} from '../../src/config/formation-target-node-count.js';

function initialize(overrides, environment) {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize(overrides, {environment});
  return config;
}

function assertTypedRefusal(error, code) {
  assert.equal(error.code, code);
  assert.equal(error.variable, ENV);
  assert.equal(error.configKey, CONFIG_KEY.FORMATION_TARGET_NODE_COUNT);
  assert.match(error.message, new RegExp(ENV));
  return true;
}

test('the variable maps to formation.targetNodeCount and parses a positive integer', () => {
  for (const [text, count] of [['1', 1], ['3', 3], ['17', 17]]) {
    const config = initialize({}, {[ENV]: text});
    assert.equal(config.get(CONFIG_KEY.FORMATION_TARGET_NODE_COUNT), count);
  }
  const fromOverride = initialize({formation: {targetNodeCount: 5}}, {});
  assert.equal(fromOverride.get(CONFIG_KEY.FORMATION_TARGET_NODE_COUNT), 5);
  ConfigurationManager.resetInstance();
});

test('there is no default: an absent declaration stays absent and is UNDECLARED', () => {
  const config = initialize({}, {});
  assert.equal(config.get(CONFIG_KEY.FORMATION_TARGET_NODE_COUNT), undefined);
  assert.equal(config.getDefault(CONFIG_KEY.FORMATION_TARGET_NODE_COUNT), undefined);
  assert.deepEqual(declareFormationTarget(undefined), {state: STATE.UNDECLARED});
  ConfigurationManager.resetInstance();
});

test('(e) an invalid environment value is refused at validation, typed, naming the variable',
  () => {
    for (const text of ['0', '-1', '1.5', '', ' 3', 'abc', '01', '1e3', '+2',
      '99999999999999999999']) {
      assert.throws(() => initialize({}, {[ENV]: text}),
        (error) => assertTypedRefusal(error, CODE.INVALID), `env ${JSON.stringify(text)}`);
    }
    ConfigurationManager.resetInstance();
  });

test('(e) an invalid override value is refused at validation, typed', () => {
  for (const value of [0, -1, 1.5, Number.NaN, '3', null, true]) {
    assert.throws(() => initialize({formation: {targetNodeCount: value}}, {}),
      (error) => assertTypedRefusal(error, CODE.INVALID), `override ${String(value)}`);
  }
  ConfigurationManager.resetInstance();
});

test('founding requires DECLARED; UNDECLARED is the typed REQUIRED refusal', () => {
  assert.equal(requireDeclaredFormationTarget(declareFormationTarget(3)), 3);
  for (const declaration of [declareFormationTarget(undefined), null, undefined, {}]) {
    assert.throws(() => requireDeclaredFormationTarget(declaration),
      (error) => assertTypedRefusal(error, CODE.REQUIRED));
  }
});
