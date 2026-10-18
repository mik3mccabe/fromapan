'use strict';
const test=require('node:test'); const assert=require('node:assert/strict');
const {identify,searches,profileId}=require('../intelligence');
const plain='帯付き スヌーピー・ブティック ピーナッツ・ヴィンテージ・コレクティブズ';
const two='即決 帯付 スヌーピー・ブティック Vol.2 ピーナッツ・ヴィンテージ・コレクティブズ アメリカ ニッポン タツミムック SNOOPY BOUTIQUE 2';
const bundle='スヌーピー・ブティック 2冊セット スヌーピー・ブティック 2 美品';
test('Snoopy edition, volume two, and two-book bundle are different identities',()=>{
 const [a,b,c]=[plain,two,bundle].map(t=>identify(t));
 assert.equal(a.query,'スヌーピー・ブティック');
 assert.equal(b.query,'スヌーピー・ブティック 2');
 assert.equal(c.lot,true);
 assert.equal(new Set([a,b,c].map(profileId)).size,3);
 assert.match(a.displayTitle,/ピーナッツ/);
 assert.equal(searches(a)[0].query,a.query);
 assert.equal(searches(b)[0].query,b.query);
 assert(searches(a).some(s=>s.kind==='Specific'));
 assert(searches(b).some(s=>s.query==='SNOOPY BOUTIQUE 2'));
 assert(!searches(c).some(s=>s.kind==='Specific'||s.kind==='English title'));
});
test('generic Snoopy subject is never a generated search option',()=>{
 assert.equal(identify('スヌーピー').status,'review');
 assert(!searches(identify('スヌーピー')).some(s=>s.query==='スヌーピー'));
 for(const x of [plain,two]) assert(searches(identify(x)).every(s=>s.query!=='スヌーピー'));
});
test('punctuation and English variants of volume two identify edition',()=>{
 for(const t of ['スヌーピー ★ブティック２','SNOOPY BOUTIQUE 2','スヌーピー・ブティック Vol.2'])
  assert.equal(identify(t).query,'スヌーピー・ブティック 2',t);
});
