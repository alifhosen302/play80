package com.play80.arcade.master.tournamentv41qa;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

public final class MainActivity extends Activity {
    private static final String APP_PAGE = "file:///android_asset/index.html";
    private static final Uri LATEST_APK = Uri.parse(
            "https://github.com/alifhosen302/play80/releases/download/"
                    + "qa-v5.2-unified-login-20261125/PLAY80_V5_2_GitHub_QA.apk");
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setAllowContentAccess(false);
        webView.getSettings().setAllowFileAccess(false);
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return true;
                return handleNavigation(view, request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleNavigation(view, Uri.parse(url));
            }
        });
        webView.loadUrl(APP_PAGE);
        setContentView(webView);
    }

    private boolean handleNavigation(WebView view, Uri uri) {
        if (APP_PAGE.equals(view.getUrl())) {
            if ("play80-download://latest".equals(uri.toString())) {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, LATEST_APK));
                } catch (ActivityNotFoundException exception) {
                    Toast.makeText(this, "ডাউনলোডের জন্য একটি ব্রাউজার দরকার।", Toast.LENGTH_LONG).show();
                }
                return true;
            }
            if ("play80-share".equals(uri.getScheme()) && "invite".equals(uri.getHost())) {
                String text = uri.getQueryParameter("text");
                if (text != null && text.length() <= 512) {
                    Intent send = new Intent(Intent.ACTION_SEND);
                    send.setType("text/plain");
                    send.putExtra(Intent.EXTRA_TEXT, text);
                    startActivity(Intent.createChooser(send, "PLAY80"));
                }
            }
        }
        return !APP_PAGE.equals(uri.toString());
    }

    @Override
    public void onBackPressed() {
        webView.evaluateJavascript("window.play80NativeBack()", null);
    }
}
