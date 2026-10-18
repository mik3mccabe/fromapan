let items=[],visible=[],selected=new Set(),limit=36,ideas=[],profiles=[],curationData=null,collectionsData={collections:[],candidates:[]},sourcingData=null,duplicateOnly=false;const $=s=>document.querySelector(s);const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));function toast(t){let e=$('#toast');e.textContent=t;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),3500)}
const fromJapanUrl=q=>'https://www.fromjapan.co.jp/japan/en/item/search/'+encodeURIComponent(q).replace(/%20/g,'+')+'/Al_11_Yh_RaRmMr_N_N_0A00ja0000_N/';let section='library',language='both',imageTarget=null,monitorData={listings:[],checks:[]};const searchUrl=(market,q)=>{let s=encodeURIComponent(q);return {Mercari:`https://jp.mercari.com/search?keyword=${s}`,Yahoo:`https://auctions.yahoo.co.jp/search/search?p=${s}`,Mandarake:`https://order.mandarake.co.jp/order/listPage/list?keyword=${s}&lang=en`,Surugaya:`https://www.suruga-ya.jp/search?search_word=${s}`} [market]};
async function api(url,opts){let r=await fetch(url,{...opts,headers:{'Content-Type':'application/json',...(opts?.headers||{})}});let j=await r.json();if(!r.ok)throw Error(j.error||'Request failed');return j}
function stats(){ $('#count').textContent=items.filter(x=>!x.trashed).length;$('#suggestions').textContent=new Set(items.filter(x=>!x.trashed).flatMap(x=>x.suggestions.map(s=>s.query))).size;$('#following').textContent=items.filter(x=>x.followed&&!x.trashed).length}
function apply(){let q=$('#search').value.trim().toLowerCase(),f=$('#filter').value;if(section==='library'||section==='sourcing'){visible=[];$('#resultcount').textContent=section==='library'?'PUBLICATION GROUPS':'SOURCING LAB';$('#selectall').checked=false;if(section==='library')renderCollections();return;}if(section==='listings'||section==='taste'){visible=[];$('#resultcount').textContent=section==='listings'?'NEW LISTINGS':'TASTE PROFILE';$('#selectall').checked=false;render();return;}if(section==='profiles'){visible=profiles.filter(p=>!q||[p.name,p.query,p.type].join(' ').toLowerCase().includes(q));$('#resultcount').textContent=`${visible.length} SEARCH PROFILES`;$('#selectall').checked=false;render();return;}if(section==='ideas'){visible=ideas.filter(x=>!q||[x.query,x.translation,x.kind].join(' ').toLowerCase().includes(q));$('#resultcount').textContent=`${visible.length} UNIQUE SEARCH IDEAS`;$('#selectall').checked=false;render();return;}visible=items.filter(x=>(section==='trash'?x.trashed:!x.trashed)&&(!q||[x.title,x.translation,x.auctionId,x.marketplace,...x.suggestions.flatMap(s=>[s.query,s.translation])] .join(' ').toLowerCase().includes(q))&&(f==='all'||f==='followed'&&x.followed||f==='images'&&x.thumbnail||f==='noimages'&&!x.thumbnail));if($('#sort').value==='title')visible.sort((a,b)=>a.title.localeCompare(b.title,'ja'));if($('#sort').value==='price')visible.sort((a,b)=>(b.priceYen||0)-(a.priceYen||0));$('#resultcount').textContent=`${visible.length} ITEMS`;$('#selectall').checked=visible.length>0&&visible.every(x=>selected.has(x.id));render()}
function card(x){
 let s=x.suggestions||[],info=x.identity||{},primary=s.find(v=>v.kind==='Core')?.query||s[0]?.query||'',has=s.length>0;
 const jp=language!=='english',en=language!=='japanese';
 const badge=info.status==='verified'?'Catalogue verified':info.status==='reviewed'?'Manually corrected':info.status==='identified'?'Identified':info.source==='ai'?'AI suggestion · review':'Needs review';
 const badgeClass=info.status==='verified'?'verified':(info.status==='review'||info.source==='ai'?'review':'');
 return `<article class="card">
 <div class="card-top"><div class="image-slot">${x.thumbnail?`<img class="thumb" loading="lazy" src="${esc(x.thumbnail)}" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'thumb placeholder',textContent:'NO IMAGE'}))">`:'<div class="thumb placeholder">NO IMAGE</div>'}<button class="image-edit" data-image="${x.id}">＋ Image</button></div>
 <div class="info"><div class="info-top"><span class="source">${esc(x.marketplace)}</span><input class="pick" data-id="${x.id}" type="checkbox" ${selected.has(x.id)?'checked':''} aria-label="Select item"></div>
 ${jp?`<div class="item-title" title="${esc(x.title)}">${esc(x.title)}</div>`:''}
 ${en?`<div class="translation">${esc(x.translation||info.english||'English translation not available')} <button class="edit-translation" data-item="${x.id}" title="Edit translation">✎</button></div>`:''}
 <div class="meta">${x.priceYen!=null?`¥${x.priceYen.toLocaleString()} · `:''}${x.auctionId?`ID ${esc(x.auctionId)} · `:''}<a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">Original ↗</a></div>
 <div class="identity-bar"><span class="identity-pill ${badgeClass}">${esc(badge)}</span>${info.type&&info.type!=='unknown'?`<span class="identity-name">${esc(info.type)}</span>`:''}<button class="identity-action identity-edit" data-item="${x.id}">Edit identity</button>${info.isbn&&info.source!=='catalog'?`<button class="identity-action verify-isbn" data-item="${x.id}" title="Look up this ISBN in OpenBD">Verify ISBN</button>`:''}</div>
 </div></div>
 <div class="suggest-area"><div class="section-label">PRODUCT SEARCHES</div>
 ${has?s.map(v=>`<div class="query"><div class="query-text">${jp?`<span class="query-name">${esc(v.query)} <small class="idea-kind">${esc(v.kind||'')}</small></span>`:''}${en?`<span class="translation">${esc(v.translation||v.reason||'')} ${v.translation?`<button class="edit-translation" data-item="${x.id}" data-sid="${v.id}">✎</button>`:''}</span>`:''}</div><a class="copy" href="${esc(fromJapanUrl(v.query))}" target="_blank" rel="noopener noreferrer">Search ↗</a><button class="suggest-follow ${v.followed?'active':''}" data-item="${x.id}" data-sid="${v.id}">${v.followed?'✓':'＋'}</button></div>`).join(''):'<div class="empty-idea">No reliable search terms yet. Use <b>Edit identity</b> to enter the real publication or product name.</div>'}
 ${has?`<div class="market-links"><a class="primary-market" target="_blank" rel="noopener noreferrer" href="${esc(fromJapanUrl(primary))}">Search FromJapan ↗</a>${['Mercari','Yahoo','Mandarake','Surugaya'].map(m=>`<a target="_blank" rel="noopener noreferrer" href="${esc(searchUrl(m,primary))}">${m} ↗</a>`).join('')}</div>`:''}
 </div><div class="card-footer"><span>${s.filter(z=>z.followed).length} saved searches ${info.confidence?`· ${Math.round(info.confidence*100)}% confidence`:''}</span>${x.trashed?'<span>In Trash</span>':`<button class="follow ${x.followed?'on':''}" data-id="${x.id}">${x.followed?'✓ Following':'＋ Follow item'}</button>`}</div></article>`;
}
function profileCard(p){let qty=p.itemIds?.length||0;let imgs=(p.examples||[]).slice(0,3).map(url=>`<img loading="lazy" src="${esc(url)}" alt="Imported item" onerror="this.style.display='none'">`).join('');
return `<article class="card profile-card"><div class="section-label">${esc(p.type||'PRODUCT')} · ${qty} ${qty===1?'purchase':'purchases'}</div><h3>${esc(p.name)}</h3>${imgs?`<div class="profile-photos">${imgs}</div>`:''}
 <div class="profile-query">Search: <b>${esc(p.query)}</b></div><div class="profile-meta">${p.yearMin?`${p.yearMin}${p.yearMax&&p.yearMax!==p.yearMin?'–'+p.yearMax:''} · `:''}${qty>1?'Grouped purchases · ':''}Confidence: ${Math.round((p.confidence||0)*100)}%</div>
 <div class="profile-actions"><a target="_blank" rel="noopener noreferrer" href="${esc(fromJapanUrl(p.query))}">FromJapan ↗</a><button class="identity-action profile-edit" data-profile="${p.id}">Edit search</button><button class="profile-follow ${p.followed?'on':''}" data-profile="${p.id}">${p.followed?'✓ Monitoring':'＋ Monitor profile'}</button></div></article>`;
}
function ideaCard(s){return `<article class="card idea-card"><div class="section-label">${esc(s.kind)} · ${s.relatedItems} related purchases</div><div class="query"><div class="query-text"><b>${esc(s.query)}</b><span class="translation">${esc(s.translation||'English translation unavailable')}</span></div><a href="${esc(fromJapanUrl(s.query))}" target="_blank" rel="noopener noreferrer">FromJapan ↗</a><button class="suggest-follow ${s.followed?'active':''}" data-item="${s.itemId}" data-sid="${s.id}">${s.followed?'✓':'＋'}</button></div></article>`}
function render(){let shown=visible.slice(0,limit);$('#cards').innerHTML=section==='ideas'?shown.map(ideaCard).join(''):section==='profiles'?shown.map(profileCard).join(''):shown.map(card).join('');$('#morewrap').style.display=limit<visible.length?'block':'none'}
async function load(){let j=await api('/api/items');items=j.items;collectionsData=await api('/api/v11/collections');let r=await api('/api/search-ideas');ideas=r.ideas;let p=await api('/api/search-profiles');profiles=p.profiles;stats();apply()}
$('#search').addEventListener('input',()=>{limit=36;apply()});$('#filter').addEventListener('change',()=>{limit=36;apply()});$('#sort').addEventListener('change',apply);$('#more').onclick=()=>{limit+=36;render()};$('#selectall').onchange=e=>{for(let x of visible)e.target.checked?selected.add(x.id):selected.delete(x.id);apply()};
$('#cards').addEventListener('change',e=>{if(e.target.classList.contains('pick')){e.target.checked?selected.add(e.target.dataset.id):selected.delete(e.target.dataset.id);$('#selectall').checked=visible.every(x=>selected.has(x.id))}});
$('#cards').addEventListener('click',async e=>{let b=e.target.closest('button');if(!b)return;try{if(b.classList.contains('identity-edit')){const x=items.find(x=>x.id===b.dataset.item);const current=x.identity||{};const query=prompt('Correct publication or product name (Japanese search term)',current.query||'');if(query===null)return;const type=prompt('Type: book, magazine, pamphlet, film, game, music, merchandise, other',current.type||'book');if(type===null)return;const english=prompt('English title (optional)',current.english||'');if(english===null)return;const groupWithSimilar=!!x.profileId&&profiles.find(p=>p.id===x.profileId)?.itemIds?.length>1&&confirm('Apply this correction to all purchases in the same search profile? Cancel = only this item.');const result=await api('/api/items/'+x.id+'/identity',{method:'PATCH',body:JSON.stringify({query,type,english,groupWithSimilar})});toast(`Updated identity for ${result.updated} item(s)`);await load();return;}if(b.classList.contains('verify-isbn')){const x=items.find(x=>x.id===b.dataset.item);b.disabled=true;const r=await api('/api/items/'+x.id+'/verify-isbn',{method:'POST',body:'{}'});toast('Verified against OpenBD: '+r.catalogue.title);await load();return;}if(b.classList.contains('profile-edit')){const p=profiles.find(p=>p.id===b.dataset.profile);let query=prompt('Search phrase for this profile',p.query);if(query===null)return;let name=prompt('Profile name',p.name);if(name===null)return;await api('/api/search-profiles/'+p.id,{method:'PATCH',body:JSON.stringify({query,name})});toast('Profile updated');await load();return;}if(b.classList.contains('profile-follow')){const p=profiles.find(p=>p.id===b.dataset.profile);await api('/api/search-profiles/'+p.id,{method:'PATCH',body:JSON.stringify({followed:!p.followed})});p.followed=!p.followed;render();toast(p.followed?'Monitoring profile':'Stopped monitoring profile');return;}if(b.classList.contains('image-edit')){let x=items.find(x=>x.id===b.dataset.image);let url=prompt('Paste a direct image URL, or leave blank to upload a JPG/PNG/WebP.',x.thumbnail?.startsWith('http')?x.thumbnail:'');if(url===null)return;if(!url.trim()){imageTarget=x.id;$('#imageUpload').click();return}if(url!==null){let result=await api('/api/items/'+x.id+'/image',{method:'PATCH',body:JSON.stringify({image:url.trim()||null})});x.thumbnail=result.thumbnail;render()}return}if(b.classList.contains('edit-translation')){let x=items.find(x=>x.id===b.dataset.item),s=b.dataset.sid?x.suggestions.find(s=>s.id===b.dataset.sid):null;let value=prompt('English translation',s?s.translation:x.translation);if(value!==null){if(s){await api(`/api/items/${x.id}/suggestions/${s.id}`,{method:'PATCH',body:JSON.stringify({translation:value})});s.translation=value}else{await api('/api/items/'+x.id,{method:'PATCH',body:JSON.stringify({translation:value})});x.translation=value}render()}return}if(b.classList.contains('copy')){await navigator.clipboard.writeText(b.dataset.query);toast('Search copied')}if(b.classList.contains('follow')){let x=items.find(x=>x.id===b.dataset.id);await api('/api/items/'+x.id,{method:'PATCH',body:JSON.stringify({followed:!x.followed})});x.followed=!x.followed;stats();apply()}if(b.classList.contains('suggest-follow')){let x=items.find(x=>x.id===b.dataset.item),s=x.suggestions.find(s=>s.id===b.dataset.sid);await api(`/api/items/${x.id}/suggestions/${s.id}`,{method:'PATCH',body:JSON.stringify({followed:!s.followed})});s.followed=!s.followed;for(const x of items)for(const v of x.suggestions)if(v.query===s.query)v.followed=s.followed;for(const idea of ideas)if(idea.query===s.query)idea.followed=s.followed;render()}}catch(err){toast(err.message)}});
async function bulk(followed){let ids=[...selected];if(!ids.length)return toast('Select some items first');try{await api('/api/bulk',{method:'POST',body:JSON.stringify({ids,followed})});for(let x of items)if(selected.has(x.id))x.followed=followed;selected.clear();stats();apply();toast(`${ids.length} items updated`)}catch(e){toast(e.message)}}$('#followSelected').onclick=()=>bulk(true);$('#unfollowSelected').onclick=()=>bulk(false);
async function trashSelected(trashed){let ids=[...selected];if(!ids.length)return toast('Select items first');if(!confirm(`${trashed?'Move':'Restore'} ${ids.length} items ${trashed?'to Trash':'from Trash'}?`))return;try{await api('/api/items/trash',{method:'POST',body:JSON.stringify({ids,trashed})});for(const x of items)if(selected.has(x.id)){x.trashed=trashed;if(trashed){x.followed=false;x.suggestions.forEach(s=>s.followed=false)}}selected.clear();stats();apply();toast(trashed?'Moved to Trash':'Restored')}catch(e){toast(e.message)}}
$('#trashSelected').onclick=()=>trashSelected(true);$('#restoreSelected').onclick=()=>trashSelected(false);
$('#deleteForever').onclick=async()=>{let ids=[...selected].filter(id=>items.find(x=>x.id===id)?.trashed);if(!ids.length)return toast('Select items in Trash first');if(!confirm(`Permanently delete ${ids.length} items? Reimporting history may add them again.`))return;try{await api('/api/items/permanent',{method:'DELETE',body:JSON.stringify({ids})});items=items.filter(x=>!ids.includes(x.id));selected.clear();stats();apply()}catch(e){toast(e.message)}};
$('#sectionNav').addEventListener('click',e=>{let b=e.target.closest('[data-section]');if(!b)return;section=b.dataset.section;selected.clear();limit=36;document.querySelectorAll('[data-section]').forEach(a=>a.classList.toggle('active',a===b));$('#trashSelected').hidden=section==='trash'||section==='profiles'||section==='ideas'||section==='library'||section==='sourcing';$('#restoreSelected').hidden=section!=='trash';$('#deleteForever').hidden=section!=='trash';$('#followSelected').hidden=section==='trash'||section==='profiles'||section==='ideas'||section==='library'||section==='sourcing';$('#unfollowSelected').hidden=section==='trash'||section==='profiles'||section==='ideas'||section==='library'||section==='sourcing';$('#monitorPanel').hidden=section!=='listings';$('#collectionPanel').hidden=section!=='library';$('#sourcingPanel').hidden=section!=='sourcing';$('#tastePanel').hidden=section!=='taste';document.querySelector('.toolbar').hidden=section==='listings'||section==='taste'||section==='sourcing';document.querySelector('.list-head').hidden=section==='listings'||section==='taste'||section==='sourcing'||section==='library';$('#cards').hidden=section==='listings'||section==='taste'||section==='sourcing'||section==='library';$('#morewrap').hidden=section==='listings'||section==='taste'||section==='sourcing'||section==='library';if(section==='listings')loadMonitor();if(section==='taste')loadCuration();if(section==='sourcing')loadSourcing();$('#selectall').disabled=section==='ideas'||section==='profiles';$('#aiIdentify').hidden=section==='trash'||section==='listings'||section==='ideas'||section==='profiles'||section==='taste'||section==='library'||section==='sourcing';$('#filter').hidden=section==='profiles'||section==='ideas'||section==='taste'||section==='library';$('#sort').hidden=section==='profiles'||section==='ideas'||section==='taste'||section==='library';apply()});
$('#language').onchange=e=>{language=e.target.value;render()};
$('#imageUpload').onchange=async e=>{let f=e.target.files[0];if(!f)return;if(f.size>800000){toast('Image too large. Resize to under 800 KB.');e.target.value='';return}let id=imageTarget||(selected.size===1?[...selected][0]:prompt('Select one item first, or paste its ID:'));imageTarget=null;if(!id)return;let x=items.find(x=>x.id===id);if(!x)return toast('Item ID not found');let reader=new FileReader();reader.onload=async()=>{try{let r=await api('/api/items/'+x.id+'/image',{method:'PATCH',body:JSON.stringify({image:reader.result})});x.thumbnail=r.thumbnail;render();toast('Image saved')}catch(err){toast(err.message)}};reader.readAsDataURL(f);e.target.value=''};

$('#file').onchange=async e=>{let file=e.target.files[0];if(!file)return;try{let result=await api('/api/import',{method:'POST',body:JSON.stringify({filename:file.name,content:await file.text()})});toast(`Imported ${result.added} new items, ${result.updated} already present`);await load()}catch(err){toast('Import error: '+err.message)}e.target.value=''};$('#export').onclick=()=>{location.href='/api/export'};load().catch(e=>toast('Unable to load: '+e.message));

function renderListings(){
 const q=$('#listingSearch').value.trim().toLowerCase(),market=$('#listingMarket').value,
  sort=$('#listingSort').value,filter=$('#listingFilter').value,theme=$('#listingTheme').value;
 const all=monitorData.listings||[];
 let rows=all.filter(x=>{
  const c=x.curation||{};
  return (market==='all'||x.market===market) && (filter==='all'||c.bucket===filter) &&
   (theme==='all'||(c.themes||[]).some(t=>t.id===theme)) &&
   (!q||[x.title,x.translation,x.query,x.market,c.reason,...(c.themes||[]).map(t=>t.name)].join(' ').toLowerCase().includes(q));
 });
 rows.sort((a,b)=>sort==='best'?((b.curation?.score||0)-(a.curation?.score||0)||String(b.firstSeen).localeCompare(String(a.firstSeen))):
  sort==='oldest'?String(a.firstSeen).localeCompare(String(b.firstSeen)):String(b.firstSeen).localeCompare(String(a.firstSeen)));
 const counts={relevant:0,review:0,excluded:0,dismissed:0};for(const x of all)if(x.curation?.bucket in counts)counts[x.curation.bucket]++;
 $('#listingBadge').textContent=counts.relevant;
 $('#monitorStatus').textContent=`${rows.length} shown · ${counts.relevant} recommended print · ${counts.review} to review · ${counts.excluded} excluded · ${counts.dismissed} dismissed · ${monitorData.running?'Checking now':'Idle'}`;
 $('#curationHint').textContent=filter==='relevant'?'Only high-confidence printed material with relevant themes is shown. Review uncertain items separately; some suitable books may need manual confirmation.':filter==='review'?'These items have unclear format or weak thematic relevance. Confirm print where appropriate, or exclude.':filter==='excluded'?'Known non-print objects are excluded from recommendations. Correct mistaken exclusions with “It is print”.':'';
 $('#monitorListings').innerHTML=rows.map(x=>{
  const c=x.curation||{},fmt=c.format||'review';
  const title=x.title&&!/^((Mercari|Yahoo) listing )/.test(x.title)?x.title:'Listing details unavailable';
  const english=x.translation||'English translation not available';let thumb=x.image||x.thumbnail||'';
  const valid=/^https:\/\//i.test(thumb),score=(c.score||0),tag=c.bucket||'review';
  const actions=fmt==='print'?`<button class="listing-feedback ${c.feedback==='like'?'is-on':''}" data-id="${esc(x.id)}" data-preference="like" title="Improve recommendations">${c.feedback==='like'?'✓ Interested':'♡ Interested'}</button><button class="listing-feedback ${c.feedback==='dislike'?'is-on':''}" data-id="${esc(x.id)}" data-preference="dislike">Not for me</button>`:
   `<button class="listing-format" data-id="${esc(x.id)}" data-format="print">✓ It is print</button>${fmt==='review'?`<button class="listing-format" data-id="${esc(x.id)}" data-format="not-print">Not print</button>`:''}`;
  const undo=(c.feedback||c.formatOverride)?`<button class="listing-clear" data-id="${esc(x.id)}">Reset feedback</button>`:'';
  return `<article class="listing-card ${esc(tag)}"><div class="listing-image">${valid?`<img loading="lazy" src="${esc(thumb)}" alt="Listing thumbnail" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="no-listing-image" hidden>Image unavailable</span>`:'<span class="no-listing-image">Image unavailable</span>'}</div><div class="listing-info"><div class="listing-eyebrow">${esc(x.market)} · Found ${esc((x.firstSeen||'').slice(0,10))} <span class="score-pill ${esc(tag)}">${esc(fmt==='print'?'Fit '+score+'/100':c.formatLabel||'Review')}</span></div><div class="listing-title">${esc(title)}</div><div class="listing-translation">${esc(english)}</div><div class="reason-line">${esc(c.reason||'Insufficient information')} ${c.stockMatch?'<span class="stock-indicator">Lock Books connection</span>':''}</div><div class="theme-tags">${(c.themes||[]).slice(0,3).map(t=>`<span>${esc(t.name)}</span>`).join('')}</div><div class="listing-query">Matched query: ${esc(x.query||'')}</div>${x.priceYen!=null?`<strong class="listing-price">¥${Number(x.priceYen).toLocaleString()}</strong>`:''}<div class="listing-actions"><a class="listing-primary" href="${esc(fromJapanUrl(x.query||title))}" target="_blank" rel="noopener noreferrer">Search FromJapan ↗</a><button class="copy-listing secondary" data-url="${esc(x.url)}">Copy URL</button><a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">Original ↗</a></div><div class="listing-actions listing-feedback-actions">${actions}${undo}</div></div></article>`;
 }).join('')||'<div class="listing-empty">No listings match these filters. Try Needs review, or enable more print-specific searches in Taste Profile.</div>';
 $('#monitorChecks').innerHTML=(monitorData.checks||[]).slice(0,24).map(c=>`<div>${esc((c.at||'').slice(0,16))} · ${esc(c.market)} · ${esc(c.status)} · ${esc(c.note)}</div>`).join('')||'No checks yet.';
}
async function loadMonitor(){try{monitorData=await api('/api/monitor');renderListings()}catch(e){$('#monitorStatus').textContent=e.message}}
['#listingSearch','#listingMarket','#listingSort','#listingFilter','#listingTheme'].forEach(id=>$(id).addEventListener(id==='#listingSearch'?'input':'change',renderListings));
$('#translateListings').onclick=async()=>{let b=$('#translateListings');b.disabled=true;try{let r=await api('/api/monitor/translate',{method:'POST',body:JSON.stringify({limit:25})});toast(`Translated ${r.translated} listing titles. ${r.remaining} still missing.`);await loadMonitor()}catch(e){toast(e.message)}finally{b.disabled=false}};
$('#runMonitor').onclick=async()=>{let b=$('#runMonitor');b.disabled=true;b.textContent='Checking…';try{let r=await api('/api/monitor/run',{method:'POST',body:'{}'});toast(`Checked ${r.attempted} searches; ${r.found} new links; ${r.errors} errors`)}catch(e){toast(e.message)}finally{b.disabled=false;b.textContent='↻ Check now';loadMonitor()}};
$('#monitorListings').addEventListener('click',async e=>{
 let b=e.target.closest('button');if(!b)return;
 if(b.classList.contains('copy-listing')){await navigator.clipboard.writeText(b.dataset.url);return toast('Listing URL copied')}
 const id=b.dataset.id;if(!id)return;
 let body={};
 if(b.classList.contains('listing-feedback'))body.preference=b.dataset.preference;
 else if(b.classList.contains('listing-format'))body.formatOverride=b.dataset.format;
 else if(b.classList.contains('listing-clear'))body={preference:null,formatOverride:null};
 else return;
 b.disabled=true;
 try{const r=await api('/api/monitor/listings/'+encodeURIComponent(id)+'/feedback',{method:'PATCH',body:JSON.stringify(body)});
  const row=monitorData.listings.find(x=>x.id===id);if(row)row.curation=r.listing.curation;
  // Feedback on one listing affects related themes too, so refresh all scores.
  await loadMonitor();if(curationData)await loadCuration();
  toast('Preference saved');
 }catch(err){toast(err.message);b.disabled=false}
});loadMonitor();

