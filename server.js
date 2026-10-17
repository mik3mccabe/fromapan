const express=require('express');const fs=require('fs');const path=require('path');const crypto=require('crypto');const {parse}=require('csv-parse/sync');
const app=express();
// Optional password protection; configure APP_PASSWORD in Railway before exposing the app.
app.use((req,res,next)=>{const pass=process.env.APP_PASSWORD;if(!pass)return next();const hdr=req.headers.authorization||'';let supplied='';try{if(hdr.startsWith('Basic '))supplied=Buffer.from(hdr.slice(6),'base64').toString().split(':').slice(1).join(':')}catch{}const a=Buffer.from(supplied),b=Buffer.from(pass);if(a.length===b.length&&crypto.timingSafeEqual(a,b))return next();res.set('WWW-Authenticate','Basic realm="Sourcebook"').status(401).send('Authentication required')});
app.use(express.json({limit:'20mb'}));app.use(express.static(path.join(__dirname,'public')));
const STORE=path.join(__dirname,'data','store.json');let pool=null;let state={items:[],listings:[],checks:[]};let writeQueue=Promise.resolve();
const id=x=>crypto.createHash('sha256').update(x).digest('hex').slice(0,18);
const clean=s=>String(s||'').trim();
const badTitle=t=>/Notification Based on the Act on Specified Commercial Transactions|FROM JAPAN Ltd\. Company info/i.test(t);
const validImage=t=>/^https?:\/\//.test(t||'')&&!/noimage|no-image|placeholder/i.test(t);
const marketplace=url=>{try{let u=new URL(url);if(u.hostname.includes('mercari'))return 'Mercari';if(u.hostname.includes('rakuten'))return 'Rakuten';if(u.hostname.includes('mandarake'))return 'Mandarake';if(u.hostname.includes('culturestation'))return 'Culture Station';if(u.searchParams.has('item_addr'))return 'Yahoo Auctions';return u.hostname.replace(/^www\./,'')}catch{return 'Other'}};
// Sourcebook v5: publication-first, conservative extraction. Seller copy is never a default query.
const PUBLICATIONS=[
  [/週刊\s*プレイボーイ|週プレ/i,'週刊プレイボーイ','Weekly Playboy'],
  [/プレイボーイ\s*CUSTOM/i,'プレイボーイ CUSTOM','Playboy CUSTOM'],
  [/\bPOPEYE\b|ポパイ/i,'ポパイ','Popeye magazine'],
  [/週刊少年ジャンプ|少年ジャンプ/i,'少年ジャンプ','Shonen Jump'],
  [/ファミ通/i,'ファミ通','Famitsu'],[/アニメージュ/i,'アニメージュ','Animage'],
  [/エヴァンゲリオン/i,'エヴァンゲリオン','Evangelion'],[/ガンダム/i,'ガンダム','Gundam'],
  [/ゲームボーイ/i,'ゲームボーイ','Game Boy'],[/セガサターン/i,'セガサターン','Sega Saturn'],
  [/スーパーファミコン/i,'スーパーファミコン','Super Famicom'],
  [/ドラゴンボール/i,'ドラゴンボール','Dragon Ball'],
  [/\bCASSETTE\b|カセットテープ|カセット/i,'カセット','Cassette tapes'],
  [/パンフレット/i,'パンフレット','Pamphlets'],[/写真集/i,'写真集','Photo books']
];
const SELLER_NOISE=/(?:送料無料|送料込み|中古品?|即決|美品|希少|激レア|レア物|ジャンク|出品|匿名配送|まとめ売り|古本|当時物|昭和レトロ|絶版|未使用|付録なし|傷あり|状態良好|入手困難|コレクション|切り抜き|現状品|セット販売)/g;
function identify(title){
 const raw=clean(title).normalize('NFKC');
 // Match specific titles before broad aliases (CUSTOM before Weekly Playboy where both occur).
 const custom=PUBLICATIONS.find(x=>/CUSTOM/.test(x[1])&&x[0].test(raw));
 const known=custom||PUBLICATIONS.find(x=>x[0].test(raw));
 let subject=known?.[1]||'';let english=known?.[2]||'';
 if(!subject){
  let t=raw.replace(/【([^】]+)】/g,'$1 ').split(/[■◆●★☆※|｜\n]/)[0];
  t=t.replace(SELLER_NOISE,'').replace(/(?:19|20)\d{2}.*$/,'').replace(/(?:昭和|昭)\s*\d{1,2}.*$/,'')
   .replace(/\b(?:No\.?|vol\.?|issue)\s*\d+.*$/i,'').replace(/\b\d{5,}[-_]?\d*\b/g,'')
   .replace(/[「」『』【】\[\]()（）<>]/g,' ').replace(/[／/:：;,、。\-]+.*$/,'').replace(/\s+/g,' ').trim();
  // Unknown listings are NOT promoted to searches when the candidate is too long or ambiguous.
  if(t.length>=2&&t.length<=18&&!/\d{3,}/.test(t))subject=t;
 }
 const showa=raw.match(/(?:昭和|昭)\s*(\d{1,2})(?:年|[\/\.\-])/);
 const western=raw.match(/(?:19|20)\d{2}/);
 let year=showa?1925+Number(showa[1]):western?Number(western[0]):null;
 if(year&&(year<1900||year>new Date().getFullYear()+1))year=null;
 const afterDate=showa?raw.slice(showa.index+showa[0].length):western?raw.slice(western.index+western[0].length):'';
 const mm=afterDate.match(/^\s*(\d{1,2})\s*(?:月|[\/\.\-])/);
 const month=mm&&Number(mm[1])>=1&&Number(mm[1])<=12?Number(mm[1]):null;
 return {subject,english,year,month,recognized:!!known};
}
function suggestions(title){
 const info=identify(title), raw=clean(title).normalize('NFKC');
 let subject=info.subject, english=info.english;
 // Preserve useful publication and series names even in long seller-written titles.
 if(!subject){
  const patterns=[/\b[A-Z][A-Z0-9 ]{2,25}\s+MOOK\b/i,/[^\s「」『』【】()（）]{2,20}図鑑\s*\d{0,3}/,/[^\s「」『』【】()（）]{2,18}(?:ムック|雑誌|画報|特集号)/];
  for(const pattern of patterns){const m=raw.match(pattern);if(m){subject=m[0].trim();break}}
 }
 if(!subject){
  let t=raw.replace(/【([^】]+)】/g,'$1 ').replace(SELLER_NOISE,' ')
   .replace(/(?:19|20)\d{2}.*$/,' ').replace(/(?:昭和|昭)\s*\d{1,2}.*$/,' ')
   .replace(/(?:No\.?|vol\.?|issue)\s*\d+.*$/i,' ').replace(/\b\d{5,}\b/g,' ')
   .replace(/[「」『』【】\[\]()（）<>]/g,' ').replace(/\s+/g,' ').trim();
  // Take a coherent first phrase rather than dropping the entire item.
  const part=t.split(/[|｜■◆●★☆※、。:：／/]/)[0].trim();
  const m=part.match(/^.{2,28}?(?=\s{2,}|$)/);
  subject=(m?.[0]||part).slice(0,28).trim();
  if(!subject||/^\d+$/.test(subject))subject=raw.slice(0,28).trim();
 }
 const out=[];const add=(query,kind,translation)=>{query=clean(query);if(query&&!out.some(x=>x.query===query))out.push({id:id(query),query,kind,translation,followed:false})};
 add(subject,'Core',english||'');
 // For descriptive generic terms, retain a specific phrase as a second option.
 if(['パンフレット','写真集'].includes(subject)){
  const specific=raw.replace(SELLER_NOISE,' ').replace(/\s+/g,' ').trim().slice(0,35);
  if(specific!==subject)add(specific,'Specific','');
 }
 if(info.year){add(`${subject} ${info.year}`,'Refine',english?`${english} (${info.year})`:'');
  if(info.month)add(`${subject} ${info.year} ${info.month}月`,'Exact',english?`${english} (${info.year}, month ${info.month})`:'');}
 return out;
}
function refreshSuggestions(x){
 const previous=x.suggestions||[];
 const followed=new Set(previous.filter(s=>s.followed).map(s=>s.query));
 const translations=new Map(previous.filter(s=>s.translationEdited).map(s=>[s.query,s.translation]));
 x.suggestions=suggestions(x.title).map(s=>({...s,followed:followed.has(s.query),translation:translations.get(s.query)??s.translation??'',translationEdited:translations.has(s.query)}));
 for(const old of previous.filter(v=>v.followed&&!x.suggestions.some(n=>n.query===v.query)))x.suggestions.push(old);
 return x;
}
function normalize(r){let title=clean(r.title),url=clean(r.url);if(!title||badTitle(title)||!url)return null;let details=clean(r.details),m=details.match(/Auction ID \/ Order No\s+([^\s]+)/),charge=details.match(/Charge 1\s+([\d,]+)\s+yen/);let key=m?m[1]:url.split('?')[0]+'|'+title;return {id:id(key),title,url,thumbnail:validImage(r.thumbnail)?r.thumbnail:null,details,auctionId:m?m[1]:null,priceYen:charge?Number(charge[1].replace(/,/g,'')):null,marketplace:marketplace(url),page:r.page||null,followed:false,notes:'',suggestions:suggestions(title)}}

