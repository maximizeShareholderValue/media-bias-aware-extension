/**
 * Encrypted storage for the user's NewsAPI key (thesis FR-SYS-01 / NFR-PRIV-01).
 * Shared by the popup and the service worker (importScripts) and the Node tests.
 *
 * The key is stored in chrome.storage.local only as AES-GCM ciphertext
 * ({ newsApiKeyEnc: { iv, data } }). The AES key that encrypts it is a
 * non-extractable CryptoKey kept in the extension's own IndexedDB: web pages
 * and content scripts run on the page's origin, so they can read neither the
 * IndexedDB entry nor the raw key bytes. A plaintext key saved by an older
 * version (`newsApiKey`) is encrypted and removed the first time it is read.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.KeyVault = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var ENC_FIELD = "newsApiKeyEnc";
  var LEGACY_FIELD = "newsApiKey";
  var DB_NAME = "bias-aware-vault";
  var STORE = "keys";
  var WRAP_ID = "newsapi-wrap";

  function idbRequest(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  /** The browser default: a non-extractable AES-GCM key persisted in IndexedDB. */
  function indexedDbWrapKey(subtle) {
    return function () {
      var open = indexedDB.open(DB_NAME, 1);
      open.onupgradeneeded = function () { open.result.createObjectStore(STORE); };
      return idbRequest(open).then(function (db) {
        return idbRequest(db.transaction(STORE).objectStore(STORE).get(WRAP_ID)).then(function (existing) {
          if (existing) return existing;
          return subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]).then(function (key) {
            return idbRequest(db.transaction(STORE, "readwrite").objectStore(STORE).put(key, WRAP_ID)).then(function () {
              return key;
            });
          });
        });
      });
    };
  }

  function toB64(buf) {
    var bytes = new Uint8Array(buf);
    var s = "";
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }

  function fromB64(str) {
    var s = atob(str);
    var bytes = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
    return bytes;
  }

  /**
   * @param {{storage?: object, subtle?: SubtleCrypto, getWrapKey?: function}} [deps]
   *   storage: a chrome.storage.local-like area (promise API). Defaults to the real one.
   */
  function create(deps) {
    deps = deps || {};
    var storage = deps.storage || chrome.storage.local;
    var subtle = deps.subtle || crypto.subtle;
    var getWrapKey = deps.getWrapKey || indexedDbWrapKey(subtle);

    function encrypt(plain) {
      var iv = crypto.getRandomValues(new Uint8Array(12));
      return getWrapKey()
        .then(function (key) { return subtle.encrypt({ name: "AES-GCM", iv: iv }, key, new TextEncoder().encode(plain)); })
        .then(function (data) { return { iv: toB64(iv), data: toB64(data) }; });
    }

    function decrypt(record) {
      return getWrapKey()
        .then(function (key) { return subtle.decrypt({ name: "AES-GCM", iv: fromB64(record.iv) }, key, fromB64(record.data)); })
        .then(function (buf) { return new TextDecoder().decode(buf); });
    }

    function saveKey(plain) {
      return encrypt(plain).then(function (record) {
        var entry = {};
        entry[ENC_FIELD] = record;
        return storage.set(entry).then(function () { return storage.remove(LEGACY_FIELD); });
      });
    }

    /** Resolves to the plaintext key, or "" when none is saved or it can no longer be decrypted. */
    function loadKey() {
      var defaults = {};
      defaults[ENC_FIELD] = null;
      defaults[LEGACY_FIELD] = "";
      return storage.get(defaults).then(function (data) {
        if (data[ENC_FIELD]) {
          // Undecryptable (e.g. the vault was cleared): drop it so the user is asked for the key again.
          return decrypt(data[ENC_FIELD]).catch(function () {
            return storage.remove(ENC_FIELD).then(function () { return ""; });
          });
        }
        if (data[LEGACY_FIELD]) {
          var legacy = data[LEGACY_FIELD];
          return saveKey(legacy).then(function () { return legacy; });
        }
        return "";
      });
    }

    /** True when a key (encrypted or legacy) is stored; does not decrypt. */
    function hasKey() {
      var defaults = {};
      defaults[ENC_FIELD] = null;
      defaults[LEGACY_FIELD] = "";
      return storage.get(defaults).then(function (data) {
        return !!(data[ENC_FIELD] || data[LEGACY_FIELD]);
      });
    }

    function clearKey() {
      return storage.remove([ENC_FIELD, LEGACY_FIELD]);
    }

    return { saveKey: saveKey, loadKey: loadKey, hasKey: hasKey, clearKey: clearKey };
  }

  return { create: create, ENC_FIELD: ENC_FIELD, LEGACY_FIELD: LEGACY_FIELD };
});
