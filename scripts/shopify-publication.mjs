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
