import java.lang.reflect.*;
import java.nio.*;
import java.util.*;
class test_camera {
    public static void main(String[] args) throws Exception {
        Class<?> camera=Class.forName("cc.rustel.android.CameraFeed");
        Method rgba=camera.getDeclaredMethod("rgba",byte[].class,int.class,int.class,int.class);
        rgba.setAccessible(true);
        byte[] frame=new byte[]{16,40,70,100,(byte)130,(byte)170,(byte)200,(byte)235,(byte)128,(byte)128,(byte)128,(byte)128};
        for(int rotation:new int[]{0,90,180,270}) {
            byte[] result=(byte[])rgba.invoke(null,frame,4,2,rotation);
            ByteBuffer header=ByteBuffer.wrap(result).order(ByteOrder.LITTLE_ENDIAN);
            int width=header.getInt(),height=header.getInt();
            if(width!=(rotation%180==0?4:2)||height!=(rotation%180==0?2:4)||result.length!=48)throw new AssertionError("Header");
            for(int y=0;y<2;y++)for(int x=0;x<4;x++) {
                int dx=x,dy=y;
                if(rotation==90){dx=1-y;dy=x;}else if(rotation==180){dx=3-x;dy=1-y;}else if(rotation==270){dx=y;dy=3-x;}
                int offset=16+(dy*width+dx)*4;
                int expected=Math.min(255,Math.max(0,(298*((frame[y*4+x]&255)-16)+128)>>8));
                for(int c=0;c<3;c++)if((result[offset+c]&255)!=expected)throw new AssertionError("Pixel mismatch");
                if((result[offset+3]&255)!=255)throw new AssertionError("Alpha");
            }
        }
        Class<?> mailbox=Class.forName("cc.rustel.android.CameraFrames");
        Constructor<?> constructor=mailbox.getDeclaredConstructor();constructor.setAccessible(true);
        Object box=constructor.newInstance();
        Method publish=mailbox.getDeclaredMethod("publish",byte[].class),after=mailbox.getDeclaredMethod("after",int.class),clear=mailbox.getDeclaredMethod("clear"),rate=mailbox.getDeclaredMethod("previewRate",List.class);
        for(Method method:new Method[]{publish,after,clear,rate})method.setAccessible(true);
        if(after.invoke(box,0)!=null)throw new AssertionError("Empty mailbox");
        byte[] first=new byte[16],second=new byte[16],third=new byte[16];
        publish.invoke(box,(Object)first);int serial=ByteBuffer.wrap(first).order(ByteOrder.LITTLE_ENDIAN).getInt(8);
        if(after.invoke(box,0)!=first || after.invoke(box,serial)!=null)throw new AssertionError("Duplicate frame");
        // Reading must not steal a picture from another theme/Hydra consumer.
        if(after.invoke(box,0)!=first)throw new AssertionError("Independent consumer");
        publish.invoke(box,(Object)second);publish.invoke(box,(Object)third);
        if(after.invoke(box,serial)!=third)throw new AssertionError("Must skip stale frames");
        clear.invoke(box);if(after.invoke(box,serial)!=null)throw new AssertionError("Cleared camera");
        int[] fixed={30000,30000},variable={15000,30000},slow={15000,15000};
        if(rate.invoke(null,Arrays.asList(slow,variable,fixed))!=fixed)throw new AssertionError("30 fps preference");
        if(rate.invoke(null,Arrays.asList(slow,variable))!=variable)throw new AssertionError("Supported fallback");
        if(rate.invoke(null,Collections.emptyList())!=null)throw new AssertionError("No unsupported fps");
        Class<?> selection=Class.forName("cc.rustel.android.CameraSelection");
        Method choose=selection.getDeclaredMethod("index",List.class,int.class,boolean.class);choose.setAccessible(true);
        List<Integer> facings=Arrays.asList(1,0,0);
        if((int)choose.invoke(null,facings,0,false)!=0 || (int)choose.invoke(null,facings,0,true)!=1)throw new AssertionError("Front/rear selection");
        if((int)choose.invoke(null,facings,2,true)!=2)throw new AssertionError("Explicit camera must be preserved");
        if((int)choose.invoke(null,Arrays.asList(0),0,false)!=0)throw new AssertionError("Single-camera fallback");
        if((int)choose.invoke(null,Arrays.asList(0,1),0,false)!=1)throw new AssertionError("Camera order independence");
        System.out.println("PASSED: front/rear camera selection, explicit device preservation, single-camera fallback; NV21 conversion and four rotations; latest-only frames; duplicate suppression; independent consumers; clear; supported 30 fps selection/fallback");
    }
}
