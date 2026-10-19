import tseslint from "typescript-eslint";
import pluginVue from "eslint-plugin-vue";

export default tseslint.config(
  { ignores: ["**/.nuxt/**", "**/.output/**", "**/dist/**", "**/src/generated/**"] },
  ...tseslint.configs.recommended,
  ...pluginVue.configs["flat/essential"],
  {
    files: ["**/*.vue"],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: [".vue"]
      }
    }
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "vue/multi-word-component-names": "off",
      "vue/no-mutating-props": "error"
    }
  }
);
