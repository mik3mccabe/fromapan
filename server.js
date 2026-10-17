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
function suggestions(title){
  const raw=clean(title).normalize('NFKC');
  const catalog=[
    [/週刊\s*プレイボーイ|週プレ/i,'週刊プレイボーイ'],[/プレイボーイ\s*CUSTOM/i,'プレイボーイ CUSTOM'],
    [/\bPOPEYE\b|ポパイ/i,'POPEYE'],[/週刊少年ジャンプ|少年ジャンプ/i,'週刊少年ジャンプ'],
    [/ファミ通/i,'ファミ通'],[/アニメージュ/i,'アニメージュ'],[/エヴァンゲリオン/i,'エヴァンゲリオン'],
    [/ガンダム/i,'ガンダム'],[/ゲームボーイ/i,'ゲームボーイ'],[/セガサターン/i,'セガサターン'],
    [/スーパーファミコン/i,'スーパーファミコン'],[/ドラゴンボール/i,'ドラゴンボール']
  ];
  // Identify the item before stripping seller-added names and article descriptions.
  const series=catalog.find(([pattern])=>pattern.test(raw));
  let subject=series?.[1]||'';
  let yearMatch=raw.match(/(?:19|20)\d{2}年?|(?:昭和|昭)\s*\d{1,2}年?/);
  let year=null;
  if(yearMatch){let n=yearMatch[0].match(/\d+/)?.[0];year=/昭/.test(yearMatch[0])?1925+Number(n):Number(n)}
  if(year&& (year<1900||year>new Date().getFullYear()+1))year=null;
  let month=null,day=null;
  const md=raw.match(/(?:19\d{2}|20\d{2}|昭和?\s*\d{1,2})\s*(?:年|[\/\.\-])\s*(\d{1,2})\s*(?:月|[\/\.\-])\s*(\d{1,2})\s*日?/);
  if(md){month=Number(md[1]);day=Number(md[2])}else{
    const m=raw.match(/(?:19\d{2}|20\d{2}|昭和?\s*\d{1,2})\s*(?:年|[\/\.\-])\s*(\d{1,2})\s*月?/);
    if(m)month=Number(m[1]);
  }
  if(!(month>=1&&month<=12))month=null;
  if(!(day>=1&&day<=31))day=null;
  if(!subject){
    // Seller listing descriptions often append unrelated names after ■, ／, etc.
    let lead=raw.split(/[■◆●★☆※|｜／:：\n]/)[0]
      .replace(/【([^】]+)】/g,'$1').replace(/\[[^\]]+\]/g,' ')
      .replace(/(?:19|20)\d{2}年?.*$/,'').replace(/(?:昭和|昭)\s*\d{1,2}.*$/,'')
      .replace(/(?:送料無料|中古品|即決|美品|希少|ジャンク|出品|匿名配送|まとめ売り|古本)/g,'')
      .replace(/\b\d{6}[-_]\d+\b/g,'').trim();
    subject=lead.replace(/[\s\-_,]+$/g,'').slice(0,30).trim();
  }
  const result=[];
  const add=(q,kind)=>{q=clean(q).replace(/\s+/g,' ');if(q.length>1&&!result.some(x=>x.query===q))result.push({id:id(q),query:q,kind,followed:false})};
  if(subject){
    if(year){add(`${subject} ${year} ${month?month+'月':''}`.trim(),'Balanced');add(`${subject} ${year}`,'Broad');
      const showa=year-1925;if(showa>=1&&showa<=64)add(`${subject} 昭和${showa}年`,'Broad');
      if(month&&day)add(`${subject} ${year}年${month}月${day}日`,'Exact');
      if(year<2000)add(`${subject} ${Math.floor(year/10)*10}年代`,'Broad');
    }else add(subject,'Balanced');
    add(subject,'Broad');
  }
  return result.slice(0,6);
}
function refreshSuggestions(x){
  const previous=x.suggestions||[];
  const followed=new Set(previous.filter(s=>s.followed).map(s=>s.query));
  const translations=new Map(previous.filter(s=>s.translation).map(s=>[s.query,s.translation]));
  x.suggestions=suggestions(x.title).map(s=>({...s,followed:followed.has(s.query),translation:translations.get(s.query)??gloss(s.query)}));
  return x;
}
function normalize(r){let title=clean(r.title),url=clean(r.url);if(!title||badTitle(title)||!url)return null;let details=clean(r.details),m=details.match(/Auction ID \/ Order No\s+([^\s]+)/),charge=details.match(/Charge 1\s+([\d,]+)\s+yen/);let key=m?m[1]:url.split('?')[0]+'|'+title;return {id:id(key),title,url,thumbnail:validImage(r.thumbnail)?r.thumbnail:null,details,auctionId:m?m[1]:null,priceYen:charge?Number(charge[1].replace(/,/g,'')):null,marketplace:marketplace(url),page:r.page||null,followed:false,notes:'',suggestions:suggestions(title)}}

