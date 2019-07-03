import yargs = require('yargs')
import glob = require('glob')
import execa = require('execa')
import invariant from 'invariant'
import * as admin from 'firebase-admin'
import cosmiconfig from 'cosmiconfig'
import rootLogger from './log'
import { join } from 'path'
import { readFileSync } from 'fs'

const { config } =
  cosmiconfig('kome').searchSync() ||
  invariant(false, 'Config file (kome.config.js) is expected.')

admin.initializeApp({
  credential: admin.credential.cert(config.firebase.serviceAccount),
  databaseURL: config.firebase.databaseURL,
})

const log = rootLogger

yargs
  .command(
    '$0',
    'Scans the commit metadata and create/update the commit comment',
    {
      commitMetadataPath: {
        desc: 'Path to a directory with commit metadata to write.',
        type: 'string',
      },
      pullRequestMetadataPath: {
        desc: 'Path to a directory with pull request metadata to write.',
        type: 'string',
      },
      pullRequest: {
        desc:
          'URL to the pull request. Needed for creating a comment and for updating pull request metadata.',
        type: 'string',
      },
    },
    async args => {
      const sha = execa.sync('git', ['rev-parse', 'HEAD']).stdout.trim()

      if (args.commitMetadataPath) {
        log.info('Collecting metadata for commit %s.', sha)
        const commitMetadata = await collectMetadata(args.commitMetadataPath)
        log.info(commitMetadata, 'Collected metadata:')
        await writeMetadata(`commits/${sha}`, commitMetadata)
      } else {
        log.info(
          'Skipping commit metadata collection because `--commitMetadataPath` is not provided.',
        )
      }

      if (args.pullRequestMetadataPath) {
        if (args.pullRequest) {
          const { number } = parsePullRequestUrl(args.pullRequest)
          log.info('Collecting metadata for commit %s.', sha)
          const pullRequestMetadata = await collectMetadata(
            args.pullRequestMetadataPath,
          )
          log.info(pullRequestMetadata, 'Collected metadata:')
          await writeMetadata(`pulls/${number}`, pullRequestMetadata)
        } else {
          log.info(
            'Skipping pull request metadata collection because `--pullRequest` is not provided.',
          )
        }
      } else {
        log.info(
          'Skipping pull request metadata collection because `--pullRequestMetadataPath` is not provided.',
        )
      }

      if (args.pull) {
        log.info('Updating pull request comment.')
      } else {
        log.info(
          'Skipping pull request comment update because `--pull` is not provided.',
        )
      }
      process.exit(0)
    },
  )
  .demandCommand()
  .help()
  .strict()
  .parse()

async function collectMetadata(basePath: string) {
  const out: any = {}
  const files = glob.sync('*', { cwd: basePath })
  const keyify = (name: string) => name.split('.').join('/')
  for (const file of files) {
    const filePath = join(basePath, file)
    const fileContents = readFileSync(filePath, 'utf8')
    if (file.endsWith('.json')) {
      out[keyify(file.slice(0, -5))] = JSON.parse(fileContents)
    } else {
      out[keyify(file)] = fileContents
    }
  }
  return out
}

async function writeMetadata(path: string, collectedMetadata: any) {
  await admin
    .database()
    .ref(`${config.firebase.baseRef}/${path}`)
    .update(collectedMetadata)
}

function parsePullRequestUrl(
  url: string,
): {
  owner: string
  repo: string
  number: string
} {
  const m = /([^/]+)\/([^/]+)\/pull\/(\d+)/.exec(url)
  if (!m) return invariant(false, 'Invalid pull request URL: %s', url)
  return {
    owner: m[1],
    repo: m[2],
    number: m[3],
  }
}
