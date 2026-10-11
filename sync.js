// Magasin Scanner v4. Supabase REST + Auth, no third-party library.
'use strict';
(()=>{
const URL='https://pjssbnzsmapjtjmmobek.supabase.co';
const KEY='sb_publishable_Tlv2SK69oegW7DGAV_whiA_2-WCdJum';
const TOKENKEY='magasin-scanner-v4-session';
const $=id=>document.getElementById(id);
let session=null, ready=false, syncing=false, pending=false, deleted=[];
try{session=JSON.parse(localStorage.getItem(TOKENKEY)||'null')}catch{}
const status=(msg)=>{$('syncStatus').textContent=msg};
const counts=()=>db.customers.length+db.warehouses.length+db.orders.length;
async function request(path,method='GET',body=null,auth=true){
 const headers={'apikey':KEY,'Content-Type':'application/json'};
 if(auth&&session?.access_token)headers.Authorization='Bearer '+session.access_token;
 if(method==='POST'&&path.startsWith('/rest/'))headers.Prefer='resolution=merge-duplicates,return=minimal';
 const res=await fetch(URL+path,{method,headers,body:body===null?undefined:JSON.stringify(body)});
 let val=null;try{val=await res.json()}catch{}
 if(!res.ok)throw Error(val?.msg||val?.message||val?.error_description||`HTTP ${res.status}`);
 return val;
}
async function ensureSession(){
 if(!session)throw Error('Logga in först.');
 if(Date.now() < (session.expires_at||0)-90000)return;
 if(!session.refresh_token)throw Error('Sessionen har gått ut. Logga in igen.');
 const data=await request('/auth/v1/token?grant_type=refresh_token','POST',{refresh_token:session.refresh_token},false);
 setSession(data);
}
function setSession(s){session=s?{access_token:s.access_token,refresh_token:s.refresh_token,expires_at:Date.now()+((s.expires_in||3600)*1000)}:null;
 if(session)localStorage.setItem(TOKENKEY,JSON.stringify(session));else localStorage.removeItem(TOKENKEY);
}
async function signIn(signup=false){
 const email=$('authEmail').value.trim(),password=$('authPassword').value;
 if(!email||!password){status('Ange e-postadress och lösenord.');return}
 try{
 const endpoint=signup?'/auth/v1/signup':'/auth/v1/token?grant_type=password';
 const data=await request(endpoint,'POST',{email,password},false);
 if(!data.access_token){status('Kontrollera din e-post och bekräfta kontot innan du loggar in.');return}
 setSession(data);ready=false;
 status('Inloggad. Ta säkerhetskopia. Välj första överföring på huvudenheten eller hämta molndata på den andra enheten.');
 }catch(e){status('Inloggning misslyckades: '+e.message)}
}
const extraCustomer=c=>({contact:c.contact||'',number:c.number||''});
const extraWarehouse=w=>({width:w.width||'',depth:w.depth||'',height:w.height||'',roof:w.roof||'',lowRoof:w.lowRoof||'',floor:w.floor||'',markers:w.markers||''});
const extraOrder=o=>({number:o.number||'',date:o.date||'',material:o.material||'',status:o.status||'',density:o.density||'',volume:o.volume||'',notes:o.notes||''});
const rows={
 customers: c=>({id:c.id,name:c.name,contact_person:c.contact||null,email:c.email||null,phone:c.phone||null,address:c.address||null,extra:extraCustomer(c)}),
 warehouses:w=>({id:w.id,customer_id:w.customerId,name:w.name,width_m:w.width||null,depth_m:w.depth||null,height_m:w.height||null,roof_type:w.roof||'Plant',notes:w.markers||null,extra:extraWarehouse(w)}),
 orders:o=>({id:o.id,customer_id:o.customerId,warehouse_id:o.warehouseId||null,order_number:o.number||null,planned_date:o.date||null,status:o.status||'Planerad',notes:o.notes||null,extra:extraOrder(o)})
};
const fromRows={
 customers:r=>({id:r.id,name:r.name,contact:r.extra?.contact??r.contact_person??'',number:r.extra?.number??'',email:r.email||'',phone:r.phone||'',address:r.address||''}),
 warehouses:r=>({id:r.id,customerId:r.customer_id,name:r.name,width:r.extra?.width??r.width_m??'',depth:r.extra?.depth??r.depth_m??'',height:r.extra?.height??r.height_m??'',roof:r.extra?.roof??r.roof_type??'Plant',lowRoof:r.extra?.lowRoof??'',floor:r.extra?.floor??'Betong',markers:r.extra?.markers??r.notes??''}),
 orders:r=>({id:r.id,customerId:r.customer_id,warehouseId:r.warehouse_id||'',number:r.extra?.number??r.order_number??'',date:r.extra?.date??r.planned_date??'',material:r.extra?.material??'',status:r.extra?.status??r.status??'Planerad',density:r.extra?.density??'',volume:r.extra?.volume??'',notes:r.extra?.notes??r.notes??''})
};
async function readCloud(){await ensureSession();const out={};for(const [local,remote] of [['customers','customers'],['warehouses','warehouses'],['orders','orders']]){
 const arr=await request(`/rest/v1/${remote}?select=*`);out[local]=arr.map(fromRows[local]);}return out;
}
async function upsertAll(){await ensureSession();for(const collection of ['customers','warehouses','orders']){
 if(db[collection].length)await request('/rest/v1/'+collection+'?on_conflict=id','POST',db[collection].map(rows[collection]));
 }}
async function flushDeletes(){await ensureSession();while(deleted.length){const [col,id]=deleted[0];await request('/rest/v1/'+col+'?id=eq.'+encodeURIComponent(id),'DELETE');deleted.shift()}}
async function cloudChanged(){if(!ready||!session)return;pending=true;if(syncing)return;
 syncing=true;try{while(pending){pending=false;await upsertAll();await flushDeletes()}status('Synkroniserad med Supabase · '+new Date().toLocaleTimeString('sv-SE'))}
 catch(e){status('Synkronisering misslyckades. Lokala ändringar finns kvar: '+e.message)}finally{syncing=false}}
window.cloudChanged=cloudChanged;
window.cloudDeleted=(col,id)=>{if(ready)deleted.push([col,id])};
async function firstUpload(){if(!session){status('Logga in först.');return}
 try{const cloud=await readCloud();const remoteCount=Object.values(cloud).reduce((a,v)=>a+v.length,0);
 if(remoteCount&&!confirm('Molnet innehåller redan '+remoteCount+' poster. Uppladdning kan skriva över poster med samma ID. Fortsätta?'))return;
 if(!confirm('Har du exporterat en säkerhetskopia? Överför '+counts()+' lokala poster till molnet?'))return;
 await upsertAll();ready=true;status('Första överföring klar. Ändringar synkroniseras nu automatiskt.');
 }catch(e){status('Överföring misslyckades: '+e.message)}}
async function download(){if(!session){status('Logga in först.');return}
 if(counts()&&!confirm('Det finns '+counts()+' lokala poster. Hämta molndata och ERSÄTT de lokala posterna? Exportera en säkerhetskopia först.'))return;
 try{const cloud=await readCloud();db=cloud;localStorage.setItem('magasin-scanner-v3',JSON.stringify(db));renderAll();ready=true;status('Molnuppgifter hämtade. Automatisk synkronisering aktiv.');}
 catch(e){status('Kunde inte hämta: '+e.message)}}
async function syncNow(){if(!ready){status('Välj först ”Första överföring” eller ”Hämta molnuppgifter”.');return}await cloudChanged()}
$('loginBtn').onclick=()=>signIn(false);$('signupBtn').onclick=()=>signIn(true);
$('logoutBtn').onclick=()=>{ready=false;setSession(null);status('Utloggad. Lokala uppgifter finns kvar på den här enheten.');};
$('uploadBtn').onclick=firstUpload;$('downloadBtn').onclick=download;$('syncBtn').onclick=syncNow;
status(session?'Tidigare inloggning hittad. Välj överföring eller hämta molnuppgifter för att starta synkronisering.':'Inte inloggad. Lokala uppgifter finns kvar.');
})();
