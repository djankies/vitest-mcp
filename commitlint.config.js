// Commit messages decide release versions (see .releaserc.json), so they are linted
// locally by the husky commit-msg hook and on pull requests in CI.
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Release commits carry the generated notes in their body
    'body-max-line-length': [0],
    'footer-max-line-length': [0],
  },
};
