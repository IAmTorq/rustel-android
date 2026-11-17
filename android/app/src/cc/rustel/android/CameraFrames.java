package cc.rustel.android;

import java.nio.*;
import java.util.List;

/** One latest frame, shared independently by theme and Hydra consumers. */
final class CameraFrames {
    private static final long FRAME_INTERVAL_NANOS=1_000_000_000L/30;
    // Real 30-fps callbacks jitter around their nominal period. A strict
    // integer-millisecond cutoff drops a frame whenever one arrives early.
    private static final long CALLBACK_JITTER_NANOS=4_000_000L;
    private volatile byte[] latest;
    private volatile long publishedAtNanos;
    private int sequence;
    // Called only by the camera worker. Never queue old pictures behind the UI.
    void publish(byte[] bytes) {
        if(++sequence==0)++sequence;
        ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).putInt(8,sequence);
        publishedAtNanos=System.nanoTime();
        latest=bytes;
    }
    byte[] after(int previous) {
        byte[] bytes=latest;
        return bytes==null || ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).getInt(8)==previous ? null : bytes;
    }
    void clear() { latest=null; }
    long ageNanos() { return latest==null ? -1 : Math.max(0,System.nanoTime()-publishedAtNanos); }
    static boolean captureDue(long previous,long now) {
        return previous==0 || now-previous>=FRAME_INTERVAL_NANOS-CALLBACK_JITTER_NANOS;
    }
    static int[] previewRate(List<int[]> ranges) {
        if(ranges==null)return null;
        int[] best=null;long score=Long.MAX_VALUE;
        for(int[] range:ranges){
            if(range==null || range.length<2 || range[0]<=0 || range[1]<range[0])continue;
            // Prefer fixed 30 fps; otherwise the advertised range closest to it.
            long candidate=Math.abs((long)range[1]-30000)*4+Math.abs((long)range[0]-30000);
            if(candidate<score){score=candidate;best=range;}
        }
        return best;
    }
}
