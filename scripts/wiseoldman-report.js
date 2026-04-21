const fetch = require('node-fetch');

const PLAYER = process.env.WOM_PLAYER || 'TFrog98';
const WEBHOOK = process.env.DISCORD_WEBHOOK;
const USER_AGENT = process.env.WOM_USER_AGENT || 'Datphoria';

if(!WEBHOOK){
  console.error('DISCORD_WEBHOOK not set. Set it as an env var or GitHub secret.');
  process.exit(2);
}

async function fetchWithRetries(url, options = {}, attempts = 3, delayMs = 1000){
  for(let i=0;i<attempts;i++){
    try{
      const res = await fetch(url, options);
      if(!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return res.json();
    }catch(e){
      if(i === attempts-1) throw e;
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

async function fetchTimeline(metric='overall', limit=30){
  const url = `https://api.wiseoldman.net/v2/players/${PLAYER}/snapshots/timeline?metric=${metric}&limit=${limit}`;
  return fetchWithRetries(url, { headers: { 'User-Agent': USER_AGENT } }, 4, 1200);
}

function parseTimeline(timeline){
  return timeline.map(t => ({ date: new Date(t.date), value: Number(t.value), rank: t.rank }))
    .sort((a,b)=>a.date - b.date);
}

function computeDeltas(timeline){
  if(!timeline || timeline.length < 2) return null;
  const latest = timeline[timeline.length-1];
  const oneDayAgo = new Date(latest.date.getTime() - 24*60*60*1000);
  let prev = null;
  for(let i=timeline.length-1;i>=0;i--){ if(timeline[i].date <= oneDayAgo){ prev = timeline[i]; break; } }
  if(!prev) prev = timeline[timeline.length-2];
  const daysWindow = 7;
  const sevenDaysAgo = new Date(latest.date.getTime() - daysWindow*24*60*60*1000);
  const windowPoints = timeline.filter(t => t.date >= sevenDaysAgo && t.date <= latest.date);
  const firstInWindow = windowPoints.length ? windowPoints[0] : timeline[0];
  const deltaYesterday = latest.value - prev.value;
  const delta7days = latest.value - firstInWindow.value;
  const avgPerDay7 = delta7days / daysWindow;
  return { latest, prev, deltaYesterday, delta7days, avgPerDay7 };
}

function formatNumber(n){ return n.toLocaleString('en-GB'); }

async function postDiscordEmbed(embed){
  const payload = { embeds: [embed] };
  const res = await fetch(WEBHOOK, { method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type':'application/json' } });
  if(!res.ok) throw new Error(`Discord webhook failed: ${res.status}`);
}

function makeEmbed(title, fields, color=0xE09F76){
  const avatarUrl = `https://wiseoldman.net/players/${PLAYER}/avatar`;
  return {
    title,
    color,
    author: { name: PLAYER, icon_url: avatarUrl },
    thumbnail: { url: avatarUrl },
    fields,
    footer: { text: 'OSRS Daily Update', icon_url: 'https://wiseoldman.net/favicon.png' },
    timestamp: new Date().toISOString()
  };
}

async function notifyError(err){
  try{
    const embed = makeEmbed('OSRS Daily Update — Error', [
      { name: 'Player', value: PLAYER, inline: true },
      { name: 'Error', value: String(err).slice(0, 2000), inline: false }
    ], 0xFF3333);
    await postDiscordEmbed(embed);
  }catch(e){ console.error('Failed to post error to Discord:', e.message); }
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

    if(!od || !sd){ throw new Error('Insufficient timeline data'); }

    const SLAYER_99_XP = 13034431;
    const currentSlayerXp = slayer.length ? slayer[slayer.length-1].value : 0;
    const remaining = SLAYER_99_XP - currentSlayerXp;
    const avg7 = sd ? sd.avgPerDay7 : 0;
    const estDays = avg7 > 0 ? Math.ceil(remaining / avg7) : null;
    const estDate = estDays ? new Date(Date.now() + estDays*24*60*60*1000).toISOString().slice(0,10) : 'unknown';

    const isMonday = (new Date()).getUTCDay() === 1; // Monday=1
    const title = `OSRS Daily Update — ${PLAYER}`;
    const fields = [];

    if(isMonday){
      fields.push({ name: 'Overall (now)', value: `${formatNumber(od.latest.value)} XP`, inline: true });
      fields.push({ name: '7-day total', value: `+${formatNumber(od.delta7days)} XP`, inline: true });
      fields.push({ name: '\u200b', value: '\u200b', inline: false });
      fields.push({ name: 'Slayer (now)', value: `${formatNumber(currentSlayerXp)} XP`, inline: true });
      fields.push({ name: 'Slayer 7-day', value: `+${formatNumber(sd.delta7days)} XP (avg ${formatNumber(Math.round(sd.avgPerDay7))}/day)`, inline: true });
      fields.push({ name: 'Remaining to 99 Slayer', value: `${formatNumber(remaining)} XP`, inline: false });
      fields.push({ name: 'ETA (7-day avg)', value: estDays ? `${estDays} days — approx ${estDate}` : 'unknown', inline: false });
      fields.push({ name: 'Link', value: `https://wiseoldman.net/players/${PLAYER}`, inline: false });
    } else {
      fields.push({ name: 'Overall (now)', value: `${formatNumber(od.latest.value)} XP`, inline: true });
      fields.push({ name: 'Yesterday', value: `+${formatNumber(od.deltaYesterday)} XP`, inline: true });
      fields.push({ name: '7-day avg', value: `${formatNumber(Math.round(od.avgPerDay7))}/day`, inline: true });
      fields.push({ name: '\u200b', value: '\u200b', inline: false });
      fields.push({ name: 'Slayer (now)', value: `${formatNumber(currentSlayerXp)} XP`, inline: true });
      fields.push({ name: 'Yesterday (slayer)', value: `+${formatNumber(sd.deltaYesterday)} XP`, inline: true });
      fields.push({ name: 'Slayer 7-day avg', value: `${formatNumber(Math.round(sd.avgPerDay7))}/day`, inline: true });
      fields.push({ name: 'Remaining to 99 Slayer', value: `${formatNumber(remaining)} XP`, inline: false });
      fields.push({ name: 'ETA (7-day avg)', value: estDays ? `${estDays} days — approx ${estDate}` : 'unknown', inline: false });
      fields.push({ name: 'Link', value: `https://wiseoldman.net/players/${PLAYER}`, inline: false });
    }

    const color = isMonday ? 0x6A8E3E : 0xE09F76;
    const embed = makeEmbed(title, fields, color);

    await postDiscordEmbed(embed);
    console.log('Posted embed update to Discord.');
  }catch(e){
    console.error('Error:', e.message);
    await notifyError(e);
    process.exit(1);
  }
})();
