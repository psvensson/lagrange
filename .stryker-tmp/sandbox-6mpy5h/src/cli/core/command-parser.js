/**
 * CommandParser - Command palette parser with autocomplete and history
 * Parses and validates commands for the CLI command palette
 *
 * Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6
 */
// @ts-nocheck


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
 */function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { CLI_COMMAND_DEFINITIONS, CLI_COMMAND_ERROR } from '../cli-constants.js';
export class CommandParser {
  /**
   * @param {Object} options - Configuration options
   * @param {number} [options.maxHistory=100] - Maximum history entries
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("40257")) {
      {}
    } else {
      stryCov_9fa48("40257");
      this.maxHistory = stryMutAct_9fa48("40260") ? options.maxHistory && 100 : stryMutAct_9fa48("40259") ? false : stryMutAct_9fa48("40258") ? true : (stryCov_9fa48("40258", "40259", "40260"), options.maxHistory || 100);

      /** @type {Map<string, CommandDefinition>} */
      this.commands = new Map();

      /** @type {string[]} */
      this.history = stryMutAct_9fa48("40261") ? ["Stryker was here"] : (stryCov_9fa48("40261"), []);

      // Register default commands
      this.registerDefaultCommands();
    }
  }

  /**
   * Register default CLI commands
   */
  registerDefaultCommands() {
    if (stryMutAct_9fa48("40262")) {
      {}
    } else {
      stryCov_9fa48("40262");
      for (const definition of CLI_COMMAND_DEFINITIONS) {
        if (stryMutAct_9fa48("40263")) {
          {}
        } else {
          stryCov_9fa48("40263");
          this.register(definition.name, stryMutAct_9fa48("40264") ? {} : (stryCov_9fa48("40264"), {
            params: definition.params,
            description: definition.description,
            aliases: definition.aliases
          }));
        }
      }
    }
  }

  /**
   * Register a command
   * @param {string} name - Command name
   * @param {CommandDefinition} definition - Command definition
   */
  register(name, definition) {
    if (stryMutAct_9fa48("40265")) {
      {}
    } else {
      stryCov_9fa48("40265");
      this.commands.set(name, definition);

      // Register aliases
      if (stryMutAct_9fa48("40267") ? false : stryMutAct_9fa48("40266") ? true : (stryCov_9fa48("40266", "40267"), definition.aliases)) {
        if (stryMutAct_9fa48("40268")) {
          {}
        } else {
          stryCov_9fa48("40268");
          for (const alias of definition.aliases) {
            if (stryMutAct_9fa48("40269")) {
              {}
            } else {
              stryCov_9fa48("40269");
              this.commands.set(alias, stryMutAct_9fa48("40270") ? {} : (stryCov_9fa48("40270"), {
                ...definition,
                isAlias: stryMutAct_9fa48("40271") ? false : (stryCov_9fa48("40271"), true),
                aliasOf: name
              }));
            }
          }
        }
      }
    }
  }

  /**
   * Parse a command string
   * @param {string} input - Raw command input
   * @returns {ParseResult} Parse result
   */
  parse(input) {
    if (stryMutAct_9fa48("40272")) {
      {}
    } else {
      stryCov_9fa48("40272");
      const trimmed = stryMutAct_9fa48("40273") ? input || '' : (stryCov_9fa48("40273"), (stryMutAct_9fa48("40276") ? input && '' : stryMutAct_9fa48("40275") ? false : stryMutAct_9fa48("40274") ? true : (stryCov_9fa48("40274", "40275", "40276"), input || (stryMutAct_9fa48("40277") ? "Stryker was here!" : (stryCov_9fa48("40277"), '')))).trim());
      if (stryMutAct_9fa48("40280") ? false : stryMutAct_9fa48("40279") ? true : stryMutAct_9fa48("40278") ? trimmed : (stryCov_9fa48("40278", "40279", "40280"), !trimmed)) {
        if (stryMutAct_9fa48("40281")) {
          {}
        } else {
          stryCov_9fa48("40281");
          return stryMutAct_9fa48("40282") ? {} : (stryCov_9fa48("40282"), {
            error: CLI_COMMAND_ERROR.EMPTY_COMMAND
          });
        }
      }

      // Split input into parts, respecting quoted strings
      const parts = this.tokenize(trimmed);
      const commandName = stryMutAct_9fa48("40283") ? parts[0].toUpperCase() : (stryCov_9fa48("40283"), parts[0].toLowerCase());
      const args = stryMutAct_9fa48("40284") ? parts : (stryCov_9fa48("40284"), parts.slice(1));

      // Look up command
      const definition = this.commands.get(commandName);
      if (stryMutAct_9fa48("40287") ? false : stryMutAct_9fa48("40286") ? true : stryMutAct_9fa48("40285") ? definition : (stryCov_9fa48("40285", "40286", "40287"), !definition)) {
        if (stryMutAct_9fa48("40288")) {
          {}
        } else {
          stryCov_9fa48("40288");
          return stryMutAct_9fa48("40289") ? {} : (stryCov_9fa48("40289"), {
            error: stryMutAct_9fa48("40290") ? `` : (stryCov_9fa48("40290"), `${CLI_COMMAND_ERROR.UNKNOWN_COMMAND_PREFIX}${commandName}`)
          });
        }
      }

      // Get canonical command name (resolve aliases)
      const canonicalName = stryMutAct_9fa48("40293") ? definition.aliasOf && commandName : stryMutAct_9fa48("40292") ? false : stryMutAct_9fa48("40291") ? true : (stryCov_9fa48("40291", "40292", "40293"), definition.aliasOf || commandName);

      // Validate required parameters
      const requiredParams = stryMutAct_9fa48("40294") ? definition.params || [] : (stryCov_9fa48("40294"), (stryMutAct_9fa48("40297") ? definition.params && [] : stryMutAct_9fa48("40296") ? false : stryMutAct_9fa48("40295") ? true : (stryCov_9fa48("40295", "40296", "40297"), definition.params || (stryMutAct_9fa48("40298") ? ["Stryker was here"] : (stryCov_9fa48("40298"), [])))).filter(stryMutAct_9fa48("40299") ? () => undefined : (stryCov_9fa48("40299"), p => stryMutAct_9fa48("40300") ? p.endsWith('?') : (stryCov_9fa48("40300"), !(stryMutAct_9fa48("40301") ? p.startsWith('?') : (stryCov_9fa48("40301"), p.endsWith(stryMutAct_9fa48("40302") ? "" : (stryCov_9fa48("40302"), '?'))))))));
      if (stryMutAct_9fa48("40306") ? args.length >= requiredParams.length : stryMutAct_9fa48("40305") ? args.length <= requiredParams.length : stryMutAct_9fa48("40304") ? false : stryMutAct_9fa48("40303") ? true : (stryCov_9fa48("40303", "40304", "40305", "40306"), args.length < requiredParams.length)) {
        if (stryMutAct_9fa48("40307")) {
          {}
        } else {
          stryCov_9fa48("40307");
          const missing = stryMutAct_9fa48("40308") ? requiredParams : (stryCov_9fa48("40308"), requiredParams.slice(args.length));
          return stryMutAct_9fa48("40309") ? {} : (stryCov_9fa48("40309"), {
            error: stryMutAct_9fa48("40310") ? `` : (stryCov_9fa48("40310"), `${CLI_COMMAND_ERROR.MISSING_PARAMS_PREFIX}${missing.join(stryMutAct_9fa48("40311") ? "" : (stryCov_9fa48("40311"), ', '))}`)
          });
        }
      }

      // Add to history
      this.addToHistory(trimmed);
      return stryMutAct_9fa48("40312") ? {} : (stryCov_9fa48("40312"), {
        command: canonicalName,
        args
      });
    }
  }

  /**
   * Tokenize input string, respecting quoted strings
   * @param {string} input - Input string
   * @returns {string[]} Tokens
   */
  tokenize(input) {
    if (stryMutAct_9fa48("40313")) {
      {}
    } else {
      stryCov_9fa48("40313");
      const tokens = stryMutAct_9fa48("40314") ? ["Stryker was here"] : (stryCov_9fa48("40314"), []);
      let current = stryMutAct_9fa48("40315") ? "Stryker was here!" : (stryCov_9fa48("40315"), '');
      let inQuotes = stryMutAct_9fa48("40316") ? true : (stryCov_9fa48("40316"), false);
      let quoteChar = null;
      for (let i = 0; stryMutAct_9fa48("40319") ? i >= input.length : stryMutAct_9fa48("40318") ? i <= input.length : stryMutAct_9fa48("40317") ? false : (stryCov_9fa48("40317", "40318", "40319"), i < input.length); stryMutAct_9fa48("40320") ? i-- : (stryCov_9fa48("40320"), i++)) {
        if (stryMutAct_9fa48("40321")) {
          {}
        } else {
          stryCov_9fa48("40321");
          const char = input[i];
          if (stryMutAct_9fa48("40324") ? char === '"' || char === '\'' || !inQuotes : stryMutAct_9fa48("40323") ? false : stryMutAct_9fa48("40322") ? true : (stryCov_9fa48("40322", "40323", "40324"), (stryMutAct_9fa48("40326") ? char === '"' && char === '\'' : stryMutAct_9fa48("40325") ? true : (stryCov_9fa48("40325", "40326"), (stryMutAct_9fa48("40328") ? char !== '"' : stryMutAct_9fa48("40327") ? false : (stryCov_9fa48("40327", "40328"), char === (stryMutAct_9fa48("40329") ? "" : (stryCov_9fa48("40329"), '"')))) || (stryMutAct_9fa48("40331") ? char !== '\'' : stryMutAct_9fa48("40330") ? false : (stryCov_9fa48("40330", "40331"), char === (stryMutAct_9fa48("40332") ? "" : (stryCov_9fa48("40332"), '\'')))))) && (stryMutAct_9fa48("40333") ? inQuotes : (stryCov_9fa48("40333"), !inQuotes)))) {
            if (stryMutAct_9fa48("40334")) {
              {}
            } else {
              stryCov_9fa48("40334");
              inQuotes = stryMutAct_9fa48("40335") ? false : (stryCov_9fa48("40335"), true);
              quoteChar = char;
            }
          } else if (stryMutAct_9fa48("40338") ? char === quoteChar || inQuotes : stryMutAct_9fa48("40337") ? false : stryMutAct_9fa48("40336") ? true : (stryCov_9fa48("40336", "40337", "40338"), (stryMutAct_9fa48("40340") ? char !== quoteChar : stryMutAct_9fa48("40339") ? true : (stryCov_9fa48("40339", "40340"), char === quoteChar)) && inQuotes)) {
            if (stryMutAct_9fa48("40341")) {
              {}
            } else {
              stryCov_9fa48("40341");
              inQuotes = stryMutAct_9fa48("40342") ? true : (stryCov_9fa48("40342"), false);
              quoteChar = null;
            }
          } else if (stryMutAct_9fa48("40345") ? char === ' ' || !inQuotes : stryMutAct_9fa48("40344") ? false : stryMutAct_9fa48("40343") ? true : (stryCov_9fa48("40343", "40344", "40345"), (stryMutAct_9fa48("40347") ? char !== ' ' : stryMutAct_9fa48("40346") ? true : (stryCov_9fa48("40346", "40347"), char === (stryMutAct_9fa48("40348") ? "" : (stryCov_9fa48("40348"), ' ')))) && (stryMutAct_9fa48("40349") ? inQuotes : (stryCov_9fa48("40349"), !inQuotes)))) {
            if (stryMutAct_9fa48("40350")) {
              {}
            } else {
              stryCov_9fa48("40350");
              if (stryMutAct_9fa48("40352") ? false : stryMutAct_9fa48("40351") ? true : (stryCov_9fa48("40351", "40352"), current)) {
                if (stryMutAct_9fa48("40353")) {
                  {}
                } else {
                  stryCov_9fa48("40353");
                  tokens.push(current);
                  current = stryMutAct_9fa48("40354") ? "Stryker was here!" : (stryCov_9fa48("40354"), '');
                }
              }
            }
          } else {
            if (stryMutAct_9fa48("40355")) {
              {}
            } else {
              stryCov_9fa48("40355");
              stryMutAct_9fa48("40356") ? current -= char : (stryCov_9fa48("40356"), current += char);
            }
          }
        }
      }
      if (stryMutAct_9fa48("40358") ? false : stryMutAct_9fa48("40357") ? true : (stryCov_9fa48("40357", "40358"), current)) {
        if (stryMutAct_9fa48("40359")) {
          {}
        } else {
          stryCov_9fa48("40359");
          tokens.push(current);
        }
      }
      return tokens;
    }
  }

  /**
   * Get command completions for partial input
   * @param {string} partial - Partial command input
   * @returns {string[]} Matching completions
   */
  getCompletions(partial) {
    if (stryMutAct_9fa48("40360")) {
      {}
    } else {
      stryCov_9fa48("40360");
      const trimmed = stryMutAct_9fa48("40362") ? (partial || '').toLowerCase() : stryMutAct_9fa48("40361") ? (partial || '').trim().toUpperCase() : (stryCov_9fa48("40361", "40362"), (stryMutAct_9fa48("40365") ? partial && '' : stryMutAct_9fa48("40364") ? false : stryMutAct_9fa48("40363") ? true : (stryCov_9fa48("40363", "40364", "40365"), partial || (stryMutAct_9fa48("40366") ? "Stryker was here!" : (stryCov_9fa48("40366"), '')))).trim().toLowerCase());
      const parts = this.tokenize(trimmed);
      if (stryMutAct_9fa48("40369") ? parts.length !== 0 : stryMutAct_9fa48("40368") ? false : stryMutAct_9fa48("40367") ? true : (stryCov_9fa48("40367", "40368", "40369"), parts.length === 0)) {
        if (stryMutAct_9fa48("40370")) {
          {}
        } else {
          stryCov_9fa48("40370");
          // Return all command names (excluding aliases)
          return this.getCommandNames();
        }
      }
      if (stryMutAct_9fa48("40373") ? parts.length !== 1 : stryMutAct_9fa48("40372") ? false : stryMutAct_9fa48("40371") ? true : (stryCov_9fa48("40371", "40372", "40373"), parts.length === 1)) {
        if (stryMutAct_9fa48("40374")) {
          {}
        } else {
          stryCov_9fa48("40374");
          // Complete command name
          const prefix = parts[0];
          return stryMutAct_9fa48("40375") ? this.getCommandNames() : (stryCov_9fa48("40375"), this.getCommandNames().filter(stryMutAct_9fa48("40376") ? () => undefined : (stryCov_9fa48("40376"), cmd => stryMutAct_9fa48("40377") ? cmd.endsWith(prefix) : (stryCov_9fa48("40377"), cmd.startsWith(prefix)))));
        }
      }

      // Complete parameters based on command
      const commandName = parts[0];
      const definition = this.commands.get(commandName);
      if (stryMutAct_9fa48("40380") ? false : stryMutAct_9fa48("40379") ? true : stryMutAct_9fa48("40378") ? definition : (stryCov_9fa48("40378", "40379", "40380"), !definition)) {
        if (stryMutAct_9fa48("40381")) {
          {}
        } else {
          stryCov_9fa48("40381");
          return stryMutAct_9fa48("40382") ? ["Stryker was here"] : (stryCov_9fa48("40382"), []);
        }
      }

      // Get parameter completions
      const paramIndex = stryMutAct_9fa48("40383") ? parts.length + 2 : (stryCov_9fa48("40383"), parts.length - 2);
      return this.getParameterCompletions(commandName, paramIndex, parts[stryMutAct_9fa48("40384") ? parts.length + 1 : (stryCov_9fa48("40384"), parts.length - 1)]);
    }
  }

  /**
   * Get parameter completions for a command
   * @param {string} command - Command name
   * @param {number} paramIndex - Parameter index
   * @param {string} partial - Partial parameter value
   * @returns {string[]} Completions
   */
  getParameterCompletions(command, paramIndex, partial) {
    if (stryMutAct_9fa48("40385")) {
      {}
    } else {
      stryCov_9fa48("40385");
      const prefix = stryMutAct_9fa48("40386") ? (partial || '').toUpperCase() : (stryCov_9fa48("40386"), (stryMutAct_9fa48("40389") ? partial && '' : stryMutAct_9fa48("40388") ? false : stryMutAct_9fa48("40387") ? true : (stryCov_9fa48("40387", "40388", "40389"), partial || (stryMutAct_9fa48("40390") ? "Stryker was here!" : (stryCov_9fa48("40390"), '')))).toLowerCase());

      // Special completions for known parameters
      if (stryMutAct_9fa48("40393") ? command === 'goto' || paramIndex === 0 : stryMutAct_9fa48("40392") ? false : stryMutAct_9fa48("40391") ? true : (stryCov_9fa48("40391", "40392", "40393"), (stryMutAct_9fa48("40395") ? command !== 'goto' : stryMutAct_9fa48("40394") ? true : (stryCov_9fa48("40394", "40395"), command === (stryMutAct_9fa48("40396") ? "" : (stryCov_9fa48("40396"), 'goto')))) && (stryMutAct_9fa48("40398") ? paramIndex !== 0 : stryMutAct_9fa48("40397") ? true : (stryCov_9fa48("40397", "40398"), paramIndex === 0)))) {
        if (stryMutAct_9fa48("40399")) {
          {}
        } else {
          stryCov_9fa48("40399");
          const views = stryMutAct_9fa48("40400") ? [] : (stryCov_9fa48("40400"), [stryMutAct_9fa48("40401") ? "" : (stryCov_9fa48("40401"), 'nodes'), stryMutAct_9fa48("40402") ? "" : (stryCov_9fa48("40402"), 'services'), stryMutAct_9fa48("40403") ? "" : (stryCov_9fa48("40403"), 'replicas'), stryMutAct_9fa48("40404") ? "" : (stryCov_9fa48("40404"), 'tables'), stryMutAct_9fa48("40405") ? "" : (stryCov_9fa48("40405"), 'partitions'), stryMutAct_9fa48("40406") ? "" : (stryCov_9fa48("40406"), 'message_groups'), stryMutAct_9fa48("40407") ? "" : (stryCov_9fa48("40407"), 'sql'), stryMutAct_9fa48("40408") ? "" : (stryCov_9fa48("40408"), 'logs'), stryMutAct_9fa48("40409") ? "" : (stryCov_9fa48("40409"), 'config'), stryMutAct_9fa48("40410") ? "" : (stryCov_9fa48("40410"), 'contexts')]);
          return stryMutAct_9fa48("40411") ? views : (stryCov_9fa48("40411"), views.filter(stryMutAct_9fa48("40412") ? () => undefined : (stryCov_9fa48("40412"), v => stryMutAct_9fa48("40413") ? v.endsWith(prefix) : (stryCov_9fa48("40413"), v.startsWith(prefix)))));
        }
      }
      if (stryMutAct_9fa48("40416") ? command === 'sort' || paramIndex === 1 : stryMutAct_9fa48("40415") ? false : stryMutAct_9fa48("40414") ? true : (stryCov_9fa48("40414", "40415", "40416"), (stryMutAct_9fa48("40418") ? command !== 'sort' : stryMutAct_9fa48("40417") ? true : (stryCov_9fa48("40417", "40418"), command === (stryMutAct_9fa48("40419") ? "" : (stryCov_9fa48("40419"), 'sort')))) && (stryMutAct_9fa48("40421") ? paramIndex !== 1 : stryMutAct_9fa48("40420") ? true : (stryCov_9fa48("40420", "40421"), paramIndex === 1)))) {
        if (stryMutAct_9fa48("40422")) {
          {}
        } else {
          stryCov_9fa48("40422");
          const directions = stryMutAct_9fa48("40423") ? [] : (stryCov_9fa48("40423"), [stryMutAct_9fa48("40424") ? "" : (stryCov_9fa48("40424"), 'asc'), stryMutAct_9fa48("40425") ? "" : (stryCov_9fa48("40425"), 'desc')]);
          return stryMutAct_9fa48("40426") ? directions : (stryCov_9fa48("40426"), directions.filter(stryMutAct_9fa48("40427") ? () => undefined : (stryCov_9fa48("40427"), d => stryMutAct_9fa48("40428") ? d.endsWith(prefix) : (stryCov_9fa48("40428"), d.startsWith(prefix)))));
        }
      }
      if (stryMutAct_9fa48("40431") ? command === 'help' || paramIndex === 0 : stryMutAct_9fa48("40430") ? false : stryMutAct_9fa48("40429") ? true : (stryCov_9fa48("40429", "40430", "40431"), (stryMutAct_9fa48("40433") ? command !== 'help' : stryMutAct_9fa48("40432") ? true : (stryCov_9fa48("40432", "40433"), command === (stryMutAct_9fa48("40434") ? "" : (stryCov_9fa48("40434"), 'help')))) && (stryMutAct_9fa48("40436") ? paramIndex !== 0 : stryMutAct_9fa48("40435") ? true : (stryCov_9fa48("40435", "40436"), paramIndex === 0)))) {
        if (stryMutAct_9fa48("40437")) {
          {}
        } else {
          stryCov_9fa48("40437");
          return stryMutAct_9fa48("40438") ? this.getCommandNames() : (stryCov_9fa48("40438"), this.getCommandNames().filter(stryMutAct_9fa48("40439") ? () => undefined : (stryCov_9fa48("40439"), c => stryMutAct_9fa48("40440") ? c.endsWith(prefix) : (stryCov_9fa48("40440"), c.startsWith(prefix)))));
        }
      }
      return stryMutAct_9fa48("40441") ? ["Stryker was here"] : (stryCov_9fa48("40441"), []);
    }
  }

  /**
   * Get all command names (excluding aliases)
   * @returns {string[]} Command names
   */
  getCommandNames() {
    if (stryMutAct_9fa48("40442")) {
      {}
    } else {
      stryCov_9fa48("40442");
      const names = stryMutAct_9fa48("40443") ? ["Stryker was here"] : (stryCov_9fa48("40443"), []);
      for (const [name, def] of this.commands) {
        if (stryMutAct_9fa48("40444")) {
          {}
        } else {
          stryCov_9fa48("40444");
          if (stryMutAct_9fa48("40447") ? false : stryMutAct_9fa48("40446") ? true : stryMutAct_9fa48("40445") ? def.isAlias : (stryCov_9fa48("40445", "40446", "40447"), !def.isAlias)) {
            if (stryMutAct_9fa48("40448")) {
              {}
            } else {
              stryCov_9fa48("40448");
              names.push(name);
            }
          }
        }
      }
      return stryMutAct_9fa48("40449") ? names : (stryCov_9fa48("40449"), names.sort());
    }
  }

  /**
   * Get command definition
   * @param {string} name - Command name
   * @returns {CommandDefinition|undefined}
   */
  getCommand(name) {
    if (stryMutAct_9fa48("40450")) {
      {}
    } else {
      stryCov_9fa48("40450");
      return this.commands.get(name);
    }
  }

  /**
   * Get all commands with their definitions
   * @returns {Array<{name: string, definition: CommandDefinition}>}
   */
  getAllCommands() {
    if (stryMutAct_9fa48("40451")) {
      {}
    } else {
      stryCov_9fa48("40451");
      const result = stryMutAct_9fa48("40452") ? ["Stryker was here"] : (stryCov_9fa48("40452"), []);
      for (const [name, def] of this.commands) {
        if (stryMutAct_9fa48("40453")) {
          {}
        } else {
          stryCov_9fa48("40453");
          if (stryMutAct_9fa48("40456") ? false : stryMutAct_9fa48("40455") ? true : stryMutAct_9fa48("40454") ? def.isAlias : (stryCov_9fa48("40454", "40455", "40456"), !def.isAlias)) {
            if (stryMutAct_9fa48("40457")) {
              {}
            } else {
              stryCov_9fa48("40457");
              result.push(stryMutAct_9fa48("40458") ? {} : (stryCov_9fa48("40458"), {
                name,
                definition: def
              }));
            }
          }
        }
      }
      return stryMutAct_9fa48("40459") ? result : (stryCov_9fa48("40459"), result.sort(stryMutAct_9fa48("40460") ? () => undefined : (stryCov_9fa48("40460"), (a, b) => a.name.localeCompare(b.name))));
    }
  }

  /**
   * Add command to history
   * @param {string} command - Command string
   */
  addToHistory(command) {
    if (stryMutAct_9fa48("40461")) {
      {}
    } else {
      stryCov_9fa48("40461");
      // Remove duplicate if exists
      const existingIndex = this.history.indexOf(command);
      if (stryMutAct_9fa48("40464") ? existingIndex === -1 : stryMutAct_9fa48("40463") ? false : stryMutAct_9fa48("40462") ? true : (stryCov_9fa48("40462", "40463", "40464"), existingIndex !== (stryMutAct_9fa48("40465") ? +1 : (stryCov_9fa48("40465"), -1)))) {
        if (stryMutAct_9fa48("40466")) {
          {}
        } else {
          stryCov_9fa48("40466");
          this.history.splice(existingIndex, 1);
        }
      }

      // Add to front
      this.history.unshift(command);

      // Trim if too long
      if (stryMutAct_9fa48("40470") ? this.history.length <= this.maxHistory : stryMutAct_9fa48("40469") ? this.history.length >= this.maxHistory : stryMutAct_9fa48("40468") ? false : stryMutAct_9fa48("40467") ? true : (stryCov_9fa48("40467", "40468", "40469", "40470"), this.history.length > this.maxHistory)) {
        if (stryMutAct_9fa48("40471")) {
          {}
        } else {
          stryCov_9fa48("40471");
          this.history = stryMutAct_9fa48("40472") ? this.history : (stryCov_9fa48("40472"), this.history.slice(0, this.maxHistory));
        }
      }
    }
  }

  /**
   * Get command history
   * @returns {string[]} History entries (most recent first)
   */
  getHistory() {
    if (stryMutAct_9fa48("40473")) {
      {}
    } else {
      stryCov_9fa48("40473");
      return stryMutAct_9fa48("40474") ? [] : (stryCov_9fa48("40474"), [...this.history]);
    }
  }

  /**
   * Get history entry at index
   * @param {number} index - History index (0 = most recent)
   * @returns {string|null}
   */
  getHistoryAt(index) {
    if (stryMutAct_9fa48("40475")) {
      {}
    } else {
      stryCov_9fa48("40475");
      return stryMutAct_9fa48("40478") ? this.history[index] && null : stryMutAct_9fa48("40477") ? false : stryMutAct_9fa48("40476") ? true : (stryCov_9fa48("40476", "40477", "40478"), this.history[index] || null);
    }
  }

  /**
   * Clear command history
   */
  clearHistory() {
    if (stryMutAct_9fa48("40479")) {
      {}
    } else {
      stryCov_9fa48("40479");
      this.history = stryMutAct_9fa48("40480") ? ["Stryker was here"] : (stryCov_9fa48("40480"), []);
    }
  }

  /**
   * Get help text for a command
   * @param {string} name - Command name
   * @returns {string|null} Help text or null if command not found
   */
  getHelp(name) {
    if (stryMutAct_9fa48("40481")) {
      {}
    } else {
      stryCov_9fa48("40481");
      const def = this.commands.get(name);
      if (stryMutAct_9fa48("40484") ? false : stryMutAct_9fa48("40483") ? true : stryMutAct_9fa48("40482") ? def : (stryCov_9fa48("40482", "40483", "40484"), !def)) return null;
      const canonicalName = stryMutAct_9fa48("40487") ? def.aliasOf && name : stryMutAct_9fa48("40486") ? false : stryMutAct_9fa48("40485") ? true : (stryCov_9fa48("40485", "40486", "40487"), def.aliasOf || name);
      const canonicalDef = this.commands.get(canonicalName);
      const params = (stryMutAct_9fa48("40490") ? canonicalDef.params && [] : stryMutAct_9fa48("40489") ? false : stryMutAct_9fa48("40488") ? true : (stryCov_9fa48("40488", "40489", "40490"), canonicalDef.params || (stryMutAct_9fa48("40491") ? ["Stryker was here"] : (stryCov_9fa48("40491"), [])))).map(stryMutAct_9fa48("40492") ? () => undefined : (stryCov_9fa48("40492"), p => (stryMutAct_9fa48("40493") ? p.startsWith('?') : (stryCov_9fa48("40493"), p.endsWith(stryMutAct_9fa48("40494") ? "" : (stryCov_9fa48("40494"), '?')))) ? stryMutAct_9fa48("40495") ? `` : (stryCov_9fa48("40495"), `[${stryMutAct_9fa48("40496") ? p : (stryCov_9fa48("40496"), p.slice(0, stryMutAct_9fa48("40497") ? +1 : (stryCov_9fa48("40497"), -1)))}]`) : stryMutAct_9fa48("40498") ? `` : (stryCov_9fa48("40498"), `<${p}>`))).join(stryMutAct_9fa48("40499") ? "" : (stryCov_9fa48("40499"), ' '));
      const aliases = (stryMutAct_9fa48("40502") ? canonicalDef.aliases || canonicalDef.aliases.length > 0 : stryMutAct_9fa48("40501") ? false : stryMutAct_9fa48("40500") ? true : (stryCov_9fa48("40500", "40501", "40502"), canonicalDef.aliases && (stryMutAct_9fa48("40505") ? canonicalDef.aliases.length <= 0 : stryMutAct_9fa48("40504") ? canonicalDef.aliases.length >= 0 : stryMutAct_9fa48("40503") ? true : (stryCov_9fa48("40503", "40504", "40505"), canonicalDef.aliases.length > 0)))) ? stryMutAct_9fa48("40506") ? `` : (stryCov_9fa48("40506"), `\n  Aliases: ${canonicalDef.aliases.join(stryMutAct_9fa48("40507") ? "" : (stryCov_9fa48("40507"), ', '))}`) : stryMutAct_9fa48("40508") ? "Stryker was here!" : (stryCov_9fa48("40508"), '');
      return stryMutAct_9fa48("40509") ? `` : (stryCov_9fa48("40509"), `${canonicalName} ${params}\n  ${canonicalDef.description}${aliases}`);
    }
  }

  /**
   * Validate a command without executing
   * @param {string} input - Command input
   * @returns {{valid: boolean, error?: string}}
   */
  validate(input) {
    if (stryMutAct_9fa48("40510")) {
      {}
    } else {
      stryCov_9fa48("40510");
      const result = this.parse(input);
      if (stryMutAct_9fa48("40512") ? false : stryMutAct_9fa48("40511") ? true : (stryCov_9fa48("40511", "40512"), result.error)) {
        if (stryMutAct_9fa48("40513")) {
          {}
        } else {
          stryCov_9fa48("40513");
          return stryMutAct_9fa48("40514") ? {} : (stryCov_9fa48("40514"), {
            valid: stryMutAct_9fa48("40515") ? true : (stryCov_9fa48("40515"), false),
            error: result.error
          });
        }
      }
      return stryMutAct_9fa48("40516") ? {} : (stryCov_9fa48("40516"), {
        valid: stryMutAct_9fa48("40517") ? false : (stryCov_9fa48("40517"), true)
      });
    }
  }
}