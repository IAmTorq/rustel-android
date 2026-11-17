# Android architecture

Read the root [coding style](../../CODING_STYLE.md) and
[contribution guide](../../CONTRIBUTING.md). Android uses the shared Rustel
language and DSP implementation; platform adapters should not fork their semantics.

## Components

| Component | Responsibility |
| --- | --- |
| `android-native/` | JNI entry points and the native Studio session |
| `android/app/src/` | Activity, foreground playback service, camera and route monitoring |
| `android/app/assets/` | Bundled terminal renderer, input and phone controls |
| `crates/studio/src/android_terminal.rs` | Bounded, ordered input and Android display dimensions |
| `crates/studio/src/android_controls.rs` | Action tokens, piano state and resolved UI palette |
| `android/qa/` | Reproducible host and device checks |

## Terminal and input

The Activity owns a WebView running bundled xterm.js. Java forwards typed events
to the native input queue. Terminal bytes return through an app-owned pipe,
complete-frame batching and a single-outstanding-chunk acknowledgement bridge.
Android does not require a PTY or replace process standard I/O.

The adapter bounds input events and paste size. Keep key ordering, modifier,
repeat/release, focus and bracketed-paste behavior consistent with Studio.
Touch controls expose missing keyboard keys; the software keyboard defaults on
and remembers its setting. A hardware Fn-to-Ctrl mapping can provide shortcuts
on keyboard-equipped devices.

Activity recreation must not attach a reader to a closing native session or let
an obsolete exit callback stop a replacement playback service. Startup retries
are bounded and asynchronous. Audio continues through a foreground service;
camera capture follows Activity visibility.

Any changed terminal size invalidates the Android fullscreen viewport. A rapid
shrink/expand can reflow xterm even when Studio next sees its original size.
Use the fullscreen resize path to repaint; cursor-query APIs require a TTY and
are unavailable to this adapter.

## Audio and camera

AAudio route monitoring runs outside the callback. The callback allocation
tripwire, scheduling and underrun accounting remain active. Local output keeps
the 250-ms buffering ceiling; identified wireless output has a bounded 500-ms
allowance. Unknown routes retain the local policy. Stream recovery closes the
old callback before a bounded route-settling wait and reopen.

Explicit callbacks of at least 1024 frames use normal AAudio output with an
effective two-period queue configured before start. Auto and smaller callbacks
keep the low-latency path. Capacity alone does not bound the effective queue;
normal output can otherwise choose excessive buffering. See the documented
[CPAL patch](../../android-native/vendor-fixes/cpal-aaudio-buffered-output.md)
for the implementation, dependency provenance and positive frame-count handling.
The existing local and wireless latency limits still apply.

Camera conversion retains the newest frame rather than queueing stale frames.
Preserve orientation, aspect ratio and cover crop; do not fill uncovered strips
by repeating edge pixels. Review the documented dependency patches under
`android-native/vendor-fixes/` when updating the theme package.

## Rendering and controls

Theme text and character painting use the same engine paths as desktop.
Preserve authored transformations and the engine's interface, selection and
highlight protections. Fix transport, width or resize defects at their source;
blanket glyph restoration also suppresses intentional effects and artwork gaps.

The native palette cache publishes resolved theme colors when they change.
Visible phone controls poll at 250 ms, validate colors and skip unchanged styles.
Native phone Settings uses the same palette. Keep theme updates outside audio
callbacks and preserve numeric text-size and keyboard preferences.

The renderer's atlas and frame-boundary cache tests are independent of theme
effects. Keep local renderer changes documented and reconcile them with pinned
upstream assets rather than accumulating an unmaintained fork.

## Storage and packaging

Sets, settings and sample caches use app-private storage. Open/Import uses the
Storage Access Framework, copies a selected document into bounded staging, and
submits its path and mode to the native queue. The 4-MiB limit, mode matching,
request ownership and cleanup apply to cancellation and failure as well as success.
Open creates a durable set; Import uses Studio's existing conflict rules.

