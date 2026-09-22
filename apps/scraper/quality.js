import { reviewStatus } from './review.js';
export function absoluteDate(raw) {
 const s=String(raw||'').trim().toLowerCase();
 const months=['januari','februari','maret','april','mei','juni','juli','agustus','september','oktober','november','desember'];
 let m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/), y,month,day;
 if(m)[,y,month,day]=m;
 else {m=s.match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/);if(!m)return null;day=m[1];month=months.indexOf(m[2])+1;y=m[3];}
 const d=new Date(Date.UTC(+y,+month-1,+day));
 return d.getUTCFullYear()===+y&&d.getUTCMonth()===+month-1&&d.getUTCDate()===+day?d.toISOString().slice(0,10):null;
}
export function reviewMetadata(raw, evidence, now=new Date()) {
 const exact=absoluteDate(evidence)||absoluteDate(raw);
 if(exact){const cutoff=new Date(now);cutoff.setUTCFullYear(cutoff.getUTCFullYear()-1);return {latest_review_raw:raw,latest_review_at:exact,review_date_precision:'exact',review_filter_status:exact>now.toISOString().slice(0,10)?'unknown':exact>=cutoff.toISOString().slice(0,10)?'recent':'old'};}
 const status=reviewStatus(raw||'',now);
 return {latest_review_raw:raw||'',latest_review_at:null,review_date_precision:status==='unknown'?(/lalu/.test(raw||'')?'ambiguous':'unknown'):'relative',review_filter_status:status};
}
export function normalizePhone(raw) {
 const s=String(raw||'').replace(/^Telepon:\s*/i,'').trim();
 if(!s||!/^[+\d\s().-]+$/.test(s))return null;
 let digits=s.replace(/\D/g,'');if(digits.startsWith('0'))digits='62'+digits.slice(1);
 return /^62\d{8,13}$/.test(digits)?'+'+digits:null;
}
export function normalizeWebsite(raw) {
 if(!raw)return {website_normalized:null,website_status:'missing'};
 try{const u=new URL(raw);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error();u.hash='';return {website_normalized:u.href,website_status:'listed'};}catch{return {website_normalized:null,website_status:'invalid'};}
}
export function identity(raw) {
 try{const u=new URL(raw);const fid=raw.match(/!1s(0x[\da-f]+:0x[\da-f]+)/i)?.[1]?.toLowerCase();const pid=u.searchParams.get('query_place_id')||raw.match(/!1s(ChIJ[\w-]+)/)?.[1];return {google_maps_place_id:pid&&/^ChIJ[\w-]+$/.test(pid)?pid:null,maps_feature_id:fid||null};}catch{return {google_maps_place_id:null,maps_feature_id:null};}
}
export function quality(row) {
 return {...identity(row.url_maps),...reviewMetadata(row.ulasan_terbaru,row.latest_review_at,new Date(row.diambil_pada)),...normalizeWebsite(row.website),telepon_normalized:normalizePhone(row.telepon),kategori_pencarian:[...new Set(row.kategori_pencarian||[row.label_pencarian?.split(' di ')[0]].filter(Boolean))]};
}
