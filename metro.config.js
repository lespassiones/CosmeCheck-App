// Metro configuration — extends Expo's default, wrapped by Sentry.
// `getSentryExpoConfig` ajoute l'injection des "debug IDs" dans les bundles :
// indispensable pour que les source maps uploadées matchent les stack traces
// (sinon traces minifiées illisibles dans Sentry).
// https://docs.expo.dev/guides/customizing-metro/
// https://docs.sentry.io/platforms/react-native/manual-setup/expo/
const { getSentryExpoConfig } = require('@sentry/react-native/metro')

const config = getSentryExpoConfig(__dirname)

module.exports = config
