import { fixupPluginRules } from "@eslint/compat";
import eslint from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier/flat";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";
import drizzlePlugin from "eslint-plugin-drizzle";
import importXPlugin from "eslint-plugin-import-x";
import jsxA11yPlugin from "eslint-plugin-jsx-a11y";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // ── Global ignores ────────────────────────────────────────────────────
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/drizzle/**",
      "**/*.generated.*",
      "**/*.gen.*",
      ".claude/**",
    ],
  },

  // ── Base ESLint recommended rules ─────────────────────────────────────
  {
    files: ["**/*.{js,mjs,cjs,jsx,ts,tsx,mts,cts}"],
    ...eslint.configs.recommended,
  },

  // ── TypeScript strict type-checked rules ──────────────────────────────
  ...tseslint.configs.strictTypeChecked.map((config) => ({
    ...config,
    files: ["**/*.{ts,tsx,mts,cts}"],
  })),

  // ── TypeScript parser options for type-aware linting ──────────────────
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },

  // ── eslint-plugin-import-x ────────────────────────────────────────────
  {
    files: ["**/*.{js,mjs,cjs,jsx,ts,tsx,mts,cts}"],
    ...importXPlugin.flatConfigs.recommended,
    rules: {
      ...importXPlugin.flatConfigs.recommended.rules,
      "import-x/order": [
        "error",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            "parent",
            "sibling",
            "index",
            "type",
          ],
          "newlines-between": "always",
          alphabetize: {
            order: "asc",
            caseInsensitive: true,
          },
        },
      ],
      "import-x/no-duplicates": "error",
    },
    settings: {
      ...importXPlugin.flatConfigs.recommended.settings,
      "import-x/resolver-next": [
        createTypeScriptImportResolver({
          alwaysTryTypes: true,
        }),
      ],
    },
  },

  // ── eslint-plugin-import-x TypeScript-specific rules ──────────────────
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    rules: {
      ...importXPlugin.flatConfigs.typescript.rules,
    },
  },

  // ── React plugin rules (JSX/TSX files) ────────────────────────────────
  {
    files: ["**/*.{jsx,tsx}"],
    ...reactPlugin.configs.flat.recommended,
    languageOptions: {
      ...reactPlugin.configs.flat.recommended.languageOptions,
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      ...reactPlugin.configs.flat.recommended.rules,
      ...reactPlugin.configs.flat["jsx-runtime"].rules,
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },

  // ── React Hooks plugin rules (JSX/TSX files) ─────────────────────────
  {
    files: ["**/*.{jsx,tsx}"],
    plugins: {
      "react-hooks": reactHooksPlugin,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },

  // ── JSX accessibility rules (JSX/TSX files) ──────────────────────────
  {
    files: ["**/*.{jsx,tsx}"],
    ...jsxA11yPlugin.flatConfigs.recommended,
  },

  // ── Drizzle plugin rules (database package only) ─────────────────────
  {
    files: ["packages/database/**/*.{ts,tsx}"],
    plugins: {
      drizzle: fixupPluginRules(drizzlePlugin),
    },
    rules: {
      "drizzle/enforce-delete-with-where": "error",
      "drizzle/enforce-update-with-where": "error",
    },
  },

  // ── Relaxed rules for test files ─────────────────────────────────────
  {
    files: [
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/*.spec.ts",
      "**/*.spec.tsx",
    ],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-confusing-void-expression": "off",
    },
  },

  // ── Exclude config files from strict type-checked rules ──────────────
  {
    files: ["**/*.config.ts", "**/*.config.mjs", "**/*.config.js"],
    ...tseslint.configs.disableTypeChecked,
  },

  // ── Prettier (must be last to override formatting rules) ─────────────
  eslintConfigPrettier,
);
