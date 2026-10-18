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
const curation=require('./curation');
const v11=require('./discovery-v11');
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
 // Profiles represent identified publications. Uncertain seller titles are one-per-purchase
 // until reviewed; subject keywords must never silently collapse different works.
 const previous=new Map((state.profiles||[]).map(p=>[p.id,p]));
 const mapped=new Map();
 const options=(p,info)=>{
  for(const option of searches(info)){
   // Do not add vague subjects to the monitoring menu.
   const query=ic(option.query);
   if(query&&!p.options.some(o=>o.query===query))p.options.push({query,kind:option.kind,reason:option.reason,confidence:option.confidence});
  }
 };
 for(const item of state.items.filter(x=>!x.trashed)){
  const info=item.identity||identify(item.title);
  // Never promote a low-confidence seller-title fragment into a shared product profile.
  const uncertain=info.status==='review'||Number(info.confidence)<.78;
  const key=uncertain?'needs-review:'+item.id:(profileId(info)||'needs-review:'+item.id);
  item.profileId=key;
  if(!mapped.has(key)){
   const old=previous.get(key)||{};
   const recognisedName=info.type==='magazine'?info.query:(info.displayTitle||info.query||intelligence.titleCandidate(item.title)||item.title);
   mapped.set(key,{id:key,name:old.manualName?old.name:recognisedName,
    query:old.manualQuery?old.query:(info.query||''),type:uncertain?'needs review':info.type,
    source:info.source,followed:!!old.followed,manualName:!!old.manualName,manualQuery:!!old.manualQuery,
    itemIds:[],examples:[],purchaseExamples:[],options:[],needsReview:uncertain,
    confidence:info.confidence,description:info.subtitle||'',publisher:info.publisher||'',english:info.english||'',
    yearMin:null,yearMax:null});
  }
  const p=mapped.get(key);p.itemIds.push(item.id);
  // Later purchases may reveal the actual subtitle missing in the first seller title.
  if(!p.manualName&&info.displayTitle&&info.displayTitle.length>String(p.name||'').length&&(!p.needsReview))p.name=info.displayTitle;
  if(!p.description&&info.subtitle)p.description=info.subtitle;
  if(!p.publisher&&info.publisher)p.publisher=info.publisher;
  if(!p.english&&info.english)p.english=info.english;
  if(/^https?:\/\//.test(item.thumbnail||'')&&p.examples.length<4)p.examples.push(item.thumbnail);
  if(p.purchaseExamples.length<8)p.purchaseExamples.push({id:item.id,title:item.title,url:item.url,thumbnail:item.thumbnail,priceYen:item.priceYen,auctionId:item.auctionId});
  if(info.year){p.yearMin=Math.min(p.yearMin??info.year,info.year);p.yearMax=Math.max(p.yearMax??info.year,info.year)}
  p.confidence=Math.min(p.confidence,info.confidence);
  if(!uncertain)options(p,info);
 }
 for(const p of mapped.values()){
  if(p.manualQuery&&p.query&&!p.options.some(x=>x.query===p.query))p.options.unshift({query:p.query,kind:'Your choice',reason:'Previously saved manual search',confidence:1});
  if(!p.needsReview&&p.query&&!p.options.some(x=>x.query===p.query))p.options.unshift({query:p.query,kind:'Saved',reason:'Your current search (previously saved)',confidence:.5});
  if(!p.manualQuery&&p.options.length)p.query=p.options[0].query;
  p.options=p.options.slice(0,10);
 }
 // Preserve deliberate followed searches from previous versions but label orphaned
 // broad profiles explicitly. A user can unfollow them; nothing is deleted silently.
 for(const [key,old] of previous)if(old.followed&&!mapped.has(key))mapped.set(key,{...old,
  itemIds:[],examples:[],purchaseExamples:[],options:old.query?[{query:old.query,kind:'Legacy search',reason:'No matching identified purchases; review or unfollow'}]:[],
  orphaned:true,description:'Legacy followed search. No longer linked to an identified publication.'});
 state.profiles=[...mapped.values()].sort((a,b)=>{
  if(!!a.orphaned!==!!b.orphaned)return a.orphaned?1:-1;
  if(!!a.needsReview!==!!b.needsReview)return a.needsReview?1:-1;
  return b.itemIds.length-a.itemIds.length||a.name.localeCompare(b.name,'ja');
 });
}
function normalize(r){let title=clean(r.title),url=clean(r.url);if(!title||badTitle(title)||!url)return null;let details=clean(r.details),m=details.match(/Auction ID \/ Order No\s+([^\s]+)/),charge=details.match(/Charge 1\s+([\d,]+)\s+yen/);let key=m?m[1]:url.split('?')[0]+'|'+title;return {id:id(key),title,url,thumbnail:validImage(r.thumbnail)?r.thumbnail:null,details,auctionId:m?m[1]:null,priceYen:charge?Number(charge[1].replace(/,/g,'')):null,marketplace:marketplace(url),page:r.page||null,followed:false,notes:'',suggestions:[],identity:identify(title)}}

