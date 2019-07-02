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
