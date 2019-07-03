import yargs = require('yargs')
import glob = require('glob')
import execa = require('execa')
import invariant from 'invariant'
import * as admin from 'firebase-admin'
import cosmiconfig from 'cosmiconfig'
import rootLogger from './log'
import { join } from 'path'
import { readFileSync } from 'fs'
import { CommentGenerationContext } from './config'
import Octokit from '@octokit/rest'
import { App } from '@octokit/app'
import uuid = require('uuid')
import delay from 'delay'
import { createHash } from 'crypto'

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

      if (args.pullRequest) {
        const { owner, repo, number } = parsePullRequestUrl(args.pullRequest)
        log.info('Updating pull request comment.')
        await updatePullRequestComment(owner, repo, number, sha)
      } else {
        log.info(
          'Skipping pull request comment update because `--pullRequest` is not provided.',
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

async function updatePullRequestComment(
  owner: string,
  repo: string,
  number: string,
  sha: string,
) {
  // Acquire lock:
  const lock = await acquireLock(
    admin.database().ref(`${config.firebase.baseRef}/comments/${number}/lock`),
  )
  if (!lock) return
  try {
    const getFirebaseData = async (path: string): Promise<any> =>
      (await admin
        .database()
        .ref(`${config.firebase.baseRef}/${path}`)
        .once('value')).val() || {}
    const commitMetadataPromise = getFirebaseData(`commits/${sha}`)
    const pullRequestMetadataPromise = getFirebaseData(`pulls/${number}`)

    const context: CommentGenerationContext = {
      metadata: {
        commit: await commitMetadataPromise,
        pullRequest: await pullRequestMetadataPromise,
      },
      sha,
      owner,
      repo,
      number,
    }

    const text = config.generateMessage(context)
    const hash = createHash('sha256')
      .update(text)
      .digest()
    const commentRef = await admin
      .database()
      .ref(`${config.firebase.baseRef}/comments/${number}`)
    const comment = await commentRef.once('value')
    const gh = await getGitHubClient()

    if (comment.child('commentId').exists()) {
      if (comment.child('hash').val() !== hash) {
        const commentId = comment.child('commentId').val()
        await gh.issues.updateComment({
          owner,
          repo,
          comment_id: commentId,
          body: text,
        })
        await commentRef.update({ hash: hash })
      } else {
        log.info('Did not update the comment because its hash is unchanged')
      }
    } else {
      const result = await gh.issues.createComment({
        owner,
        repo,
        issue_number: +number,
        body: text,
      })
      await commentRef.update({ commentId: result.data.id, hash: hash })
      log.info('Created comment %s', result.data.id)
    }
  } finally {
    lock.release()
  }
}

async function acquireLock(lockRef: admin.database.Reference) {
  const processId = uuid.v4()
  for (let i = 1; ; i++) {
    const acquireResult = await lockRef.transaction(data => {
      if (data && data.acquiredAt >= Date.now() - 10e3) {
        return undefined
      } else {
        return {
          owner: processId,
          acquiredAt: admin.database.ServerValue.TIMESTAMP,
        }
      }
    })
    if (acquireResult.committed) {
      log.warn('Lock acquired!')
      break
    } else {
      const maxAttempts = 10
      if (i >= maxAttempts) {
        log.warn('Giving up acquiring lock after %s attempts.', maxAttempts)
        return null
      } else {
        log.warn('Resource locked. Waiting...')
        await delay(5e3)
      }
    }
  }
  return {
    async release() {
      await lockRef.transaction(data => {
        if (data && data.owner === processId) {
          return null
        } else {
          return undefined
        }
      })
    },
  }
}

async function getGitHubClient() {
  if (config.github.token) {
    return new Octokit({
      auth: config.github.token,
    })
  } else {
    const app = new App({
      id:
        config.github.app.appId ||
        invariant(false, 'Missing `github.app.appId` in config.'),
      privateKey:
        config.github.app.privateKey ||
        invariant(false, 'Missing `github.app.privateKey` in config.'),
    })
    return new Octokit({
      async auth() {
        const installationAccessToken = await app.getInstallationAccessToken({
          installationId:
            config.github.app.installationId ||
            invariant(false, 'Missing `github.app.installationId` in config.'),
        })
        return `token ${installationAccessToken}`
      },
    })
  }
}
