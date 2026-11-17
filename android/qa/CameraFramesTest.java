package cc.rustel.android;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;

public final class CameraFramesTest {
    private static void require(boolean value,String message) {
        if(!value)throw new AssertionError(message);
    }
    public static void main(String[] args) {
        CameraFrames frames=new CameraFrames();
        require(frames.after(0)==null,"empty feed has no frame");
        require(frames.ageNanos()<0,"empty feed has no age");
        byte[] first=new byte[20];frames.publish(first);
        int sequence=ByteBuffer.wrap(first).order(ByteOrder.LITTLE_ENDIAN).getInt(8);
        require(sequence!=0,"published sequence skips the sentinel");
        require(frames.after(0)==first,"first consumer receives the newest frame");
        require(frames.after(sequence)==null,"same consumer does not replay it");
        require(frames.after(0)==first,"another consumer reads independently");
        require(frames.ageNanos()>=0,"live frame has monotonic age");
        byte[] second=new byte[20];frames.publish(second);
        require(frames.after(sequence)==second,"newest frame replaces the old one");
        frames.clear();
        require(frames.after(sequence)==null&&frames.ageNanos()<0,"clear removes image and age");
        long previous=0;
        for(int i=0;i<60;i++){
            long now=1_000_000_000L+i*33_333_333L+(i%2==0?0:-1_000_000L);
            require(CameraFrames.captureDue(previous,now),"ordinary jitter must not discard a 30-fps frame");
            previous=now;
        }
        require(!CameraFrames.captureDue(previous,previous+1_000_000L),"queued burst is not a fresh interval");
        require(CameraFrames.captureDue(previous,previous+200_000_000L),"long stall accepts the newest frame");
        int accepted=0;previous=0;
        for(int i=0;i<120;i++){
            long now=1_000_000_000L+i*16_666_667L;
            if(CameraFrames.captureDue(previous,now)){accepted++;previous=now;}
        }
        require(accepted==60,"60-fps input remains bounded to 30 conversions per second");
        System.out.println("PASS: newest frame, independent consumers, age, 30-fps jitter and bounded 60-fps input");
    }
}
