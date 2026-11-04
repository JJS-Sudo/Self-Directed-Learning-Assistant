import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist/',
    'dist-electron/',
    'release/',
    'node_modules/',
    'coverage/',
    'seeds/',
    '自我导向学习项目运行库/',
    '.dsh/',
    'test-results/',
    'playwright-report/',
  ]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    files: ['web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
])
