#!/usr/bin/env node

import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, resolve } from "node:path";

const rootDir = process.cwd();
const distDir = resolve(rootDir, "dist");
const publicDir = resolve(rootDir, "public");
const defaultThemeDir = resolve(rootDir, "..", "salt-online-store-shopify");

function resolveThemeDir() {
  const outIndex = process.argv.indexOf("--out");

  if (outIndex !== -1 && process.argv[outIndex + 1]) {
    return resolve(process.cwd(), process.argv[outIndex + 1]);
  }

  if (process.env.SHOPIFY_THEME_DIR) {
    return resolve(process.env.SHOPIFY_THEME_DIR);
  }

  return defaultThemeDir;
}

const themeDir = resolveThemeDir();
const themeAssetsDir = resolve(themeDir, "assets");
const themeScaffoldEntries = ["assets", "config", "layout", "locales", "sections", "templates"];
const themeDataAssets = [
  { source: "products.json", asset: "data-products.json", themePath: "/data/products.json" },
  {
    source: "home-featured-products.json",
    asset: "data-home-featured-products.json",
    themePath: "/data/home-featured-products.json",
  },
  { source: "product-search.json", asset: "data-product-search.json", themePath: "/data/product-search.json" },
  { source: "collections.json", asset: "data-collections.json", themePath: "/data/collections.json" },
  {
    source: "collection-products.json",
    asset: "data-collection-products.json",
    themePath: "/data/collection-products.json",
  },
  { source: "about.json", asset: "data-about.json", themePath: "/data/about.json" },
  { source: "blog-posts.json", asset: "data-blog-posts.json", themePath: "/data/blog-posts.json" },
  { source: "shop.json", asset: "data-shop.json", themePath: "/data/shop.json" },
];

function buildThemeAssetMapEntries() {
  return themeDataAssets
    .map(
      ({ themePath, asset }) =>
        `    ${JSON.stringify(themePath)}: {{ '${asset}' | asset_url | json }}`,
    )
    .join(",\n");
}

function parseEntryAssets(indexHtml) {
  const jsMatch = indexHtml.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/i);
  const cssMatch = indexHtml.match(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/i);

  if (!jsMatch?.[1] || !cssMatch?.[1]) {
    throw new Error("Unable to locate entry JS/CSS assets in dist/index.html");
  }

  return {
    jsPath: jsMatch[1],
    cssPath: cssMatch[1],
  };
}

async function ensureDistExists() {
  if (!existsSync(resolve(distDir, "index.html"))) {
    throw new Error("dist/index.html not found. Run `npm run build` first.");
  }
}

function templateJson(sectionType = "salt-app") {
  return JSON.stringify(
    {
      sections: {
        main: {
          type: sectionType,
          settings: {},
        },
      },
      order: ["main"],
    },
    null,
    2,
  );
}

