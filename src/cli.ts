import yargs = require('yargs')
import glob = require('glob')
import cosmiconfig from 'cosmiconfig'
import rootLogger from './log'
import { join } from 'path'
import { readFileSync } from 'fs'

cosmiconfig('kome').searchSync()

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
      pull: {
        desc:
          'URL to the pull request. Needed for creating a comment and for updating pull request metadata.',
        type: 'string',
      },
    },
    async args => {
      if (args.commitMetadataPath) {
        log.info('Collecting metadata.')
        const commitMetadata = await collectMetadata(args.commitMetadataPath)
        log.info(commitMetadata, 'Collected metadata:')
      } else {
        log.info(
          'Skipping commit metadata collection because `--commitMetadataPath` is not provided.',
        )
      }
      if (args.pull) {
        log.info('Updating pull request comment.')
      } else {
        log.info(
          'Skipping pull request comment update because `--pull` is not provided.',
        )
      }
    },
  )
  .demandCommand()
  .help()
  .strict()
  .parse()

async function collectMetadata(basePath: string) {
  const out: any = {}
  const files = glob.sync('*', { cwd: basePath })
  for (const file of files) {
    const filePath = join(basePath, file)
    const fileContents = readFileSync(filePath, 'utf8')
    if (file.endsWith('.json')) {
      out[file.slice(0, -5)] = JSON.parse(fileContents)
    } else {
      out[file] = fileContents
    }
  }
  return out
}