$('#translateMissing').onclick=async()=>{let b=$('#translateMissing');b.disabled=true;try{let r=await api('/api/translations/run',{method:'POST',body:JSON.stringify({limit:25})});toast(`Translated ${r.translated} titles. ${r.remaining} still missing.`);await load()}catch(e){toast(e.message)}finally{b.disabled=false}};

let recoveryPoll=null;
async function showRecovery(){
 try{const r=await api('/api/monitor/backfill/status');const b=$('#backfillListings');
 b.disabled=!!r.running;b.textContent=r.running?`Recovering ${r.checked}/${r.total}…`:'↻ Recover missing details';
 const label=$('#recoveryProgress');if(label)label.textContent=r.running?`Recovering images in background: ${r.checked}/${r.total} checked, ${r.updated} improved`:(r.finishedAt?`Last recovery: ${r.checked} checked, ${r.updated} improved. Unavailable images may be blocked.`:'');
 if(r.running){if(!recoveryPoll)recoveryPoll=setInterval(async()=>{await showRecovery();if(section==='listings')await loadMonitor()},5000)}
 else if(recoveryPoll){clearInterval(recoveryPoll);recoveryPoll=null;if(section==='listings')await loadMonitor()}
 }catch(e){console.warn('Recovery status:',e)}
}
$('#backfillListings').onclick=async()=>{try{await api('/api/monitor/backfill',{method:'POST',body:'{}'});await showRecovery()}catch(e){toast(e.message)}};
showRecovery();

