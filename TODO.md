# Footer Integration & Real-Time Data Plan

## Phase 1 — Footer Enhancements (MainFooter.tsx)
- [x] Plan approved
- [x] 1. Add `useShop` hook — dynamic shop name, currency from Shopify
- [x] 2. Add newsletter signup form section in contact card column
- [x] 3. Add payment method icons row in bottom bar
- [x] 4. Add "Powered by Shopify" attribution in copyright section
- [x] 5. Pull email/phone from Shopify runtime context dynamically

## Phase 2 — Real-Time Data Feel
- [x] 6. Update `staleTime` / `refetchInterval` in shopify-data.ts for fresher data
- [x] 7. Add "Live" indicator in footer showing Shopify sync status
- [x] 8. Verify build passes

## Phase 3 — Fix Variant Image Mapping Throttling
- [x] 9. Add jitter to retry backoff in executeGraphQl
- [x] 10. Add inter-batch delay between mutation submissions
- [x] 11. Reduce apply concurrency (3→2) and verify concurrency (10→5)
- [x] 12. Add proactive API cost tracking to slow down before throttling
- [x] 13. Better THROTTLED error detection

## Phase 4 — Build Verification
- [x] 14. Run `npm run build:web` to verify compilation