function fj(q){return 'https://www.fromjapan.co.jp/japan/en/item/search/'+encodeURIComponent(q).replace(/%20/g,'+')+'/Al_11_Yh_RaRmMr_N_N_0A00ja0000_N/'}
function importRows(rows){let existing=new Map(state.items.map(x=>[x.id,x]));let added=0,updated=0;for(let row of rows){let x=normalize(row);if(!x)continue;let old=existing.get(x.id);if(old){old.thumbnail=old.thumbnail||x.thumbnail;old.auctionId=old.auctionId||x.auctionId;old.priceYen=old.priceYen??x.priceYen;updated++}else{existing.set(x.id,x);added++}}state.items=[...existing.values()].map(enrich);rebuildProfiles();return {added,updated,total:state.items.length}}
async function init(){if(process.env.DATABASE_URL){const {Pool}=require('pg');pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.PGSSLMODE==='disable'?false:{rejectUnauthorized:false}});await pool.query('CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY, value JSONB NOT NULL)');let r=await pool.query('SELECT value FROM app_state WHERE id=1');if(r.rows.length)state=r.rows[0].value}else if(fs.existsSync(STORE)){state=JSON.parse(fs.readFileSync(STORE,'utf8'))}state.listings ||= [];state.checks ||= [];state.profiles ||= [];state.curation=curation.ensureCuration(state.curation);state.v11 ||= {costs:v11.safeSettings({}),favoriteSellers:[]};state.v11.favoriteSellers ||= [];state.items=(state.items||[]).map(enrich);rebuildProfiles();if(!state.items.length){const seed=JSON.parse(fs.readFileSync(path.join(__dirname,'data','seed.json'),'utf8'));importRows(seed);await save()}else await save()}
function save(){writeQueue=writeQueue.then(async()=>{if(pool)await pool.query('INSERT INTO app_state(id,value) VALUES(1,$1::jsonb) ON CONFLICT(id) DO UPDATE SET value=EXCLUDED.value',[JSON.stringify(state)]);else fs.writeFileSync(STORE,JSON.stringify(state))});return writeQueue}
// v10: curated discovery. Catalogue sync uses only Lock Books' public Shopify product endpoint.
// Never modify the store, and preserve prior stock data if remote sync is unavailable.
let catalogueSync={running:false};
function discoveryView(){
 const weights=curation.feedbackWeights(state.curation.feedback,state.listings);
 return state.listings.map(x=>({...x,curation:curation.classify(x,state.curation,{weights})}));
}
app.get('/api/curation',(req,res)=>{
 const all=discoveryView(),counts={relevant:0,review:0,excluded:0,dismissed:0};
 for(const x of all)counts[x.curation.bucket]++;
 res.json({themes:curation.THEMES.map(({id,name})=>({id,name})),references:curation.REFERENCES,
  searches:state.curation.searches,catalogueCount:state.curation.catalogue.length,
  catalogueSource:state.curation.catalogueSource,catalogueSyncedAt:state.curation.catalogueSyncedAt,
  catalogueError:state.curation.catalogueError,syncRunning:catalogueSync.running,
  counts,feedbackCount:Object.keys(state.curation.feedback).length,aiEnabled:!!process.env.OPENAI_API_KEY});
});
app.patch('/api/curation/searches/:id',async(req,res)=>{
 const s=state.curation.searches.find(x=>x.id===req.params.id);
 if(!s)return res.status(404).json({error:'Curated search not found'});
 if(typeof req.body.enabled!=='boolean')return res.status(400).json({error:'Provide enabled: true or false'});
 s.enabled=req.body.enabled;await save();res.json({search:s});
});
app.post('/api/curation/searches',async(req,res)=>{
 const query=ic(req.body.query).slice(0,100),theme=String(req.body.theme||'').slice(0,25);
 if(query.length<4||/https?:|[<>]/i.test(query))return res.status(400).json({error:'Enter a short Japanese search, not a URL'});
 if(!curation.THEMES.some(x=>x.id===theme))return res.status(400).json({error:'Choose a supported theme'});
 if(state.curation.searches.length>=36)return res.status(400).json({error:'Maximum 36 searches'});
 if(state.curation.searches.some(x=>x.query===query))return res.status(409).json({error:'That search already exists'});
 const row={id:curation.hash('curation:'+query),query,theme,enabled:true,custom:true};
 state.curation.searches.push(row);await save();res.json({search:row});
});
app.delete('/api/curation/searches/:id',async(req,res)=>{
 let old=state.curation.searches.find(x=>x.id===req.params.id);
 if(!old?.custom)return res.status(400).json({error:'Only custom searches can be deleted; disable built-in searches instead'});
 state.curation.searches=state.curation.searches.filter(x=>x.id!==old.id);await save();res.json({deleted:true});
});
app.patch('/api/monitor/listings/:id/feedback',async(req,res)=>{
 const row=state.listings.find(x=>x.id===req.params.id);
 if(!row)return res.status(404).json({error:'Listing not found'});
 const previous=state.curation.feedback[row.id]||{};
 const preference=req.body.preference===undefined?(previous.preference??null):req.body.preference;
 const formatOverride=req.body.formatOverride===undefined?(previous.formatOverride??null):req.body.formatOverride;
 if(![null,'like','dislike'].includes(preference)||![null,'print','not-print'].includes(formatOverride))
  return res.status(400).json({error:'Invalid preference or format override'});
 if(!preference&&!formatOverride)delete state.curation.feedback[row.id];
 else state.curation.feedback[row.id]={preference,formatOverride,updatedAt:new Date().toISOString()};
 await save();res.json({listing:{...row,curation:discoveryView().find(x=>x.id===row.id)?.curation}});
});
const catalogAllowed='https://lockbooks.net/products.json';
async function fetchCatalogueUrl(url){
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),12000);
 try{const r=await fetch(url,{signal:ctrl.signal,headers:{Accept:'application/json,text/html;q=0.8','User-Agent':'Mozilla/5.0 (compatible; Sourcebook/10; catalogue reader)'}});
  if(!r.ok)throw Error('Lock Books HTTP '+r.status);
  return {type:r.headers.get('content-type')||'',body:await r.text()};
 }finally{clearTimeout(timer)}
}
async function shopifyCatalogue(){
 try{
  const all=[];
  for(let page=1;page<=6;page++){
   const u=new URL(catalogAllowed);u.searchParams.set('limit','250');u.searchParams.set('page',String(page));
   const r=await fetchCatalogueUrl(u);
   if(!r.type.includes('json'))throw Error('Public JSON catalogue unavailable');
   const products=JSON.parse(r.body).products;
   if(!Array.isArray(products))throw Error('Unexpected products JSON');
   for(const x of products)if(typeof x.title==='string'&&x.title.trim())all.push({id:String(x.id||x.handle||'').slice(0,90),title:ic(x.title).slice(0,160),source:'Lock Books public catalogue'});
   if(products.length<250)break;
  }
  if(all.length)return {items:[...new Map(all.map(x=>[x.id||x.title,x])).values()],source:'Lock Books public catalogue (including sold-out items)'};
 }catch(e){console.warn('JSON catalogue unavailable, trying collection pages:',e.message)}
 // Shopify sometimes disables products.json. Fall back to ordinary public collection pages.
 // This returns a partial, labelled sample rather than claiming to be the entire inventory.
 const {load}=require('cheerio'),all=new Map();
 for(const collection of ['japanese','magazines','books'])for(let page=1;page<=2;page++){
  const u=new URL('https://lockbooks.net/collections/'+collection);u.searchParams.set('page',String(page));
  let html;try{html=(await fetchCatalogueUrl(u)).body}catch{continue}
  const $=load(html);
  $('a[href*="/products/"]').each((i,el)=>{
   const link=$(el),href=(link.attr('href')||'').split('?')[0],key=href.match(/\/products\/([\w-]+)/)?.[1];
   if(!key||all.has(key))return;
   const alt=link.find('img[alt]').first().attr('alt')||'';
   const named=link.find('h3,h2,.card__heading,.product-card__title,.product-item__title').first().text()||'';
   const title=ic(named||alt||link.attr('aria-label')||'');
   if(title.length<4||title.length>160||/^view|^sold out|^shop now|^quick add/i.test(title))return;
   all.set(key,{id:key,title,source:'Lock Books public collection'});
  });
 }
 if(!all.size)throw Error('Neither Shopify JSON nor collection pages returned usable titles');
 return {items:[...all.values()],source:'Lock Books public collection pages (partial sample)'};
}
app.post('/api/curation/sync',async(req,res)=>{
 if(catalogueSync.running)return res.status(409).json({error:'Catalogue refresh is already running'});
 catalogueSync.running=true;
 try{
  const result=await shopifyCatalogue();
  state.curation.catalogue=result.items;state.curation.catalogueSource=result.source;
  state.curation.catalogueSyncedAt=new Date().toISOString();state.curation.catalogueError=null;
  await save();res.json({updated:true,count:result.items.length,syncedAt:state.curation.catalogueSyncedAt,source:result.source});
 }catch(e){state.curation.catalogueError=e.message.slice(0,180);await save();res.status(502).json({error:'Could not refresh public stock: '+e.message+'. Existing taste profile is retained.'});}
 finally{catalogueSync.running=false}
});
// Optional AI pass on unknown-format listing titles, explicitly triggered and separately billed.
let discoveryAI={running:false,checked:0,total:0,updated:0,failed:0,error:null};
async function aiDiscoveryJob(targets){
 discoveryAI={running:true,checked:0,total:targets.length,updated:0,failed:0,error:null};
 try{
  for(let i=0;i<targets.length;i+=8){
   const group=targets.slice(i,i+8);
   const payload={model:process.env.OPENAI_MODEL||'gpt-4o-mini',temperature:0,response_format:{type:'json_object'},
    messages:[{role:'system',content:'You are selecting vintage Japanese printed visual culture for a highly specialised shop. Classify the actual physical object. Accept only books, magazines, mooks, printed pamphlets, exhibition catalogues, zines and photobooks. Reject actual cassette tapes, records, DVDs, CDs, video games, posters, toys, cards and clothing even when subject matter is relevant. Books ABOUT those objects count as PRINT. For PRINT, assess thematic fit from the title alone on a 0-100 scale: strong interests vintage magazines (POPEYE, Olive, Studio Voice, Playboy), Japanese advertising and typography, cinema pamphlets, kaiju/horror and SFX, video game packaging and graphic reference, unusual subcultures, photobooks, avant-garde art and underground illustration. Use score below 60 for irrelevant generic books. Use UNKNOWN when title lacks format evidence. Do not claim to have seen a photo. Return JSON {"items":[{"id":"supplied id","format":"print|other|unknown","confidence":0.0,"relevance":0,"why":"brief grounded match reason","reason":"brief format evidence"}]} no extra text.'},
    {role:'user',content:JSON.stringify({items:group.map(x=>({id:x.id,title:String(x.title).slice(0,220)}))})}]};
   const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),35000);
   let parsed;
   try{const r=await fetch('https://api.openai.com/v1/chat/completions',{signal:ctrl.signal,method:'POST',headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(payload)});
    if(!r.ok)throw Error('AI HTTP '+r.status);
    parsed=JSON.parse((await r.json()).choices?.[0]?.message?.content||'{}');
   }finally{clearTimeout(timer)}
   const byId=new Map((parsed.items||[]).map(x=>[x.id,x]));
   for(const x of group){discoveryAI.checked++;const value=byId.get(x.id);
    if(!value||!['print','other','unknown'].includes(value.format)){discoveryAI.failed++;continue}
    x.aiAssessment={format:value.format,confidence:Math.min(1,Math.max(0,Number(value.confidence)||0)),relevance:Number.isFinite(Number(value.relevance))?Math.max(0,Math.min(100,Number(value.relevance))):null,why:String(value.why||'').slice(0,150),reason:String(value.reason||'').slice(0,180),at:new Date().toISOString()};
    discoveryAI.updated++;
   }
   await save();
  }
 }catch(e){discoveryAI.error=String(e.message).slice(0,180)}finally{discoveryAI.running=false;await save().catch(console.error)}
}
app.get('/api/curation/ai-status',(req,res)=>res.json({...discoveryAI,enabled:!!process.env.OPENAI_API_KEY}));
app.post('/api/curation/ai-review',async(req,res)=>{
 if(!process.env.OPENAI_API_KEY)return res.status(400).json({error:'Configure OPENAI_API_KEY first; AI review is optional and billed separately'});
 if(discoveryAI.running)return res.status(409).json({error:'AI review already running'});
 const limit=Math.max(1,Math.min(40,Number(req.body.limit)||16));
 const candidates=discoveryView().filter(x=>x.curation.bucket==='review'&&!x.aiAssessment&&x.title&&!/^(Mercari|Yahoo) listing /.test(x.title)).slice(0,limit);
 if(!candidates.length)return res.json({started:false,message:'No unreviewed uncertain titles available'});
 aiDiscoveryJob(candidates).catch(e=>console.error('Curation AI:',e));res.json({started:true,count:candidates.length});
});


