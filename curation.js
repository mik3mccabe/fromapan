'use strict';
// Sourcebook v10: conservative format gate, explainable editorial fit, and reusable searches.
// No network calls or hidden model requests occur in this module.
const crypto=require('crypto');
const hash=x=>crypto.createHash('sha256').update(String(x)).digest('hex').slice(0,18);
const normalize=s=>String(s||'').normalize('NFKC').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const printable=/雑誌|週刊|月刊|季刊|MOOK|ムック|書籍|古本|古書|単行本|文庫|アートブック|フォトブック|図鑑|写真集|画集|作品集|設定資料|資料集|図録|写真帖|パンフレット|映画パンフ|劇場パンフ|映画プログラム|映画パンフ|カタログ|書誌|画報|絵本|教科書|攻略本|ファンブック|ファンBOOK|公式ガイド|コミック|漫画|マンガ|同人誌|ZINE|冊子|ハンドブック|本誌|写真文集|BOOKS?\b|MAGAZINE|PHOTO\s*BOOK|ART\s*BOOK|CATALOG(?:UE)?\b|FANZINE|ENCYCLOPEDIA|PAMPHLET|FILM PROGRAM|BOOKLET|ILLUSTRATED GUIDE|PAPERBACK|HARDCOVER|PRINTED BOOK/i;
const definitelyOther=/カセットテープ|音楽カセット|オーディオテープ|録音テープ|ビデオテープ|VHS|DVD|BLU[ -]?RAY|CD(?:-ROM)?\b|レーザーディスク|レコード(?:盤)?|LP盤|EP盤|ゲームソフト|ゲームカセット|ソフトのみ|ソフト単品|ゲーム機|ゲーム本体|本体のみ|ファミコンカセット|スーパーファミコンソフト|サントラ(?:CD|盤)|プラモデル|模型キット|フィギュア|ぬいぐるみ|キーホルダー|ストラップ|缶バッジ|ポストカード|ポスター(?:単品|のみ)?|Tシャツ|スウェット|パーカー|フーディ|キャップ|帽子|オーディオ機器|ジャンク品|\bCASSETTE\s*TAPE\b|\bCASSETTES?\b|\bVINYL\b|\bAUDIO\s*CD\b|\bGAME\s*CARTRIDGE\b|\bVIDEO\s*TAPE\b|\bACTION\s*FIGURE\b|\bTOY\b/i;
const ambiguousNonprint=/カセット|テープ|レコード|ゲーム|フィルム|ポスター|カード|ビデオ|CD|LP\b|写真|\bSEGA\b/i;
const weakPrint=/初版|判型|ページ|頁|出版|出版社|発行|発刊|帯付|背表紙|表紙|ISBN|絶版本|本書|古本|古書/i;
const placeholder=/^(?:Mercari|Yahoo) listing\s/i;
const THEMES=[
 {id:'magazines',name:'Vintage Japanese magazines',weight:20,patterns:[/週刊プレイボーイ|週プレ|プレイボーイ|\bPOPEYE\b|ポパイ|\bOLIVE\b|オリーブ|STUDIO\s*VOICE|スタジオボイス|雑誌|グラビア誌|文化誌|ファッション誌|\bANAN\b|メンズクラブ|アニメージュ|ファミ通/i],why:'Vintage Japanese magazine publishing'},
 {id:'printdesign',name:'Graphic design & print archives',weight:20,patterns:[/グラフィック|デザイン|タイポグラフィ|文字組|ロゴ|広告|宣伝|ポスター|印刷|装丁|パッケージ|図案|カタログ|チラシ|パンフ|デザイナ|グラフィティ|\bDESIGN\b|GRAPHIC|TYPOGRAPH|LOGO|ADVERTIS|PACKAGING|PRINT|COVER ART/i],why:'Graphic design, covers or printed ephemera'},
 {id:'cinema',name:'Cinema pamphlets & film culture',weight:17,patterns:[/映画|シネマ|劇場|洋画|邦画|パンフレット|キネマ|特撮|特集上映|映像|撮影|監督|\bCINEMA\b|\bFILM\b|MOVIE|PAMPHLET|MOVIE\s*PROGRAM/i],why:'Cinema publishing or film ephemera'},
 {id:'horror',name:'Horror, monsters & effects',weight:18,patterns:[/ホラー|恐怖|怪獣|ゴジラ|ウルトラマン|怪奇|特殊メイク|特殊効果|\bSFX\b|\bVZONE\b|スプラッタ|グロテスク|妖怪|\bHORROR\b|KAIJU|MONSTER|GODZILLA|Tokusatsu/i],why:'Horror, kaiju or special effects'},
 {id:'games',name:'Video game visual culture',weight:16,patterns:[/セガ|任天堂|ファミコン|スーパーファミコン|ゲームボーイ|ゲーム画面|ゲーム広告|ゲームデザイン|アーケード|攻略|コンシューマー|\bSEGA\b|NINTENDO|VIDEO\s*GAME|ARCADE|GAME\s*BOY|FAMICOM|CONSOLE/i],why:'Video-game visual history (printed references only)'},
 {id:'avantgarde',name:'Avant-garde & illustration',weight:17,patterns:[/前衛|アングラ|アヴァンギャルド|実験|イラスト|イラストレーション|アートブック|美術|作品集|サブカル|大友克洋|寺山修司|横尾忠則|天野喜孝|\bAVANT.?GARDE\b|ILLUSTRATION|UNDERGROUND|ART\s*BOOK|EROGURO|ERO GURO/i],why:'Experimental art, illustration or underground print'},
 {id:'photography',name:'Photography & photobooks',weight:13,patterns:[/写真集|写真家|写真作品|写真帖|フォトブック|撮影集|写真史|\bPHOTOBOOK\b|PHOTOGRAPHY|PHOTO\s*BOOK|PHOTO\s*ESSAY/i],why:'Photography or photobooks'},
 {id:'subculture',name:'Subcultures & visual archives',weight:13,patterns:[/音楽雑誌|ロックTシャツ|フライヤー|クラブカルチャー|レイヴ|パンク|タトゥー|ストリート|ファッション史|スケート|サーフ|雑貨図鑑|昭和文化|\bPUNK\b|RAVE|FLYERS|T.?SHIRT|SUBCULTURE|STREETWEAR|TATTOO/i],why:'Documented subculture or popular graphics'},
 {id:'erotica',name:'Vintage adult magazine graphics',weight:10,patterns:[/エロ|ピンク映画|劇画|官能|成人雑誌|緊縛|グラビア|ヌード|プレイボーイ|\bEROTIC\b|EROTICA|PIN.?UP|PLAYBOY/i],why:'Vintage erotica or adult magazine design'}
];
// Public-stock snapshot is a starting point, not a claim of live inventory.
const STOCK_SEED=[
 'The Animal Covers of Playboy Weekly Japan (1966-1971)','Our Feature Presentation: An Archive of Japanese Movie Programs',
 'Psychic Essence Threshold Signal: User Interfaces From Neon Genesis Evangelion','A Compendium of Print Advertising from The Simpsons',
 'Overclocked: An Archive of Graphics Card Box Art','Fright Flicks','Game Girl Camera','Top Shelf Type: Adult Magazine Logotypes 1960–1990',
 'Vintage Music T-Shirt Scrap','Vintage Jazz Poster Scrap','Special Make-up in the Movie','The Horror Movies: Part 3',
 'Advance Ticket Cinema Graffiti','Cinegoods Express Vol. 1','The Terminator Album',
 'Showa Era Boys Culture DX','Studio Voice Vol 224 (August 1994)','Studio Voice Vol 225 (September 1994)',
 'Olive Magazine (June 18, 1982)','Popeye Magazine Issue. 24 (February 10, 1978)',
 'Playboy Japanese Edition (May 1982)','Popeye O.B. Club Cover Collection',
 'Shukyu Magazine: The Design Story of J. League','Lightning Vintage T-Shirts',
 'Sex Magazines (1960-1990)','Surf Movie Posters (1965-2010)','Video Game Logos (1980-2010)',
 'Early Rave Graphics (1988-1993)','Bad People: Japanese TV Show Monsters',
 'BDSM Magazines from Japan','Punk Flyer Archive Vol 1 (1975-1980)','Call Girls Business Cards'
];
// Inspired by publicly visible subject/category overlap, not scraped Instagram posts.
const REFERENCES=[
 {name:'Lock Books',url:'https://lockbooks.net/collections/japanese',details:'Japanese print, popular culture, film, graphic archives'},
 {name:'Japanese Avant-Garde Books',url:'https://japaneseavantgardebooks.com/collections/photo-book',details:'Photobooks, experimental art, design and printed ephemera'},
 {name:'Japan Book Hunter',url:'https://japanbookhunter.com/collections',details:'Manga magazines, Japanese magazines, tokusatsu, art books and reference books'}
];
const SEEDS=[
 {query:'昭和 映画 パンフレット',theme:'cinema',enabled:true},
 {query:'特殊メイク 映画 ムック',theme:'horror',enabled:true},
 {query:'怪獣 図鑑',theme:'horror',enabled:true},
 {query:'昭和 広告 デザイン 本',theme:'printdesign',enabled:true},
 {query:'ゲーム 広告 資料集',theme:'games',enabled:false},
 {query:'週刊プレイボーイ 1968',theme:'magazines',enabled:false},
 {query:'スタジオボイス 雑誌',theme:'magazines',enabled:false},
 {query:'ポパイ 雑誌 1977',theme:'magazines',enabled:false},
 {query:'日本 グラフィックデザイン 図録',theme:'printdesign',enabled:false},
 {query:'アングラ イラスト 画集',theme:'avantgarde',enabled:false},
 {query:'日本 写真集 1970年代',theme:'photography',enabled:false},
 {query:'特撮 美術 設定資料集',theme:'horror',enabled:false},
 {query:'昭和 ファッション 広告 雑誌',theme:'subculture',enabled:false},
 {query:'映画 チラシ 図録',theme:'cinema',enabled:false}
].map(s=>({...s,id:hash('curation:'+s.query)}));
const seedCatalogue=STOCK_SEED.map((title,i)=>({id:'seed-'+i,title,source:'stock snapshot'}));
function defaultCuration(){return {catalogue:[...seedCatalogue],catalogueSource:'Public Lock Books catalogue snapshot (Oct 2026)',catalogueSyncedAt:null,catalogueError:null,searches:SEEDS.map(s=>({...s})),feedback:{},reviewedAt:null};}
function ensureCuration(raw){const defaults=defaultCuration();if(!raw||typeof raw!=='object')return defaults;return {
 catalogue:Array.isArray(raw.catalogue)&&raw.catalogue.length?raw.catalogue.slice(0,1300):defaults.catalogue,
 catalogueSource:raw.catalogueSource||defaults.catalogueSource,catalogueSyncedAt:raw.catalogueSyncedAt||null,
 catalogueError:raw.catalogueError||null,searches:Array.isArray(raw.searches)?raw.searches:defaults.searches,
 feedback:raw.feedback&&typeof raw.feedback==='object'?raw.feedback:{},reviewedAt:raw.reviewedAt||null
};}
function formatOf(title,override){
 if(override==='print')return {type:'print',label:'Printed publication',confidence:'manual',reason:'Confirmed as print by you'};
 if(override==='not-print')return {type:'other',label:'Not printed material',confidence:'manual',reason:'Excluded as non-print by you'};
 const t=normalize(title);
 if(!t||placeholder.test(t))return {type:'review',label:'Format unknown',confidence:'low',reason:'Marketplace title missing; review needed'};
 // Titles documenting tapes/games (book, magazine, catalogue) are books; the objects themselves aren't.
 const book=printable.test(t);
 const notPrint=definitelyOther.test(t)||/(?:カセット|トレーディングカード|(?<!映画)ポスター(?:$|[【「\s])|TAPES?)/i.test(t);
 if(notPrint&&!book)return {type:'other',label:'Non-print object',confidence:'high',reason:'Appears to be an audio/video/game/merchandise item'};
 if(book)return {type:'print',label:'Book / magazine / mook / other print',confidence:'high',reason:'Publication wording detected in the title'};
 if(notPrint||ambiguousNonprint.test(t))return {type:'review',label:'Format uncertain',confidence:'low',reason:'Title may describe an object rather than a publication'};
 if(weakPrint.test(t))return {type:'review',label:'Possibly printed',confidence:'medium',reason:'Book-related clues, but format is not confirmed'};
 return {type:'review',label:'Format unknown',confidence:'low',reason:'No clear evidence of a book, magazine or mook'};
}
const STOP=new Set(['the','and','for','from','with','vol','volume','issue','japan','japanese','archive','book','books','magazine','magazines','print','edition','special','design','art','graphic','graphics','movie','movies','film','collection','illustrated','a','an','of','in','on','to','by','no','part']);
const tokens=s=>[...new Set((normalize(s).toLowerCase().match(/[a-z][a-z0-9]{2,}|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]{2,}/gu)||[]).filter(x=>x.length>=3&&!STOP.has(x)&&!/^\d+$/.test(x)))];
const catalogueCache=new WeakMap();
function catalogueMatch(title,catalogue){const term=normalize(title).toLowerCase();if(term.length<5)return null;const a=tokens(term);let best=null;const stock=Array.isArray(catalogue)?catalogue:seedCatalogue;
 let index=catalogueCache.get(stock);if(!index){index=stock.slice(0,1300).map(x=>({x,b:tokens(x.title)}));catalogueCache.set(stock,index)}
 for(const {x,b} of index){const overlap=a.filter(t=>b.some(k=>k===t||(t.length>=6&&k.includes(t))||(k.length>=6&&t.includes(k))));
  const longExact=b.find(t=>t.length>=7&&term.includes(t));
  let quality=(longExact?20:0)+(overlap.length>=2?Math.min(12,overlap.length*5):0);
  if(quality>=20&&(!best||quality>best.quality))best={title:x.title,quality,source:x.source||'Lock Books'};
 }return best;}
