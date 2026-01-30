/**
 * Unit tests for CommandParser
 *
 * Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6
 */

import {test} from '../../../src/test-helpers/tap.js';
import {CommandParser} from '../../../src/cli/core/command-parser.js';

test('CommandParser', async (t) => {
  await t.test('constructor initializes with default commands', async (t) => {
    const parser = new CommandParser();

    const commands = parser.getCommandNames();
    t.ok(commands.includes('connect'), 'has connect command');
    t.ok(commands.includes('refresh'), 'has refresh command');
    t.ok(commands.includes('filter'), 'has filter command');
    t.ok(commands.includes('sort'), 'has sort command');
    t.ok(commands.includes('goto'), 'has goto command');
    t.ok(commands.includes('sql'), 'has sql command');
    t.ok(commands.includes('help'), 'has help command');
    t.ok(commands.includes('quit'), 'has quit command');
    t.ok(commands.includes('history'), 'has history command');
  });

  await t.test('parse() handles valid commands', async (t) => {
    const parser = new CommandParser();

    const result = parser.parse('refresh');
    t.same(result, {command: 'refresh', args: []});
  });

  await t.test('parse() handles commands with arguments', async (t) => {
    const parser = new CommandParser();

    const result = parser.parse('connect localhost:8080');
    t.same(result, {command: 'connect', args: ['localhost:8080']});
  });

  await t.test('parse() handles commands with multiple arguments', async (t) => {
    const parser = new CommandParser();

    const result = parser.parse('sort name desc');
    t.same(result, {command: 'sort', args: ['name', 'desc']});
  });

  await t.test('parse() handles quoted arguments', async (t) => {
    const parser = new CommandParser();

    const result = parser.parse('filter "node with spaces"');
    t.same(result, {command: 'filter', args: ['node with spaces']});
  });

  await t.test('parse() returns error for unknown commands', async (t) => {
    const parser = new CommandParser();

    const result = parser.parse('unknown');
    t.ok(result.error, 'has error');
    t.match(result.error, /Unknown command/);
  });

  await t.test('parse() returns error for missing required params', async (t) => {
    const parser = new CommandParser();

    const result = parser.parse('connect');
    t.ok(result.error, 'has error');
    t.match(result.error, /Missing required parameter/);
  });

  await t.test('parse() returns error for empty input', async (t) => {
    const parser = new CommandParser();

    const result = parser.parse('');
    t.ok(result.error, 'has error');
    t.match(result.error, /Empty command/);
  });

  await t.test('parse() resolves aliases to canonical names', async (t) => {
    const parser = new CommandParser();

    const result = parser.parse('q');
    t.same(result, {command: 'quit', args: []});
  });

  await t.test('parse() is case-insensitive', async (t) => {
    const parser = new CommandParser();

    const result = parser.parse('REFRESH');
    t.same(result, {command: 'refresh', args: []});
  });

  await t.test('getCompletions() returns all commands for empty input', async (t) => {
    const parser = new CommandParser();

    const completions = parser.getCompletions('');
    t.ok(completions.length > 0, 'has completions');
    t.ok(completions.includes('connect'), 'includes connect');
  });

  await t.test('getCompletions() filters by prefix', async (t) => {
    const parser = new CommandParser();

    const completions = parser.getCompletions('co');
    t.ok(completions.includes('connect'), 'includes connect');
    t.notOk(completions.includes('refresh'), 'excludes refresh');
  });

  await t.test('getCompletions() returns view names for goto', async (t) => {
    const parser = new CommandParser();

    const completions = parser.getCompletions('goto n');
    t.ok(completions.includes('nodes'), 'includes nodes');
  });

  await t.test('getCompletions() returns directions for sort', async (t) => {
    const parser = new CommandParser();

    const completions = parser.getCompletions('sort name a');
    t.ok(completions.includes('asc'), 'includes asc');
  });

  await t.test('history is maintained', async (t) => {
    const parser = new CommandParser();

    parser.parse('refresh');
    parser.parse('quit');

    const history = parser.getHistory();
    t.equal(history.length, 2, 'has 2 entries');
    t.equal(history[0], 'quit', 'most recent first');
    t.equal(history[1], 'refresh', 'older second');
  });

  await t.test('history removes duplicates', async (t) => {
    const parser = new CommandParser();

    parser.parse('refresh');
    parser.parse('quit');
    parser.parse('refresh');

    const history = parser.getHistory();
    t.equal(history.length, 2, 'has 2 entries');
    t.equal(history[0], 'refresh', 'duplicate moved to front');
  });

  await t.test('history respects max limit', async (t) => {
    const parser = new CommandParser({maxHistory: 3});

    parser.parse('refresh');
    parser.parse('quit');
    parser.parse('sql');
    parser.parse('help');

    const history = parser.getHistory();
    t.equal(history.length, 3, 'limited to 3');
    t.equal(history[0], 'help', 'most recent first');
  });

  await t.test('getHistoryAt() returns correct entry', async (t) => {
    const parser = new CommandParser();

    parser.parse('refresh');
    parser.parse('quit');

    t.equal(parser.getHistoryAt(0), 'quit');
    t.equal(parser.getHistoryAt(1), 'refresh');
    t.equal(parser.getHistoryAt(99), null);
  });

  await t.test('getHelp() returns formatted help', async (t) => {
    const parser = new CommandParser();

    const help = parser.getHelp('connect');
    t.ok(help, 'has help');
    t.match(help, /connect/);
    t.match(help, /<address>/);
  });

  await t.test('getHelp() returns null for unknown command', async (t) => {
    const parser = new CommandParser();

    const help = parser.getHelp('unknown');
    t.equal(help, null);
  });

  await t.test('validate() returns valid for correct commands', async (t) => {
    const parser = new CommandParser();

    const result = parser.validate('refresh');
    t.same(result, {valid: true});
  });

  await t.test('validate() returns error for invalid commands', async (t) => {
    const parser = new CommandParser();

    const result = parser.validate('unknown');
    t.equal(result.valid, false);
    t.ok(result.error);
  });

  await t.test('register() adds custom commands', async (t) => {
    const parser = new CommandParser();

    parser.register('custom', {
      params: ['arg1'],
      description: 'Custom command',
    });

    const result = parser.parse('custom value');
    t.same(result, {command: 'custom', args: ['value']});
  });

  await t.test('getAllCommands() returns all non-alias commands', async (t) => {
    const parser = new CommandParser();

    const commands = parser.getAllCommands();
    t.ok(commands.length >= 8, 'has at least 8 commands');
    t.ok(commands.every((c) => !c.definition.isAlias), 'no aliases');
  });

  await t.test('clearHistory() empties history', async (t) => {
    const parser = new CommandParser();

    parser.parse('refresh');
    parser.clearHistory();

    t.equal(parser.getHistory().length, 0);
  });

  await t.test('history command parses with replica_id argument', async (t) => {
    const parser = new CommandParser();

    const result = parser.parse('history replica-123');
    t.same(result, {command: 'history', args: ['replica-123']});
  });

  await t.test('history command requires replica_id argument', async (t) => {
    const parser = new CommandParser();

    const result = parser.parse('history');
    t.ok(result.error, 'has error');
    t.match(result.error, /Missing required parameter/);
  });

  await t.test('history command alias hist works', async (t) => {
    const parser = new CommandParser();

    const result = parser.parse('hist replica-456');
    t.same(result, {command: 'history', args: ['replica-456']});
  });
});
