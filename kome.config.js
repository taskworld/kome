// @ts-check

const invariant = require('invariant')

/**
 * @param {string} name
 */
const env = name =>
  process.env[name] ||
  invariant(false, 'Required environment variable: %s', name)

/**
 * @param {string} encoded
 */
const base64Decode = encoded => Buffer.from(encoded, 'base64').toString()

/** @type {import('./src/config').Config} */
const config = ({
  github: {
    app: {
      appId: env('GH_APP_ID'),
      privateKey: base64Decode(env('GH_APP_PRIVATE_KEY')),
      installationId: env('GH_APP_INSTALLATION_ID'),
    },
  },
  firebase: {
    serviceAccount: JSON.parse(base64Decode(env('FIREBASE_SERVICE_ACCOUNT'))),
    databaseURL: 'https://kome-36c56.firebaseio.com',
    baseRef: '/kome/projects/kome',
  },
  generateMessage: context => {
    return 'Meow!'
  },
})

module.exports = config
