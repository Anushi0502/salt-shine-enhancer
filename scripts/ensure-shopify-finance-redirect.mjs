const shopBase = process.env.SALT_SHOP_URL || "https://0309d3-72.myshopify.com";
const apiVersion = process.env.SHOPIFY_ADMIN_API_VERSION || "2026-07";
const accessToken =
  process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SALT_SHOPIFY_ADMIN_ACCESS_TOKEN || "";
const graphqlUrl = `${new URL(shopBase).origin}/admin/api/${apiVersion}/graphql.json`;
const sourcePath = "/apps:finance";
const targetPath = "/?finance=1";

if (!accessToken) {
  throw new Error("SHOPIFY_ADMIN_ACCESS_TOKEN is required to configure the finance route.");
}

async function graphql(query, variables = {}) {
  const response = await fetch(graphqlUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });

  const payload = await response.json();
  if (!response.ok || payload.errors?.length) {
    throw new Error(JSON.stringify(payload.errors || payload));
  }

  return payload.data;
}

const existing = await graphql(
  `#graphql
    query FindFinanceRedirect($query: String!) {
      urlRedirects(first: 10, query: $query) {
        nodes {
          id
          path
          target
        }
      }
    }
  `,
  { query: `path:${sourcePath}` },
);

const redirect = existing.urlRedirects.nodes.find((node) => node.path === sourcePath);
if (redirect?.target === targetPath) {
  console.log(`Finance redirect already configured: ${sourcePath} -> ${targetPath}`);
  process.exit(0);
}

if (redirect) {
  console.log(`Finance redirect exists with target ${redirect.target}; leaving it unchanged.`);
  process.exit(0);
}

const created = await graphql(
  `#graphql
    mutation CreateFinanceRedirect($urlRedirect: UrlRedirectInput!) {
      urlRedirectCreate(urlRedirect: $urlRedirect) {
        urlRedirect {
          id
          path
          target
        }
        userErrors {
          field
          message
        }
      }
    }
  `,
  { urlRedirect: { path: sourcePath, target: targetPath } },
);

const result = created.urlRedirectCreate;
if (result.userErrors.length) {
  throw new Error(JSON.stringify(result.userErrors));
}

console.log(`Created finance redirect: ${result.urlRedirect.path} -> ${result.urlRedirect.target}`);
