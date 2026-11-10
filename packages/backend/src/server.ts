import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import pino from 'pino';
import { loadConfig } from './config.js';
import { createRuntime } from './runtime.js';

async function start(): Promise<void> {
  const envPath = resolve(process.cwd(), '.env');
  if (existsSync(envPath)) process.loadEnvFile(envPath);

  const config = loadConfig(process.env);
  const runtime = createRuntime(config);
  const server = runtime.app.listen(config.PORT, '0.0.0.0', () => {
    runtime.logger.info({ port: config.PORT }, 'FingerPay backend listening');
  });

  const shutdown = (): void => {
    server.close(() => {
      void runtime.chain.provider.destroy();
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

start().catch((error: unknown) => {
  const logger = pino({ level: 'error' });
  logger.fatal(
    {
      errorName: error instanceof Error ? error.name : 'UnknownError',
      message: safeStartupMessage(error),
    },
    'Backend startup failed',
  );
  process.exitCode = 1;
});

function safeStartupMessage(error: unknown): string {
  if (error instanceof Error && error.name === 'ConfigurationError') return error.message;
  return 'Backend initialization failed';
}
