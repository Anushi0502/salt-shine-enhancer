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
  },
  resolve: {
    alias: { "@": path.resolve(process.cwd(), "./src") },
  },
});
