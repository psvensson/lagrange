/**
 * CommandParser - Command palette parser with autocomplete and history
 * Parses and validates commands for the CLI command palette
 *
 * Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6
 */

/**
 * @typedef {Object} CommandDefinition
 * @property {string[]} params - Parameter names (optional params end with '?')
 * @property {string} description - Command description
 * @property {string[]} [aliases] - Alternative command names
 */

/**
 * @typedef {Object} ParseResult
 * @property {string} [command] - Parsed command name
 * @property {string[]} [args] - Parsed arguments
 * @property {string} [error] - Error message if parsing failed
 */

import {
  CLI_COMMAND_DEFINITIONS,
  CLI_COMMAND_ERROR,
} from '../cli-constants.js';

const LOCAL_NUM_ONE_HUNDRED = 100;
const LOCAL_STR_COMMA_SPACE = ', ';
const LOCAL_STR_DQUOTE = '"';
const LOCAL_STR_SQUOTE = '\'';
const LOCAL_STR_SPACE = ' ';
const LOCAL_STR_GOTO = 'goto';
const LOCAL_STR_SORT = 'sort';
const LOCAL_STR_HELP = 'help';

export class CommandParser {
  /**
   * @param {Object} options - Configuration options
   * @param {number} [options.maxHistory=100] - Maximum history entries
   */
  constructor(options = {}) {
    this.maxHistory = options.maxHistory || LOCAL_NUM_ONE_HUNDRED;

    /** @type {Map<string, CommandDefinition>} */
    this.commands = new Map();

    /** @type {string[]} */
    this.history = [];

    // Register default commands
    this.registerDefaultCommands();
  }

  /**
   * Register default CLI commands
   */
  registerDefaultCommands() {
    for (const definition of CLI_COMMAND_DEFINITIONS) {
      this.register(definition.name, {
        params: definition.params,
        description: definition.description,
        aliases: definition.aliases,
      });
    }
  }

  /**
   * Register a command
   * @param {string} name - Command name
   * @param {CommandDefinition} definition - Command definition
   */
  register(name, definition) {
    this.commands.set(name, definition);

    // Register aliases
    if (definition.aliases) {
      for (const alias of definition.aliases) {
        this.commands.set(alias, {...definition, isAlias: true, aliasOf: name});
      }
    }
  }

  /**
   * Parse a command string
   * @param {string} input - Raw command input
   * @returns {ParseResult} Parse result
   */
  parse(input) {
    const trimmed = (input || '').trim();

    if (!trimmed) {
      return {error: CLI_COMMAND_ERROR.EMPTY_COMMAND};
    }

    // Split input into parts, respecting quoted strings
    const parts = this.tokenize(trimmed);
    const commandName = parts[0].toLowerCase();
    const args = parts.slice(1);

    // Look up command
    const definition = this.commands.get(commandName);
    if (!definition) {
      return {error: `${CLI_COMMAND_ERROR.UNKNOWN_COMMAND_PREFIX}${commandName}`};
    }

    // Get canonical command name (resolve aliases)
    const canonicalName = definition.aliasOf || commandName;

    // Validate required parameters
    const requiredParams = (definition.params || [])
      .filter((p) => !p.endsWith('?'));

    if (args.length < requiredParams.length) {
      const missing = requiredParams.slice(args.length);
      return {
        error: `${CLI_COMMAND_ERROR.MISSING_PARAMS_PREFIX}${missing.join(LOCAL_STR_COMMA_SPACE)}`,
      };
    }

    // Add to history
    this.addToHistory(trimmed);

    return {
      command: canonicalName,
      args,
    };
  }

