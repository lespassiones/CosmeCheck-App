/**
 * withFreshUpdatesResources — plugin de configuration Expo (Android).
 *
 * POURQUOI : la tâche Gradle d'expo-updates `create<Variant>UpdatesResources`
 * (qui écrit `app.manifest`, la table des images, icônes et polices embarquées)
 * ne déclare AUCUN fichier source en entrée. Une fois générée, Gradle la juge
 * « à jour » pour toujours : chaque build Android local suivant réembarque une
 * table périmée. Incident du 29/09/2026 : l'AAB Play Store (versionCode 30)
 * contenait le code récent avec la table du 22 juillet, donc 35 fichiers
 * introuvables (images du parcours d'accueil, icônes de catégories, police
 * Caveat, icône de l'app) : écrans vides sur Android, iPhone intact.
 *
 * Injecté dans android/app/build.gradle à chaque `expo prebuild` (le dossier
 * android/ n'est pas versionné) :
 *   1. la table est régénérée à chaque build ;
 *   2. le dossier des images générées est vidé avant chaque bundle (sinon les
 *      images d'anciennes versions y restent et partent dans l'AAB) ;
 *   3. après `bundleRelease`, scripts/verify-android-assets.mjs contrôle l'AAB :
 *      une image, une icône ou une police manquante fait ÉCHOUER le build.
 */
const { withAppBuildGradle } = require('expo/config-plugins')

const BEGIN = '// [withFreshUpdatesResources] begin'
const END = '// [withFreshUpdatesResources] end'

const SNIPPET = `
${BEGIN}
// Voir plugins/withFreshUpdatesResources.js (images absentes sur la version Play, 29/09/2026).
tasks.configureEach { task ->
    // 1. expo-updates ne déclare aucune entrée : sans ça, la table des images reste périmée.
    if (task.name ==~ /create.*UpdatesResources/) {
        task.outputs.upToDateWhen { false }
    }
    // 2. Dossier des images générées vidé avant le bundle : pas de restes d'anciennes versions.
    if (task.name ==~ /createBundle.*JsAndAssets/ && task.hasProperty('resourcesDir')) {
        task.doFirst { project.delete(task.resourcesDir.get().asFile) }
    }
}
// 3. Garde-fou : l'AAB ne part jamais avec une image, une icône ou une police manquante.
def verifyReleaseAndroidAssets = tasks.register('verifyReleaseAndroidAssets', Exec) {
    workingDir rootDir.parentFile
    commandLine 'node', 'scripts/verify-android-assets.mjs',
        layout.buildDirectory.file('outputs/bundle/release/app-release.aab').get().asFile.absolutePath
}
tasks.configureEach { task ->
    if (task.name == 'bundleRelease') {
        task.finalizedBy(verifyReleaseAndroidAssets)
    }
}
${END}
`

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

module.exports = function withFreshUpdatesResources(config) {
  return withAppBuildGradle(config, (cfg) => {
    // Remplace un bloc déjà injecté (version antérieure comprise) par la version actuelle.
    const block = new RegExp(`\\n?${escapeRegExp(BEGIN)}[\\s\\S]*?${escapeRegExp(END)}\\n?`, 'g')
    const legacy = /\n\/\/ \[withFreshUpdatesResources\] expo-updates[\s\S]*?\n}\n/g
    const rest = cfg.modResults.contents.replace(block, '\n').replace(legacy, '\n').replace(/\s*$/, '\n')
    cfg.modResults.contents = rest + SNIPPET
    return cfg
  })
}
