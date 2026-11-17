//! Android keeps video in the studio dock rather than creating desktop windows.
use super::App;
pub(super) struct VideoWindow;
pub fn needs_the_main_thread() -> bool {
    false
}
pub fn pump_main() {}
impl App {
    pub(super) fn toggle_video_window(&mut self) {
        self.status = "Android plays video in the dock; detached windows need a desktop".into();
        self.dirty_frame = true;
    }
    pub(super) fn pump_video_window(&mut self) {}
    pub(super) fn detached_video_feeds(&self) -> Vec<String> {
        Vec::new()
    }
}
