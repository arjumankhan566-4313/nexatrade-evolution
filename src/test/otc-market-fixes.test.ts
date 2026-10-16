import { describe, expect, it } from 'vitest';
import { reduceTick, sanitizeCandleSeries, type Candle } from '../../tradeon/server/src/otc/candles';
import { livePayoutRate, PAYOUT_STEP_MS } from '../../tradeon/server/src/otc/payouts';

describe('OTC candle continuity', () => {
  it('anchors a corrupted next candle to the previous close instead of jumping across a fake gap', () => {
    const candles: Candle[] = [
      { time: 0, open: 740, high: 742, low: 739, close: 740, tickCount: 12, finalized: true },
      { time: 60_000, open: 598, high: 600, low: 595, close: 598, tickCount: 12, finalized: true },
      { time: 120_000, open: 605, high: 608, low: 603, close: 605, tickCount: 9, finalized: true },
    ];

    const fixed = sanitizeCandleSeries(candles);

    expect(fixed[1].open).toBeCloseTo(740, 5);
    expect(fixed[1].close).toBeCloseTo(598, 5);
    expect(fixed[1].high).toBeGreaterThanOrEqual(740);
    expect(fixed[1].low).toBeLessThanOrEqual(740);
  });

  it('rolls a new tick from the prior close without creating a discontinuity', () => {
    const state = {
      current: {
        time: 0,
        open: 740,
        high: 742,
        low: 739,
        close: 740,
        tickCount: 2,
        finalized: false,
      },
      finalized: [],
    };

    const next = reduceTick(state, { timestamp: 60_000, price: 741 }, 60_000);

    expect(next.current?.open).toBeCloseTo(740, 5);
    expect(next.current?.close).toBeCloseTo(741, 5);
    expect(next.current?.time).toBe(60_000);
  });
});

describe('live payout rhythm', () => {
  it('keeps the offered payout in-market and on a 3-5 second cadence', () => {
    const now = Date.now();
    const rate = livePayoutRate('EURUSD', 88, { now });

    expect(rate).toBeGreaterThanOrEqual(85);
    expect(rate).toBeLessThanOrEqual(91);
    expect(PAYOUT_STEP_MS).toBeLessThanOrEqual(5_000);
    expect(PAYOUT_STEP_MS).toBeGreaterThanOrEqual(3_000);

    const nextRate = livePayoutRate('EURUSD', 88, { now: now + PAYOUT_STEP_MS });
    expect(typeof nextRate).toBe('number');
    expect(nextRate).toBeGreaterThanOrEqual(85);
    expect(nextRate).toBeLessThanOrEqual(91);
  });
});
