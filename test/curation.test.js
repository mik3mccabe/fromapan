'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {formatOf,classify,defaultCuration,ensureCuration,feedbackWeights}=require('../curation');
const state=()=>defaultCuration();
const listing=(id,title,query='怪獣 図鑑')=>({id,title,query,market:'Yahoo',firstSeen:'2026-10-17T00:00:00Z'});
test('audio cassette and actual game are excluded before topical scoring',()=>{
 const c=state();for(const title of ['SEGA ゲーム音楽 カセットテープ 当時物','昭和 怪獣 カセットテープ','ゴジラ VHS ビデオテープ','任天堂 ファミコン ゲームソフト']){
  const x=classify(listing(title,title),c);assert.equal(x.bucket,'excluded',title+' '+JSON.stringify(x));assert.equal(x.score,0);
 }
});
test('books about cassettes or games stay eligible',()=>{
 const c=state();for(const title of ['カセットテープのデザイン 写真集','ゲーム広告 資料集 1980年代','昭和ホラー映画 ムック','SEGA コンシューマー ヒストリー 図鑑','音楽カセット アートブック']){
  const x=classify(listing(title,title),c);assert.equal(x.format,'print',title+' '+JSON.stringify(x));assert.equal(x.bucket,'relevant',title+' '+JSON.stringify(x));
 }
});
test('non-print format beats thematic keywords',()=>{const x=classify(listing('1','ゴジラ ソフビ フィギュア'),state());assert.notEqual(x.bucket,'relevant')});
test('short uncertain titles do not silently become recommendations',()=>{
 for(const title of ['1982 SEGA','貴重資料','ホラー 1980','Mercari listing m1234']){
  const x=classify(listing(title,title),state());assert.equal(x.bucket,'review',title);
 }
});
test('printed magazine item can be preferred, dismissed, corrected and reset',()=>{
 const c=state(),x=listing('a','POPEYE 雑誌 1978年');
 assert.equal(classify(x,c).bucket,'relevant');
 c.feedback.a={preference:'dislike'};assert.equal(classify(x,c).bucket,'dismissed');
 c.feedback.a={preference:'like'};assert.equal(classify(x,c).bucket,'relevant');
 const tape=listing('b','昭和 カセットテープ');
 assert.equal(classify(tape,c).bucket,'excluded');
 c.feedback.b={formatOverride:'print'};assert.equal(classify(tape,c).format,'print');
 c.feedback.b={formatOverride:'not-print'};assert.equal(classify(tape,c).bucket,'excluded');
});
test('preferring one theme helps related listings; dislike weights are bounded',()=>{
 const c=state(),list=[listing('a','映画 ホラー ムック'),listing('b','映画 ホラー 写真集')];
 const base=classify(list[1],c).score;c.feedback.a={preference:'like'};
 const weights=feedbackWeights(c.feedback,list);assert(weights.cinema>0);assert(classify(list[1],c,{weights}).score>=base);
});
test('AI review only resolves uncertain formats with high confidence',()=>{
 const c=state();let x=listing('a','昭和 映画 映像資料');
 assert.equal(classify(x,c).bucket,'review');
 x.aiAssessment={format:'print',confidence:.88,reason:'Printed film catalogue'};
 assert.equal(classify(x,c).format,'print');
 x.aiAssessment={format:'other',confidence:.55};assert.equal(classify(x,c).bucket,'review');
});
test('seed stock is available offline; settings migration preserves legacy data',()=>{
 const c=ensureCuration({feedback:{x:{preference:'dislike'}},searches:[]});
 assert(c.catalogue.length>=20);assert.equal(c.feedback.x.preference,'dislike');assert.equal(c.searches.length,0);
 assert(defaultCuration().searches.some(s=>s.enabled));
});