let aiPoll=null;
async function pollAI(){try{const s=await api('/api/intelligence/status'),el=$('#aiProgress'),btn=$('#aiIdentify');if(!btn)return;
 btn.disabled=!!s.running;btn.textContent=s.running?'AI identifying…':'✧ AI identify unclear';
 el.textContent=s.running?`${s.checked}/${s.total} identified · ${s.updated} improved`:s.error?`AI: ${s.error}`:`${s.reviewCount} titles need review${s.enabled?'':' · optional API key not configured'}`;
 if(s.running&&!aiPoll)aiPoll=setInterval(pollAI,4000);
 if(!s.running&&aiPoll){clearInterval(aiPoll);aiPoll=null;await load();}
 }catch(e){console.warn('AI job status:',e)}}
$('#aiIdentify').onclick=async()=>{
 const chosen=[...selected];const msg=chosen.length?`Send ${chosen.length} selected item titles for AI identification? This may incur API costs.`:'Identify up to 24 unclear titles with AI? Titles are sent to your configured OpenAI API and usage may be billed.';
 if(!confirm(msg))return;
 try{const s=await api('/api/intelligence/run',{method:'POST',body:JSON.stringify(chosen.length?{ids:chosen,limit:40}:{limit:24})});toast(s.message||`Identifying ${s.count} titles in background`);await pollAI()}catch(e){toast(e.message)}
};
pollAI();

