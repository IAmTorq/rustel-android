# Updating the Android port alongside upstream

The Android fork follows major upstream Rustel updates. Keep the shared engine,
language, sample behavior and desktop tests close to upstream; place platform
integration in `android/`, `android-native/` and narrowly gated Android modules.
Read the current upstream coding and contribution guides at each integration.
Do not maintain a second Android implementation of the music language or DSP.

## Integration procedure

1. Start from a clean, committed Android branch. Record its commit and known-good
   QA APK digest. Preserve private app-data backups and signing keys separately.
   Keep personal themes outside the public integration tree.
2. Fetch `upstream` and inspect the intended major release's tag and exact commit.
   Create an integration branch from the Android branch; merge that upstream
   release there. Do not update `main`, rewrite shared history, or push upstream.
   Resolve conflicts by understanding both changes rather than choosing an
   entire side. Never run a destructive reset over the Android work.
3. Review the change surfaces below even when Git reports no textual conflict.
   Compare upstream dependency revisions, features and new tests. Audit new
   desktop capabilities for Android support, with VST hosting still excluded.
4. Update or remove vendored fixes only after reproducing their regression tests
   against the replacement upstream code. Record new provenance and licenses.
   Refresh the source allowlist after adding tracked files.
5. Build a QA candidate, run relevant host/native checks, then execute the
   current master checklist's affected device tests. Include actual playback,
   editing, visual load, file persistence and lifecycle. Preserve failures;
   successful merging or compilation is not a parity result.
6. Record the upstream tag/commit, Android integration commit, dependency changes,
   APK digest, compatibility/data changes and test results. Update the architecture, changes, build and testing documentation. Publish only after
   outstanding blockers are reviewed; do not label an unfinished port qualified.

Review `BUILD_REVISION` in `android/build-native.ps1` explicitly. Its initial
port baseline label is not proof of the merged source revision. Record the
actual clean commit, any local modifications and the APK/source archive hashes;
update the label when adopting a newer upstream baseline.

Use a merge rather than rebasing already shared Android history. Keep subsequent
fixes focused so future integrators can inspect or revert one concern at a time.
Normal upstream merges must retain Android package identity and signing identity
so upgrades keep user data. Test settings migration, existing sets and existing
sample caches; avoid replacing user files with bundled defaults.

## Conflict and compatibility map

| Shared surface | Android contract to recheck |
| --- | --- |
| Workspace manifests, lockfile, runtime features | ARM64 Android compilation; shared language/DSP semantics; supported exports and codecs. |
| Studio startup, terminal backend, event loop | Typed Android input, no PTY/ioctl requirement, ordered shutdown, bounded output and CPU pacing. Desktop pacing must remain unchanged. |
| Runtime lint callback scanner | Skip blanked regions once; keep detection and original diagnostic spans across long comments. Drop the local optimization if upstream supplies an equivalent fix, retaining the regression and device timing check. |
| Transpiler sample-map strings | Preserve string keys/paths under `samples({...})` as data while neighboring musical strings still compile. Retain `sample_map_names_and_paths_are_data_but_other_patterns_still_compile` and `sample_map_urls_are_not_linted_as_mini_notation`; rerun desktop map checks and the phone network/cache runner after merging. Remove the local exemption only when replacement upstream behavior passes these regressions. |
| Transpiler statement scanner | Skip leading comment trivia as a region rather than emitting comment-only statements that repeatedly probe the remaining file. Preserve lane numbering/locations, JavaScript continuation rules and all original source transforms. |
| Studio actions, help, settings and file dialogs | Export the real action catalog and bounds; expose new features through mobile controls; retain numeric text size and remembered touch keyboard. |
| Audio backend, allocator and scheduler | AAudio device resolution, callback allocation tripwire, buffer behavior, route-specific latency limits and last-good audio on evaluation failure. Keep the 250 ms local default and bounded 500 ms wireless allowance; unknown routes remain strict. Recheck active-route prediction against CPAL's output attributes. |
| Theme paint paths and Android control palette | Preserve authored desktop effects; no Android text-restoration guard. Recheck shared effect/opacity contracts, Unicode transport, source/artwork transparency, native palette publishing and selected control colors. Keep resize invalidation and camera/atlas fixes separate. |
| Themes, cell composition, camera and visualizers | Protected text, atlas replacement, transparency, cover crop, latest-frame delivery, front/rear switching and readable menus during playback. |
| Set/sample storage and import/export | Android document picker, Downloads access, durable private sets, normal sample download/cache behavior and cancellation/errors. |
| Lifecycle, logging and build/packaging | Foreground playback, pause/resume, permission denial, QA-only diagnostics, ABI/alignment, corresponding source and licenses. |

Current local dependency overrides include `android-native/vendor/mp3lame-sys`
and `android-native/vendor/rustel-studio-themes`. Their adjacent documentation is
the authority for the exact patch and removal conditions. Review root Cargo
patch entries when upstream changes either package; do not silently retain a
stale override that hides an upstream fix or new functionality.

The Java/WebView terminal pipeline has its own byte-preservation, frame batching,
acknowledgement, atlas and stalled-refresh tests. Keep these tests independent
of upstream internal terminal APIs where possible. Avoid private xterm APIs and
source rewrites that would require rebasing a terminal-library fork.

## Minimum update evidence

Follow [TESTING.md](TESTING.md). A major update needs shared upstream checks, the native corpus and instrument interactions,
real Open/Import/save/export, input and help, sample cache reuse/download/offline,
and lifecycle/permission tests. Repeat 3-, 8- and 16-part display workloads with
audio, heavy themes and visualizers; measure displayed fps separately from the
configured target. Require zero new audio errors for accepted representative
cases. Compare the same public fixtures with the matching upstream desktop build.

Keep generated results and full logs as local records or CI artifacts. Do not
commit app data, device identifiers, recordings or signing material. An earlier
APK's result must retain its original digest after a newer candidate is built.

After each upstream integration, regenerate the host registry/reference inventory
with dump-reference-inventory.py and map-function-inventory.py. Diff names,
synonyms, parameter lists and Android action keys. Textual test/corpus matches
are leads only; keep new valid/invalid/boundary/combination/device cases
UNASSESSED until their behavior is actually qualified.

The CPAL AAudio patch and policy/cold-start regressions are documented in
[the buffered-output note](../../android-native/vendor-fixes/cpal-aaudio-buffered-output.md).
Review output performance mode, effective queue sizing and ndk frame-count result
handling together when updating those dependencies. Preserve desktop/capture
behavior and requalify both speaker and wireless routes.
