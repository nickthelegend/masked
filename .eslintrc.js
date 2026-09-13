// Expo's config (SDK 52), which carries eslint-plugin-react-hooks.
// https://docs.expo.dev/guides/using-eslint/
module.exports = {
  extends: 'expo',
  ignorePatterns: [
    '/dist/*',
    '/web-build/*',
    '/.expo/*',
    '/chain/*',
    '/test-ledger/*',
    '/.localnet/*',
    '/magicblock-test-storage/*',
    // The design hand-off the app was ported from, kept for reference and
    // imported by nothing.
    '/ui/*',
  ],
  rules: {
    // A missing dependency is how stale closures got in (7cf4a83: every match
    // opened at 300 s; a WOFI join while the lobby showed SOL), so it fails the
    // suite rather than warning. Where a dependency is left out on purpose, the
    // line says why with a disable comment.
    'react-hooks/exhaustive-deps': 'error',
  },
  overrides: [
    {
      // Expo's TypeScript override covers .ts and .tsx; the scripts are .mts.
      files: ['*.mts'],
      parser: '@typescript-eslint/parser',
    },
    {
      // Node programs, not the app: URL, AbortSignal, process and friends are globals.
      files: ['server/**', 'scripts/**'],
      env: { node: true, es2022: true },
    },
  ],
};