// v10 taste profile and curated discovery sources
async function loadCuration(){
 try{curationData=await api('/api/curation');const filter=$('#listingTheme'),old=filter.value;filter.innerHTML='<option value="all">All themes</option>'+curationData.themes.map(t=>`<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');filter.value=curationData.themes.some(t=>t.id===old)?old:'all';renderTaste();}
 catch(e){$('#tasteSummary').textContent='Taste profile unavailable: '+e.message}
}
function renderTaste(){if(!curationData)return;
 const d=curationData;
 $('#tasteSummary').innerHTML=`<div><strong>${d.catalogueCount}</strong><span>Reference stock titles</span></div><div><strong>${d.counts.relevant||0}</strong><span>Recommended print listings</span></div><div><strong>${d.counts.review||0}</strong><span>Need review</span></div><div><strong>${d.feedbackCount||0}</strong><span>Preferences recorded</span></div>`;
 $('#tasteThemes').innerHTML=d.themes.map(x=>`<span>${esc(x.name)}</span>`).join('');
 $('#tasteSearches').innerHTML=d.searches.map(x=>`<div class="taste-search"><label><input type="checkbox" data-curated-id="${esc(x.id)}" ${x.enabled?'checked':''}><span>${esc(x.query)}</span></label><small>${esc(d.themes.find(t=>t.id===x.theme)?.name||x.theme)}</small>${x.custom?`<button class="remove-curated" data-curated-id="${esc(x.id)}" title="Delete custom search">×</button>`:''}</div>`).join('');
 const select=$('#newCuratedTheme'),remember=select.value;
 select.innerHTML=d.themes.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');if(d.themes.some(x=>x.id===remember))select.value=remember;
 $('#tasteReferences').innerHTML=d.references.map(x=>`<a target="_blank" rel="noopener noreferrer" href="${esc(x.url)}"><b>${esc(x.name)}</b><span>${esc(x.details)}</span> ↗</a>`).join('');
 const note=d.catalogueError?`Last refresh failed: ${esc(d.catalogueError)}. Previous stock retained.`:`${esc(d.catalogueSource)}${d.catalogueSyncedAt?' · Refreshed '+esc(d.catalogueSyncedAt.slice(0,10)):''}`;
 $('#tasteSummary').insertAdjacentHTML('afterend',`<p class="taste-help" id="stockStatus">${note}</p>`);
 document.querySelectorAll('#stockStatus').forEach((el,i)=>{if(i>0)el.remove()});
 $('#discoveryAIStatus').textContent=d.aiEnabled?'Optional AI title-based classification and ranking enabled':'Set OPENAI_API_KEY in Railway to enable optional AI format review';
}
$('#tasteSearches').addEventListener('change',async e=>{const id=e.target.dataset.curatedId;if(!id)return;try{await api('/api/curation/searches/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify({enabled:e.target.checked})});await loadCuration();toast('Search preference saved')}catch(err){toast(err.message);e.target.checked=!e.target.checked}});
$('#tasteSearches').addEventListener('click',async e=>{const b=e.target.closest('.remove-curated');if(!b)return;try{await api('/api/curation/searches/'+encodeURIComponent(b.dataset.curatedId),{method:'DELETE'});await loadCuration()}catch(err){toast(err.message)}});
$('#addCuratedSearch').onclick=async()=>{const query=$('#newCuratedSearch').value.trim(),theme=$('#newCuratedTheme').value;try{await api('/api/curation/searches',{method:'POST',body:JSON.stringify({query,theme})});$('#newCuratedSearch').value='';await loadCuration();toast('Discovery search added')}catch(e){toast(e.message)}};
$('#syncCatalogue').onclick=async()=>{let b=$('#syncCatalogue');b.disabled=true;b.textContent='Refreshing…';try{const r=await api('/api/curation/sync',{method:'POST',body:'{}'});await loadCuration();await loadMonitor();toast(`${r.count} public catalogue titles loaded`)}catch(e){toast(e.message)}finally{b.disabled=false;b.textContent='↻ Refresh Lock Books catalogue'}};
$('#aiReviewListings').onclick=async()=>{if(!confirm('Send up to 16 uncertain marketplace titles to your configured OpenAI API for format classification and thematic ranking? API usage is billed separately.'))return;try{const r=await api('/api/curation/ai-review',{method:'POST',body:JSON.stringify({limit:16})});toast(r.started?`Reviewing ${r.count} unclear titles. Refresh the page to see results.`:r.message)}catch(e){toast(e.message)}};
loadCuration();


// Sourcebook v11: publication-level grouping. No destructive merging of orders.
function renderCollections(){
 const q=$('#search').value.trim().toLowerCase(),all=collectionsData.collections||[];
 const groups=all.filter(g=>(!duplicateOnly||g.count>1)&&(!q||[g.title,...g.purchases.map(p=>p.title)].join(' ').toLowerCase().includes(q)));
 const grouped=all.filter(g=>g.count>1);
 $('#collectionSummary').innerHTML=`<strong>${all.length} publications</strong><span>${collectionsData.purchases||0} purchase records kept</span><span>${grouped.length} multi-purchase groups</span>`;
 $('#viewDuplicates').textContent='Duplicates only: '+(duplicateOnly?'On':'Off');
 $('#collectionCards').innerHTML=groups.map(g=>`<article class="v11-collection">
 <div class="v11-collection-head">${g.thumbnail?`<img loading="lazy" src="${esc(g.thumbnail)}" alt="Book cover">`:''}<div><div class="section-label">${esc(g.type)} · ${g.count} ${g.count===1?'purchase':'purchases'}</div><h3>${esc(g.title)}</h3><small>${esc(g.reason)}</small><p>Recorded total ¥${Number(g.totalYen||0).toLocaleString()}${g.purchases.some(p=>p.priceYen==null)?' (some prices missing)':''}</p></div></div>
 <details ${g.count>1?'open':''}><summary>View ${g.count} original purchase record${g.count===1?'':'s'}</summary><div class="v11-purchases">${g.purchases.map(p=>`<label><input type="checkbox" class="v11-pick" value="${esc(p.id)}"><span><a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${esc(p.title)}</a> · ${p.priceYen!=null?'¥'+Number(p.priceYen).toLocaleString():'price unknown'}</span></label>`).join('')}</div><div class="v11-actions"><button class="secondary v11-separate" data-ids="${esc(g.itemIds.join(','))}">Separate checked</button><button class="secondary v11-reset" data-ids="${esc(g.itemIds.join(','))}">Reset grouping</button></div></details></article>`).join('')||'<p>No publications match this filter.</p>';
 const found=collectionsData.candidates||[];
 $('#candidateBox').innerHTML=found.length?`<details><summary><b>${found.length} possible duplicate matches</b> — review before grouping</summary><div class="v11-candidate-list">${found.slice(0,30).map(c=>`<div class="v11-candidate"><span><b>${esc(c.leftTitle)}</b> ↔ ${esc(c.rightTitle)} <small>Similarity ${c.score}%</small></span><button class="secondary v11-merge-candidate" data-left="${esc(c.left)}" data-right="${esc(c.right)}">Group together</button></div>`).join('')}</div></details>`:'';
}
$('#viewDuplicates').onclick=()=>{duplicateOnly=!duplicateOnly;renderCollections()};
$('#collectionPanel').addEventListener('click',async e=>{
 const b=e.target.closest('button');if(!b)return;
 try{
 if(b.classList.contains('v11-merge-candidate')){
  const ids=[b.dataset.left,b.dataset.right].flatMap(id=>collectionsData.collections.find(c=>c.id===id)?.itemIds||[]);
  if(!ids.length||!confirm(`Group ${ids.length} purchase records as one publication? Original purchases remain intact.`))return;
  const r=await api('/api/v11/collections/merge',{method:'POST',body:JSON.stringify({ids})});collectionsData=r.collections;renderCollections();toast('Grouped — originals preserved');return;
 }
 const box=b.closest('.v11-collection');const selectedIds=[...box.querySelectorAll('.v11-pick:checked')].map(x=>x.value);
 if(b.classList.contains('v11-separate')){
  if(!selectedIds.length)return toast('Tick purchases to separate first');const r=await api('/api/v11/collections/split',{method:'POST',body:JSON.stringify({ids:selectedIds})});collectionsData=r.collections;renderCollections();toast('Selected purchases separated');
 }else if(b.classList.contains('v11-reset')){
  const ids=b.dataset.ids.split(',');if(!confirm('Return these purchases to automatic matching?'))return;const r=await api('/api/v11/collections/reset',{method:'POST',body:JSON.stringify({ids})});collectionsData=r.collections;renderCollections();toast('Automatic matching restored');
 }
 }catch(error){toast(error.message)}
});
async function loadSourcing(){try{sourcingData=await api('/api/v11/opportunities');renderSourcing()}catch(e){$('#v11SourcingStatus').textContent=e.message}}
function renderSourcing(){if(!sourcingData)return;
 const d=sourcingData,s=d.settings;
 for(const [id,key] of [['v11Rate','gbpPerYen'],['v11Proxy','proxyFeeGbp'],['v11Post','postageGbp'],['v11Import','importCostGbp'],['v11Retail','targetRetailGbp']])$('#'+id).value=s[key];
 $('#v11SourcingStatus').textContent=`${d.listings.length} new-listing candidates ranked · ${d.related.length} research searches · Figures are estimates; verify live availability and import costs`;
 $('#v11Listings').innerHTML=d.listings.filter(x=>x.curation.bucket==='relevant').slice(0,24).map(x=>`<article class="v11-lead">${x.image?`<img loading="lazy" class="v11-lead-cover" src="${esc(x.image)}" alt="Listing photograph">`:''}<div class="section-label">${esc(x.market)} · FIT ${x.curation.score}/100</div><h3>${esc(x.title||'Title unavailable')}</h3><p>${esc(x.curation.reason||'')}</p>${x.seller?`<small>Seller: ${esc(x.seller)} · ${x.sellerHits} matching listings <button class="v11-seller" data-seller="${esc(x.seller)}" data-followed="${(d.favoriteSellers||[]).includes(x.seller)}">${(d.favoriteSellers||[]).includes(x.seller)?'★ Watching seller':'☆ Follow seller'}</button></small>`:''}${x.bundle.isBundle?`<div class="v11-pill">Possible book lot${x.bundle.quantity?' · '+x.bundle.quantity+' items':''}</div>`:''}${x.visualReason?`<p>Cover review: ${esc(x.visualReason)}</p>`:''}<div class="v11-finance">${x.economics.known?`¥${Number(x.priceYen).toLocaleString()} · Est. landed £${x.economics.landedCostGbp.toFixed(2)} · Gross profit £${x.economics.grossProfitGbp.toFixed(2)}`:'Price unknown · cannot calculate landed cost'}</div><div class="v11-actions"><a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">View original ↗</a><a href="${esc(fromJapanUrl(x.title||''))}" target="_blank" rel="noopener noreferrer">Find on FromJapan ↗</a></div></article>`).join('')||'<p>No eligible recommended listings yet. Check New Listings → Needs review; metadata extraction can be blocked by marketplaces.</p>';
 $('#v11Related').innerHTML=d.related.slice(0,60).map(x=>`<article class="v11-lead"><div class="section-label">${esc(x.kind)}</div><h3>${esc(x.query)}</h3><p>${esc(x.why)} · Inspired by ${esc(x.title)}</p><div class="v11-actions"><a href="${esc(fromJapanUrl(x.query))}" target="_blank" rel="noopener noreferrer">FromJapan ↗</a><a href="${esc(searchUrl('Surugaya',x.query))}" target="_blank" rel="noopener noreferrer">Suruga-ya ↗</a><a href="${esc(searchUrl('Mandarake',x.query))}" target="_blank" rel="noopener noreferrer">Mandarake ↗</a></div></article>`).join('')||'<p>Identify more publications to generate related research leads.</p>';
}
$('#v11SaveCosts').onclick=async()=>{
 const o={gbpPerYen:Number($('#v11Rate').value),proxyFeeGbp:Number($('#v11Proxy').value),postageGbp:Number($('#v11Post').value),importCostGbp:Number($('#v11Import').value),targetRetailGbp:Number($('#v11Retail').value)};
 try{await api('/api/v11/costs',{method:'PATCH',body:JSON.stringify(o)});await loadSourcing();toast('Buying assumptions saved')}catch(e){toast(e.message)}
};
$('#v11Refresh').onclick=()=>loadSourcing();
$('#v11Vision').onclick=async()=>{
 if(!confirm('Analyse up to 3 available marketplace photographs with the configured OpenAI API? This sends images to OpenAI and may incur API fees.'))return;
 try{const r=await api('/api/v11/vision/run',{method:'POST',body:JSON.stringify({limit:3})});toast(r.started?`Checking ${r.count} cover photographs; refresh after completion`:r.message)}catch(e){toast(e.message)}
};

$('#v11Listings').addEventListener('click',async e=>{const b=e.target.closest('.v11-seller');if(!b)return;
 try{const followed=b.dataset.followed!=='true';const r=await api('/api/v11/sellers',{method:'PATCH',body:JSON.stringify({seller:b.dataset.seller,followed})});sourcingData.favoriteSellers=r.favoriteSellers;renderSourcing();toast(followed?'Seller saved to watchlist':'Seller removed from watchlist')}
 catch(error){toast(error.message)}
});
