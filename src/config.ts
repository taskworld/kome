export type Config = {
  github: GitHubAppConfig | GitHubTokenConfig
  firebase: {
    databaseURL: string
    serviceAccount: any
    baseRef: string
  }
  generateMessage: (context: CommentGenerationContext) => string
}

type GitHubAppConfig = {
  app: {
    appId: string
    privateKey: string
    installationId: string
  }
}

type GitHubTokenConfig = {
  token: string
}

export type CommentGenerationContext = {
  metadata: {
    commit: { [key: string]: any }
    pullRequest: { [key: string]: any }
  }
  sha: string
  owner: string
  repo: string
  number: string
}
