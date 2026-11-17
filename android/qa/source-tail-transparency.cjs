// Model-cell regression plus private native screenshots; no camera images are published.
const qa = require('./regression-context.cjs');
const d = require('./device.cjs'), o = require('./observation.cjs');
const fs = require('fs'), cp = require('child_process'), crypto = require('crypto'), assert = require('assert');
const themes = ['webcam-braille', 'webcam-clean', 'webcam-distort', 'webcam-hacker', 'lsd'];
const marker = '// QA_SOURCE_TAIL alpha  beta';
const unicode = '// QA_UNICODE café Δ 中文';
const code = [marker, unicode,
  'note("c3 e3 g3 c4").s("triangle").gain(.02)._pianoroll({labels:1})',
  ...Array.from({length: 40}, (_, i) => '// QA_SCROLL ' + i)].join('\n');
const revision = crypto.createHash('sha256').update(code).digest('hex');

async function selectTheme(page, name) {
  await d.theme(page, name);
  for (let i = 0; i < 25; i++) {
    if (d.prefs().theme === name) return;
    await page.waitForTimeout(150);
  }
  throw Error('Requested theme did not persist: ' + name);
}

async function grid(page) {
  return page.evaluate(() => Array.from({length: term.rows}, (_, y) =>
    Array.from({length: term.cols}, (_, x) =>
      term.buffer.active.getLine(term.buffer.active.baseY + y)?.getCell(x)?.getChars() ?? ' ')));
}
function capture(name) {
  const bytes = cp.execFileSync(d.adb, ['exec-out', 'screencap', '-p']);
  const start = bytes.indexOf(Buffer.from([137,80,78,71,13,10,26,10]));
  assert(start >= 0, 'Native screenshot missing PNG signature');
  fs.writeFileSync(qa.result(name + '.private.png'), bytes.subarray(start));
}

(async () => {
  const {browser, page} = await d.connect(), original = d.prefs().theme;
  const checks = [];
  let complete = false, initial, overall, failure;
  try {
    await d.key(page, 'F8');
    await d.source(page, code);
    await d.key(page, 'Home', 4);
    await d.key(page, 'F5');
    initial = await o.playing(page, revision);
    for (const theme of themes) {
      await selectTheme(page, theme);
      assert.strictEqual(d.prefs().theme, theme, 'Theme selection did not persist');
      const before = o.snapshot(), samples = [];
      for (let n = 0; n < 6; n++) {
        await page.waitForTimeout(1000);
        const cells = await grid(page), lines = cells.map(row => row.join(''));
        const y = lines.findIndex(line => line.includes(marker));
        assert(y >= 0, 'Source marker changed or disappeared');
        assert(lines.some(line => line.includes(unicode)), 'Unicode source changed or disappeared');
        const row = cells[y], start = lines[y].indexOf(marker) + marker.length;
        const tail = row.slice(start, -2);
        samples.push({tailBackdropCells: tail.filter(ch => ch.trim()).length,
          tailCells: tail.length, cols: row.length, rows: cells.length});
      }
      capture('source-tail-' + theme);
      // A nonblack camera scene is required to qualify actual tail coverage.
      const observedBackdrop = samples.some(sample => sample.tailBackdropCells > 0);
      await d.key(page, 'o', 4);
      await page.waitForTimeout(500);
      let appearance = false;
      for (let tab = 0; tab < 9; tab++) {
        await d.key(page, 'Home');
        await page.waitForTimeout(150);
        if ((await d.rows(page)).some(line => line.includes('menu bar'))) {
          appearance = true;
          break;
        }
        await d.key(page, 'Tab');
        await page.waitForTimeout(150);
      }
      assert(appearance, 'Appearance settings tab could not be selected');
      for (let n = 0; n < 3; n++) {
        const lines = await d.rows(page);
        assert(lines.some(line => line.includes('appearance')));
        assert(lines.some(line => line.includes('menu bar')), 'Settings label lost its internal space');
        await page.waitForTimeout(1000);
      }
      capture('source-tail-menu-' + theme);
      await d.key(page, 'Escape');
      const after = o.snapshot();
      const check = {theme, sourceAndUnicodePreserved: true, settingsLabelsPreserved: true,
        sourceTailGlyphBackdropObserved: observedBackdrop, samples,
        callbacksAdvance: after.callbacks > before.callbacks,
        newXruns: after.callback_xruns - before.callback_xruns,
        newLateEvents: after.late_events - before.late_events,
        newCallbackAllocations: after.callback_allocations - before.callback_allocations};
      checks.push(check);
      assert(after.playing && !after.visible_error && check.callbacksAdvance && after.allocator_tripwire_armed);
      assert.strictEqual(after.source_revision, revision);
      assert(!check.newXruns && !check.newLateEvents && !check.newCallbackAllocations);
      if (theme === 'webcam-braille') assert(observedBackdrop, 'No Braille backdrop observed in source tail');
    }
    const final = o.snapshot();
    overall = {newXruns: final.callback_xruns - initial.callback_xruns,
      newLateEvents: final.late_events - initial.late_events,
      newCallbackAllocations: final.callback_allocations - initial.callback_allocations};
    assert(!overall.newXruns && !overall.newLateEvents && !overall.newCallbackAllocations);
    complete = true;
  } catch (error) {
    failure = error.message;
    throw error;
  } finally {
    await d.key(page, 'Escape').catch(() => {});
    await d.key(page, 'F8').catch(() => {});
    await selectTheme(page, original).catch(() => {});
    await browser.close();
    const originalThemeRestored = d.prefs().theme === original;
    fs.writeFileSync(qa.result('source-tail-transparency.json'), JSON.stringify({
      date: new Date().toISOString(), apkSha256: qa.digest, sourceSha256: revision,
      complete: complete && originalThemeRestored, originalThemeRestored, checks, overall, failure,
      limits: ['Short live source/model and menu-label checks; not every theme or overlay.',
        'Native screenshots contain private camera content and are retained only in the private results folder.',
        'Pixel review is a separate recorded step; image-layer themes can have blank model cells over a visible camera image.',
        'No acoustic judgment or general endurance qualification.']}, null, 2));
    assert(originalThemeRestored, 'Original theme was not restored');
  }
  assert(complete);
  console.log('PASS: five theme/source-tail model regressions; private pixel review remains separate');
})().catch(error => { console.error(error); process.exit(1); });
