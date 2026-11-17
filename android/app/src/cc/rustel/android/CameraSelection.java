package cc.rustel.android;

import java.util.List;

/** Device zero follows the phone camera switch; explicit device indices stay explicit. */
final class CameraSelection {
    static int index(List<Integer> facings,int requested,boolean rear) {
        if(requested!=0 || facings.isEmpty())return requested;
        int facing=rear?0:1; // CameraInfo BACK / FRONT, without requiring Android in tests.
        int match=facings.indexOf(facing);
        return match<0?0:match;
    }
}
