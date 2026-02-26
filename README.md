# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

## Shopify integration (SALT store)

1. Copy environment template:

```sh
cp .env.example .env.local
```

2. Pull latest Shopify snapshot data:

```sh
SALT_SHOP_URL=https://0309d3-72.myshopify.com npm run sync:data
```

3. Run locally:

```sh
npm run dev
```

Notes:
- UI stays unchanged; this only changes Shopify data/checkouts integration.
- Blog sync tries multiple handles from `SALT_BLOG_HANDLE` and preserves existing blog snapshot data if public blog feeds are unavailable.

## Shopify hosted theme (same UI shell)

Build a Shopify theme package from the app:

```sh
npm run build:shopify-theme
```

This generates `shopify-theme/` with:
- `layout/theme.liquid` + `sections/salt-app.liquid`
- JSON templates for index/product/collection/cart/page/blog/article/search/404
- app bundles + synced JSON snapshots in `shopify-theme/assets`

Push it to the target store:

```sh
npx @shopify/cli theme push --path shopify-theme --store 0309d3-72.myshopify.com
```
