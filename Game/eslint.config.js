import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      // `any` sesekali dipakai di batas data JSON naskah yang tak terdefinisi
      // ketat; dibiarkan sebagai peringatan supaya tetap terlihat tanpa
      // memblokir build/warisan kode.
      '@typescript-eslint/no-explicit-any': 'warn',
      // Parameter yang sengaja dibiarkan kosong memakai `_` di depan.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
      ],
      // Sebagian destrukturisasi (mis. `let [x, y, z]`) memang memakai const
      // untuk sebagian variabelnya; melaporkan per-item hanya memaksa kode
      // dirombak tanpa nilai tambah, cukup bila semuanya bisa const.
      'prefer-const': ['error', { destructuring: 'all' }]
    }
  }
);
