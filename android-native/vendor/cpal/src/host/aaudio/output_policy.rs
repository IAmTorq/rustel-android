//! Large explicit callbacks choose buffered output rather than the fast mixer.
//! Automatic and sub-1024-frame callbacks retain the low-latency path.

pub(crate) fn buffered_output_frames(fixed_callback_frames: Option<u32>) -> Option<i32> {
    fixed_callback_frames
        .filter(|frames| *frames >= 1024)
        .map(|frames| frames.saturating_mul(2).min(i32::MAX as u32) as i32)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn automatic_and_small_callbacks_keep_low_latency() {
        for frames in [None, Some(32), Some(256), Some(512), Some(1023)] {
            assert_eq!(buffered_output_frames(frames), None);
        }
    }

    #[test]
    fn buffered_output_requests_two_callback_periods() {
        assert_eq!(buffered_output_frames(Some(1024)), Some(2048));
        assert_eq!(buffered_output_frames(Some(2048)), Some(4096));
    }

    #[test]
    fn queue_size_cannot_overflow_the_native_frame_count() {
        assert_eq!(buffered_output_frames(Some(u32::MAX)), Some(i32::MAX));
    }
}
