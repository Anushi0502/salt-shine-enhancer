import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "url";

function createLucideDirectImportPlugin(workspaceRoot: string) {
  const barrelPath = path.resolve(workspaceRoot, "node_modules/lucide-react/dist/esm/lucide-react.js");
  const barrel = readFileSync(barrelPath, "utf8");
  const iconFiles = new Map<string, string>();

  for (const match of barrel.matchAll(/export \{ default as (\w+)[^}]*\} from ['"]\.\/icons\/([^'"]+)['"]/g)) {
    iconFiles.set(match[1], match[2]);
  }

  return {
    name: "salt-lucide-direct-imports",
    enforce: "pre" as const,
    transform(source: string, id: string) {
      if (!/\.[cm]?[jt]sx?$/.test(id) || !source.includes('from "lucide-react"')) {
        return null;
      }

      return source.replace(
        /import\s+\{([\s\S]*?)\}\s+from\s+["']lucide-react["'];?/g,
        (_statement, imports: string) => {
          const directImports = imports
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean)
            .map((entry) => {
              const [imported, local = imported] = entry.split(/\s+as\s+/).map((part) => part.trim());
              const file = iconFiles.get(imported);
              if (!file) {
                return null;
              }

              return `import ${local} from "lucide-react/dist/esm/icons/${file}";`;
            });

          return directImports.every(Boolean) ? directImports.join("\n") : _statement;
        },
      );
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const workspaceRoot = path.dirname(fileURLToPath(import.meta.url));
  const env = loadEnv(mode, workspaceRoot, "");
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
    root: workspaceRoot,
    cacheDir: path.resolve(workspaceRoot, ".vite"),
    build: {
      outDir: path.resolve(workspaceRoot, "dist"),
      rollupOptions: {
        input: path.resolve(workspaceRoot, "index.html"),
      },
    },
    publicDir: process.env.SALT_BUILD_SKIP_PUBLIC_COPY
      ? false
      : path.resolve(workspaceRoot, "public"),
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
      ],
      exclude: [
        "react-router-dom",
        "@tanstack/react-query",
        "lucide-react",
        "@radix-ui/react-dialog",
        "class-variance-authority",
        "clsx",
        "tailwind-merge",
        "framer-motion",
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
    plugins: [createLucideDirectImportPlugin(workspaceRoot), react()],
    resolve: {
      alias: [
        {
          find: /^@\/(.*)$/,
          replacement: path.resolve(workspaceRoot, "./src") + "/$1",
        },
      ],
    },
  };
});
