package cc.rustel.android;

import android.view.KeyEvent;

/** Android's configured key map supplies symbol characters; Ctrl stays a modifier. */
final class KeyboardInput {
    static String name(KeyEvent event) {
        switch(event.getKeyCode()) {
            case KeyEvent.KEYCODE_ENTER:case KeyEvent.KEYCODE_NUMPAD_ENTER:return "Enter";
            case KeyEvent.KEYCODE_TAB:return "Tab";
            case KeyEvent.KEYCODE_ESCAPE:return "Escape";
            case KeyEvent.KEYCODE_DEL:return "Backspace";
            case KeyEvent.KEYCODE_FORWARD_DEL:return "Delete";
            case KeyEvent.KEYCODE_INSERT:return "Insert";
            case KeyEvent.KEYCODE_DPAD_LEFT:return "ArrowLeft";
            case KeyEvent.KEYCODE_DPAD_RIGHT:return "ArrowRight";
            case KeyEvent.KEYCODE_DPAD_UP:return "ArrowUp";
            case KeyEvent.KEYCODE_DPAD_DOWN:return "ArrowDown";
            case KeyEvent.KEYCODE_MOVE_HOME:return "Home";
            case KeyEvent.KEYCODE_MOVE_END:return "End";
            case KeyEvent.KEYCODE_PAGE_UP:return "PageUp";
            case KeyEvent.KEYCODE_PAGE_DOWN:return "PageDown";
        }
        int key=event.getKeyCode();
        if(key>=KeyEvent.KEYCODE_F1 && key<=KeyEvent.KEYCODE_F12)return "F"+(key-KeyEvent.KEYCODE_F1+1);
        if(event.isCtrlPressed() && key>=KeyEvent.KEYCODE_A && key<=KeyEvent.KEYCODE_Z)return Character.toString((char)('a'+key-KeyEvent.KEYCODE_A));
        int unicode=event.getUnicodeChar(event.getMetaState() & ~KeyEvent.META_CTRL_MASK);
        return unicode>0 && (unicode&Integer.MIN_VALUE)==0 ? new String(Character.toChars(unicode)) : null;
    }
    static boolean navigation(KeyEvent event) {
        int key=event.getKeyCode();
        return key==KeyEvent.KEYCODE_DPAD_LEFT||key==KeyEvent.KEYCODE_DPAD_RIGHT||key==KeyEvent.KEYCODE_DPAD_UP||key==KeyEvent.KEYCODE_DPAD_DOWN
            ||key==KeyEvent.KEYCODE_MOVE_HOME||key==KeyEvent.KEYCODE_MOVE_END||key==KeyEvent.KEYCODE_PAGE_UP||key==KeyEvent.KEYCODE_PAGE_DOWN
            ||key==KeyEvent.KEYCODE_ESCAPE||key==KeyEvent.KEYCODE_FORWARD_DEL||key==KeyEvent.KEYCODE_INSERT||key==KeyEvent.KEYCODE_TAB
            ||(key>=KeyEvent.KEYCODE_F1&&key<=KeyEvent.KEYCODE_F12);
    }
}
