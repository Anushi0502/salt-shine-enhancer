#!/usr/bin/env node

import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
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

async function writeThemeScaffold() {
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
  window.SALT_THEME_ASSETS = {
    "/brand/salt-logo.png": {{ 'brand-salt-logo.png' | asset_url | json }},
    "/brand-salt-logo.png": {{ 'brand-salt-logo.png' | asset_url | json }}
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
  await writeFile(resolve(themeDir, "config", "settings_data.json"), JSON.stringify({ current: {} }, null, 2));
  await writeFile(resolve(themeDir, "locales", "en.default.json"), JSON.stringify({}, null, 2));
}

async function copyAssets(entryJsPath, entryCssPath) {
  await cp(resolve(distDir, "assets"), themeAssetsDir, { recursive: true });

  const entryJs = basename(entryJsPath);
  const entryCss = basename(entryCssPath);

  await cp(resolve(distDir, "assets", entryJs), resolve(themeAssetsDir, "salt-app.js"));
  await cp(resolve(distDir, "assets", entryCss), resolve(themeAssetsDir, "salt-app.css"));

  await cp(resolve(publicDir, "brand", "salt-logo.png"), resolve(themeAssetsDir, "brand-salt-logo.png"));
  await cp(
    resolve(publicDir, "shopify-meta-pixel-customer-events.js"),
    resolve(themeAssetsDir, "shopify-meta-pixel-customer-events.js"),
  );
}

async function main() {
  await ensureDistExists();
  const indexHtml = await readFile(resolve(distDir, "index.html"), "utf8");
  const { jsPath, cssPath } = parseEntryAssets(indexHtml);

  await mkdir(themeDir, { recursive: true });
  await Promise.all(
    themeScaffoldEntries.map((entry) =>
      rm(resolve(themeDir, entry), { recursive: true, force: true }),
    ),
  );
  await writeThemeScaffold();
  await copyAssets(jsPath, cssPath);

  process.stdout.write(`Shopify theme bundle generated at ${themeDir}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
