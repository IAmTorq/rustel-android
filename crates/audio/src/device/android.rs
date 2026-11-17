//! AAudio's hardware burst is chosen after opening the stream. Automatic
//! mode must leave it unspecified so CPAL can use native burst sizing and
//! tune on underruns, while explicit user requests remain explicit.
use crate::AudioBufferPreference;

// A Bluetooth presentation timestamp includes the wireless transport queue.
// Keep that route bounded without treating its normal ~300 ms delay as an
// ever-growing engine backlog. Local and unknown routes keep the caller's cap.
const WIRELESS_LATENCY_LIMIT_MS: u64 = 500;
const MAX_OUTPUT_ROUTES: usize = 128;

#[derive(Default)]
struct OutputRoutes {
    default_wireless: bool,
    wireless_ids: Vec<i32>,
}

impl OutputRoutes {
    fn new(default_wireless: bool, ids: &[i32]) -> Self {
        let mut wireless_ids: Vec<_> = ids
            .iter()
            .copied()
            .filter(|id| *id > 0)
            .take(MAX_OUTPUT_ROUTES)
            .collect();
        wireless_ids.sort_unstable();
        wireless_ids.dedup();
        Self {
            default_wireless,
            wireless_ids,
        }
    }

    fn latency_recoverable(&self, name: &str, latency: u64, limit: u64) -> bool {
        // A default Bluetooth stream can keep calling back with its old
        // presentation queue while Android moves media to the speaker.
        // Reopen through the existing cooldown rather than accepting that
        // unsafe queue or waiting for Java's later route notification.
        name == "aaudio:-1" && self.default_wireless && latency > limit
    }

    fn latency_limit_ms(&self, name: &str, local_limit_ms: u64) -> u64 {
        let wireless = name
            .strip_prefix("aaudio:")
            .and_then(|id| id.parse::<i32>().ok())
            .is_some_and(|id| {
                if id == -1 {
                    self.default_wireless
                } else {
                    self.wireless_ids.binary_search(&id).is_ok()
                }
            });
        if wireless {
            local_limit_ms.max(WIRELESS_LATENCY_LIMIT_MS)
        } else {
            local_limit_ms
        }
    }
}

#[cfg(target_os = "android")]
static OUTPUT_ROUTES: std::sync::Mutex<OutputRoutes> = std::sync::Mutex::new(OutputRoutes {
    default_wireless: false,
    wireless_ids: Vec::new(),
});

/// Publish Android's media-route prediction and connected wireless device IDs.
/// Called by the host off the audio callback; no names or addresses are kept.
#[cfg(target_os = "android")]
pub fn set_output_routes(default_wireless: bool, wireless_ids: &[i32]) {
    let routes = OutputRoutes::new(default_wireless, wireless_ids);
    *OUTPUT_ROUTES
        .lock()
        .unwrap_or_else(|error| error.into_inner()) = routes;
}

/// Wait only after the old callback has joined. Android removes Bluetooth
/// profiles in stages, so reopening immediately can select the dying route.
/// The deadline bounds a missing route notification; Stop cancels the wait.
pub(super) fn wait_for_route_transition(
    mut wireless: impl FnMut() -> bool,
    cancelled: impl Fn() -> bool,
    timeout: std::time::Duration,
) -> Result<(), super::DevicePlaybackError> {
    let deadline = std::time::Instant::now() + timeout;
    while wireless() {
        if cancelled() {
            return Err(super::DevicePlaybackError::Cancelled);
        }
        if std::time::Instant::now() >= deadline {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(10));
    }
    Ok(())
}

#[cfg(target_os = "android")]
pub(super) fn default_wireless() -> bool {
    OUTPUT_ROUTES
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .default_wireless
}

/// A wireless queue refusal can be a route transition before Android's
/// route callback arrives. The producer's existing recycle cooldown bounds
/// recovery; the latency ceiling itself is unchanged.
#[cfg(target_os = "android")]
pub(super) fn latency_recoverable(name: &str, latency: u64, limit: u64) -> bool {
    OUTPUT_ROUTES
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .latency_recoverable(name, latency, limit)
}

/// Used only by producer-side health checks. The audio callback never takes
/// this lock, queries Java or changes its playback clock for a route change.
#[cfg(target_os = "android")]
pub(super) fn latency_limit_ms(name: &str, local_limit_ms: u64) -> u64 {
    OUTPUT_ROUTES
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .latency_limit_ms(name, local_limit_ms)
}

pub(super) fn buffer_size(
    preference: AudioBufferPreference,
    resolved: u32,
    env_override: bool,
) -> cpal::BufferSize {
    if preference == AudioBufferPreference::Auto && !env_override {
        cpal::BufferSize::Default
    } else {
        cpal::BufferSize::Fixed(resolved)
    }
}

