/** Calendar-month windows, clamped for shorter months. Zero means all history. */
export function windowStart(period:number, now=new Date()):string {
  if(period===0) return "";
  const date=new Date(now);
  const day=date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth()-period/30);
  const last=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
  date.setUTCDate(Math.min(day,last));
  return date.toISOString().slice(0,10);
}
