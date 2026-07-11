/**
 * Jest config dédiée aux PORTS DE LOGIQUE PURE (WS-0.3).
 *
 * Ces tests vérifient la PARITÉ avec le web pour le scoring INCI, l'exposition
 * routine et la cohérence (promesses). Ils ne montent aucun composant React /
 * React-Native — uniquement de la logique TS pure — donc `testEnvironment:
 * 'node'` + preset `ts-jest` suffisent (pas besoin de jest-expo ici).
 *
 * Lancement : npx jest --config jest.config.js
 *
 * NB: on ne touche pas à package.json (propriété de l'agent A) — toute la
 * config vit dans ce fichier et on l'invoque via --config.
 */
/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  // jest-environment-node@30 est installé en devDep explicite (aligné sur
  // jest/jest-runtime@30) — plus de workaround par chemin absolu.
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    // Imports Deno-style avec extension .ts explicite (edge functions) → strip
    // pour que le résolveur Node de Jest les trouve.
    '^(\\.{1,2}/.*)\\.ts$': '$1',
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        // tsconfig du projet ; isolatedModules pour la vitesse et pour éviter
        // que des erreurs de type dans des fichiers non testés (en cours
        // d'édition par d'autres agents) ne bloquent la suite.
        tsconfig: {
          strict: true,
          esModuleInterop: true,
          module: 'commonjs',
          target: 'es2019',
          moduleResolution: 'node',
          skipLibCheck: true,
          // isolatedModules ici (dans le tsconfig inline du transform) plutôt
          // qu'en option ts-jest dépréciée : vitesse + isolation des erreurs
          // de type des fichiers en cours d'édition par d'autres agents.
          isolatedModules: true,
        },
      },
    ],
  },
}
