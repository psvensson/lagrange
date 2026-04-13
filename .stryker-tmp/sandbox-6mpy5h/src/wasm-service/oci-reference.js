/**
 * OCI-compatible source reference handling with digest pin
 * enforcement.
 *
 * Parses, validates, and formats OCI references in the forms:
 *   registry/repository:tag
 *   registry/repository@sha256:hex64
 *   registry/repository:tag@sha256:hex64
 *
 * Activation paths require immutable digest pinning (Req 4.4).
 *
 * Requirements: 4.3, 4.4
 */
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
import { NUM, TYPEOF } from '../constants/index.js';
import { isValidDigest } from './module-manifest-models.js';

// --- OCI reference separators ---

const OCI_TAG_SEPARATOR = stryMutAct_9fa48("162081") ? "" : (stryCov_9fa48("162081"), ':');
const OCI_DIGEST_SEPARATOR = stryMutAct_9fa48("162082") ? "" : (stryCov_9fa48("162082"), '@');
const OCI_PATH_SEPARATOR = stryMutAct_9fa48("162083") ? "" : (stryCov_9fa48("162083"), '/');

// --- Error message constants ---

const OCI_REFERENCE_ERROR = Object.freeze(stryMutAct_9fa48("162084") ? {} : (stryCov_9fa48("162084"), {
  REFERENCE_REQUIRED: stryMutAct_9fa48("162085") ? "" : (stryCov_9fa48("162085"), 'OCI reference string is required'),
  REFERENCE_NOT_STRING: stryMutAct_9fa48("162086") ? "" : (stryCov_9fa48("162086"), 'OCI reference must be a string'),
  REGISTRY_REQUIRED: stryMutAct_9fa48("162087") ? "" : (stryCov_9fa48("162087"), 'OCI reference must include a registry host'),
  REPOSITORY_REQUIRED: stryMutAct_9fa48("162088") ? "" : (stryCov_9fa48("162088"), 'OCI reference must include a repository path'),
  TAG_OR_DIGEST_REQUIRED: stryMutAct_9fa48("162089") ? "" : (stryCov_9fa48("162089"), 'OCI reference must include a tag or digest'),
  DIGEST_INVALID_FORMAT: stryMutAct_9fa48("162090") ? "" : (stryCov_9fa48("162090"), 'OCI digest must be sha256: followed by 64 hex chars'),
  DIGEST_PIN_REQUIRED: stryMutAct_9fa48("162091") ? "" : (stryCov_9fa48("162091"), 'Activation requires an immutable digest pin'),
  TAG_ONLY_NOT_PINNED: stryMutAct_9fa48("162092") ? "" : (stryCov_9fa48("162092"), 'Tag-only references are mutable; digest pin is required'),
  INVALID_TAG_FORMAT: stryMutAct_9fa48("162093") ? "" : (stryCov_9fa48("162093"), 'OCI tag contains invalid characters'),
  REGISTRY_REQUIRED_FOR_FORMAT: stryMutAct_9fa48("162094") ? "" : (stryCov_9fa48("162094"), 'Registry is required to format an OCI reference'),
  REPOSITORY_REQUIRED_FOR_FORMAT: stryMutAct_9fa48("162095") ? "" : (stryCov_9fa48("162095"), 'Repository is required to format an OCI reference')
}));

/**
 * Valid OCI tag pattern: alphanumeric, dots, hyphens,
 * underscores, 1-128 chars.
 * @type {RegExp}
 */
