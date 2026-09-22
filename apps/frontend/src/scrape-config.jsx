import {useEffect,useState} from 'react';
import {Card,CardHeader,CardTitle,CardContent,CardDescription} from '@/components/ui/card';
import {FieldGroup,Field,FieldLabel,FieldSet,FieldLegend,FieldDescription} from '@/components/ui/field';
import {Input} from '@/components/ui/input';
import {NativeSelect,NativeSelectOption} from '@/components/ui/native-select';
import {Button} from '@/components/ui/button';
import {Checkbox} from '@/components/ui/checkbox';
import {Alert,AlertTitle,AlertDescription} from '@/components/ui/alert';

export default function ScrapeConfig({active,onStarted}){
 const[data,setData]=useState(null),[config,setConfig]=useState(null),[preview,setPreview]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[confirmed,setConfirmed]=useState(false);
 async function request(path,body){const r=await fetch(`/api/scraping/${path}`,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{});const d=await r.json();if(!r.ok)throw Error(d.error);return d;}
 useEffect(()=>{request('config/defaults').then(d=>{setData(d);setConfig({...d.checkpoint,mode:'resume'})}).catch(e=>setError(e.message))},[]);
 function change(key,value){setConfig(c=>({...c,[key]:value}));setPreview(null);setConfirmed(false);}
 async function submit(start=false){setBusy(true);setError('');try{if(start){const job=await request('start',{...preview.config,confirmNew:confirmed});onStarted(job);setPreview(null);}else setPreview(await request('preview',config));}catch(e){setError(e.message)}finally{setBusy(false)}}
 return <Card>
  <CardHeader><CardTitle>Konfigurasi sesi</CardTitle><CardDescription>Wilayah dan kategori checkpoint harus sama untuk melanjutkan.</CardDescription></CardHeader>
  <CardContent>
   {error&&<Alert variant="destructive"><AlertTitle>Konfigurasi belum siap</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
   {config&&<fieldset disabled={active||busy}><FieldGroup>
    <Field><FieldLabel htmlFor="duration">Durasi (jam)</FieldLabel><Input id="duration" type="number" min="0.25" max="24" step="0.25" value={config.hours} onChange={e=>change('hours',Number(e.target.value))}/></Field>
    <Field><FieldLabel htmlFor="mode">Mode checkpoint</FieldLabel><NativeSelect id="mode" value={config.mode} onChange={e=>{change('mode',e.target.value);if(e.target.value==='resume')setConfig({...data.checkpoint,hours:config.hours,mode:'resume'})}}><NativeSelectOption value="resume">Lanjutkan checkpoint</NativeSelectOption><NativeSelectOption value="new">Sesi baru — arsipkan sesi lama</NativeSelectOption></NativeSelect></Field>
    {[['cities','Wilayah'],['keywords','Kategori']].map(([key,label])=>{
     const disabled=active||busy||config.mode==='resume';
     return <FieldSet key={key} disabled={disabled}>
      <FieldLegend>{label} ({config[key].length} dipilih)</FieldLegend>
      {config.mode==='resume'&&<FieldDescription>Pilih mode Sesi baru untuk mengubah pilihan.</FieldDescription>}
      <FieldGroup className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
       {data.defaults[key].map((value,index)=>{
        const id=`scrape-${key}-${index}`;
        return <Field key={value} orientation="horizontal" data-disabled={disabled} className="rounded-md border p-3">
         <Checkbox id={id} disabled={disabled} checked={config[key].includes(value)} onCheckedChange={checked=>change(key,checked===true?[...config[key],value]:config[key].filter(v=>v!==value))}/>
         <FieldLabel htmlFor={id}>{value}</FieldLabel>
        </Field>;
       })}
      </FieldGroup>
     </FieldSet>;
    })}
    <Button onClick={()=>submit()}>Preview konfigurasi</Button>
    {preview&&<>
     <p className="text-sm">{preview.config.hours} jam · {preview.config.cities.length} wilayah · {preview.config.keywords.length} kategori · {preview.queries.length} kombinasi query</p>
     <details><summary>Daftar query</summary><ul className="max-h-48 overflow-auto text-xs">{preview.queries.map(q=><li key={q}>{q}</li>)}</ul></details>
     {config.mode==='new'&&<Field orientation="horizontal"><Checkbox id="archive-confirm" disabled={active||busy} checked={confirmed} onCheckedChange={value=>setConfirmed(value===true)}/><FieldLabel htmlFor="archive-confirm">Saya setuju memulai antrean baru dan mengarsipkan checkpoint lama. Lead database tetap tersimpan.</FieldLabel></Field>}
     <Button disabled={config.mode==='new'&&!confirmed} onClick={()=>submit(true)}>Mulai sesuai preview</Button>
    </>}
   </FieldGroup></fieldset>}
  </CardContent>
 </Card>;
}
