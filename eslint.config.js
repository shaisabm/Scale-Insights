import js from "@eslint/js";
import globals from "globals";

// Server code, API routes, scripts and tests. The browser app in app/ has its own config.
export default [
  { ignores: ["app/", "node_modules/", ".vercel/"] },
  js.configs.recommended,
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.node,
    },
  },
  {
    // App tests run in happy-dom and drive the browser scripts.
    files: ["tests/app/**/*.js"],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
];
