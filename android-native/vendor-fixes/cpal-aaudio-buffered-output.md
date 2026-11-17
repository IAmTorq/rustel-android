# Buffered AAudio output startup

The vendored CPAL 0.18.2 source is the crates.io release from upstream commit
`e1612d5d98152f8dc2a62e1b51ef7cbf4f7f26b7` in
https://github.com/RustAudio/cpal. Its Apache-2.0 license is retained. The release
archive checksum is `6f02e8d0327b42d3e2e4ab2119af397344eb9fc54a34bf0ddeaa1277af8681f1`.

Only `src/host/aaudio/mod.rs` and the new `output_policy.rs` differ from that
release. Explicit output callbacks of at least 1024 frames select normal AAudio
performance mode and request an effective queue of two callback periods before
starting. Automatic and smaller callbacks retain upstream low-latency behavior;
input and desktop backends are unchanged. The policy is based on the requested
callback size, not a device model or a theme.

Large fixed callbacks on a legacy fast output can report an initial underrun
before the engine accepts musical events. Increasing capacity alone did not
remove this condition. Normal output also needs an explicit effective buffer:
Android can otherwise choose a deep queue that exceeds the existing latency
safeguard. The capacity request remains two periods. The actual size is chosen
by Android; the engine's existing local/wireless latency limits still apply.

`ndk` 0.9 wraps a positive return from `AAudioStream_setBufferSizeInFrames` as
`AudioError::__Unknown`. The local call accepts that positive applied frame count
as success and preserves negative failures. See the
[Android API contract](https://developer.android.com/ndk/reference/group/audio#aaudiostream_setbuffersizeinframes).
An intentionally selected normal mode does not emit a realtime-denied advisory.
Xrun detection, callback allocation checks, clock calculations and DSP remain
unchanged; there is no startup counter reset or grace period.

Run `python android/qa/test-aaudio-policy.py` for policy boundaries and integer
bounds. Run `android/qa/startup-audio.cjs` against a disposable QA set for actual
cold launches, following TESTING.md's device-run setup. Repeat at the relevant
buffer sizes and routes, then qualify load, editing and Bluetooth handoffs.
Host tests cannot establish those device results.

When updating CPAL, rebase this small patch onto the pinned release, or remove
it when upstream offers equivalent performance-mode and effective-queue control.
Retest positive frame-count handling when updating `ndk`. Do not retain the
workaround solely because it merges cleanly.
