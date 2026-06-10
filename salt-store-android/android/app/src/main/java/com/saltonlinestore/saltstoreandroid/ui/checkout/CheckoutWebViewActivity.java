package com.saltonlinestore.saltstoreandroid.ui.checkout;

import android.content.ActivityNotFoundException;
import android.app.Activity;
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

public class CheckoutWebViewActivity extends AppCompatActivity {
    public static final String EXTRA_URL = "extra_url";

    private WebView checkoutWebView;
    private View loadingOverlay;
    private View errorOverlay;
    private LinearProgressIndicator loadingBar;
    private TextView errorMessage;
    private String checkoutUrl;

    public static void open(@NonNull Context context, @NonNull String url) {
        Intent intent = new Intent(context, CheckoutWebViewActivity.class);
        intent.putExtra(EXTRA_URL, url);
        if (!(context instanceof Activity)) {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        }
        context.startActivity(intent);
    }

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_checkout_webview);

        MaterialToolbar toolbar = findViewById(R.id.checkout_toolbar);
        setSupportActionBar(toolbar);
        if (getSupportActionBar() != null) {
            getSupportActionBar().setDisplayHomeAsUpEnabled(true);
            getSupportActionBar().setDisplayShowHomeEnabled(true);
            getSupportActionBar().setTitle("Checkout");
            getSupportActionBar().setSubtitle("Secure in-app Shopify checkout");
        }
        toolbar.setNavigationOnClickListener(v -> onBackPressed());

        checkoutWebView = findViewById(R.id.checkout_webview);
        loadingOverlay = findViewById(R.id.checkout_loading_overlay);
        errorOverlay = findViewById(R.id.checkout_error_overlay);
        loadingBar = findViewById(R.id.checkout_loading_bar);
        errorMessage = findViewById(R.id.checkout_error_message);
        MaterialButton retryButton = findViewById(R.id.checkout_retry);
        MaterialButton openBrowserButton = findViewById(R.id.checkout_open_browser);

        checkoutUrl = getIntent().getStringExtra(EXTRA_URL);
        if (TextUtils.isEmpty(checkoutUrl)) {
            showError("Checkout link is missing.");
            return;
        }

        retryButton.setOnClickListener(v -> loadCheckout(checkoutUrl));
        openBrowserButton.setOnClickListener(v -> openExternal(checkoutUrl));
        setupWebView();
        loadCheckout(checkoutUrl);
    }

    private void setupWebView() {
        WebSettings settings = checkoutWebView.getSettings();
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
        settings.setUserAgentString(settings.getUserAgentString() + " SALTCheckout/1.0");

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            cookieManager.setAcceptThirdPartyCookies(checkoutWebView, true);
        }

        checkoutWebView.setWebViewClient(new WebViewClient() {
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
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (ActivityNotFoundException ignored) {
                    // Stay in the checkout shell if there is no external handler.
                }
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
                    showError("Unable to load checkout. Please try again.");
                }
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                showError("Unable to load checkout. Please try again.");
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
                if (request != null && request.isForMainFrame()) {
                    int statusCode = errorResponse == null ? -1 : errorResponse.getStatusCode();
                    if (statusCode >= 400) {
                        showError("Checkout returned " + statusCode + ". Try again or open externally.");
                    }
                }
            }
        });

        checkoutWebView.setWebChromeClient(new WebChromeClient() {
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

    private void loadCheckout(@NonNull String url) {
        errorOverlay.setVisibility(View.GONE);
        checkoutWebView.setVisibility(View.VISIBLE);
        checkoutWebView.loadUrl(url);
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
        checkoutWebView.setVisibility(View.GONE);
        errorMessage.setText(message);
        errorOverlay.setVisibility(View.VISIBLE);
    }

    @Override
    public void onBackPressed() {
        if (checkoutWebView != null && checkoutWebView.canGoBack()) {
            checkoutWebView.goBack();
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (checkoutWebView != null) {
            checkoutWebView.destroy();
        }
        super.onDestroy();
    }

    private boolean openExternal(@NonNull String url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            finish();
            return true;
        } catch (ActivityNotFoundException ignored) {
            // No browser available.
            return false;
        }
    }
}
