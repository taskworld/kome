import yargs = require('yargs')
import rootLogger from './log'

const log = rootLogger

yargs
  .command(
    '$0',
    'Scans the commit metadata and create/update the commit comment',
    {
      path: {
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
      if (args.path) {
        log.info('Collecting metadata.')
      } else {
        log.info(
          'Skipping metadata collection because `--path` is not provided.',
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
