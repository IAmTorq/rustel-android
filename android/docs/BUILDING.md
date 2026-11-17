# Build and install the Android port

Use the `android-port` branch. The upstream root Cargo workspace is preserved.
These scripts build an ARM64 APK on Windows; they do not compile on the phone.
A Linux/macOS host build has not yet been validated.

## Prerequisites

- Rust 1.98.1 and `rustup target add --toolchain 1.98.1 aarch64-linux-android`.
- JDK 11, Python 3.10+, Git, Android SDK build-tools 32.0.0 and platform android-32.
- Android NDK 23.1.7779620 (the tested toolchain), plus libclang 18.1.1 for bindgen.
- For wrapper tests: Node.js and the pinned Playwright dependency; install its
  Chromium or set CHROME_PATH to an installed Chrome/Chromium.
- Several GiB of free host storage for Cargo dependencies and native intermediates.

The manifest currently sets minimum API 31 and target API 35. The compiler jar
is platform 32 because the Java host uses APIs available there; this is the
tested combination, not a claim of current Play Store eligibility. Revisit the
target SDK and NDK requirements before any store submission.

Set environment variables for your actual tool locations:

```powershell
$env:ANDROID_NDK_HOME = 'D:\Android\ndk\23.1.7779620'
$env:ANDROID_SDK_ROOT = 'D:\Android\sdk'
$env:JAVA_HOME = 'D:\Java\jdk-11'
$env:LIBCLANG_PATH = 'D:\LLVM\bin'
```

Avoid spaces in NDK paths where the older native build dependencies require it;
the original Windows build used the short path for Program Files. If needed,
set CARGO_HOME/RUSTUP_HOME to a toolchain installation you own. No user-specific
paths or credentials are embedded in these public build scripts.

## Build

```powershell
powershell -File android/build-native.ps1 -Qa
python android/build_apk.py --qa --new-qa-key
```

For native sampling diagnosis, add `-KeepSymbols` to the QA native build. It
retains function symbols in the final cdylib without enabling a different DSP
mode or rebuilding dependencies with debug information. Production and Clippy
commands reject this option. Keep the matching local binary for symbolization;
profiling can perturb timing, so repeat acceptance checks without the profiler.

The first command creates the native cdylib and a digest/QA sidecar. The second
compiles Java, runs D8, packages resources and ARM64 native code, signs and
validates the APK. A QA key may be created locally only with explicit
`--new-qa-key`; it is ignored by Git. The package `cc.rustel.qa` keeps test data
separate from a production installation. Install with `adb install -r` and
launch the QA package. Authorize USB debugging on the device yourself.

Omit `--new-qa-key` after the first build; keep the same disposable QA key for
updates to that test installation.

Production builds omit `-Qa` and `--qa`. Supply an existing private signing key:

```powershell
$env:RUSTEL_KEYSTORE = 'D:\private\rustel-android.jks'
$env:RUSTEL_KEY_ALIAS = 'rustel'
# Set RUSTEL_STORE_PASSWORD and RUSTEL_KEY_PASSWORD privately in your shell.
powershell -File android/build-native.ps1
python android/build_apk.py
```

The builder refuses a QA-native digest for a production APK. It never generates
a production key automatically. The current public package is cc.rustel.android;
a newly generated certificate cannot update an existing installation.
Use the isolated QA package for development installations. Never uninstall a user's app just to bypass a signing mismatch.

Before packaging, the builder invokes `prepare-source.py` using Git's tracked
file list. Stage new source files first, and review `git status`; untracked files
are not corresponding source. The bundle includes current tracked modifications
and is embedded for Settings > Export app source code. Private theme overlays
are intentionally excluded in this public distribution.

## Tests and checks

Follow the complete root CONTRIBUTING.md checklist. For port changes also run:

```powershell
python android/check-publication.py
npm ci --prefix android
node android/test_ui.cjs
node android/qa/test-renderer-cache.cjs
node android/qa/cache-gpu-stress.cjs
```

The mask and inverse-fallback GPU stress checks now pass their plateau assertions;
other open failures remain in TESTING.md. This snapshot is for continued development. Build success
and APK signature validation do not establish real-device feature correctness.

## Production release checklist

1. Resolve or explicitly disclose all known failures; record exact commit and
   required host/device checks. Do not label the current snapshot stable.
2. Increment manifest versionCode/versionName. Preserve package and certificate
   for an intended in-place upgrade. Back up the signing key privately.
3. Build native code without QA. Check the ELF has no exported nativeQaRun symbol,
   ARM64 ABI and 16 KiB LOAD alignment. Require the digest sidecar to match.
4. Regenerate corresponding source and build the APK. Verify v2/v3 signatures,
   certificate, ZIP CRC, manifest, permissions, resources and native dependencies.
5. Verify debuggable is absent/false and WebView debugging is disabled in the
   production package. Test install/update without clearing existing app data.
6. Publish APK digest, source archive, license/notices, changes, known issues and
   actual test results together. Keep private keys, overlays and test data out.

No GitHub release workflow has permission to sign or publish an APK automatically.
The retained upstream workflows describe desktop Rustel and are not Android
release certification.

The read-only Android wrapper workflow runs Java, terminal, palette and cache
contracts. Check CI for the candidate commit; host CI does not qualify native
APK behavior or real-device performance. See TESTING.md for device coverage.

When rebuilding an exported source archive without `.git`, prepare-source.py uses
the included android/source-files.json instead of Git's tracked list. A maintainer
adding new source must run `python android/refresh-source-manifest.py` after
staging reviewed source additions and before release.


### Vendored encoder scripts on Unix

The vendored LAME `configure`, `config.guess`, `config.sub`, `install-sh`,
`missing`, `depcomp` and `ltmain.sh` files must retain Git mode `100755`.
`autotools` executes `configure` directly on Linux/macOS. A Windows import
that records mode `100644` fails before the studio/corpus tests can run.
`python android/check-publication.py` checks the indexed modes on every host.
Preserve these bits when refreshing this vendor directory; do not change
compiler flags or audio goldens to work around a script permission failure.


`android/refresh-source-manifest.py` also records Git executable paths in
`android/source-executables.json`. The corresponding-source packager applies
those modes explicitly, so Windows builds and later repacks of exported source
retain Unix permissions. Refresh both source allowlists after staging source
additions or executable-mode changes. Run
`python android/qa/test-source-archive.py` to verify inclusion, exported-source
repacking and rejection of executable paths outside the source allowlist.
