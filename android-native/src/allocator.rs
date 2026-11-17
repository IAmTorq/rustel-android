//! Match the desktop executable's allocator contract for live audio.
//! Keep the tripwire enabled: a system-allocator host must fail its probe.
#[global_allocator]
static AUDIO_CALLBACK_ALLOCATOR: rustel_audio::tripwire::TripwireAlloc =
    rustel_audio::tripwire::TripwireAlloc;

pub fn verify() -> bool {
    rustel_audio::tripwire::allocator_is_armed()
}