// V11 groups are a derived presentation layer; state.items is never collapsed or erased.
function collectionSnapshot(){const collections=v11.groups(state.items);return {collections, candidates:v11.suggestions(state.items,collections), related:v11.relatedLeads(collections), purchases:state.items.filter(x=>!x.trashed).length, grouped:collections.filter(c=>c.count>1).length, settings:v11.safeSettings(state.v11?.costs)};}
app.get('/api/v11/collections',(req,res)=>res.json(collectionSnapshot()));
app.post('/api/v11/collections/merge',async(req,res)=>{
 const ids=[...new Set(Array.isArray(req.body.ids)?req.body.ids:[])].filter(x=>typeof x==='string');
 if(ids.length<2||ids.length>40)return res.status(400).json({error:'Select 2–40 purchases to group'});
 const found=ids.map(id=>state.items.find(x=>x.id===id&&!x.trashed));
 if(found.some(x=>!x))return res.status(404).json({error:'Purchase not found'});
 const existing=found.map(x=>x.duplicateOverride).find(x=>String(x||'').startsWith('merge:'));
 const key=existing||'merge:'+id('manual:'+ids.slice().sort().join('|'));
 // When joining an existing manual group, preserve ALL previously grouped items.
 for(const x of found)x.duplicateOverride=key;
 await save();res.json({ok:true,groupKey:key,collections:collectionSnapshot()});
});
app.post('/api/v11/collections/split',async(req,res)=>{
 const ids=[...new Set(Array.isArray(req.body.ids)?req.body.ids:[])].filter(x=>typeof x==='string');
 if(!ids.length||ids.length>40)return res.status(400).json({error:'Select 1–40 purchases to separate'});
 for(const itemId of ids){const x=state.items.find(x=>x.id===itemId&&!x.trashed);if(!x)return res.status(404).json({error:'Purchase not found'});}
 for(const itemId of ids)state.items.find(x=>x.id===itemId).duplicateOverride='separate';
 await save();res.json({ok:true,collections:collectionSnapshot()});
});
app.post('/api/v11/collections/reset',async(req,res)=>{
 const ids=[...new Set(Array.isArray(req.body.ids)?req.body.ids:[])].filter(x=>typeof x==='string');
 if(!ids.length||ids.length>40)return res.status(400).json({error:'Select 1–40 purchases'});
 for(const itemId of ids){const x=state.items.find(x=>x.id===itemId);if(!x)return res.status(404).json({error:'Purchase not found'});delete x.duplicateOverride;}
 await save();res.json({ok:true,collections:collectionSnapshot()});
});
app.get('/api/v11/opportunities',(req,res)=>res.json({
  related:v11.relatedLeads(v11.groups(state.items)),
  listings:v11.feed(discoveryView(),state.curation,state.v11?.costs),
  favoriteSellers:state.v11?.favoriteSellers||[],
  settings:v11.safeSettings(state.v11?.costs),
  notes:'Related searches are research leads, not confirmed titles. Seller/bundle signals depend on marketplace metadata. Values are estimates, not landed-cost quotes.'
}));
app.patch('/api/v11/sellers',async(req,res)=>{
 const seller=clean(req.body?.seller).slice(0,140);
 if(seller.length<3||seller.length>140)return res.status(400).json({error:'Invalid seller'});
 const discovered=new Set(state.listings.map(x=>x.seller).filter(Boolean));
 if(!discovered.has(seller))return res.status(400).json({error:'Seller not present in a discovered marketplace listing'});
 state.v11 ||= {};const set=new Set(state.v11.favoriteSellers||[]);
 if(req.body.followed===true)set.add(seller);else if(req.body.followed===false)set.delete(seller);else return res.status(400).json({error:'followed must be true or false'});
 state.v11.favoriteSellers=[...set].slice(0,150);await save();res.json({favoriteSellers:state.v11.favoriteSellers});
});
app.get('/api/v11/digest',(req,res)=>{
 const picks=v11.feed(discoveryView(),state.curation,state.v11?.costs).filter(x=>x.curation.bucket==='relevant');
 const seen=new Set();const entries=[];
 for(const row of picks){const key=v11.norm(row.title);if(key.length<6||seen.has(key))continue;seen.add(key);
  entries.push({title:row.title,translation:row.translation||null,market:row.market,priceYen:row.priceYen,image:row.image,url:row.url,score:row.curation.score,reason:row.curation.reason,bundle:row.bundle.isBundle,seller:row.seller,estimatedLandedGbp:row.economics.known?row.economics.landedCostGbp:null});
  if(entries.length>=20)break;
 }
 res.setHeader('Content-Disposition','attachment; filename="sourcebook-discovery-digest.json"');
 res.json({generatedAt:new Date().toISOString(),entries,note:'On-demand shortlist, NOT an automatically scheduled weekly email. Marketplace listings and estimates must be verified.'});
});
app.patch('/api/v11/costs',async(req,res)=>{
 const o=req.body||{};for(const [k,min,max] of [['gbpPerYen',.001,.05],['proxyFeeGbp',0,100],['postageGbp',0,250],['importCostGbp',0,250],['targetRetailGbp',0,1000]]){
  if(o[k]!==undefined&&(!Number.isFinite(Number(o[k]))||Number(o[k])<min||Number(o[k])>max))return res.status(400).json({error:'Invalid '+k});
 }
 state.v11 ||= {};state.v11.costs=v11.safeSettings({...state.v11.costs,...o});await save();res.json({settings:state.v11.costs});
});
let visionStatus={running:false,checked:0,updated:0,error:null};
app.get('/api/v11/vision/status',(req,res)=>res.json({...visionStatus,enabled:!!process.env.OPENAI_API_KEY}));
app.post('/api/v11/vision/run',async(req,res)=>{
 if(!process.env.OPENAI_API_KEY)return res.status(400).json({error:'OPENAI_API_KEY required; optional vision uses paid API calls'});
 if(visionStatus.running)return res.status(409).json({error:'Vision review already running'});
 const max=Math.min(6,Math.max(1,Number(req.body.limit)||3));
 const targets=discoveryView().filter(x=>x.curation.bucket!=='excluded'&&/^https:\/\//.test(x.image||'')&&!x.visualAssessment).slice(0,max);
 if(!targets.length)return res.json({started:false,message:'No unreviewed images available. Marketplace extraction may not have provided cover photographs.'});
 visionStatus={running:true,checked:0,updated:0,error:null};
 (async()=>{try{for(const x of targets){
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),30000);
  try{const payload={model:process.env.OPENAI_MODEL||'gpt-4o-mini',response_format:{type:'json_object'},messages:[{role:'system',content:'Describe visual clues visible in a marketplace product photograph. Distinguish an actual physical BOOK, MAGAZINE, MOOK, photobook, printed film pamphlet or catalogue from an actual tape, toy, CD or DVD. Do not invent titles or facts. Compare aesthetics with vintage Japanese experimental graphic design, eccentric print ephemera, cinema, kaiju, vintage magazine covers and game graphics. Return JSON {"format":"print|other|unclear","tags":["visual style",...],"reason":"short grounded observation","visualFit":0..100}. Avoid assuming a cassette shown is a book.'},{role:'user',content:[{type:'text',text:'Assess this marketplace image. Title: '+String(x.title||'').slice(0,160)},{type:'image_url',image_url:{url:x.image,detail:'low'}}]}]} ;
  const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',signal:ctrl.signal,headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(payload)});
  if(!r.ok)throw Error('Vision HTTP '+r.status);
  const parsed=JSON.parse((await r.json()).choices?.[0]?.message?.content||'{}');
  x.visualAssessment={format:['print','other','unclear'].includes(parsed.format)?parsed.format:'unclear',tags:Array.isArray(parsed.tags)?parsed.tags.slice(0,6).map(t=>String(t).slice(0,45)):[],reason:String(parsed.reason||'').slice(0,180),visualFit:Math.max(0,Math.min(100,Number(parsed.visualFit)||0)),at:new Date().toISOString()};
  visionStatus.updated++;await save();
  }finally{clearTimeout(timer)}visionStatus.checked++;
 }}catch(e){visionStatus.error=String(e.message).slice(0,180)}finally{visionStatus.running=false}})().catch(e=>console.error('v11 vision:',e));
 res.json({started:true,count:targets.length});
});

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
 if(typeof req.body.query==='string'){
  let query=ic(req.body.query).slice(0,90);
  if(query.length<3)return res.status(400).json({error:'Search must be at least 3 characters'});
  if(/^(?:スヌーピー|SNOOPY|パンフレット|雑誌|ムック|本|書籍)$/i.test(query))return res.status(400).json({error:'This is a subject, not a specific publication. Select a fuller title.'});
  p.query=query;p.manualQuery=true;
  if(!p.options?.some(o=>o.query===query)){p.options||=[];p.options.unshift({query,kind:'Your choice',reason:'Custom search selected by you',confidence:1})}
 }
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
 try{const html=await fetchPublicPage(x.url,9000);const detail=extract(html,x.market,x.url).find(y=>y.url===x.url);if(detail){for(const field of ['title','image','priceYen','seller'])if((x[field]==null||/^((Mercari|Yahoo) listing )/.test(x[field]))&&detail[field]!=null)x[field]=detail[field]}}catch(e){x.metadataError=String(e.message).slice(0,100)}return x;
}
async function monitor(){if(checking)return {running:true};checking=true;const started=new Date().toISOString();let found=0,errors=0,attempted=0;
 try{
  let followed=state.items.filter(x=>!x.trashed).flatMap(x=>(x.suggestions||[]).filter(s=>s.followed).map(s=>s.query));
  followed.push(...state.items.filter(x=>x.followed&&!x.trashed).map(x=>x.suggestions?.[0]?.query||x.title));
  followed.unshift(...(state.profiles||[]).filter(p=>p.followed).map(p=>p.query));
  // Followed user searches win; use remaining slots for curated print-specific searches.
  const chosen=[...new Set(followed.filter(Boolean))];
  const curated=[...new Set(state.curation.searches.filter(s=>s.enabled).map(s=>s.query).filter(q=>!chosen.includes(q)))];
  // Rotate through followed profiles rather than checking the same first eight forever.
  // Reserve one discovery slot for print-specific editorial searches when enabled.
  const rotate=(values,start,n)=>Array.from({length:Math.min(values.length,n)},(_,i)=>values[(start+i)%values.length]);
  const followedSlots=Math.min(curated.length?7:8,chosen.length),curatedSlots=Math.min(8-followedSlots,curated.length);
  const uc=Number(state.curation.monitorCursor)||0,cc=Number(state.curation.curatedCursor)||0;
  const queries=[...rotate(chosen,uc,followedSlots),...rotate(curated,cc,curatedSlots)];
  state.curation.monitorCursor=chosen.length?(uc+followedSlots)%chosen.length:0;
  state.curation.curatedCursor=curated.length?(cc+curatedSlots)%curated.length:0; // bounded to avoid flooding sites
  const known=new Map(state.listings.map(x=>[x.id,x]));let updated=0,detailChecks=0;
  for(let query of queries)for(let market of Object.keys(markets)){
   attempted++;try{let results=await checkOne(market,query);for(let x of results){let key=id(x.url),old=known.get(key);if(old){for(const field of ['title','image','priceYen','seller'])if((!old[field]||/^((Mercari|Yahoo) listing )/.test(old[field]))&&x[field]){old[field]=x[field];updated++}old.seenAt=started}else{let row={...x,id:key,query,firstSeen:started,seenAt:started};state.listings.unshift(row);known.set(key,row);found++}}state.checks.unshift({at:started,market,query,status:'ok',count:results.length,note:results.length?'Public listings parsed':'No listing cards extracted; site may require JavaScript or block requests'});
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
app.get('/api/monitor',(req,res)=>res.json({listings:discoveryView(),checks:state.checks||[],running:checking,markets:Object.keys(markets),note:'Only confirmed printed publications with relevant themes appear in the default feed; review uncertain formats separately. Marketplace availability is best-effort.'}));
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
