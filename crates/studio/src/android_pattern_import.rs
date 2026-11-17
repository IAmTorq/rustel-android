//! A picked Android document returns to the native pattern importer, never the editor.
use crossterm::event::{KeyCode, KeyEvent, KeyEventKind, KeyModifiers};
use std::{path::PathBuf, sync::Mutex};

pub const DOWNLOADS: &str = "rustel:android-downloads";
const COMPLETE: char = '\u{f1000}';
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Mode {
    Import,
    Open,
}
#[derive(Debug, PartialEq, Eq)]
pub struct Document {
    pub path: PathBuf,
    pub name: String,
    pub mode: Mode,
}
static PENDING: Mutex<Option<Document>> = Mutex::new(None);

pub fn completion(key: &KeyEvent) -> bool {
    key.kind == KeyEventKind::Press
        && key.code == KeyCode::Char(COMPLETE)
        && key.modifiers == (KeyModifiers::CONTROL | KeyModifiers::SUPER)
}

pub fn submit(path: PathBuf, name: String, mode: Mode) -> bool {
    let mut pending = PENDING.lock().unwrap_or_else(|e| e.into_inner());
    if pending.is_some() {
        return false;
    }
    *pending = Some(Document { path, name, mode });
    if !crate::android_terminal::post_key(KeyEvent::new(
        KeyCode::Char(COMPLETE),
        KeyModifiers::CONTROL | KeyModifiers::SUPER,
    )) {
        *pending = None;
        return false;
    }
    true
}

pub fn take() -> Option<Document> {
    PENDING.lock().unwrap_or_else(|e| e.into_inner()).take()
}

#[cfg(target_os = "android")]
pub fn open_downloads(mode: Mode) -> Result<(), String> {
    use jni::{
        JavaVM,
        objects::{JObject, JValue},
    };
    let context = ndk_context::android_context();
    let vm = unsafe { JavaVM::from_raw(context.vm().cast()) }.map_err(|e| e.to_string())?;
    let mut env = vm.attach_current_thread().map_err(|e| e.to_string())?;
    let activity = unsafe { JObject::from_raw(context.context().cast()) };
    let result = env
        .call_method(
            &activity,
            "openPatternDownloads",
            "(Z)Z",
            &[JValue::Bool((mode == Mode::Open) as u8)],
        )
        .and_then(|v| v.z());
    if result.is_err() {
        let _ = env.exception_clear();
    }
    match result {
        Ok(true) => Ok(()),
        Ok(false) => Err("Downloads picker is already open or Rustel is closing".into()),
        Err(error) => Err(format!("Could not open Downloads: {error}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn document_completion_is_ordered_bounded_and_not_editor_text() {
        crate::android_terminal::configure(80, 24);
        assert!(submit(
            PathBuf::from("/cache/pattern-1.json"),
            "My export.json".into(),
            Mode::Import
        ));
        assert!(!submit(
            PathBuf::from("/cache/another.json"),
            "Another.json".into(),
            Mode::Open
        ));
        let crossterm::event::Event::Key(key) = crate::android_terminal::read().unwrap() else {
            panic!()
        };
        assert!(completion(&key));
        assert!(!completion(&KeyEvent::new(key.code, KeyModifiers::NONE)));
        assert!(!completion(&KeyEvent::new(KeyCode::Enter, key.modifiers)));
        assert_eq!(
            take().unwrap(),
            Document {
                path: PathBuf::from("/cache/pattern-1.json"),
                name: "My export.json".into(),
                mode: Mode::Import
            }
        );
        assert!(take().is_none());
        assert!(submit(
            PathBuf::from("/cache/open.json"),
            "Pad.strudel".into(),
            Mode::Open
        ));
        let crossterm::event::Event::Key(key) = crate::android_terminal::read().unwrap() else {
            panic!()
        };
        assert!(completion(&key));
        assert_eq!(take().unwrap().mode, Mode::Open);
        crate::android_terminal::send(&vec![b'x'; 4096]);
        assert!(!submit(
            PathBuf::from("/cache/full.json"),
            "Full.json".into(),
            Mode::Open
        ));
        assert!(take().is_none());
        crate::android_terminal::configure(80, 24);
        crate::android_terminal::close();
        assert!(!submit(
            PathBuf::from("/cache/closed.json"),
            "Closed.json".into(),
            Mode::Open
        ));
        assert!(take().is_none());
    }
}