async function writeThemeScaffold(settingsData = null) {
  await mkdir(resolve(themeDir, "layout"), { recursive: true });
  await mkdir(resolve(themeDir, "sections"), { recursive: true });
  await mkdir(resolve(themeDir, "templates"), { recursive: true });
  await mkdir(resolve(themeDir, "config"), { recursive: true });
  await mkdir(resolve(themeDir, "locales"), { recursive: true });
  await mkdir(themeAssetsDir, { recursive: true });

  const themeLiquid = `<!doctype html>
<html lang="{{ request.locale.iso_code }}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=768,initial-scale=1,viewport-fit=cover">
    <meta name="theme-color" content="#1e3a6e">
    <title>{{ page_title }}</title>
    <link rel="icon" href="{{ 'favicon.ico' | asset_url }}" sizes="any">
    <link rel="icon" type="image/png" sizes="32x32" href="{{ 'favicon-32x32.png' | asset_url }}">
    <link rel="icon" type="image/png" sizes="16x16" href="{{ 'favicon-16x16.png' | asset_url }}">
    <link rel="apple-touch-icon" sizes="180x180" href="{{ 'apple-touch-icon.png' | asset_url }}">
    <link rel="manifest" href="{{ 'site.webmanifest' | asset_url }}">
    <script>
      !function(f,b,e,v,n,t,s)
      {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};
      if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
      n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t,s)}(window, document,'script',
      'https://connect.facebook.net/en_US/fbevents.js');
      window.SALT_META_PIXEL_ID = '1147374030261395';
      fbq('init', window.SALT_META_PIXEL_ID);
    </script>
    <script>
      (function () {
        var selector = '#svelte-bundle-widget, #pumper_bundle_svelte';
        var pending = /^\\/products?(?:\\/|$)/.test(window.location.pathname);
        var observer = null;
        var originalDisplays = new WeakMap();

        function rememberAndHide(element) {
          if (!(element instanceof HTMLElement)) return;

          if (!originalDisplays.has(element)) {
            originalDisplays.set(element, {
              value: element.style.getPropertyValue('display'),
              priority: element.style.getPropertyPriority('display'),
            });
          }

          if (
            element.style.getPropertyValue('display') !== 'none' ||
            element.style.getPropertyPriority('display') !== 'important'
          ) {
            element.style.setProperty('display', 'none', 'important');
          }
        }

        function hideWidgets(scope) {
          if (!pending) return;

          if (scope && scope.nodeType === 1 && scope.matches(selector)) {
            rememberAndHide(scope);
          }

          var root = scope && scope.querySelectorAll ? scope : document;
          root.querySelectorAll(selector).forEach(rememberAndHide);
        }

        function observeWidgets() {
          if (observer || !document.documentElement) return;

          observer = new MutationObserver(function (records) {
            if (!pending) return;

            records.forEach(function (record) {
              if (record.type === 'attributes') {
                hideWidgets(record.target);
                return;
              }

              record.addedNodes.forEach(hideWidgets);
            });
          });

          observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['id', 'style'],
          });
        }

        function gatePumper() {
          pending = true;
          document.documentElement.setAttribute('data-salt-product-media', 'loading');
          observeWidgets();
          hideWidgets(document);
        }

        function releasePumper() {
          pending = false;
          document.documentElement.removeAttribute('data-salt-product-media');

          if (observer) {
            observer.disconnect();
            observer = null;
          }

          document.querySelectorAll(selector).forEach(function (element) {
            var original = originalDisplays.get(element);
            if (!original) return;

            if (original.value) {
              element.style.setProperty('display', original.value, original.priority);
            } else {
              element.style.removeProperty('display');
            }

            originalDisplays.delete(element);
          });

          window.setTimeout(function () {
            window.dispatchEvent(new Event('resize'));
          }, 0);
        }

        window.addEventListener('salt:product-media-loading', gatePumper);
        window.addEventListener('salt:product-media-ready', releasePumper);

        if (pending) gatePumper();
      })();
    </script>
    {{ content_for_header }}
    {{ 'salt-app.css' | asset_url | stylesheet_tag }}
  </head>
  <body>
    {{ content_for_layout }}
  </body>
</html>
`;

const sectionLiquid = `<div id="root"></div>
<script>
  window.SALT_THEME_ASSET_BASE = {{ 'salt-app.js' | asset_url | split: 'salt-app.js' | first | json }};
  window.SALT_THEME_ASSETS = {
    "/brand/salt-logo.png": {{ 'brand-salt-logo.png' | asset_url | json }},
    "/brand-salt-logo.png": {{ 'brand-salt-logo.png' | asset_url | json }},
${buildThemeAssetMapEntries()}
  };
</script>
<script type="module" src="{{ 'salt-app.js' | asset_url }}"></script>
`;

  await writeFile(resolve(themeDir, "layout", "theme.liquid"), themeLiquid);
  await writeFile(resolve(themeDir, "sections", "salt-app.liquid"), sectionLiquid);

  await writeFile(resolve(themeDir, "templates", "index.json"), templateJson());
  await writeFile(resolve(themeDir, "templates", "product.json"), templateJson());
  await writeFile(resolve(themeDir, "templates", "collection.json"), templateJson());
  await writeFile(resolve(themeDir, "templates", "list-collections.json"), templateJson());
  await writeFile(resolve(themeDir, "templates", "cart.json"), templateJson());
  await writeFile(resolve(themeDir, "templates", "page.json"), templateJson());
  await writeFile(resolve(themeDir, "templates", "blog.json"), templateJson());
  await writeFile(resolve(themeDir, "templates", "article.json"), templateJson());
  await writeFile(resolve(themeDir, "templates", "search.json"), templateJson());
  await writeFile(resolve(themeDir, "templates", "404.json"), templateJson());

  await writeFile(
    resolve(themeDir, "config", "settings_schema.json"),
    JSON.stringify(
      [
        {
          name: "SALT App Theme",
          settings: [
            {
              type: "paragraph",
              content: "SALT storefront presentation is managed in code.",
            },
          ],
        },
      ],
      null,
      2,
    ),
  );
  await writeFile(
    resolve(themeDir, "config", "settings_data.json"),
    settingsData || JSON.stringify({ current: {} }, null, 2),
  );
  await writeFile(resolve(themeDir, "locales", "en.default.json"), JSON.stringify({}, null, 2));
}