/// AAudio may decline low-latency mode while still opening a usable stream.
/// This is CPAL's advisory notification, not an xrun or a device failure.
pub(super) fn advisory_error(kind: cpal::ErrorKind) -> bool {
    kind == cpal::ErrorKind::RealtimeDenied
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn route_wait_finishes_when_the_local_route_arrives() {
        let mut polls = 0;
        wait_for_route_transition(
            || {
                polls += 1;
                polls < 3
            },
            || false,
            std::time::Duration::from_secs(1),
        )
        .unwrap();
        assert_eq!(polls, 3);
    }

    #[test]
    fn route_wait_is_cancelled_without_opening_a_replacement() {
        assert!(matches!(
            wait_for_route_transition(|| true, || true, std::time::Duration::from_secs(1)),
            Err(super::super::DevicePlaybackError::Cancelled)
        ));
    }

    #[test]
    fn missing_route_notification_has_a_bounded_wait() {
        wait_for_route_transition(|| true, || false, std::time::Duration::ZERO).unwrap();
        wait_for_route_transition(|| false, || false, std::time::Duration::from_secs(1)).unwrap();
    }

    #[test]
    fn only_an_over_limit_default_wireless_queue_gets_a_recovery_attempt() {
        let wireless = OutputRoutes::new(true, &[7]);
        let local = OutputRoutes::new(false, &[7]);
        assert!(wireless.latency_recoverable("aaudio:-1", 501, 500));
        assert!(!wireless.latency_recoverable("aaudio:-1", 500, 500));
        assert!(!wireless.latency_recoverable("aaudio:-1", 501, 1000));
        assert!(!local.latency_recoverable("aaudio:-1", 501, 250));
        for name in ["aaudio:7", "silent-output", "wasapi:7"] {
            assert!(!wireless.latency_recoverable(name, 501, 250));
        }
    }

    #[test]
    fn wireless_allowance_follows_the_selected_route_not_just_a_connected_headset() {
        let local = OutputRoutes::new(false, &[7, 12, 7, -1, 0]);
        let wireless_default = OutputRoutes::new(true, &[7, 12]);
        for (name, local_expected, wireless_expected) in [
            ("aaudio:-1", 250, 500),
            ("aaudio:7", 500, 500),
            ("aaudio:12", 500, 500),
            ("aaudio:3", 250, 250),
            ("aaudio:0", 250, 250),
            ("aaudio:missing", 250, 250),
            ("silent-output", 250, 250),
            ("wasapi:7", 250, 250),
        ] {
            assert_eq!(local.latency_limit_ms(name, 250), local_expected, "{name}");
            assert_eq!(
                wireless_default.latency_limit_ms(name, 250),
                wireless_expected,
                "{name}"
            );
        }
        assert_eq!(wireless_default.latency_limit_ms("aaudio:-1", 2000), 2000);
        assert_eq!(
            OutputRoutes::default().latency_limit_ms("aaudio:-1", 250),
            250
        );
    }

    #[test]
    fn route_inventory_is_bounded_and_invalid_ids_cannot_match_the_default() {
        let routes = OutputRoutes::new(false, &(1..=1000).collect::<Vec<_>>());
        assert_eq!(routes.wireless_ids.len(), MAX_OUTPUT_ROUTES);
        assert_eq!(routes.latency_limit_ms("aaudio:128", 250), 500);
        assert_eq!(routes.latency_limit_ms("aaudio:129", 250), 250);
        assert_eq!(routes.latency_limit_ms("aaudio:-1", 250), 250);
    }
    #[test]
    fn automatic_mode_lets_aaudio_select_its_native_burst() {
        assert_eq!(
            buffer_size(AudioBufferPreference::Auto, 128, false),
            cpal::BufferSize::Default
        );
        assert_eq!(
            buffer_size(AudioBufferPreference::Auto, 384, true),
            cpal::BufferSize::Fixed(384)
        );
        for (preference, frames) in [
            (AudioBufferPreference::LowLatency, 128),
            (AudioBufferPreference::Balanced, 256),
            (AudioBufferPreference::Safe, 2048),
            (AudioBufferPreference::Frames(257), 257),
        ] {
            assert_eq!(
                buffer_size(preference, frames, false),
                cpal::BufferSize::Fixed(frames)
            );
        }
    }
    #[test]
    fn a_denied_low_latency_request_is_advisory_but_device_failures_are_not() {
        assert!(advisory_error(cpal::ErrorKind::RealtimeDenied));
        assert!(!advisory_error(cpal::ErrorKind::DeviceNotAvailable));
        assert!(!advisory_error(cpal::ErrorKind::StreamInvalidated));
        assert!(!advisory_error(cpal::ErrorKind::BackendError));
        assert!(!advisory_error(cpal::ErrorKind::Xrun));
    }
}
