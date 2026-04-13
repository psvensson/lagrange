/**
 * Property Test: Command Parsing Correctness
 * Property 11: For any valid command string, parsing should produce the correct
 * command name and arguments. For any invalid command, parsing should return an error.
 *
 * **Validates: Requirements 15.2, 15.5**
 */
// @ts-nocheck


import {test} from '../../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {CommandParser} from '../../../src/cli/core/command-parser.js';

test('Property 11: Command Parsing Correctness', async (t) => {
  await t.test('valid commands parse to correct name and args', async (t) => {
    const parser = new CommandParser();
    const validCommands = parser.getCommandNames();

    fc.assert(
      fc.property(
        // Pick a valid command name
        fc.constantFrom(...validCommands),
        // Generate 0-3 arguments
        fc.array(
          fc.string({minLength: 1, maxLength: 20})
            .filter((s) => /^[a-zA-Z0-9_.-]+$/.test(s)),
          {minLength: 0, maxLength: 3},
        ),
        (commandName, args) => {
          const def = parser.getCommand(commandName);
          const requiredParams = (def.params || [])
            .filter((p) => !p.endsWith('?'));

          // Only test if we have enough args for required params
          if (args.length < requiredParams.length) {
            return true; // Skip this case
          }

          const input = [commandName, ...args].join(' ');
          const result = parser.parse(input);

          // Should not have error
          if (result.error) return false;

          // Command name should match (or be canonical for aliases)
          const expectedCommand = def.aliasOf || commandName;
          if (result.command !== expectedCommand) return false;

          // Args should match
          if (result.args.length !== args.length) return false;
          for (let i = 0; i < args.length; i++) {
            if (result.args[i] !== args[i]) return false;
          }

          return true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Valid commands parse correctly');
  });

  await t.test('invalid commands return error', async (t) => {
    const parser = new CommandParser();
    const validCommands = new Set(parser.getCommandNames());

    // Also add aliases to valid set
    for (const {definition} of parser.getAllCommands()) {
      if (definition.aliases) {
        for (const alias of definition.aliases) {
          validCommands.add(alias);
        }
      }
    }

    fc.assert(
      fc.property(
        // Generate random strings that are NOT valid commands
        fc.string({minLength: 1, maxLength: 20})
          .filter((s) => /^[a-z]+$/.test(s) && !validCommands.has(s)),
        (invalidCommand) => {
          const result = parser.parse(invalidCommand);

          // Should have error
          return result.error !== undefined &&
                     result.error.includes('Unknown command');
        },
      ),
      {numRuns: 10},
    );
    t.pass('Invalid commands return error');
  });

  await t.test('missing required params return error', async (t) => {
    const parser = new CommandParser();

    // Commands with required params
    const commandsWithRequiredParams = parser.getAllCommands()
      .filter(({definition}) => {
        const required = (definition.params || [])
          .filter((p) => !p.endsWith('?'));
        return required.length > 0;
      })
      .map(({name}) => name);

    if (commandsWithRequiredParams.length === 0) {
      t.pass('No commands with required params to test');
      return;
    }

    fc.assert(
      fc.property(
        fc.constantFrom(...commandsWithRequiredParams),
        (commandName) => {
          // Parse without any arguments
          const result = parser.parse(commandName);

          // Should have error about missing params
          return result.error !== undefined &&
                     result.error.includes('Missing required parameter');
        },
      ),
      {numRuns: 10},
    );
    t.pass('Missing required params return error');
  });

  await t.test('aliases resolve to canonical command names', async (t) => {
    const parser = new CommandParser();

    // Get all aliases
    const aliasMap = [];
    for (const {name, definition} of parser.getAllCommands()) {
      if (definition.aliases) {
        for (const alias of definition.aliases) {
          aliasMap.push({alias, canonical: name});
        }
      }
    }

    if (aliasMap.length === 0) {
      t.pass('No aliases to test');
      return;
    }

    fc.assert(
      fc.property(
        fc.constantFrom(...aliasMap),
        ({alias, canonical}) => {
          // Get the definition to check required params
          const def = parser.getCommand(canonical);
          const requiredParams = (def.params || [])
            .filter((p) => !p.endsWith('?'));

          // Build input with enough args
          const args = requiredParams.map((_, i) => `arg${i}`);
          const input = [alias, ...args].join(' ');

          const result = parser.parse(input);

          // Should resolve to canonical name
          return !result.error && result.command === canonical;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Aliases resolve to canonical names');
  });

  await t.test('empty input returns error', async (t) => {
    const parser = new CommandParser();

    fc.assert(
      fc.property(
        // Generate whitespace-only strings
        fc.stringOf(fc.constantFrom(' ', '\t', '\n'), {maxLength: 10}),
        (whitespace) => {
          const result = parser.parse(whitespace);
          return result.error !== undefined;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Empty/whitespace input returns error');
  });

  await t.test('quoted arguments preserve spaces', async (t) => {
    const parser = new CommandParser();

    fc.assert(
      fc.property(
        // Generate strings with spaces
        fc.tuple(
          fc.string({minLength: 1, maxLength: 10})
            .filter((s) => /^[a-zA-Z]+$/.test(s)),
          fc.string({minLength: 1, maxLength: 10})
            .filter((s) => /^[a-zA-Z]+$/.test(s)),
        ),
        ([word1, word2]) => {
          const argWithSpaces = `${word1} ${word2}`;
          const input = `filter "${argWithSpaces}"`;

          const result = parser.parse(input);

          return !result.error &&
                     result.command === 'filter' &&
                     result.args[0] === argWithSpaces;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Quoted arguments preserve spaces');
  });
});
