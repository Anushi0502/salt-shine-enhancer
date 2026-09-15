import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.{test,spec}.{ts,tsx}", "scripts/**/*.{test,spec}.{js,mjs}"],
    // These suites use Node's native test runner and are executed explicitly
    // with `node --test`; Vitest would otherwise report "No test suite found".
    exclude: [
      "scripts/release-bottleneck-report.test.mjs",
      "scripts/release-resilience.test.mjs",
      "scripts/shopify-catalog-integrity.test.mjs",
      "scripts/shopify-collection-merges-apply.test.mjs",
    ],
  },
  resolve: {
    alias: { "@": path.resolve(process.cwd(), "./src") },
  },
});
