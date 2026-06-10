package com.saltonlinestore.saltstoreandroid.util;

import java.text.NumberFormat;
import java.util.Locale;
import java.util.regex.Pattern;

public final class StoreFormat {
    private static final Pattern HTML_TAGS = Pattern.compile("<[^>]+>");
    private static final NumberFormat CURRENCY = NumberFormat.getCurrencyInstance(Locale.CANADA);

    static {
        CURRENCY.setMaximumFractionDigits(2);
        CURRENCY.setMinimumFractionDigits(2);
    }

    private StoreFormat() {}

    public static String stripHtml(String input) {
        if (input == null || input.trim().isEmpty()) {
            return "";
        }
        return HTML_TAGS.matcher(input).replaceAll(" ").replaceAll("\\s+", " ").trim();
    }

    public static String ellipsize(String input, int maxChars) {
        if (input == null) {
            return "";
        }
        if (input.length() <= maxChars) {
            return input;
        }
        return input.substring(0, Math.max(0, maxChars - 1)).trim() + "…";
    }

    public static String moneyLabel(String price) {
        if (price == null || price.trim().isEmpty()) {
            return "";
        }

        try {
            double value = Double.parseDouble(price.trim());
            return CURRENCY.format(value);
        } catch (NumberFormatException ignore) {
            return price;
        }
    }

    public static String moneyLabel(double price) {
        return CURRENCY.format(price);
    }

    public static double parseDouble(String input) {
        if (input == null || input.trim().isEmpty()) {
            return 0d;
        }

        try {
            return Double.parseDouble(input.trim());
        } catch (NumberFormatException ignore) {
            return 0d;
        }
    }
}
