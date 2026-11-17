package cc.rustel.android;

import android.app.*;
import android.content.*;
import android.os.IBinder;

/** Keeps a live set audible while the user switches apps. */
public final class PlaybackService extends Service {
    @Override public void onCreate() {
        super.onCreate();
        NotificationManager manager = getSystemService(NotificationManager.class);
        manager.createNotificationChannel(new NotificationChannel("playback", "Rustel playback", NotificationManager.IMPORTANCE_LOW));
        PendingIntent open = PendingIntent.getActivity(this, 0,
            new Intent(this, MainActivity.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        PendingIntent stop = PendingIntent.getActivity(this, 1,
            new Intent(this, MainActivity.class).setAction("cc.rustel.android.STOP"), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification notification = new Notification.Builder(this, "playback")
            .setContentTitle("Rustel")
            .setContentText("Tap to return to your set")
            .setSmallIcon(cc.rustel.android.R.drawable.icon_foreground)
            .setContentIntent(open).setOngoing(true)
            .addAction(new Notification.Action.Builder(android.R.drawable.ic_media_pause, "Stop playback", stop).build())
            .build();
        startForeground(1, notification);
    }
    @Override public int onStartCommand(Intent intent, int flags, int id) { return START_NOT_STICKY; }
    @Override public IBinder onBind(Intent intent) { return null; }
}
