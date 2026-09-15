import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

function stripScriptShebang() {
  return {
    name: "strip-script-shebang",
    enforce: "pre" as const,
    transform(code: string, id: string) {
      if (!/(^|[/\\])scripts[/\\].+\.m?js$/.test(id)) {
        return null;
      }

      return code.replace(/^#![^\r\n]*(?:\r\n|\n|$)/, "");
    },
  };
}

export default defineConfig({
  plugins: [stripScriptShebang(), react()],
  test: {
    testTimeout: 15_000,
    maxWorkers: 1,
    minWorkers: 1,
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
