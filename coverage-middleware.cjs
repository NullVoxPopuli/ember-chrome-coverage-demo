'use strict';

/**
 * Testem middleware that:
 *  1. Connects to Chrome via the DevTools Protocol (CDP) and enables precise
 *     coverage collection as soon as Chrome is ready.
 *  2. Exposes GET /_coverage-ready — called by test-helper.js at startup.
 *     It blocks until the CDP connection is established, ensuring coverage is
 *     active before any test code runs.
 *  3. Exposes GET /_coverage — called by the QUnit.done() hook once all tests
 *     have finished. Saves the V8 coverage payload to coverage-data.json so
 *     the on_exit script can process it after Chrome is closed.
 */

const path = require('path');
const fs = require('fs');

const CDP_PORT = 9222;
const OUTPUT_FILE = path.join(__dirname, 'coverage-data.json');

let cdpClient = null;
// Promise that resolves once CDP is connected and coverage is started.
let cdpReadyResolve;
const cdpReady = new Promise((resolve) => { cdpReadyResolve = resolve; });

async function connectToCDP() {
  let CDP;
  try {
    CDP = require('chrome-remote-interface');
  } catch {
    console.warn('[coverage] chrome-remote-interface not installed — coverage disabled.');
    cdpReadyResolve(false);
    return;
  }

  // Chrome takes a moment to start; retry until it accepts a connection.
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const client = await CDP({ port: CDP_PORT });

      client.on('disconnect', () => {
        cdpClient = null;
      });

      await client.Profiler.enable();
      await client.Profiler.startPreciseCoverage({ callCount: true, detailed: true });

      cdpClient = client;
      cdpReadyResolve(true);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  console.warn('[coverage] Could not connect to Chrome CDP after 30 s — coverage disabled.');
  cdpReadyResolve(false);
}

// Begin attempting to connect immediately when the module is loaded by testem.
connectToCDP();

module.exports = function coverageMiddleware(app) {
  /**
   * Called by test-helper.js before qunitStart(). Waits until CDP is connected
   * and precise coverage is enabled so that no test code runs uncovered.
   */
  app.get('/_coverage-ready', async (req, res) => {
    const ok = await cdpReady;
    res.json({ ok });
  });

  /**
   * Called by the QUnit.done() async hook. Snapshots V8 coverage and writes it
   * to coverage-data.json for the on_exit report script to read.
   */
  app.get('/_coverage', async (req, res) => {
    if (!cdpClient) {
      res.status(503).json({ error: 'CDP not connected' });
      return;
    }

    try {
      const { result } = await cdpClient.Profiler.takePreciseCoverage();
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result));
      res.json({ ok: true, scripts: result.length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
};
