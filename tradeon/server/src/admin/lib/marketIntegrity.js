/** Direct legacy port for the admin activity chart. */
export function exchangeAssets(payload) {
  return (payload?.symbols || []).filter(s => s.status === 'TRADING' && s.quoteAsset === 'USDT' && s.isSpotTradingAllowed !== false).map(s => {
    const tick=String(s.filters?.find(f=>f.filterType==='PRICE_FILTER')?.tickSize || '0.00000001');
    const digits=tick.includes('e-') ? Number(tick.split('e-')[1]) : (tick.split('.')[1] || '').replace(/0+$/,'').length;
    return {symbol:s.symbol,base:s.baseAsset,digits:Math.min(8,digits)};
  });
}
export function quoteIsTradable(q, now=Date.now()) {
  return Boolean(q?.price>0 && !q.stale && !q.reference && !q.delayed && !q.marketClosed && q.marketState!=='CLOSED' && q.realtime!==false && q.ts>0 && now-q.ts<=15000 && q.ts<=now+5000);
}
/** A ticker window's closeTime is not the last transaction's timestamp. */
export function latestAggregateTradeQuote(payload) {
  const row=Array.isArray(payload) ? payload.at(-1) : null;
  const price=Number(row?.p),ts=Number(row?.T),tradeId=Number(row?.a);
  if(!Number.isFinite(price)||price<=0||!Number.isFinite(ts)||ts<=0||!Number.isSafeInteger(tradeId)||tradeId<0)return null;
  return {price,ts,tradeId,source:'BINANCE',realtime:true};
}
export function observedCandles(samples, seconds=60, limit=300) {
  const rows=new Map();
  for(const s of samples||[]){
    if(!(s.price>0)||!(s.ts>0)) continue;
    const time=Math.floor(s.ts/1000/seconds)*seconds,p=rows.get(time);
    if(p){p.high=Math.max(p.high,s.price);p.low=Math.min(p.low,s.price);p.close=s.price;}
    else rows.set(time,{time,open:s.price,high:s.price,low:s.price,close:s.price,volume:null});
  }
  return [...rows.values()].sort((a,b)=>a.time-b.time).slice(-limit);
}
