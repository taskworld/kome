# kome

Modern CI/CD builds are nowadays parallelized, by running independent steps on parallel jobs.
As a result, test outcomes are scattered between multiple jobs.
It becomes hard to aggregate test results from all these jobs to provide consolidated and actionable feedback,
especially given that not every job will finish cleanly and make take different amount of time.

## Idea

1. Build steps write files to `$KOME_PATH/*.json`.

2. Run:

   ```
   npx kome
   ```

3. kome writes the files found in `$KOME_PATH` to a centralized database,
   and creates or updates a GitHub comment based on the data collected so far.

## Data model

All data is stored on Firebase Realtime Database.
`kome` accesses the database using a service account, so the database can be set up in locked mode (disallowing all external reads and writes).

- **`<baseRef>`** \
  To allow the same database to be used with multiple projects, `kome` can be configured to used as a subtree inside the database as the base path. This is configured via `firebase.baseRef` settings inside `kome.config.js`.

  Metadata can be attached to a **commit** (applies to a single comment) or to a **pull request**.

  - **`commits/$sha`** \
    Holds the commit metadata. This is arbitrary data, generated by your build, collected and uploaded by the `kome` command.

  - **`pulls/$number`** \
    Holds the pull request metadata. This is arbitrary data, generated by your build, collected and uploaded by the `kome` command.

  - **`comments/$prNumber`** \
    Holds the state for pull request comments on GitHub.

    - **`commentId`** \
      The comment ID. Existing comment will be edited if it exists. Otherwise, a new comment will be created, an its ID will be written here.

    - **`hash`** \
      The hash of the comment contents. Can be used to prevent unnecessary edits to the comment.

    - **`lock`** \
      Since multiple builds may run this command simultaneously (in rare cases), this key is used to make sure the comment is edited by only one build at a time.

      If this is null, then there is no active lock. If this is not null, then a build is working on editing this comment.

      - **`owner`** \
        The process UUID of the process that locks this comment. When the CLI is run, a random identifier is generated as the process UUID. When unlocking, the unlock transaction makes sure not to unlock if it’s not owned by the current process.

      - **`acquiredAt`** \
        The timestamp at which the lock has been acquired. If the lock has not been released within 10 seconds, we assume that the owner has gone, and will treat the lock as nonexistent.
