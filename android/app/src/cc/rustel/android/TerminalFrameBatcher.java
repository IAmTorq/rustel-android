package cc.rustel.android;

import java.io.ByteArrayOutputStream;
import java.util.Arrays;

/** Coalesces synchronized terminal frames without dropping or rewriting bytes. */
final class TerminalFrameBatcher {
    private static final int MAX_BATCH_BYTES = 512 * 1024;
    private static final long BEGIN = 0x1b5b3f3230323668L;
    private static final long END = 0x1b5b3f323032366cL;
    private final ByteArrayOutputStream pending = new ByteArrayOutputStream();
    private long tail;
    private boolean synchronizedFrame;

    byte[] append(byte[] chunk) {
        int completed=0,offset=pending.size();
        for (int index=0;index<chunk.length;index++) {
            tail = (tail << 8) | (chunk[index] & 255L);
            if (tail == BEGIN) synchronizedFrame = true;
            else if (tail == END) {synchronizedFrame=false;completed=offset+index+1;}
        }
        pending.write(chunk, 0, chunk.length);
        // A malformed or unusually large frame must not retain unbounded data.
        // Native reads are at most 128 KiB, so pending retains under 640 KiB
        // of payload before emission. xterm preserves synchronization across
        // these bounded chunks if a frame exceeds the batching threshold.
        if (synchronizedFrame && pending.size() < MAX_BATCH_BYTES) {
            if(completed==0)return null;
            // A read may end inside the following frame. Deliver the finished
            // prefix now instead of waiting another whole frame for its end.
            byte[] bytes=pending.toByteArray();pending.reset();
            pending.write(bytes,completed,bytes.length-completed);
            return Arrays.copyOf(bytes,completed);
        }
        return finish();
    }

    byte[] finish() {
        if (pending.size() == 0) return null;
        byte[] bytes = pending.toByteArray();
        pending.reset();
        return bytes;
    }
}
