const test=require('node:test');
const assert=require('node:assert/strict');
const {identify,searches,getIsbn,toISBN13,profileId,applyAI}=require('../intelligence');
const sega='KB021【クリックポスト】セガ・コンシューマー・ヒストリー SEGA CONSUMER HISTORY エンターブレイン SEGA 4-7577-0789-4';
test('Sega title drops shipping and seller code, keeps ISBN as an exact-only option',()=>{
 const i=identify(sega),s=searches(i);assert.equal(i.query,'セガ・コンシューマー・ヒストリー');assert.equal(i.isbn,'4757707894');assert.equal(i.type,'book');
 assert.equal(s[0].query,i.query);assert(s.some(x=>x.query==='SEGA CONSUMER HISTORY'));assert(s.some(x=>x.kind==='ISBN'));
 assert(s.every(x=>!/KB021|クリックポスト/.test(x.query)));
});
test('Weekly Playboy articles and inventory fragments do not pollute monitored query',()=>{
 const a=identify('【週刊プレイボーイ】昭43/12/17■ヘンリー・ミラー夫人の裸■260613-9');
 assert.equal(a.query,'週刊プレイボーイ');assert.equal(a.year,1968);assert.equal(a.month,12);
 assert.deepEqual(searches(a).map(s=>s.query),['週刊プレイボーイ','週刊プレイボーイ 1968','週刊プレイボーイ 1968 12月']);
});
test('Different issues share a search profile but a special anniversary publication is separate',()=>{
 const a=identify('週刊プレイボーイ 1968年11月26日号');
 const b=identify('【週刊プレイボーイ】昭42/7/11■奥山章■');
 const special=identify('熱狂 週刊プレイボーイ創刊50周年記念出版 集英社');
 assert.equal(profileId(a),profileId(b));assert.notEqual(profileId(a),profileId(special));assert.equal(special.type,'book');
});
test('Bamboo Mook is not mistaken for a product name',()=>{
 const a=identify('未公開！恐怖ビデオ 劇場が拒否した血とエロス BAMBOO MOOK');
 assert.equal(a.query,'未公開! 恐怖ビデオ');assert(!searches(a).some(s=>s.query==='BAMBOO MOOK'));
});
test('Film pamphlets use movie title and object type, not just pamphlet',()=>{
 const a=identify('映画パンフ「バトル・ロワイアル」藤原竜也/前田亜季/栗山千明');
 assert.equal(a.query,'バトル・ロワイアル パンフレット');assert.equal(a.type,'pamphlet');
});
test('Unknown inventory codes do not become false searches',()=>{
 const a=identify('d1199533001');assert.equal(a.query,'');assert.equal(a.status,'review');assert.equal(searches(a).length,0);
});
test('Generic product classifications do not become standalone searches',()=>{
 for(const title of ['パンフレット','写真集','BAMBOO MOOK']){
 const a=identify(title);assert.equal(searches(a).length,0);
 }
});
test('Valid ISBN check rejects fake numbers, returns actual ISBN',()=>{
 assert.equal(getIsbn('4-7577-0789-4'),'4757707894');
 assert.equal(getIsbn('item number 23947736G'),null);
 assert.equal(toISBN13('4757707894')?.length,13);
});
test('Corrected identity overrides noisy seller metadata',()=>{
 const a=identify(sega,{query:'セガ コンシューマー ヒストリー',type:'book',english:'SEGA Consumer History'});
 assert.equal(a.status,'reviewed');assert.equal(a.query,'セガ コンシューマー ヒストリー');
});
test('AI output is verified and marked for review, never silently accepted',()=>{
 const base=identify('title too unclear');
 const good=applyAI(base,{query:'日本昭和トンデモ児童書大全',english:'Showa Oddities',type:'book',confidence:.87});
 assert.equal(good.source,'ai');assert.equal(good.status,'review');assert.equal(searches(good)[0].query,good.query);
 assert.throws(()=>applyAI(base,{query:'送料無料 クリックポスト',type:'book'}));
});
test('Search terms never contain a long arbitrary auction title',()=>{
 const rows=[{title:sega},{title:'【週刊プレイボーイ】昭43/12/17■ヘンリー・ミラー夫人の裸■260613-9'},
  {title:'未公開！恐怖ビデオ 劇場が拒否した血とエロス BAMBOO MOOK'},
  {title:'KB021【クリックポスト】SEGA CONSUMER HISTORY エンターブレイン'}];
 for(const x of rows){if(!x.title)continue;const i=identify(x.title);for(const s of searches(i)){
  assert(s.query.length<110,'Overlong suggestion: '+s.query);
  assert(!/^KB0\d+/.test(s.query),'Seller code leaked');
 }}
});
