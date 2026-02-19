import { alpacaFetch } from '@/alpaca/client.ts';

export type Account = {
  id: string;
  equity: string;
  cash: string;
  buying_power: string;
  portfolio_value: string;
  status: string;
};

export type Position = {
  asset_id: string;
  symbol: string;
  qty: string;
  avg_entry_price: string;
  market_value: string;
  current_price: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  side: string;
};

export type Order = {
  id: string;
  symbol: string;
  qty: string | null;
  notional: string | null;
  side: 'buy' | 'sell';
  type: string;
  status: string;
  filled_avg_price: string | null;
  filled_qty: string | null;
};

type PlaceOrderParams = {
  symbol: string;
  side: 'buy' | 'sell';
  notional?: string;
  qty?: string;
};

export const getAccount = async (): Promise<Account> => alpacaFetch<Account>('/v2/account');

export const getPositions = async (): Promise<Position[]> =>
  alpacaFetch<Position[]>('/v2/positions');

export const placeOrder = async (params: PlaceOrderParams): Promise<Order> => {
  const body: Record<string, string> = {
    symbol: params.symbol,
    side: params.side,
    type: 'market',
    time_in_force: 'gtc',
  };

  if (params.notional) body.notional = params.notional;
  else if (params.qty) body.qty = params.qty;

  return alpacaFetch<Order>('/v2/orders', 'paper', {
    method: 'POST',
    body: JSON.stringify(body),
  });
};

export const liquidateAll = async (): Promise<void> => {
  await alpacaFetch<unknown>('/v2/positions', 'paper', { method: 'DELETE' });
};
