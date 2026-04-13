// @ts-nocheck
function stryNS_9fa48() {
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
import os from 'os';
import { URL } from 'node:url';
import { COLUMN, ENDPOINT_STATUS, HOST, NUM, PROTOCOL, TABLES, TRANSPORT_TYPE, TYPEOF } from '../constants/index.js';
import { ENTRYPOINT_DEFAULT } from '../constants/entrypoint.js';
import { normalizeToWebSocketAddress } from '../constants/transport.js';
const NODE_WEBSOCKET_ADDRESS_RESOLUTION_REASON = Object.freeze(stryMutAct_9fa48("158305") ? {} : (stryCov_9fa48("158305"), {
  TARGET_NODE_MISSING: stryMutAct_9fa48("158306") ? "" : (stryCov_9fa48("158306"), 'target_node_missing'),
  CANONICAL_METADATA_MISSING: stryMutAct_9fa48("158307") ? "" : (stryCov_9fa48("158307"), 'canonical_websocket_metadata_missing')
}));
const NODE_WEBSOCKET_ADDRESS_RESOLUTION_STATE = Object.freeze(stryMutAct_9fa48("158308") ? {} : (stryCov_9fa48("158308"), {
  RESOLVED: stryMutAct_9fa48("158309") ? "" : (stryCov_9fa48("158309"), 'resolved'),
  UNAVAILABLE: stryMutAct_9fa48("158310") ? "" : (stryCov_9fa48("158310"), 'unavailable')
}));
function normalizeAddressString(value) {
  if (stryMutAct_9fa48("158311")) {
    {}
  } else {
    stryCov_9fa48("158311");
    return (stryMutAct_9fa48("158314") ? typeof value !== TYPEOF.STRING : stryMutAct_9fa48("158313") ? false : stryMutAct_9fa48("158312") ? true : (stryCov_9fa48("158312", "158313", "158314"), typeof value === TYPEOF.STRING)) ? stryMutAct_9fa48("158315") ? value : (stryCov_9fa48("158315"), value.trim()) : stryMutAct_9fa48("158316") ? "Stryker was here!" : (stryCov_9fa48("158316"), '');
  }
}
function parseAddressParts(address) {
  if (stryMutAct_9fa48("158317")) {
    {}
  } else {
    stryCov_9fa48("158317");
    return parseAddressPartsResult(address);
  }
}
function parseAddressPartsResult(address) {
  if (stryMutAct_9fa48("158318")) {
    {}
  } else {
    stryCov_9fa48("158318");
    const normalized = normalizeAddressString(address);
    if (stryMutAct_9fa48("158321") ? normalized.length !== NUM.ZERO : stryMutAct_9fa48("158320") ? false : stryMutAct_9fa48("158319") ? true : (stryCov_9fa48("158319", "158320", "158321"), normalized.length === NUM.ZERO)) {
      if (stryMutAct_9fa48("158322")) {
        {}
      } else {
        stryCov_9fa48("158322");
        return Object.freeze(stryMutAct_9fa48("158323") ? {} : (stryCov_9fa48("158323"), {
          state: stryMutAct_9fa48("158324") ? "" : (stryCov_9fa48("158324"), 'empty')
        }));
      }
    }
    if (stryMutAct_9fa48("158326") ? false : stryMutAct_9fa48("158325") ? true : (stryCov_9fa48("158325", "158326"), normalized.includes(stryMutAct_9fa48("158327") ? "" : (stryCov_9fa48("158327"), '://')))) {
      if (stryMutAct_9fa48("158328")) {
        {}
      } else {
        stryCov_9fa48("158328");
        try {
          if (stryMutAct_9fa48("158329")) {
            {}
          } else {
            stryCov_9fa48("158329");
            const parsed = new URL(normalized);
            const parsedPort = Number(parsed.port);
            return Object.freeze(stryMutAct_9fa48("158330") ? {} : (stryCov_9fa48("158330"), {
              state: stryMutAct_9fa48("158331") ? "" : (stryCov_9fa48("158331"), 'parsed'),
              host: (stryMutAct_9fa48("158334") ? typeof parsed.hostname === TYPEOF.STRING || parsed.hostname.length > NUM.ZERO : stryMutAct_9fa48("158333") ? false : stryMutAct_9fa48("158332") ? true : (stryCov_9fa48("158332", "158333", "158334"), (stryMutAct_9fa48("158336") ? typeof parsed.hostname !== TYPEOF.STRING : stryMutAct_9fa48("158335") ? true : (stryCov_9fa48("158335", "158336"), typeof parsed.hostname === TYPEOF.STRING)) && (stryMutAct_9fa48("158339") ? parsed.hostname.length <= NUM.ZERO : stryMutAct_9fa48("158338") ? parsed.hostname.length >= NUM.ZERO : stryMutAct_9fa48("158337") ? true : (stryCov_9fa48("158337", "158338", "158339"), parsed.hostname.length > NUM.ZERO)))) ? Object.freeze(stryMutAct_9fa48("158340") ? {} : (stryCov_9fa48("158340"), {
                state: stryMutAct_9fa48("158341") ? "" : (stryCov_9fa48("158341"), 'present'),
                value: parsed.hostname
              })) : Object.freeze(stryMutAct_9fa48("158342") ? {} : (stryCov_9fa48("158342"), {
                state: stryMutAct_9fa48("158343") ? "" : (stryCov_9fa48("158343"), 'absent')
              })),
              port: (stryMutAct_9fa48("158346") ? Number.isInteger(parsedPort) || parsedPort > NUM.ZERO : stryMutAct_9fa48("158345") ? false : stryMutAct_9fa48("158344") ? true : (stryCov_9fa48("158344", "158345", "158346"), Number.isInteger(parsedPort) && (stryMutAct_9fa48("158349") ? parsedPort <= NUM.ZERO : stryMutAct_9fa48("158348") ? parsedPort >= NUM.ZERO : stryMutAct_9fa48("158347") ? true : (stryCov_9fa48("158347", "158348", "158349"), parsedPort > NUM.ZERO)))) ? Object.freeze(stryMutAct_9fa48("158350") ? {} : (stryCov_9fa48("158350"), {
                state: stryMutAct_9fa48("158351") ? "" : (stryCov_9fa48("158351"), 'present'),
                value: parsedPort
              })) : Object.freeze(stryMutAct_9fa48("158352") ? {} : (stryCov_9fa48("158352"), {
                state: stryMutAct_9fa48("158353") ? "" : (stryCov_9fa48("158353"), 'absent')
              })),
              protocol: (stryMutAct_9fa48("158356") ? typeof parsed.protocol === TYPEOF.STRING || parsed.protocol.length > NUM.ZERO : stryMutAct_9fa48("158355") ? false : stryMutAct_9fa48("158354") ? true : (stryCov_9fa48("158354", "158355", "158356"), (stryMutAct_9fa48("158358") ? typeof parsed.protocol !== TYPEOF.STRING : stryMutAct_9fa48("158357") ? true : (stryCov_9fa48("158357", "158358"), typeof parsed.protocol === TYPEOF.STRING)) && (stryMutAct_9fa48("158361") ? parsed.protocol.length <= NUM.ZERO : stryMutAct_9fa48("158360") ? parsed.protocol.length >= NUM.ZERO : stryMutAct_9fa48("158359") ? true : (stryCov_9fa48("158359", "158360", "158361"), parsed.protocol.length > NUM.ZERO)))) ? Object.freeze(stryMutAct_9fa48("158362") ? {} : (stryCov_9fa48("158362"), {
                state: stryMutAct_9fa48("158363") ? "" : (stryCov_9fa48("158363"), 'present'),
                value: parsed.protocol
              })) : Object.freeze(stryMutAct_9fa48("158364") ? {} : (stryCov_9fa48("158364"), {
                state: stryMutAct_9fa48("158365") ? "" : (stryCov_9fa48("158365"), 'absent')
              }))
            }));
          }
        } catch (_error) {
          if (stryMutAct_9fa48("158366")) {
            {}
          } else {
            stryCov_9fa48("158366");
            return Object.freeze(stryMutAct_9fa48("158367") ? {} : (stryCov_9fa48("158367"), {
              state: stryMutAct_9fa48("158368") ? "" : (stryCov_9fa48("158368"), 'invalid')
            }));
          }
        }
      }
    }
    if (stryMutAct_9fa48("158371") ? normalized.endsWith('[') : stryMutAct_9fa48("158370") ? false : stryMutAct_9fa48("158369") ? true : (stryCov_9fa48("158369", "158370", "158371"), normalized.startsWith(stryMutAct_9fa48("158372") ? "" : (stryCov_9fa48("158372"), '[')))) {
      if (stryMutAct_9fa48("158373")) {
        {}
      } else {
        stryCov_9fa48("158373");
        const closingBracket = normalized.indexOf(stryMutAct_9fa48("158374") ? "" : (stryCov_9fa48("158374"), ']'));
        if (stryMutAct_9fa48("158378") ? closingBracket <= NUM.ZERO : stryMutAct_9fa48("158377") ? closingBracket >= NUM.ZERO : stryMutAct_9fa48("158376") ? false : stryMutAct_9fa48("158375") ? true : (stryCov_9fa48("158375", "158376", "158377", "158378"), closingBracket > NUM.ZERO)) {
          if (stryMutAct_9fa48("158379")) {
            {}
          } else {
            stryCov_9fa48("158379");
            const host = stryMutAct_9fa48("158380") ? normalized : (stryCov_9fa48("158380"), normalized.substring(NUM.ONE, closingBracket));
            const remainder = stryMutAct_9fa48("158381") ? normalized : (stryCov_9fa48("158381"), normalized.substring(stryMutAct_9fa48("158382") ? closingBracket - NUM.ONE : (stryCov_9fa48("158382"), closingBracket + NUM.ONE)));
            const port = (stryMutAct_9fa48("158383") ? remainder.endsWith(':') : (stryCov_9fa48("158383"), remainder.startsWith(stryMutAct_9fa48("158384") ? "" : (stryCov_9fa48("158384"), ':')))) ? Number(stryMutAct_9fa48("158385") ? remainder : (stryCov_9fa48("158385"), remainder.substring(NUM.ONE))) : null;
            return Object.freeze(stryMutAct_9fa48("158386") ? {} : (stryCov_9fa48("158386"), {
              state: stryMutAct_9fa48("158387") ? "" : (stryCov_9fa48("158387"), 'parsed'),
              host: (stryMutAct_9fa48("158390") ? typeof host === TYPEOF.STRING || host.length > NUM.ZERO : stryMutAct_9fa48("158389") ? false : stryMutAct_9fa48("158388") ? true : (stryCov_9fa48("158388", "158389", "158390"), (stryMutAct_9fa48("158392") ? typeof host !== TYPEOF.STRING : stryMutAct_9fa48("158391") ? true : (stryCov_9fa48("158391", "158392"), typeof host === TYPEOF.STRING)) && (stryMutAct_9fa48("158395") ? host.length <= NUM.ZERO : stryMutAct_9fa48("158394") ? host.length >= NUM.ZERO : stryMutAct_9fa48("158393") ? true : (stryCov_9fa48("158393", "158394", "158395"), host.length > NUM.ZERO)))) ? Object.freeze(stryMutAct_9fa48("158396") ? {} : (stryCov_9fa48("158396"), {
                state: stryMutAct_9fa48("158397") ? "" : (stryCov_9fa48("158397"), 'present'),
                value: host
              })) : Object.freeze(stryMutAct_9fa48("158398") ? {} : (stryCov_9fa48("158398"), {
                state: stryMutAct_9fa48("158399") ? "" : (stryCov_9fa48("158399"), 'absent')
              })),
              port: (stryMutAct_9fa48("158402") ? Number.isInteger(port) || port > NUM.ZERO : stryMutAct_9fa48("158401") ? false : stryMutAct_9fa48("158400") ? true : (stryCov_9fa48("158400", "158401", "158402"), Number.isInteger(port) && (stryMutAct_9fa48("158405") ? port <= NUM.ZERO : stryMutAct_9fa48("158404") ? port >= NUM.ZERO : stryMutAct_9fa48("158403") ? true : (stryCov_9fa48("158403", "158404", "158405"), port > NUM.ZERO)))) ? Object.freeze(stryMutAct_9fa48("158406") ? {} : (stryCov_9fa48("158406"), {
                state: stryMutAct_9fa48("158407") ? "" : (stryCov_9fa48("158407"), 'present'),
                value: port
              })) : Object.freeze(stryMutAct_9fa48("158408") ? {} : (stryCov_9fa48("158408"), {
                state: stryMutAct_9fa48("158409") ? "" : (stryCov_9fa48("158409"), 'absent')
              })),
              protocol: Object.freeze(stryMutAct_9fa48("158410") ? {} : (stryCov_9fa48("158410"), {
                state: stryMutAct_9fa48("158411") ? "" : (stryCov_9fa48("158411"), 'absent')
              }))
            }));
          }
        }
      }
    }
    const firstColon = normalized.indexOf(stryMutAct_9fa48("158412") ? "" : (stryCov_9fa48("158412"), ':'));
    const lastColon = normalized.lastIndexOf(stryMutAct_9fa48("158413") ? "" : (stryCov_9fa48("158413"), ':'));
    if (stryMutAct_9fa48("158416") ? firstColon > NUM.ZERO || firstColon === lastColon : stryMutAct_9fa48("158415") ? false : stryMutAct_9fa48("158414") ? true : (stryCov_9fa48("158414", "158415", "158416"), (stryMutAct_9fa48("158419") ? firstColon <= NUM.ZERO : stryMutAct_9fa48("158418") ? firstColon >= NUM.ZERO : stryMutAct_9fa48("158417") ? true : (stryCov_9fa48("158417", "158418", "158419"), firstColon > NUM.ZERO)) && (stryMutAct_9fa48("158421") ? firstColon !== lastColon : stryMutAct_9fa48("158420") ? true : (stryCov_9fa48("158420", "158421"), firstColon === lastColon)))) {
      if (stryMutAct_9fa48("158422")) {
        {}
      } else {
        stryCov_9fa48("158422");
        const host = stryMutAct_9fa48("158423") ? normalized : (stryCov_9fa48("158423"), normalized.substring(NUM.ZERO, lastColon));
        const port = Number(stryMutAct_9fa48("158424") ? normalized : (stryCov_9fa48("158424"), normalized.substring(stryMutAct_9fa48("158425") ? lastColon - NUM.ONE : (stryCov_9fa48("158425"), lastColon + NUM.ONE))));
        return Object.freeze(stryMutAct_9fa48("158426") ? {} : (stryCov_9fa48("158426"), {
          state: stryMutAct_9fa48("158427") ? "" : (stryCov_9fa48("158427"), 'parsed'),
          host: (stryMutAct_9fa48("158430") ? typeof host === TYPEOF.STRING || host.length > NUM.ZERO : stryMutAct_9fa48("158429") ? false : stryMutAct_9fa48("158428") ? true : (stryCov_9fa48("158428", "158429", "158430"), (stryMutAct_9fa48("158432") ? typeof host !== TYPEOF.STRING : stryMutAct_9fa48("158431") ? true : (stryCov_9fa48("158431", "158432"), typeof host === TYPEOF.STRING)) && (stryMutAct_9fa48("158435") ? host.length <= NUM.ZERO : stryMutAct_9fa48("158434") ? host.length >= NUM.ZERO : stryMutAct_9fa48("158433") ? true : (stryCov_9fa48("158433", "158434", "158435"), host.length > NUM.ZERO)))) ? Object.freeze(stryMutAct_9fa48("158436") ? {} : (stryCov_9fa48("158436"), {
            state: stryMutAct_9fa48("158437") ? "" : (stryCov_9fa48("158437"), 'present'),
            value: host
          })) : Object.freeze(stryMutAct_9fa48("158438") ? {} : (stryCov_9fa48("158438"), {
            state: stryMutAct_9fa48("158439") ? "" : (stryCov_9fa48("158439"), 'absent')
          })),
          port: (stryMutAct_9fa48("158442") ? Number.isInteger(port) || port > NUM.ZERO : stryMutAct_9fa48("158441") ? false : stryMutAct_9fa48("158440") ? true : (stryCov_9fa48("158440", "158441", "158442"), Number.isInteger(port) && (stryMutAct_9fa48("158445") ? port <= NUM.ZERO : stryMutAct_9fa48("158444") ? port >= NUM.ZERO : stryMutAct_9fa48("158443") ? true : (stryCov_9fa48("158443", "158444", "158445"), port > NUM.ZERO)))) ? Object.freeze(stryMutAct_9fa48("158446") ? {} : (stryCov_9fa48("158446"), {
            state: stryMutAct_9fa48("158447") ? "" : (stryCov_9fa48("158447"), 'present'),
            value: port
          })) : Object.freeze(stryMutAct_9fa48("158448") ? {} : (stryCov_9fa48("158448"), {
            state: stryMutAct_9fa48("158449") ? "" : (stryCov_9fa48("158449"), 'absent')
          })),
          protocol: Object.freeze(stryMutAct_9fa48("158450") ? {} : (stryCov_9fa48("158450"), {
            state: stryMutAct_9fa48("158451") ? "" : (stryCov_9fa48("158451"), 'absent')
          }))
        }));
      }
    }
    return Object.freeze(stryMutAct_9fa48("158452") ? {} : (stryCov_9fa48("158452"), {
      state: stryMutAct_9fa48("158453") ? "" : (stryCov_9fa48("158453"), 'parsed'),
      host: Object.freeze(stryMutAct_9fa48("158454") ? {} : (stryCov_9fa48("158454"), {
        state: stryMutAct_9fa48("158455") ? "" : (stryCov_9fa48("158455"), 'present'),
        value: normalized
      })),
      port: Object.freeze(stryMutAct_9fa48("158456") ? {} : (stryCov_9fa48("158456"), {
        state: stryMutAct_9fa48("158457") ? "" : (stryCov_9fa48("158457"), 'absent')
      })),
      protocol: Object.freeze(stryMutAct_9fa48("158458") ? {} : (stryCov_9fa48("158458"), {
        state: stryMutAct_9fa48("158459") ? "" : (stryCov_9fa48("158459"), 'absent')
      }))
    }));
  }
}
function formatHostForWebSocketUrl(host) {
  if (stryMutAct_9fa48("158460")) {
    {}
  } else {
    stryCov_9fa48("158460");
    if (stryMutAct_9fa48("158463") ? typeof host !== TYPEOF.STRING && host.length === NUM.ZERO : stryMutAct_9fa48("158462") ? false : stryMutAct_9fa48("158461") ? true : (stryCov_9fa48("158461", "158462", "158463"), (stryMutAct_9fa48("158465") ? typeof host === TYPEOF.STRING : stryMutAct_9fa48("158464") ? false : (stryCov_9fa48("158464", "158465"), typeof host !== TYPEOF.STRING)) || (stryMutAct_9fa48("158467") ? host.length !== NUM.ZERO : stryMutAct_9fa48("158466") ? false : (stryCov_9fa48("158466", "158467"), host.length === NUM.ZERO)))) {
      if (stryMutAct_9fa48("158468")) {
        {}
      } else {
        stryCov_9fa48("158468");
        return null;
      }
    }
    return (stryMutAct_9fa48("158471") ? host.includes(':') || !host.startsWith('[') : stryMutAct_9fa48("158470") ? false : stryMutAct_9fa48("158469") ? true : (stryCov_9fa48("158469", "158470", "158471"), host.includes(stryMutAct_9fa48("158472") ? "" : (stryCov_9fa48("158472"), ':')) && (stryMutAct_9fa48("158473") ? host.startsWith('[') : (stryCov_9fa48("158473"), !(stryMutAct_9fa48("158474") ? host.endsWith('[') : (stryCov_9fa48("158474"), host.startsWith(stryMutAct_9fa48("158475") ? "" : (stryCov_9fa48("158475"), '[')))))))) ? stryMutAct_9fa48("158476") ? `` : (stryCov_9fa48("158476"), `[${host}]`) : host;
  }
}
function buildWebSocketAddress(host, port) {
  if (stryMutAct_9fa48("158477")) {
    {}
  } else {
    stryCov_9fa48("158477");
    const formattedHost = formatHostForWebSocketUrl(host);
    if (stryMutAct_9fa48("158480") ? (!formattedHost || !Number.isInteger(port)) && port <= NUM.ZERO : stryMutAct_9fa48("158479") ? false : stryMutAct_9fa48("158478") ? true : (stryCov_9fa48("158478", "158479", "158480"), (stryMutAct_9fa48("158482") ? !formattedHost && !Number.isInteger(port) : stryMutAct_9fa48("158481") ? false : (stryCov_9fa48("158481", "158482"), (stryMutAct_9fa48("158483") ? formattedHost : (stryCov_9fa48("158483"), !formattedHost)) || (stryMutAct_9fa48("158484") ? Number.isInteger(port) : (stryCov_9fa48("158484"), !Number.isInteger(port))))) || (stryMutAct_9fa48("158487") ? port > NUM.ZERO : stryMutAct_9fa48("158486") ? port < NUM.ZERO : stryMutAct_9fa48("158485") ? false : (stryCov_9fa48("158485", "158486", "158487"), port <= NUM.ZERO)))) {
      if (stryMutAct_9fa48("158488")) {
        {}
      } else {
        stryCov_9fa48("158488");
        return null;
      }
    }
    return stryMutAct_9fa48("158489") ? `` : (stryCov_9fa48("158489"), `${PROTOCOL.WS}${formattedHost}:${port}`);
  }
}
function isIpv4Literal(host) {
  if (stryMutAct_9fa48("158490")) {
    {}
  } else {
    stryCov_9fa48("158490");
    return (stryMutAct_9fa48("158497") ? /^\d{1,3}(?:\.\D{1,3}){3}$/ : stryMutAct_9fa48("158496") ? /^\d{1,3}(?:\.\d){3}$/ : stryMutAct_9fa48("158495") ? /^\d{1,3}(?:\.\d{1,3})$/ : stryMutAct_9fa48("158494") ? /^\D{1,3}(?:\.\d{1,3}){3}$/ : stryMutAct_9fa48("158493") ? /^\d(?:\.\d{1,3}){3}$/ : stryMutAct_9fa48("158492") ? /^\d{1,3}(?:\.\d{1,3}){3}/ : stryMutAct_9fa48("158491") ? /\d{1,3}(?:\.\d{1,3}){3}$/ : (stryCov_9fa48("158491", "158492", "158493", "158494", "158495", "158496", "158497"), /^\d{1,3}(?:\.\d{1,3}){3}$/)).test(String(stryMutAct_9fa48("158500") ? host && '' : stryMutAct_9fa48("158499") ? false : stryMutAct_9fa48("158498") ? true : (stryCov_9fa48("158498", "158499", "158500"), host || (stryMutAct_9fa48("158501") ? "Stryker was here!" : (stryCov_9fa48("158501"), '')))));
  }
}
function isIpv6Literal(host) {
  if (stryMutAct_9fa48("158502")) {
    {}
  } else {
    stryCov_9fa48("158502");
    return String(stryMutAct_9fa48("158505") ? host && '' : stryMutAct_9fa48("158504") ? false : stryMutAct_9fa48("158503") ? true : (stryCov_9fa48("158503", "158504", "158505"), host || (stryMutAct_9fa48("158506") ? "Stryker was here!" : (stryCov_9fa48("158506"), '')))).includes(stryMutAct_9fa48("158507") ? "" : (stryCov_9fa48("158507"), ':'));
  }
}
function isLocalOnlyHost(host) {
  if (stryMutAct_9fa48("158508")) {
    {}
  } else {
    stryCov_9fa48("158508");
    const normalized = stryMutAct_9fa48("158509") ? String(host || '').toUpperCase() : (stryCov_9fa48("158509"), String(stryMutAct_9fa48("158512") ? host && '' : stryMutAct_9fa48("158511") ? false : stryMutAct_9fa48("158510") ? true : (stryCov_9fa48("158510", "158511", "158512"), host || (stryMutAct_9fa48("158513") ? "Stryker was here!" : (stryCov_9fa48("158513"), '')))).toLowerCase());
    return stryMutAct_9fa48("158516") ? (normalized === HOST.LOCALHOST || normalized === '127.0.0.1') && normalized === '::1' : stryMutAct_9fa48("158515") ? false : stryMutAct_9fa48("158514") ? true : (stryCov_9fa48("158514", "158515", "158516"), (stryMutAct_9fa48("158518") ? normalized === HOST.LOCALHOST && normalized === '127.0.0.1' : stryMutAct_9fa48("158517") ? false : (stryCov_9fa48("158517", "158518"), (stryMutAct_9fa48("158520") ? normalized !== HOST.LOCALHOST : stryMutAct_9fa48("158519") ? false : (stryCov_9fa48("158519", "158520"), normalized === HOST.LOCALHOST)) || (stryMutAct_9fa48("158522") ? normalized !== '127.0.0.1' : stryMutAct_9fa48("158521") ? false : (stryCov_9fa48("158521", "158522"), normalized === (stryMutAct_9fa48("158523") ? "" : (stryCov_9fa48("158523"), '127.0.0.1')))))) || (stryMutAct_9fa48("158525") ? normalized !== '::1' : stryMutAct_9fa48("158524") ? false : (stryCov_9fa48("158524", "158525"), normalized === (stryMutAct_9fa48("158526") ? "" : (stryCov_9fa48("158526"), '::1')))));
  }
}
function isIpLiteral(host) {
  if (stryMutAct_9fa48("158527")) {
    {}
  } else {
    stryCov_9fa48("158527");
    return stryMutAct_9fa48("158530") ? isIpv4Literal(host) && isIpv6Literal(host) : stryMutAct_9fa48("158529") ? false : stryMutAct_9fa48("158528") ? true : (stryCov_9fa48("158528", "158529", "158530"), isIpv4Literal(host) || isIpv6Literal(host));
  }
}
function resolveRoutableLocalIpAddress() {
  if (stryMutAct_9fa48("158531")) {
    {}
  } else {
    stryCov_9fa48("158531");
    const interfaces = os.networkInterfaces();
    const ipv4Candidates = stryMutAct_9fa48("158532") ? ["Stryker was here"] : (stryCov_9fa48("158532"), []);
    const fallbackCandidates = stryMutAct_9fa48("158533") ? ["Stryker was here"] : (stryCov_9fa48("158533"), []);
    for (const interfaceEntries of Object.values(stryMutAct_9fa48("158536") ? interfaces && {} : stryMutAct_9fa48("158535") ? false : stryMutAct_9fa48("158534") ? true : (stryCov_9fa48("158534", "158535", "158536"), interfaces || {}))) {
      if (stryMutAct_9fa48("158537")) {
        {}
      } else {
        stryCov_9fa48("158537");
        if (stryMutAct_9fa48("158540") ? false : stryMutAct_9fa48("158539") ? true : stryMutAct_9fa48("158538") ? Array.isArray(interfaceEntries) : (stryCov_9fa48("158538", "158539", "158540"), !Array.isArray(interfaceEntries))) {
          if (stryMutAct_9fa48("158541")) {
            {}
          } else {
            stryCov_9fa48("158541");
            continue;
          }
        }
        for (const entry of interfaceEntries) {
          if (stryMutAct_9fa48("158542")) {
            {}
          } else {
            stryCov_9fa48("158542");
            if (stryMutAct_9fa48("158545") ? (!entry || entry.internal === true || typeof entry.address !== TYPEOF.STRING) && entry.address.length === NUM.ZERO : stryMutAct_9fa48("158544") ? false : stryMutAct_9fa48("158543") ? true : (stryCov_9fa48("158543", "158544", "158545"), (stryMutAct_9fa48("158547") ? (!entry || entry.internal === true) && typeof entry.address !== TYPEOF.STRING : stryMutAct_9fa48("158546") ? false : (stryCov_9fa48("158546", "158547"), (stryMutAct_9fa48("158549") ? !entry && entry.internal === true : stryMutAct_9fa48("158548") ? false : (stryCov_9fa48("158548", "158549"), (stryMutAct_9fa48("158550") ? entry : (stryCov_9fa48("158550"), !entry)) || (stryMutAct_9fa48("158552") ? entry.internal !== true : stryMutAct_9fa48("158551") ? false : (stryCov_9fa48("158551", "158552"), entry.internal === (stryMutAct_9fa48("158553") ? false : (stryCov_9fa48("158553"), true)))))) || (stryMutAct_9fa48("158555") ? typeof entry.address === TYPEOF.STRING : stryMutAct_9fa48("158554") ? false : (stryCov_9fa48("158554", "158555"), typeof entry.address !== TYPEOF.STRING)))) || (stryMutAct_9fa48("158557") ? entry.address.length !== NUM.ZERO : stryMutAct_9fa48("158556") ? false : (stryCov_9fa48("158556", "158557"), entry.address.length === NUM.ZERO)))) {
              if (stryMutAct_9fa48("158558")) {
                {}
              } else {
                stryCov_9fa48("158558");
                continue;
              }
            }
            const family = (stryMutAct_9fa48("158561") ? typeof entry.family !== TYPEOF.STRING : stryMutAct_9fa48("158560") ? false : stryMutAct_9fa48("158559") ? true : (stryCov_9fa48("158559", "158560", "158561"), typeof entry.family === TYPEOF.STRING)) ? entry.family : String(stryMutAct_9fa48("158564") ? entry.family && '' : stryMutAct_9fa48("158563") ? false : stryMutAct_9fa48("158562") ? true : (stryCov_9fa48("158562", "158563", "158564"), entry.family || (stryMutAct_9fa48("158565") ? "Stryker was here!" : (stryCov_9fa48("158565"), ''))));
            if (stryMutAct_9fa48("158568") ? family !== 'IPv4' : stryMutAct_9fa48("158567") ? false : stryMutAct_9fa48("158566") ? true : (stryCov_9fa48("158566", "158567", "158568"), family === (stryMutAct_9fa48("158569") ? "" : (stryCov_9fa48("158569"), 'IPv4')))) {
              if (stryMutAct_9fa48("158570")) {
                {}
              } else {
                stryCov_9fa48("158570");
                ipv4Candidates.push(entry.address);
                continue;
              }
            }
            fallbackCandidates.push(entry.address);
          }
        }
      }
    }
    return stryMutAct_9fa48("158573") ? (ipv4Candidates[NUM.ZERO] || fallbackCandidates[NUM.ZERO]) && null : stryMutAct_9fa48("158572") ? false : stryMutAct_9fa48("158571") ? true : (stryCov_9fa48("158571", "158572", "158573"), (stryMutAct_9fa48("158575") ? ipv4Candidates[NUM.ZERO] && fallbackCandidates[NUM.ZERO] : stryMutAct_9fa48("158574") ? false : (stryCov_9fa48("158574", "158575"), ipv4Candidates[NUM.ZERO] || fallbackCandidates[NUM.ZERO])) || null);
  }
}
function resolveAdvertisedWebSocketAddress(options = {}) {
  if (stryMutAct_9fa48("158576")) {
    {}
  } else {
    stryCov_9fa48("158576");
    const explicitAddress = normalizeAddressString(options.advertisedAddress);
    const explicitWsPort = (stryMutAct_9fa48("158579") ? Number.isInteger(options.wsPort) || options.wsPort > NUM.ZERO : stryMutAct_9fa48("158578") ? false : stryMutAct_9fa48("158577") ? true : (stryCov_9fa48("158577", "158578", "158579"), Number.isInteger(options.wsPort) && (stryMutAct_9fa48("158582") ? options.wsPort <= NUM.ZERO : stryMutAct_9fa48("158581") ? options.wsPort >= NUM.ZERO : stryMutAct_9fa48("158580") ? true : (stryCov_9fa48("158580", "158581", "158582"), options.wsPort > NUM.ZERO)))) ? Math.floor(options.wsPort) : null;
    if (stryMutAct_9fa48("158586") ? explicitAddress.length <= NUM.ZERO : stryMutAct_9fa48("158585") ? explicitAddress.length >= NUM.ZERO : stryMutAct_9fa48("158584") ? false : stryMutAct_9fa48("158583") ? true : (stryCov_9fa48("158583", "158584", "158585", "158586"), explicitAddress.length > NUM.ZERO)) {
      if (stryMutAct_9fa48("158587")) {
        {}
      } else {
        stryCov_9fa48("158587");
        if (stryMutAct_9fa48("158590") ? explicitAddress.startsWith(PROTOCOL.WS) && explicitAddress.startsWith(PROTOCOL.WSS) : stryMutAct_9fa48("158589") ? false : stryMutAct_9fa48("158588") ? true : (stryCov_9fa48("158588", "158589", "158590"), (stryMutAct_9fa48("158591") ? explicitAddress.endsWith(PROTOCOL.WS) : (stryCov_9fa48("158591"), explicitAddress.startsWith(PROTOCOL.WS))) || (stryMutAct_9fa48("158592") ? explicitAddress.endsWith(PROTOCOL.WSS) : (stryCov_9fa48("158592"), explicitAddress.startsWith(PROTOCOL.WSS))))) {
          if (stryMutAct_9fa48("158593")) {
            {}
          } else {
            stryCov_9fa48("158593");
            return explicitAddress;
          }
        }
        const parsedExplicit = parseAddressPartsResult(explicitAddress);
        const explicitHost = (stryMutAct_9fa48("158596") ? parsedExplicit.state === 'parsed' || parsedExplicit.host.state === 'present' : stryMutAct_9fa48("158595") ? false : stryMutAct_9fa48("158594") ? true : (stryCov_9fa48("158594", "158595", "158596"), (stryMutAct_9fa48("158598") ? parsedExplicit.state !== 'parsed' : stryMutAct_9fa48("158597") ? true : (stryCov_9fa48("158597", "158598"), parsedExplicit.state === (stryMutAct_9fa48("158599") ? "" : (stryCov_9fa48("158599"), 'parsed')))) && (stryMutAct_9fa48("158601") ? parsedExplicit.host.state !== 'present' : stryMutAct_9fa48("158600") ? true : (stryCov_9fa48("158600", "158601"), parsedExplicit.host.state === (stryMutAct_9fa48("158602") ? "" : (stryCov_9fa48("158602"), 'present')))))) ? parsedExplicit.host.value : null;
        const explicitPort = (stryMutAct_9fa48("158605") ? parsedExplicit.state === 'parsed' || parsedExplicit.port.state === 'present' : stryMutAct_9fa48("158604") ? false : stryMutAct_9fa48("158603") ? true : (stryCov_9fa48("158603", "158604", "158605"), (stryMutAct_9fa48("158607") ? parsedExplicit.state !== 'parsed' : stryMutAct_9fa48("158606") ? true : (stryCov_9fa48("158606", "158607"), parsedExplicit.state === (stryMutAct_9fa48("158608") ? "" : (stryCov_9fa48("158608"), 'parsed')))) && (stryMutAct_9fa48("158610") ? parsedExplicit.port.state !== 'present' : stryMutAct_9fa48("158609") ? true : (stryCov_9fa48("158609", "158610"), parsedExplicit.port.state === (stryMutAct_9fa48("158611") ? "" : (stryCov_9fa48("158611"), 'present')))))) ? parsedExplicit.port.value : explicitWsPort;
        const explicitWsAddress = buildWebSocketAddress(explicitHost, explicitPort);
        if (stryMutAct_9fa48("158613") ? false : stryMutAct_9fa48("158612") ? true : (stryCov_9fa48("158612", "158613"), explicitWsAddress)) {
          if (stryMutAct_9fa48("158614")) {
            {}
          } else {
            stryCov_9fa48("158614");
            return explicitWsAddress;
          }
        }
      }
    }
    const nodeAddress = normalizeAddressString(options.nodeAddress);
    const parsedNodeAddress = parseAddressPartsResult(nodeAddress);
    const nodeAddressHost = (stryMutAct_9fa48("158617") ? parsedNodeAddress.state === 'parsed' || parsedNodeAddress.host.state === 'present' : stryMutAct_9fa48("158616") ? false : stryMutAct_9fa48("158615") ? true : (stryCov_9fa48("158615", "158616", "158617"), (stryMutAct_9fa48("158619") ? parsedNodeAddress.state !== 'parsed' : stryMutAct_9fa48("158618") ? true : (stryCov_9fa48("158618", "158619"), parsedNodeAddress.state === (stryMutAct_9fa48("158620") ? "" : (stryCov_9fa48("158620"), 'parsed')))) && (stryMutAct_9fa48("158622") ? parsedNodeAddress.host.state !== 'present' : stryMutAct_9fa48("158621") ? true : (stryCov_9fa48("158621", "158622"), parsedNodeAddress.host.state === (stryMutAct_9fa48("158623") ? "" : (stryCov_9fa48("158623"), 'present')))))) ? parsedNodeAddress.host.value : null;
    const nodeAddressPort = (stryMutAct_9fa48("158626") ? parsedNodeAddress.state === 'parsed' || parsedNodeAddress.port.state === 'present' : stryMutAct_9fa48("158625") ? false : stryMutAct_9fa48("158624") ? true : (stryCov_9fa48("158624", "158625", "158626"), (stryMutAct_9fa48("158628") ? parsedNodeAddress.state !== 'parsed' : stryMutAct_9fa48("158627") ? true : (stryCov_9fa48("158627", "158628"), parsedNodeAddress.state === (stryMutAct_9fa48("158629") ? "" : (stryCov_9fa48("158629"), 'parsed')))) && (stryMutAct_9fa48("158631") ? parsedNodeAddress.port.state !== 'present' : stryMutAct_9fa48("158630") ? true : (stryCov_9fa48("158630", "158631"), parsedNodeAddress.port.state === (stryMutAct_9fa48("158632") ? "" : (stryCov_9fa48("158632"), 'present')))))) ? parsedNodeAddress.port.value : null;
    const nodeAddressProtocol = (stryMutAct_9fa48("158635") ? parsedNodeAddress.state === 'parsed' || parsedNodeAddress.protocol.state === 'present' : stryMutAct_9fa48("158634") ? false : stryMutAct_9fa48("158633") ? true : (stryCov_9fa48("158633", "158634", "158635"), (stryMutAct_9fa48("158637") ? parsedNodeAddress.state !== 'parsed' : stryMutAct_9fa48("158636") ? true : (stryCov_9fa48("158636", "158637"), parsedNodeAddress.state === (stryMutAct_9fa48("158638") ? "" : (stryCov_9fa48("158638"), 'parsed')))) && (stryMutAct_9fa48("158640") ? parsedNodeAddress.protocol.state !== 'present' : stryMutAct_9fa48("158639") ? true : (stryCov_9fa48("158639", "158640"), parsedNodeAddress.protocol.state === (stryMutAct_9fa48("158641") ? "" : (stryCov_9fa48("158641"), 'present')))))) ? parsedNodeAddress.protocol.value : null;
    const derivedWsPort = stryMutAct_9fa48("158644") ? explicitWsPort && (Number.isInteger(nodeAddressPort) && nodeAddressPort > NUM.ZERO ? nodeAddressProtocol === 'ws:' || nodeAddressProtocol === 'wss:' ? nodeAddressPort : nodeAddressPort + ENTRYPOINT_DEFAULT.WS_PORT_OFFSET : null) : stryMutAct_9fa48("158643") ? false : stryMutAct_9fa48("158642") ? true : (stryCov_9fa48("158642", "158643", "158644"), explicitWsPort || ((stryMutAct_9fa48("158647") ? Number.isInteger(nodeAddressPort) || nodeAddressPort > NUM.ZERO : stryMutAct_9fa48("158646") ? false : stryMutAct_9fa48("158645") ? true : (stryCov_9fa48("158645", "158646", "158647"), Number.isInteger(nodeAddressPort) && (stryMutAct_9fa48("158650") ? nodeAddressPort <= NUM.ZERO : stryMutAct_9fa48("158649") ? nodeAddressPort >= NUM.ZERO : stryMutAct_9fa48("158648") ? true : (stryCov_9fa48("158648", "158649", "158650"), nodeAddressPort > NUM.ZERO)))) ? (stryMutAct_9fa48("158653") ? nodeAddressProtocol === 'ws:' && nodeAddressProtocol === 'wss:' : stryMutAct_9fa48("158652") ? false : stryMutAct_9fa48("158651") ? true : (stryCov_9fa48("158651", "158652", "158653"), (stryMutAct_9fa48("158655") ? nodeAddressProtocol !== 'ws:' : stryMutAct_9fa48("158654") ? false : (stryCov_9fa48("158654", "158655"), nodeAddressProtocol === (stryMutAct_9fa48("158656") ? "" : (stryCov_9fa48("158656"), 'ws:')))) || (stryMutAct_9fa48("158658") ? nodeAddressProtocol !== 'wss:' : stryMutAct_9fa48("158657") ? false : (stryCov_9fa48("158657", "158658"), nodeAddressProtocol === (stryMutAct_9fa48("158659") ? "" : (stryCov_9fa48("158659"), 'wss:')))))) ? nodeAddressPort : stryMutAct_9fa48("158660") ? nodeAddressPort - ENTRYPOINT_DEFAULT.WS_PORT_OFFSET : (stryCov_9fa48("158660"), nodeAddressPort + ENTRYPOINT_DEFAULT.WS_PORT_OFFSET) : null));
    let host = nodeAddressHost;
    const shouldPreferRoutableInterface = stryMutAct_9fa48("158663") ? options.preferRoutableInterface === true && options.wsHost === HOST.ANY && typeof host === TYPEOF.STRING && host.length > NUM.ZERO && !isIpLiteral(host) && !isLocalOnlyHost(host) : stryMutAct_9fa48("158662") ? false : stryMutAct_9fa48("158661") ? true : (stryCov_9fa48("158661", "158662", "158663"), (stryMutAct_9fa48("158665") ? options.preferRoutableInterface !== true : stryMutAct_9fa48("158664") ? false : (stryCov_9fa48("158664", "158665"), options.preferRoutableInterface === (stryMutAct_9fa48("158666") ? false : (stryCov_9fa48("158666"), true)))) || (stryMutAct_9fa48("158668") ? options.wsHost === HOST.ANY && typeof host === TYPEOF.STRING && host.length > NUM.ZERO && !isIpLiteral(host) || !isLocalOnlyHost(host) : stryMutAct_9fa48("158667") ? false : (stryCov_9fa48("158667", "158668"), (stryMutAct_9fa48("158670") ? options.wsHost === HOST.ANY && typeof host === TYPEOF.STRING && host.length > NUM.ZERO || !isIpLiteral(host) : stryMutAct_9fa48("158669") ? true : (stryCov_9fa48("158669", "158670"), (stryMutAct_9fa48("158672") ? options.wsHost === HOST.ANY && typeof host === TYPEOF.STRING || host.length > NUM.ZERO : stryMutAct_9fa48("158671") ? true : (stryCov_9fa48("158671", "158672"), (stryMutAct_9fa48("158674") ? options.wsHost === HOST.ANY || typeof host === TYPEOF.STRING : stryMutAct_9fa48("158673") ? true : (stryCov_9fa48("158673", "158674"), (stryMutAct_9fa48("158676") ? options.wsHost !== HOST.ANY : stryMutAct_9fa48("158675") ? true : (stryCov_9fa48("158675", "158676"), options.wsHost === HOST.ANY)) && (stryMutAct_9fa48("158678") ? typeof host !== TYPEOF.STRING : stryMutAct_9fa48("158677") ? true : (stryCov_9fa48("158677", "158678"), typeof host === TYPEOF.STRING)))) && (stryMutAct_9fa48("158681") ? host.length <= NUM.ZERO : stryMutAct_9fa48("158680") ? host.length >= NUM.ZERO : stryMutAct_9fa48("158679") ? true : (stryCov_9fa48("158679", "158680", "158681"), host.length > NUM.ZERO)))) && (stryMutAct_9fa48("158682") ? isIpLiteral(host) : (stryCov_9fa48("158682"), !isIpLiteral(host))))) && (stryMutAct_9fa48("158683") ? isLocalOnlyHost(host) : (stryCov_9fa48("158683"), !isLocalOnlyHost(host))))));
    if (stryMutAct_9fa48("158685") ? false : stryMutAct_9fa48("158684") ? true : (stryCov_9fa48("158684", "158685"), shouldPreferRoutableInterface)) {
      if (stryMutAct_9fa48("158686")) {
        {}
      } else {
        stryCov_9fa48("158686");
        host = stryMutAct_9fa48("158689") ? resolveRoutableLocalIpAddress() && host : stryMutAct_9fa48("158688") ? false : stryMutAct_9fa48("158687") ? true : (stryCov_9fa48("158687", "158688", "158689"), resolveRoutableLocalIpAddress() || host);
      }
    }
    const advertisedWsAddress = buildWebSocketAddress(host, derivedWsPort);
    return stryMutAct_9fa48("158692") ? advertisedWsAddress && normalizeToWebSocketAddress(nodeAddress) : stryMutAct_9fa48("158691") ? false : stryMutAct_9fa48("158690") ? true : (stryCov_9fa48("158690", "158691", "158692"), advertisedWsAddress || normalizeToWebSocketAddress(nodeAddress));
  }
}
function resolveAdvertisedEndpointHost(options = {}) {
  if (stryMutAct_9fa48("158693")) {
    {}
  } else {
    stryCov_9fa48("158693");
    const advertisedWsAddress = resolveAdvertisedWebSocketAddress(options);
    const advertisedHostParts = parseAddressPartsResult(advertisedWsAddress);
    const advertisedHost = (stryMutAct_9fa48("158696") ? advertisedHostParts.state === 'parsed' || advertisedHostParts.host.state === 'present' : stryMutAct_9fa48("158695") ? false : stryMutAct_9fa48("158694") ? true : (stryCov_9fa48("158694", "158695", "158696"), (stryMutAct_9fa48("158698") ? advertisedHostParts.state !== 'parsed' : stryMutAct_9fa48("158697") ? true : (stryCov_9fa48("158697", "158698"), advertisedHostParts.state === (stryMutAct_9fa48("158699") ? "" : (stryCov_9fa48("158699"), 'parsed')))) && (stryMutAct_9fa48("158701") ? advertisedHostParts.host.state !== 'present' : stryMutAct_9fa48("158700") ? true : (stryCov_9fa48("158700", "158701"), advertisedHostParts.host.state === (stryMutAct_9fa48("158702") ? "" : (stryCov_9fa48("158702"), 'present')))))) ? advertisedHostParts.host.value : null;
    if (stryMutAct_9fa48("158704") ? false : stryMutAct_9fa48("158703") ? true : (stryCov_9fa48("158703", "158704"), advertisedHost)) {
      if (stryMutAct_9fa48("158705")) {
        {}
      } else {
        stryCov_9fa48("158705");
        return advertisedHost;
      }
    }
    const nodeAddressParts = parseAddressPartsResult(options.nodeAddress);
    const nodeHost = (stryMutAct_9fa48("158708") ? nodeAddressParts.state === 'parsed' || nodeAddressParts.host.state === 'present' : stryMutAct_9fa48("158707") ? false : stryMutAct_9fa48("158706") ? true : (stryCov_9fa48("158706", "158707", "158708"), (stryMutAct_9fa48("158710") ? nodeAddressParts.state !== 'parsed' : stryMutAct_9fa48("158709") ? true : (stryCov_9fa48("158709", "158710"), nodeAddressParts.state === (stryMutAct_9fa48("158711") ? "" : (stryCov_9fa48("158711"), 'parsed')))) && (stryMutAct_9fa48("158713") ? nodeAddressParts.host.state !== 'present' : stryMutAct_9fa48("158712") ? true : (stryCov_9fa48("158712", "158713"), nodeAddressParts.host.state === (stryMutAct_9fa48("158714") ? "" : (stryCov_9fa48("158714"), 'present')))))) ? nodeAddressParts.host.value : null;
    if (stryMutAct_9fa48("158716") ? false : stryMutAct_9fa48("158715") ? true : (stryCov_9fa48("158715", "158716"), nodeHost)) {
      if (stryMutAct_9fa48("158717")) {
        {}
      } else {
        stryCov_9fa48("158717");
        return nodeHost;
      }
    }
    return (stryMutAct_9fa48("158720") ? typeof options.fallbackHost === TYPEOF.STRING || options.fallbackHost.length > NUM.ZERO : stryMutAct_9fa48("158719") ? false : stryMutAct_9fa48("158718") ? true : (stryCov_9fa48("158718", "158719", "158720"), (stryMutAct_9fa48("158722") ? typeof options.fallbackHost !== TYPEOF.STRING : stryMutAct_9fa48("158721") ? true : (stryCov_9fa48("158721", "158722"), typeof options.fallbackHost === TYPEOF.STRING)) && (stryMutAct_9fa48("158725") ? options.fallbackHost.length <= NUM.ZERO : stryMutAct_9fa48("158724") ? options.fallbackHost.length >= NUM.ZERO : stryMutAct_9fa48("158723") ? true : (stryCov_9fa48("158723", "158724", "158725"), options.fallbackHost.length > NUM.ZERO)))) ? options.fallbackHost : null;
  }
}
function getActiveWebSocketEndpointRows(rows, targetNodeId) {
  if (stryMutAct_9fa48("158726")) {
    {}
  } else {
    stryCov_9fa48("158726");
    if (stryMutAct_9fa48("158729") ? (!Array.isArray(rows) || rows.length === NUM.ZERO) && !targetNodeId : stryMutAct_9fa48("158728") ? false : stryMutAct_9fa48("158727") ? true : (stryCov_9fa48("158727", "158728", "158729"), (stryMutAct_9fa48("158731") ? !Array.isArray(rows) && rows.length === NUM.ZERO : stryMutAct_9fa48("158730") ? false : (stryCov_9fa48("158730", "158731"), (stryMutAct_9fa48("158732") ? Array.isArray(rows) : (stryCov_9fa48("158732"), !Array.isArray(rows))) || (stryMutAct_9fa48("158734") ? rows.length !== NUM.ZERO : stryMutAct_9fa48("158733") ? false : (stryCov_9fa48("158733", "158734"), rows.length === NUM.ZERO)))) || (stryMutAct_9fa48("158735") ? targetNodeId : (stryCov_9fa48("158735"), !targetNodeId)))) {
      if (stryMutAct_9fa48("158736")) {
        {}
      } else {
        stryCov_9fa48("158736");
        return stryMutAct_9fa48("158737") ? ["Stryker was here"] : (stryCov_9fa48("158737"), []);
      }
    }
    return stryMutAct_9fa48("158739") ? rows.sort((left, right) => {
      return Number(left?.[COLUMN.PRIORITY] || NUM.ZERO) - Number(right?.[COLUMN.PRIORITY] || NUM.ZERO);
    }) : stryMutAct_9fa48("158738") ? rows.filter(row => {
      return row?.[COLUMN.NODE_ID] === targetNodeId && row?.[COLUMN.STATUS] === ENDPOINT_STATUS.ACTIVE && row?.[COLUMN.TRANSPORT_TYPE] === TRANSPORT_TYPE.WEBSOCKET && typeof row?.[COLUMN.ADDRESS] === TYPEOF.STRING && row[COLUMN.ADDRESS].length > NUM.ZERO;
    }) : (stryCov_9fa48("158738", "158739"), rows.filter(row => {
      if (stryMutAct_9fa48("158740")) {
        {}
      } else {
        stryCov_9fa48("158740");
        return stryMutAct_9fa48("158743") ? row?.[COLUMN.NODE_ID] === targetNodeId && row?.[COLUMN.STATUS] === ENDPOINT_STATUS.ACTIVE && row?.[COLUMN.TRANSPORT_TYPE] === TRANSPORT_TYPE.WEBSOCKET && typeof row?.[COLUMN.ADDRESS] === TYPEOF.STRING || row[COLUMN.ADDRESS].length > NUM.ZERO : stryMutAct_9fa48("158742") ? false : stryMutAct_9fa48("158741") ? true : (stryCov_9fa48("158741", "158742", "158743"), (stryMutAct_9fa48("158745") ? row?.[COLUMN.NODE_ID] === targetNodeId && row?.[COLUMN.STATUS] === ENDPOINT_STATUS.ACTIVE && row?.[COLUMN.TRANSPORT_TYPE] === TRANSPORT_TYPE.WEBSOCKET || typeof row?.[COLUMN.ADDRESS] === TYPEOF.STRING : stryMutAct_9fa48("158744") ? true : (stryCov_9fa48("158744", "158745"), (stryMutAct_9fa48("158747") ? row?.[COLUMN.NODE_ID] === targetNodeId && row?.[COLUMN.STATUS] === ENDPOINT_STATUS.ACTIVE || row?.[COLUMN.TRANSPORT_TYPE] === TRANSPORT_TYPE.WEBSOCKET : stryMutAct_9fa48("158746") ? true : (stryCov_9fa48("158746", "158747"), (stryMutAct_9fa48("158749") ? row?.[COLUMN.NODE_ID] === targetNodeId || row?.[COLUMN.STATUS] === ENDPOINT_STATUS.ACTIVE : stryMutAct_9fa48("158748") ? true : (stryCov_9fa48("158748", "158749"), (stryMutAct_9fa48("158751") ? row?.[COLUMN.NODE_ID] !== targetNodeId : stryMutAct_9fa48("158750") ? true : (stryCov_9fa48("158750", "158751"), (stryMutAct_9fa48("158752") ? row[COLUMN.NODE_ID] : (stryCov_9fa48("158752"), row?.[COLUMN.NODE_ID])) === targetNodeId)) && (stryMutAct_9fa48("158754") ? row?.[COLUMN.STATUS] !== ENDPOINT_STATUS.ACTIVE : stryMutAct_9fa48("158753") ? true : (stryCov_9fa48("158753", "158754"), (stryMutAct_9fa48("158755") ? row[COLUMN.STATUS] : (stryCov_9fa48("158755"), row?.[COLUMN.STATUS])) === ENDPOINT_STATUS.ACTIVE)))) && (stryMutAct_9fa48("158757") ? row?.[COLUMN.TRANSPORT_TYPE] !== TRANSPORT_TYPE.WEBSOCKET : stryMutAct_9fa48("158756") ? true : (stryCov_9fa48("158756", "158757"), (stryMutAct_9fa48("158758") ? row[COLUMN.TRANSPORT_TYPE] : (stryCov_9fa48("158758"), row?.[COLUMN.TRANSPORT_TYPE])) === TRANSPORT_TYPE.WEBSOCKET)))) && (stryMutAct_9fa48("158760") ? typeof row?.[COLUMN.ADDRESS] !== TYPEOF.STRING : stryMutAct_9fa48("158759") ? true : (stryCov_9fa48("158759", "158760"), typeof (stryMutAct_9fa48("158761") ? row[COLUMN.ADDRESS] : (stryCov_9fa48("158761"), row?.[COLUMN.ADDRESS])) === TYPEOF.STRING)))) && (stryMutAct_9fa48("158764") ? row[COLUMN.ADDRESS].length <= NUM.ZERO : stryMutAct_9fa48("158763") ? row[COLUMN.ADDRESS].length >= NUM.ZERO : stryMutAct_9fa48("158762") ? true : (stryCov_9fa48("158762", "158763", "158764"), row[COLUMN.ADDRESS].length > NUM.ZERO)));
      }
    }).sort((left, right) => {
      if (stryMutAct_9fa48("158765")) {
        {}
      } else {
        stryCov_9fa48("158765");
        return stryMutAct_9fa48("158766") ? Number(left?.[COLUMN.PRIORITY] || NUM.ZERO) + Number(right?.[COLUMN.PRIORITY] || NUM.ZERO) : (stryCov_9fa48("158766"), Number(stryMutAct_9fa48("158769") ? left?.[COLUMN.PRIORITY] && NUM.ZERO : stryMutAct_9fa48("158768") ? false : stryMutAct_9fa48("158767") ? true : (stryCov_9fa48("158767", "158768", "158769"), (stryMutAct_9fa48("158770") ? left[COLUMN.PRIORITY] : (stryCov_9fa48("158770"), left?.[COLUMN.PRIORITY])) || NUM.ZERO)) - Number(stryMutAct_9fa48("158773") ? right?.[COLUMN.PRIORITY] && NUM.ZERO : stryMutAct_9fa48("158772") ? false : stryMutAct_9fa48("158771") ? true : (stryCov_9fa48("158771", "158772", "158773"), (stryMutAct_9fa48("158774") ? right[COLUMN.PRIORITY] : (stryCov_9fa48("158774"), right?.[COLUMN.PRIORITY])) || NUM.ZERO)));
      }
    }));
  }
}
function getCacheEndpointRows(systemTableCache, targetNodeId) {
  if (stryMutAct_9fa48("158775")) {
    {}
  } else {
    stryCov_9fa48("158775");
    if (stryMutAct_9fa48("158778") ? !systemTableCache && !targetNodeId : stryMutAct_9fa48("158777") ? false : stryMutAct_9fa48("158776") ? true : (stryCov_9fa48("158776", "158777", "158778"), (stryMutAct_9fa48("158779") ? systemTableCache : (stryCov_9fa48("158779"), !systemTableCache)) || (stryMutAct_9fa48("158780") ? targetNodeId : (stryCov_9fa48("158780"), !targetNodeId)))) {
      if (stryMutAct_9fa48("158781")) {
        {}
      } else {
        stryCov_9fa48("158781");
        return stryMutAct_9fa48("158782") ? ["Stryker was here"] : (stryCov_9fa48("158782"), []);
      }
    }
    if (stryMutAct_9fa48("158785") ? typeof systemTableCache.filter !== TYPEOF.FUNCTION : stryMutAct_9fa48("158784") ? false : stryMutAct_9fa48("158783") ? true : (stryCov_9fa48("158783", "158784", "158785"), typeof systemTableCache.filter === TYPEOF.FUNCTION)) {
      if (stryMutAct_9fa48("158786")) {
        {}
      } else {
        stryCov_9fa48("158786");
        return getActiveWebSocketEndpointRows(stryMutAct_9fa48("158787") ? systemTableCache : (stryCov_9fa48("158787"), systemTableCache.filter(TABLES.NODE_ENDPOINTS, stryMutAct_9fa48("158788") ? () => undefined : (stryCov_9fa48("158788"), row => stryMutAct_9fa48("158791") ? row?.[COLUMN.NODE_ID] !== targetNodeId : stryMutAct_9fa48("158790") ? false : stryMutAct_9fa48("158789") ? true : (stryCov_9fa48("158789", "158790", "158791"), (stryMutAct_9fa48("158792") ? row[COLUMN.NODE_ID] : (stryCov_9fa48("158792"), row?.[COLUMN.NODE_ID])) === targetNodeId)))), targetNodeId);
      }
    }
    if (stryMutAct_9fa48("158795") ? typeof systemTableCache.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("158794") ? false : stryMutAct_9fa48("158793") ? true : (stryCov_9fa48("158793", "158794", "158795"), typeof systemTableCache.getAll === TYPEOF.FUNCTION)) {
      if (stryMutAct_9fa48("158796")) {
        {}
      } else {
        stryCov_9fa48("158796");
        return getActiveWebSocketEndpointRows(stryMutAct_9fa48("158799") ? systemTableCache.getAll(TABLES.NODE_ENDPOINTS) && [] : stryMutAct_9fa48("158798") ? false : stryMutAct_9fa48("158797") ? true : (stryCov_9fa48("158797", "158798", "158799"), systemTableCache.getAll(TABLES.NODE_ENDPOINTS) || (stryMutAct_9fa48("158800") ? ["Stryker was here"] : (stryCov_9fa48("158800"), []))), targetNodeId);
      }
    }
    return stryMutAct_9fa48("158801") ? ["Stryker was here"] : (stryCov_9fa48("158801"), []);
  }
}
function getBootstrapSnapshotEndpointRows(bootstrapResponse, targetNodeId) {
  if (stryMutAct_9fa48("158802")) {
    {}
  } else {
    stryCov_9fa48("158802");
    return getActiveWebSocketEndpointRows(stryMutAct_9fa48("158805") ? bootstrapResponse?.systemTableSnapshots?.node_endpoints && [] : stryMutAct_9fa48("158804") ? false : stryMutAct_9fa48("158803") ? true : (stryCov_9fa48("158803", "158804", "158805"), (stryMutAct_9fa48("158807") ? bootstrapResponse.systemTableSnapshots?.node_endpoints : stryMutAct_9fa48("158806") ? bootstrapResponse?.systemTableSnapshots.node_endpoints : (stryCov_9fa48("158806", "158807"), bootstrapResponse?.systemTableSnapshots?.node_endpoints)) || (stryMutAct_9fa48("158808") ? ["Stryker was here"] : (stryCov_9fa48("158808"), []))), targetNodeId);
  }
}
function resolveNodeWebSocketAddress(options = {}) {
  if (stryMutAct_9fa48("158809")) {
    {}
  } else {
    stryCov_9fa48("158809");
    return resolveNodeWebSocketAddressResult(options);
  }
}
function resolveNodeWebSocketAddressResult(options = {}) {
  if (stryMutAct_9fa48("158810")) {
    {}
  } else {
    stryCov_9fa48("158810");
    const targetNodeId = options.targetNodeId;
    if (stryMutAct_9fa48("158813") ? false : stryMutAct_9fa48("158812") ? true : stryMutAct_9fa48("158811") ? targetNodeId : (stryCov_9fa48("158811", "158812", "158813"), !targetNodeId)) {
      if (stryMutAct_9fa48("158814")) {
        {}
      } else {
        stryCov_9fa48("158814");
        return Object.freeze(stryMutAct_9fa48("158815") ? {} : (stryCov_9fa48("158815"), {
          state: NODE_WEBSOCKET_ADDRESS_RESOLUTION_STATE.UNAVAILABLE,
          reason: NODE_WEBSOCKET_ADDRESS_RESOLUTION_REASON.TARGET_NODE_MISSING
        }));
      }
    }
    const bootstrapResponse = options.bootstrapResponse;
    if (stryMutAct_9fa48("158818") ? targetNodeId === bootstrapResponse?.seedNodeId && typeof bootstrapResponse?.seedNodeWsAddress === TYPEOF.STRING || bootstrapResponse.seedNodeWsAddress.length > NUM.ZERO : stryMutAct_9fa48("158817") ? false : stryMutAct_9fa48("158816") ? true : (stryCov_9fa48("158816", "158817", "158818"), (stryMutAct_9fa48("158820") ? targetNodeId === bootstrapResponse?.seedNodeId || typeof bootstrapResponse?.seedNodeWsAddress === TYPEOF.STRING : stryMutAct_9fa48("158819") ? true : (stryCov_9fa48("158819", "158820"), (stryMutAct_9fa48("158822") ? targetNodeId !== bootstrapResponse?.seedNodeId : stryMutAct_9fa48("158821") ? true : (stryCov_9fa48("158821", "158822"), targetNodeId === (stryMutAct_9fa48("158823") ? bootstrapResponse.seedNodeId : (stryCov_9fa48("158823"), bootstrapResponse?.seedNodeId)))) && (stryMutAct_9fa48("158825") ? typeof bootstrapResponse?.seedNodeWsAddress !== TYPEOF.STRING : stryMutAct_9fa48("158824") ? true : (stryCov_9fa48("158824", "158825"), typeof (stryMutAct_9fa48("158826") ? bootstrapResponse.seedNodeWsAddress : (stryCov_9fa48("158826"), bootstrapResponse?.seedNodeWsAddress)) === TYPEOF.STRING)))) && (stryMutAct_9fa48("158829") ? bootstrapResponse.seedNodeWsAddress.length <= NUM.ZERO : stryMutAct_9fa48("158828") ? bootstrapResponse.seedNodeWsAddress.length >= NUM.ZERO : stryMutAct_9fa48("158827") ? true : (stryCov_9fa48("158827", "158828", "158829"), bootstrapResponse.seedNodeWsAddress.length > NUM.ZERO)))) {
      if (stryMutAct_9fa48("158830")) {
        {}
      } else {
        stryCov_9fa48("158830");
        return Object.freeze(stryMutAct_9fa48("158831") ? {} : (stryCov_9fa48("158831"), {
          state: NODE_WEBSOCKET_ADDRESS_RESOLUTION_STATE.RESOLVED,
          address: bootstrapResponse.seedNodeWsAddress,
          source: stryMutAct_9fa48("158832") ? "" : (stryCov_9fa48("158832"), 'bootstrap_seed_address')
        }));
      }
    }
    const systemTableCache = options.systemTableCache;
    const cacheEndpointRows = getCacheEndpointRows(systemTableCache, targetNodeId);
    const cacheEndpointAddress = stryMutAct_9fa48("158833") ? cacheEndpointRows[NUM.ZERO][COLUMN.ADDRESS] : (stryCov_9fa48("158833"), cacheEndpointRows[NUM.ZERO]?.[COLUMN.ADDRESS]);
    if (stryMutAct_9fa48("158836") ? typeof cacheEndpointAddress === TYPEOF.STRING || cacheEndpointAddress.length > NUM.ZERO : stryMutAct_9fa48("158835") ? false : stryMutAct_9fa48("158834") ? true : (stryCov_9fa48("158834", "158835", "158836"), (stryMutAct_9fa48("158838") ? typeof cacheEndpointAddress !== TYPEOF.STRING : stryMutAct_9fa48("158837") ? true : (stryCov_9fa48("158837", "158838"), typeof cacheEndpointAddress === TYPEOF.STRING)) && (stryMutAct_9fa48("158841") ? cacheEndpointAddress.length <= NUM.ZERO : stryMutAct_9fa48("158840") ? cacheEndpointAddress.length >= NUM.ZERO : stryMutAct_9fa48("158839") ? true : (stryCov_9fa48("158839", "158840", "158841"), cacheEndpointAddress.length > NUM.ZERO)))) {
      if (stryMutAct_9fa48("158842")) {
        {}
      } else {
        stryCov_9fa48("158842");
        return Object.freeze(stryMutAct_9fa48("158843") ? {} : (stryCov_9fa48("158843"), {
          state: NODE_WEBSOCKET_ADDRESS_RESOLUTION_STATE.RESOLVED,
          address: stryMutAct_9fa48("158846") ? normalizeToWebSocketAddress(cacheEndpointAddress) && cacheEndpointAddress : stryMutAct_9fa48("158845") ? false : stryMutAct_9fa48("158844") ? true : (stryCov_9fa48("158844", "158845", "158846"), normalizeToWebSocketAddress(cacheEndpointAddress) || cacheEndpointAddress),
          source: stryMutAct_9fa48("158847") ? "" : (stryCov_9fa48("158847"), 'cache_node_endpoints')
        }));
      }
    }
    const bootstrapEndpointRows = getBootstrapSnapshotEndpointRows(bootstrapResponse, targetNodeId);
    const bootstrapEndpointAddress = stryMutAct_9fa48("158848") ? bootstrapEndpointRows[NUM.ZERO][COLUMN.ADDRESS] : (stryCov_9fa48("158848"), bootstrapEndpointRows[NUM.ZERO]?.[COLUMN.ADDRESS]);
    if (stryMutAct_9fa48("158851") ? typeof bootstrapEndpointAddress === TYPEOF.STRING || bootstrapEndpointAddress.length > NUM.ZERO : stryMutAct_9fa48("158850") ? false : stryMutAct_9fa48("158849") ? true : (stryCov_9fa48("158849", "158850", "158851"), (stryMutAct_9fa48("158853") ? typeof bootstrapEndpointAddress !== TYPEOF.STRING : stryMutAct_9fa48("158852") ? true : (stryCov_9fa48("158852", "158853"), typeof bootstrapEndpointAddress === TYPEOF.STRING)) && (stryMutAct_9fa48("158856") ? bootstrapEndpointAddress.length <= NUM.ZERO : stryMutAct_9fa48("158855") ? bootstrapEndpointAddress.length >= NUM.ZERO : stryMutAct_9fa48("158854") ? true : (stryCov_9fa48("158854", "158855", "158856"), bootstrapEndpointAddress.length > NUM.ZERO)))) {
      if (stryMutAct_9fa48("158857")) {
        {}
      } else {
        stryCov_9fa48("158857");
        return Object.freeze(stryMutAct_9fa48("158858") ? {} : (stryCov_9fa48("158858"), {
          state: NODE_WEBSOCKET_ADDRESS_RESOLUTION_STATE.RESOLVED,
          address: stryMutAct_9fa48("158861") ? normalizeToWebSocketAddress(bootstrapEndpointAddress) && bootstrapEndpointAddress : stryMutAct_9fa48("158860") ? false : stryMutAct_9fa48("158859") ? true : (stryCov_9fa48("158859", "158860", "158861"), normalizeToWebSocketAddress(bootstrapEndpointAddress) || bootstrapEndpointAddress),
          source: stryMutAct_9fa48("158862") ? "" : (stryCov_9fa48("158862"), 'bootstrap_snapshot_node_endpoints')
        }));
      }
    }
    return Object.freeze(stryMutAct_9fa48("158863") ? {} : (stryCov_9fa48("158863"), {
      state: NODE_WEBSOCKET_ADDRESS_RESOLUTION_STATE.UNAVAILABLE,
      reason: NODE_WEBSOCKET_ADDRESS_RESOLUTION_REASON.CANONICAL_METADATA_MISSING
    }));
  }
}
export { NODE_WEBSOCKET_ADDRESS_RESOLUTION_REASON, NODE_WEBSOCKET_ADDRESS_RESOLUTION_STATE, parseAddressParts, parseAddressPartsResult, resolveAdvertisedEndpointHost, resolveAdvertisedWebSocketAddress, resolveNodeWebSocketAddress, resolveNodeWebSocketAddressResult, resolveRoutableLocalIpAddress };