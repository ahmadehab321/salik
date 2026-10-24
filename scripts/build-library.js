// Rebuilds library.json from library/<key>.json (one file per title).
// Usage: node scripts/build-library.js
const fs = require("fs"), path = require("path");
const dir = path.join(__dirname, "..", "library");
const out = {};
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
  out[f.slice(0, -5)] = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
}
fs.writeFileSync(path.join(__dirname, "..", "library.json"), JSON.stringify(out));
console.log("library.json rebuilt:", Object.keys(out).length, "titles");
