// ESLint 9 flat config for Next.js 16.
// `next lint` was removed in Next 16; run ESLint directly via `npm run lint`.
// eslint-config-next ships native flat configs (arrays) that we compose here.
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

export default [
  {
    // Global ignores — generated output and vendored code.
    ignores: [
      '.next/**',
      'out/**',
      'build/**',
      'dist/**',
      'node_modules/**',
      'next-env.d.ts',
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // Project calibration — align lint rules with this codebase's intentional
    // conventions so the linter surfaces real problems (hooks, a11y) instead of
    // noise the team already accepted.
    rules: {
      // The client data layer deliberately types the mutation context / db as
      // `any` (documented pattern in mutations/*). Not a defect here.
      '@typescript-eslint/no-explicit-any': 'off',
      // Keep unused vars visible as warnings, but honor the `_`-prefix convention
      // used for intentionally-unused args (e.g. `_ctx`).
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // Spanish UI copy uses apostrophes/quotes freely in JSX text.
      'react/no-unescaped-entities': 'off',
    },
  },
];
