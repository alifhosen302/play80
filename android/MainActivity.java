package com.play80.arcade.master.tournamentv41qa;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public final class MainActivity extends Activity {
    private static final String APP_PAGE = "file:///android_asset/index.html";
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
                android.net.Uri uri = request.getUrl();
                if (APP_PAGE.equals(view.getUrl()) && "play80-share".equals(uri.getScheme())
                        && "invite".equals(uri.getHost())) {
                    String text = uri.getQueryParameter("text");
                    if (text != null && text.length() <= 512) {
                        Intent send = new Intent(Intent.ACTION_SEND);
                        send.setType("text/plain");
                        send.putExtra(Intent.EXTRA_TEXT, text);
                        startActivity(Intent.createChooser(send, "PLAY80"));
                    }
                }
                return !APP_PAGE.equals(uri.toString());
            }
        });
        webView.loadUrl(APP_PAGE);
        setContentView(webView);
    }

    @Override
    public void onBackPressed() {
        webView.evaluateJavascript("window.play80NativeBack()", null);
    }
}
