export const cities=['Kota Bandung','Kota Bogor','Kota Bekasi','Kota Depok','Kabupaten Bandung','Kabupaten Bogor','Kabupaten Bekasi','Kota Cimahi','Kota Cirebon','Kabupaten Bandung Barat','Kabupaten Cirebon','Kabupaten Sumedang','Kabupaten Garut','Kabupaten Cianjur','Kabupaten Sukabumi','Kota Sukabumi','Kabupaten Tasikmalaya','Kota Tasikmalaya','Kabupaten Ciamis','Kota Banjar','Kabupaten Pangandaran','Kabupaten Kuningan','Kabupaten Majalengka','Kabupaten Indramayu','Kabupaten Subang','Kabupaten Purwakarta','Kabupaten Karawang'];
export const keywords=['Restoran','Cafe','Rumah Makan','Kedai Kopi','Warung Makan','Toko Roti'];
export const defaults={hours:4.5,cities,keywords,mode:'resume'};
export function parseConfig(input={}){
 const fail=()=>{throw Object.assign(new Error('Konfigurasi tidak valid: durasi 0,25–24 jam (kelipatan 0,25), pilih wilayah dan kategori tersedia.'),{statusCode:400})};
 if(!input||typeof input!=='object'||Array.isArray(input))fail();
 const c={...defaults,...input};
 if(typeof c.hours!=='number'||!Number.isFinite(c.hours)||c.hours<.25||c.hours>24||c.hours*4%1)fail();
 if(!['resume','new'].includes(c.mode))fail();
 for(const [key,allowed] of [['cities',cities],['keywords',keywords]]){if(!Array.isArray(c[key])||!c[key].length||c[key].length>allowed.length||c[key].some(x=>!allowed.includes(x)))fail();c[key]=allowed.filter(x=>c[key].includes(x));}
 return {hours:c.hours,cities:c.cities,keywords:c.keywords,mode:c.mode};
}
export const queriesFor=c=>c.cities.flatMap(city=>c.keywords.map(keyword=>`${keyword} di ${city}, Jawa Barat`));
export function compatible(state,c){return JSON.stringify(queriesFor(state?.config||defaults))===JSON.stringify(queriesFor(c));}
