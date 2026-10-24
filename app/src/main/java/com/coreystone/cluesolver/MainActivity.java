package com.coreystone.cluesolver;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

/** Hosts the clue solver web UI bundled in assets/. */
public class MainActivity extends Activity {
    private static final String CLAUDE_PACKAGE = "com.anthropic.claude";
    private WebView webView;

    /** Exposed to the page as window.Android. Only our bundled page is ever loaded. */
    private class Bridge {
        @JavascriptInterface
        public void askClaude(String text) {
            runOnUiThread(() -> openClaude(text));
        }
    }

    /**
     * Copies the question, then tries (1) sharing it straight into the Claude app,
     * (2) just launching the Claude app, (3) the Android share sheet.
     * The clipboard copy means the user can always paste if the text isn't pre-filled.
     */
    private void openClaude(String text) {
        ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        if (cm != null) cm.setPrimaryClip(ClipData.newPlainText("Clue question", text));

        Intent share = new Intent(Intent.ACTION_SEND);
        share.setType("text/plain");
        share.putExtra(Intent.EXTRA_TEXT, text);

        Intent direct = new Intent(share).setPackage(CLAUDE_PACKAGE);
        try {
            startActivity(direct);
            toast("Copied too — paste it if the message box is empty");
            return;
        } catch (ActivityNotFoundException ignored) {
            // Claude app doesn't accept shares (or isn't installed); try launching it
        }
        Intent launch = getPackageManager().getLaunchIntentForPackage(CLAUDE_PACKAGE);
        if (launch != null) {
            startActivity(launch);
            toast("Copied — paste it into Claude");
            return;
        }
        startActivity(Intent.createChooser(share, "Ask Claude with…"));
    }

    private void toast(String msg) {
        Toast.makeText(this, msg, Toast.LENGTH_LONG).show();
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.parseColor("#1b1610"));
        getWindow().setNavigationBarColor(Color.parseColor("#221b13"));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#15110c"));
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setTextZoom(100);

        webView.addJavascriptInterface(new Bridge(), "Android");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("file".equals(uri.getScheme())) return false;
                // Links (e.g. to the wiki) open in the browser instead of replacing the app.
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (ActivityNotFoundException ignored) {
                    // no browser installed; stay put
                }
                return true;
            }
        });

        setContentView(webView);
        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            webView.loadUrl("file:///android_asset/index.html");
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        // Let the page close panels / switch tabs first; exit only if it has nothing to undo.
        webView.evaluateJavascript("window.appBack ? window.appBack() : false", result -> {
            if (!"true".equals(result)) MainActivity.super.onBackPressed();
        });
    }
}
