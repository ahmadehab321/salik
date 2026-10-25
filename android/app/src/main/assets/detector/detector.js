import { Human } from "./human.esm.js";

const host = window.SalikDetector || { ready() {}, result(id, json) { console.log(id, json); }, failed(m) { console.warn(m); } };

const human = new Human({
  modelBasePath: "./models/",
  backend: "webgl",
  debug: false,
  cacheSensitivity: 0,
  filter: { enabled: false },
  face: {
    enabled: true,
    detector: { enabled: true, modelPath: "blazeface.json", maxDetected: 8, minConfidence: 0.3, rotation: false, return: false },
    mesh: { enabled: false }, iris: { enabled: false }, emotion: { enabled: false },
    description: { enabled: true, modelPath: "faceres.json", minConfidence: 0.1 },
    antispoof: { enabled: false }, liveness: { enabled: false }, attention: { enabled: false }
  },
  body: { enabled: false }, hand: { enabled: false }, object: { enabled: false },
  gesture: { enabled: false }, segmentation: { enabled: false }
});

let busy = false;
window.salikDetect = async function (id, dataUrl) {
  if (busy) { host.result(id, JSON.stringify({ busy: true })); return; }
  busy = true;
  try {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const t0 = performance.now();
    const r = await human.detect(img);
    const faces = (r.face || []).map((f) => ({
      gender: f.gender, genderScore: Number((f.genderScore || 0).toFixed(2)),
      score: Number((f.score || 0).toFixed(2)), box: (f.boxRaw || []).map((v) => Number(v.toFixed(3)))
    }));
    host.result(id, JSON.stringify({ faces, ms: Math.round(performance.now() - t0) }));
  } catch (e) {
    host.result(id, JSON.stringify({ error: String(e && e.message || e) }));
  } finally {
    busy = false;
  }
};

(async () => {
  try {
    await human.load();
    await human.warmup();
    host.ready(JSON.stringify({ backend: human.tf.getBackend() }));
  } catch (e) {
    host.failed(String(e && e.message || e));
  }
})();
