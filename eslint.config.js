import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/.vite/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: [
      "apps/server/**/*.ts",
      "packages/herdr/src/transport/relay.mjs",
      "scripts/tailscale-web-proxy.mjs",
    ],
    languageOptions: {
      globals: globals.node,
    },
  },
  prettier,
);
