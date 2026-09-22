import { chromium } from 'playwright';
import { mkdir, readFile, writeFile, rename, open, unlink } from 'node:fs/promises';
import { reviewStatus } from './review.js';
import { syncResults } from './sync.js';
import { classify, retryDelay } from './reliability.js';
import { quality, reviewMetadata } from './quality.js';
import { parseConfig,defaults,queriesFor,compatible } from './config.js';
import { newCheckpoint } from './checkpoint.js';

const runtimeConfig=parseConfig(process.env.SCRAPE_CONFIG_JSON?JSON.parse(process.env.SCRAPE_CONFIG_JSON):{...defaults,hours:Number(process.env.HOURS??4.5)});
const hours = runtimeConfig.hours;
if (!Number.isFinite(hours) || hours <= 0 || hours > 24) throw new Error('HOURS harus > 0 dan <= 24');
const cities = ['Kota Bandung', 'Kota Bogor', 'Kota Bekasi', 'Kota Depok', 'Kabupaten Bandung', 'Kabupaten Bogor', 'Kabupaten Bekasi', 'Kota Cimahi', 'Kota Cirebon', 'Kabupaten Bandung Barat', 'Kabupaten Cirebon', 'Kabupaten Sumedang', 'Kabupaten Garut', 'Kabupaten Cianjur', 'Kabupaten Sukabumi', 'Kota Sukabumi', 'Kabupaten Tasikmalaya', 'Kota Tasikmalaya', 'Kabupaten Ciamis', 'Kota Banjar', 'Kabupaten Pangandaran', 'Kabupaten Kuningan', 'Kabupaten Majalengka', 'Kabupaten Indramayu', 'Kabupaten Subang', 'Kabupaten Purwakarta', 'Kabupaten Karawang'];
const keywords = ['Restoran', 'Cafe', 'Rumah Makan', 'Kedai Kopi', 'Warung Makan', 'Toko Roti'];
const queries = queriesFor(runtimeConfig);
await mkdir('data', { recursive: true });
const lock = await open('data/session.lock', 'wx').catch(() => { throw new Error('Sesi terkunci. Pastikan proses lain berhenti sebelum menghapus data/session.lock.'); });
let browser;
let timer;
let stopping = false;
let state;
let selectorFailures = 0;
let currentPage, baseline, lastSuccess, syncProgress = {}, stopReason;
const processed = new Map(), diagnosed = new Set();
const history={config:{...runtimeConfig,area_level:'city'},queries:{},places:{}};
const historyPath=process.env.SCRAPE_JOB_ID?`data/history-${process.env.SCRAPE_JOB_ID}.json`:null;
async function diagnose(error) {
  const { code } = classify(error);
  if (!currentPage || diagnosed.has(code)) return;
  diagnosed.add(code);
  const directory = `data/diagnostics/${process.env.SCRAPE_JOB_ID || 'manual'}`;
  try {
    await mkdir(directory, { recursive: true });
    await currentPage.screenshot({ path: `${directory}/${code}.png`, timeout: 3000, mask: [currentPage.locator('a[href*="accounts.google.com"]')] });
    await writeFile(`${directory}/${code}.json`, JSON.stringify({ code, at: new Date().toISOString(), url: currentPage.url().split('?')[0], message: error.message.split('\n')[0].slice(0,500) }));
  } catch { /* Diagnostics must not prevent checkpoint finalization. */ }
}
const stop = (reason = 'user_request') => { stopReason ||= reason; stopping = true; void browser?.close().catch(() => {}); };
globalThis.requestScrapeStop = stop;
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
const fields = ['nama', 'alamat', 'rating', 'telepon', 'website', 'label_pencarian', 'url_maps', 'ulasan_terbaru', 'diambil_pada'];
const csvCell = value => `"${String(value ?? '').replace(/^[=+@\-\t\r]/, "'$&").replaceAll('"', '""')}"`;
async function save() {
  if(historyPath){await writeFile(`${historyPath}.tmp`,JSON.stringify(history));await rename(`${historyPath}.tmp`,historyPath);}
  await writeFile('data/state.json.tmp', JSON.stringify(state, null, 2));
  await rename('data/state.json.tmp', 'data/state.json');
  const rows = Object.values(state.results);
  await writeFile('data/hasil.csv.tmp', '\ufeff' + [fields.join(','), ...rows.map(row => fields.map(field => csvCell(row[field])).join(','))].join('\r\n'));
  await rename('data/hasil.csv.tmp', 'data/hasil.csv');
  const items = Object.values(state.places);
  if (!stopping) syncProgress = await syncResults(state.results, { shouldStop: () => stopping });
  const counts = Object.fromEntries(['recent','old','unknown','outside_region','error'].map(s=>[s,[...processed.values()].filter(v=>v===s).length]));
  globalThis.scrapeProgress?.({ job_id: process.env.SCRAPE_JOB_ID, queries_total: queries.length - (baseline?.queries || 0), queries_completed: state.queryIndex - (baseline?.queries || 0), places_found: items.length - (baseline?.places || 0), places_processed: processed.size, leads_valid: counts.recent, leads_imported: syncProgress.imported || 0, leads_rejected: counts.old + counts.unknown + counts.outside_region, errors: counts.error, outcomes: counts, sync: syncProgress, last_success_at: lastSuccess, stop_reason: stopReason, query: queries[state.queryIndex] ?? 'Selesai' });
}
function placeKey(url) {
  return url.match(/!1s([^!]+)/)?.[1] || url.split('?')[0];
}
async function blocked(page) {
  if (/\/sorry\//.test(page.url()) || await page.locator('iframe[src*="recaptcha"], form[action*="sorry"]').count()) {
    throw new Error('Google meminta CAPTCHA; sesi dihentikan. Coba lagi setelah jeda.');
  }
}
async function visit(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await blocked(page);
  const consent = page.getByRole('button', { name: /^(Tolak semua|Reject all)$/i });
  if (await consent.count()) await consent.first().click();
}
async function discover(page, query) {
  const record=history.queries[query]={query,city:query.split(' di ')[1]?.replace(', Jawa Barat','')||'',keyword:query.split(' di ')[0],status:'running',started_at:new Date().toISOString(),scroll_count:0,result_count:0,reached_end:false};
  const seen=new Set();
  try {
  await visit(page, `https://www.google.com/maps/search/${encodeURIComponent(query)}?hl=id`);
  const feed = page.locator('[role="feed"]');
  await feed.waitFor({ timeout: 20000 });
  let previous = 0;
  let unchanged = 0;
  while (!stopping && unchanged < 4) {
    const urls = await feed.locator('a[href*="/maps/place/"]').evaluateAll(nodes => nodes.map(node => node.href));
    for (const url of urls) {
      const key = placeKey(url);
      seen.add(key);
      const observed=history.places[key] ||= {queries:[],discovered_at:new Date().toISOString(),result_status:'discovered'};
      observed.queries=[...new Set([...observed.queries,query])];
      if (!state.places[key]) state.places[key] = { url, query, status: 'pending', attempts: 0 };
      const category=query.split(' di ')[0];
      state.places[key].categories=[...new Set([...(state.places[key].categories||[]),category])];
      if(state.results[key])state.results[key].kategori_pencarian=state.places[key].categories;
    }
    await save();
    unchanged = urls.length === previous ? unchanged + 1 : 0;
    previous = urls.length;
    record.result_count=seen.size;
    if (await feed.getByText(/Anda telah mencapai akhir|You've reached the end/i).count()){record.reached_end=true;break;}
    record.scroll_count++;
    await feed.evaluate(node => node.scrollBy(0, node.scrollHeight));
    await page.waitForTimeout(1800);
    await blocked(page);
  }
  record.status=record.reached_end?'completed':'incomplete';
  } catch(error){record.status=stopping?'incomplete':/CAPTCHA|LIMITED_VIEW/i.test(error.message)?'blocked':'failed';record.error_code=classify(error).code;throw error;}
  finally{record.finished_at=new Date().toISOString();record.result_count=seen.size;}
}
async function extract(page, item) {
  await visit(page, item.url + (item.url.includes('?') ? '&' : '?') + 'hl=id');
  const title = page.locator('h1').first();
  await title.waitFor();
  const label = async selector => {
    const locator = page.locator(selector).first();
    return await locator.count() ? (await locator.getAttribute('aria-label') || await locator.innerText()).trim() : '';
  };
  const address = (await label('button[data-item-id="address"]')).replace(/^(Alamat|Address):\s*/i, '');
  if (!address) throw new Error('Alamat tidak ditemukan; perlu pemeriksaan selector');
  if (!/Jawa Barat|West Java/i.test(address)) return { status: 'outside_or_unverified_region' };
  const stars = await label('[role="img"][aria-label*="bintang"], [role="img"][aria-label*="stars"]');
  const website = page.locator('a[data-item-id="authority"]').first();
  const row = {
    nama: await title.innerText(), alamat: address,
    rating: stars.match(/\d+(?:[.,]\d+)?/)?.[0].replace(',', '.') ?? '',
    telepon: (await label('button[data-item-id^="phone:"]')).replace(/^(Telepon|Phone):\s*/i, ''),
    website: await website.count() ? await website.getAttribute('href') : '',
    label_pencarian: item.query, url_maps: item.url, diambil_pada: new Date().toISOString()
  };
  const reviews = page.getByRole('tab', { name: /Ulasan|Reviews/i });
  row.kategori_pencarian=item.categories||[item.query.split(' di ')[0]];
  const category=page.locator('button[jsaction*="category"]').first();
  row.kategori_maps=await category.count()?[(await category.innerText()).trim()]:[];
  const reviewButton=await label('button[aria-label*="ulasan"], button[aria-label*="reviews"]');
  const count=reviewButton.match(/([\d.,]+)\s*(?:ulasan|reviews)/i);
  row.jumlah_ulasan=count?Number(count[1].replace(/[.,]/g,'')):null;
  const hours=page.locator('[data-item-id="oh"]').first();
  row.jam_buka_raw=await hours.count()?(await hours.innerText()).slice(0,2000):null;
  const mainText=await page.locator('[role="main"]').first().innerText();
  row.status_operasional=/Tutup permanen|Permanently closed/i.test(mainText)?'permanently_closed':/Tutup sementara|Temporarily closed/i.test(mainText)?'temporarily_closed':/\bBuka\s*·|\bOpen\s*·/i.test(mainText)?'open':'unknown';
  const coordinates=page.url().match(/!3d(-?[\d.]+)!4d(-?[\d.]+)/);
  row.latitude=coordinates?Number(coordinates[1]):null;row.longitude=coordinates?Number(coordinates[2]):null;
  if (await page.getByText(/Anda melihat tampilan terbatas|You're seeing a limited view/i).count()) {
    throw new Error('LIMITED_VIEW: Google menyembunyikan ulasan. Buka npm run browser, periksa akses Maps, lalu coba kembali.');
  }
  if (!await reviews.count()) return { status: 'unknown', reason: 'Tab ulasan tidak ditemukan' };
  await reviews.first().click();
  await page.getByRole('button', { name: /Urutkan ulasan|Sort reviews/i }).click();
  await page.getByRole('menuitemradio', { name: /Terbaru|Newest/i }).click();
  // ponytail: Maps has no stable public DOM; update these selectors if its UI changes.
  const date = page.locator('[data-review-id] .rsqaWe').first();
  await date.waitFor();
  await page.waitForTimeout(1200);
  row.ulasan_terbaru = (await date.innerText()).trim();
  const evidence=await date.getAttribute('datetime')||await date.getAttribute('aria-label')||await date.getAttribute('title');
  Object.assign(row,reviewMetadata(row.ulasan_terbaru,evidence));
  Object.assign(row,quality(row));
  const status = row.review_filter_status;
  return { status, row };
}
try {
  if(runtimeConfig.mode==='new')await newCheckpoint(runtimeConfig);
  try { state = JSON.parse(await readFile('data/state.json', 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    state = { version: 1, queryIndex: 0, places: {}, results: {}, queryErrors: [] };
  }
  if (state.version !== 1 || !state.places || !state.results || !Number.isInteger(state.queryIndex)) throw new Error('Format checkpoint tidak valid');
  if(!compatible(state,runtimeConfig))throw new Error('Konfigurasi checkpoint berbeda');
  state.config=runtimeConfig;
  baseline = { places: Object.keys(state.places).length, queries: state.queryIndex };
  for (const item of Object.values(state.places)) {
    if (item.status === 'unknown' && item.reason === 'Tab ulasan tidak ditemukan') item.status = 'pending';
  }
  const deadline = Date.now() + hours * 3600000;
  timer = setTimeout(() => stop('time_limit'), hours * 3600000);
  if (stopping) throw new Error('Scraping dihentikan sebelum browser dimulai');
  browser = await chromium.launchPersistentContext('data/browser-profile', { headless: process.env.HEADLESS === '1', locale: 'id-ID' });
  if (stopping) { await browser.close(); throw new Error('Scraping dihentikan saat browser dimulai'); }
  const context = browser;
  const page = await context.newPage();
  currentPage = page;
  page.setDefaultTimeout(12000);
  page.setDefaultNavigationTimeout(30000);
  await save();
  console.log(`Serial; ${hours} jam; hasil: data/hasil.csv`);
  while (!stopping && Date.now() < deadline) {
    const next = Object.entries(state.places).find(([, item]) => item.status === 'pending');
    if (!next) {
      if (state.queryIndex >= queries.length) break;
      const query = queries[state.queryIndex];
      console.log(`Pencarian: ${query}`);
      try { await discover(page, query); }
      catch (error) {
        if (stopping || /CAPTCHA|LIMITED_VIEW/.test(error.message)) throw error;
        if (classify(error).fatal) throw error;
        state.queryErrors.push({ query, error: error.message, at: new Date().toISOString() });
      }
      if (!stopping) state.queryIndex++;
      await save();
      continue;
    }
    const [key, item] = next;
    try {
      const result = await extract(page, item);
      selectorFailures = 0;
      Object.assign(item, { status: result.status, latestReview: result.row?.ulasan_terbaru, reason: result.reason });
      if (result.status === 'outside_or_unverified_region') item.status = 'outside_region';
      item.reason ||= { old: 'review_too_old', unknown: 'review_date_ambiguous', outside_region: 'outside_or_unverified_region' }[item.status];
      processed.set(key, item.status);
      const observed=history.places[key] ||= {queries:[item.query],discovered_at:null};
      Object.assign(observed,{processed_at:new Date().toISOString(),result_status:item.status,snapshot:result.row||null});
      if (result.status === 'recent') { state.results[key] = result.row; lastSuccess = new Date().toISOString(); }
      console.log(`${item.status}: ${result.row?.nama ?? item.url} | lolos ${Object.keys(state.results).length}`);
    } catch (error) {
      if (stopping || classify(error).fatal) throw error;
      item.attempts++;
      const category = classify(error);
      item.error_code = category.code;
      item.error = error.message;
      if (!category.retryable || item.attempts >= 3) { item.status = 'error'; processed.set(key, 'error'); history.places[key]={...(history.places[key]||{queries:[item.query]}),processed_at:new Date().toISOString(),result_status:'error',error_code:category.code};await diagnose(error); }
      if (!category.retryable && ++selectorFailures >= 5) throw new Error('Lima kegagalan detail berurutan; periksa selector atau akses Maps.');
      if (item.status === 'pending') await page.waitForTimeout(retryDelay(item.attempts-1));
      console.error(`Gagal (${item.attempts}/2): ${error.message.split('\n')[0]}`);
    }
    await save();
    await page.waitForTimeout(1500);
  }
} catch (error) {
  if (!stopping) { stopReason = classify(error).code; await diagnose(error); console.error(error.message); process.exitCode = 1; }
} finally {
  clearTimeout(timer);
  try {
    if (state) {
      stopping = true;
      await save();
      try { syncProgress = await syncResults(state.results, { force: true, budget: 10000 }); }
      catch (error) { console.error(`Final sync gagal: ${classify(error).code}`); process.exitCode = 1; }
      await save();
    }
  } finally {
    await browser?.close().catch(() => {});
    await lock.close();
    await unlink('data/session.lock');
  }
  console.log('Sesi tersimpan. Jalankan npm start untuk melanjutkan.');
  globalThis.requestScrapeStop = undefined;
}
