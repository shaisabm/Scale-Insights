import { defineConfig } from "vitest/config";

// Server tests run in Node. App tests opt into a DOM with `// @vitest-environment happy-dom`.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.js"],
    environment: "node",
    restoreMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,
  },
});
