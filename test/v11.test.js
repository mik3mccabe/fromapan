'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {identify}=require('../intelligence');
const v=require('../discovery-v11');
const mk=(id,title,other={})=>({id,title,url:'https://example.invalid/'+id,identity:identify(title),...other});

test('same ISBN groups seller variations, retaining individual purchase records',()=>{
 const a=mk('a','SEGA CONSUMER HISTORY セガ コンシューマー ヒストリー ISBN 4-7577-0789-4');
 const b=mk('b','【中古】 セガ・コンシューマー・ヒストリー 9784757707890');
 // ISBN values in this example are seller strings; use a known valid ISBN assigned by metadata.
 a.identity.isbn='9784101010014';b.identity.isbn='9784101010014';
 const c=v.groups([a,b]);assert.equal(c.length,1);assert.deepEqual(c[0].itemIds,['a','b']);assert.equal(c[0].count,2);
});
test('the original order records are never deleted or overwritten',()=>{
 const a=mk('a','セガ・コンシューマー・ヒストリー',{auctionId:'A123',priceYen:1200});const b=mk('b','SEGA CONSUMER HISTORY',{auctionId:'B321',priceYen:1800});
 const all=[a,b],c=v.groups(all);assert.equal(c.length,1);assert.equal(c[0].purchases[0].auctionId,'A123');assert.equal(c[0].purchases[1].auctionId,'B321');assert.equal(all.length,2);
});
test('magazine issues only group with explicit matching issue identifiers',()=>{
 const items=[mk('a','週刊プレイボーイ 1969年 3月 7日号'),mk('b','週刊プレイボーイ 1969年 3月 14日号'),mk('c','週刊プレイボーイ 雑誌'),mk('d','週刊プレイボーイ 1969年 3月 7日号')];
 const c=v.groups(items);assert.equal(c.length,3);assert(c.some(g=>g.count===2));
});
test('editions and individual volumes remain separate',()=>{
 const a=mk('a','【復刻版】 Lightning Archives ヴィンテージTシャツ');const b=mk('b','初版 Lightning Archives ヴィンテージTシャツ');
 const c=mk('c','SNOOPY BOUTIQUE 2');const d=mk('d','SNOOPY BOUTIQUE');
 const e=mk('e','THE HORROR MOVIES.1');const f=mk('f','THE HORROR MOVIES 4冊セット');
 const g=mk('g',"'70s＆'80s サンリオのデザイン");const h=mk('h',"'90s～2010s サンリオのデザイン");
 assert.equal(v.groups([a,b,c,d,e,f,g,h]).length,8);
});
test('bundle lots remain separate from individual publications',()=>{
 const a=mk('a','THE HORROR MOVIES');const b=mk('b','THE HORROR MOVIES 全4冊セット');
 assert.equal(v.groups([a,b]).length,2);
 assert.equal(v.bundleSignal(b.title).isBundle,true);
});
test('manual grouping or separation wins over automated matching',()=>{
 const a=mk('a','SEGA CONSUMER HISTORY',{duplicateOverride:'merge:correct'});
 const b=mk('b','特殊メイクの世界',{duplicateOverride:'merge:correct'});
 assert.equal(v.groups([a,b]).length,1);
 a.duplicateOverride='separate';assert.equal(v.groups([a,b]).length,2);
});
test('fuzzy matches are suggestions only and exclude garbled pages',()=>{
 const a=mk('a','Notification Based on the Act on Specified Commercial Transactions');
 const b=mk('b','Notification Based on the Act on Specified Commercial Transactions');
 assert.equal(v.suggestions([a,b],v.groups([a,b])).length,0);
});
test('sourcing economics identify unknown price, accept custom landed cost assumptions',()=>{
 assert.equal(v.economics(null,{}).known,false);
 const x=v.economics(2000,{gbpPerYen:.005,proxyFeeGbp:3,postageGbp:7,importCostGbp:2,targetRetailGbp:35});
 assert.equal(x.landedCostGbp,22);assert.equal(x.grossProfitGbp,13);assert(x.assumption.includes('estimate'));
});
test('related searches are research leads and not supposed to be verified titles',()=>{
 const collections=v.groups([mk('a','SEGA CONSUMER HISTORY セガ コンシューマー ヒストリー'),mk('b','特殊メイクの世界 竹書房')]);
 const leads=v.relatedLeads(collections);assert(leads.some(l=>l.kind==='Adjacent theme'));assert(leads.every(l=>l.query&&l.why));
});