function feedbackWeights(feedback,listings){const counts={};const byId=new Map((listings||[]).map(x=>[x.id,x]));for(const [id,f] of Object.entries(feedback||{})){
  if(!['like','dislike'].includes(f?.preference))continue;
  const listing=byId.get(id);if(!listing)continue;
  const text=normalize([listing.title,listing.translation].filter(Boolean).join(' '));
  const tags=THEMES.filter(t=>t.patterns.some(re=>re.test(text)));
  for(const t of tags)counts[t.id]=(counts[t.id]||0)+(f.preference==='like'?1:-1);
 }return Object.fromEntries(Object.entries(counts).map(([k,v])=>[k,Math.max(-8,Math.min(8,v*2))]));}
function classify(listing,curation,context={}){
 const feedback=(curation?.feedback||{})[listing.id]||{};
 const text=normalize([listing.title,listing.translation].filter(Boolean).join(' '));
 let fmt=formatOf(listing.title,feedback.formatOverride);
 // Optional AI assists only uncertain titles, never silently replaces confirmed format.
 const assessment=listing.aiAssessment;
 if(fmt.type==='review'&&!feedback.formatOverride&&assessment?.confidence>=.86){
  if(assessment.format==='print')fmt={type:'print',label:'Likely printed publication (AI)',confidence:'ai',reason:'AI review: '+(assessment.reason||'Publication')};
  if(assessment.format==='other')fmt={type:'other',label:'Likely non-print object (AI)',confidence:'ai',reason:'AI review: '+(assessment.reason||'Object')};
 }
 const themes=THEMES.filter(t=>t.patterns.some(re=>re.test(text))).map(x=>({id:x.id,name:x.name,why:x.why,weight:x.weight}));
 const catalog=catalogueMatch(text,curation?.catalogue||seedCatalogue);
 const scores=context.weights||{};
 const tagsBonus=themes.reduce((sum,x)=>sum+x.weight+Number(scores[x.id]||0),0);
 const hasQuery=listing.query&&normalize(text).toLowerCase().includes(normalize(listing.query).toLowerCase());
 let score=Math.min(98,Math.max(0,53+Math.min(36,tagsBonus)+(catalog?Math.min(17,catalog.quality):0)+(hasQuery?3:0)));
 if(!themes.length&&!catalog)score=Math.min(score,43);
 if(fmt.type==='review')score=Math.min(score,60);
 if(fmt.type==='other')score=0;
 // Optional AI ranks title-level thematic fit; explicit, separately billed and labelled.
 if(fmt.type==='print'&&assessment?.confidence>=.78&&assessment.relevance!=null&&Number.isFinite(Number(assessment.relevance))){
  score=Math.round(score*.35+Math.max(0,Math.min(100,Number(assessment.relevance)))*.65);
 }
 if(feedback.preference==='like'&&fmt.type==='print')score=Math.max(score,90);
 const reasons=[];
 if(catalog)reasons.push('Related to Lock Books stock: '+catalog.title);
 if(assessment?.confidence>=.78&&assessment?.why)reasons.push('AI title analysis: '+String(assessment.why).slice(0,150));
 for(const t of themes.slice(0,3))reasons.push(t.why);
 if(!reasons.length)reasons.push(fmt.reason);
 let bucket=fmt.type==='other'?'excluded':fmt.type==='review'?'review':score>=66?'relevant':'review';
 if(feedback.preference==='dislike')bucket='dismissed';
 if(feedback.preference==='like'&&fmt.type==='print')bucket='relevant';
 return {format:fmt.type,formatLabel:fmt.label,confidence:fmt.confidence,score,bucket,themes:themes.map(t=>({id:t.id,name:t.name})),reason:assessment?.confidence>=.78&&assessment?.why?'AI title analysis: '+String(assessment.why).slice(0,150):reasons[0],reasons,formatReason:fmt.reason,feedback:feedback.preference||null,formatOverride:feedback.formatOverride||null,stockMatch:catalog?.title||null};
}
module.exports={THEMES,REFERENCES,SEEDS,STOCK_SEED,defaultCuration,ensureCuration,formatOf,classify,feedbackWeights,tokens,catalogueMatch,normalize,hash};
