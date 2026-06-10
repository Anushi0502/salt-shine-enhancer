package com.saltonlinestore.saltstoreandroid.ui.policy;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.text.Layout;
import android.text.TextUtils;
import android.text.method.LinkMovementMethod;
import android.view.View;
import android.widget.TextView;
import android.widget.LinearLayout;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.text.HtmlCompat;

import com.google.android.material.appbar.MaterialToolbar;
import com.google.android.material.button.MaterialButton;
import com.google.android.material.card.MaterialCardView;
import com.google.android.material.progressindicator.LinearProgressIndicator;
import com.saltonlinestore.saltstoreandroid.R;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class NativePolicyActivity extends AppCompatActivity {
    public static final String EXTRA_URL = "extra_url";
    public static final String EXTRA_TITLE = "extra_title";
    public static final String EXTRA_SUBTITLE = "extra_subtitle";
    private static final Pattern POLICY_HEADING_PATTERN = Pattern.compile("(?is)<h2[^>]*>(.*?)</h2>");
    private static final Pattern LAST_UPDATED_PATTERN = Pattern.compile("(?i)last updated:\\s*([^<\\n]+)");

    private View loadingOverlay;
    private View errorOverlay;
    private LinearProgressIndicator loadingBar;
    private LinearLayout contentContainer;
    private TextView errorMessage;

    public static void open(@NonNull Context context, @NonNull String title, @NonNull String subtitle, @NonNull String url) {
        Intent intent = new Intent(context, NativePolicyActivity.class);
        intent.putExtra(EXTRA_TITLE, title);
        intent.putExtra(EXTRA_SUBTITLE, subtitle);
        intent.putExtra(EXTRA_URL, url);
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
        setContentView(R.layout.activity_native_policy);

        MaterialToolbar toolbar = findViewById(R.id.policy_toolbar);
        setSupportActionBar(toolbar);
        if (getSupportActionBar() != null) {
            getSupportActionBar().setDisplayHomeAsUpEnabled(true);
            getSupportActionBar().setDisplayShowHomeEnabled(true);
            getSupportActionBar().setTitle(defaultTitle());
            getSupportActionBar().setSubtitle(getIntent().getStringExtra(EXTRA_SUBTITLE));
        }
        toolbar.setNavigationOnClickListener(v -> onBackPressed());

        loadingOverlay = findViewById(R.id.policy_loading_overlay);
        errorOverlay = findViewById(R.id.policy_error_overlay);
        loadingBar = findViewById(R.id.policy_loading_bar);
        contentContainer = findViewById(R.id.policy_content_container);
        errorMessage = findViewById(R.id.policy_error_message);
        MaterialButton retryButton = findViewById(R.id.policy_retry);

        retryButton.setOnClickListener(v -> renderPolicy());
        renderPolicy();
    }

    private void renderPolicy() {
        showLoading();
        errorOverlay.setVisibility(View.GONE);
        contentContainer.removeAllViews();

        try {
            PolicyContent content = loadPolicyContent();
            if (content == null || TextUtils.isEmpty(content.bodyHtml)) {
                showError("This policy is not available in-app yet.");
                return;
            }
            if (getSupportActionBar() != null) {
                getSupportActionBar().setTitle(content.title);
                getSupportActionBar().setSubtitle(content.subtitle);
            }
            renderSummaryCard(content);
            List<PolicySection> sections = parseSections(content.bodyHtml);
            if (sections.isEmpty()) {
                showError("This policy is not available in-app yet.");
                return;
            }
            for (PolicySection section : sections) {
                renderSectionCard(section);
            }
            hideLoading();
        } catch (Throwable error) {
            showError("Unable to load this policy in-app.");
        }
    }

    @Nullable
    private PolicyContent loadPolicyContent() throws IOException {
        String url = String.valueOf(getIntent().getStringExtra(EXTRA_URL) == null ? "" : getIntent().getStringExtra(EXTRA_URL));
        String normalized = url.toLowerCase();
        if (normalized.contains("/policies/shipping-policy")) {
            return new PolicyContent("Shipping & delivery", getIntent().getStringExtra(EXTRA_SUBTITLE), readAsset("policies/shipping-policy.html"));
        }
        if (normalized.contains("/policies/refund-policy")) {
            return new PolicyContent("Returns & refunds", getIntent().getStringExtra(EXTRA_SUBTITLE), readAsset("policies/refund-policy.html"));
        }
        if (normalized.contains("/policies/privacy-policy")) {
            return new PolicyContent("Privacy policy", getIntent().getStringExtra(EXTRA_SUBTITLE), readAsset("policies/privacy-policy.html"));
        }
        if (normalized.contains("/policies/contact-information")) {
            return new PolicyContent("Contact information", getIntent().getStringExtra(EXTRA_SUBTITLE), readAsset("policies/contact-information.html"));
        }
        if (normalized.contains("/pages/faqs") || normalized.contains("/pages/faq")) {
            return new PolicyContent("FAQs", getIntent().getStringExtra(EXTRA_SUBTITLE), readAsset("policies/faq.html"));
        }
        return null;
    }

    private String readAsset(@NonNull String assetPath) throws IOException {
        try (InputStream inputStream = getAssets().open(assetPath);
             InputStreamReader reader = new InputStreamReader(inputStream, StandardCharsets.UTF_8);
             BufferedReader bufferedReader = new BufferedReader(reader)) {
            StringBuilder builder = new StringBuilder();
            char[] buffer = new char[4096];
            int read;
            while ((read = bufferedReader.read(buffer)) != -1) {
                builder.append(buffer, 0, read);
            }
            return builder.toString();
        }
    }

    private void renderSummaryCard(@NonNull PolicyContent content) {
        MaterialCardView card = new MaterialCardView(this);
        LinearLayout.LayoutParams cardParams = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        cardParams.bottomMargin = dp(12);
        card.setLayoutParams(cardParams);
        card.setCardBackgroundColor(getColor(R.color.salt_surface));
        card.setRadius(dp(28));
        card.setCardElevation(0f);
        card.setStrokeColor(getColor(R.color.salt_outline));
        card.setStrokeWidth(dp(1));

        LinearLayout wrapper = new LinearLayout(this);
        wrapper.setOrientation(LinearLayout.VERTICAL);
        wrapper.setPadding(dp(20), dp(20), dp(20), dp(20));

        TextView titleView = new TextView(this);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        titleParams.topMargin = 0;
        titleView.setLayoutParams(titleParams);
        titleView.setText(content.title);
        titleView.setTextColor(getColor(R.color.salt_ink));
        titleView.setTextSize(26f);
        titleView.setTypeface(titleView.getTypeface(), android.graphics.Typeface.BOLD);
        titleView.setLetterSpacing(0.01f);
        wrapper.addView(titleView);

        String subtitle = TextUtils.isEmpty(content.subtitle)
                ? "Official policy rendered in-app."
                : content.subtitle.trim();
        TextView subtitleView = new TextView(this);
        LinearLayout.LayoutParams subtitleParams = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        subtitleParams.topMargin = dp(8);
        subtitleView.setLayoutParams(subtitleParams);
        subtitleView.setText(subtitle);
        subtitleView.setTextColor(getColor(R.color.salt_muted));
        subtitleView.setTextSize(14f);
        subtitleView.setLineSpacing(dp(4), 1f);
        subtitleView.setLetterSpacing(0.005f);
        wrapper.addView(subtitleView);

        String lastUpdated = extractLastUpdated(content.bodyHtml);
        if (!TextUtils.isEmpty(lastUpdated)) {
            TextView updatedView = new TextView(this);
            LinearLayout.LayoutParams updatedParams = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            updatedParams.topMargin = dp(12);
            updatedView.setLayoutParams(updatedParams);
            updatedView.setText("Updated " + lastUpdated);
            updatedView.setTextColor(getColor(R.color.salt_muted));
            updatedView.setTextSize(12.5f);
            updatedView.setTypeface(updatedView.getTypeface(), android.graphics.Typeface.BOLD);
            updatedView.setLetterSpacing(0.015f);
            wrapper.addView(updatedView);
        }

        card.addView(wrapper);
        contentContainer.addView(card);
    }

    private void renderSectionCard(@NonNull PolicySection section) {
        String title = TextUtils.isEmpty(section.title) ? "Overview" : section.title.trim();
        String bodyHtml = TextUtils.isEmpty(section.bodyHtml) ? "" : section.bodyHtml.trim();
        if (bodyHtml.isEmpty()) {
            return;
        }

        MaterialCardView card = new MaterialCardView(this);
        LinearLayout.LayoutParams cardParams = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        cardParams.bottomMargin = dp(12);
        card.setLayoutParams(cardParams);
        card.setCardBackgroundColor(getColor(R.color.salt_surface));
        card.setRadius(dp(28));
        card.setCardElevation(0f);
        card.setStrokeColor(getColor(R.color.salt_outline));
        card.setStrokeWidth(dp(1));

        LinearLayout wrapper = new LinearLayout(this);
        wrapper.setOrientation(LinearLayout.VERTICAL);
        wrapper.setPadding(dp(20), dp(20), dp(20), dp(20));

        TextView titleView = new TextView(this);
        titleView.setLayoutParams(new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        titleView.setText(title);
        titleView.setTextColor(getColor(R.color.salt_ink));
        titleView.setTextSize(18f);
        titleView.setTypeface(titleView.getTypeface(), android.graphics.Typeface.BOLD);
        titleView.setLetterSpacing(0.005f);
        wrapper.addView(titleView);

        TextView body = new TextView(this);
        LinearLayout.LayoutParams bodyParams = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        bodyParams.topMargin = dp(10);
        body.setLayoutParams(bodyParams);
        body.setText(HtmlCompat.fromHtml(bodyHtml, HtmlCompat.FROM_HTML_MODE_LEGACY));
        body.setTextColor(getColor(R.color.salt_ink));
        body.setTextSize(15.5f);
        body.setLineSpacing(dp(5), 1f);
        body.setIncludeFontPadding(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            body.setBreakStrategy(Layout.BREAK_STRATEGY_HIGH_QUALITY);
            body.setHyphenationFrequency(Layout.HYPHENATION_FREQUENCY_NORMAL);
        }
        body.setMovementMethod(LinkMovementMethod.getInstance());
        body.setAutoLinkMask(android.text.util.Linkify.ALL);
        body.setTextIsSelectable(false);
        wrapper.addView(body);

        card.addView(wrapper);
        contentContainer.addView(card);
    }

    @NonNull
    private List<PolicySection> parseSections(@NonNull String bodyHtml) {
        List<PolicySection> sections = new ArrayList<>();
        String html = bodyHtml.trim();
        if (html.isEmpty()) {
            return sections;
        }

        List<SectionMarker> markers = new ArrayList<>();
        Matcher matcher = POLICY_HEADING_PATTERN.matcher(html);
        while (matcher.find()) {
            String heading = cleanHtmlText(matcher.group(1));
            markers.add(new SectionMarker(matcher.start(), matcher.end(), heading));
        }

        if (markers.isEmpty()) {
            sections.add(new PolicySection("", html));
            return sections;
        }

        if (markers.get(0).start > 0) {
            String introHtml = html.substring(0, markers.get(0).start).trim();
            if (!introHtml.isEmpty()) {
                sections.add(new PolicySection("", introHtml));
            }
        }

        for (int index = 0; index < markers.size(); index++) {
            SectionMarker marker = markers.get(index);
            int bodyStart = marker.end;
            int bodyEnd = index + 1 < markers.size() ? markers.get(index + 1).start : html.length();
            String sectionBody = html.substring(bodyStart, bodyEnd).trim();
            if (sectionBody.isEmpty()) {
                continue;
            }
            sections.add(new PolicySection(marker.title, sectionBody));
        }

        return sections;
    }

    @NonNull
    private String extractLastUpdated(@NonNull String bodyHtml) {
        String plainText = HtmlCompat.fromHtml(bodyHtml, HtmlCompat.FROM_HTML_MODE_LEGACY).toString();
        Matcher matcher = LAST_UPDATED_PATTERN.matcher(plainText);
        if (matcher.find()) {
            return matcher.group(1).trim();
        }
        return "";
    }

    @NonNull
    private String cleanHtmlText(@Nullable String html) {
        if (TextUtils.isEmpty(html)) {
            return "";
        }
        return HtmlCompat.fromHtml(html, HtmlCompat.FROM_HTML_MODE_LEGACY).toString().trim();
    }

    private void showLoading() {
        loadingOverlay.setVisibility(View.VISIBLE);
        loadingBar.setVisibility(View.VISIBLE);
        contentContainer.setVisibility(View.GONE);
    }

    private void hideLoading() {
        loadingOverlay.setVisibility(View.GONE);
        loadingBar.setVisibility(View.GONE);
        contentContainer.setVisibility(View.VISIBLE);
    }

    private void showError(@NonNull String message) {
        hideLoading();
        contentContainer.setVisibility(View.GONE);
        errorMessage.setText(message);
        errorOverlay.setVisibility(View.VISIBLE);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private String defaultTitle() {
        String title = getIntent().getStringExtra(EXTRA_TITLE);
        return TextUtils.isEmpty(title) ? "Policy" : title;
    }

    private static final class SectionMarker {
        final int start;
        final int end;
        final String title;

        SectionMarker(int start, int end, String title) {
            this.start = start;
            this.end = end;
            this.title = title == null ? "" : title.trim();
        }
    }

    private static final class PolicySection {
        final String title;
        final String bodyHtml;

        PolicySection(String title, String bodyHtml) {
            this.title = title == null ? "" : title;
            this.bodyHtml = bodyHtml == null ? "" : bodyHtml;
        }
    }

    private static final class PolicyContent {
        final String title;
        final String subtitle;
        final String bodyHtml;

        PolicyContent(String title, String subtitle, String bodyHtml) {
            this.title = title;
            this.subtitle = subtitle;
            this.bodyHtml = bodyHtml;
        }
    }
}
