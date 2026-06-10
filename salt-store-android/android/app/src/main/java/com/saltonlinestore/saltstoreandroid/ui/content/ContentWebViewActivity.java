package com.saltonlinestore.saltstoreandroid.ui.content;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;

import com.google.android.material.appbar.MaterialToolbar;
import com.google.android.material.button.MaterialButton;
import com.google.android.material.progressindicator.CircularProgressIndicator;
import com.google.android.material.progressindicator.LinearProgressIndicator;
import com.saltonlinestore.saltstoreandroid.BuildConfig;
import com.saltonlinestore.saltstoreandroid.R;

public class ContentWebViewActivity extends AppCompatActivity {
    public static final String EXTRA_URL = "extra_url";
    public static final String EXTRA_TITLE = "extra_title";
    public static final String EXTRA_SUBTITLE = "extra_subtitle";

    private WebView contentWebView;
    private View loadingOverlay;
    private View errorOverlay;
    private LinearProgressIndicator loadingBar;
    private TextView errorMessage;
    private String contentUrl;

    public static void open(@NonNull Context context, @NonNull String title, @NonNull String subtitle, @NonNull String url) {
        Intent intent = new Intent(context, ContentWebViewActivity.class);
        intent.putExtra(EXTRA_URL, url);
        intent.putExtra(EXTRA_TITLE, title);
        intent.putExtra(EXTRA_SUBTITLE, subtitle);
        if (!(context instanceof Activity)) {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        }
        context.startActivity(intent);
    }

    public static void open(@NonNull Context context, @NonNull String title, @NonNull String url) {
        open(context, title, "", url);
    }

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_content_webview);

        MaterialToolbar toolbar = findViewById(R.id.content_toolbar);
        setSupportActionBar(toolbar);
        if (getSupportActionBar() != null) {
            getSupportActionBar().setDisplayHomeAsUpEnabled(true);
            getSupportActionBar().setDisplayShowHomeEnabled(true);
            getSupportActionBar().setTitle(TextUtils.isEmpty(getIntent().getStringExtra(EXTRA_TITLE)) ? "Content" : getIntent().getStringExtra(EXTRA_TITLE));
            getSupportActionBar().setSubtitle(getIntent().getStringExtra(EXTRA_SUBTITLE));
        }
        toolbar.setNavigationOnClickListener(v -> onBackPressed());

        contentWebView = findViewById(R.id.content_webview);
        loadingOverlay = findViewById(R.id.content_loading_overlay);
        errorOverlay = findViewById(R.id.content_error_overlay);
        loadingBar = findViewById(R.id.content_loading_bar);
        errorMessage = findViewById(R.id.content_error_message);
        MaterialButton retryButton = findViewById(R.id.content_retry);
        MaterialButton openBrowserButton = findViewById(R.id.content_open_browser);

        contentUrl = getIntent().getStringExtra(EXTRA_URL);
        if (TextUtils.isEmpty(contentUrl)) {
            showError("Content link is missing.");
            return;
        }

        retryButton.setOnClickListener(v -> loadContent(contentUrl));
        openBrowserButton.setOnClickListener(v -> openExternal(contentUrl));
        setupWebView();
        loadContent(contentUrl);
    }

    private void setupWebView() {
        WebSettings settings = contentWebView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setUserAgentString(settings.getUserAgentString() + " SALTContent/1.0");

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            cookieManager.setAcceptThirdPartyCookies(contentWebView, true);
        }

        contentWebView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri == null ? null : uri.getScheme();
                if (scheme == null) {
                    return false;
                }
                if ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) {
                    return false;
                }
                openExternal(uri.toString());
                return true;
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                showLoading();
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                hideLoading();
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request != null && request.isForMainFrame()) {
                    showError("Unable to load this page in-app.");
                }
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                showError("Unable to load this page in-app.");
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
                if (request != null && request.isForMainFrame()) {
                    int statusCode = errorResponse == null ? -1 : errorResponse.getStatusCode();
                    if (statusCode >= 400) {
                        showError("This page returned " + statusCode + " in-app.");
                    }
                }
            }
        });

        contentWebView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onReceivedTitle(WebView view, String title) {
                if (!TextUtils.isEmpty(title) && getSupportActionBar() != null) {
                    getSupportActionBar().setSubtitle(title);
                }
            }
        });

        if (BuildConfig.DEBUG) {
            WebView.setWebContentsDebuggingEnabled(true);
        }
    }

    private void loadContent(@NonNull String url) {
        errorOverlay.setVisibility(View.GONE);
        contentWebView.setVisibility(View.VISIBLE);
        contentWebView.loadUrl(url);
        showLoading();
    }

    private void showLoading() {
        loadingOverlay.setVisibility(View.VISIBLE);
        loadingBar.setVisibility(View.VISIBLE);
    }

    private void hideLoading() {
        loadingOverlay.setVisibility(View.GONE);
        loadingBar.setVisibility(View.GONE);
    }

    private void showError(@NonNull String message) {
        hideLoading();
        contentWebView.setVisibility(View.GONE);
        errorMessage.setText(message);
        errorOverlay.setVisibility(View.VISIBLE);
    }

    private void openExternal(@NonNull String url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (ActivityNotFoundException ignored) {
            // No external handler available.
        }
    }

    @Override
    public void onBackPressed() {
        if (contentWebView != null && contentWebView.canGoBack()) {
            contentWebView.goBack();
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (contentWebView != null) {
            contentWebView.destroy();
        }
        super.onDestroy();
    }
}
