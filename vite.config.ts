import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const fallbackShopBase = "https://0309d3-72.myshopify.com";
  const rawShopBase = env.VITE_SALT_SHOP_URL || env.VITE_SHOPIFY_STOREFRONT_URL || fallbackShopBase;
  const normalizedShopBase = (() => {
    try {
      const withProtocol = /^https?:\/\//i.test(rawShopBase) ? rawShopBase : `https://${rawShopBase}`;
      return new URL(withProtocol).origin;
    } catch {
      return fallbackShopBase;
    }
  })();
  const localProxyTarget = (() => {
    const explicit = env.VITE_LOCAL_SHOPIFY_PROXY_TARGET || normalizedShopBase;

    try {
      const withProtocol = /^https?:\/\//i.test(explicit) ? explicit : `https://${explicit}`;
      const parsed = new URL(withProtocol);
      if (parsed.hostname.endsWith(".myshopify.com")) {
        return parsed.origin;
      }
    } catch {
      // Fall back to known canonical Shopify domain.
    }

    return fallbackShopBase;
  })();

  const shopifyProxy = {
    "/__salt_shopify": {
      target: localProxyTarget,
      changeOrigin: true,
      secure: true,
      followRedirects: true,
      headers: {
        // Shopify can reject proxy requests that look like non-browser bots.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
      rewrite: (inputPath: string) => inputPath.replace(/^\/__salt_shopify/, ""),
    },
  };

  return {
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
      proxy: shopifyProxy,
    },
    preview: {
      proxy: shopifyProxy,
    },
    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