Audio placed in a set directory is discovered by the shared sample library.
Shared-storage sample folders use persisted Android document-tree grants; see
[SAMPLES.md](SAMPLES.md). The adapter resolves named local bases and reads requested
files through a private loopback endpoint. The shared loader grants those endpoints
only in an explicitly enabled Studio policy and bypasses remote byte caches for
these local reads. Grant changes follow the existing Studio permission-update
path. Keep normal remote-pack downloads and cache reuse.

QA and production use different package identities. Production must omit QA
native entry points and WebView debugging. Preserve package and signing identity
for upgrades. See [BUILDING.md](BUILDING.md) for source bundles and release checks,
[TESTING.md](TESTING.md) for validation, and
[UPSTREAM-UPDATES.md](UPSTREAM-UPDATES.md) for integrations.

## Port implementation and regression map

This inventory describes the Android port relative to upstream
`c60f974b4bc4f3e1fbb79d7982089aa15451b6fe`. It maps changes to their implementation
and reproducible checks. A listed check identifies relevant coverage, not a claim
that every device or workload passes. See [TESTING.md](TESTING.md) for outstanding
qualification and [UPSTREAM-UPDATES.md](UPSTREAM-UPDATES.md) before merging upstream.
Paths below are relative to the repository root; Rust test names can be used as
`cargo test` filters. Device runners live in `android/qa/`.

### Native host, input and storage

| Problem or capability | Implementation and invariant | Regression coverage |
| --- | --- | --- |
| Studio startup expects terminal ioctls that an Android Activity cannot provide. | `android-native/src/lib.rs`, `crates/studio/src/android_terminal.rs` and `terminal/backend.rs` provide an app-owned output pipe, ordered typed input and fullscreen dimensions without a PTY. | Host adapter tests; device cold start and keyboard checks in the testing matrix. |
| Activity recreation can reuse a closing session or let an old exit callback stop a replacement service. | `android/app/src/cc/rustel/android/MainActivity.java` coordinates reader ownership and bounded asynchronous startup retries; `PlaybackService.java` owns background playback. | `lifecycle-recreate.cjs`; screen-off and foreground/background device checks. |
| Hardware-only shortcuts and terminal navigation are unavailable on ordinary phones. | `KeyboardInput.java`, `phone-controls.js` and `reference-touch.js` bridge physical keys, remembered software-keyboard preference, modifiers, gestures and help scrolling. | Java/input host checks and device input matrix. Ordinary-phone IME qualification remains open. |
| Document cancellation, conflicting requests or oversized files can lose request ownership or leave staging files. | `PatternImport.java`, `MainActivity.java`, `crates/studio/src/android_pattern_import.rs` and `app/sets.rs` retain ownership through copy/submission, enforce the 4-MiB bound and mode matching, and clean up staging. | `PatternImportTest.java`, `import-refusal.cjs`, `import-boundary.cjs` and native queue tests. |
| A document picker can shrink and restore the viewport before Studio observes the intermediate size, leaving stale text. | `android_terminal.rs` retains repaint invalidation across resize round trips; `app/render.rs` repaints through fullscreen resize without a terminal cursor query. | `resize-roundtrip.cjs` and the document-import boundary runner. |

### Audio and language execution

