const ACTIVE_STATUS = "active";

export function isOnlineStorePublishedProduct(product) {
  const status = String(product?.status || "").trim().toLowerCase();

  if (status && status !== ACTIVE_STATUS) {
    return false;
  }

  // Shopify's Admin `published_at` is the Online Store publication marker.
  // An active product can still be excluded from Online Store and have no date.
  return Boolean(product?.published_at);
}

export function filterOnlineStoreProducts(products) {
  return (Array.isArray(products) ? products : []).filter(isOnlineStorePublishedProduct);
}

export function filterProductIdsToCatalog(productIds, products) {
  const catalogIds = new Set(
    (Array.isArray(products) ? products : [])
      .map((product) => Number(product?.id))
      .filter((id) => Number.isFinite(id) && id > 0),
  );

  return [...new Set(
    (Array.isArray(productIds) ? productIds : [])
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id) && catalogIds.has(id)),
  )];
}
