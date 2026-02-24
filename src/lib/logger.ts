import 'dotenv/config';
import winston from 'winston';


const isProd = process.env.NODE_ENV === 'production';

export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

const log = logger;

if (!isProd) {
  log.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    })
  );
}

const pathMeta = (path: string) => ({ path });

export function LogError(
  path: string,
  method: string,
  endpoint: string,
  error: unknown
) {
  log.error('Request error', {
    ...pathMeta(path),
    method,
    endpoint,
    errorMessage: error instanceof Error ? error.message : String(error),
    errorStack: error instanceof Error ? error.stack : undefined,
  });
}

export function LogSuccess(path: string, message: string) {
  log.info(message, pathMeta(path));
}

export function LogInfo(path: string, message: string) {
  log.info(message, pathMeta(path));
}

export function LogWarning(path: string, message: string) {
  log.warn(message, pathMeta(path));
}
