package cc.rustel.android;

import android.Manifest;
import android.content.pm.PackageManager;
import android.graphics.ImageFormat;
import android.graphics.SurfaceTexture;
import android.hardware.Camera;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.Process;
import android.view.Surface;
import java.nio.*;
import java.util.*;

/** Small, bounded phone-camera feed for Rustel's existing camera-theme renderer. */
@SuppressWarnings("deprecation")
final class CameraFeed {
    private final MainActivity activity;
    private final HandlerThread thread;
    private final Handler worker;
    private final CameraFrames frames = new CameraFrames();
    private final android.content.SharedPreferences preferences;
    private Camera camera;
    private SurfaceTexture surface;
    private volatile int leases, selected;
    private int opened=-1;
    private volatile int rotation;
    private int sensorOrientation;
    private boolean frontCamera;
    private volatile boolean rear;
    private boolean openedRear;
    private volatile boolean foreground, disposed;
    private boolean permissionRequested;
    private long lastFrameNanos;
    private volatile long callbackCount,publishedCount,throttledCount,conversionNanos,maxConversionNanos;
    private volatile int previewWidth,previewHeight;
    CameraFeed(MainActivity activity) {
        this.activity=activity;
        preferences=activity.getSharedPreferences("camera",android.content.Context.MODE_PRIVATE);
        rear=preferences.getBoolean("rear",false);
        // Camera callbacks use the Looper of the thread that opens the camera.
        // Never open it on the Activity thread: NV21 conversion would block input.
        thread=new HandlerThread("Rustel camera",Process.THREAD_PRIORITY_BACKGROUND);
        thread.start();worker=new Handler(thread.getLooper());
    }
    synchronized boolean acquire(int index) {
        if(disposed)return false;
        if(activity.checkSelfPermission(Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED) {
            if(!permissionRequested){permissionRequested=true;activity.runOnUiThread(()->activity.requestPermissions(new String[]{Manifest.permission.CAMERA},23));}
            return false;
        }
        if(leases>0 && index!=selected)return false;
        selected=index;leases++;
        worker.post(()->open());
        return true;
    }
    synchronized void release() { leases=Math.max(0,leases-1);if(leases==0){frames.clear();worker.post(()->{if(leases==0)close();});} }
    void resume() { foreground=true;if(!disposed)worker.post(()->open()); }
    void pause() { foreground=false;frames.clear();worker.post(()->{if(!foreground)close();}); }
    void displayChanged() { worker.post(()->{if(!disposed && camera!=null)updateRotation();}); }
    private void updateRotation() {
        int display=activity.getWindowManager().getDefaultDisplay().getRotation();
        int degrees=display==Surface.ROTATION_90?90:display==Surface.ROTATION_180?180:display==Surface.ROTATION_270?270:0;
        int next=frontCamera?(sensorOrientation+degrees)%360:(sensorOrientation-degrees+360)%360;
        if(next!=rotation){rotation=next;frames.clear();}
    }
    synchronized void dispose() { if(disposed)return;disposed=true;foreground=false;frames.clear();worker.post(()->{close();thread.quitSafely();}); }
    byte[] frame(int previous) { return !foreground || disposed || leases==0 ? null : frames.after(previous); }
    String facing() { return rear?"rear":"front"; }
    // No image data. The Activity exposes this only to debuggable QA builds.
    String diagnostics() {
        return "{\"callbacks\":"+callbackCount+",\"published\":"+publishedCount
            +",\"throttled\":"+throttledCount+",\"frameAgeMillis\":"+(frames.ageNanos()/1e6)
            +",\"conversionMicros\":"+(conversionNanos/1e3)+",\"maxConversionMicros\":"+(maxConversionNanos/1e3)
            +",\"width\":"+previewWidth+",\"height\":"+previewHeight+",\"leases\":"+leases
            +",\"foreground\":"+foreground+",\"rotation\":"+rotation+",\"facing\":\""+facing()+"\"}";
    }
    synchronized String flip() {
        if(disposed)return facing();
        rear=!rear;preferences.edit().putBoolean("rear",rear).apply();frames.clear();
        worker.post(()->open());
        return facing();
    }
    private void open() {
        if(disposed || !foreground || leases==0)return;
        if(camera!=null){if(opened==selected && openedRear==rear)return;close();}
        int requested=selected;
        boolean requestedRear=rear;
        try {
            List<Integer> devices=new ArrayList<>();
            List<Integer> facings=new ArrayList<>();
            // Device 0 is the selfie camera, useful for the supplied webcam themes.
            for(int facing:new int[]{Camera.CameraInfo.CAMERA_FACING_FRONT,Camera.CameraInfo.CAMERA_FACING_BACK})
                for(int id=0;id<Camera.getNumberOfCameras();id++){Camera.CameraInfo info=new Camera.CameraInfo();Camera.getCameraInfo(id,info);if(info.facing==facing){devices.add(id);facings.add(info.facing);}}
            if(requested<0 || requested>=devices.size())return;
            int id=devices.get(CameraSelection.index(facings,requested,requestedRear));
            camera=Camera.open(id);
            opened=requested;openedRear=requestedRear;
            if(disposed || !foreground || leases==0 || selected!=requested || rear!=requestedRear){close();return;}
            Camera.Parameters parameters=camera.getParameters();
            Camera.Size best=null;
            for(Camera.Size size:parameters.getSupportedPreviewSizes())
                if(size.width<=640 && size.height<=640 && (best==null || Math.abs(size.width*size.height-320*240)<Math.abs(best.width*best.height-320*240)))best=size;
            if(best==null)throw new IllegalStateException("No small camera preview");
            parameters.setPreviewSize(best.width,best.height);
            parameters.setPreviewFormat(ImageFormat.NV21);
            int[] fps=CameraFrames.previewRate(parameters.getSupportedPreviewFpsRange());
            if(fps!=null)parameters.setPreviewFpsRange(fps[0],fps[1]);
            camera.setParameters(parameters);
            Camera.CameraInfo info=new Camera.CameraInfo();Camera.getCameraInfo(id,info);
            sensorOrientation=info.orientation;
            frontCamera=info.facing==Camera.CameraInfo.CAMERA_FACING_FRONT;
            updateRotation();
            surface=new SurfaceTexture(0);camera.setPreviewTexture(surface);
            int width=best.width,height=best.height;
            previewWidth=width;previewHeight=height;
            lastFrameNanos=0;
            camera.addCallbackBuffer(new byte[width*height*3/2]);
            camera.addCallbackBuffer(new byte[width*height*3/2]);
            camera.setPreviewCallbackWithBuffer((bytes,device)->{
                long begun=System.nanoTime();callbackCount++;
                long now=begun;
                if(!disposed && foreground && leases>0 && CameraFrames.captureDue(lastFrameNanos,now)){
                    lastFrameNanos=now;
                    byte[] converted=rgba(bytes,width,height,rotation);
                    converted[12]=(byte)(info.facing==Camera.CameraInfo.CAMERA_FACING_FRONT?1:0);
                    if(!disposed && foreground && leases>0 && rear==requestedRear){frames.publish(converted);publishedCount++;}
                    conversionNanos=System.nanoTime()-begun;maxConversionNanos=Math.max(maxConversionNanos,conversionNanos);
                }else throttledCount++;
                try{device.addCallbackBuffer(bytes);}catch(RuntimeException ignored){}
            });
            camera.startPreview();
        } catch(Exception error) { close(); }
    }
    private void close() {
        frames.clear();opened=-1;
        if(camera!=null){try{camera.setPreviewCallbackWithBuffer(null);camera.stopPreview();}catch(RuntimeException ignored){}try{camera.release();}catch(RuntimeException ignored){}camera=null;}
        if(surface!=null){surface.release();surface=null;}
    }
    private static byte[] rgba(byte[] nv21,int width,int height,int rotation) {
        int outWidth=(rotation==90||rotation==270)?height:width;
        int outHeight=(rotation==90||rotation==270)?width:height;
        byte[] result=new byte[16+outWidth*outHeight*4];
        ByteBuffer.wrap(result).order(ByteOrder.LITTLE_ENDIAN).putInt(outWidth).putInt(outHeight);
        for(int y=0;y<height;y++)for(int x=0;x<width;x++){
            int uv=width*height+(y>>1)*width+(x&~1);
            int c=Math.max(0,(nv21[y*width+x]&255)-16),v=(nv21[uv]&255)-128,u=(nv21[uv+1]&255)-128;
            int red=(298*c+409*v+128)>>8,green=(298*c-100*u-208*v+128)>>8,blue=(298*c+516*u+128)>>8;
            int dx=x,dy=y;
            if(rotation==90){dx=height-1-y;dy=x;}else if(rotation==270){dx=y;dy=width-1-x;}else if(rotation==180){dx=width-1-x;dy=height-1-y;}
            int i=16+(dy*outWidth+dx)*4;
            result[i]=(byte)Math.max(0,Math.min(255,red));result[i+1]=(byte)Math.max(0,Math.min(255,green));result[i+2]=(byte)Math.max(0,Math.min(255,blue));result[i+3]=(byte)255;
        }
        return result;
    }
}
