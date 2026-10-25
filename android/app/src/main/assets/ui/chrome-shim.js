(function () {
  var native = window.SalikApp;
  function normKeys(keys) {
    if (keys === null || keys === undefined) return { list: null, defaults: {} };
    if (typeof keys === "string") return { list: [keys], defaults: {} };
    if (Array.isArray(keys)) return { list: keys, defaults: {} };
    return { list: Object.keys(keys), defaults: keys };
  }
  function area(name) {
    return {
      get: function (keys, cb) {
        if (typeof keys === "function") { cb = keys; keys = null; }
        var k = normKeys(keys);
        var out = {};
        try { out = JSON.parse(native.storageGet(name, k.list ? JSON.stringify(k.list) : "null")); } catch (e) {}
        Object.keys(k.defaults).forEach(function (key) { if (!(key in out)) out[key] = k.defaults[key]; });
        var p = Promise.resolve(out);
        if (cb) p.then(cb);
        return p;
      },
      set: function (items, cb) {
        try { native.storageSet(name, JSON.stringify(items || {})); } catch (e) {}
        var p = Promise.resolve();
        if (cb) p.then(cb);
        return p;
      },
      remove: function (keys, cb) {
        try { native.storageRemove(name, JSON.stringify([].concat(keys))); } catch (e) {}
        var p = Promise.resolve();
        if (cb) p.then(cb);
        return p;
      }
    };
  }
  window.chrome = {
    storage: { local: area("local"), sync: area("sync"), onChanged: { addListener: function () {} } },
    runtime: {
      lastError: undefined,
      sendMessage: function (msg, cb) {
        if (msg && msg.type === "FETCH_LIBRARY_DATA") {
          fetch("/data/library.json").then(function (r) { return r.json(); }).then(function (d) {
            cb && cb(d.__error ? { success: false, error: d.__error } : { success: true, data: d });
          });
          return;
        }
        cb && setTimeout(function () { cb(undefined); }, 0);
      },
      onMessage: { addListener: function () {} }
    },
    i18n: { getUILanguage: function () { return navigator.language || "ar"; } },
    tabs: {
      query: function (q, cb) { var p = Promise.resolve([]); if (cb) p.then(cb); return p; },
      sendMessage: function (id, msg, cb) { cb && setTimeout(cb, 0); }
    }
  };
})();
