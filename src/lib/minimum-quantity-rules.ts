export function getMinimumProductQuantity(
  _handle: string | null | undefined,
  _sellPrice?: number | string | null,
  _minimumQuantityOverride?: number | string | null,
): number {
  // Legacy callers still use this helper, but product price, handle, and
  // metafield values must never create an order minimum.
  return 1;
}

export function isMinimumTwoBundleProduct(
  _handle: string | null | undefined,
  _sellPrice?: number | string | null,
  _minimumQuantityOverride?: number | string | null,
): boolean {
  return false;
}
