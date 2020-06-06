module.exports = {
  "root": true,
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "project": "tsconfig.json",
    "tsconfigRootDir": __dirname,
    "sourceType": "module"
  },
  "extends": [
    //    "eslint:recommended",
    //    "plugin:@typescript-eslint/recommended",
  ],
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
    "spaced-comment": "off"
  }
};