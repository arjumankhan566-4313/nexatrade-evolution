import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // `tradeon/` is the archived legacy monorepo kept for reference (its own
    // package.json/tsconfig, not part of this app's build). `drizzle/`,
    // `database-export/` and `supabase/` are generated SQL/config. Linting them
    // from this config reported thousands of unrelated errors and made
    // `bun run lint` time out.
    ignores: [
      "dist",
      ".output",
      ".vinxi",
      "tradeon",
      "drizzle",
      "database-export",
      "supabase",
      // Tool/runtime scratch dirs that can live inside the checkout. Without
      // these, `eslint .` walked a package-manager cache of thousands of files
      // and took minutes instead of seconds.
      ".cline-home",
      ".tmpcheck",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  // `src/tradeon-client/**` is a 1:1 port of the legacy TRADEON client. Those
  // files carry `// @ts-nocheck` and use `any` at the untrusted API boundary on
  // purpose, and they must stay diffable against the original source, so the two
  // rules that only ever fire there are disabled for that folder alone. The rest
  // of the app keeps the strict config.
  {
    files: ["src/tradeon-client/**/*.{ts,tsx,js,jsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/ban-ts-comment": "off",
    },
  },
  eslintPluginPrettier,
);
