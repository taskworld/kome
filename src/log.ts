import pino from 'pino'

const rootLogger = pino(
  {
    prettyPrint:
      (process.env.NODE_ENV || 'development') === 'development'
        ? { translateTime: true }
        : false,
  },
  pino.destination(2),
)

export default rootLogger

export function logger(moduleName: string) {
  return rootLogger.child({ name: moduleName })
}