| Problem or capability | Implementation and invariant | Regression coverage |
| --- | --- | --- |
| Android needs native output while retaining callback allocation detection. | `android-native/src/allocator.rs` and `crates/audio/src/device/android.rs` connect the native host to AAudio and the shared realtime tripwire. | Allocator positive-control and callback checks; native/device playback tests. |
| Wireless buffering and disconnects have different timing from local speakers. | `AudioRouteMonitor.java`, `crates/audio/src/device/android.rs` and `device/stream.rs` report routes outside the callback, distinguish bounded wireless buffering, close the previous callback before recovery and bound the route-settling wait. | Route-policy unit tests include `wireless_allowance_follows_the_selected_route_not_just_a_connected_headset` and `missing_route_notification_has_a_bounded_wait`; device speaker/Bluetooth handoffs remain part of release qualification. |
| Fast-output startup can underrun before any musical events are accepted. | The documented CPAL AAudio output patch selects normal mode for large explicit callbacks and sets the effective queue before start. Auto, small buffers, input and desktop retain upstream behavior; xrun counters are unchanged. | `test-aaudio-policy.py`, `startup-audio.cjs`, then device load and route qualification. |
| Long runs of comments can repeatedly scan the same source during live evaluation. | `crates/runtime/src/lint.rs` and `crates/transpiler/src/lib.rs` skip already-scanned trivia while preserving diagnostic offsets and expression continuation. These shared fixes also apply to desktop. | `a_long_run_of_blank_and_comment_lines_keeps_the_chain_and_stays_linear`, `check-long-arrangements.py` and live comment/uncomment load tests. |
| Sample-map names and paths can be mistaken for musical mini-notation. | The shared transpiler and lint walker preserve map data inside `samples({...})` while continuing to compile surrounding patterns. | `sample_map_names_and_paths_are_data_but_other_patterns_still_compile` and `sample_map_urls_are_not_linted_as_mini_notation`. |
| Large arrangements need parity beyond a simple demonstration score. | `android/qa/` contains corpus preparation/comparison, long-arrangement generation, recording/export and load runners. The shared language and DSP remain authoritative. | Use the corpus and load procedures in TESTING.md and LOAD-TESTING.md; these tools do not establish exhaustive function-pair or sustained-load coverage. |

### Rendering, camera and distribution

| Problem or capability | Implementation and invariant | Regression coverage |
| --- | --- | --- |
| Partial terminal frames and unbounded renderer caches can produce corruption or memory pressure. | `TerminalFrameBatcher.java`, `phone-controls.js`, `renderer-cache.js` and documented bundled-renderer patches preserve UTF-8/frame boundaries, bound output acknowledgements and constrain atlas caching. | `TerminalFrameBatcherTest.java`, `test-renderer-cache.cjs`, `cache-gpu-pixels.cjs` and `cache-gpu-stress.cjs`. |
| Camera frames can queue behind motion or stretch into an uncovered bottom strip. | `CameraFeed.java`, `CameraFrames.java`, `crates/runtime/src/hydra_input.rs` and the documented theme dependency patches use newest-frame delivery, orientation updates and aspect-preserving cover crop. | `CameraFramesTest.java`, `measure-camera.cjs` and front/rear camera lifecycle checks. |
| Blanket text repair suppresses intentional theme distortion and fills artwork gaps. | Android uses the shared theme painter and its existing surface protections; the Android-only glyph-restoration override was removed. `crates/studio/src/app/render.rs` integrates the native terminal without replacing authored effects. | Shared theme/compositor tests, `art-space-transparency.cjs` and theme device runners. Full theme/load qualification remains open. |
| Android controls otherwise retain unrelated colors after a theme change. | `crates/studio/src/android_controls.rs` caches resolved colors; JNI, `phone-theme.js` and native Settings consume that palette. Unchanged palettes avoid repeated styling. | Native palette-cache test, `test-phone-theme.cjs` and `phone-theme-live.cjs`. |
| Exported source can omit files or lose Unix executable permissions needed by dependencies. | `android/prepare-source.py`, `source-files.json` and `source-executables.json` define the source bundle and executable allowlist; publication checks exclude private overlays and build material. | `test-source-archive.py`, `refresh-source-manifest.py` and `check-publication.py`; production checks additionally exclude QA entry points and WebView debugging. |

Keep this map current when fixes move or are replaced upstream. Future commits
should explain their concrete trigger, behavior change and relevant validation;
the changelog records user-visible changes, while this document records how the
port fits together. Generated results belong in CI artifacts or local reports.
