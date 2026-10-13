import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'prisma/migrations/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: { sourceType: 'module' },
    },
    plugins: { 'simple-import-sort': simpleImportSort },
    rules: {
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-extraneous-class': 'off',
      'max-lines-per-function': ['warn', { max: 80, skipBlankLines: true, skipComments: true }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // AI SDK 与 LangChain 只允许在 infra/ai 内使用；业务与共享层统一走 AiGateway / AiAgentService
    files: ['src/modules/**/*.ts', 'src/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'openai',
              message: '业务代码禁止直接依赖 AI SDK，请注入 @/infra/ai 的 AiGateway / AiAgentService',
            },
            {
              name: 'langchain',
              message: '业务代码禁止直接依赖 LangChain，请注入 @/infra/ai 的 AiGateway / AiAgentService',
            },
            {
              name: '@langchain/core',
              message: '业务代码禁止直接依赖 LangChain，请注入 @/infra/ai 的 AiGateway / AiAgentService',
            },
          ],
          patterns: [
            {
              group: ['@langchain/*', 'langchain/*', 'openai/*', 'langsmith'],
              message: '业务代码禁止直接依赖 AI SDK/LangChain，请注入 @/infra/ai 的门面服务',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['test/**/*.ts', '**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'max-lines-per-function': 'off',
    },
  },
  prettier,
);
