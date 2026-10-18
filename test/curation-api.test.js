'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const fs=require('fs');
// This integration harness tests Express route handlers and legacy database migrations
// without downloading dependencies or hitting external websites.
let appInstance, persisted;
const routes={};
function express(){
 appInstance={use(){},get(path,fn){routes['GET '+path]=fn},post(path,fn){routes['POST '+path]=fn},patch(path,fn){routes['PATCH '+path]=fn},delete(path,fn){routes['DELETE '+path]=fn},listen(port,host,callback){callback?.();return {close(){}}}};
 return appInstance;
}
express.json=()=>((req,res,next)=>next());express.static=()=>((req,res,next)=>next());
const originalLoad=Module._load;
const originalExists=fs.existsSync,originalRead=fs.readFileSync,originalWrite=fs.writeFileSync;
const mockState={items:[],listings:[
 {id:'a',market:'Yahoo',title:'昭和 特殊メイク ホラー映画 ムック',url:'https://auctions.yahoo.co.jp/jp/auction/example1',query:'特殊メイク 映画 ムック'},
 {id:'b',market:'Yahoo',title:'昭和 特撮 カセットテープ',url:'https://auctions.yahoo.co.jp/jp/auction/example2',query:'怪獣 図鑑'}
 ],checks:[],profiles:[]};
fs.existsSync=function(path){if(String(path).endsWith('/data/store.json'))return true;return originalExists.apply(this,arguments)};
fs.readFileSync=function(path){if(String(path).endsWith('/data/store.json'))return JSON.stringify(mockState);return originalRead.apply(this,arguments)};
fs.writeFileSync=function(path,content){if(String(path).endsWith('/data/store.json')){persisted=JSON.parse(content);return;}return originalWrite.apply(this,arguments)};
Module._load=function(request,parent,isMain){
 if(request==='express')return express;
 if(request==='csv-parse/sync')return {parse:()=>[]};
 if(request==='./marketplace-extract')return {extract:()=>[],canonical:()=>true};
 return originalLoad.apply(this,arguments);
};
const previousDB=process.env.DATABASE_URL;delete process.env.DATABASE_URL;
require('../server');
Module._load=originalLoad;
// Run without a real HTTP server.
async function request(method,path,body={},params={}){
 const fn=routes[method+' '+path];assert(fn,'Missing endpoint '+method+' '+path);
 return await new Promise((resolve,reject)=>{
  const res={statusCode:200,status(n){this.statusCode=n;return this},json(value){resolve({status:this.statusCode,data:value});return this},set(){return this},send(value){resolve({status:this.statusCode,data:value})}};
  try{Promise.resolve(fn({body,params,query:{}},res)).catch(reject)}catch(e){reject(e)}
 });
}
test('migrates old JSON state, classifies past discoveries and accepts feedback',async()=>{
 await new Promise(r=>setTimeout(r,30));
 const c=await request('GET','/api/curation');
 assert.equal(c.status,200);assert(c.data.catalogueCount>=20);
 const feed=await request('GET','/api/monitor');
 assert.equal(feed.data.listings.find(x=>x.id==='a').curation.bucket,'relevant');
 assert.equal(feed.data.listings.find(x=>x.id==='b').curation.bucket,'excluded');
 const vote=await request('PATCH','/api/monitor/listings/:id/feedback',{preference:'dislike'},{id:'a'});
 assert.equal(vote.status,200);assert.equal(vote.data.listing.curation.bucket,'dismissed');
 const after=await request('GET','/api/monitor');assert.equal(after.data.listings.find(x=>x.id==='a').curation.bucket,'dismissed');
 assert.equal(persisted.curation.feedback.a.preference,'dislike');
 const repair=await request('PATCH','/api/monitor/listings/:id/feedback',{formatOverride:'print'},{id:'b'});
 assert.equal(repair.status,200);assert.equal(repair.data.listing.curation.format,'print');
});
test('curated searches persist, rotate by user selection, and reject invalid input',async()=>{
 const c=await request('GET','/api/curation'),old=c.data.searches[0],before=old.enabled;
 const toggled=await request('PATCH','/api/curation/searches/:id',{enabled:!before},{id:old.id});
 assert.equal(toggled.status,200);assert.equal(toggled.data.search.enabled,!before);
 const invalid=await request('POST','/api/curation/searches',{theme:'unknown',query:'example test'});
 assert.equal(invalid.status,400);
 const good=await request('POST','/api/curation/searches',{theme:'printdesign',query:'日本 印刷広告図録 1984' });
 assert.equal(good.status,200);assert.equal(good.data.search.enabled,true);
 assert(persisted.curation.searches.some(x=>x.id===good.data.search.id));
});
test.after(()=>{
 fs.existsSync=originalExists;fs.readFileSync=originalRead;fs.writeFileSync=originalWrite;
 if(previousDB!==undefined)process.env.DATABASE_URL=previousDB;
});
