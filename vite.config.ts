import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import os from "os";
import path from "path";

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
    cacheDir: path.resolve(os.tmpdir(), "salt-shine-vite-cache"),
    optimizeDeps: {
      exclude: [
        "react",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "react-dom",
        "react-dom/client",
        "react-router-dom",
        "@tanstack/react-query",
      ],
    },
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
    plugins: [react({ jsxImportSource: "/src/shims" })],
    resolve: {
      alias: [
        {
          find: /^@\/(.*)$/,
          replacement: path.resolve(__dirname, "./src") + "/$1",
        },
        {
          find: /^react$/,
          replacement: path.resolve(__dirname, "./src/shims/react.ts"),
        },
        {
          find: /^react\/jsx-runtime$/,
          replacement: path.resolve(__dirname, "./src/shims/react-jsx-runtime.ts"),
        },
        {
          find: /^react\/jsx-dev-runtime$/,
          replacement: path.resolve(__dirname, "./src/shims/react-jsx-dev-runtime.ts"),
        },
        {
          find: /^react-dom$/,
          replacement: path.resolve(__dirname, "./src/shims/react-dom.ts"),
        },
        {
          find: /^react-dom\/client$/,
          replacement: path.resolve(__dirname, "./src/shims/react-dom-client.ts"),
        },
      ],
    },
  };
});
