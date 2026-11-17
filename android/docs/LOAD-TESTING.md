# Android load tests

Exercise large arrangements, simultaneous instruments and live editing within
device resources. Sixteen parts is a representative workload, not a product
limit. Test early, late and boundary sections of long arrangements; source
length or a long wall-clock soak alone does not establish musical capacity.

## Fixtures and comparison

`generate-interaction-cases.py` creates native synth, pair, shared-effect,
sidechain, layered and visualizer cases under the ignored `android/qa/generated/`
directory. Use `measure-interaction-reference.py` with a matching desktop CLI,
then the guarded Android offline worker and `compare-interactions.py` to compare
event/context/frame counts, quantized PCM hashes and signal bounds.

`check-long-arrangements.py` queries early, late and boundary windows of generated
arrangements. `generate-editing-set.py` creates a large set with 16 enabled parts
and prepared alternatives. `live-comment-editing.cjs` comments/uncomments parts
and groups while checking exact source and accepted audio generations. These
runners replace the selected QA score; use a disposable set.

`stage-video.py` stages small upstream fixtures for `video-smoke.cjs`. Changing
picture cells, codec refusals, visible output and audio/video synchronization
require separate assertions.

## Measurement

Record APK digest, device/WebView, fixture hash, buffer, frame-rate setting,
visual configuration and duration. Separate startup, evaluation and steady
playback. Verify the accepted source revision and consumer-confirmed generation
before measuring.

For accepted representative workloads require finite, unclipped audio and zero
new underruns, late events or callback allocations. Target at least 30 displayed
fps; 60 is preferred when sustainable. A configured rate or native frame counter
does not establish displayed fps. Check actual audible output as well as meters.

Repeat light and complex themes, multiple visualizers, camera/video and live
edits. Monitor memory retention, queue pressure, voice/pool limits, temperature
and input-to-paint latency. Stop the ramp on clipping, silence, underruns or
unresponsiveness; preserve the failing case and diagnose at a lower load.
Do not weaken safety limits or alter audio goldens to obtain a pass.

Keep full measurements as local results or CI artifacts. Summarize relevant
results and remaining limitations in the associated change.