  /**
   * Tokenize input string, respecting quoted strings
   * @param {string} input - Input string
   * @returns {string[]} Tokens
   */
  tokenize(input) {
    const tokens = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = null;

    for (let i = 0; i < input.length; i++) {
      const char = input[i];

      if ((char === LOCAL_STR_DQUOTE || char === LOCAL_STR_SQUOTE) && !inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else if (char === quoteChar && inQuotes) {
        inQuotes = false;
        quoteChar = null;
      } else if (char === LOCAL_STR_SPACE && !inQuotes) {
        if (current) {
          tokens.push(current);
          current = '';
        }
      } else {
        current += char;
      }
    }

    if (current) {
      tokens.push(current);
    }

    return tokens;
  }

  /**
   * Get command completions for partial input
   * @param {string} partial - Partial command input
   * @returns {string[]} Matching completions
   */
  getCompletions(partial) {
    const trimmed = (partial || '').trim().toLowerCase();
    const parts = this.tokenize(trimmed);

    if (parts.length === 0) {
      // Return all command names (excluding aliases)
      return this.getCommandNames();
    }

    if (parts.length === 1) {
      // Complete command name
      const prefix = parts[0];
      return this.getCommandNames()
        .filter((cmd) => cmd.startsWith(prefix));
    }

    // Complete parameters based on command
    const commandName = parts[0];
    const definition = this.commands.get(commandName);

    if (!definition) {
      return [];
    }

    // Get parameter completions
    const paramIndex = parts.length - 2;
    return this.getParameterCompletions(
      commandName, paramIndex, parts[parts.length - 1]);
  }

  /**
   * Get parameter completions for a command
   * @param {string} command - Command name
   * @param {number} paramIndex - Parameter index
   * @param {string} partial - Partial parameter value
   * @returns {string[]} Completions
   */
  getParameterCompletions(command, paramIndex, partial) {
    const prefix = (partial || '').toLowerCase();

    // Special completions for known parameters
    if (command === LOCAL_STR_GOTO && paramIndex === 0) {
      const views = [
        'nodes', 'services', 'replicas', 'tables', 'partitions',
        'message_groups', 'sql', 'logs', 'config', 'contexts',
      ];
      return views.filter((v) => v.startsWith(prefix));
    }

    if (command === LOCAL_STR_SORT && paramIndex === 1) {
      const directions = ['asc', 'desc'];
      return directions.filter((d) => d.startsWith(prefix));
    }

    if (command === LOCAL_STR_HELP && paramIndex === 0) {
      return this.getCommandNames().filter((c) => c.startsWith(prefix));
    }

    return [];
  }

  /**
   * Get all command names (excluding aliases)
   * @returns {string[]} Command names
   */
  getCommandNames() {
    const names = [];
    for (const [name, def] of this.commands) {
      if (!def.isAlias) {
        names.push(name);
      }
    }
    return names.sort();
  }

  /**
   * Get command definition
   * @param {string} name - Command name
   * @returns {CommandDefinition|undefined}
   */
  getCommand(name) {
    return this.commands.get(name);
  }

  /**
   * Get all commands with their definitions
   * @returns {Array<{name: string, definition: CommandDefinition}>}
   */
  getAllCommands() {
    const result = [];
    for (const [name, def] of this.commands) {
      if (!def.isAlias) {
        result.push({name, definition: def});
      }
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Add command to history
   * @param {string} command - Command string
   */
  addToHistory(command) {
    // Remove duplicate if exists
    const existingIndex = this.history.indexOf(command);
    if (existingIndex !== -1) {
      this.history.splice(existingIndex, 1);
    }

    // Add to front
    this.history.unshift(command);

    // Trim if too long
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(0, this.maxHistory);
    }
  }

  /**
   * Get command history
   * @returns {string[]} History entries (most recent first)
   */
  getHistory() {
    return [...this.history];
  }

  /**
   * Get history entry at index
   * @param {number} index - History index (0 = most recent)
   * @returns {string|null}
   */
  getHistoryAt(index) {
    return this.history[index] || null;
  }

  /**
   * Clear command history
   */
  clearHistory() {
    this.history = [];
  }

  /**
   * Get help text for a command
   * @param {string} name - Command name
   * @returns {string|null} Help text or null if command not found
   */
  getHelp(name) {
    const def = this.commands.get(name);
    if (!def) return null;

    const canonicalName = def.aliasOf || name;
    const canonicalDef = this.commands.get(canonicalName);

    const params = (canonicalDef.params || [])
      .map((p) => p.endsWith('?') ? `[${p.slice(0, -1)}]` : `<${p}>`)
      .join(' ');

    const aliases = canonicalDef.aliases && canonicalDef.aliases.length > 0 ?
      `\n  Aliases: ${canonicalDef.aliases.join(', ')}` : '';

    return `${canonicalName} ${params}\n  ${canonicalDef.description}${aliases}`;
  }

  /**
   * Validate a command without executing
   * @param {string} input - Command input
   * @returns {{valid: boolean, error?: string}}
   */
  validate(input) {
    const result = this.parse(input);
    if (result.error) {
      return {valid: false, error: result.error};
    }
    return {valid: true};
  }
}
