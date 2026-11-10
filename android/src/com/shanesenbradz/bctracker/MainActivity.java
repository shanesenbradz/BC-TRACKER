package com.shanesenbradz.bctracker;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.AssetManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/**
 * A full-screen WebView showing the web app from inside the APK.
 * Pages load from https://appassets.androidplatform.net/ so the app has a
 * normal secure origin (localStorage and IndexedDB work and persist), and
 * every file comes from the APK's assets, so it works offline.
 */
public class MainActivity extends Activity {
    static final String HOST = "appassets.androidplatform.net";
    static final String START = "https://" + HOST + "/index.html";
    private static final int REQ_PICK = 41, REQ_SAVE = 42, REQ_NOTIF = 43;

    WebView web;
    private FrameLayout root;
    private ValueCallback<Uri[]> pickCallback;
    private String pendingSave;
    private boolean darkChrome = true;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        FastStore.ensureChannel(this);

        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= 30) {
            w.setDecorFitsSystemWindows(false);
        } else {
            w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
        w.setStatusBarColor(Color.TRANSPARENT);
        w.setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= 29) {
            w.setStatusBarContrastEnforced(false);
            w.setNavigationBarContrastEnforced(false);
        }

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);

        /* Keep the app clear of the status bar, navigation bar and keyboard */
        root.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
            @Override
            @SuppressWarnings("deprecation")
            public WindowInsets onApplyWindowInsets(View v, WindowInsets in) {
                int l, t, r, b;
                if (Build.VERSION.SDK_INT >= 30) {
                    android.graphics.Insets sys = in.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                    android.graphics.Insets ime = in.getInsets(WindowInsets.Type.ime());
                    l = sys.left; t = sys.top; r = sys.right; b = Math.max(sys.bottom, ime.bottom);
                } else {
                    l = in.getSystemWindowInsetLeft(); t = in.getSystemWindowInsetTop();
                    r = in.getSystemWindowInsetRight(); b = in.getSystemWindowInsetBottom();
                }
                v.setPadding(l, t, r, b);
                return in;
            }
        });

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setUserAgentString(s.getUserAgentString() + " BCTrackerApp/" + BuildInfo.VERSION);

        web.addJavascriptInterface(new Bridge(this), "BCNative");
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        setChrome(true);

        if (saved == null || !restoreWeb(saved)) web.loadUrl(START);
    }

    private boolean restoreWeb(Bundle saved) {
        return web.restoreState(saved) != null;
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) {
            web.onResume();
            js("window.bcNativeEvent&&window.bcNativeEvent('resume',true)");
        }
    }

    @Override
    protected void onPause() {
        if (web != null) web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.removeJavascriptInterface("BCNative");
            web.destroy();
        }
        super.onDestroy();
    }

    void js(final String code) {
        runOnUiThread(new Runnable() {
            @Override public void run() { if (web != null) web.evaluateJavascript(code, null); }
        });
    }

    static String jsString(String s) {
        StringBuilder b = new StringBuilder("\"");
        for (char ch : s.toCharArray()) {
            if (ch == '"' || ch == '\\') b.append('\\').append(ch);
            else if (ch == '\n') b.append("\\n");
            else if (ch < 0x20 || ch == 0x2028 || ch == 0x2029) b.append(String.format("\\u%04x", (int) ch));
            else b.append(ch);
        }
        return b.append('"').toString();
    }

    void toast(String msg) {
        js("window.Motion&&Motion.toast(" + jsString(msg) + ")");
    }

    /* Back button: let the app step back first (close a prompt, go to Today) */
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (web == null) { super.onBackPressed(); return; }
        web.evaluateJavascript("!!(window.bcBack&&window.bcBack())", new ValueCallback<String>() {
            @Override public void onReceiveValue(String handled) {
                if (!"true".equals(handled)) moveTaskToBack(true);
            }
        });
    }

    /* Status and navigation bar icons follow the app's light or dark theme */
    @SuppressWarnings("deprecation")
    void setChrome(boolean dark) {
        darkChrome = dark;
        int bg = dark ? Color.BLACK : Color.rgb(0xF2, 0xF2, 0xF7);
        root.setBackgroundColor(bg);
        web.setBackgroundColor(bg);
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                int mask = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                c.setSystemBarsAppearance(dark ? 0 : mask, mask);
            }
        } else {
            View d = getWindow().getDecorView();
            int f = d.getSystemUiVisibility();
            int light = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | (Build.VERSION.SDK_INT >= 26 ? View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR : 0);
            d.setSystemUiVisibility(dark ? (f & ~light) : (f | light));
        }
    }

    /* ---------------- Notifications permission ---------------- */

    void askNotifications() {
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIF);
            return;
        }
        if (FastStore.notificationsAllowed(this)) {
            js("window.bcNativeEvent&&window.bcNativeEvent('notif',true)");
            return;
        }
        /* Turned off in system settings: open the app's notification page */
        try {
            Intent i = new Intent("android.settings.APP_NOTIFICATION_SETTINGS")
                    .putExtra("android.provider.extra.APP_PACKAGE", getPackageName());
            startActivity(i);
        } catch (Exception ignored) {}
        js("window.bcNativeEvent&&window.bcNativeEvent('notif',false)");
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        if (code != REQ_NOTIF) return;
        boolean ok = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
        if (ok) FastStore.ensureChannel(this);
        js("window.bcNativeEvent&&window.bcNativeEvent('notif'," + ok + ")");
    }

    /* ---------------- Saving the backup file ---------------- */

    void saveFile(String name, String mime, String content) {
        pendingSave = content;
        Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT)
                .addCategory(Intent.CATEGORY_OPENABLE)
                .setType(mime == null || mime.isEmpty() ? "application/json" : mime)
                .putExtra(Intent.EXTRA_TITLE, name);
        try {
            startActivityForResult(i, REQ_SAVE);
        } catch (ActivityNotFoundException e) {
            pendingSave = null;
            toast("No app found to save files.");
        }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req == REQ_PICK) {
            Uri[] picked = null;
            if (res == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    int n = data.getClipData().getItemCount();
                    picked = new Uri[n];
                    for (int i = 0; i < n; i++) picked[i] = data.getClipData().getItemAt(i).getUri();
                } else if (data.getData() != null) {
                    picked = new Uri[]{data.getData()};
                }
            }
            if (pickCallback != null) pickCallback.onReceiveValue(picked);
            pickCallback = null;
            return;
        }
        if (req == REQ_SAVE) {
            String content = pendingSave;
            pendingSave = null;
            if (res != RESULT_OK || data == null || data.getData() == null || content == null) return;
            try (OutputStream os = getContentResolver().openOutputStream(data.getData(), "wt")) {
                if (os == null) throw new Exception("no stream");
                os.write(content.getBytes(StandardCharsets.UTF_8));
                toast("Backup saved");
            } catch (Exception e) {
                toast("Could not save the backup file.");
            }
            return;
        }
        super.onActivityResult(req, res, data);
    }

    /* ---------------- WebView plumbing ---------------- */

    private static final Map<String, String> MIME = new HashMap<>();
    static {
        MIME.put("html", "text/html"); MIME.put("js", "text/javascript"); MIME.put("css", "text/css");
        MIME.put("json", "application/json"); MIME.put("png", "image/png"); MIME.put("svg", "image/svg+xml");
        MIME.put("webmanifest", "application/manifest+json"); MIME.put("ico", "image/x-icon");
    }

    private class Client extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
            Uri u = req.getUrl();
            if (!HOST.equals(u.getHost())) return null;
            String path = u.getPath();
            if (path == null || path.equals("/") || path.isEmpty()) path = "/index.html";
            if (path.contains("..")) return notFound();
            String ext = path.substring(path.lastIndexOf('.') + 1).toLowerCase();
            String mime = MIME.containsKey(ext) ? MIME.get(ext) : "application/octet-stream";
            try {
                InputStream in = getAssets().open("www" + path, AssetManager.ACCESS_STREAMING);
                WebResourceResponse r = new WebResourceResponse(mime, mime.startsWith("text") || mime.contains("json") ? "UTF-8" : null, in);
                Map<String, String> h = new HashMap<>();
                h.put("Cache-Control", "no-cache");
                r.setResponseHeaders(h);
                return r;
            } catch (Exception e) {
                return notFound();
            }
        }

        private WebResourceResponse notFound() {
            WebResourceResponse r = new WebResourceResponse("text/plain", "UTF-8", null);
            r.setStatusCodeAndReasonPhrase(404, "Not Found");
            return r;
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
            Uri u = req.getUrl();
            if (HOST.equals(u.getHost())) return false;
            try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) {}
            return true;
        }
    }

    private class Chrome extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb, FileChooserParams params) {
            if (pickCallback != null) pickCallback.onReceiveValue(null);
            pickCallback = cb;
            String type = "*/*";
            String[] accept = params.getAcceptTypes();
            if (accept != null) {
                for (String a : accept) {
                    if (a != null && a.startsWith("image")) { type = "image/*"; break; }
                }
            }
            Intent i = new Intent(Intent.ACTION_GET_CONTENT).addCategory(Intent.CATEGORY_OPENABLE).setType(type);
            try {
                startActivityForResult(Intent.createChooser(i, type.startsWith("image") ? "Choose a wallpaper" : "Choose a backup file"), REQ_PICK);
            } catch (ActivityNotFoundException e) {
                pickCallback = null;
                return false;
            }
            return true;
        }
    }
}
