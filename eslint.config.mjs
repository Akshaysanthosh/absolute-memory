import reactHooks from 'eslint-plugin-react-hooks';
import parser from '@babel/eslint-parser';
import sourceLine, { textParser } from './scripts/eslint-rules/source-line.mjs';

const layout = { rules: { 'source-line': sourceLine } };

const sqlBoundary = {
  selector:
    ":matches(CallExpression, OptionalCallExpression)[callee.type='MemberExpression']" +
    ":matches([callee.property.name='query'], [callee.property.value='query'])",
  message: 'Put database queries in a repository or database module.',
};

export default [
  {
    ignores: [
      '.next/**',
      'dist/**',
      'coverage/**',
      'next-env.d.ts',
      'website/.docusaurus/**',
      'website/.showcase-assets/**',
      'website/build/**',
    ],
  },
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, layout },
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    rules: {
      'layout/source-line': 'error',
      'no-debugger': 'error',
      'no-dupe-else-if': 'error',
      'no-unreachable': 'error',
      'react-hooks/rules-of-hooks': 'error',
    },
  },
  {
    files: ['**/*.{css,sql}'],
    languageOptions: { parser: textParser },
    plugins: { layout },
    rules: { 'layout/source-line': 'error' },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          plugins: [['@babel/plugin-syntax-typescript', { isTSX: true }]],
        },
      },
    },
  },
  {
    files: ['{src,packages,scripts}/**/*.{js,mjs,cjs,ts,tsx}'],
    ignores: ['src/server/repos/**', 'src/server/db/**', 'scripts/migrate.ts'],
    rules: {
      'no-restricted-syntax': ['error', sqlBoundary],
    },
  },
  {
    files: ['src/server/services/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        sqlBoundary,
        {
          selector:
            'TSTypeReference[typeName.name=/^(Request|NextRequest)$/], ImportSpecifier[imported.name=/^(Request|NextRequest)$/], NewExpression[callee.name=/^(Request|NextRequest)$/]',
          message: 'Pass typed data to services from the HTTP layer.',
        },
      ],
    },
  },
  {
    files: ['src/app/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/server/db',
                '@/server/db/**',
                '@/server/repos',
                '@/server/repos/**',
                '**/server/db',
                '**/server/db/**',
                '**/server/repos',
                '**/server/repos/**',
              ],
              message: 'Use a service to access application data.',
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      'src/components/**/*.{ts,tsx}',
      'src/shared/**/*.{ts,tsx}',
      'src/features/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/server', '@/server/**', '**/server', '**/server/**', 'node:*'],
              message: 'Keep this module independent of server code.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/server/{services,jobs,auth,repos,db}/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/server/providers/*', '**/providers/*', '!@/server/providers/index'],
              message: 'Access providers through the provider index.',
            },
          ],
        },
      ],
    },
  },
];
