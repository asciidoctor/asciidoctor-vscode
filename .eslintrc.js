module.exports = {
  "root": true,
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "project": "tsconfig.json",
    "tsconfigRootDir": __dirname,
    "sourceType": "module"
  },
  "plugins": ["@typescript-eslint"],
  "extends": [
    "standard"
  ],
  "env": {
    "mocha": true
  },
  "rules": {
    "arrow-parens": ["error", "always"],
    "comma-dangle": ["error", {
      "arrays": "always-multiline",
      "objects": "always-multiline",
      "imports": "always-multiline",
      "exports": "always-multiline"
    }],
    "max-len": ["error", {
      "code": 180,
      "ignoreStrings": true,
      "ignoreUrls": true,
      "ignoreTemplateLiterals": true
    }],
    // https://github.com/typescript-eslint/typescript-eslint/blob/02c6ff3c5a558f9308d7166d524156dc12e32759/packages/eslint-plugin/docs/rules/indent.md
    "indent": "off",
    "@typescript-eslint/indent": ["error", 2, { "SwitchCase": 1 }],
    "semi": ["error", "never"],
    "spaced-comment": "off",
    // https://github.com/typescript-eslint/typescript-eslint/issues/2621
    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    "no-useless-constructor": "off",
    "@typescript-eslint/no-useless-constructor": ["error"]
  }
};
