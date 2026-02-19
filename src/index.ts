import { loadState } from '@/state/store.ts';
import { createServer } from '@/server.ts';
import { startLoop } from '@/engine/loop.ts';
import { logger } from '@/utils/logger.ts';
import config from '@/utils/config.ts';

const main = async () => {
  logger.info('Crypto Volatility Bot starting up', {
    mode: config.botMode,
    port: config.port,
  });

  await loadState();
  createServer();
  startLoop();

  logger.info('Bot is live — dashboard + trading loop running');
};

main().catch((err) => {
  logger.error('Fatal startup error', {
    error: (err as Error).message,
    stack: (err as Error).stack,
  });
  process.exit(1);
});
