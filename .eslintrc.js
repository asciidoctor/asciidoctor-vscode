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
      "code": 160,
      "ignoreStrings": true,
      "ignoreUrls": true,
      "ignoreTemplateLiterals": true
    }],
    //"indent": ["error", 4],
    "semi": ["error", "never"],
    "spaced-comment": "off",
    // https://github.com/typescript-eslint/typescript-eslint/issues/2621
    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
  }
};
