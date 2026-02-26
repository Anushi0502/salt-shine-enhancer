#!/usr/bin/env node

import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, resolve } from "node:path";

const rootDir = process.cwd();
const distDir = resolve(rootDir, "dist");
const publicDir = resolve(rootDir, "public");
const themeDir = resolve(rootDir, "shopify-theme");
const themeAssetsDir = resolve(themeDir, "assets");

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
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="theme-color" content="#d26633">
    <title>{{ page_title }}</title>
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
    "/placeholder.svg": {{ 'placeholder.svg' | asset_url | json }},
    "/data/products.json": {{ 'data-products.json' | asset_url | json }},
    "/data/collections.json": {{ 'data-collections.json' | asset_url | json }},
    "/data/collection-products.json": {{ 'data-collection-products.json' | asset_url | json }},
    "/data/about.json": {{ 'data-about.json' | asset_url | json }},
    "/data/blog-posts.json": {{ 'data-blog-posts.json' | asset_url | json }}
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
    JSON.stringify([{ name: "SALT App Theme", settings: [] }], null, 2),
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
  await cp(resolve(publicDir, "placeholder.svg"), resolve(themeAssetsDir, "placeholder.svg"));
  await cp(resolve(publicDir, "data", "products.json"), resolve(themeAssetsDir, "data-products.json"));
  await cp(resolve(publicDir, "data", "collections.json"), resolve(themeAssetsDir, "data-collections.json"));
  await cp(
    resolve(publicDir, "data", "collection-products.json"),
    resolve(themeAssetsDir, "data-collection-products.json"),
  );
  await cp(resolve(publicDir, "data", "about.json"), resolve(themeAssetsDir, "data-about.json"));
  await cp(resolve(publicDir, "data", "blog-posts.json"), resolve(themeAssetsDir, "data-blog-posts.json"));
}

async function main() {
  await ensureDistExists();
  const indexHtml = await readFile(resolve(distDir, "index.html"), "utf8");
  const { jsPath, cssPath } = parseEntryAssets(indexHtml);

  await rm(themeDir, { recursive: true, force: true });
  await writeThemeScaffold();
  await copyAssets(jsPath, cssPath);

  process.stdout.write(`Shopify theme bundle generated at ${themeDir}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

