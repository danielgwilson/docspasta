/** @type {import('prettier').Config} */
const config = {
  singleQuote: true,
  trailingComma: "all",
  // jsxSingleQuote: false,
  arrowParens: "always",
  semi: true,
  tabWidth: 2,
  useTabs: false,
  printWidth: 72,
  endOfLine: "lf",
  bracketSpacing: true,
  proseWrap: "preserve",
  quoteProps: "as-needed",
  htmlWhitespaceSensitivity: "css",
  embeddedLanguageFormatting: "auto",

  plugins: ["prettier-plugin-tailwindcss"],
};

export default config;
