'use strict';
// Deterministic, conservative identification. Uncertain auctions receive no invented search.
const crypto = require('crypto');
const digest = s => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0,18);
const clean = s => String(s||'').normalize('NFKC').replace(/\s+/g,' ').trim();
const NOISE = /(?:クリックポスト|ゆうメール|ゆうパケット|ネコポス|宅急便|レターパック|送料無料|送料込み|送料込|匿名配送|即決|未使用品?|中古(?:本|品)?|古本|古書|美品|希少|激レア|超レア|レア物?|ジャンク|訳あり|出品中?|当時物|昭和レトロ|絶版|傷あり|折れあり|状態良好|入手困難|コレクション|切り抜き|現状品|セット販売|まとめ売り|表紙取れ|表紙外れ|帯付き|付録なし|欠品|ピンナップ付き|切り取りございません|背表紙破れあり|画像\d+参照)/gi;
const PREFIX = /^(?:[A-Z]{1,4}\d{2,8}[A-Z]?|\d{3,8}[A-Z]{0,3}|[a-z]\d{3,8}|[A-Z0-9]{2,10}[●★◇◆■])\s*/i;
const GENERIC = /^(?:パンフレット|写真集|雑誌|書籍|ムック|本|漫画|カセット|ゲーム|チラシ|SEGA|BAMBOO MOOK|大判|図鑑|ビデオ|映画)$/i;
const ISBN_RE = /(?:\b(?:ISBN(?:-1[03])?\s*[:：]?\s*)?)((?:97[89][\s-]?)?\d[\d\s-]{8,16}[\dXx])\b/g;
function isbnCheck(candidate){
 const s=candidate.replace(/[\s-]/g,'').toUpperCase();if(!/^(?:\d{9}[\dX]|97[89]\d{10})$/.test(s))return null;
 if(s.length===10){let v=0;for(let i=0;i<10;i++)v+=(10-i)*(s[i]==='X'?10:Number(s[i]));return v%11===0?s:null}
 let v=0;for(let i=0;i<13;i++)v+=Number(s[i])*(i%2?3:1);return v%10===0?s:null;
}
function toISBN13(isbn){const s=String(isbn||'').replace(/[\s-]/g,'');if(s.length===13)return isbnCheck(s);if(s.length!==10||!isbnCheck(s))return null;const base='978'+s.slice(0,9);let sum=0;for(let n=0;n<12;n++)sum+=Number(base[n])*(n%2?3:1);return base+String((10-sum%10)%10)}
function getIsbn(title){for(const hit of clean(title).matchAll(ISBN_RE)){const v=isbnCheck(hit[1]);if(v)return v;}return null}
function extractDate(title){const t=clean(title);const showa=t.match(/(?:昭和|昭)\s*(\d{1,2})(?:年|[.\/・-]|\s|$)/);const western=t.match(/\b(?:19\d{2}|20\d{2})\b/);let year=showa?1925+Number(showa[1]):western?Number(western[0]):null;if(year&&(year<1900||year>2100))year=null;
 const after=showa?t.slice(showa.index+showa[0].length):western?t.slice(western.index+western[0].length):'';
 let m=after.match(/^(?:年)?[.\s/・-]*([01]?\d)\s*(?:月|[\/・.-])/);let month=m&&Number(m[1])>=1&&Number(m[1])<=12?Number(m[1]):null;return {year,month};}