// Human-readable English glosses. These are approximate until manually edited.
function gloss(jp){let t=clean(jp).normalize('NFKC');const words=[['週刊プレイボーイ','Weekly Playboy'],['プレイボーイ','Playboy'],['ポパイ','Popeye'],['創刊号','first issue'],['創刊','launch issue'],['昭和','Showa'],['表紙','cover'],['カセット','cassette'],['パンフレット','pamphlet'],['雑誌','magazine'],['広告','advertising'],['写真集','photo book'],['付録','supplement'],['ポスター','poster'],['漫画','manga'],['美術','art'],['映画','film'],['号','issue'],['年代','s'],['年',' year '],['月',' month '],['日',' day ']];let matched=false;for(const [a,b] of words){if(t.includes(a)){t=t.split(a).join(b);matched=true}}return matched?t.replace(/\s+/g,' ').trim():''}
function enrich(x){x.trashed=!!x.trashed;x.translation=x.translation??gloss(x.title);refreshSuggestions(x);return x}
function fj(q){return 'https://www.fromjapan.co.jp/japan/en/item/search/'+encodeURIComponent(q).replace(/%20/g,'+')+'/Al_11_Yh_RaRmMr_N_N_0A00ja0000_N/'}
function importRows(rows){let existing=new Map(state.items.map(x=>[x.id,x]));let added=0,updated=0;for(let row of rows){let x=normalize(row);if(!x)continue;let old=existing.get(x.id);if(old){old.thumbnail=old.thumbnail||x.thumbnail;old.auctionId=old.auctionId||x.auctionId;old.priceYen=old.priceYen??x.priceYen;updated++}else{existing.set(x.id,x);added++}}state.items=[...existing.values()].map(enrich);return {added,updated,total:state.items.length}}
async function init(){if(process.env.DATABASE_URL){const {Pool}=require('pg');pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.PGSSLMODE==='disable'?false:{rejectUnauthorized:false}});await pool.query('CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY, value JSONB NOT NULL)');let r=await pool.query('SELECT value FROM app_state WHERE id=1');if(r.rows.length)state=r.rows[0].value}else if(fs.existsSync(STORE)){state=JSON.parse(fs.readFileSync(STORE,'utf8'))}state.listings ||= [];state.checks ||= [];state.items=(state.items||[]).map(enrich);if(!state.items.length){const seed=JSON.parse(fs.readFileSync(path.join(__dirname,'data','seed.json'),'utf8'));importRows(seed);await save()}}
function save(){writeQueue=writeQueue.then(async()=>{if(pool)await pool.query('INSERT INTO app_state(id,value) VALUES(1,$1::jsonb) ON CONFLICT(id) DO UPDATE SET value=EXCLUDED.value',[JSON.stringify(state)]);else fs.writeFileSync(STORE,JSON.stringify(state))});return writeQueue}
app.get('/api/items',(req,res)=>res.json({items:state.items,total:state.items.length}));
app.post('/api/import',async(req,res)=>{try{let {filename='',content}=req.body;if(typeof content!=='string')throw Error('Missing file content');let rows;if(filename.toLowerCase().endsWith('.csv'))rows=parse(content,{columns:true,skip_empty_lines:true,bom:true});else{let json=JSON.parse(content);rows=Array.isArray(json)?json:Array.isArray(json.items)?json.items:Array.isArray(json.pages)?json.pages.flatMap((p,i)=>p.items.map(x=>({...x,page:i+1}))):null}if(!rows)throw Error('Unsupported file format');let result=importRows(rows);await save();res.json(result)}catch(e){res.status(400).json({error:e.message})}});
app.patch('/api/items/:id',async(req,res)=>{let x=state.items.find(x=>x.id===req.params.id);if(!x)return res.status(404).json({error:'Not found'});if(typeof req.body.followed==='boolean')x.followed=req.body.followed;if(typeof req.body.notes==='string')x.notes=req.body.notes.slice(0,2000);if(typeof req.body.translation==='string')x.translation=req.body.translation.slice(0,400);if(typeof req.body.trashed==='boolean')x.trashed=req.body.trashed;await save();res.json(x)});
app.patch('/api/items/:id/suggestions/:sid',async(req,res)=>{let x=state.items.find(x=>x.id===req.params.id),s=x?.suggestions.find(s=>s.id===req.params.sid);if(!s)return res.status(404).json({error:'Not found'});if(typeof req.body.followed==='boolean'){for(const item of state.items)for(const idea of item.suggestions||[])if(idea.query===s.query)idea.followed=req.body.followed;}if(typeof req.body.translation==='string')s.translation=req.body.translation.slice(0,400);await save();res.json(s)});
app.post('/api/bulk',async(req,res)=>{let ids=new Set(req.body.ids||[]),followed=!!req.body.followed;let count=0;for(let x of state.items)if(ids.has(x.id)){x.followed=followed;count++}await save();res.json({updated:count})});
// Best-effort public search page checker. Some marketplaces block server requests or change markup.
const markets={
  Yahoo:q=>'https://auctions.yahoo.co.jp/search/search?p='+encodeURIComponent(q),
  Mercari:q=>'https://jp.mercari.com/search?keyword='+encodeURIComponent(q)
};
let checking=false,lastRun=0;
function decodeEntities(t){return t.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>')}
function parseListings(html,market){
  const pattern=market==='Yahoo'?/https?:\\?\/\\?\/(?:page\\?\.)?auctions\\?\.yahoo\\?\.co\\?\.jp\\?\/jp\\?\/auction\\?\/[a-z0-9]+/gi:/https?:\\?\/\\?\/jp\\?\.mercari\\?\.com\\?\/item\\?\/[a-zA-Z0-9]+/gi;
  const urls=new Set();let m;while((m=pattern.exec(html))&&urls.size<35){let u=m[0].replace(/\\\\/g,'').replace(/\\\//g,'/');try{let parsed=new URL(u);urls.add(parsed.origin+parsed.pathname)}catch{}}
  return [...urls].map(url=>({url,market,title:market+' listing '+url.split('/').pop(),image:null,priceYen:null}));
}
async function checkOne(market,query){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{let r=await fetch(markets[market](query),{signal:controller.signal,headers:{'User-Agent':'Mozilla/5.0 (compatible; Sourcebook/2.0)','Accept':'text/html'}});if(!r.ok)throw Error('HTTP '+r.status);let html=await r.text();if(html.length>3000000)html=html.slice(0,3000000);return parseListings(html,market)}finally{clearTimeout(timer)}
}
async function monitor(){if(checking)return {running:true};checking=true;const started=new Date().toISOString();let found=0,errors=0,attempted=0;
 try{
  let followed=state.items.filter(x=>!x.trashed).flatMap(x=>(x.suggestions||[]).filter(s=>s.followed).map(s=>s.query));
  followed.push(...state.items.filter(x=>x.followed&&!x.trashed).map(x=>x.suggestions?.[0]?.query||x.title));
  let queries=[...new Set(followed)].slice(0,8); // bounded to avoid flooding sites
  const known=new Set(state.listings.map(x=>x.id));
  for(let query of queries)for(let market of Object.keys(markets)){
   attempted++;try{let results=await checkOne(market,query);for(let x of results){let key=id(x.url);if(!known.has(key)){state.listings.unshift({...x,id:key,query,firstSeen:started,seenAt:started});known.add(key);found++}}state.checks.unshift({at:started,market,query,status:'ok',count:results.length,note:results.length?'Links discovered':'No listing links extracted; may be blocked or page format changed'});
   }catch(e){errors++;state.checks.unshift({at:started,market,query,status:'error',count:0,note:String(e.message).slice(0,180)})}
  }
  state.listings=state.listings.slice(0,1500);state.checks=state.checks.slice(0,100);lastRun=Date.now();await save();return {found,errors,attempted,queries:queries.length};
 }finally{checking=false}
}
app.get('/api/monitor',(req,res)=>res.json({listings:state.listings||[],checks:state.checks||[],running:checking,markets:Object.keys(markets),note:'Best-effort public page checks; results may be incomplete. No alerts or guaranteed coverage.'}));
app.post('/api/monitor/run',async(req,res)=>{if(checking)return res.status(409).json({error:'Check already running'});if(Date.now()-lastRun<60000)return res.status(429).json({error:'Please wait at least one minute between checks'});try{res.json(await monitor())}catch(e){res.status(500).json({error:e.message})}});
setInterval(()=>{if(process.env.MONITOR_ENABLED==='true')monitor().catch(e=>console.error('Monitor:',e))},60*60*1000).unref();

app.post('/api/items/trash',async(req,res)=>{let ids=new Set(Array.isArray(req.body.ids)?req.body.ids:[]),trash=req.body.trashed!==false,count=0;for(const x of state.items)if(ids.has(x.id)){x.trashed=trash;if(trash){x.followed=false;for(const s of x.suggestions||[])s.followed=false}count++}await save();res.json({updated:count})});
app.delete('/api/items/permanent',async(req,res)=>{let ids=new Set(Array.isArray(req.body.ids)?req.body.ids:[]);let before=state.items.length;state.items=state.items.filter(x=>!(x.trashed&&ids.has(x.id)));await save();res.json({deleted:before-state.items.length,note:'Items in original imports will reappear if imported again.'})});
app.patch('/api/items/:id/image',async(req,res)=>{let x=state.items.find(x=>x.id===req.params.id);if(!x)return res.status(404).json({error:'Not found'});let image=req.body.image;if(image!==null&&(typeof image!=='string'||!(image.startsWith('https://')||image.startsWith('http://')||/^data:image\/(jpeg|png|webp);base64,/.test(image))||image.length>1200000))return res.status(400).json({error:'Use an image URL or JPG/PNG/WebP under approximately 850 KB'});x.thumbnail=image;await save();res.json({thumbnail:x.thumbnail})});
app.get('/api/search-ideas',(req,res)=>{const ideas=new Map();for(const x of state.items.filter(x=>!x.trashed))for(const s of x.suggestions||[]){if(!ideas.has(s.query))ideas.set(s.query,{...s,itemId:x.id,itemTitle:x.title,relatedItems:0});ideas.get(s.query).relatedItems++;}res.json({ideas:[...ideas.values()]})});
app.get('/api/fromjapan-search',(req,res)=>res.json({url:fj(clean(req.query.q))}));
app.get('/api/export',(req,res)=>{res.setHeader('Content-Disposition','attachment; filename="sourcing-library.json"');res.json(state)});
app.get('/api/health',(req,res)=>res.json({ok:true,items:state.items.length,database:!!pool}));
init().then(()=>app.listen(process.env.PORT||3000,'0.0.0.0',()=>console.log('Listening'))).catch(e=>{console.error(e);process.exit(1)});
