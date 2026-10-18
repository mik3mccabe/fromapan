'use strict';
// V11: non-destructive publication-level grouping and decision-support.
// These are conservative suggestions, not destructive changes to purchase history.
const crypto=require('crypto');
const {identify,titleCandidate}=require('./intelligence');
const {classify}=require('./curation');
const hash=s=>crypto.createHash('sha256').update(String(s)).digest('hex').slice(0,18);
const norm=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu,'').trim();
const clean=s=>String(s||'').normalize('NFKC').replace(/\s+/g,' ').trim();
const isbn=s=>String(s||'').replace(/[\s-]/g,'').toUpperCase();
const isGarbage=t=>/Notification Based on the Act on Specified Commercial Transactions|FROM JAPAN Ltd\. Company info/i.test(String(t||''));
const issueNumber=t=>{
 const s=clean(t);
 // Distinct magazine issues and distinct numbered volumes must NEVER auto-merge.
 const hits=[];
 for(const [re,prefix] of [
  [/(?:第\s*([0-9]{1,4})\s*号|(?:issue|no\.?|号)\s*([0-9]{1,4}))/i,'issue'],
  [/(?:第\s*([0-9]{1,3})\s*巻|(?:vol(?:ume)?|part|pt)\.?\s*([0-9]{1,3}))/i,'vol'],
  [/(?:([0-9]{1,2})月\s*([0-9]{1,2})日\s*号)/,'date']
 ]){const m=s.match(re);if(m)hits.push(prefix+':'+m.slice(1).filter(Boolean).join('-'));}
 return hits.join('|');
};
const edition=t=>{
 const s=clean(t);
 const parts=[];
 for(const [re,key] of [
  [/(?:増補(?:改訂)?版|expanded(?: edition)?)/i,'expanded'],
  [/(?:改訂(?:新版)?|revised(?: edition)?)/i,'revised'],
  [/(?:新装版|new edition)/i,'new'],
  [/(?:第\s*([2-9])\s*版|([2-9])(?:nd|rd|th)\s*edition)/i,'later'],
  [/(?:復刻版|復刻|復刊|reprint)/i,'reprint'],
  [/(?:特別篇|特別編|special edition)/i,'special'],
  [/(?:限定版|limited edition)/i,'limited']
 ]){const m=s.match(re);if(m)parts.push(key+':'+(m.slice(1).filter(Boolean)[0]||''))}
 return parts.join('|')||'first-unspecified';
};
function variantSignature(t){
 const s=clean(t);
 const markers=[];
 // An auction containing a set is not automatically the same unit as the individual publication.
 if(/(?:[2-9]\d*\s*冊(?:セット|まとめ)|全\s*[2-9]\d*\s*冊|まとめ売り|セット販売|\blot\b|\bbundle\b)/i.test(s))markers.push('multi-item');
 if(/スヌーピー[・\s-]*ブティック\s*[2２]|SNOOPY\s*BOUTIQUE\s*[2２]/i.test(s))markers.push('snoopy-2');
 if(/THE\s+HORROR\s+MOVIES\s*[.。]?\s*([1-9])/i.test(s))markers.push('horror-'+RegExp.$1);
 if(/(?:2nd\s+)?ROCK\s+T[ -]SHIRTS\s+MUSEUM/i.test(s)&&/\b2nd\b/i.test(s))markers.push('rock-2');
 if(/['’]?70s.{0,8}['’]?80s|70年代.{0,8}80年代/i.test(s))markers.push('era-70-80');
 if(/['’]?90s.{0,8}2010s|90年代.{0,8}2010年代/i.test(s))markers.push('era-90-2010');
 return markers.join('|');
}
function issueSignature(x){const info=x.identity||identify(x.title),raw=clean(x.title);const number=issueNumber(raw);
 const y=info.year||null,m=info.month||null;
 // Additional issue identity: month/day and numbered issue. Never treat missing issue info as proof of match.
 let date=raw.match(/(?:19\d{2}|20\d{2})[年\/.\s-]+(\d{1,2})[月\/.\s-]+(\d{1,2})/);
 let jp=raw.match(/(?:\d{1,2})月\s*(\d{1,2})日(?:号|発売)?/);
 const day=date?Number(date[2]):jp?Number(jp[1]):null;
 return {number,year:y,month:m,day};
}
function canonicalKey(item){
 if(isGarbage(item.title))return {key:'individual:'+item.id,reason:'Non-product page',strength:'review'};
 if(item.duplicateOverride?.startsWith('merge:'))return {key:item.duplicateOverride,reason:'Manually grouped',strength:'manual'};
 if(item.duplicateOverride==='separate')return {key:'individual:'+item.id,reason:'Manually separated',strength:'manual'};
 const p=item.identity||identify(item.title),type=p.type||'unknown';
 if(p.isbn&&/^(?:97[89]\d{10}|\d{9}[\dX])$/.test(isbn(p.isbn)))return {key:'isbn:'+isbn(p.isbn),reason:'Identical ISBN',strength:'high'};
 if(!p.query||Number(p.confidence)<.86||!['book','magazine','pamphlet'].includes(type))return {key:'individual:'+item.id,reason:'Identity requires review',strength:'review'};
 const title=norm(p.query),ed=edition(item.title),vol=issueSignature(item),variant=variantSignature(item.title);
 if(variant.includes('multi-item'))return {key:'individual:'+item.id,reason:'Multi-item lot; review contents separately',strength:'review'};
 if(type==='magazine'){
  // A magazine identity represents a publication/series; it is not an issue identity.
  // Every issue needs a distinctive identifier, otherwise it stays separate.
  if(!vol.number&&!(vol.year&&vol.month&&vol.day))return {key:'individual:'+item.id,reason:'Magazine issue not uniquely identified',strength:'review'};
  return {key:'mag:'+title+':'+(vol.year||'?')+':'+(vol.month||'?')+':'+(vol.day||'?')+':'+vol.number+':'+variant,reason:'Matching publication and issue identifiers',strength:'high'};
 }
 // No ISBN: a recognised title can group when its edition/volume identifiers align.
 // If a series volume is mentioned on only one item, keep the unlabeled item separate.
 return {key:'title:'+title+':'+type+':'+ed+':'+(vol.number||'unspecified')+':'+variant,reason:'Matching recognised title and edition',strength:'high'};
}
function groups(items){
 const map=new Map();for(const x of items.filter(x=>!x.trashed)){
  const k=canonicalKey(x);if(!map.has(k.key))map.set(k.key,{id:hash(k.key),key:k.key,reason:k.reason,strength:k.strength,items:[],title:x.identity?.query||titleCandidate(x.title)||x.title,type:x.identity?.type||'unknown',thumbnail:null,totalYen:0});
  const g=map.get(k.key);g.items.push(x);g.thumbnail ||= x.thumbnail||null;g.totalYen+=Number(x.priceYen)||0;
 }
 return [...map.values()].map(g=>({id:g.id,key:g.key,title:g.title,type:g.type,thumbnail:g.thumbnail,count:g.items.length,itemIds:g.items.map(x=>x.id),reason:g.reason,strength:g.strength,totalYen:g.totalYen, purchases:g.items.map(x=>({id:x.id,title:x.title,url:x.url,thumbnail:x.thumbnail,auctionId:x.auctionId,priceYen:x.priceYen,marketplace:x.marketplace}))})).sort((a,b)=>b.count-a.count||a.title.localeCompare(b.title,'ja'));
}
function bigrams(t){const s=norm(t);if(s.length<4)return new Set();return new Set(Array.from({length:s.length-1},(_,i)=>s.slice(i,i+2)))}
function dice(a,b){const a2=bigrams(a),b2=bigrams(b);if(!a2.size||!b2.size)return 0;let overlap=0;for(const t of a2)if(b2.has(t))overlap++;return 2*overlap/(a2.size+b2.size)}
function suggestions(items,collections){
 // Human-review queue: fuzzy matches are NOT automatically merged.
 const representatives=collections.map(c=>({...c, item:items.find(x=>x.id===c.itemIds[0])})).filter(x=>x.item&&x.item.duplicateOverride!=='separate'&&!isGarbage(x.item.title));
 const results=[];for(let i=0;i<representatives.length;i++)for(let j=i+1;j<representatives.length;j++){
  const a=representatives[i],b=representatives[j];if(a.key===b.key)continue;
  const ia=a.item.identity||{},ib=b.item.identity||{};
  if(ia.isbn&&ib.isbn&&isbn(ia.isbn)!==isbn(ib.isbn))continue;
  if(ia.type==='magazine'||ib.type==='magazine'){
   if(ia.type!==ib.type)continue;
   const va=issueSignature(a.item),vb=issueSignature(b.item);
   if((va.number&&vb.number&&va.number!==vb.number)||(va.year&&vb.year&&va.year!==vb.year)||(va.month&&vb.month&&va.month!==vb.month)||(va.day&&vb.day&&va.day!==vb.day))continue;
   // Never fuzzy-merge periodicals without identifying their individual issues.
   const exactNumber=va.number&&vb.number&&va.number===vb.number;
   const exactDate=va.year&&vb.year&&va.year===vb.year&&va.month&&vb.month&&va.month===vb.month&&va.day&&vb.day&&va.day===vb.day;
   if(!exactNumber&&!exactDate)continue;
  }
  if(edition(a.item.title)!==edition(b.item.title)||variantSignature(a.item.title)!==variantSignature(b.item.title))continue;
  if(ia.isbn&&ib.isbn&&isbn(ia.isbn)===isbn(ib.isbn))continue;
  const ta=ia.query||titleCandidate(a.item.title),tb=ib.query||titleCandidate(b.item.title);
  if(ta.length<5||tb.length<5)continue;
  const score=dice(ta,tb);if(score<.86)continue;
  results.push({id:hash(a.id+':'+b.id),left:a.id,right:b.id,leftTitle:a.title,rightTitle:b.title,score:Math.round(score*100),reason:'Similar cleaned publication titles; review before combining'});
 }
 return results.sort((a,b)=>b.score-a.score).slice(0,100);
}
const safeSettings=o=>({gbpPerYen:Math.max(.001,Math.min(.05,Number(o?.gbpPerYen)||.005)),proxyFeeGbp:Math.max(0,Math.min(100,Number(o?.proxyFeeGbp)??3)),postageGbp:Math.max(0,Math.min(250,Number(o?.postageGbp)??7)),importCostGbp:Math.max(0,Math.min(250,Number(o?.importCostGbp)??0)),targetRetailGbp:Math.max(0,Math.min(1000,Number(o?.targetRetailGbp)??30))});
function economics(priceYen,settings){const s=safeSettings(settings),known=priceYen!==null&&priceYen!==undefined&&priceYen!==''&&Number.isFinite(Number(priceYen))&&Number(priceYen)>=0;
 if(!known)return {known:false,settings:s};const productGbp=Number(priceYen)*s.gbpPerYen,total=productGbp+s.proxyFeeGbp+s.postageGbp+s.importCostGbp;
 const profit=s.targetRetailGbp-total;return {known:true,productGbp:round(productGbp),landedCostGbp:round(total),grossProfitGbp:round(profit),grossMarginPct:s.targetRetailGbp?round(100*profit/s.targetRetailGbp):null,settings:s,assumption:'Illustrative estimate, not a verified shipping, VAT or tax quote'};
}
const round=n=>Math.round(n*100)/100;
function sellerSignal(listing){const n=clean(listing.seller||'');return n.length>=3&&n.length<150?n:null;}
function bundleSignal(title){const s=clean(title);const m=s.match(/(\d{1,3})\s*(?:冊|冊セット|冊まとめ|books?|volumes?|issues?)/i);
 const collection=/(?:まとめ売り|まとめて|一括|セット|全巻|大量|詰め合わせ|ロット|bulk|lot|bundle)/i.test(s);
 return {isBundle:collection||!!m,quantity:m?Number(m[1]):null,reason:collection?'Multi-item lot mentioned in seller title':m?'Multiple publications mentioned':''};}
function relatedLeads(collections){const found=new Map();const add=(title,query,why,kind)=>{query=clean(query);if(query.length<3||query.length>100)return;const key=norm(query);if(!found.has(key))found.set(key,{id:hash('related:'+key),title,query,why,kind});};
 for(const group of collections){const item=group.purchases[0];if(!item)continue;const p=identify(item.title),q=p.query;if(!q||p.confidence<.75)continue;
  if(p.publisher)add(group.title,q+' '+p.publisher,'Other editions and publications from the identified publisher','Publisher');
  if(p.type==='magazine')add(group.title,q+' バックナンバー','Discover other issues of this periodical','Back issues');
  if(/怪獣|ゴジラ|特撮|ホラー/.test(q))add(group.title,'昭和 特撮 図録','Related illustrated film and special-effects reference publications','Adjacent theme');
  if(/ゲーム|セガ|SEGA|任天堂|ファミ通/i.test(q))add(group.title,'ゲーム 広告 資料集','Adjacent visual archives in videogame publishing','Adjacent theme');
  if(/映画|シネマ|パンフレット/.test(q))add(group.title,'映画 パンフレット 図録','Related printed cinema ephemera','Adjacent theme');
 }
 return [...found.values()].slice(0,80);
}
function feed(listings,curation,settings){const counts=new Map(),weights={};for(const l of listings)if(sellerSignal(l))counts.set(l.seller,(counts.get(l.seller)||0)+1);
 const out=listings.map(l=>{const c=classify(l,curation,{weights}),bundle=bundleSignal(l.title),seller=sellerSignal(l);
  if(l.visualAssessment?.format==='print'&&c.format==='print'){c.score=Math.round(c.score*.75+Math.max(0,Math.min(100,Number(l.visualAssessment.visualFit)||0))*.25);c.reason='Cover review: '+String(l.visualAssessment.reason||c.reason);}
  if(l.visualAssessment?.format==='other'&&c.bucket==='relevant'){c.bucket='review';c.reason='Cover review suggests a non-print object; verify manually';}
  const economicsData=economics(l.priceYen,settings);
  return {id:l.id,title:l.title,url:l.url,market:l.market,priceYen:l.priceYen,image:l.image||null,translation:l.translation||'',firstSeen:l.firstSeen||'',seller,sellerHits:seller?counts.get(seller):0,bundle,curation:c,economics:economicsData,visualTags:l.visualAssessment?.tags||[],visualReason:l.visualAssessment?.reason||null};
 });
 return out.sort((a,b)=>(b.curation.score||0)-(a.curation.score||0)).slice(0,120);
}
module.exports={canonicalKey,groups,suggestions,issueSignature,edition,variantSignature,relatedLeads,economics,safeSettings,bundleSignal,feed,hash,norm};
