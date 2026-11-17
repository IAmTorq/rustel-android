//! Ordered phone actions share the terminal input stream with typed text.
//! No action can overtake a preceding edit on a separate JNI command queue.
use crate::keybinds::BindAction;
use crossterm::event::{KeyCode, KeyEvent, KeyEventKind, KeyModifiers};
use std::sync::{
    Mutex,
    atomic::{AtomicBool, Ordering},
};
pub const ACTION_BASE: u32 = 0xF0000;
static PIANO: AtomicBool = AtomicBool::new(false);
type UiPalette = ([ratatui::style::Color; 10], String);
static UI_PALETTE: Mutex<Option<UiPalette>> = Mutex::new(None);

/// Publish resolved theme colors without allocating on unchanged render frames.
pub fn update_ui_palette(theme: &crate::theme::Theme) {
    let colors = [
        theme.background,
        theme.surface,
        theme.overlay,
        theme.foreground,
        theme.muted,
        theme.rule,
        theme.accent,
        theme.selection,
        theme.selection_text,
        theme.warn,
    ];
    let mut current = UI_PALETTE.lock().unwrap_or_else(|e| e.into_inner());
    if current
        .as_ref()
        .is_some_and(|(previous, _)| *previous == colors)
    {
        return;
    }
    let names = [
        "background",
        "surface",
        "overlay",
        "foreground",
        "muted",
        "rule",
        "accent",
        "selection",
        "selectionText",
        "warn",
    ];
    let document: serde_json::Map<String, serde_json::Value> = names
        .into_iter()
        .zip(colors)
        .map(|(name, color)| {
            let (r, g, b) = crate::graphics::rgb(color);
            (name.to_owned(), format!("#{r:02x}{g:02x}{b:02x}").into())
        })
        .collect();
    *current = Some((colors, serde_json::Value::Object(document).to_string()));
}

pub fn ui_palette_json() -> String {
    UI_PALETTE
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .as_ref()
        .map_or_else(|| "{}".to_owned(), |(_, document)| document.clone())
}
pub fn set_piano(on: bool) {
    PIANO.store(on, Ordering::Release);
}
pub fn piano() -> bool {
    PIANO.load(Ordering::Acquire)
}
pub fn actions_json() -> String {
    serde_json::to_string(&BindAction::ALL.iter().enumerate().map(|(index,action)|{
        serde_json::json!({"key":action.key(),"label":action.label(),"token":ACTION_BASE+index as u32})
    }).collect::<Vec<_>>()).unwrap_or_else(|_|"[]".into())
}
pub fn action(event: &KeyEvent) -> Option<BindAction> {
    if event.kind != KeyEventKind::Press
        || event.modifiers != (KeyModifiers::CONTROL | KeyModifiers::SUPER)
    {
        return None;
    }
    let KeyCode::Char(character) = event.code else {
        return None;
    };
    BindAction::ALL
        .get((character as u32).checked_sub(ACTION_BASE)? as usize)
        .copied()
}

#[cfg(test)]
mod tests {
    use super::*;
    use ratatui::style::Color;

    #[test]
    fn ui_palette_tracks_resolved_colors_and_reuses_unchanged_document() {
        let mut theme = crate::theme::Theme {
            background: Color::Indexed(196),
            foreground: Color::White,
            accent: Color::Rgb(12, 34, 56),
            ..Default::default()
        };
        update_ui_palette(&theme);
        let first: serde_json::Value = serde_json::from_str(&ui_palette_json()).unwrap();
        assert_eq!(first["background"], "#ff0000");
        assert_eq!(first["foreground"], "#ffffff");
        assert_eq!(first["accent"], "#0c2238");
        let allocation = UI_PALETTE.lock().unwrap().as_ref().unwrap().1.as_ptr() as usize;
        update_ui_palette(&theme);
        assert_eq!(
            UI_PALETTE.lock().unwrap().as_ref().unwrap().1.as_ptr() as usize,
            allocation
        );
        theme.accent = Color::Cyan;
        update_ui_palette(&theme);
        let next: serde_json::Value = serde_json::from_str(&ui_palette_json()).unwrap();
        assert_eq!(next["accent"], "#11a8cd");
        assert_eq!(next["background"], first["background"]);
    }
}
