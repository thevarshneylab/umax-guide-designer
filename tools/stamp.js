#!/usr/bin/env node
/*
 * Stamp a content hash onto the asset URLs in index.html.
 *
 * GitHub Pages revalidates index.html far more eagerly than it revalidates
 * the files index.html references. Without a version on those URLs a visitor
 * can end up with new HTML and a cached old script — the page then looks
 * updated but behaves like the previous release, which is worse than an
 * obviously stale page because nothing appears wrong.
 *
 *   node tools/stamp.js          rewrite index.html with the current hash
 *   node tools/stamp.js --check  exit non-zero if it is out of date (CI)
 */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.join(__dirname, "..");
const PAGE = path.join(root, "index.html");

/* Every file index.html loads and the browser may cache independently. */
const ASSETS = ["umax.js", "app.js", "editors.json"];

function hashAssets() {
  const hash = crypto.createHash("sha256");
  for (const name of ASSETS) {
    hash.update(name);
    hash.update(fs.readFileSync(path.join(root, name)));
  }
  return hash.digest("hex").slice(0, 10);
}

/** Rewrite every `asset` / `asset?v=...` reference to carry `version`. */
function stamp(html, version) {
  let out = html;
  for (const name of ASSETS) {
    const escaped = name.replace(/\./g, "\\.");
    const pattern = new RegExp('(["\'(])' + escaped + '(\\?v=[A-Za-z0-9]+)?(["\')])', "g");
    out = out.replace(pattern, (m, open, _old, close) =>
      open + name + "?v=" + version + close);
  }
  return out;
}

const version = hashAssets();
const current = fs.readFileSync(PAGE, "utf8");
const updated = stamp(current, version);
const check = process.argv.includes("--check");

if (current === updated) {
  console.log("index.html is stamped with the current asset version (" + version + ")");
  process.exit(0);
}

if (check) {
  console.error(
    "index.html is out of date: assets hash to " + version + " but the page " +
    "references a different version.\n" +
    "Run `node tools/stamp.js` and commit the result, so visitors are not " +
    "served new HTML with a cached old script."
  );
  process.exit(1);
}

fs.writeFileSync(PAGE, updated);
console.log("index.html stamped with asset version " + version);
