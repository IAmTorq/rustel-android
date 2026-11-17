# Android changes

## Unreleased

- Use bounded normal-mode AAudio output for large explicit callbacks to avoid
  fast-output startup underruns. Preserve low-latency mode for Auto and small
  callbacks, and retain existing latency and callback safety checks.

- Add an ARM64 Android host for the native engine and Studio, with AAudio output,
  foreground playback, touch controls and physical keyboard input.
- Add numeric text size, a remembered software-keyboard setting, gesture
  navigation, help scrolling and front/rear camera controls.
- Support score Open/Import through Android's document picker, durable set
  storage, bounded transfers and cancellation handling.
- Correct session handoff during Activity recreation and repaint after rapid
  terminal resize round trips.
- Recover audio streams during Bluetooth route changes while retaining bounded
  buffering and callback safety checks.
- Correct camera cover crop, orientation updates and newest-frame delivery.
- Preserve desktop-authored theme effects and derive phone control colors from
  the selected theme.
- Avoid repeated comment-trivia scans during large-source evaluation while preserving
  diagnostics and expression continuation.
- Preserve sample-map names and paths as data during transpilation and linting.
- Bound terminal frame delivery and renderer caches.
- Add host/device regression tooling and a desktop parity workflow.

See [testing](TESTING.md) for known limitations and release coverage.

See the [implementation and regression map](DEVELOPMENT.md#port-implementation-and-regression-map)
for the source locations, reasons and checks behind these changes.
