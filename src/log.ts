import pino from 'pino'

const rootLogger = pino({
  prettyPrint:
    (process.env.NODE_ENV || 'development') === 'development'
      ? { translateTime: true }
      : false,
})

export default rootLogger

export function logger(moduleName: string) {
  return rootLogger.child({ module: moduleName })
}
