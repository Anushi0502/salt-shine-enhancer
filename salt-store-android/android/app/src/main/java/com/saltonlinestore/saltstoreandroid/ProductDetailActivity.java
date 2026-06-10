package com.saltonlinestore.saltstoreandroid;

import android.graphics.Paint;
import android.graphics.Typeface;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.text.HtmlCompat;
import androidx.viewpager2.widget.MarginPageTransformer;
import androidx.viewpager2.widget.ViewPager2;

import com.google.android.material.appbar.MaterialToolbar;
import com.google.android.material.chip.Chip;
import com.google.android.material.chip.ChipGroup;
import com.google.android.material.button.MaterialButton;
import com.google.android.material.card.MaterialCardView;
import com.saltonlinestore.saltstoreandroid.data.StoreHistoryStore;
import com.saltonlinestore.saltstoreandroid.data.StorePrefs;
import com.saltonlinestore.saltstoreandroid.data.StoreRepository;
import com.saltonlinestore.saltstoreandroid.model.StoreProduct;
import com.saltonlinestore.saltstoreandroid.model.StoreVariant;
import com.saltonlinestore.saltstoreandroid.ui.adapter.ProductImagePagerAdapter;
import com.saltonlinestore.saltstoreandroid.util.StoreFormat;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class ProductDetailActivity extends AppCompatActivity {
    public static final String EXTRA_HANDLE = "extra_handle";
    private static final int COLLAPSED_LINES = 6;
    private static final int COLLAPSED_CHAR_LIMIT = 280;
    private static final Pattern SPEC_SECTION_PATTERN = Pattern.compile(
            "(?i)^(specifications?|specs?|details?|product details?|highlights?|features?|materials?|dimensions?|what'?s included|what is included|in the box|care|shipping|returns)\\s*[:\\-–—]?\\s*(.*)$"
    );
    private static final Pattern HEADING_PATTERN = Pattern.compile(
            "(?i)^(description|overview|about this item|specifications?|specs?|details?|product details?|highlights?|features?|materials?|dimensions?|what'?s included|what is included|in the box|care|shipping|returns)\\s*[:\\-–—]?\\s*(.*)$"
    );
    private static final Pattern KEY_VALUE_PATTERN = Pattern.compile("^(?<key>[^:]{2,50}?)[\\s]*[:\\-–—][\\s]*(?<value>.+)$");

    private final StoreRepository repository = StoreRepository.getInstance();
    private StorePrefs prefs;
    private StoreHistoryStore historyStore;

    private ViewPager2 galleryPager;
    private ProductImagePagerAdapter galleryAdapter;
    private TextView imageCount;
    private TextView vendor;
    private TextView title;
    private TextView price;
    private TextView compareAt;
    private TextView availability;
    private TextView description;
    private MaterialCardView highlightsCard;
    private LinearLayout highlightsList;
    private TextView specifications;
    private MaterialCardView specificationsCard;
    private LinearLayout specificationsList;
    private MaterialButton descriptionToggle;
    private MaterialButton specificationsToggle;
    private TextView bottomPrice;
    private ChipGroup metaGroup;
    private ChipGroup variantGroup;
    private MaterialButton wishlistButton;
    private MaterialButton addToCartButton;

    private StoreProduct currentProduct;
    private StoreVariant selectedVariant;
    private int currentGalleryIndex;
    private boolean overviewExpanded;
    private boolean specificationsExpanded;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_product_detail);

        prefs = StorePrefs.getInstance(this);
        historyStore = StoreHistoryStore.getInstance(this);

        MaterialToolbar toolbar = findViewById(R.id.detail_toolbar);
        setSupportActionBar(toolbar);
        if (getSupportActionBar() != null) {
            getSupportActionBar().setDisplayHomeAsUpEnabled(true);
            getSupportActionBar().setDisplayShowHomeEnabled(true);
            getSupportActionBar().setDisplayShowTitleEnabled(false);
            getSupportActionBar().setTitle("");
        }
        toolbar.setTitle("");
        toolbar.setNavigationIcon(android.R.drawable.ic_media_previous);
        toolbar.setNavigationOnClickListener(v -> finish());

        galleryPager = findViewById(R.id.detail_gallery);
        imageCount = findViewById(R.id.detail_image_count);
        vendor = findViewById(R.id.detail_vendor);
        title = findViewById(R.id.detail_title);
        price = findViewById(R.id.detail_price);
        compareAt = findViewById(R.id.detail_compare_at);
        availability = findViewById(R.id.detail_availability);
        description = findViewById(R.id.detail_description);
        highlightsCard = null;
        highlightsList = null;
        specifications = findViewById(R.id.detail_specifications);
        specificationsCard = findViewById(R.id.detail_specifications_card);
        specificationsList = findViewById(R.id.detail_specifications_list);
        descriptionToggle = findViewById(R.id.detail_description_toggle);
        specificationsToggle = findViewById(R.id.detail_specifications_toggle);
        bottomPrice = findViewById(R.id.detail_bottom_price);
        metaGroup = findViewById(R.id.detail_meta_group);
        variantGroup = findViewById(R.id.detail_variant_group);
        wishlistButton = findViewById(R.id.detail_wishlist);
        addToCartButton = findViewById(R.id.detail_add_to_cart);

        descriptionToggle.setOnClickListener(v -> {
            overviewExpanded = !overviewExpanded;
            bindBodyCopy(currentProduct);
        });
        specificationsToggle.setOnClickListener(v -> {
            specificationsExpanded = !specificationsExpanded;
            bindBodyCopy(currentProduct);
        });

        galleryAdapter = new ProductImagePagerAdapter();
        galleryPager.setAdapter(galleryAdapter);
        galleryPager.setOffscreenPageLimit(2);
        galleryPager.setPageTransformer(new MarginPageTransformer(dp(12)));
        galleryPager.registerOnPageChangeCallback(new ViewPager2.OnPageChangeCallback() {
            @Override
            public void onPageSelected(int position) {
                currentGalleryIndex = position;
                updateGalleryCounter();
            }
        });

        String handle = getIntent().getStringExtra(EXTRA_HANDLE);
        loadProduct(handle);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void loadProduct(String handle) {
        repository.loadProduct(handle, new StoreRepository.ProductCallback() {
            @Override
            public void onSuccess(StoreProduct product) {
                currentProduct = product;
                populate(product);
            }

            @Override
            public void onError(Throwable error) {
                currentProduct = null;
                selectedVariant = null;
                title.setText("Product unavailable");
                description.setText("The item could not be loaded from the live catalog.");
                descriptionToggle.setVisibility(View.GONE);
                if (highlightsCard != null) {
                    highlightsCard.setVisibility(View.GONE);
                }
                if (highlightsList != null) {
                    highlightsList.removeAllViews();
                }
                specificationsCard.setVisibility(View.GONE);
                if (specificationsList != null) {
                    specificationsList.removeAllViews();
                }
                price.setText("");
                bottomPrice.setText("");
                vendor.setText("");
                wishlistButton.setEnabled(false);
                addToCartButton.setEnabled(false);
                Toast.makeText(ProductDetailActivity.this, "Unable to load product", Toast.LENGTH_SHORT).show();
            }
        });
    }

    private void populate(@NonNull StoreProduct product) {
        historyStore.rememberRecentlyViewed(product.handle);
        overviewExpanded = false;
        specificationsExpanded = false;

        if (getSupportActionBar() != null) {
            getSupportActionBar().setTitle(product.title);
        }

        vendor.setText(product.vendor == null || product.vendor.isEmpty() ? "SALT" : product.vendor);
        title.setText(product.title);
        bindBodyCopy(product);

        List<String> images = new ArrayList<>(product.imageUrls);
        if (images.isEmpty()) {
            images.add("");
        }
        galleryAdapter.submit(images, product.title);
        currentGalleryIndex = 0;
        updateGalleryCounter();

        metaGroup.removeAllViews();
        addMetaChip(product.vendor == null || product.vendor.isEmpty() ? "SALT" : product.vendor);
        if (product.productType != null && !product.productType.trim().isEmpty()) {
            addMetaChip(product.productType.trim());
        }
        addMetaChip(product.variants.size() + " variants");
        for (String tag : product.tags) {
            if (tag == null || tag.trim().isEmpty()) {
                continue;
            }
            addMetaChip(tag.trim());
            if (metaGroup.getChildCount() >= 5) {
                break;
            }
        }
        if (metaGroup.getChildCount() == 0) {
            addMetaChip("Live catalog");
            addMetaChip("Local save");
        }

        variantGroup.removeAllViews();
        selectedVariant = product.defaultVariant();
        List<StoreVariant> variants = product.variants;
        for (StoreVariant variant : variants) {
            Chip chip = new Chip(this);
            chip.setText(variant.title == null || variant.title.isEmpty() ? "Default" : variant.title);
            chip.setCheckable(true);
            chip.setClickable(true);
            chip.setChipBackgroundColorResource(R.color.salt_surface_alt);
            chip.setTextColor(getColor(R.color.salt_ink));
            chip.setEnsureMinTouchTargetSize(false);
            chip.setTag(variant);
            chip.setChecked(selectedVariant != null && selectedVariant.id == variant.id);
            chip.setOnClickListener(v -> {
                selectedVariant = (StoreVariant) v.getTag();
                updatePrice();
            });
            variantGroup.addView(chip);
        }

        if (variantGroup.getChildCount() > 0 && selectedVariant != null) {
            for (int index = 0; index < variantGroup.getChildCount(); index++) {
                View child = variantGroup.getChildAt(index);
                if (child instanceof Chip chip) {
                    chip.setChecked(((StoreVariant) chip.getTag()).id == selectedVariant.id);
                }
            }
        }

        updatePrice();
        updateWishlistState();

        wishlistButton.setOnClickListener(v -> {
            prefs.toggleWishlist(product.id);
            updateWishlistState();
        });
        addToCartButton.setOnClickListener(v -> {
            if (selectedVariant == null) {
                Toast.makeText(this, "Choose a variant first", Toast.LENGTH_SHORT).show();
                return;
            }
            prefs.incrementCartQuantity(product.id, selectedVariant.id, 1);
            Toast.makeText(this, "Added to cart", Toast.LENGTH_SHORT).show();
        });
    }

    private void bindBodyCopy(StoreProduct product) {
        CopySections sections = parseCopySections(product == null ? null : product.bodyHtml);
        bindHighlights(sections);
        bindOverview(sections);
        bindSpecifications(sections);
    }

    private void bindHighlights(@NonNull CopySections sections) {
        if (highlightsCard == null || highlightsList == null) {
            return;
        }

        highlightsList.removeAllViews();
        if (sections.highlights.isEmpty()) {
            highlightsCard.setVisibility(View.GONE);
            return;
        }

        highlightsCard.setVisibility(View.VISIBLE);
        int limit = Math.min(4, sections.highlights.size());
        for (int index = 0; index < limit; index++) {
            highlightsList.addView(buildHighlightRow(sections.highlights.get(index)));
        }
    }

    private void bindOverview(@NonNull CopySections sections) {
        boolean hasOverviewText = !sections.overview.trim().isEmpty();
        String overviewText = hasOverviewText ? sections.overview.trim() : "Live catalog details are not available yet.";
        String previewText = buildOverviewPreviewText(sections, overviewText);
        String visibleText = overviewExpanded ? overviewText : previewText;

        description.setText(visibleText);
        description.setMaxLines(overviewExpanded ? Integer.MAX_VALUE : COLLAPSED_LINES);
        description.setEllipsize(overviewExpanded ? null : TextUtils.TruncateAt.END);

        boolean canToggle = hasOverviewText && (!previewText.equals(overviewText) || shouldShowToggle(overviewText));
        descriptionToggle.setVisibility(canToggle ? View.VISIBLE : View.GONE);
        descriptionToggle.setText(overviewExpanded ? "Show less" : "Read more");
        descriptionToggle.setEnabled(canToggle);
    }

    private void bindSpecifications(@NonNull CopySections sections) {
        if (specificationsCard == null || specificationsList == null) {
            return;
        }

        specificationsList.removeAllViews();
        boolean hasRows = !sections.specItems.isEmpty();
        boolean hasNotes = !sections.specificationNotes.trim().isEmpty();

        if (!hasRows && !hasNotes) {
            specificationsCard.setVisibility(View.GONE);
            specifications.setText("");
            specificationsToggle.setVisibility(View.GONE);
            return;
        }

        specificationsCard.setVisibility(View.VISIBLE);
        if (hasRows) {
            int visibleLimit = specificationsExpanded ? sections.specItems.size() : Math.min(5, sections.specItems.size());
            for (int index = 0; index < sections.specItems.size(); index++) {
                View row = buildSpecificationRow(sections.specItems.get(index), index >= visibleLimit);
                specificationsList.addView(row);
            }
        }

        if (hasNotes) {
            specifications.setVisibility(View.VISIBLE);
            specifications.setText(sections.specificationNotes.trim());
            specifications.setMaxLines(specificationsExpanded ? Integer.MAX_VALUE : COLLAPSED_LINES);
            specifications.setEllipsize(specificationsExpanded ? null : TextUtils.TruncateAt.END);
        } else {
            specifications.setText("");
            specifications.setVisibility(hasRows ? View.GONE : View.VISIBLE);
        }

        boolean showToggle = (hasRows && sections.specItems.size() > 5) || shouldShowToggle(sections.specificationNotes);
        specificationsToggle.setVisibility(showToggle ? View.VISIBLE : View.GONE);
        specificationsToggle.setText(specificationsExpanded ? "Show less" : "Show more");
        specificationsToggle.setEnabled(showToggle);
    }

    private void addMetaChip(@NonNull String label) {
        Chip chip = new Chip(this);
        chip.setText(label);
        chip.setCheckable(false);
        chip.setClickable(false);
        chip.setChipBackgroundColorResource(R.color.salt_surface_alt);
        chip.setTextColor(getColor(R.color.salt_ink));
        chip.setEnsureMinTouchTargetSize(false);
        chip.setCloseIconVisible(false);
        metaGroup.addView(chip);
    }

    @NonNull
    private View buildHighlightRow(@NonNull String text) {
        LinearLayout row = new LinearLayout(this);
        row.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.TOP);
        row.setPadding(0, dp(4), 0, dp(4));

        View dot = new View(this);
        LinearLayout.LayoutParams dotParams = new LinearLayout.LayoutParams(dp(8), dp(8));
        dotParams.topMargin = dp(7);
        dotParams.rightMargin = dp(10);
        dot.setLayoutParams(dotParams);
        dot.setBackgroundResource(R.drawable.bg_icon_chip);

        TextView body = new TextView(this);
        LinearLayout.LayoutParams bodyParams = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        body.setLayoutParams(bodyParams);
        body.setText(text);
        body.setTextColor(getColor(R.color.salt_muted));
        body.setTextSize(13f);
        body.setLineSpacing(dp(2), 1f);

        row.addView(dot);
        row.addView(body);
        return row;
    }

    @NonNull
    private View buildSpecificationRow(@NonNull SpecItem item, boolean hidden) {
        LinearLayout row = new LinearLayout(this);
        row.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        row.setOrientation(LinearLayout.VERTICAL);
        row.setPadding(0, dp(8), 0, dp(8));
        row.setVisibility(hidden ? View.GONE : View.VISIBLE);

        TextView label = new TextView(this);
        label.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        label.setText(item.label);
        label.setTextColor(getColor(R.color.salt_muted));
        label.setTextSize(11f);
        label.setTypeface(label.getTypeface(), Typeface.BOLD);
        label.setAllCaps(true);

        TextView value = new TextView(this);
        LinearLayout.LayoutParams valueParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        valueParams.topMargin = dp(4);
        value.setLayoutParams(valueParams);
        value.setText(item.value);
        value.setTextColor(getColor(R.color.salt_ink));
        value.setTextSize(14f);
        value.setLineSpacing(dp(2), 1f);

        row.addView(label);
        row.addView(value);
        return row;
    }

    private void updateGalleryCounter() {
        int total = galleryAdapter.getItemCount();
        if (total <= 1) {
            imageCount.setText("1 photo");
            return;
        }
        imageCount.setText((currentGalleryIndex + 1) + " / " + total);
    }

    private void updatePrice() {
        if (selectedVariant == null) {
            price.setText("");
            bottomPrice.setText("");
            compareAt.setVisibility(View.GONE);
            addToCartButton.setEnabled(false);
            availability.setText("Unavailable");
            return;
        }

        String priceLabel = StoreFormat.moneyLabel(selectedVariant.price);
        price.setText(priceLabel);
        bottomPrice.setText(priceLabel);
        addToCartButton.setEnabled(selectedVariant.available);
        addToCartButton.setText(selectedVariant.available ? "Add to cart" : "Unavailable");
        availability.setText(selectedVariant.available ? "In stock" : "Sold out");

        double currentPrice = StoreFormat.parseDouble(selectedVariant.price);
        double compareAtPrice = StoreFormat.parseDouble(selectedVariant.compareAtPrice);
        if (compareAtPrice > currentPrice && compareAtPrice > 0d) {
            compareAt.setVisibility(View.VISIBLE);
            compareAt.setText(StoreFormat.moneyLabel(compareAtPrice));
            compareAt.setPaintFlags(compareAt.getPaintFlags() | Paint.STRIKE_THRU_TEXT_FLAG);
        } else {
            compareAt.setPaintFlags(compareAt.getPaintFlags() & ~Paint.STRIKE_THRU_TEXT_FLAG);
            compareAt.setVisibility(View.GONE);
        }
    }

    private void updateWishlistState() {
        boolean saved = currentProduct != null && prefs.isWishlisted(currentProduct.id);
        wishlistButton.setText(saved ? "Saved" : "Save");
    }

    private boolean shouldShowToggle(@NonNull String text) {
        if (text.trim().isEmpty()) {
            return false;
        }
        int lineCount = text.split("\\R+").length;
        return text.length() > COLLAPSED_CHAR_LIMIT || lineCount > COLLAPSED_LINES;
    }

    @NonNull
    private String buildOverviewPreviewText(@NonNull CopySections sections, @NonNull String fallbackText) {
        List<String> previewLines = new ArrayList<>();
        for (String highlight : sections.highlights) {
            String cleaned = normalizeCopy(highlight);
            if (cleaned.isEmpty()) {
                continue;
            }
            previewLines.add("• " + StoreFormat.ellipsize(cleaned, 120));
            if (previewLines.size() >= 3) {
                break;
            }
        }

        if (!previewLines.isEmpty()) {
            return String.join("\n", previewLines);
        }

        String[] sentences = fallbackText.split("(?<=[.!?])\\s+");
        if (sentences.length > 1) {
            List<String> lines = new ArrayList<>();
            for (String sentence : sentences) {
                String cleaned = normalizeCopy(sentence);
                if (cleaned.isEmpty()) {
                    continue;
                }
                lines.add(cleaned);
                if (lines.size() >= 3) {
                    break;
                }
            }
            if (!lines.isEmpty()) {
                return String.join("\n\n", lines);
            }
        }

        return StoreFormat.ellipsize(fallbackText, COLLAPSED_CHAR_LIMIT);
    }

    @NonNull
    private CopySections parseCopySections(String bodyHtml) {
        String plainText = bodyHtml == null || bodyHtml.trim().isEmpty()
                ? ""
                : HtmlCompat.fromHtml(bodyHtml, HtmlCompat.FROM_HTML_MODE_LEGACY).toString();
        plainText = normalizeCopy(plainText);
        if (plainText.isEmpty()) {
            return new CopySections("", "", new ArrayList<>(), new ArrayList<>(), "");
        }

        String[] lines = plainText.split("\\R");
        int headingIndex = -1;
        String headingRemainder = "";
        for (int index = 0; index < lines.length; index++) {
            Matcher matcher = SPEC_SECTION_PATTERN.matcher(lines[index].trim());
            if (matcher.matches()) {
                headingIndex = index;
                headingRemainder = matcher.group(2) == null ? "" : matcher.group(2).trim();
                break;
            }
        }

        if (headingIndex < 0) {
            String[] paragraphs = plainText.split("\\n\\s*\\n+");
            if (paragraphs.length > 1) {
                String overviewText = stripIntroHeading(normalizeCopy(paragraphs[0]));
                String specificationsText = joinLines(paragraphs, 1, paragraphs.length);
                if (!overviewText.isEmpty() && !specificationsText.isEmpty()) {
                    return buildSections(overviewText, specificationsText);
                }
            }
            return buildSections(plainText, "");
        }

        String overviewText = stripIntroHeading(joinLines(lines, 0, headingIndex));
        String specificationsText = joinLines(lines, headingIndex + 1, lines.length);
        if (!headingRemainder.isEmpty()) {
            if (specificationsText.isEmpty()) {
                specificationsText = headingRemainder;
            } else {
                specificationsText = headingRemainder + "\n" + specificationsText;
            }
        }

        if (overviewText.isEmpty() && !specificationsText.isEmpty()) {
            overviewText = StoreFormat.ellipsize(specificationsText, COLLAPSED_CHAR_LIMIT);
        }

        if (specificationsText.isEmpty() && !overviewText.isEmpty() && overviewText.length() > COLLAPSED_CHAR_LIMIT) {
            specificationsText = overviewText;
            overviewText = StoreFormat.ellipsize(overviewText, COLLAPSED_CHAR_LIMIT);
        }

        if (specificationsText.equals(overviewText)) {
            specificationsText = "";
        }

        return buildSections(overviewText, specificationsText);
    }

    @NonNull
    private CopySections buildSections(@NonNull String overviewText, @NonNull String specificationsText) {
        List<String> highlights = extractHighlights(overviewText, specificationsText);
        ParsedSpecifications parsedSpecifications = extractSpecifications(specificationsText);
        return new CopySections(overviewText, specificationsText, highlights, parsedSpecifications.items, parsedSpecifications.notes);
    }

    @NonNull
    private List<String> extractHighlights(@NonNull String overviewText, @NonNull String specificationsText) {
        List<String> highlights = new ArrayList<>();

        String normalizedOverview = overviewText.trim();
        if (!normalizedOverview.isEmpty()) {
            String[] sentences = normalizedOverview.split("(?<=[.!?])\\s+");
            for (String sentence : sentences) {
                String cleaned = normalizeCopy(sentence);
                if (cleaned.isEmpty()) {
                    continue;
                }
                cleaned = cleaned.replaceAll("^[•\\-*\\u2022]+\\s*", "");
                cleaned = cleaned.replaceAll("\\s+", " ").trim();
                if (cleaned.isEmpty()) {
                    continue;
                }
                highlights.add(StoreFormat.ellipsize(cleaned, 110));
                if (highlights.size() >= 4) {
                    break;
                }
            }
        }

        if (highlights.isEmpty() && !specificationsText.trim().isEmpty()) {
            String[] lines = specificationsText.split("\\R");
            for (String line : lines) {
                String cleaned = normalizeCopy(line);
                if (cleaned.isEmpty()) {
                    continue;
                }
                cleaned = cleaned.replaceAll("^[•\\-*\\u2022]+\\s*", "");
                cleaned = cleaned.replaceAll("\\s+", " ").trim();
                if (cleaned.isEmpty()) {
                    continue;
                }
                highlights.add(StoreFormat.ellipsize(cleaned, 110));
                if (highlights.size() >= 4) {
                    break;
                }
            }
        }

        return highlights;
    }

    @NonNull
    private ParsedSpecifications extractSpecifications(@NonNull String specificationsText) {
        List<SpecItem> items = new ArrayList<>();
        List<String> notes = new ArrayList<>();

        if (specificationsText.trim().isEmpty()) {
            return new ParsedSpecifications(items, "");
        }

        String[] lines = specificationsText.split("\\R");
        for (String rawLine : lines) {
            String line = normalizeCopy(rawLine);
            if (line.isEmpty()) {
                continue;
            }
            line = line.replaceAll("^[•\\-*\\u2022]+\\s*", "").trim();
            Matcher keyValueMatcher = KEY_VALUE_PATTERN.matcher(line);
            if (keyValueMatcher.matches()) {
                String key = normalizeLabel(keyValueMatcher.group("key"));
                String value = normalizeCopy(keyValueMatcher.group("value"));
                if (!key.isEmpty() && !value.isEmpty()) {
                    items.add(new SpecItem(key, value));
                    continue;
                }
            }
            if (!isHeadingLine(line)) {
                notes.add(line);
            }
        }

        return new ParsedSpecifications(items, joinLines(notes.toArray(new String[0]), 0, notes.size()));
    }

    @NonNull
    private String joinLines(@NonNull String[] lines, int startInclusive, int endExclusive) {
        StringBuilder builder = new StringBuilder();
        for (int index = startInclusive; index < endExclusive; index++) {
            String line = lines[index] == null ? "" : lines[index].trim();
            if (line.isEmpty()) {
                continue;
            }
            if (builder.length() > 0) {
                builder.append('\n');
            }
            builder.append(line);
        }
        return normalizeCopy(builder.toString());
    }

    @NonNull
    private String normalizeCopy(String input) {
        if (input == null || input.trim().isEmpty()) {
            return "";
        }
        return input
                .replace('\r', '\n')
                .replaceAll("[\\t ]+", " ")
                .replaceAll("\\n{3,}", "\n\n")
                .trim();
    }

    private boolean isHeadingLine(@NonNull String line) {
        return HEADING_PATTERN.matcher(line.trim()).matches();
    }

    @NonNull
    private String normalizeLabel(@NonNull String input) {
        String cleaned = normalizeCopy(input);
        if (cleaned.isEmpty()) {
            return "";
        }
        cleaned = cleaned.replaceAll("[:\\-–—]+$", "").trim();
        return cleaned;
    }

    @NonNull
    private String stripIntroHeading(@NonNull String text) {
        String normalized = normalizeCopy(text);
        if (normalized.isEmpty()) {
            return "";
        }

        String[] lines = normalized.split("\\R");
        if (lines.length == 0) {
            return normalized;
        }

        String firstLine = lines[0].trim();
        if (firstLine.equalsIgnoreCase("description")
                || firstLine.equalsIgnoreCase("overview")
                || firstLine.equalsIgnoreCase("about this item")
                || firstLine.equalsIgnoreCase("product details")
                || firstLine.equalsIgnoreCase("key details")) {
            return joinLines(lines, 1, lines.length);
        }

        return normalized;
    }

    private static final class CopySections {
        final String overview;
        final String specifications;
        final List<String> highlights;
        final List<SpecItem> specItems;
        final String specificationNotes;

        CopySections(String overview, String specifications, List<String> highlights, List<SpecItem> specItems, String specificationNotes) {
            this.overview = overview == null ? "" : overview;
            this.specifications = specifications == null ? "" : specifications;
            this.highlights = highlights == null ? new ArrayList<>() : new ArrayList<>(highlights);
            this.specItems = specItems == null ? new ArrayList<>() : new ArrayList<>(specItems);
            this.specificationNotes = specificationNotes == null ? "" : specificationNotes;
        }
    }

    private static final class ParsedSpecifications {
        final List<SpecItem> items;
        final String notes;

        ParsedSpecifications(List<SpecItem> items, String notes) {
            this.items = items == null ? new ArrayList<>() : items;
            this.notes = notes == null ? "" : notes;
        }
    }

    private static final class SpecItem {
        final String label;
        final String value;

        SpecItem(String label, String value) {
            this.label = label == null ? "" : label;
            this.value = value == null ? "" : value;
        }
    }
}