const SERIES = [
 {re:/プレイボーイ\s*(?:CUSTOM|カスタム)|PLAYBOY\s*CUSTOM/i,ja:'プレイボーイ CUSTOM',en:'Playboy CUSTOM',group:'magazine'},
 {re:/週刊\s*プレイボーイ|週プレ/i,ja:'週刊プレイボーイ',en:'Weekly Playboy',group:'magazine'},
 {re:/\bPOPEYE\b|ポパイ(?=\s|\d|昭|[・、,]|$)/i,ja:'POPEYE',en:'Popeye magazine',group:'magazine'},
 {re:/\bPLAYBOY\b.*(?:日本版|第\d+号)|(?:日本版\s*)?プレイボーイ\s*日本版|日本版.*プレイボーイ/i,ja:'PLAYBOY 日本版',en:'Playboy Japan edition',group:'magazine'},
 {re:/週刊少年ジャンプ|少年ジャンプ/i,ja:'週刊少年ジャンプ',en:'Weekly Shonen Jump',group:'magazine'},
 {re:/\bVZONE\b|ビジュアル.?ホラーマガジン/i,ja:'VZONE',en:'VZONE horror magazine',group:'magazine'},
 {re:/\bMEN(?:&#039;|['’])?S CLUB\b|メンズクラブ/i,ja:"MEN'S CLUB",en:"Men's Club magazine",group:'magazine'},
 {re:/\bSTUDIO\s*VOICE\b|スタジオ[・\s-]*ボイス/i,ja:'STUDIO VOICE',en:'Studio Voice magazine',group:'magazine'},
 {re:/ファミ通/i,ja:'ファミ通',en:'Famitsu',group:'magazine'},
 {re:/アニメージュ/i,ja:'アニメージュ',en:'Animage',group:'magazine'},
];
const WORKS=[
 {re:/セガ[・\s-]*コンシューマー[・\s-]*ヒストリー|SEGA\s+CONSUMER\s+HISTORY/i,ja:'セガ・コンシューマー・ヒストリー',en:'SEGA Consumer History',type:'book',alt:'SEGA CONSUMER HISTORY'},
 {re:/特殊メイクの世界/i,ja:'特殊メイクの世界',en:'The World of Special Effects Makeup',type:'book'},
 {re:/未公開[!！]?\s*恐怖ビデオ/i,ja:'未公開! 恐怖ビデオ',en:'Unreleased Horror Video',type:'book'},
 {re:/大ゴジラ図鑑\s*([12一二]?)/i,ja:'大ゴジラ図鑑',en:'Great Godzilla Encyclopedia',type:'book',captureEdition:true},
 {re:/ギャングスタラップカセットの世界/i,ja:'ギャングスタラップカセットの世界',en:'The World of Gangsta Rap Cassettes',type:'book'},
 {re:/バトル[・\s-]*ロワイアル/i,ja:'バトル・ロワイアル',en:'Battle Royale',type:'film'},
 {re:/グレムリン\s*100\s*%/i,ja:'グレムリン100%',en:'Gremlins 100%',type:'book'},
 {re:/サンリオのデザイン/i,ja:'サンリオのデザイン',en:'Sanrio Design',type:'book'},
 {re:/VANグラフィティ/i,ja:'VANグラフィティ',en:'VAN Graffiti',type:'book'},
 {re:/20世紀ロックTシャツ大図鑑/i,ja:'20世紀ロックTシャツ大図鑑',en:'20th-Century Rock T-Shirt Encyclopedia',type:'book'},
 {re:/悶絶[!！]\s*ロックTシャツ秘宝館|悶絶[!！]ロックTシャツ/i,ja:'悶絶!ロックTシャツ秘宝館',en:'Rock T-Shirt Collection',type:'book'},
 {re:/Lightning Archives.*ヴィンテージTシャツ|ヴィンテージTシャツ.*Lightning/i,ja:'Lightning Archives ヴィンテージTシャツ',en:'Lightning Archives Vintage T-Shirts',type:'book'},
 {re:/THE\s+BEST\s+OF\s+EROTIC\s+JACKET/i,ja:'THE BEST OF EROTIC JACKET',en:'The Best of Erotic Jacket',type:'book'},
 {re:/ROCK\s+T[ -]SHIRTS\s+MUSEUM|ロックTシャツミュージアム/i,ja:'ROCK T-SHIRTS MUSEUM',en:'Rock T-Shirts Museum',type:'book'},
 {re:/スヌーピー[・\s]*ブティック|SNOOPY\s+BOUTIQUE/i,ja:'スヌーピー・ブティック',en:'Snoopy Boutique',type:'book'},
 {re:/血しぶきホラーの世界/i,ja:'血しぶきホラーの世界',en:'World of Splatter Horror',type:'book'},
 {re:/THE\s+HORROR\s+MOVIES|ザ[・\s]*ホラー[・\s]*ムービーズ/i,ja:'THE HORROR MOVIES',en:'The Horror Movies',type:'book'},
 {re:/HOLLYWOOD\s+SFX\s+EXHIBITION|ハリウッドSFX展/i,ja:'HOLLYWOOD SFX EXHIBITION',en:'Hollywood SFX Exhibition',type:'book'},
 {re:/前売券シネマグラフ[ィイ]ティ/i,ja:'前売券シネマグラフィティ',en:'Advance Ticket Cinema Graffiti',type:'book'},
 {re:/日本昭和トンデモ児童書大全/i,ja:'日本昭和トンデモ児童書大全',en:'Japanese Showa-era Strange Children’s Books',type:'book'},
 {re:/日本昭和トンデモ怪獣大全/i,ja:'日本昭和トンデモ怪獣大全',en:'Japanese Showa-era Strange Monsters',type:'book'},
 {re:/GANGSTA\s+RAP\s+CASSETTES?/i,ja:'ギャングスタラップカセットの世界',en:'Gangsta Rap Cassettes',type:'book',alt:'GANGSTA RAP CASSETTE'},
 {re:/ROADSIDE\s+JAPAN|珍日本紀行/i,ja:'ROADSIDE JAPAN 珍日本紀行',en:'Roadside Japan',type:'book'},
 {re:/NIRVANA\s+(?:VINTAGE\s+)?T[ -]SHIRT\s+BOOK|\bHELLOH\?/i,ja:'NIRVANA T-SHIRT BOOK HELLOH?',en:'Nirvana T-Shirt Book: HELLOH?',type:'book'},
 {re:/100\s+POSTERS\s+OF\s+TADANORI\s+YOKOO/i,ja:'100 POSTERS OF TADANORI YOKOO',en:'100 Posters of Tadanori Yokoo',type:'book'},
 {re:/VINTAGE\s+MUSIC\s+T[ -]SHIRT\s+SCRAP/i,ja:'VINTAGE MUSIC T-SHIRT SCRAP',en:'Vintage Music T-Shirt Scrap',type:'book'},
 {re:/AKIRA.*グラフブック|アキラ[・ ]+グラフブック/i,ja:'AKIRA グラフブック',en:'Akira Graph Book',type:'book'},
 {re:/祝祭の呪物大図鑑/i,ja:'祝祭の呪物大図鑑',en:'Encyclopedia of Ritual Cursed Objects',type:'book'},
 {re:/捨てられないTシャツ/i,ja:'捨てられないTシャツ',en:'T-Shirts I Cannot Throw Away',type:'book'},
 {re:/世紀末倶楽部/i,ja:'世紀末倶楽部',en:'Fin de Siècle Club',type:'book'},
 {re:/ルゥーシー[・\s]*リィー/i,ja:'ルゥーシー・リィー',en:'Lucie Rie',type:'book'},
 {re:/POCARI\s*SWEAT|ポカリスエット/i,ja:'ポカリスエット',en:'Pocari Sweat',type:'merchandise'}
];
const publishing = t => {
 const p=t.match(/(?:エンターブレイン|集英社|竹書房|グラフィック社|ワニブックス|平凡出版|小学館|講談社|光文社|徳間書店|宝島社)/);
 return p?.[0]||null;
};
function titleCandidate(title){
 let s=clean(title);
 // Strip seller's shipping brackets and inventory numbers without removing real work titles.
 s=s.replace(/^\s*([A-Z]{1,4}\d{2,8}[A-Z]?|\d{3,8}[A-Z]{0,3})\s*(?=【|[『「\s])/i,'');
 s=s.replace(/【(?:[^】]{0,45}?(?:クリックポスト|中古|古書|送料|美品|レア)[^】]{0,25})】/gi,' ');
 s=s.replace(/^\s*[A-Z0-9]{2,12}[●★◇◆■]\s*/i,'').replace(PREFIX,'');
 s=s.replace(NOISE,' ');
 // Give quoted titles precedence over surrounding names and sales descriptions.
 const quote=s.match(/[『「]([^』」]{3,58})[』」]/);
 if(quote&&!/^[\d\s]+$/.test(quote[1]))s=quote[1];
 // First meaningful phrase delimited by seller-separated names, unless this is a normal title.
 s=s.split(/[■◆●★☆※◇|｜\n]/)[0];
 s=s.replace(/\b(?:ISBN\s*[:：]?\s*)?(?:97[89][\s-]?)?\d[\d\s-]{8,16}[\dXx]\b/gi,' ');
 s=s.replace(/(?:昭和|昭)\s*\d{1,2}(?:年|[/.・-])[^\s]*/g,' ').replace(/\b(?:19|20)\d{2}\s*年?\s*(?:\d{1,2}月?)?/g,' ');
 s=s.replace(/(?:^|\s)(?:NO\.?\d+|VOL\.?\s*\d+|\d{1,2}月\d{1,2}日号)/gi,' ');
 s=s.replace(/[【】「」『』\[\]<>]/g,' ').replace(/^[\s・:：,、.。!！-]+|[\s・:：,、.。!！-]+$/g,'').replace(/\s+/g,' ').trim();
 return s;
}
function candidateConfidence(t){if(!t||GENERIC.test(t)||/^\d+$/.test(t)||t.length<3||t.length>32)return 0;
 if(/(?:クリックポスト|エンターブレイン|竹書房|集英社|付録|発送|映画館|特典)/.test(t))return 0;
 if(/^[A-Z]{2,5}\d+/.test(t)||/[0-9]{5}/.test(t))return 0;
 if(/(?:\d{4}年|\d{2}月\d{2}日)/.test(t))return 0;
 if(/[ぁ-んァ-ヶ一-龯]/.test(t)&&t.length<=22)return .67;
 if(/[a-zA-Z]/.test(t)&&t.length<=22)return .57;
 return .2;
}
function identify(title,manual){
 const raw=clean(title),date=extractDate(raw),isbn=getIsbn(raw);const publisher=publishing(raw);
 if(manual?.query){const query=clean(manual.query).slice(0,90);return {query,english:clean(manual.english),type:clean(manual.type)||'other',year:date.year,month:date.month,isbn,publisher:clean(manual.publisher)||publisher,confidence:1,status:'reviewed',source:'manual',profileKey:manual.profileKey||null,alternate:clean(manual.alternate),note:'Corrected by you'};}
 // Commemorative books referencing a magazine are distinct from its ordinary issues.
 if(/熱狂.*週刊プレイボーイ.*50周年/.test(raw))return {query:'熱狂 週刊プレイボーイ創刊50周年記念出版',english:'Weekly Playboy 50th Anniversary Book',type:'book',...date,isbn,publisher,confidence:.96,status:'identified',source:'rules',profileKey:null,alternate:'',note:'Special publication, not a magazine issue'};
 const film=WORKS.find(w=>w.re.test(raw));
 if(film){let query=film.ja,english=film.en,type=film.type,alternate=film.alt||'';
 if(film.captureEdition){const n=raw.match(/大ゴジラ図鑑\s*([12一二])/);if(n){const num={'一':'1','二':'2'}[n[1]]||n[1];query+=num;english+=' '+num;}}
 if(type==='film'&&/パンフレット|パンフ[&＆+]|映画パンフ|チラシ/.test(raw)){query+=' パンフレット';type='pamphlet'}
 else if(type==='film'&&/写真集/.test(raw)){query+=' 写真集';type='book'}
 return {query,english,type,...date,isbn,publisher,confidence:.95,status:'identified',source:'rules',profileKey:type==='pamphlet'?query.toLowerCase():null,alternate,note:'Recognised product title'};}
 // Deliberately check Japanese edition BEFORE broader Playboy patterns.
 let series=SERIES.find(s=>s.ja==='PLAYBOY 日本版'&&s.re.test(raw))||SERIES.find(s=>s.re.test(raw));
 if(series){const special=/保存版|特別(?:号|篇)|記念(?:出版|号)|総集編/.test(raw);
  return {query:series.ja,english:series.en,type:'magazine',...date,isbn,publisher,confidence:special?.78:.98,status:'identified',source:'rules',profileKey:'series:'+series.ja,alternate:'',note:special?'Possibly a special issue; review if needed':'Magazine publication'};}
 const cut=titleCandidate(raw);const conf=candidateConfidence(cut);
 if(conf>=.55)return {query:cut,english:'',type:'other',...date,isbn,publisher,confidence:conf,status:'review',source:'rules',profileKey:null,alternate:'',note:'Title inferred from auction; please confirm'};
 return {query:'',english:'',type:'unknown',...date,isbn,publisher,confidence:0,status:'review',source:'rules',profileKey:null,alternate:'',note:'Title unclear. Add a clean title to unlock searches.'};
}
function searches(info){
 const out=[];const seen=new Set();const add=(query,kind,reason,confidence,translation='')=>{query=clean(query);if(!query||GENERIC.test(query)||seen.has(query.toLowerCase()))return;seen.add(query.toLowerCase());out.push({id:digest(query),query,kind,reason,confidence,translation,followed:false});};
 if(!info.query)return out;
 add(info.query,'Core','Identified product / publication',info.confidence,info.english);
 if(info.alternate&&info.alternate.toLowerCase()!==info.query.toLowerCase())add(info.alternate,'Alternate','Alternative printed title',info.confidence,info.english);
 if(info.type==='magazine'&&info.year){add(`${info.query} ${info.year}`,'Refine','Issues from this year',info.confidence,info.english?`${info.english} (${info.year})`:'');
  if(info.month)add(`${info.query} ${info.year} ${info.month}月`,'Exact','Specific month',info.confidence,'');}
 else if(info.publisher&&info.type==='book'&&info.query.length<35)add(`${info.query} ${info.publisher}`,'Specific','Title + publisher',Math.max(.5,info.confidence-.1),'');
 if(info.isbn)add(info.isbn,'ISBN','Exact edition (ISBN)',.99,'');
 return out.slice(0,5);
}
function profileId(info){if(!info.query)return null;return digest('profile:'+String(info.profileKey||info.query).toLocaleLowerCase());}
function profileLabel(info){return info.query}
function applyAI(current,result){
 if(!result||typeof result!=='object')throw Error('Missing structured identification');
 let query=clean(result.query).slice(0,100);
 if(!query||GENERIC.test(query)||query.length<3||/クリックポスト|送料無料|発送|\d{5,}/.test(query))throw Error('AI returned an unhelpful search term');
 let type=['magazine','book','pamphlet','film','game','music','merchandise','other'].includes(result.type)?result.type:'other';
 const year=Number(result.year)||current.year||null;
 return { ...current,query,type,english:clean(result.english).slice(0,200),publisher:clean(result.publisher)||current.publisher||null,confidence:Math.max(.55,Math.min(.95,Number(result.confidence)||.7)),status:'review',source:'ai',alternate:clean(result.alternate).slice(0,100),year,month:current.month,profileKey:type==='magazine'?`series:${query}`:null,note:'AI-assisted suggestion; verify before following'};
}
module.exports={clean,digest,getIsbn,isbnCheck,toISBN13,extractDate,titleCandidate,identify,searches,profileId,profileLabel,applyAI};
