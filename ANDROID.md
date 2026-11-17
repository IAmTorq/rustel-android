# Rustel for Android

This fork adds an Android host for [Rustel](https://github.com/tzfm/rustel).
It uses the native engine and Studio with a bundled terminal display, touch
controls, physical keyboard input, and AAudio output.

The port targets ARM64 Android 12 and later. It is experimental; see
[testing and known limitations](android/docs/TESTING.md) before relying on it
for performance. Desktop VST plugins are not supported.

## Development

- [Build and install](android/docs/BUILDING.md)
- [Architecture](android/docs/DEVELOPMENT.md)
- [Testing](android/docs/TESTING.md) and [load tests](android/docs/LOAD-TESTING.md)
- [Upstream integration](android/docs/UPSTREAM-UPDATES.md)
- [Changes](android/docs/CHANGELOG.md)
- [Contributing](android/CONTRIBUTING.md)

Android development is on `android-port`, based on upstream commit
`c60f974b4bc4f3e1fbb79d7982089aa15451b6fe`. The original workspace, language,
DSP implementation, [coding style](CODING_STYLE.md), and
[contribution checks](CONTRIBUTING.md) remain the reference.

Samples download and cache on demand. The display runs locally through bundled
xterm.js assets. Updates require a signed APK; preserve its signing identity
for in-place upgrades.

Rustel is AGPL-3.0-or-later. Preserve [LICENSE](LICENSE), [NOTICE.md](NOTICE.md),
corresponding source, and third-party notices when distributing builds.
This is an unofficial port.