async function copyAssets(entryJsPath, entryCssPath) {
  await cp(resolve(distDir, "assets"), themeAssetsDir, { recursive: true });

  const entryJs = basename(entryJsPath);
  const entryCss = basename(entryCssPath);

  const entryAssetPath = resolve(themeAssetsDir, entryJs);
  const entrySource = await readFile(entryAssetPath, "utf8");
  // Vite emits lazy-chunk preload paths relative to the web root ("assets/").
  // In Shopify, the entry is served from /cdn/shop/.../assets, so make those
  // paths relative to the entry file instead. This keeps lazy chunks on the
  // Shopify CDN instead of requesting non-existent /assets/* URLs.
  const themeAssetResolver = `const __saltThemeAsset=(path)=>{const rawBase=globalThis.SALT_THEME_ASSET_BASE||new URL("./",import.meta.url).href;const base=rawBase.startsWith("//")?window.location.protocol+rawBase:rawBase;const file=String(path);return new URL(file.startsWith("./")?file.slice(2):file,base).href};\n`;
  const themeEntrySource = themeAssetResolver + entrySource
    .replace(/(["'])assets\//g, "$1./")
    // The lazy route imports and their modulepreload maps are generated as
    // relative URLs. Shopify resolves these from the current storefront path
    // on product pages, so point both mechanisms at the theme CDN explicitly.
    .replace(/import\("\.\/([^"\n]+)"\)/g, 'import(__saltThemeAsset("$1"))')
    .replace(/=>i\.map\(i=>d\[i\]\)/g, '=>i.map(i=>__saltThemeAsset(d[i]))')
    // Vite's preload helper prefixes every dependency with "/". That works
    // when assets live at /assets, but makes Shopify request the storefront
    // root instead of the theme CDN. Dependencies above are now relative, so
    // keep them relative when the helper creates modulepreload links too.
    .replace(
      /(="modulepreload",[A-Za-z_$][\w$]*=function\((\w+)\)\{return)"\/"\+\2(\})/,
      "$1 $2$3",
  );
  const entryCacheKey = createHash("sha256").update(themeEntrySource).digest("hex").slice(0, 12);
  const themeEntryJs = `salt-entry-${entryCacheKey}.js`;
  const themeEntryAssetPath = resolve(themeAssetsDir, themeEntryJs);
  await writeFile(themeEntryAssetPath, themeEntrySource);
  await rm(entryAssetPath);

  // Some lazy chunks import the Vite entry directly. Point every one at the
  // processed, content-addressed entry so the theme has exactly one React
  // runtime and Shopify's CDN cannot retain a stale entry bundle.
  for (const asset of await readdir(themeAssetsDir)) {
    if (!asset.endsWith(".js") || asset === themeEntryJs) {
      continue;
    }

    const assetPath = resolve(themeAssetsDir, asset);
    const assetSource = await readFile(assetPath, "utf8");
    const rewrittenAssetSource = assetSource.replaceAll(`./${entryJs}`, `./${themeEntryJs}`);
    if (rewrittenAssetSource !== assetSource) {
      await writeFile(assetPath, rewrittenAssetSource);
    }
  }

  // Do not duplicate the Vite entry bundle under a second filename. Lazy
  // chunks import the original hashed entry, and copying it to salt-app.js
  // creates a second React runtime (which causes invalid-hook/removeChild
  // crashes). The stable Shopify asset is only a module loader.
  // Shopify can resolve a relative module import against the storefront URL
  // (for example, /products/) instead of the theme asset URL. Start the Vite
  // entry from the absolute theme asset base exposed by the Liquid section so
  // every lazy product-page chunk stays on the Shopify CDN.
  await writeFile(
    resolve(themeAssetsDir, "salt-app.js"),
    `const rawBase = globalThis.SALT_THEME_ASSET_BASE || new URL("./", import.meta.url).href;\nconst base = rawBase.startsWith("//") ? window.location.protocol + rawBase : rawBase;\nimport(new URL(${JSON.stringify(themeEntryJs)}, base).href);\n`,
  );
  await cp(resolve(distDir, "assets", entryCss), resolve(themeAssetsDir, "salt-app.css"));

  await cp(resolve(publicDir, "brand", "salt-logo.png"), resolve(themeAssetsDir, "brand-salt-logo.png"));
  await cp(resolve(publicDir, "favicon.ico"), resolve(themeAssetsDir, "favicon.ico"));
  await cp(resolve(publicDir, "favicon-32x32.png"), resolve(themeAssetsDir, "favicon-32x32.png"));
  await cp(resolve(publicDir, "favicon-16x16.png"), resolve(themeAssetsDir, "favicon-16x16.png"));
  await cp(resolve(publicDir, "apple-touch-icon.png"), resolve(themeAssetsDir, "apple-touch-icon.png"));
  await cp(resolve(publicDir, "site.webmanifest"), resolve(themeAssetsDir, "site.webmanifest"));
  await cp(resolve(publicDir, "android-chrome-192x192.png"), resolve(themeAssetsDir, "android-chrome-192x192.png"));
  await cp(resolve(publicDir, "android-chrome-512x512.png"), resolve(themeAssetsDir, "android-chrome-512x512.png"));
  await cp(
    resolve(publicDir, "shopify-meta-pixel-customer-events.js"),
    resolve(themeAssetsDir, "shopify-meta-pixel-customer-events.js"),
  );

  for (const asset of themeDataAssets) {
    await cp(resolve(publicDir, "data", asset.source), resolve(themeAssetsDir, asset.asset));
  }
}

async function main() {
  await ensureDistExists();
  const indexHtml = await readFile(resolve(distDir, "index.html"), "utf8");
  const { jsPath, cssPath } = parseEntryAssets(indexHtml);
  const settingsDataPath = resolve(themeDir, "config", "settings_data.json");
  const settingsData = existsSync(settingsDataPath) ? await readFile(settingsDataPath, "utf8") : null;

  await mkdir(themeDir, { recursive: true });
  await Promise.all(
    themeScaffoldEntries.map((entry) =>
      rm(resolve(themeDir, entry), { recursive: true, force: true }),
    ),
  );
  // Keep Shopify-admin app embeds and theme-editor state intact. The generated
  // app bundle owns the app assets, not config/settings_data.json.
  await writeThemeScaffold(settingsData);
  await copyAssets(jsPath, cssPath);

  process.stdout.write(`Shopify theme bundle generated at ${themeDir}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
