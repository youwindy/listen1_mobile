module.exports = {
  root: true,
  extends: '@react-native',
  // `legacy/` holds the archived React Native 0.59 app (Flow syntax) and
  // `_bundle/` the scaffold's bundled assets; neither is linted.
  ignorePatterns: ['legacy/', '_bundle/', '.rn-template/', 'node_modules/', 'android/', 'ios/'],
};
