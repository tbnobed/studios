'use strict';

// Loads the compiled native DeckLink addon. Build it on Windows with:
//   npm run rebuild-addon
// which produces native/build/Release/decklink_output.node

const path = require('path');

const candidates = [
  path.join(__dirname, 'build', 'Release', 'decklink_output.node'),
  path.join(__dirname, 'build', 'Debug', 'decklink_output.node'),
];

let addon = null;
let lastErr = null;
for (const p of candidates) {
  try {
    addon = require(p);
    break;
  } catch (err) {
    lastErr = err;
  }
}

if (!addon) {
  throw new Error(
    'decklink_output native addon not found/loadable. Build it on Windows ' +
      'with "npm run rebuild-addon". Last error: ' +
      (lastErr ? lastErr.message : 'unknown')
  );
}

module.exports = addon;
