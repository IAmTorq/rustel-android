//! The embedded Android view has no controlling Unix terminal. Its input
//! arrives as complete WebView/JNI messages, and dimensions are supplied by
//! the view. Never inspect Android's process stdio, raw mode or tty signals.
use crossterm::event::{
    Event, KeyCode, KeyEvent, KeyEventKind, KeyEventState, KeyModifiers, MouseButton, MouseEvent,
    MouseEventKind,
};
use std::{
    collections::VecDeque,
    io,
    sync::{Condvar, Mutex, OnceLock},
    time::Duration,
};

const MAX_EVENTS: usize = 4096;
const MAX_PASTE: usize = 4 * 1024 * 1024;
#[derive(Default)]
struct Input {
    events: VecDeque<Event>,
    paste: Option<String>,
    closed: bool,
    cols: u16,
    rows: u16,
    reference: [u16; 4],
    repaint: bool,
}
static INPUT: OnceLock<(Mutex<Input>, Condvar)> = OnceLock::new();
fn input() -> &'static (Mutex<Input>, Condvar) {
    INPUT.get_or_init(|| (Mutex::new(Input::default()), Condvar::new()))
}
pub fn configure(cols: u16, rows: u16) {
    let (lock, wake) = input();
    let mut state = lock.lock().unwrap_or_else(|e| e.into_inner());
    *state = Input {
        cols: cols.clamp(60, 500),
        rows: rows.clamp(10, 500),
        ..Input::default()
    };
    wake.notify_all();
}
/// A size round trip may reflow xterm even when the next frame has its old size.
/// Consume the resize invalidation independently of the current dimensions.
pub fn take_repaint() -> bool {
    let mut state = input().0.lock().unwrap_or_else(|e| e.into_inner());
    std::mem::take(&mut state.repaint)
}
pub fn dimensions() -> (u16, u16) {
    let state = input().0.lock().unwrap_or_else(|e| e.into_inner());
    (state.cols.max(60), state.rows.max(10))
}
// Published by Studio after drawing; queried once at the start of a touch.
pub fn set_reference_region(region: [u16; 4]) {
    input()
        .0
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .reference = region;
}
pub fn reference_region() -> [u16; 4] {
    let state = input().0.lock().unwrap_or_else(|e| e.into_inner());
    if state.closed {
        [0; 4]
    } else {
        state.reference
    }
}
pub fn resize(cols: u16, rows: u16) {
    let (lock, wake) = input();
    let mut state = lock.lock().unwrap_or_else(|e| e.into_inner());
    let size = (cols.clamp(60, 500), rows.clamp(10, 500));
    if (state.cols, state.rows) != size {
        state.cols = size.0;
        state.rows = size.1;
        state.repaint = true;
        push(&mut state, Event::Resize(size.0, size.1));
        wake.notify_all();
    }
}
pub fn close() {
    let (lock, wake) = input();
    lock.lock().unwrap_or_else(|e| e.into_inner()).closed = true;
    wake.notify_all();
}
pub fn closed() -> bool {
    input().0.lock().unwrap_or_else(|e| e.into_inner()).closed
}
pub fn poll(wait: Duration) -> io::Result<bool> {
    let (lock, wake) = input();
    let state = lock.lock().unwrap_or_else(|e| e.into_inner());
    if !state.events.is_empty() {
        return Ok(true);
    }
    if state.closed || wait.is_zero() {
        return Ok(false);
    }
    let (state, _) = wake
        .wait_timeout_while(state, wait, |s| s.events.is_empty() && !s.closed)
        .unwrap_or_else(|e| e.into_inner());
    Ok(!state.events.is_empty())
}
pub fn read() -> io::Result<Event> {
    let (lock, wake) = input();
    let mut state = lock.lock().unwrap_or_else(|e| e.into_inner());
    loop {
        if let Some(event) = state.events.pop_front() {
            return Ok(event);
        }
        if state.closed {
            return Err(io::ErrorKind::BrokenPipe.into());
        }
        state = wake.wait(state).unwrap_or_else(|e| e.into_inner());
    }
}
fn push(state: &mut Input, event: Event) {
    // A pasted score is one event. High-rate pointer moves are coalesced;
    // malformed or excessive input cannot grow an unbounded native queue.
    if matches!(
        &event,
        Event::Mouse(MouseEvent {
            kind: MouseEventKind::Moved,
            ..
        })
    ) && matches!(
        state.events.back(),
        Some(Event::Mouse(MouseEvent {
            kind: MouseEventKind::Moved,
            ..
        }))
    ) {
        state.events.pop_back();
    }
    if state.events.len() < MAX_EVENTS {
        state.events.push_back(event);
    }
}
/// Ordered completion for a document picker. Refuse rather than lose a payload.
pub fn post_key(key: KeyEvent) -> bool {
    let (lock, wake) = input();
    let mut state = lock.lock().unwrap_or_else(|e| e.into_inner());
    if state.closed || state.events.len() >= MAX_EVENTS {
        return false;
    }
    state.events.push_back(Event::Key(key));
    wake.notify_all();
    true
}
fn modifiers(bits: u32) -> KeyModifiers {
    let mut m = KeyModifiers::NONE;
    for (bit, flag) in [
        (1, KeyModifiers::SHIFT),
        (2, KeyModifiers::ALT),
        (4, KeyModifiers::CONTROL),
        (8, KeyModifiers::SUPER),
        (16, KeyModifiers::HYPER),
        (32, KeyModifiers::META),
    ] {
        if bits & bit != 0 {
            m |= flag
        }
    }
    m
}
fn kitty_code(code: u32) -> Option<KeyCode> {
    Some(match code {
        27 => KeyCode::Esc,
        13 => KeyCode::Enter,
        9 => KeyCode::Tab,
        127 => KeyCode::Backspace,
        57348 => KeyCode::Insert,
        57349 => KeyCode::Delete,
        57350 => KeyCode::Left,
        57351 => KeyCode::Right,
        57352 => KeyCode::Up,
        57353 => KeyCode::Down,
        57354 => KeyCode::PageUp,
        57355 => KeyCode::PageDown,
        57356 => KeyCode::Home,
        57357 => KeyCode::End,
        57364..=57375 => KeyCode::F((code - 57363) as u8),
        _ => KeyCode::Char(char::from_u32(code)?),
    })
}
fn csi(sequence: &str) -> Option<Event> {
    let final_byte = sequence.chars().last()?;
    let body = &sequence[..sequence.len() - 1];
    if final_byte == 'u' {
        let mut fields = body.split(';');
        let code = fields.next()?.split(':').next()?.parse().ok()?;
        let mut detail = fields.next().unwrap_or("1").split(':');
        let mask: u32 = detail.next()?.parse().ok()?;
        let kind = match detail.next().unwrap_or("1") {
            "2" => KeyEventKind::Repeat,
            "3" => KeyEventKind::Release,
            _ => KeyEventKind::Press,
        };
        let modifiers = modifiers(mask.saturating_sub(1));
        let code = match kitty_code(code)? {
            KeyCode::Tab if modifiers.contains(KeyModifiers::SHIFT) => KeyCode::BackTab,
            code => code,
        };
        return Some(Event::Key(KeyEvent {
            code,
            modifiers,
            kind,
            state: KeyEventState::NONE,
        }));
    }
    if (final_byte == 'M' || final_byte == 'm') && body.starts_with('<') {
        let values = body[1..]
            .split(';')
            .map(str::parse::<u16>)
            .collect::<Result<Vec<_>, _>>()
            .ok()?;
        if values.len() != 3 {
            return None;
        }
        let flags = values[0];
        let button = match flags & 3 {
            0 => MouseButton::Left,
            1 => MouseButton::Middle,
            _ => MouseButton::Right,
        };
        let kind = if flags & 64 != 0 {
            match flags & 3 {
                0 => MouseEventKind::ScrollUp,
                1 => MouseEventKind::ScrollDown,
                2 => MouseEventKind::ScrollLeft,
                _ => MouseEventKind::ScrollRight,
            }
        } else if final_byte == 'm' {
            MouseEventKind::Up(button)
        } else if flags & 32 != 0 {
            if flags & 3 == 3 {
                MouseEventKind::Moved
            } else {
                MouseEventKind::Drag(button)
            }
        } else {
            MouseEventKind::Down(button)
        };
        let mask = ((flags & 4 != 0) as u32)
            | (((flags & 8 != 0) as u32) << 1)
            | (((flags & 16 != 0) as u32) << 2);
        // The WebView adds bit 256 to vertical two-finger scroll reports.
        // Keep them distinguishable from a physical wheel through Crossterm.
        let mut modifiers = modifiers(mask);
        if final_byte == 'M' && matches!(flags, 320 | 321) {
            modifiers |= KeyModifiers::HYPER;
        }
        return Some(Event::Mouse(MouseEvent {
            kind,
            column: values[1].saturating_sub(1),
            row: values[2].saturating_sub(1),
            modifiers,
        }));
    }
    if sequence == "I" {
        return Some(Event::FocusGained);
    }
    if sequence == "O" {
        return Some(Event::FocusLost);
    }
    let mask = body
        .split(';')
        .nth(1)
        .and_then(|s| s.parse::<u32>().ok())
        .unwrap_or(1)
        .saturating_sub(1);
    let code = match final_byte {
        'A' => KeyCode::Up,
        'B' => KeyCode::Down,
        'C' => KeyCode::Right,
        'D' => KeyCode::Left,
        'H' => KeyCode::Home,
        'F' => KeyCode::End,
        'Z' => KeyCode::BackTab,
        '~' => match body.split(';').next()?.parse::<u16>().ok()? {
            1 | 7 => KeyCode::Home,
            2 => KeyCode::Insert,
            3 => KeyCode::Delete,
            4 | 8 => KeyCode::End,
            5 => KeyCode::PageUp,
            6 => KeyCode::PageDown,
            11 => KeyCode::F(1),
            12 => KeyCode::F(2),
            13 => KeyCode::F(3),
            14 => KeyCode::F(4),
            15 => KeyCode::F(5),
            17 => KeyCode::F(6),
            18 => KeyCode::F(7),
            19 => KeyCode::F(8),
            20 => KeyCode::F(9),
            21 => KeyCode::F(10),
            23 => KeyCode::F(11),
            24 => KeyCode::F(12),
            _ => return None,
        },
        _ => return None,
    };
    Some(Event::Key(KeyEvent::new(code, modifiers(mask))))
}
pub fn send(bytes: &[u8]) {
    let Ok(text) = std::str::from_utf8(bytes) else {
        return;
    };
    let (lock, wake) = input();
    let mut state = lock.lock().unwrap_or_else(|e| e.into_inner());
    if state.closed {
        return;
    }
    let mut rest = text;
    while !rest.is_empty() {
        if let Some(paste) = state.paste.as_mut() {
            if let Some(end) = rest.find("\x1b[201~") {
                if paste.len() + end <= MAX_PASTE {
                    paste.push_str(&rest[..end]);
                }
                if let Some(paste) = state.paste.take() {
                    push(&mut state, Event::Paste(paste));
                }
                rest = &rest[end + 6..];
                continue;
            }
            if paste.len() + rest.len() <= MAX_PASTE {
                paste.push_str(rest);
            }
            break;
        }
        if let Some(after) = rest.strip_prefix("\x1b[200~") {
            state.paste = Some(String::new());
            rest = after;
            continue;
        }
        if let Some(after) = rest.strip_prefix("\x1b[") {
            if let Some(end) = after.bytes().position(|b| (0x40..=0x7e).contains(&b)) {
                if let Some(event) = csi(&after[..end + 1]) {
                    push(&mut state, event)
                }
                rest = &after[end + 1..];
                continue;
            }
            break;
        }
        if let Some(after) = rest.strip_prefix("\x1bO")
            && let Some(ch) = after.chars().next()
        {
            let code = match ch {
                'P' => Some(KeyCode::F(1)),
                'Q' => Some(KeyCode::F(2)),
                'R' => Some(KeyCode::F(3)),
                'S' => Some(KeyCode::F(4)),
                _ => None,
            };
            if let Some(code) = code {
                push(
                    &mut state,
                    Event::Key(KeyEvent::new(code, KeyModifiers::NONE)),
                )
            }
            rest = &after[ch.len_utf8()..];
            continue;
        }
        let Some(ch) = rest.chars().next() else {
            break;
        };
        rest = &rest[ch.len_utf8()..];
        let (code, mask) = match ch {
            '\r' | '\n' => (KeyCode::Enter, KeyModifiers::NONE),
            '\t' => (KeyCode::Tab, KeyModifiers::NONE),
            '\x1b' => (KeyCode::Esc, KeyModifiers::NONE),
            '\x7f' | '\x08' => (KeyCode::Backspace, KeyModifiers::NONE),
            '\0' => (KeyCode::Char(' '), KeyModifiers::CONTROL),
            '\x01'..='\x1a' => (
                KeyCode::Char(char::from(ch as u8 + b'a' - 1)),
                KeyModifiers::CONTROL,
            ),
            _ => (KeyCode::Char(ch), KeyModifiers::NONE),
        };
        push(&mut state, Event::Key(KeyEvent::new(code, mask)));
    }
    wake.notify_all();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn touch_scroll_is_distinct_from_a_mouse_wheel() {
        for (flags, kind, modifiers) in [
            (320, MouseEventKind::ScrollUp, KeyModifiers::HYPER),
            (321, MouseEventKind::ScrollDown, KeyModifiers::HYPER),
            (64, MouseEventKind::ScrollUp, KeyModifiers::NONE),
            (65, MouseEventKind::ScrollDown, KeyModifiers::NONE),
        ] {
            assert_eq!(
                csi(&format!("<{flags};41;3M")),
                Some(Event::Mouse(MouseEvent {
                    kind,
                    column: 40,
                    row: 2,
                    modifiers,
                }))
            );
        }
    }

    #[test]
    fn shifted_tabs_match_desktop_backtab_events() {
        for (sequence, expected_modifiers) in [
            ("9;2u", KeyModifiers::SHIFT),
            ("9;6:2u", KeyModifiers::SHIFT | KeyModifiers::CONTROL),
        ] {
            let Some(Event::Key(key)) = csi(sequence) else {
                panic!("expected a key event for {sequence}");
            };
            assert_eq!(key.code, KeyCode::BackTab);
            assert_eq!(key.modifiers, expected_modifiers);
        }
        let Some(Event::Key(key)) = csi("9;1u") else {
            panic!("expected an unmodified tab");
        };
        assert_eq!(key.code, KeyCode::Tab);
        assert_eq!(key.modifiers, KeyModifiers::NONE);
    }
    #[test]
    fn embedded_input_and_waits() {
        configure(76, 24);
        assert_eq!(reference_region(), [0; 4]);
        set_reference_region([40, 2, 36, 20]);
        assert_eq!(reference_region(), [40, 2, 36, 20]);
        send(b"\x1b[<65;41;3M\x1b[<64;41;3M");
        for expected in [MouseEventKind::ScrollDown, MouseEventKind::ScrollUp] {
            let Event::Mouse(mouse) = read().unwrap() else {
                panic!()
            };
            assert_eq!(mouse.kind, expected);
            assert_eq!((mouse.column, mouse.row), (40, 2));
        }
        set_reference_region([0; 4]);
        assert_eq!(reference_region(), [0; 4]);

        send(b"\x1b[13;5:1u\x1b[13;5:3u\x1b[983040;13u");
        let Event::Key(key) = read().unwrap() else {
            panic!()
        };
        assert_eq!(key.code, KeyCode::Enter);
        assert_eq!(key.modifiers, KeyModifiers::CONTROL);
        let Event::Key(key) = read().unwrap() else {
            panic!()
        };
        assert_eq!(key.kind, KeyEventKind::Release);
        let Event::Key(key) = read().unwrap() else {
            panic!()
        };
        assert_eq!(key.code, KeyCode::Char('\u{f0000}'));
        assert_eq!(key.modifiers, KeyModifiers::CONTROL | KeyModifiers::SUPER);
        send("é中\x0f\x1b[19~\x1b[I\x1b[O".as_bytes());
        for ch in ['é', '中'] {
            let Event::Key(key) = read().unwrap() else {
                panic!()
            };
            assert_eq!(key.code, KeyCode::Char(ch));
        }
        let Event::Key(key) = read().unwrap() else {
            panic!()
        };
        assert_eq!(key.code, KeyCode::Char('o'));
        assert_eq!(key.modifiers, KeyModifiers::CONTROL);
        let Event::Key(key) = read().unwrap() else {
            panic!()
        };
        assert_eq!(key.code, KeyCode::F(8));
        assert_eq!(read().unwrap(), Event::FocusGained);
        assert_eq!(read().unwrap(), Event::FocusLost);
        send(b"\x1b[200~note(\"c4\")\n");
        send(b"// paste\x1b[201~");
        assert_eq!(
            read().unwrap(),
            Event::Paste("note(\"c4\")\n// paste".into())
        );
        send(b"\x1b[<4;3;4M\x1b[<0;3;4m\x1b[<65;1;1M");
        let Event::Mouse(mouse) = read().unwrap() else {
            panic!()
        };
        assert_eq!(mouse.kind, MouseEventKind::Down(MouseButton::Left));
        assert_eq!((mouse.column, mouse.row), (2, 3));
        assert_eq!(mouse.modifiers, KeyModifiers::SHIFT);
        let Event::Mouse(mouse) = read().unwrap() else {
            panic!()
        };
        assert_eq!(mouse.kind, MouseEventKind::Up(MouseButton::Left));
        let Event::Mouse(mouse) = read().unwrap() else {
            panic!()
        };
        assert_eq!(mouse.kind, MouseEventKind::ScrollDown);
        resize(80, 28);
        assert_eq!(dimensions(), (80, 28));
        assert_eq!(read().unwrap(), Event::Resize(80, 28));
        assert!(take_repaint());
        assert!(!take_repaint());
        resize(80, 24);
        resize(80, 28);
        assert_eq!(dimensions(), (80, 28));
        assert!(take_repaint(), "a size round trip still needs a full frame");
        assert!(!take_repaint());
        assert_eq!(read().unwrap(), Event::Resize(80, 24));
        assert_eq!(read().unwrap(), Event::Resize(80, 28));
        let before = std::time::Instant::now();
        assert!(!poll(Duration::from_millis(30)).unwrap());
        assert!(before.elapsed() >= Duration::from_millis(25));
        let notifier = std::thread::spawn(|| {
            std::thread::sleep(Duration::from_millis(20));
            send(b"a")
        });
        assert!(poll(Duration::from_secs(1)).unwrap());
        notifier.join().unwrap();
        read().unwrap();
        send(&vec![b'x'; MAX_EVENTS * 2]);
        assert_eq!(input().0.lock().unwrap().events.len(), MAX_EVENTS);
        configure(76, 24);
        send(&[0xff]);
        assert!(!poll(Duration::ZERO).unwrap());
        close();
        assert!(closed());
        assert!(read().is_err());
        assert!(!poll(Duration::from_secs(1)).unwrap());
    }
}
