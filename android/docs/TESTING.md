# Android testing

The port is experimental. Compilation, offline rendering, terminal-model
checks, pixel inspection, and audible playback establish different properties.
Keep their results separate and test the exact candidate intended for release.

## Automated checks

Run the shared checks in [CONTRIBUTING.md](../../CONTRIBUTING.md). For the host:

```sh
npm ci --prefix android
node android/test_ui.cjs
node android/qa/test-phone-theme.cjs
node android/qa/test-renderer-cache.cjs
node android/qa/test-observation.cjs
python android/qa/test-java.py
python android/qa/test-source-archive.py
python android/check-publication.py
```

UI tests require Chromium; set `CHROME_PATH` if needed. Java tests require a JDK.
The [wrapper workflow](../../.github/workflows/android-wrapper.yml) runs host
contracts. The [desktop parity workflow](../../.github/workflows/android-desktop-parity.yml)
dispatches shared Studio and corpus checks. Inspect results for the candidate
commit rather than inheriting an earlier build's pass.

## Device checks

Use `cc.rustel.qa` with a disposable set. Set `ADB`, an absolute
`RUSTEL_QA_RESULTS` output directory, and `RUSTEL_QA_SET_DIRECTORY` to a
`files/config/sets/QA_...` or `files/config/sets/Rustel_QA_...` directory.
The guarded runners refuse another active set. Review each runner's prerequisites
and cleanup behavior before use.

| Area | Required coverage | Available checks |
| --- | --- | --- |
| Startup and lifecycle | Cold start, recreation, backgrounding, screen off, process death, unsaved edits | Lifecycle and configuration runners in `android/qa/` |
| Input | Physical and touch keyboards, modifiers, Unicode, selection, undo/redo, scrolling | Editor, Vim, find, piano-release and clipboard runners |
| Files | Open/Import modes, cancellation, failed saves, update retention, boundary files | `document-cancel.cjs`, `import-boundary.cjs`, `import-refusal.cjs` |
| Audio | Audible output, last-good playback, capture/export, route changes, finite samples | Audio, recording and sample-control runners |
| Themes and controls | Desktop-authored effects, palette changes, selection states, transparency | `phone-theme-live.cjs`, `art-space-transparency.cjs`, `resize-roundtrip.cjs` |
| Camera and video | Permissions, framing, orientation, flipping, lifecycle, codecs, seeking | Camera and video runners |
| Capacity | Large source, late sections, live edits, mixed effects and visualizers | [Load-test procedure](LOAD-TESTING.md) |

Inspect native pixels and speaker/headphone output where relevant. A changing
cell model does not establish correct GPU output; meters do not establish
audible playback. Compare authored theme transformations with desktop behavior
rather than requiring fixed glyphs from every effect. Verify saved source and
accepted audio revisions independently of the displayed animation.

## Known limitations and remaining work

- For v0.1.7 upgrades, verify both axes of the pointer with a coordinate-driven
  Hydra sketch and with `mousex` and `mousey` in a playing score. One-finger
  holds and drags should report terminal coordinates while preserving editor
  gestures. Check video picture motion separately from the decoded audio track.

- Touch-IME behavior needs testing on conventional touchscreen devices.
- External MIDI hardware and Link/network interoperability need device coverage.
  The Android build does not include the gamepad or serial backends.
- Shared-storage sample folders require a separate read-only grant in
  [Sample folders](SAMPLES.md). Score Open/Import grants access to the selected
  file, not its parent folder. Test provider differences and revoked grants
  when qualifying another device.
- Longer video, seeking, audio/video synchronization and cache pressure are not
  fully qualified. Codec support varies.
- Full delayed-theme, context-loss, Unicode-under-load and overlapping-layout
  coverage remains incomplete.
- Earlier combined-load tests encountered underruns and late events. Short clean
  runs do not establish sustained performance for all arrangements.
- Production packaging, disabled QA interfaces, signatures and in-place upgrade
  retention must be checked for each release candidate.

Device coverage includes a Unihertz Titan 2 on Android 16 and Bluetooth output
through ATH-M50xBT2 headphones. Broader devices, aspect ratios, audio routes and
thermal conditions require validation.

## Reporting results

Record commit, APK digest, device/OS/WebView, audio configuration, fixture,
duration, expected behavior, observed behavior and unresolved failures. Include
only the summary needed to assess a change in its PR. Keep generated reports,
recordings and full run logs in local results or CI artifacts, not the source
tree. Use reproducible fixtures and retain failures for diagnosis.

## Cold-start audio regression

Run `python android/qa/test-aaudio-policy.py` with the pinned Rust compiler on
PATH, or set RUSTC. This checks the buffered-output policy boundaries without a
device. It does not prove playback behavior.

With the existing device-run environment pointing to a disposable QA set, run
`node android/qa/startup-audio.cjs`. The runner cold-launches the QA app, evaluates
the saved score, and requires zero total xruns, callback errors, late events and
callback allocations for each launch. `RUSTEL_QA_STARTUP_RUNS` selects 1 to 10
launches (default 3). Results include the APK digest and output facts. The runner
does not edit the score and stops playback after each check.

Qualify the actual buffer preference and route. Auto/small callbacks retain the
upstream low-latency mode and need separate coverage; a buffered-output pass does
not establish that path. Repeat representative source load, live edits, screen
lifecycle and Bluetooth handoffs before declaring a release qualified.
