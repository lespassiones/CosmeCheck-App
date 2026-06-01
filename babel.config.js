module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    // babel-preset-expo automatically wires the reanimated/worklets plugin
    // (SDK 50+). No manual 'react-native-reanimated/plugin' entry needed.
  }
}
