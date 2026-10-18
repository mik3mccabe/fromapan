'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const Module=require('node:module'),fs=require('node:fs');
const routes={},oldLoad=Module._load,originalExists=fs.existsSync,originalRead=fs.readFileSync,originalWrite=fs.writeFileSync;
let persisted;
const sourceItems=[
 {id:'a',title:'セガ・コンシューマー・ヒストリー',url:'https://example.invalid/a'},
 {id:'b',title:'SEGA CONSUMER HISTORY',url:'https://example.invalid/b'},
 {id:'c',title:'特殊メイクの世界',url:'https://example.invalid/c'},
 {id:'d',title:'週刊プレイボーイ 1969年3月7日号',url:'https://example.invalid/d'},
 {id:'e',title:'週刊プレイボーイ 1969年3月14日号',url:'https://example.invalid/e'}
];
function express(){return {use(){},get(p,fn){routes['GET '+p]=fn},post(p,fn){routes['POST '+p]=fn},patch(p,fn){routes['PATCH '+p]=fn},delete(p,fn){routes['DELETE '+p]=fn},listen(_,__,cb){cb?.();return {close(){}}}}}
express.json=()=>()=>{};express.static=()=>()=>{};
fs.existsSync=function(p){if(String(p).endsWith('/data/store.json'))return true;return originalExists.apply(this,arguments)};
fs.readFileSync=function(p){if(String(p).endsWith('/data/store.json'))return JSON.stringify({items:sourceItems,listings:[],checks:[],profiles:[]});return originalRead.apply(this,arguments)};
fs.writeFileSync=function(p,x){if(String(p).endsWith('/data/store.json')){persisted=JSON.parse(x);return;}return originalWrite.apply(this,arguments)};
Module._load=function(name,parent,main){if(name==='express')return express;if(name==='csv-parse/sync')return {parse:()=>[]};if(name==='./marketplace-extract')return {extract:()=>[],canonical:()=>true};return oldLoad.apply(this,arguments)};
const oldDB=process.env.DATABASE_URL;delete process.env.DATABASE_URL;
require('../server');Module._load=oldLoad;
async function req(method,p,body={},params={}){const fn=routes[method+' '+p];assert(fn,'missing endpoint '+p);return new Promise((resolve,reject)=>{const res={statusCode:200,status(code){this.statusCode=code;return this},json(data){resolve({status:this.statusCode,data})},send(data){resolve({status:this.statusCode,data})},setHeader(){}};try{Promise.resolve(fn({body,params,query:{}},res)).catch(reject)}catch(e){reject(e)}})}
let first;
test('older state upgrades safely and groups recognised duplicates',async()=>{
 await new Promise(r=>setTimeout(r,40));const r=await req('GET','/api/v11/collections');assert.equal(r.status,200);first=r.data;
 assert.equal(first.purchases,5);assert(first.collections.some(x=>x.count===2&&x.title.includes('セガ')));
 assert.equal(first.collections.filter(x=>x.type==='magazine').length,2);
 assert.equal(persisted.items.length,5);assert(persisted.v11.costs);
});
test('manual merge and split persist without deleting purchase records',async()=>{
 const a=await req('POST','/api/v11/collections/merge',{ids:['a','c']});assert.equal(a.status,200);assert.equal(a.data.ok,true);
 assert.equal(a.data.collections.collections.find(x=>x.key===a.data.groupKey).count,2);
 const b=await req('POST','/api/v11/collections/split',{ids:['c']});assert.equal(b.status,200);
 assert.equal(persisted.items.length,5);
 assert.equal(persisted.items.find(x=>x.id==='c').duplicateOverride,'separate');
 const r=await req('POST','/api/v11/collections/reset',{ids:['a','c']});assert.equal(r.status,200);
 assert.equal(r.data.collections.collections.some(x=>x.count===2&&x.title.includes('セガ')),true);
});
test('invalid merge and invalid costs reject changes',async()=>{
 assert.equal((await req('POST','/api/v11/collections/merge',{ids:['missing','a']})).status,404);
 assert.equal((await req('PATCH','/api/v11/costs',{gbpPerYen:-1})).status,400);
 const good=await req('PATCH','/api/v11/costs',{gbpPerYen:.0051,targetRetailGbp:38});assert.equal(good.status,200);
 assert.equal(good.data.settings.targetRetailGbp,38);
 const leads=await req('GET','/api/v11/opportunities');assert.equal(leads.status,200);assert(Array.isArray(leads.data.listings));
});
test.after(()=>{fs.existsSync=originalExists;fs.readFileSync=originalRead;fs.writeFileSync=originalWrite;if(oldDB!==undefined)process.env.DATABASE_URL=oldDB});
