package cc.rustel.android;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.ColorDrawable;
import android.content.res.ColorStateList;
import android.net.Uri;
import android.os.*;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;
import android.database.Cursor;
import android.util.Base64;
import android.view.*;
import android.view.inputmethod.InputMethodManager;
import android.webkit.*;
import android.widget.*;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import java.util.zip.*;

public final class MainActivity extends Activity {
    static { System.loadLibrary("rustel_android"); }
    private native int nativeStart(String home, int cols, int rows);
    private native byte[] nativeRead();
    private native void nativeWrite(byte[] bytes);
    private native void nativeResize(int cols, int rows);
    private native String nativeActions();
    private native String nativeUiTheme();
    private native boolean nativePiano();
    private native String nativeReferenceRegion();
    private native String nativeLastError();
    private native void nativeStop();
    private native boolean nativeImportPattern(String path, String name, boolean openAsSet);
    private native boolean nativeQaRun(String folder);
    private native void nativeAudioRoutes(boolean defaultWireless, int[] wirelessIds);
    private static volatile MainActivity current;
    private WebView web;
    private volatile boolean started;
    private long launchStartedAt;
    private volatile boolean disposed;
    private volatile boolean terminalFocused=true;
    private final Semaphore painted = new Semaphore(1);
    private final java.util.concurrent.atomic.AtomicReference<String> pendingOutput = new java.util.concurrent.atomic.AtomicReference<>();
    private volatile WebMessagePort outputPort;
    private final HandlerThread outputAcknowledgements=new HandlerThread("Rustel output acknowledgements");
    private final ExecutorService inputs = Executors.newSingleThreadExecutor();
    private CameraFeed camera;
    private AudioRouteMonitor audioRoutes;
    private android.content.SharedPreferences prefs;
    private volatile String lastUiTheme="";
    private int uiBackground=Color.rgb(15,15,28),uiSurface=Color.rgb(25,25,40),uiForeground=Color.WHITE,uiAccent=Color.CYAN,uiRule=Color.GRAY,uiMuted=Color.LTGRAY;
    private AlertDialog phoneSettings;
    private static final int EXPORT = 12, IMPORT = 13, EXPORT_SOURCE = 14, EXPORT_LOG = 15, IMPORT_PATTERNS = 16, OPEN_DOCUMENT = 17;
    private final java.util.concurrent.atomic.AtomicBoolean patternPickerOpen = new java.util.concurrent.atomic.AtomicBoolean();

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        outputAcknowledgements.start();
        current=this;
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setStatusBarColor(Color.rgb(15,15,28));
        getWindow().setNavigationBarColor(Color.rgb(15,15,28));
        prefs = getSharedPreferences("display", MODE_PRIVATE);
        setVolumeControlStream(android.media.AudioManager.STREAM_MUSIC);
        camera = new CameraFeed(this);
        audioRoutes = new AudioRouteMonitor(this, this::nativeAudioRoutes);
        try { seedFiles(); } catch (IOException error) { fail("Could not prepare Rustel", error.toString()); return; }
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(15,15,28));
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets;
        });
        web = new WebView(this);
        WebView.setWebContentsDebuggingEnabled((getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0);
        root.addView(web, new LinearLayout.LayoutParams(-1,-1));
        setContentView(root);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportZoom(false);
        web.setBackgroundColor(Color.rgb(15,15,28));
        web.addJavascriptInterface(new Bridge(), "Rustel");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return true; }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (!"https".equals(url.getScheme()) || !"rustel.local".equals(url.getHost())) return emptyResponse();
                String path = url.getPath();
                if (path == null || !path.matches("/[A-Za-z0-9_.-]+")) return emptyResponse();
                try {
                    String mime = path.endsWith(".js") ? "text/javascript" : path.endsWith(".css") ? "text/css" : "text/html";
                    return new WebResourceResponse(mime, "UTF-8", getAssets().open(path.substring(1)));
                } catch (IOException error) { return emptyResponse(); }
            }
        });
        web.setWebChromeClient(new WebChromeClient());
        web.loadUrl("https://rustel.local/index.html");
    }

    private WebResourceResponse emptyResponse() { return new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream(new byte[0])); }
    private void fail(String title, String message) { runOnUiThread(() -> new AlertDialog.Builder(this).setTitle(title).setMessage(message).setNeutralButton("Save diagnostics",(d,w)->exportDiagnostics()).setPositiveButton("Close",(d,w)->finish()).show()); }
    private void exportDiagnostics() { startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT).setType("text/plain").putExtra(Intent.EXTRA_TITLE,"Rustel-startup.log").addCategory(Intent.CATEGORY_OPENABLE),EXPORT_LOG); }
    // Called on the Studio worker through JNI. Activity and picker work stays on the UI thread.
    public boolean openPatternDownloads(boolean openAsSet) {
        MainActivity app=current;
        if(app==null || app.disposed || !app.patternPickerOpen.compareAndSet(false,true)) return false;
        app.runOnUiThread(()->{
            if(app.disposed || app.isFinishing()) {app.patternPickerOpen.set(false);return;}
            Intent picker=new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("*/*")
                .addCategory(Intent.CATEGORY_OPENABLE).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                .putExtra(Intent.EXTRA_TITLE,openAsSet?"Open a score or pattern export":"Import Strudel patterns")
                .putExtra(DocumentsContract.EXTRA_INITIAL_URI,DocumentsContract.buildDocumentUri("com.android.externalstorage.documents","primary:Download"));
            try {app.startActivityForResult(picker,openAsSet?OPEN_DOCUMENT:IMPORT_PATTERNS);}
            catch(RuntimeException error) {
                app.patternPickerOpen.set(false);
                new AlertDialog.Builder(app).setTitle("Could not open Downloads").setMessage(error.toString()).setPositiveButton("OK",null).show();
            }
        });
        return true;
    }
    private void seedFiles() throws IOException {
        File config = new File(getFilesDir(), "config"), themes = new File(config,"themes");
        themes.mkdirs();
        // Public builds use upstream themes. Personal build overlays stay local.
        String[] bundledThemes = getAssets().list("themes");
        if (bundledThemes != null) for (String file : bundledThemes) {
            File target = new File(themes, file);
            if (!target.exists()) try (InputStream in = getAssets().open("themes/" + file);
                    OutputStream out = new FileOutputStream(target)) {
                copy(in, out);
            }
        }
        File set = new File(getFilesDir(),"Music/First Tune"); set.mkdirs();
        File score = new File(set,"First Tune.strudel");
        if (!score.exists()) try (OutputStream out = new FileOutputStream(score)) {
            out.write(("// Play updates the set. Stop silences it.\n// Samples download and cache when first used.\n$: s(\"[bd <hh oh>]*2\").bank(\"tr909\").dec(.4)._pianoroll()\n").getBytes(StandardCharsets.UTF_8));
        }
        File studio = new File(config,"studio.json");
        if (!studio.exists()) {
            String json = "{\"last_set\":"+JSONObject.quote(set.getAbsolutePath())+"}";
            try (OutputStream out = new FileOutputStream(studio)) { out.write(json.getBytes(StandardCharsets.UTF_8)); }
        }
    }
    private static void copy(InputStream in, OutputStream out) throws IOException { byte[] b = new byte[32768]; int n; while ((n=in.read(b))!=-1) out.write(b,0,n); }

    private void send(String text) {
        if (started && !disposed) inputs.execute(() -> nativeWrite(text.getBytes(StandardCharsets.UTF_8)));
    }
    private void js(String script) { runOnUiThread(() -> { if (!disposed && web != null) web.evaluateJavascript(script,null); }); }
    private void prepareOutputChannel() {
        try {
            WebMessagePort[] ports=web.createWebMessageChannel();
            outputPort=ports[0];
            outputPort.setWebMessageCallback(new WebMessagePort.WebMessageCallback() {
                @Override public void onMessage(WebMessagePort port,WebMessage message) {
                    if(!disposed && port==outputPort && "ack".equals(message.getData())) acknowledgeOutput();
                }
            },new Handler(outputAcknowledgements.getLooper()));
            web.postWebMessage(new WebMessage("rustel-terminal-output",new WebMessagePort[]{ports[1]}),Uri.parse("https://rustel.local"));
        } catch(RuntimeException unsupported) { closeOutputChannel(); }
    }
    private void closeOutputChannel() {
        if(outputPort!=null){try{outputPort.close();}catch(RuntimeException ignored){}outputPort=null;}
    }
    private void acknowledgeOutput() {
        pendingOutput.set(null);
        if(painted.availablePermits()==0)painted.release();
    }
    private void launch(int cols, int rows) {
        if (started || disposed) return;
        if (launchStartedAt == 0) launchStartedAt = SystemClock.elapsedRealtime();
        int fd = nativeStart(getFilesDir().getAbsolutePath(),cols,rows);
        if (fd == -2) {
            if (SystemClock.elapsedRealtime() - launchStartedAt < 5000)
                web.postDelayed(() -> launch(cols,rows),50);
            else fail("Rustel could not start","The previous session is still closing. Close and reopen Rustel; saved projects are preserved.");
            return;
        }
        if (fd < 0) { fail("Rustel could not start", nativeLastError()); return; }
        prepareOutputChannel();
        started = true;
        startForegroundService(new Intent(this,PlaybackService.class));
        Thread reader = new Thread(() -> {
            TerminalFrameBatcher batches = new TerminalFrameBatcher();
            boolean ended = false;
            while (!ended && !disposed) {
                byte[] bytes = nativeRead();
                if (bytes == null) { ended = true; bytes = batches.finish(); }
                else bytes = batches.append(bytes);
                if (bytes == null) continue;
                if (disposed) break;
                try { painted.acquire(); } catch (InterruptedException error) { break; }
                if (disposed) { painted.release(); break; }
                String b64 = Base64.encodeToString(bytes,Base64.NO_WRAP);
                pendingOutput.set(b64);
                runOnUiThread(() -> {
                    if (disposed) { pendingOutput.set(null); painted.release(); return; }
                    if(outputPort!=null) {
                        try { outputPort.postMessage(new WebMessage(b64));return; }
                        catch(RuntimeException unavailable) { closeOutputChannel(); }
                    }
                    // Keep frame bytes out of JavaScript source. A unique
                    // multi-kilobyte script for every animated frame bloats
                    // the WebView's script cache and repeatedly compiles it.
                    web.evaluateJavascript("window.receivePending()",null);
                });
            }
        },"Rustel terminal output");
        reader.setDaemon(true); reader.start();
        if (Build.VERSION.SDK_INT>=33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS")!=PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"},21);
    }
    public final class Bridge {
        @JavascriptInterface public String uiTheme() {
            String value=nativeUiTheme();
            if(value!=null && !value.equals(lastUiTheme)) {
                lastUiTheme=value;
                runOnUiThread(()->applyUiTheme(value));
            }
            return value==null?"{}":value;
        }
        @JavascriptInterface public String qaAudioRoutes() {
            return (getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0
                    && audioRoutes != null ? audioRoutes.diagnostics() : "{}";
        }
        @JavascriptInterface public void qaRecreate() {
            if ((getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0)
                runOnUiThread(() -> recreate());
        }
        @JavascriptInterface public boolean qaRun() {
            return (getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0
                && nativeQaRun(new File(getFilesDir(),"qa-corpus").getAbsolutePath());
        }
        @JavascriptInterface public int fontSize() { return prefs.getInt("fontSize",10); }
        @JavascriptInterface public void ready(int cols,int rows) { runOnUiThread(()->launch(cols,rows)); }
        @JavascriptInterface public void input(String text) { send(text); }
        @JavascriptInterface public void resized(int cols,int rows) { if(started) nativeResize(cols,rows); }
        @JavascriptInterface public void ack() { acknowledgeOutput(); }
        @JavascriptInterface public String readOutput() { return pendingOutput.getAndSet(null); }
        @JavascriptInterface public void settings() { runOnUiThread(()->showSettings()); }
        @JavascriptInterface public boolean touchKeyboardEnabled() {
            return prefs.getBoolean("touchKeyboard", true);
        }
        @JavascriptInterface public void showKeyboard() {
            runOnUiThread(() -> showTouchKeyboard());
        }
        @JavascriptInterface public void keyboard() {
            runOnUiThread(() -> setTouchKeyboard(!prefs.getBoolean("touchKeyboard", true), true));
        }
        @JavascriptInterface public void paste() { runOnUiThread(()->js("window.pasteText("+JSONObject.quote(readClipboard())+")")); }
        @JavascriptInterface public String actions() { return nativeActions(); }
        @JavascriptInterface public boolean piano() { return started && nativePiano(); }
        @JavascriptInterface public String referenceRegion() { return started ? nativeReferenceRegion() : "[0,0,0,0]"; }
        @JavascriptInterface public String cameraFacing() { return camera.facing(); }
        @JavascriptInterface public String qaCameraStats() {
            return (getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0
                ? camera.diagnostics() : "{}";
        }
        @JavascriptInterface public String flipCamera() { return camera.flip(); }
        @JavascriptInterface public void terminalFocus(boolean focused) { terminalFocused=focused; }
    }
    private void setTouchKeyboard(boolean enabled, boolean show) {
        prefs.edit().putBoolean("touchKeyboard", enabled).apply();
        js("window.setTouchKeyboard(" + enabled + ")");
        InputMethodManager ime = (InputMethodManager)getSystemService(INPUT_METHOD_SERVICE);
        if (enabled && show) {
            showTouchKeyboard();
        } else if (!enabled) {
            ime.hideSoftInputFromWindow(web.getWindowToken(), 0);
        }
    }
    private void showTouchKeyboard() {
        if (disposed || web == null || !prefs.getBoolean("touchKeyboard", true)) return;
        web.requestFocus();
        // Touch gestures consume the browser's default focus behavior.
        web.evaluateJavascript("window.focusTerminal()", ignored -> {
            if (!disposed) ((InputMethodManager)getSystemService(INPUT_METHOD_SERVICE))
                .showSoftInput(web, InputMethodManager.SHOW_IMPLICIT);
        });
    }
    private void showSettings() {
        LinearLayout body = new LinearLayout(this); body.setPadding(32,16,32,16); body.setOrientation(LinearLayout.VERTICAL);
        TextView label = new TextView(this); label.setTextColor(Color.WHITE); body.addView(label);
        label.setText("Text size");
        EditText size = new EditText(this);
        size.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);
        size.setSingleLine(true);size.setSelectAllOnFocus(true);
        size.setText(Integer.toString(prefs.getInt("fontSize",10)));
        size.setHint("8–22");body.addView(size);
        addButton(body,"Apply text size",()->{
            try {
                int value=Integer.parseInt(size.getText().toString().trim());
                if(value<8 || value>22)throw new NumberFormatException();
                prefs.edit().putInt("fontSize",value).apply();js("window.changeFontSize("+value+")");
                size.setError(null);
            }catch(NumberFormatException error){size.setError("Enter a number from 8 to 22");}
        });
        Switch touchKeyboard = new Switch(this);
        touchKeyboard.setText("Touch keyboard");
        touchKeyboard.setChecked(prefs.getBoolean("touchKeyboard", true));
        touchKeyboard.setOnCheckedChangeListener((button, checked) -> setTouchKeyboard(checked, false));
        body.addView(touchKeyboard);
        addButton(body,"Rustel settings",()->send("\u000f"));
        addButton(body,"Allow microphone input",()->requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},22));
        addButton(body,"Allow camera themes",()->requestPermissions(new String[]{Manifest.permission.CAMERA},23));
        addButton(body,"Import a score",()->startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE),IMPORT));
        addButton(body,"Export projects and settings",()->startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT).setType("application/zip").putExtra(Intent.EXTRA_TITLE,"Rustel-phone-backup.zip").addCategory(Intent.CATEGORY_OPENABLE),EXPORT));
        addButton(body,"Export app source code",()->startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT).setType("application/gzip").putExtra(Intent.EXTRA_TITLE,"rustel-android-source.tar.gz").addCategory(Intent.CATEGORY_OPENABLE),EXPORT_SOURCE));
        addButton(body,"Test phone keyboard",()->keyboardTest());
        addButton(body,"Export startup diagnostics",()->exportDiagnostics());
        TextView note = new TextView(this); note.setText("Import downloaded pattern exports: File > Strudel patterns > Import > Downloads….\nImport a score above opens Android's file picker for individual score files.\nSamples download normally when used and remain cached.\nCamera themes also need Hydra webcam enabled in Rustel settings.\nExperimental native port: desktop VST plugins and detached windows are unavailable."); note.setTextColor(Color.LTGRAY); note.setPadding(0,16,0,0); body.addView(note);
        ScrollView scroll=new ScrollView(this);scroll.addView(body);
        phoneSettings=new AlertDialog.Builder(this).setTitle("Settings").setView(scroll).setPositiveButton("Done",(d,w)->setTouchKeyboard(prefs.getBoolean("touchKeyboard", true), true)).create();
        phoneSettings.setOnDismissListener(d->phoneSettings=null);
        phoneSettings.show();stylePhoneSettings();
    }
    private void applyUiTheme(String value) {
        try {
            JSONObject palette=new JSONObject(value);
            if(!palette.has("background"))return;
            uiBackground=Color.parseColor(palette.getString("background"));
            uiSurface=Color.parseColor(palette.getString("surface"));
            uiForeground=Color.parseColor(palette.getString("foreground"));
            uiAccent=Color.parseColor(palette.getString("accent"));
            uiRule=Color.parseColor(palette.getString("rule"));
            uiMuted=Color.parseColor(palette.getString("muted"));
            getWindow().setStatusBarColor(uiBackground);getWindow().setNavigationBarColor(uiBackground);
            WindowInsetsController bars=getWindow().getInsetsController();
            if(bars!=null){int light=WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS|WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;bars.setSystemBarsAppearance(Color.luminance(uiBackground)>.5?light:0,light);}
            if(web!=null){web.setBackgroundColor(uiBackground);web.getRootView().setBackgroundColor(uiBackground);}
            stylePhoneSettings();
        }catch(org.json.JSONException | IllegalArgumentException ignored) { }
    }
    private void stylePhoneSettings() {
        if(phoneSettings==null || phoneSettings.getWindow()==null)return;
        phoneSettings.getWindow().setBackgroundDrawable(new ColorDrawable(uiSurface));
        stylePhoneView(phoneSettings.getWindow().getDecorView());
    }
    private void stylePhoneView(View view) {
        if(view instanceof TextView) {
            TextView text=(TextView)view;text.setTypeface(Typeface.MONOSPACE);text.setTextColor(uiForeground);
            if(text instanceof EditText)((EditText)text).setHintTextColor(uiMuted);
            if(text instanceof Button || text instanceof EditText) {
                GradientDrawable fill=new GradientDrawable();fill.setColor(uiBackground);fill.setStroke((int)Math.ceil(getResources().getDisplayMetrics().density),uiRule);fill.setCornerRadius(0);text.setBackground(fill);text.setBackgroundTintList(null);
                if(text instanceof Button){((Button)text).setAllCaps(false);text.setTextColor(uiAccent);}
            }
            if(text instanceof Switch){((Switch)text).setThumbTintList(ColorStateList.valueOf(uiAccent));((Switch)text).setTrackTintList(ColorStateList.valueOf(uiRule));}
        }
        if(view instanceof ViewGroup){ViewGroup group=(ViewGroup)view;for(int i=0;i<group.getChildCount();i++)stylePhoneView(group.getChildAt(i));}
    }
    private void addButton(LinearLayout body,String text,Runnable action) { Button button=new Button(this);button.setText(text);button.setOnClickListener(v->action.run());body.addView(button); }
    public String readClipboard() {
        ClipboardManager clipboard=(ClipboardManager)getSystemService(CLIPBOARD_SERVICE);
        ClipData data=clipboard.getPrimaryClip();
        return data!=null && data.getItemCount()>0 ? data.getItemAt(0).coerceToText(this).toString() : "";
    }
    public void writeClipboard(String text) { ((ClipboardManager)getSystemService(CLIPBOARD_SERVICE)).setPrimaryClip(ClipData.newPlainText("Rustel",text)); }
    public boolean beginCamera(int device) { MainActivity app=current; return app!=null && app.camera.acquire(device); }
    public byte[] getCameraFrame(int previous) { MainActivity app=current; return app==null ? null : app.camera.frame(previous); }
    public void endCamera() { MainActivity app=current; if(app!=null)app.camera.release(); }
    public void onStudioExit(String error) {
        runOnUiThread(()->{
            started=false;
            // A closing Activity must not stop its replacement's service.
            if(current != null && current != this)return;
            stopService(new Intent(this,PlaybackService.class));
            if(disposed || isFinishing())return;
            new AlertDialog.Builder(this).setTitle("Rustel closed").setMessage(error.isEmpty()?"Your saved projects are kept on this phone.":error)
                .setNeutralButton("Save diagnostics",(d,w)->exportDiagnostics())
                .setPositiveButton("Close",(d,w)->{finishAndRemoveTask();}).setCancelable(false).show();
        });
    }
    private void keyboardTest() {
        LinearLayout body=new LinearLayout(this);body.setOrientation(LinearLayout.VERTICAL);body.setPadding(24,16,24,16);
        TextView status=new TextView(this);status.setText("Press your Ctrl key (or Fn if mapped to Ctrl) with C to check shortcuts. Test Alt with a number/symbol too.");body.addView(status);
        EditText input=new EditText(this);input.setSingleLine(true);input.setHint("Press physical keys here");body.addView(input);
        input.setOnKeyListener((view,key,event)->{status.setText("Key: "+KeyEvent.keyCodeToString(key)+"\nCtrl: "+(event.isCtrlPressed()?"yes":"no")+" · Shift: "+(event.isShiftPressed()?"yes":"no")+" · Alt: "+(event.isAltPressed()?"yes":"no")+"\nCharacter: "+KeyboardInput.name(event));return event.isCtrlPressed();});
        new AlertDialog.Builder(this).setTitle("Physical keyboard check").setView(body).setPositiveButton("Done",null).show();input.requestFocus();
    }
    @Override public boolean dispatchKeyEvent(KeyEvent event) {
        if(started && terminalFocused && web!=null && web.hasWindowFocus() && event.getDeviceId()!=KeyCharacterMap.VIRTUAL_KEYBOARD
                && (event.getAction()==KeyEvent.ACTION_DOWN || event.getAction()==KeyEvent.ACTION_UP)) {
            String name=KeyboardInput.name(event);
            boolean piano=nativePiano();
            if(name!=null && (event.isCtrlPressed()||KeyboardInput.navigation(event)||piano)) {
                int modifiers=(event.isShiftPressed()?1:0)|(event.isAltPressed()?2:0)|(event.isCtrlPressed()?4:0)|(event.isMetaPressed()?8:0);
                int kind=event.getAction()==KeyEvent.ACTION_UP?3:event.getRepeatCount()>0?2:1;
                js("window.hardwareKey("+JSONObject.quote(name)+","+modifiers+","+kind+")");return true;
            }
            // Titan's Alt is a symbol layer. Use Android's actual key-map character, rather than treating it as desktop Meta.
            if(name!=null && event.isAltPressed() && !event.isCtrlPressed() && name.codePointCount(0,name.length())==1) {
                if(event.getAction()==KeyEvent.ACTION_DOWN)js("window.hardwareText("+JSONObject.quote(name)+")");return true;
            }
        }
        return super.dispatchKeyEvent(event);
    }
    @Override protected void onNewIntent(Intent intent) { super.onNewIntent(intent); if("cc.rustel.android.STOP".equals(intent.getAction())) send("\u001b[19~"); }
    @Override protected void onResume() { super.onResume(); if(camera!=null) camera.resume();if(started)send("\u001b[I"); }
    @Override public void onConfigurationChanged(android.content.res.Configuration config) { super.onConfigurationChanged(config);if(camera!=null)camera.displayChanged(); }
    @Override protected void onPause() { if(camera!=null) camera.pause();if(started)send("\u001b[O"); super.onPause(); }
    @Override public void onBackPressed() { send("\u001b"); }
    @Override protected void onDestroy() { disposed=true;nativeStop();if(audioRoutes!=null)audioRoutes.close();if(current==this)current=null;painted.release();closeOutputChannel();outputAcknowledgements.quitSafely();if(camera!=null)camera.dispose();if(web!=null)web.destroy();inputs.shutdownNow();super.onDestroy(); }
    @Override protected void onActivityResult(int request,int result,Intent data) {
        super.onActivityResult(request,result,data);
        final boolean patternRequest=request==IMPORT_PATTERNS || request==OPEN_DOCUMENT;
        if(result!=RESULT_OK || data==null || data.getData()==null) {
            if(patternRequest) patternPickerOpen.set(false);
            return;
        }
        // Keep the picker request owned through copy and native submission.
        // Otherwise a later selection can finish first and be overwritten by
        // the earlier, slower provider. Native submissions remain FIFO.
        Uri uri=data.getData();
        new Thread(()->{
            try {
                if(request==IMPORT_PATTERNS || request==OPEN_DOCUMENT) {
                    File staged=PatternImport.stage(getCacheDir(),getContentResolver().openInputStream(uri));
                    if(disposed || !nativeImportPattern(staged.getAbsolutePath(),documentName(uri),request==OPEN_DOCUMENT)) {
                        staged.delete();
                        throw new IOException("Rustel is not ready to import this pattern. Reopen the pattern importer and try again.");
                    }
                } else if(request==EXPORT_LOG) {
                    try(InputStream in=new FileInputStream(new File(getFilesDir(),"startup.log"));OutputStream out=getContentResolver().openOutputStream(uri)){copy(in,out);}
                } else if(request==EXPORT_SOURCE) {
                    try(InputStream in=getAssets().open("rustel-android-source.tar.gz");OutputStream out=getContentResolver().openOutputStream(uri)){copy(in,out);}
                    runOnUiThread(()->Toast.makeText(this,"App source exported",Toast.LENGTH_LONG).show());
                } else if(request==EXPORT) {
                    try(OutputStream out=getContentResolver().openOutputStream(uri);ZipOutputStream zip=new ZipOutputStream(out)) {
                        zipFolder(zip,new File(getFilesDir(),"Music"),"Music/");
                        zipFolder(zip,new File(getFilesDir(),"config"),"config/");
                        zipFolder(zip,new File(getFilesDir(),"startup.log"),"startup.log");
                    }
                    runOnUiThread(()->Toast.makeText(this,"Projects and settings exported",Toast.LENGTH_LONG).show());
                } else if(request==IMPORT) {
                    File directory=new File(getFilesDir(),"Music/Imported "+System.currentTimeMillis());directory.mkdirs();
                    try(InputStream in=getContentResolver().openInputStream(uri);OutputStream out=new FileOutputStream(new File(directory,"Imported.strudel"))) {
                        byte[] buffer=new byte[8192];int total=0,n;while((n=in.read(buffer))!=-1){total+=n;if(total>4*1024*1024)throw new IOException("Score is too large");out.write(buffer,0,n);}
                    }
                    runOnUiThread(()->new AlertDialog.Builder(this).setTitle("Score imported").setMessage("Open it from File > Open set. It is in Music/"+directory.getName()+".").setPositiveButton("OK",null).show());
                }
            } catch(Exception error) {
                runOnUiThread(()->{
                    if(!disposed && !isFinishing()) new AlertDialog.Builder(this).setTitle("File operation failed").setMessage(error.toString()).setPositiveButton("OK",null).show();
                });
            } finally {
                if(patternRequest) patternPickerOpen.set(false);
            }
        },"Rustel file transfer").start();
    }
    private String documentName(Uri uri) {
        try(Cursor cursor=getContentResolver().query(uri,new String[]{OpenableColumns.DISPLAY_NAME},null,null,null)) {
            if(cursor!=null && cursor.moveToFirst()) {
                String name=cursor.getString(0);
                if(name!=null && !name.trim().isEmpty()) return name;
            }
        } catch(RuntimeException error) {android.util.Log.w("Rustel","Could not read document name",error);}
        return "Downloaded patterns.json";
    }
    private void zipFolder(ZipOutputStream zip,File file,String path) throws IOException {
        if(!file.exists() || file.getName().equals("cache"))return;
        if(file.isDirectory()){File[] files=file.listFiles();if(files!=null)for(File child:files)zipFolder(zip,child,path+child.getName()+(child.isDirectory()?"/":""));}
        else if(file.isFile()){zip.putNextEntry(new ZipEntry(path));try(InputStream in=new FileInputStream(file)){copy(in,zip);}zip.closeEntry();}
    }
}
