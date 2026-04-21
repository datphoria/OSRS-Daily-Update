const fetch = require('node-fetch');

const PLAYER = process.env.WOM_PLAYER || 'TFrog98';
const WEBHOOK = process.env.DISCORD_WEBHOOK;
const USER_AGENT = process.env.WOM_USER_AGENT || 'Datphoria';

if(!WEBHOOK){
  console.error('DISCORD_WEBHOOK not set. Set it as an env var or GitHub secret.');
  process.exit(2);
}

async function fetchTimeline(metric='overall', limit=30){
  const url = `https://api.wiseoldman.net/v2/players/${PLAYER}/snapshots/timeline?metric=${metric}&limit=${limit}`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if(!res.ok){
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

function parseTimeline(timeline){
  // timeline is array of {value, rank, date}
  // normalize to sorted ascending by date
  return timeline.map(t => ({ date: new Date(t.date), value: Number(t.value), rank: t.rank }))
    .sort((a,b)=>a.date - b.date);
}

function computeDeltas(timeline){
  if(timeline.length < 2) return null;
  const latest = timeline[timeline.length-1];
  // find previous snapshot older than 24h
  const oneDayAgo = new Date(latest.date.getTime() - 24*60*60*1000);
  let prev = null;
  for(let i=timeline.length-1;i>=0;i--){
    if(timeline[i].date <= oneDayAgo){ prev = timeline[i]; break; }
  }
  // fallback: use previous element
  if(!prev) prev = timeline[timeline.length-2];
  const daysWindow = 7;
  // compute 7-day window start
  const sevenDaysAgo = new Date(latest.date.getTime() - daysWindow*24*60*60*1000);
  const windowPoints = timeline.filter(t => t.date >= sevenDaysAgo && t.date <= latest.date);
  const firstInWindow = windowPoints.length ? windowPoints[0] : timeline[0];

  const deltaYesterday = latest.value - prev.value;
  const delta7days = latest.value - firstInWindow.value;
  const avgPerDay7 = delta7days / daysWindow;

  return {
    latest: latest,
    prev: prev,
    deltaYesterday,
    delta7days,
    avgPerDay7
  };
}

function formatNumber(n){ return n.toLocaleString('en-GB'); }

async function postDiscord(message){
  const payload = { content: message };
  const res = await fetch(WEBHOOK, { method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type':'application/json' } });
  if(!res.ok) throw new Error(`Discord webhook failed: ${res.status}`);
}

(async ()=>{
  try{
    const [overallRaw, slayerRaw] = await Promise.all([
      fetchTimeline('overall', 1000),
      fetchTimeline('slayer', 1000)
    ]);
    const overall = parseTimeline(overallRaw);
    const slayer = parseTimeline(slayerRaw);
    const od = computeDeltas(overall);
    const sd = computeDeltas(slayer);

    // Slayer ETA to 99
    const SLAYER_99_XP = 13034431; // XP required for 99 Slayer
    const currentSlayerXp = slayer.length ? slayer[slayer.length-1].value : 0;
    const remaining = SLAYER_99_XP - currentSlayerXp;
    const avg7 = sd ? sd.avgPerDay7 : 0;
    const estDays = avg7 > 0 ? Math.ceil(remaining / avg7) : null;
    const estDate = estDays ? new Date(Date.now() + estDays*24*60*60*1000).toISOString().slice(0,10) : 'unknown';

    const msg = [];
    msg.push(`**OSRS Daily Update — ${PLAYER}**`);
    const isMonday = (new Date()).getUTCDay() === 1; // Monday=1
    if(isMonday){
      msg.push(`Overall: ${formatNumber(od.latest.value)} XP`);
      msg.push(`Last 7 days: +${formatNumber(od.delta7days)} XP (avg ${formatNumber(Math.round(od.avgPerDay7))}/day)`);
      msg.push(``);
      msg.push(`Slayer: ${formatNumber(currentSlayerXp)} XP`);
      msg.push(`Last 7 days (slayer): +${formatNumber(sd.delta7days)} XP (avg ${formatNumber(Math.round(sd.avgPerDay7))}/day)`);
      msg.push(`Remaining to 99 Slayer: ${formatNumber(remaining)} XP`);
      msg.push(estDays ? `Estimated days to 99 (7-day avg): ${estDays} days — approx ${estDate}` : `Estimated days to 99: unknown (no recent progress)`);
      msg.push(`Weekly summary generated for previous week.`);
      msg.push(`https://wiseoldman.net/players/${PLAYER}`);
    } else {
      msg.push(`Overall: ${formatNumber(od.latest.value)} XP`);
      msg.push(`Yesterday: +${formatNumber(od.deltaYesterday)} XP`);
      msg.push(`7-day: +${formatNumber(od.delta7days)} XP (avg ${formatNumber(Math.round(od.avgPerDay7))}/day)`);
      msg.push(``);
      msg.push(`Slayer: ${formatNumber(currentSlayerXp)} XP`);
      msg.push(`Yesterday (slayer): +${formatNumber(sd.deltaYesterday)} XP`);
      msg.push(`7-day (slayer): +${formatNumber(sd.delta7days)} XP (avg ${formatNumber(Math.round(sd.avgPerDay7))}/day)`);
      msg.push(`Remaining to 99 Slayer: ${formatNumber(remaining)} XP`);
      msg.push(estDays ? `Estimated days to 99 (7-day avg): ${estDays} days — approx ${estDate}` : `Estimated days to 99: unknown (no recent progress)`);
      msg.push(`https://wiseoldman.net/players/${PLAYER}`);
    }

    await postDiscord(msg.join('\n'));
    console.log('Posted update to Discord.');
  }catch(e){
    console.error('Error:', e.message);
    process.exit(1);
  }
})();
