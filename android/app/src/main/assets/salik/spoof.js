(function () {
  if (window.__salikSpoofed) return;
  window.__salikSpoofed = true;
  function def(o, p, v) {
    try { Object.defineProperty(o, p, { get: function () { return v; }, configurable: true }); } catch (e) {}
  }
  var ver = (navigator.userAgent.match(/Chrome\/(\d+)/) || [])[1] || '141';
  var brands = [
    { brand: 'Chromium', version: ver },
    { brand: 'Google Chrome', version: ver },
    { brand: 'Not?A_Brand', version: '99' }
  ];
  var uaData = {
    brands: brands, mobile: false, platform: 'Windows',
    getHighEntropyValues: function () {
      return Promise.resolve({
        brands: brands, mobile: false, platform: 'Windows', platformVersion: '15.0.0',
        architecture: 'x86', bitness: '64', model: '', uaFullVersion: ver + '.0.0.0',
        fullVersionList: brands
      });
    },
    toJSON: function () { return { brands: brands, mobile: false, platform: 'Windows' }; }
  };
  def(Navigator.prototype, 'userAgentData', uaData);
  def(Navigator.prototype, 'platform', 'Win32');
  def(Navigator.prototype, 'maxTouchPoints', 0);
  def(Navigator.prototype, 'vendor', 'Google Inc.');

  [window, Window.prototype, Document.prototype, HTMLElement.prototype, Element.prototype]
    .forEach(function (o) {
      ['ontouchstart', 'ontouchend', 'ontouchmove', 'ontouchcancel'].forEach(function (k) {
        try { delete o[k]; } catch (e) {}
      });
    });

  var mm = window.matchMedia.bind(window);
  window.matchMedia = function (q) {
    var fixed = String(q)
      .replace(/\(\s*(any-)?pointer\s*:\s*coarse\s*\)/g, '(max-width: 0px)')
      .replace(/\(\s*(any-)?hover\s*:\s*none\s*\)/g, '(max-width: 0px)');
    return mm(fixed);
  };

  var VP = 'width=1366';
  function fixViewport() {
    var m = document.querySelector('meta[name="viewport"]');
    if (!m) {
      if (!document.head) return;
      m = document.createElement('meta');
      m.name = 'viewport';
      document.head.appendChild(m);
    }
    if (m.content !== VP) m.content = VP;
  }
  new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      var m = muts[i];
      if (m.type === 'attributes') { if (m.target.name === 'viewport') { fixViewport(); return; } continue; }
      var added = m.addedNodes;
      for (var j = 0; j < added.length; j++) {
        var n = added[j];
        if (n.nodeName === 'META' || n.nodeName === 'HEAD') { fixViewport(); return; }
      }
    }
  }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['content'] });
  document.addEventListener('DOMContentLoaded', fixViewport);
  console.log('[Salik] spoof active');
})();

(function () {
  if (!navigator.requestMediaKeySystemAccess || window.__salikEmeFallback) return;
  window.__salikEmeFallback = true;
  var orig = navigator.requestMediaKeySystemAccess.bind(navigator);
  function lower(caps) {
    return (caps || []).map(function (c) {
      var copy = Object.assign({}, c);
      copy.robustness = "SW_SECURE_CRYPTO";
      return copy;
    });
  }
  navigator.requestMediaKeySystemAccess = function (keySystem, configs) {
    return orig(keySystem, configs).catch(function (err) {
      if (!/widevine/i.test(String(keySystem))) throw err;
      var lowered = (configs || []).map(function (cfg) {
        var c = Object.assign({}, cfg);
        if (c.videoCapabilities) c.videoCapabilities = lower(c.videoCapabilities);
        if (c.audioCapabilities) c.audioCapabilities = lower(c.audioCapabilities);
        return c;
      });
      console.log("[Salik] Widevine refused (" + (err && err.name) + "), retrying with SW_SECURE_CRYPTO");
      return orig(keySystem, lowered).then(function (access) {
        console.log("[Salik] Widevine fallback OK (SW_SECURE_CRYPTO)");
        return access;
      }, function () { throw err; });
    });
  };
})();
