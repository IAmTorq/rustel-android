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

- Touch-IME behavior needs testing on conventional touchscreen devices.
- External MIDI, Link/network interoperability, gamepad and serial backends
  need additional platform or hardware coverage. Gamepad/serial parity is incomplete.
- Shared-storage sample folders are not connected to an Android directory picker.
  Score Open/Import does not provide that access.
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
