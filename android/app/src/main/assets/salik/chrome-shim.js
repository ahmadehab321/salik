function __salikCreateChrome() {
  if (typeof SalikNative === "undefined") {
    console.warn("[Salik] native bridge (SalikNative) not available in this frame");
    return null;
  }
  var nextId = 1;
  var pending = {};
  var runtimeListeners = [];
  var storageListeners = [];

  SalikNative.addEventListener("message", function (e) {
    var msg;
    try { msg = JSON.parse(e.data); } catch (err) { return; }
    if (msg.replyTo) {
      var cb = pending[msg.replyTo];
      delete pending[msg.replyTo];
      if (cb) { try { cb(msg.payload); } catch (err) { console.error("[Salik] callback error", err); } }
      return;
    }
    if (msg.event === "runtime") {
      runtimeListeners.slice().forEach(function (fn) {
        try { fn(msg.payload, {}, function () {}); } catch (err) { console.error(err); }
      });
    } else if (msg.event === "storage") {
      storageListeners.slice().forEach(function (fn) {
        try { fn(msg.changes || {}, msg.area); } catch (err) { console.error(err); }
      });
    }
  });

  function call(kind, data) {
    return new Promise(function (resolve) {
      var id = nextId++;
      pending[id] = resolve;
      SalikNative.postMessage(JSON.stringify({ id: id, kind: kind, data: data === undefined ? null : data }));
    });
  }

  function withCallback(promise, cb) {
    if (typeof cb === "function") promise.then(function (r) { cb(r); });
    return promise;
  }

  function storageArea(area) {
    return {
      get: function (keys, cb) {
        if (typeof keys === "function") { cb = keys; keys = null; }
        return withCallback(call("storage.get", { area: area, keys: keys === undefined ? null : keys }), cb);
      },
      set: function (items, cb) {
        return withCallback(call("storage.set", { area: area, items: items || {} }).then(function () {}), cb);
      },
      remove: function (keys, cb) {
        return withCallback(call("storage.remove", { area: area, keys: keys }).then(function () {}), cb);
      }
    };
  }

  function listenerSet(list) {
    return {
      addListener: function (fn) { if (typeof fn === "function") list.push(fn); },
      removeListener: function (fn) { var i = list.indexOf(fn); if (i >= 0) list.splice(i, 1); },
      hasListener: function (fn) { return list.indexOf(fn) >= 0; }
    };
  }

  return {
    runtime: {
      id: "salik-tv",
      lastError: undefined,
      sendMessage: function (msg, cb) { return withCallback(call("runtime", msg), cb); },
      onMessage: listenerSet(runtimeListeners)
    },
    storage: {
      local: storageArea("local"),
      sync: storageArea("sync"),
      onChanged: listenerSet(storageListeners)
    }
  };
}
