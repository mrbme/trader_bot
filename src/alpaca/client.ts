import { config } from '@/utils/config.ts';
import { logger } from '@/utils/logger.ts';

type ApiBase = 'paper' | 'data';

const BASE_URLS: Record<ApiBase, string> = {
  paper: config.alpaca.paperApiUrl,
  data: config.alpaca.dataApiUrl,
};

const headers = (): Record<string, string> => ({
  'APCA-API-KEY-ID': config.alpaca.keyId,
  'APCA-API-SECRET-KEY': config.alpaca.secretKey,
  'Content-Type': 'application/json',
});

export const alpacaFetch = async <T>(
  path: string,
  base: ApiBase = 'paper',
  options: RequestInit = {},
): Promise<T> => {
  const url = `${BASE_URLS[base]}${path}`;
  logger.debug(`Alpaca ${options.method ?? 'GET'} ${path}`);

  const res = await fetch(url, {
    ...options,
    headers: { ...headers(), ...options.headers },
  });

  if (!res.ok) {
    const body = await res.text();
    logger.error(`Alpaca API error: ${res.status}`, { path, body });
    throw new Error(`Alpaca ${res.status}: ${body}`);
  }

  if (res.status === 204) return {} as T;
  return res.json() as Promise<T>;
};
