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
// v9: inspect the actual product, not arbitrary prefixes from a seller listing.
const intelligence=require('./intelligence');
const {identify,searches,profileId,clean:ic}=intelligence;
function refreshSuggestions(x){
 const previous=x.suggestions||[];
 const oldByQuery=new Map(previous.map(s=>[s.query,s]));
 const generated=searches(x.identity||identify(x.title));
 x.suggestions=generated.map(s=>{
  const old=oldByQuery.get(s.query);
  return {...s,followed:!!old?.followed,translation:old?.translationEdited?old.translation:(s.translation||old?.translation||''),translationEdited:!!old?.translationEdited};
 });
 // A followed search is user intent, even if the new identifier would no longer suggest it.
 for(const old of previous.filter(v=>v.followed&&!x.suggestions.some(n=>n.query===v.query)))x.suggestions.push({...old,kind:'Saved',reason:'Previously followed search — preserved',confidence:old.confidence||.5});
 return x;
}
function gloss(jp){const info=identify(jp);return info.english||''}
function enrich(x){
 x.trashed=!!x.trashed;
 if(x.identity?.source==='manual' && x.identity.query){x.identity=identify(x.title,{...x.identity,query:x.identity.query});}
 else if(!['ai','catalog'].includes(x.identity?.source))x.identity=identify(x.title);
 x.profileId=profileId(x.identity);
 if(!x.translationEdited)x.translation=x.translation||gloss(x.title);
 refreshSuggestions(x);return x;
}
function rebuildProfiles(){
 const previous=new Map((state.profiles||[]).map(p=>[p.id,p]));
 const mapped=new Map();
 for(const item of state.items.filter(x=>!x.trashed)){
  const info=item.identity||identify(item.title);if(!info.query)continue;
  const key=item.profileId||profileId(info);if(!key)continue;
  if(!mapped.has(key)){
   const old=previous.get(key)||{};
   mapped.set(key,{id:key,name:old.name||info.query,query:old.query||info.query,type:info.type,
    source:info.source,followed:!!old.followed,manualName:!!old.manualName,manualQuery:!!old.manualQuery,
    itemIds:[],examples:[],confidence:info.confidence,yearMin:null,yearMax:null});
  }
  const p=mapped.get(key);p.itemIds.push(item.id);
  if(/^https?:\/\//.test(item.thumbnail||'')&&p.examples.length<4)p.examples.push(item.thumbnail);
  if(info.year){p.yearMin=Math.min(p.yearMin??info.year,info.year);p.yearMax=Math.max(p.yearMax??info.year,info.year)}
  p.confidence=Math.min(p.confidence,info.confidence);
 }
 // Keep user-followed profiles even after temporarily trashing all related purchases.
 for(const [key,old] of previous)if(old.followed&&!mapped.has(key))mapped.set(key,{...old,itemIds:[],examples:[]});
 state.profiles=[...mapped.values()].sort((a,b)=>b.itemIds.length-a.itemIds.length||a.name.localeCompare(b.name,'ja'));
}
function normalize(r){let title=clean(r.title),url=clean(r.url);if(!title||badTitle(title)||!url)return null;let details=clean(r.details),m=details.match(/Auction ID \/ Order No\s+([^\s]+)/),charge=details.match(/Charge 1\s+([\d,]+)\s+yen/);let key=m?m[1]:url.split('?')[0]+'|'+title;return {id:id(key),title,url,thumbnail:validImage(r.thumbnail)?r.thumbnail:null,details,auctionId:m?m[1]:null,priceYen:charge?Number(charge[1].replace(/,/g,'')):null,marketplace:marketplace(url),page:r.page||null,followed:false,notes:'',suggestions:[],identity:identify(title)}}

function fj(q){return 'https://www.fromjapan.co.jp/japan/en/item/search/'+encodeURIComponent(q).replace(/%20/g,'+')+'/Al_11_Yh_RaRmMr_N_N_0A00ja0000_N/'}
function importRows(rows){let existing=new Map(state.items.map(x=>[x.id,x]));let added=0,updated=0;for(let row of rows){let x=normalize(row);if(!x)continue;let old=existing.get(x.id);if(old){old.thumbnail=old.thumbnail||x.thumbnail;old.auctionId=old.auctionId||x.auctionId;old.priceYen=old.priceYen??x.priceYen;updated++}else{existing.set(x.id,x);added++}}state.items=[...existing.values()].map(enrich);rebuildProfiles();return {added,updated,total:state.items.length}}
async function init(){if(process.env.DATABASE_URL){const {Pool}=require('pg');pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.PGSSLMODE==='disable'?false:{rejectUnauthorized:false}});await pool.query('CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY, value JSONB NOT NULL)');let r=await pool.query('SELECT value FROM app_state WHERE id=1');if(r.rows.length)state=r.rows[0].value}else if(fs.existsSync(STORE)){state=JSON.parse(fs.readFileSync(STORE,'utf8'))}state.listings ||= [];state.checks ||= [];state.profiles ||= [];state.items=(state.items||[]).map(enrich);rebuildProfiles();if(!state.items.length){const seed=JSON.parse(fs.readFileSync(path.join(__dirname,'data','seed.json'),'utf8'));importRows(seed);await save()}else await save()}
function save(){writeQueue=writeQueue.then(async()=>{if(pool)await pool.query('INSERT INTO app_state(id,value) VALUES(1,$1::jsonb) ON CONFLICT(id) DO UPDATE SET value=EXCLUDED.value',[JSON.stringify(state)]);else fs.writeFileSync(STORE,JSON.stringify(state))});return writeQueue}
app.get('/api/items',(req,res)=>res.json({items:state.items,total:state.items.length}));
app.post('/api/import',async(req,res)=>{try{let {filename='',content}=req.body;if(typeof content!=='string')throw Error('Missing file content');let rows;if(filename.toLowerCase().endsWith('.csv'))rows=parse(content,{columns:true,skip_empty_lines:true,bom:true});else{let json=JSON.parse(content);rows=Array.isArray(json)?json:Array.isArray(json.items)?json.items:Array.isArray(json.pages)?json.pages.flatMap((p,i)=>p.items.map(x=>({...x,page:i+1}))):null}if(!rows)throw Error('Unsupported file format');let result=importRows(rows);await save();res.json(result)}catch(e){res.status(400).json({error:e.message})}});
app.patch('/api/items/:id',async(req,res)=>{let x=state.items.find(x=>x.id===req.params.id);if(!x)return res.status(404).json({error:'Not found'});if(typeof req.body.followed==='boolean')x.followed=req.body.followed;if(typeof req.body.notes==='string')x.notes=req.body.notes.slice(0,2000);if(typeof req.body.translation==='string'){x.translation=req.body.translation.slice(0,400);x.translationEdited=true;}if(typeof req.body.trashed==='boolean'){x.trashed=req.body.trashed;rebuildProfiles();}await save();res.json(x)});
app.patch('/api/items/:id/suggestions/:sid',async(req,res)=>{let x=state.items.find(x=>x.id===req.params.id),s=x?.suggestions.find(s=>s.id===req.params.sid);if(!s)return res.status(404).json({error:'Not found'});if(typeof req.body.followed==='boolean'){for(const item of state.items)for(const idea of item.suggestions||[])if(idea.query===s.query)idea.followed=req.body.followed;}if(typeof req.body.translation==='string'){s.translation=req.body.translation.slice(0,400);s.translationEdited=true;}await save();res.json(s)});
app.post('/api/bulk',async(req,res)=>{let ids=new Set(req.body.ids||[]),followed=!!req.body.followed;let count=0;for(let x of state.items)if(ids.has(x.id)){x.followed=followed;count++}await save();res.json({updated:count})});
// v9: Editable product identities and grouped search profiles.
app.get('/api/search-profiles',(req,res)=>res.json({profiles:state.profiles||[]}));
app.patch('/api/search-profiles/:id',async(req,res)=>{
 const p=state.profiles.find(p=>p.id===req.params.id);if(!p)return res.status(404).json({error:'Profile not found'});
 if(typeof req.body.followed==='boolean')p.followed=req.body.followed;
 if(typeof req.body.name==='string'){let name=ic(req.body.name).slice(0,100);if(!name)return res.status(400).json({error:'Profile name required'});p.name=name;p.manualName=true}
 if(typeof req.body.query==='string'){let query=ic(req.body.query).slice(0,90);if(query.length<3)return res.status(400).json({error:'Search must be at least 3 characters'});p.query=query;p.manualQuery=true}
 await save();res.json(p);
});
app.patch('/api/items/:id/identity',async(req,res)=>{
 const x=state.items.find(x=>x.id===req.params.id);if(!x)return res.status(404).json({error:'Item not found'});
 const query=ic(req.body.query).slice(0,90);if(query.length<3)return res.status(400).json({error:'Enter a meaningful product or publication name'});
 const old=x.identity||{};
 const manual={query,english:typeof req.body.english==='string'?req.body.english.slice(0,160):(old.english||''),
  publisher:typeof req.body.publisher==='string'?req.body.publisher.slice(0,100):(old.publisher||''),
  type:['book','magazine','pamphlet','film','game','music','merchandise','other'].includes(req.body.type)?req.body.type:(old.type||'other'),
  alternate:old.alternate||'',
  // Apply corrections to similarly identified items via their existing profile if explicitly requested.
  profileKey:req.body.groupWithSimilar===true?(old.profileKey||old.query):null};
 const oldProfile=x.profileId;
 const affected=req.body.groupWithSimilar===true?state.items.filter(item=>item.profileId&&item.profileId===oldProfile):[x];
 for(const item of affected){item.identity=identify(item.title,{...manual,profileKey:manual.profileKey||null});item.profileId=profileId(item.identity);if(!item.translationEdited&&manual.english)item.translation=manual.english;refreshSuggestions(item)}
 if(affected.length>1){const oldProfileRow=state.profiles.find(p=>p.id===oldProfile);if(oldProfileRow){if(!oldProfileRow.manualQuery)oldProfileRow.query=query;if(!oldProfileRow.manualName)oldProfileRow.name=query}}
 rebuildProfiles();await save();res.json({item:x,updated:affected.length});
});
// Optional bibliographic lookup: only user-requested, only valid ISBNs to OpenBD.
app.post('/api/items/:id/verify-isbn',async(req,res)=>{
 const x=state.items.find(x=>x.id===req.params.id);if(!x)return res.status(404).json({error:'Item not found'});
 const isbn=x.identity?.isbn;if(!isbn)return res.status(400).json({error:'No valid ISBN detected in this listing'});
 try{const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),8500);let r;
  try{r=await fetch('https://api.openbd.jp/v1/get?isbn='+encodeURIComponent(intelligence.toISBN13(isbn)||isbn),{signal:ctrl.signal,headers:{Accept:'application/json'}})}finally{clearTimeout(timer)}
  if(!r.ok)throw Error('Catalogue HTTP '+r.status);
  const z=(await r.json())?.[0]?.summary;
  if(!z?.title)return res.status(404).json({error:'No OpenBD catalogue record for this ISBN'});
  const query=ic(z.title).slice(0,95),old=x.identity;
  x.identity={...old,query,type:'book',publisher:ic(z.publisher)||old.publisher,confidence:.99,status:'verified',source:'catalog',note:'Title verified against OpenBD ISBN catalogue',alternate:old.query!==query?old.query:''};
  x.profileId=profileId(x.identity);if(!x.translationEdited&&x.identity.english)x.translation=x.identity.english;refreshSuggestions(x);rebuildProfiles();await save();res.json({item:x,catalogue:{title:z.title,publisher:z.publisher,isbn}});
 }catch(e){res.status(502).json({error:'Catalogue lookup failed: '+e.message})}
});
// API-assisted identification is opt-in. Set OPENAI_API_KEY, then click the button in Sourcebook.
let aiStatus={running:false,checked:0,updated:0,total:0,failed:0,error:null,startedAt:null,finishedAt:null};
const AI_TYPES=['magazine','book','pamphlet','film','game','music','merchandise','other'];
async function aiIdentifyBatch(batch){
 const apiKey=process.env.OPENAI_API_KEY;if(!apiKey)throw Error('Set OPENAI_API_KEY in Railway Variables to use AI identification');
 const payload={model:process.env.OPENAI_MODEL||'gpt-4o-mini',temperature:0,response_format:{type:'json_object'},
  messages:[{role:'system',content:'You identify Japanese vintage printed materials and collectibles from noisy Yahoo/Mercari seller titles. Return JSON object {"items":[{"id":"...","query":"short accurate Japanese work/publication search", "english":"English translation of title", "type":"magazine|book|pamphlet|film|game|music|merchandise|other", "publisher":"publisher only if explicitly known", "year":null, "alternate":"alternate printed short title", "confidence":0.0}]}. Remove shipping terms, seller IDs, condition notes, artist/article listings and ISBNs from query. Preserve the actual edition identity. Different magazine issues can share a magazine title as core. Do not invent facts; if title is unclear use empty query. No extraneous text.'},
  {role:'user',content:JSON.stringify({items:batch.map(x=>({id:x.id,title:x.title.slice(0,300),knownIsbn:x.identity?.isbn||null,existingGuess:x.identity?.query||''}))})}]};
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),35000);
 try{const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',signal:ctrl.signal,headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify(payload)});
  if(!r.ok)throw Error('AI API HTTP '+r.status+': '+(await r.text()).slice(0,160));
  const data=await r.json(),parsed=JSON.parse(data.choices?.[0]?.message?.content||'{}');return Array.isArray(parsed.items)?parsed.items:[];
 }finally{clearTimeout(timer)}
}
async function runAI(targets){
 aiStatus={running:true,checked:0,updated:0,total:targets.length,failed:0,error:null,startedAt:new Date().toISOString(),finishedAt:null};
 try{for(let n=0;n<targets.length;n+=8){const batch=targets.slice(n,n+8);const results=await aiIdentifyBatch(batch);const byId=new Map(results.map(z=>[z.id,z]));
  for(const x of batch){aiStatus.checked++;const z=byId.get(x.id);if(!z?.query){aiStatus.failed++;continue}
   try{const next=intelligence.applyAI(x.identity||identify(x.title),z);x.identity=next;x.profileId=profileId(next);if(!x.translationEdited&&next.english)x.translation=next.english;refreshSuggestions(x);aiStatus.updated++}catch{aiStatus.failed++}}
  rebuildProfiles();await save();
 }}catch(e){aiStatus.error=String(e.message)}finally{aiStatus.running=false;aiStatus.finishedAt=new Date().toISOString();await save().catch(console.error)}
}
app.post('/api/intelligence/run',async(req,res)=>{
 if(aiStatus.running)return res.status(409).json({error:'AI identification is already running'});
 if(!process.env.OPENAI_API_KEY)return res.status(400).json({error:'Add OPENAI_API_KEY to Railway Variables first. AI identification is optional and billable.'});
 const ids=Array.isArray(req.body?.ids)?new Set(req.body.ids):null;
 const limit=Math.max(1,Math.min(40,Number(req.body?.limit)||24));
 const targets=state.items.filter(x=>!x.trashed&&x.identity?.source!=='manual'&&x.identity?.source!=='catalog'&&(
   ids?ids.has(x.id):(x.identity?.status==='review'&&x.identity?.source!=='ai'))).slice(0,limit);
 if(!targets.length)return res.json({started:false,message:'No eligible items need AI review',...aiStatus});
 runAI(targets).catch(e=>console.error('AI identification:',e));res.json({started:true,count:targets.length});
});
app.get('/api/intelligence/status',(req,res)=>res.json({enabled:!!process.env.OPENAI_API_KEY,...aiStatus,
 reviewCount:state.items.filter(x=>!x.trashed&&x.identity?.status==='review'&&x.identity?.source!=='ai').length}));
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
  followed.unshift(...(state.profiles||[]).filter(p=>p.followed).map(p=>p.query));
  let queries=[...new Set(followed.filter(Boolean))].slice(0,8); // bounded to avoid flooding sites
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

app.post('/api/items/trash',async(req,res)=>{let ids=new Set(Array.isArray(req.body.ids)?req.body.ids:[]),trash=req.body.trashed!==false,count=0;for(const x of state.items)if(ids.has(x.id)){x.trashed=trash;if(trash){x.followed=false;for(const s of x.suggestions||[])s.followed=false}count++}rebuildProfiles();await save();res.json({updated:count})});
app.delete('/api/items/permanent',async(req,res)=>{let ids=new Set(Array.isArray(req.body.ids)?req.body.ids:[]);let before=state.items.length;state.items=state.items.filter(x=>!(x.trashed&&ids.has(x.id)));rebuildProfiles();await save();res.json({deleted:before-state.items.length,note:'Items in original imports will reappear if imported again.'})});
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
