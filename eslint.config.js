import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', '.ralph', 'logs'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { rules: { '@typescript-eslint/no-non-null-assertion': 'error' } },
  // Plain browser module behind the standalone 3D sketch pages (no build step).
  {
    files: ['sketch3d/**/*.js'],
    languageOptions: {
      globals: Object.fromEntries([
        'window', 'document', 'location', 'console', 'performance', 'indexedDB',
        'setTimeout', 'clearTimeout', 'FileSystemFileHandle',
      ].map((name) => [name, 'readonly'])),
    },
  },
);
