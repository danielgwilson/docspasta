import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Function style rules - make them warnings instead of errors for easier migration
      "func-style": ["warn", "expression", { allowArrowFunctions: true }],
      "prefer-arrow-callback": "warn",
      "arrow-body-style": ["warn", "as-needed"],
    },
  },
  {
    ignores: [
      '.next',
      '.cache',
      'package-lock.json',
      'public',
      'node_modules',
      'next-env.d.ts',
      'next.config.ts',
      'src/generated/gql',
    ],
  },
];

export default eslintConfig;