// Human-readable English glosses. These are approximate until manually edited.
function gloss(jp){
 const info=identify(jp);if(!info.english)return '';
 const date=info.year?` (${info.year}${info.month?', '+String(info.month).padStart(2,'0'):''})`:'';
 return info.english+date;
}
function enrich(x){x.trashed=!!x.trashed;x.translation=x.translationEdited?x.translation:gloss(x.title);refreshSuggestions(x);return x}
function fj(q){return 'https://www.fromjapan.co.jp/japan/en/item/search/'+encodeURIComponent(q).replace(/%20/g,'+')+'/Al_11_Yh_RaRmMr_N_N_0A00ja0000_N/'}
function importRows(rows){let existing=new Map(state.items.map(x=>[x.id,x]));let added=0,updated=0;for(let row of rows){let x=normalize(row);if(!x)continue;let old=existing.get(x.id);if(old){old.thumbnail=old.thumbnail||x.thumbnail;old.auctionId=old.auctionId||x.auctionId;old.priceYen=old.priceYen??x.priceYen;updated++}else{existing.set(x.id,x);added++}}state.items=[...existing.values()].map(enrich);return {added,updated,total:state.items.length}}
async function init(){if(process.env.DATABASE_URL){const {Pool}=require('pg');pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.PGSSLMODE==='disable'?false:{rejectUnauthorized:false}});await pool.query('CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY, value JSONB NOT NULL)');let r=await pool.query('SELECT value FROM app_state WHERE id=1');if(r.rows.length)state=r.rows[0].value}else if(fs.existsSync(STORE)){state=JSON.parse(fs.readFileSync(STORE,'utf8'))}state.listings ||= [];state.checks ||= [];state.items=(state.items||[]).map(enrich);if(!state.items.length){const seed=JSON.parse(fs.readFileSync(path.join(__dirname,'data','seed.json'),'utf8'));importRows(seed);await save()}}
function save(){writeQueue=writeQueue.then(async()=>{if(pool)await pool.query('INSERT INTO app_state(id,value) VALUES(1,$1::jsonb) ON CONFLICT(id) DO UPDATE SET value=EXCLUDED.value',[JSON.stringify(state)]);else fs.writeFileSync(STORE,JSON.stringify(state))});return writeQueue}
app.get('/api/items',(req,res)=>res.json({items:state.items,total:state.items.length}));
app.post('/api/import',async(req,res)=>{try{let {filename='',content}=req.body;if(typeof content!=='string')throw Error('Missing file content');let rows;if(filename.toLowerCase().endsWith('.csv'))rows=parse(content,{columns:true,skip_empty_lines:true,bom:true});else{let json=JSON.parse(content);rows=Array.isArray(json)?json:Array.isArray(json.items)?json.items:Array.isArray(json.pages)?json.pages.flatMap((p,i)=>p.items.map(x=>({...x,page:i+1}))):null}if(!rows)throw Error('Unsupported file format');let result=importRows(rows);await save();res.json(result)}catch(e){res.status(400).json({error:e.message})}});
app.patch('/api/items/:id',async(req,res)=>{let x=state.items.find(x=>x.id===req.params.id);if(!x)return res.status(404).json({error:'Not found'});if(typeof req.body.followed==='boolean')x.followed=req.body.followed;if(typeof req.body.notes==='string')x.notes=req.body.notes.slice(0,2000);if(typeof req.body.translation==='string'){x.translation=req.body.translation.slice(0,400);x.translationEdited=true;}if(typeof req.body.trashed==='boolean')x.trashed=req.body.trashed;await save();res.json(x)});
app.patch('/api/items/:id/suggestions/:sid',async(req,res)=>{let x=state.items.find(x=>x.id===req.params.id),s=x?.suggestions.find(s=>s.id===req.params.sid);if(!s)return res.status(404).json({error:'Not found'});if(typeof req.body.followed==='boolean'){for(const item of state.items)for(const idea of item.suggestions||[])if(idea.query===s.query)idea.followed=req.body.followed;}if(typeof req.body.translation==='string'){s.translation=req.body.translation.slice(0,400);s.translationEdited=true;}await save();res.json(s)});
app.post('/api/bulk',async(req,res)=>{let ids=new Set(req.body.ids||[]),followed=!!req.body.followed;let count=0;for(let x of state.items)if(ids.has(x.id)){x.followed=followed;count++}await save();res.json({updated:count})});
// Best-effort public search page checker. Some marketplaces block server requests or change markup.
const markets={
  Yahoo:q=>'https://auctions.yahoo.co.jp/search/search?p='+encodeURIComponent(q),
  Mercari:q=>'https://jp.mercari.com/search?keyword='+encodeURIComponent(q)
};
let checking=false,lastRun=0;
const {extract}=require('./marketplace-extract');
async function fetchPublicPage(url,timeout=12000){
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),timeout);
 try{const r=await fetch(url,{signal:ctrl.signal,redirect:'follow',headers:{'User-Agent':'Mozilla/5.0 (compatible; Sourcebook/7.0; public-page-reader)','Accept':'text/html,application/xhtml+xml'}});if(!r.ok)throw Error('HTTP '+r.status);if(!/^text\/html|application\/xhtml/i.test(r.headers.get('content-type')||''))throw Error('Not an HTML page');const body=await r.text();return body.slice(0,2500000)}finally{clearTimeout(timer)}
}
async function checkOne(market,query){const url=markets[market](query);const html=await fetchPublicPage(url);return extract(html,market,url)}
async function enrichListing(x){
 if(x.image&&x.title&&x.priceYen!=null)return x;
 // Only fetch canonical, whitelisted marketplace product URLs; never user-supplied arbitrary hosts.
 const {canonical,extract}=require('./marketplace-extract');if(!canonical(x.url,x.market,x.url))return x;
 try{const html=await fetchPublicPage(x.url,9000);const detail=extract(html,x.market,x.url).find(y=>y.url===x.url);if(detail){for(const field of ['title','image','priceYen'])if((x[field]==null||/^((Mercari|Yahoo) listing )/.test(x[field]))&&detail[field]!=null)x[field]=detail[field]}}catch(e){x.metadataError=String(e.message).slice(0,100)}return x;
}
async function monitor(){if(checking)return {running:true};checking=true;const started=new Date().toISOString();let found=0,errors=0,attempted=0;
 try{
  let followed=state.items.filter(x=>!x.trashed).flatMap(x=>(x.suggestions||[]).filter(s=>s.followed).map(s=>s.query));
  followed.push(...state.items.filter(x=>x.followed&&!x.trashed).map(x=>x.suggestions?.[0]?.query||x.title));
  let queries=[...new Set(followed)].slice(0,8); // bounded to avoid flooding sites
  const known=new Map(state.listings.map(x=>[x.id,x]));let updated=0,detailChecks=0;
  for(let query of queries)for(let market of Object.keys(markets)){
   attempted++;try{let results=await checkOne(market,query);for(let x of results){let key=id(x.url),old=known.get(key);if(old){for(const field of ['title','image','priceYen'])if((!old[field]||/^((Mercari|Yahoo) listing )/.test(old[field]))&&x[field]){old[field]=x[field];updated++}old.seenAt=started}else{let row={...x,id:key,query,firstSeen:started,seenAt:started};state.listings.unshift(row);known.set(key,row);found++}}state.checks.unshift({at:started,market,query,status:'ok',count:results.length,note:results.length?'Public listings parsed':'No listing cards extracted; site may require JavaScript or block requests'});
   }catch(e){errors++;state.checks.unshift({at:started,market,query,status:'error',count:0,note:String(e.message).slice(0,180)})}
  }
  // Bounded enrichment: only 12 product pages per run to reduce load and avoid flooding marketplaces.
  for(const x of state.listings.filter(x=>!x.image||!x.title||x.priceYen==null).slice(0,12)){
   detailChecks++;const before=JSON.stringify([x.title,x.image,x.priceYen]);await enrichListing(x);if(before!==JSON.stringify([x.title,x.image,x.priceYen]))updated++;
  }
  state.listings=state.listings.slice(0,1500);state.checks=state.checks.slice(0,100);lastRun=Date.now();await save();return {found,updated,detailChecks,errors,attempted,queries:queries.length};
 }finally{checking=false}
}
// A single background recovery job survives browser navigation. Each listing is attempted
// once per job, with capped retries and pacing to avoid repeatedly hammering blocked sites.
let recovery={running:false,checked:0,updated:0,total:0,failed:0,startedAt:null,finishedAt:null};
const recoverySleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function startRecovery(){
 if(recovery.running||checking)return false;
 const targets=state.listings.filter(x=>(!x.image||!x.title||/^(Mercari|Yahoo) listing /.test(x.title))&&
  (!x.recoveryLastAttempt||Date.now()-Date.parse(x.recoveryLastAttempt)>6*60*60*1000));
 recovery={running:true,checked:0,updated:0,total:targets.length,failed:0,startedAt:new Date().toISOString(),finishedAt:null};
 (async()=>{try{for(const x of targets){
  const before=JSON.stringify([x.title,x.image,x.priceYen]);
  try{await enrichListing(x)}catch(e){x.metadataError=String(e.message).slice(0,120)}
  x.recoveryLastAttempt=new Date().toISOString();recovery.checked++;
  if(before!==JSON.stringify([x.title,x.image,x.priceYen]))recovery.updated++;
  else recovery.failed++;
  // Persist progress periodically; the browser is not required to remain open.
  if(recovery.checked%5===0)await save();
  await recoverySleep(1100);
 }}catch(e){console.error('Recovery:',e)}finally{recovery.running=false;recovery.finishedAt=new Date().toISOString();await save().catch(console.error)}})();
 return true;
}
app.post('/api/monitor/backfill',async(req,res)=>{
 if(recovery.running)return res.json({started:false,...recovery});
 if(checking)return res.status(409).json({error:'Marketplace check in progress; try again shortly'});
 await startRecovery();res.json({started:true,...recovery});
});
app.get('/api/monitor/backfill/status',(req,res)=>res.json(recovery));
// Auto-recover incomplete discoveries, including after a server restart.
setInterval(()=>{if(!recovery.running&&!checking&&state.listings.some(x=>!x.image&&(!x.recoveryLastAttempt||Date.now()-Date.parse(x.recoveryLastAttempt)>6*60*60*1000)))startRecovery()},10*60*1000).unref();
app.get('/api/monitor',(req,res)=>res.json({listings:state.listings||[],checks:state.checks||[],running:checking,markets:Object.keys(markets),note:'Best-effort public page checks; results may be incomplete. No alerts or guaranteed coverage.'}));
// Translate real marketplace titles only. URL-only placeholders cannot be translated.
app.post('/api/monitor/translate',async(req,res)=>{
 if(!process.env.DEEPL_API_KEY)return res.status(400).json({error:'Set DEEPL_API_KEY in Railway Variables to translate marketplace titles.'});
 const limit=Math.max(1,Math.min(25,Number(req.body?.limit)||25));
 const candidates=state.listings.filter(x=>x.title&&!/^(Mercari|Yahoo) listing /.test(x.title)&&!x.translation).slice(0,limit);
 let translated=0;
 for(const x of candidates){try{const body=new URLSearchParams({text:x.title,source_lang:'JA',target_lang:'EN'});let response=await fetch(process.env.DEEPL_API_URL||'https://api-free.deepl.com/v2/translate',{method:'POST',headers:{Authorization:'DeepL-Auth-Key '+process.env.DEEPL_API_KEY,'Content-Type':'application/x-www-form-urlencoded'},body});if(!response.ok)throw Error('DeepL HTTP '+response.status);let json=await response.json();let t=json.translations?.[0]?.text;if(t){x.translation=t;translated++}}catch(e){return res.status(502).json({error:'Translation failed: '+e.message,translated})}}
 if(translated)await save();res.json({translated,remaining:state.listings.filter(x=>x.title&&!/^(Mercari|Yahoo) listing /.test(x.title)&&!x.translation).length});
});
app.post('/api/monitor/run',async(req,res)=>{if(checking)return res.status(409).json({error:'Check already running'});if(Date.now()-lastRun<60000)return res.status(429).json({error:'Please wait at least one minute between checks'});try{res.json(await monitor())}catch(e){res.status(500).json({error:e.message})}});
setInterval(()=>{if(process.env.MONITOR_ENABLED==='true')monitor().catch(e=>console.error('Monitor:',e))},60*60*1000).unref();

