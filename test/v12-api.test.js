'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const Module=require('node:module'),fs=require('node:fs');
const routes={},oldLoad=Module._load,originalExists=fs.existsSync,originalRead=fs.readFileSync,originalWrite=fs.writeFileSync;
let persisted;
const sourceItems=[
 {id:'s1',title:'帯付き スヌーピー・ブティック ピーナッツ・ヴィンテージ・コレクティブズ',url:'https://example.invalid/s1'},
 {id:'s2',title:'SNOOPY BOUTIQUE タツミムック',url:'https://example.invalid/s2'},
 {id:'s3',title:'スヌーピー・ブティック Vol.2 ピーナッツ・ヴィンテージ・コレクティブズ',url:'https://example.invalid/s3'},
 {id:'s4',title:'スヌーピー・ブティック 2冊セット スヌーピー・ブティック 2 美品',url:'https://example.invalid/s4'},
 {id:'s5',title:'スヌーピーグッズ 昭和',url:'https://example.invalid/s5'}
];
function express(){return {use(){},get(p,fn){routes['GET '+p]=fn},post(p,fn){routes['POST '+p]=fn},patch(p,fn){routes['PATCH '+p]=fn},delete(p,fn){routes['DELETE '+p]=fn},listen(_,__,cb){cb?.();return {close(){}}}}}
express.json=()=>()=>{};express.static=()=>()=>{};
fs.existsSync=function(p){if(String(p).endsWith('/data/store.json'))return true;return originalExists.apply(this,arguments)};
fs.readFileSync=function(p){if(String(p).endsWith('/data/store.json'))return JSON.stringify({items:sourceItems,listings:[],checks:[],profiles:[{id:'old-snoopy',name:'スヌーピー',query:'スヌーピー',followed:true}]});return originalRead.apply(this,arguments)};
fs.writeFileSync=function(p,x){if(String(p).endsWith('/data/store.json')){persisted=JSON.parse(x);return;}return originalWrite.apply(this,arguments)};
Module._load=function(name,parent,main){if(name==='express')return express;if(name==='csv-parse/sync')return {parse:()=>[]};if(name==='./marketplace-extract')return {extract:()=>[],canonical:()=>true};return oldLoad.apply(this,arguments)};
const oldDB=process.env.DATABASE_URL;delete process.env.DATABASE_URL;
require('../server');Module._load=oldLoad;
async function req(method,p,body={},params={}){const fn=routes[method+' '+p];assert(fn,'missing endpoint '+p);return new Promise((resolve,reject)=>{const res={statusCode:200,status(code){this.statusCode=code;return this},json(data){resolve({status:this.statusCode,data})},send(data){resolve({status:this.statusCode,data})}};try{Promise.resolve(fn({body,params,query:{}},res)).catch(reject)}catch(e){reject(e)}})}
test('v12 separates different titles and retains original descriptions',async()=>{
 await new Promise(r=>setTimeout(r,40));const r=await req('GET','/api/search-profiles');assert.equal(r.status,200);
 const rows=r.data.profiles,one=rows.find(x=>x.query==='スヌーピー・ブティック'),two=rows.find(x=>x.query==='スヌーピー・ブティック 2');
 assert(one&&two);assert.equal(one.itemIds.length,2);assert.equal(two.itemIds.length,1);
 assert(rows.some(x=>x.type==='needs review'&&x.itemIds.includes('s5')));
 assert(rows.some(x=>x.query==='スヌーピー・ブティック 複数冊セット'));
 assert(one.options.length>=3);assert(one.options.some(x=>x.query.includes('ピーナッツ')));
 assert(one.purchaseExamples[0].title.includes('帯付き'));
 assert(rows.some(x=>x.id==='old-snoopy'&&x.orphaned&&x.followed));
 assert.equal(persisted.items.length,5);
});
test('manual search options persist and reject broad Snoopy',async()=>{
 const p=(await req('GET','/api/search-profiles')).data.profiles.find(x=>x.query==='スヌーピー・ブティック 2');
 let invalid=await req('PATCH','/api/search-profiles/:id',{query:'スヌーピー'},{id:p.id});assert.equal(invalid.status,400);
 const phrase='スヌーピー ブティック 2';const updated=await req('PATCH','/api/search-profiles/:id',{query:phrase,followed:true},{id:p.id});
 assert.equal(updated.status,200);assert.equal(updated.data.query,phrase);assert.equal(updated.data.followed,true);
 assert(updated.data.options.some(x=>x.query===phrase));
 assert.equal(persisted.profiles.find(x=>x.id===p.id).query,phrase);
});
test.after(()=>{fs.existsSync=originalExists;fs.readFileSync=originalRead;fs.writeFileSync=originalWrite;if(oldDB!==undefined)process.env.DATABASE_URL=oldDB});
