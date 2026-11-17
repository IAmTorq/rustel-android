package cc.rustel.android;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioDeviceCallback;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.media.MediaRouter;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import java.util.Arrays;
import java.util.List;

/** Publishes route facts off the audio callback, without device names or addresses. */
final class AudioRouteMonitor {
    interface Listener { void changed(boolean defaultWireless, int[] wirelessIds); }
    private final AudioManager audio;
    private final MediaRouter router;
    private final Listener listener;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean closed;
    private volatile boolean defaultWireless;
    private volatile int wirelessCount;
    private volatile String routeSource = "unknown";
    private boolean lastDefault;
    private int[] lastIds;

    private final Runnable refresh = new Runnable() {
        @Override public void run() {
            if (closed) return;
            publish();
            handler.postDelayed(this, 1000);
        }
    };
    private final AudioDeviceCallback devices = new AudioDeviceCallback() {
        @Override public void onAudioDevicesAdded(AudioDeviceInfo[] ignored) { refreshSoon(); }
        @Override public void onAudioDevicesRemoved(AudioDeviceInfo[] ignored) { refreshSoon(); }
    };
    private final MediaRouter.SimpleCallback routes = new MediaRouter.SimpleCallback() {
        @Override public void onRouteSelected(MediaRouter ignored, int type, MediaRouter.RouteInfo route) { refreshSoon(); }
        @Override public void onRouteUnselected(MediaRouter ignored, int type, MediaRouter.RouteInfo route) { refreshSoon(); }
        @Override public void onRouteChanged(MediaRouter ignored, MediaRouter.RouteInfo route) { refreshSoon(); }
    };

    AudioRouteMonitor(Context context, Listener listener) {
        audio = context.getSystemService(AudioManager.class);
        router = context.getSystemService(MediaRouter.class);
        this.listener = listener;
        audio.registerAudioDeviceCallback(devices, handler);
        if (router != null) router.addCallback(MediaRouter.ROUTE_TYPE_LIVE_AUDIO, routes);
        refresh.run();
    }

    static boolean wireless(int type) {
        return type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP
                || type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO
                || type == AudioDeviceInfo.TYPE_BLE_HEADSET
                || type == AudioDeviceInfo.TYPE_BLE_SPEAKER
                || type == AudioDeviceInfo.TYPE_HEARING_AID;
    }

    private void refreshSoon() {
        if (closed) return;
        handler.removeCallbacks(refresh);
        handler.post(refresh);
    }

    private boolean predictedDefaultWireless() {
        if (Build.VERSION.SDK_INT >= 33) {
            try {
                AudioAttributes attributes = new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build();
                // Public since API 33; reflection retains the pinned API-32 build SDK.
                Object result = AudioManager.class.getMethod("getAudioDevicesForAttributes", AudioAttributes.class)
                        .invoke(audio, attributes);
                if (result instanceof List && !((List<?>) result).isEmpty()) {
                    routeSource = "attributes";
                    for (Object item : (List<?>) result)
                        if (item instanceof AudioDeviceInfo && wireless(((AudioDeviceInfo) item).getType())) return true;
                    return false;
                }
            } catch (ReflectiveOperationException | RuntimeException ignored) {
                // A failed prediction must not infer an active route from connected devices.
            }
        }
        if (router != null) {
            MediaRouter.RouteInfo route = router.getSelectedRoute(MediaRouter.ROUTE_TYPE_LIVE_AUDIO);
            if (route != null) {
                routeSource = "media-router";
                return route.getDeviceType() == MediaRouter.RouteInfo.DEVICE_TYPE_BLUETOOTH;
            }
        }
        routeSource = "unknown";
        return false;
    }

    private void publish() {
        int[] ids = new int[128];
        int count = 0;
        boolean predicted = false;
        try {
            for (AudioDeviceInfo device : audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS))
                if (wireless(device.getType()) && device.getId() > 0 && count < ids.length)
                    ids[count++] = device.getId();
            predicted = predictedDefaultWireless();
        } catch (RuntimeException ignored) {
            count = 0;
            routeSource = "unknown";
        }
        ids = Arrays.copyOf(ids, count);
        Arrays.sort(ids);
        defaultWireless = predicted;
        wirelessCount = count;
        if (lastIds == null || predicted != lastDefault || !Arrays.equals(ids, lastIds)) {
            listener.changed(predicted, ids);
            lastDefault = predicted;
            lastIds = ids;
        }
    }

    String diagnostics() {
        return "{\"defaultWireless\":" + defaultWireless + ",\"wirelessDeviceCount\":"
                + wirelessCount + ",\"source\":\"" + routeSource + "\"}";
    }

    void close() {
        closed = true;
        handler.removeCallbacks(refresh);
        audio.unregisterAudioDeviceCallback(devices);
        if (router != null) router.removeCallback(routes);
    }
}