const OCI_TAG_PATTERN = stryMutAct_9fa48("162100") ? /^[a-zA-Z0-9][^a-zA-Z0-9._-]{0,127}$/ : stryMutAct_9fa48("162099") ? /^[a-zA-Z0-9][a-zA-Z0-9._-]$/ : stryMutAct_9fa48("162098") ? /^[^a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/ : stryMutAct_9fa48("162097") ? /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}/ : stryMutAct_9fa48("162096") ? /[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/ : (stryCov_9fa48("162096", "162097", "162098", "162099", "162100"), /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/);

/**
 * Maximum length for the full OCI reference string.
 * @type {number}
 */
const OCI_REFERENCE_MAX_LENGTH = 512;

/**
 * Parse an OCI-compatible source reference string.
 *
 * Supported formats:
 *   registry.io/namespace/name:tag
 *   registry.io/namespace/name@sha256:abc...
 *   registry.io/namespace/name:tag@sha256:abc...
 *
 * @param {string} ref - OCI reference string.
 * @return {{valid: boolean, registry?: string,
 *   repository?: string, tag?: string|null,
 *   digest?: string|null, errors?: string[]}}
 */
function parseOciReference(ref) {
  if (stryMutAct_9fa48("162101")) {
    {}
  } else {
    stryCov_9fa48("162101");
    if (stryMutAct_9fa48("162104") ? ref === undefined && ref === null : stryMutAct_9fa48("162103") ? false : stryMutAct_9fa48("162102") ? true : (stryCov_9fa48("162102", "162103", "162104"), (stryMutAct_9fa48("162106") ? ref !== undefined : stryMutAct_9fa48("162105") ? false : (stryCov_9fa48("162105", "162106"), ref === undefined)) || (stryMutAct_9fa48("162108") ? ref !== null : stryMutAct_9fa48("162107") ? false : (stryCov_9fa48("162107", "162108"), ref === null)))) {
      if (stryMutAct_9fa48("162109")) {
        {}
      } else {
        stryCov_9fa48("162109");
        return stryMutAct_9fa48("162110") ? {} : (stryCov_9fa48("162110"), {
          valid: stryMutAct_9fa48("162111") ? true : (stryCov_9fa48("162111"), false),
          errors: stryMutAct_9fa48("162112") ? [] : (stryCov_9fa48("162112"), [OCI_REFERENCE_ERROR.REFERENCE_REQUIRED])
        });
      }
    }
    if (stryMutAct_9fa48("162115") ? typeof ref === TYPEOF.STRING : stryMutAct_9fa48("162114") ? false : stryMutAct_9fa48("162113") ? true : (stryCov_9fa48("162113", "162114", "162115"), typeof ref !== TYPEOF.STRING)) {
      if (stryMutAct_9fa48("162116")) {
        {}
      } else {
        stryCov_9fa48("162116");
        return stryMutAct_9fa48("162117") ? {} : (stryCov_9fa48("162117"), {
          valid: stryMutAct_9fa48("162118") ? true : (stryCov_9fa48("162118"), false),
          errors: stryMutAct_9fa48("162119") ? [] : (stryCov_9fa48("162119"), [OCI_REFERENCE_ERROR.REFERENCE_NOT_STRING])
        });
      }
    }
    if (stryMutAct_9fa48("162122") ? ref.length !== NUM.ZERO : stryMutAct_9fa48("162121") ? false : stryMutAct_9fa48("162120") ? true : (stryCov_9fa48("162120", "162121", "162122"), ref.length === NUM.ZERO)) {
      if (stryMutAct_9fa48("162123")) {
        {}
      } else {
        stryCov_9fa48("162123");
        return stryMutAct_9fa48("162124") ? {} : (stryCov_9fa48("162124"), {
          valid: stryMutAct_9fa48("162125") ? true : (stryCov_9fa48("162125"), false),
          errors: stryMutAct_9fa48("162126") ? [] : (stryCov_9fa48("162126"), [OCI_REFERENCE_ERROR.REFERENCE_REQUIRED])
        });
      }
    }
    const errors = stryMutAct_9fa48("162127") ? ["Stryker was here"] : (stryCov_9fa48("162127"), []);

    // Split digest portion first (everything after @)
    let remainder = ref;
    let digest = null;
    const atIdx = ref.indexOf(OCI_DIGEST_SEPARATOR);
    if (stryMutAct_9fa48("162130") ? atIdx === NUM.NEGATIVE_ONE : stryMutAct_9fa48("162129") ? false : stryMutAct_9fa48("162128") ? true : (stryCov_9fa48("162128", "162129", "162130"), atIdx !== NUM.NEGATIVE_ONE)) {
      if (stryMutAct_9fa48("162131")) {
        {}
      } else {
        stryCov_9fa48("162131");
        digest = stryMutAct_9fa48("162132") ? ref : (stryCov_9fa48("162132"), ref.slice(stryMutAct_9fa48("162133") ? atIdx - NUM.ONE : (stryCov_9fa48("162133"), atIdx + NUM.ONE)));
        remainder = stryMutAct_9fa48("162134") ? ref : (stryCov_9fa48("162134"), ref.slice(NUM.ZERO, atIdx));
        if (stryMutAct_9fa48("162137") ? false : stryMutAct_9fa48("162136") ? true : stryMutAct_9fa48("162135") ? isValidDigest(digest) : (stryCov_9fa48("162135", "162136", "162137"), !isValidDigest(digest))) {
          if (stryMutAct_9fa48("162138")) {
            {}
          } else {
            stryCov_9fa48("162138");
            errors.push(OCI_REFERENCE_ERROR.DIGEST_INVALID_FORMAT);
            digest = null;
          }
        }
      }
    }

    // Split tag portion (last colon in remainder, but only after
    // the first slash to avoid matching port numbers in registry)
    let tag = null;
    const firstSlash = remainder.indexOf(OCI_PATH_SEPARATOR);
    const afterRegistry = (stryMutAct_9fa48("162141") ? firstSlash === NUM.NEGATIVE_ONE : stryMutAct_9fa48("162140") ? false : stryMutAct_9fa48("162139") ? true : (stryCov_9fa48("162139", "162140", "162141"), firstSlash !== NUM.NEGATIVE_ONE)) ? stryMutAct_9fa48("162142") ? remainder : (stryCov_9fa48("162142"), remainder.slice(firstSlash)) : stryMutAct_9fa48("162143") ? "Stryker was here!" : (stryCov_9fa48("162143"), '');
    const tagColonIdx = afterRegistry.lastIndexOf(OCI_TAG_SEPARATOR);
    if (stryMutAct_9fa48("162147") ? tagColonIdx <= NUM.ZERO : stryMutAct_9fa48("162146") ? tagColonIdx >= NUM.ZERO : stryMutAct_9fa48("162145") ? false : stryMutAct_9fa48("162144") ? true : (stryCov_9fa48("162144", "162145", "162146", "162147"), tagColonIdx > NUM.ZERO)) {
      if (stryMutAct_9fa48("162148")) {
        {}
      } else {
        stryCov_9fa48("162148");
        tag = stryMutAct_9fa48("162149") ? afterRegistry : (stryCov_9fa48("162149"), afterRegistry.slice(stryMutAct_9fa48("162150") ? tagColonIdx - NUM.ONE : (stryCov_9fa48("162150"), tagColonIdx + NUM.ONE)));
        remainder = stryMutAct_9fa48("162151") ? remainder : (stryCov_9fa48("162151"), remainder.slice(NUM.ZERO, stryMutAct_9fa48("162152") ? firstSlash - tagColonIdx : (stryCov_9fa48("162152"), firstSlash + tagColonIdx)));
        if (stryMutAct_9fa48("162155") ? false : stryMutAct_9fa48("162154") ? true : stryMutAct_9fa48("162153") ? OCI_TAG_PATTERN.test(tag) : (stryCov_9fa48("162153", "162154", "162155"), !OCI_TAG_PATTERN.test(tag))) {
          if (stryMutAct_9fa48("162156")) {
            {}
          } else {
            stryCov_9fa48("162156");
            errors.push(OCI_REFERENCE_ERROR.INVALID_TAG_FORMAT);
            tag = null;
          }
        }
      }
    }

    // Split registry / repository on first slash
    const slashIdx = remainder.indexOf(OCI_PATH_SEPARATOR);
    let registry = null;
    let repository = null;
    if (stryMutAct_9fa48("162159") ? slashIdx !== NUM.NEGATIVE_ONE : stryMutAct_9fa48("162158") ? false : stryMutAct_9fa48("162157") ? true : (stryCov_9fa48("162157", "162158", "162159"), slashIdx === NUM.NEGATIVE_ONE)) {
      if (stryMutAct_9fa48("162160")) {
        {}
      } else {
        stryCov_9fa48("162160");
        errors.push(OCI_REFERENCE_ERROR.REGISTRY_REQUIRED);
        errors.push(OCI_REFERENCE_ERROR.REPOSITORY_REQUIRED);
      }
    } else {
      if (stryMutAct_9fa48("162161")) {
        {}
      } else {
        stryCov_9fa48("162161");
        registry = stryMutAct_9fa48("162162") ? remainder : (stryCov_9fa48("162162"), remainder.slice(NUM.ZERO, slashIdx));
        repository = stryMutAct_9fa48("162163") ? remainder : (stryCov_9fa48("162163"), remainder.slice(stryMutAct_9fa48("162164") ? slashIdx - NUM.ONE : (stryCov_9fa48("162164"), slashIdx + NUM.ONE)));
        if (stryMutAct_9fa48("162167") ? registry.length !== NUM.ZERO : stryMutAct_9fa48("162166") ? false : stryMutAct_9fa48("162165") ? true : (stryCov_9fa48("162165", "162166", "162167"), registry.length === NUM.ZERO)) {
          if (stryMutAct_9fa48("162168")) {
            {}
          } else {
            stryCov_9fa48("162168");
            errors.push(OCI_REFERENCE_ERROR.REGISTRY_REQUIRED);
            registry = null;
          }
        }
        if (stryMutAct_9fa48("162171") ? !repository && repository.length === NUM.ZERO : stryMutAct_9fa48("162170") ? false : stryMutAct_9fa48("162169") ? true : (stryCov_9fa48("162169", "162170", "162171"), (stryMutAct_9fa48("162172") ? repository : (stryCov_9fa48("162172"), !repository)) || (stryMutAct_9fa48("162174") ? repository.length !== NUM.ZERO : stryMutAct_9fa48("162173") ? false : (stryCov_9fa48("162173", "162174"), repository.length === NUM.ZERO)))) {
          if (stryMutAct_9fa48("162175")) {
            {}
          } else {
            stryCov_9fa48("162175");
            errors.push(OCI_REFERENCE_ERROR.REPOSITORY_REQUIRED);
            repository = null;
          }
        }
      }
    }
    if (stryMutAct_9fa48("162178") ? !tag && !digest || errors.length === NUM.ZERO : stryMutAct_9fa48("162177") ? false : stryMutAct_9fa48("162176") ? true : (stryCov_9fa48("162176", "162177", "162178"), (stryMutAct_9fa48("162180") ? !tag || !digest : stryMutAct_9fa48("162179") ? true : (stryCov_9fa48("162179", "162180"), (stryMutAct_9fa48("162181") ? tag : (stryCov_9fa48("162181"), !tag)) && (stryMutAct_9fa48("162182") ? digest : (stryCov_9fa48("162182"), !digest)))) && (stryMutAct_9fa48("162184") ? errors.length !== NUM.ZERO : stryMutAct_9fa48("162183") ? true : (stryCov_9fa48("162183", "162184"), errors.length === NUM.ZERO)))) {
      if (stryMutAct_9fa48("162185")) {
        {}
      } else {
        stryCov_9fa48("162185");
        errors.push(OCI_REFERENCE_ERROR.TAG_OR_DIGEST_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("162189") ? errors.length <= NUM.ZERO : stryMutAct_9fa48("162188") ? errors.length >= NUM.ZERO : stryMutAct_9fa48("162187") ? false : stryMutAct_9fa48("162186") ? true : (stryCov_9fa48("162186", "162187", "162188", "162189"), errors.length > NUM.ZERO)) {
      if (stryMutAct_9fa48("162190")) {
        {}
      } else {
        stryCov_9fa48("162190");
        return stryMutAct_9fa48("162191") ? {} : (stryCov_9fa48("162191"), {
          valid: stryMutAct_9fa48("162192") ? true : (stryCov_9fa48("162192"), false),
          errors
        });
      }
    }
    return stryMutAct_9fa48("162193") ? {} : (stryCov_9fa48("162193"), {
      valid: stryMutAct_9fa48("162194") ? false : (stryCov_9fa48("162194"), true),
      registry,
      repository,
      tag: stryMutAct_9fa48("162197") ? tag && null : stryMutAct_9fa48("162196") ? false : stryMutAct_9fa48("162195") ? true : (stryCov_9fa48("162195", "162196", "162197"), tag || null),
      digest: stryMutAct_9fa48("162200") ? digest && null : stryMutAct_9fa48("162199") ? false : stryMutAct_9fa48("162198") ? true : (stryCov_9fa48("162198", "162199", "162200"), digest || null)
    });
  }
}

/**
 * Validate that an OCI reference has an immutable digest pin.
 * Activation paths require digest pinning (Req 4.4).
 *
 * @param {string} ref - OCI reference string.
 * @return {{valid: boolean, digest?: string, errors?: string[]}}
 */
function validateDigestPin(ref) {
  if (stryMutAct_9fa48("162201")) {
    {}
  } else {
    stryCov_9fa48("162201");
    const parsed = parseOciReference(ref);
    if (stryMutAct_9fa48("162204") ? false : stryMutAct_9fa48("162203") ? true : stryMutAct_9fa48("162202") ? parsed.valid : (stryCov_9fa48("162202", "162203", "162204"), !parsed.valid)) {
      if (stryMutAct_9fa48("162205")) {
        {}
      } else {
        stryCov_9fa48("162205");
        return stryMutAct_9fa48("162206") ? {} : (stryCov_9fa48("162206"), {
          valid: stryMutAct_9fa48("162207") ? true : (stryCov_9fa48("162207"), false),
          errors: parsed.errors
        });
      }
    }
    if (stryMutAct_9fa48("162210") ? false : stryMutAct_9fa48("162209") ? true : stryMutAct_9fa48("162208") ? parsed.digest : (stryCov_9fa48("162208", "162209", "162210"), !parsed.digest)) {
      if (stryMutAct_9fa48("162211")) {
        {}
      } else {
        stryCov_9fa48("162211");
        const errors = stryMutAct_9fa48("162212") ? [] : (stryCov_9fa48("162212"), [OCI_REFERENCE_ERROR.DIGEST_PIN_REQUIRED, OCI_REFERENCE_ERROR.TAG_ONLY_NOT_PINNED]);
        return stryMutAct_9fa48("162213") ? {} : (stryCov_9fa48("162213"), {
          valid: stryMutAct_9fa48("162214") ? true : (stryCov_9fa48("162214"), false),
          errors
        });
      }
    }
    return stryMutAct_9fa48("162215") ? {} : (stryCov_9fa48("162215"), {
      valid: stryMutAct_9fa48("162216") ? false : (stryCov_9fa48("162216"), true),
      digest: parsed.digest
    });
  }
}

/**
 * Format OCI reference components back to a string.
 *
 * @param {{registry: string, repository: string,
 *   tag?: string|null, digest?: string|null}} parts
 * @return {{valid: boolean, reference?: string,
 *   errors?: string[]}}
 */
function formatOciReference(parts) {
  if (stryMutAct_9fa48("162217")) {
    {}
  } else {
    stryCov_9fa48("162217");
    const errors = stryMutAct_9fa48("162218") ? ["Stryker was here"] : (stryCov_9fa48("162218"), []);
    if (stryMutAct_9fa48("162221") ? false : stryMutAct_9fa48("162220") ? true : stryMutAct_9fa48("162219") ? parts.registry : (stryCov_9fa48("162219", "162220", "162221"), !parts.registry)) {
      if (stryMutAct_9fa48("162222")) {
        {}
      } else {
        stryCov_9fa48("162222");
        errors.push(OCI_REFERENCE_ERROR.REGISTRY_REQUIRED_FOR_FORMAT);
      }
    }
    if (stryMutAct_9fa48("162225") ? false : stryMutAct_9fa48("162224") ? true : stryMutAct_9fa48("162223") ? parts.repository : (stryCov_9fa48("162223", "162224", "162225"), !parts.repository)) {
      if (stryMutAct_9fa48("162226")) {
        {}
      } else {
        stryCov_9fa48("162226");
        errors.push(OCI_REFERENCE_ERROR.REPOSITORY_REQUIRED_FOR_FORMAT);
      }
    }
    if (stryMutAct_9fa48("162230") ? errors.length <= NUM.ZERO : stryMutAct_9fa48("162229") ? errors.length >= NUM.ZERO : stryMutAct_9fa48("162228") ? false : stryMutAct_9fa48("162227") ? true : (stryCov_9fa48("162227", "162228", "162229", "162230"), errors.length > NUM.ZERO)) {
      if (stryMutAct_9fa48("162231")) {
        {}
      } else {
        stryCov_9fa48("162231");
        return stryMutAct_9fa48("162232") ? {} : (stryCov_9fa48("162232"), {
          valid: stryMutAct_9fa48("162233") ? true : (stryCov_9fa48("162233"), false),
          errors
        });
      }
    }
    let reference = stryMutAct_9fa48("162234") ? parts.registry + OCI_PATH_SEPARATOR - parts.repository : (stryCov_9fa48("162234"), (stryMutAct_9fa48("162235") ? parts.registry - OCI_PATH_SEPARATOR : (stryCov_9fa48("162235"), parts.registry + OCI_PATH_SEPARATOR)) + parts.repository);
    if (stryMutAct_9fa48("162237") ? false : stryMutAct_9fa48("162236") ? true : (stryCov_9fa48("162236", "162237"), parts.tag)) {
      if (stryMutAct_9fa48("162238")) {
        {}
      } else {
        stryCov_9fa48("162238");
        stryMutAct_9fa48("162239") ? reference -= OCI_TAG_SEPARATOR + parts.tag : (stryCov_9fa48("162239"), reference += stryMutAct_9fa48("162240") ? OCI_TAG_SEPARATOR - parts.tag : (stryCov_9fa48("162240"), OCI_TAG_SEPARATOR + parts.tag));
      }
    }
    if (stryMutAct_9fa48("162242") ? false : stryMutAct_9fa48("162241") ? true : (stryCov_9fa48("162241", "162242"), parts.digest)) {
      if (stryMutAct_9fa48("162243")) {
        {}
      } else {
        stryCov_9fa48("162243");
        stryMutAct_9fa48("162244") ? reference -= OCI_DIGEST_SEPARATOR + parts.digest : (stryCov_9fa48("162244"), reference += stryMutAct_9fa48("162245") ? OCI_DIGEST_SEPARATOR - parts.digest : (stryCov_9fa48("162245"), OCI_DIGEST_SEPARATOR + parts.digest));
      }
    }
    return stryMutAct_9fa48("162246") ? {} : (stryCov_9fa48("162246"), {
      valid: stryMutAct_9fa48("162247") ? false : (stryCov_9fa48("162247"), true),
      reference
    });
  }
}
export { parseOciReference, validateDigestPin, formatOciReference, OCI_REFERENCE_ERROR, OCI_TAG_PATTERN, OCI_TAG_SEPARATOR, OCI_DIGEST_SEPARATOR, OCI_PATH_SEPARATOR, OCI_REFERENCE_MAX_LENGTH };