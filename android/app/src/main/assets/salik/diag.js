(function () {
  if (window.__salikDiag) return;
  window.__salikDiag = true;
  var where = (window.top === window ? "top" : "iframe") + " " + location.host;
  function log(m) { console.log("[SalikDiag] " + where + " | " + m); }

  window.addEventListener("error", function (e) {
    if (e && e.target && e.target !== window && e.target.tagName) return;
    log("JS error: " + (e.message || e) + " @ " + (e.filename || "") + ":" + (e.lineno || ""));
  });
  window.addEventListener("unhandledrejection", function (e) {
    var r = e && e.reason;
    log("Unhandled rejection: " + (r && (r.name + ": " + r.message) || r));
  });

  var nativeEme = navigator.requestMediaKeySystemAccess ? navigator.requestMediaKeySystemAccess.bind(navigator) : null;
  if (nativeEme) {
    var orig = nativeEme;
    navigator.requestMediaKeySystemAccess = function (keySystem, configs) {
      var robust = "";
      try {
        robust = (configs || []).map(function (c) {
          return (c.videoCapabilities || []).map(function (v) { return v.contentType + "/" + (v.robustness || "-"); }).join(",");
        }).join(" | ");
      } catch (e) {}
      return orig(keySystem, configs).then(function (access) {
        log("EME OK " + keySystem + " [" + robust + "]");
        return access;
      }, function (err) {
        log("EME FAIL " + keySystem + " [" + robust + "] " + (err && (err.name + ": " + err.message)));
        throw err;
      });
    };
  } else {
    log("navigator.requestMediaKeySystemAccess is MISSING (no EME)");
  }

  document.addEventListener("error", function (e) {
    var t = e.target;
    if (t && (t.tagName === "VIDEO" || t.tagName === "AUDIO") && t.error) {
      log("MEDIA ERROR code=" + t.error.code + " msg=" + (t.error.message || ""));
    }
  }, true);

  try {
    var worst = 0, count = 0;
    new PerformanceObserver(function (list) {
      list.getEntries().forEach(function (e) { count++; if (e.duration > worst) worst = e.duration; });
    }).observe({ entryTypes: ["longtask"] });
    setInterval(function () {
      if (count && worst >= 200) log("LONG TASKS: " + count + " in 5s, worst " + Math.round(worst) + "ms");
      worst = 0; count = 0;
    }, 5000);
  } catch (e) {}

  if (window.top === window) {
    setTimeout(function () {
      var mse = window.MediaSource ? ["video/mp4; codecs=\"avc1.640028\"", "video/mp4; codecs=\"hev1.1.6.L93.B0\"",
        "video/webm; codecs=\"vp9\"", "audio/mp4; codecs=\"mp4a.40.2\""].map(function (t) {
        return t.split(";")[1].trim() + "=" + MediaSource.isTypeSupported(t);
      }).join(" ") : "MediaSource MISSING";
      log("MSE: " + mse);
      log("UA: " + navigator.userAgent + " | platform=" + navigator.platform +
        " | uaData.mobile=" + (navigator.userAgentData && navigator.userAgentData.mobile));
      if (!nativeEme) return;
      var base = { initDataTypes: ["cenc"], audioCapabilities: [{ contentType: "audio/mp4; codecs=\"mp4a.40.2\"" }] };
      ["HW_SECURE_ALL", "SW_SECURE_DECODE", "SW_SECURE_CRYPTO", ""].forEach(function (rob) {
        var cfg = Object.assign({}, base, { videoCapabilities: [{ contentType: "video/mp4; codecs=\"avc1.640028\"", robustness: rob }] });
        nativeEme("com.widevine.alpha", [cfg]).then(function () {
          log("Widevine probe robustness=" + (rob || "none") + " -> SUPPORTED");
        }, function (err) {
          log("Widevine probe robustness=" + (rob || "none") + " -> NO (" + (err && err.name) + ")");
        });
      });
    }, 1500);
  }
})();
