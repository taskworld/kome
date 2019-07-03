export type Config = {
  github: GitHubAppConfig | GitHubTokenConfig
  firebase: {
    databaseURL: string
    serviceAccount: any
    baseRef: string
  }
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
