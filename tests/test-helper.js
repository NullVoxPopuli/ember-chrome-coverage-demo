import '@warp-drive/ember/install';
import Application from 'ember-chrome-coverage-demo/app';
import config from 'ember-chrome-coverage-demo/config/environment';
import * as QUnit from 'qunit';
import { setApplication } from '@ember/test-helpers';
import { setup } from 'qunit-dom';
import { start as qunitStart, setupEmberOnerrorValidation } from 'ember-qunit';

export async function start() {
  setApplication(Application.create(config.APP));

  setup(QUnit.assert);
  setupEmberOnerrorValidation();

  // Block until the testem middleware has connected to Chrome via CDP and
  // enabled precise coverage. This guarantees no test code runs before the
  // coverage profiler is active. Errors are silently swallowed so a missing
  // or broken coverage setup never prevents tests from running.
  try {
    await fetch('/_coverage-ready');
  } catch {
    // coverage setup unavailable — continue without it
  }

  // Once all tests finish, ask the middleware to snapshot and save coverage
  // data. Using an async callback means QUnit waits for the fetch to settle
  // before emitting the final TAP plan line, so the file is written before
  // testem kills Chrome.
  QUnit.done(async function () {
    try {
      await fetch('/_coverage');
    } catch {
      // Silently ignore — coverage is best-effort and must never fail the run.
    }
  });

  qunitStart();
}
