module.exports = {
  extends: ['expo', 'prettier'],
  env: {
    browser: true,
    es2021: true,
    node: true,
  },
  plugins: ['prettier'],
  rules: {
    'import/namespace': 'off',
    'import/no-unresolved': ['error', { ignore: ['^@env$'] }],
    'prettier/prettier': 'warn',
    'react-hooks/preserve-manual-memoization': 'off',
    'react-hooks/refs': 'off',
    'react-hooks/set-state-in-effect': 'off',
  },
};