app.post('/api/items/trash',async(req,res)=>{let ids=new Set(Array.isArray(req.body.ids)?req.body.ids:[]),trash=req.body.trashed!==false,count=0;for(const x of state.items)if(ids.has(x.id)){x.trashed=trash;if(trash){x.followed=false;for(const s of x.suggestions||[])s.followed=false}count++}await save();res.json({updated:count})});
app.delete('/api/items/permanent',async(req,res)=>{let ids=new Set(Array.isArray(req.body.ids)?req.body.ids:[]);let before=state.items.length;state.items=state.items.filter(x=>!(x.trashed&&ids.has(x.id)));await save();res.json({deleted:before-state.items.length,note:'Items in original imports will reappear if imported again.'})});
app.patch('/api/items/:id/image',async(req,res)=>{let x=state.items.find(x=>x.id===req.params.id);if(!x)return res.status(404).json({error:'Not found'});let image=req.body.image;if(image!==null&&(typeof image!=='string'||!(image.startsWith('https://')||image.startsWith('http://')||/^data:image\/(jpeg|png|webp);base64,/.test(image))||image.length>1200000))return res.status(400).json({error:'Use an image URL or JPG/PNG/WebP under approximately 850 KB'});x.thumbnail=image;await save();res.json({thumbnail:x.thumbnail})});
// Optional DeepL translation. No request is made without a configured key and explicit user action.
app.post('/api/translations/run',async(req,res)=>{
 const key=process.env.DEEPL_API_KEY;
 if(!key)return res.status(400).json({error:'Add DEEPL_API_KEY in Railway Variables to enable automatic English translations. Manual edits still work.'});
 const candidates=state.items.filter(x=>!x.trashed&&!x.translationEdited&&!x.translation).slice(0,Math.min(25,Math.max(1,Number(req.body.limit)||15)));
 if(!candidates.length)return res.json({translated:0,remaining:0});
 const endpoint=process.env.DEEPL_API_URL||'https://api-free.deepl.com/v2/translate';
 if(!/^https:\/\/(api-free|api)\.deepl\.com\/v2\/translate$/.test(endpoint))return res.status(400).json({error:'Invalid DEEPL_API_URL'});
 try{
  const body=new URLSearchParams({target_lang:'EN',source_lang:'JA'});for(const x of candidates)body.append('text',x.title);
  const r=await fetch(endpoint,{method:'POST',headers:{Authorization:'DeepL-Auth-Key '+key,'Content-Type':'application/x-www-form-urlencoded'},body});
  if(!r.ok)throw Error('DeepL HTTP '+r.status);
  const data=await r.json();let n=0;
  data.translations?.forEach((t,i)=>{if(t.text){candidates[i].translation=t.text;n++}});
  await save();res.json({translated:n,remaining:state.items.filter(x=>!x.trashed&&!x.translation).length});
 }catch(e){res.status(502).json({error:'Translation request failed: '+e.message})}
});
app.get('/api/search-ideas',(req,res)=>{const ideas=new Map();for(const x of state.items.filter(x=>!x.trashed))for(const s of x.suggestions||[]){if(!ideas.has(s.query))ideas.set(s.query,{...s,itemId:x.id,itemTitle:x.title,relatedItems:0});ideas.get(s.query).relatedItems++;}res.json({ideas:[...ideas.values()]})});
app.get('/api/fromjapan-search',(req,res)=>res.json({url:fj(clean(req.query.q))}));
app.get('/api/export',(req,res)=>{res.setHeader('Content-Disposition','attachment; filename="sourcing-library.json"');res.json(state)});
app.get('/api/health',(req,res)=>res.json({ok:true,items:state.items.length,database:!!pool}));
init().then(()=>app.listen(process.env.PORT||3000,'0.0.0.0',()=>{console.log('Listening');setTimeout(()=>startRecovery(),12000).unref()})).catch(e=>{console.error(e);process.exit(1)});
