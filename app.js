const STORE='taraloom_mobile_v5';
const BIN_STORE='taraloom_mobile_v5_bin';
const PROFILE_STORE='taraloom_profile_v2';
const CATALOG_STORE='taraloom_catalog_v1';
const STOCK_STORE='taraloom_stock_v1';
const CONNECTION_STORE='taraloom_connections_v1';
const INIT_STORE='taraloom_v5_initialized';
const $=id=>document.getElementById(id);

function readJson(key,fallback){try{const raw=localStorage.getItem(key);return raw?JSON.parse(raw):fallback}catch{return fallback}}
function esc(value=''){return String(value).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function today(){return new Date().toISOString().slice(0,10)}
function offsetDate(days){const d=new Date();d.setDate(d.getDate()+days);return d.toISOString().slice(0,10)}
function isoOffset(days,hours=0){const d=new Date(Date.now()+days*86400000+hours*3600000);return d.toISOString()}
function formatDate(value){if(!value)return 'Not set';return new Date(value+'T00:00:00').toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'})}
function money(value){return '₹'+Number(value||0).toLocaleString('en-IN',{maximumFractionDigits:0})}
function initials(name=''){return name.trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase()||'C'}
function isCompleted(o){return !!o.completedAt}
function displayStatus(o){return isCompleted(o)?'Completed':(o.status||'In Process')}
function paymentBalance(o){return Math.max(0,Number(o.payment?.total||0)-Number(o.payment?.advance||0))}
function firstVisual(o){return o.garmentImage||o.referenceImages?.[0]||o.sketch||o.finalImages?.[0]||''}
const MEASURE_META={bust:{label:'Bust / Chest',icon:'assets/measurements/bust.png'},waist:{label:'Waist',icon:'assets/measurements/waist.png'},hip:{label:'Hip',icon:'assets/measurements/hip.png'},shoulder:{label:'Shoulder',icon:'assets/measurements/shoulder.png'},sleeve:{label:'Sleeve',icon:'assets/measurements/sleeve.png'},length:{label:'Length',icon:'assets/measurements/length.png'}};
function measurementChipsHtml(m={}){const html=Object.entries(MEASURE_META).filter(([k])=>m?.[k]).map(([k,meta])=>`<span class="measure-chip-icon"><img src="${meta.icon}" alt=""><b>${esc(meta.label)}</b>${esc(m[k])}</span>`).join('');return html||'<span>No measurements</span>'}
async function srcToShareFile(src,namePrefix='image'){
  const safeSrc=canvasSafeSrc(src);
  const extension=(safeSrc.match(/\.([a-zA-Z0-9]+)(?:[?#].*)?$/)?.[1]||'png').toLowerCase();
  const mimeFromExt={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',svg:'image/svg+xml',webp:'image/webp',gif:'image/gif'}[extension]||'image/png';
  if(safeSrc.startsWith('data:')){
    const [meta,data]=safeSrc.split(',',2);
    const mime=(meta.match(/data:([^;]+)/)?.[1]||mimeFromExt);
    const binary=atob(data);
    const bytes=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
    return new File([bytes],`${namePrefix}.${mime.split('/') [1]||extension}`.replace('svg+xml','svg'),{type:mime});
  }
  if(CANVAS_SAFE_ASSETS[src]&&CANVAS_SAFE_ASSETS[src].startsWith('data:')) return srcToShareFile(CANVAS_SAFE_ASSETS[src],namePrefix);
  const res=await fetch(safeSrc);
  const blob=await res.blob();
  const fileExt=(blob.type.split('/')[1]||extension||'png').replace('svg+xml','svg');
  return new File([blob],`${namePrefix}.${fileExt}`,{type:blob.type||mimeFromExt});
}
async function srcToPngShareFile(src,namePrefix='image'){
  return new Promise((resolve,reject)=>{
    const im=new Image();
    im.onload=()=>{
      const max=1400,scale=Math.min(1,max/Math.max(im.naturalWidth||im.width,im.naturalHeight||im.height));
      const c=document.createElement('canvas');c.width=Math.max(1,Math.round((im.naturalWidth||im.width)*scale));c.height=Math.max(1,Math.round((im.naturalHeight||im.height)*scale));
      const x=c.getContext('2d');x.fillStyle='#ffffff';x.fillRect(0,0,c.width,c.height);x.drawImage(im,0,0,c.width,c.height);
      c.toBlob(blob=>blob?resolve(new File([blob],`${namePrefix}.png`,{type:'image/png'})):reject(new Error('Could not create PNG')),'image/png',.92);
    };
    im.onerror=()=>reject(new Error('Image could not load'));im.src=canvasSafeSrc(src);
  });
}
async function buildFinishedShareFiles(order){
  const photos=(order?.finalImages||[]).slice(0,4);
  const files=[];
  for(let i=0;i<photos.length;i++){
    try{files.push(await srcToShareFile(photos[i],`finished-photo-${i+1}`))}catch(err){console.warn('Share image skipped',err)}
  }
  return files;
}
function toast(msg){const t=$('toast');t.textContent=translateExact(String(msg));t.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove('show'),2200)}
function sanitizeIndianPhone(input){
  const digits=(input.value||'').replace(/\D/g,'').slice(0,10);input.value=digits;
  if(!digits||/^[6-9]\d{9}$/.test(digits)) input.setCustomValidity('');
  else input.setCustomValidity(translateExact('Enter a 10-digit mobile number starting with 6, 7, 8 or 9.'));
}
function validIndianPhone(value){return !value||/^[6-9]\d{9}$/.test(String(value).trim())}
function checkPhoneInput(input){sanitizeIndianPhone(input);if(!validIndianPhone(input.value)){input.reportValidity();return false}return true}

let oldProfile=readJson('taraloom_profile_v1',null);
let profile=readJson(PROFILE_STORE,oldProfile||{business:'',name:'',phone:'',language:'English',details:'',savedAt:''});
let orders=readJson(STORE,[]);
let deleted=readJson(BIN_STORE,[]);
let customCatalog=readJson(CATALOG_STORE,[]);
let shopStock=readJson(STOCK_STORE,[]);
let connections=readJson(CONNECTION_STORE,[]);
let orderMode='current',filter='all',todayOnly=false,catalogFilter='all',activeDrawId='',activeDrawMode='sketch',activeReferenceIndex=-1,drawing=false,referenceImages=[],formSketchData='',formGarmentImage='',profileEditOpen=false;
let catalogFileQueue=[],pendingCatalogStyle=null;


// Inline fallbacks keep the sketch canvas exportable even when the prototype is opened directly from index.html.
const CANVAS_SAFE_ASSETS={"assets/styles/style01.svg":"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzNjAiIGhlaWdodD0iNDIwIiB2aWV3Qm94PSIwIDAgMzYwIDQyMCI+CjxyZWN0IHdpZHRoPSIzNjAiIGhlaWdodD0iNDIwIiByeD0iMjgiIGZpbGw9IiNmMmU1ZDgiLz4KPGNpcmNsZSBjeD0iMzAwIiBjeT0iNjIiIHI9IjM0IiBmaWxsPSIjZmZmZmZmIiBvcGFjaXR5PSIuMzUiLz4KPHBhdGggZD0iTTgwIDk2IEMxMTAgODIsMTMwIDc0LDE1MCA3MCBDMTU4IDkwLDE3MCAxMTMsMTgwIDExMyBDMTkwIDExMywyMDIgOTAsMjEwIDcwIEMyMzAgNzQsMjUwIDgyLDI4MCA5NiBMMjk2IDE2NSBMMjU1IDE3OCBMMjM4IDE0NSBMMjUwIDMyOCBDMjIwIDM2NiwxNDAgMzY2LDExMCAzMjggTDEyMiAxNDUgTDEwNSAxNzggTDY0IDE2NSBaIiBmaWxsPSIjZmZmZGY5IiBzdHJva2U9IiMyZjZmNjUiIHN0cm9rZS13aWR0aD0iNSIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8cGF0aCBkPSJNMTQ1IDc4IEMxNTAgMTEyLDE2NCAxMjgsMTgwIDEyOCBDMTk2IDEyOCwyMTAgMTEyLDIxNSA3OCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMmY2ZjY1IiBzdHJva2Utd2lkdGg9IjQiLz4KPHBhdGggZD0iTTExMiAyMzAgQzE0NSAyNDIsMjE1IDI0MiwyNDggMjMwIiBmaWxsPSJub25lIiBzdHJva2U9IiMyZjZmNjUiIHN0cm9rZS13aWR0aD0iMyIgc3Ryb2tlLWRhc2hhcnJheT0iOCA3IiBvcGFjaXR5PSIuNyIvPgo8cGF0aCBkPSJNMTIyIDE0NSBDMTU1IDE2NCwyMDUgMTY0LDIzOCAxNDUiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzJmNmY2NSIgc3Ryb2tlLXdpZHRoPSIzIiBvcGFjaXR5PSIuNTUiLz4KPHRleHQgeD0iMjQiIHk9IjM5MiIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjE4IiBmb250LXdlaWdodD0iNzAwIiBmaWxsPSIjMmY2ZjY1Ij5CbG91c2UgQmFjazwvdGV4dD4KPC9zdmc+","assets/styles/style02.svg":"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzNjAiIGhlaWdodD0iNTIwIiB2aWV3Qm94PSIwIDAgMzYwIDUyMCI+CjxyZWN0IHdpZHRoPSIzNjAiIGhlaWdodD0iNTIwIiByeD0iMjgiIGZpbGw9IiNlN2VmZTkiLz4KPGNpcmNsZSBjeD0iMzAwIiBjeT0iNjIiIHI9IjM0IiBmaWxsPSIjZmZmZmZmIiBvcGFjaXR5PSIuMzUiLz4KPHBhdGggZD0iTTgwIDk2IEMxMTAgODIsMTMwIDc0LDE1MCA3MCBDMTU4IDkwLDE3MCAxMjEsMTgwIDEyMSBDMTkwIDEyMSwyMDIgOTAsMjEwIDcwIEMyMzAgNzQsMjUwIDgyLDI4MCA5NiBMMjk4IDE2NSBMMjU1IDE3OCBMMjM4IDE0NSBMMjUwIDQyOCBDMjIwIDQ2NiwxNDAgNDY2LDExMCA0MjggTDEyMiAxNDUgTDEwNSAxNzggTDYyIDE2NSBaIiBmaWxsPSIjZmZmZGY5IiBzdHJva2U9IiM2ODUzNGEiIHN0cm9rZS13aWR0aD0iNSIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8cGF0aCBkPSJNMTQ1IDc4IEMxNTAgMTEyLDE2NCAxMjgsMTgwIDEyOCBDMTk2IDEyOCwyMTAgMTEyLDIxNSA3OCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNjg1MzRhIiBzdHJva2Utd2lkdGg9IjQiLz4KPHBhdGggZD0iTTExMiAyMzAgQzE0NSAyNDIsMjE1IDI0MiwyNDggMjMwIiBmaWxsPSJub25lIiBzdHJva2U9IiM2ODUzNGEiIHN0cm9rZS13aWR0aD0iMyIgc3Ryb2tlLWRhc2hhcnJheT0iOCA3IiBvcGFjaXR5PSIuNyIvPgo8cGF0aCBkPSJNMTIyIDE0NSBDMTU1IDE2NCwyMDUgMTY0LDIzOCAxNDUiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzY4NTM0YSIgc3Ryb2tlLXdpZHRoPSIzIiBvcGFjaXR5PSIuNTUiLz4KPHRleHQgeD0iMjQiIHk9IjQ5MiIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjE4IiBmb250LXdlaWdodD0iNzAwIiBmaWxsPSIjNjg1MzRhIj5LdXJ0aSBOZWNrPC90ZXh0Pgo8L3N2Zz4=","assets/styles/style03.svg":"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzNjAiIGhlaWdodD0iNDcwIiB2aWV3Qm94PSIwIDAgMzYwIDQ3MCI+CjxyZWN0IHdpZHRoPSIzNjAiIGhlaWdodD0iNDcwIiByeD0iMjgiIGZpbGw9IiNmM2UxZTEiLz4KPGNpcmNsZSBjeD0iMzAwIiBjeT0iNjIiIHI9IjM0IiBmaWxsPSIjZmZmZmZmIiBvcGFjaXR5PSIuMzUiLz4KPHBhdGggZD0iTTgwIDk2IEMxMTAgODIsMTMwIDc0LDE1MCA3MCBDMTU4IDkwLDE3MCAxMjksMTgwIDEyOSBDMTkwIDEyOSwyMDIgOTAsMjEwIDcwIEMyMzAgNzQsMjUwIDgyLDI4MCA5NiBMMjkzIDE2NSBMMjU1IDE3OCBMMjM4IDE0NSBMMjUwIDM3OCBDMjIwIDQxNiwxNDAgNDE2LDExMCAzNzggTDEyMiAxNDUgTDEwNSAxNzggTDY3IDE2NSBaIiBmaWxsPSIjZmZmZGY5IiBzdHJva2U9IiM4YzVjNjEiIHN0cm9rZS13aWR0aD0iNSIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8cGF0aCBkPSJNMTQ1IDc4IEMxNTAgMTEyLDE2NCAxMjgsMTgwIDEyOCBDMTk2IDEyOCwyMTAgMTEyLDIxNSA3OCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjOGM1YzYxIiBzdHJva2Utd2lkdGg9IjQiLz4KPHBhdGggZD0iTTExMiAyMzAgQzE0NSAyNDIsMjE1IDI0MiwyNDggMjMwIiBmaWxsPSJub25lIiBzdHJva2U9IiM4YzVjNjEiIHN0cm9rZS13aWR0aD0iMyIgc3Ryb2tlLWRhc2hhcnJheT0iOCA3IiBvcGFjaXR5PSIuNyIvPgo8cGF0aCBkPSJNMTIyIDE0NSBDMTU1IDE2NCwyMDUgMTY0LDIzOCAxNDUiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzhjNWM2MSIgc3Ryb2tlLXdpZHRoPSIzIiBvcGFjaXR5PSIuNTUiLz4KPHRleHQgeD0iMjQiIHk9IjQ0MiIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjE4IiBmb250LXdlaWdodD0iNzAwIiBmaWxsPSIjOGM1YzYxIj5MZWhlbmdhIFNldDwvdGV4dD4KPC9zdmc+","assets/styles/style04.svg":"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzNjAiIGhlaWdodD0iNjAwIiB2aWV3Qm94PSIwIDAgMzYwIDYwMCI+CjxyZWN0IHdpZHRoPSIzNjAiIGhlaWdodD0iNjAwIiByeD0iMjgiIGZpbGw9IiNlOGUzZjEiLz4KPGNpcmNsZSBjeD0iMzAwIiBjeT0iNjIiIHI9IjM0IiBmaWxsPSIjZmZmZmZmIiBvcGFjaXR5PSIuMzUiLz4KPHBhdGggZD0iTTgwIDk2IEMxMTAgODIsMTMwIDc0LDE1MCA3MCBDMTU4IDkwLDE3MCAxMDUsMTgwIDEwNSBDMTkwIDEwNSwyMDIgOTAsMjEwIDcwIEMyMzAgNzQsMjUwIDgyLDI4MCA5NiBMMjk2IDE2NSBMMjU1IDE3OCBMMjM4IDE0NSBMMjUwIDUwOCBDMjIwIDU0NiwxNDAgNTQ2LDExMCA1MDggTDEyMiAxNDUgTDEwNSAxNzggTDY0IDE2NSBaIiBmaWxsPSIjZmZmZGY5IiBzdHJva2U9IiM2MjVhN2EiIHN0cm9rZS13aWR0aD0iNSIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8cGF0aCBkPSJNMTQ1IDc4IEMxNTAgMTEyLDE2NCAxMjgsMTgwIDEyOCBDMTk2IDEyOCwyMTAgMTEyLDIxNSA3OCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNjI1YTdhIiBzdHJva2Utd2lkdGg9IjQiLz4KPHBhdGggZD0iTTExMiAyMzAgQzE0NSAyNDIsMjE1IDI0MiwyNDggMjMwIiBmaWxsPSJub25lIiBzdHJva2U9IiM2MjVhN2EiIHN0cm9rZS13aWR0aD0iMyIgc3Ryb2tlLWRhc2hhcnJheT0iOCA3IiBvcGFjaXR5PSIuNyIvPgo8cGF0aCBkPSJNMTIyIDE0NSBDMTU1IDE2NCwyMDUgMTY0LDIzOCAxNDUiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzYyNWE3YSIgc3Ryb2tlLXdpZHRoPSIzIiBvcGFjaXR5PSIuNTUiLz4KPHRleHQgeD0iMjQiIHk9IjU3MiIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjE4IiBmb250LXdlaWdodD0iNzAwIiBmaWxsPSIjNjI1YTdhIj5Hb3duIERyYXBlPC90ZXh0Pgo8L3N2Zz4=","assets/styles/style05.svg":"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzNjAiIGhlaWdodD0iNDQwIiB2aWV3Qm94PSIwIDAgMzYwIDQ0MCI+CjxyZWN0IHdpZHRoPSIzNjAiIGhlaWdodD0iNDQwIiByeD0iMjgiIGZpbGw9IiNmMWVhZDIiLz4KPGNpcmNsZSBjeD0iMzAwIiBjeT0iNjIiIHI9IjM0IiBmaWxsPSIjZmZmZmZmIiBvcGFjaXR5PSIuMzUiLz4KPHBhdGggZD0iTTgwIDk2IEMxMTAgODIsMTMwIDc0LDE1MCA3MCBDMTU4IDkwLDE3MCAxMTMsMTgwIDExMyBDMTkwIDExMywyMDIgOTAsMjEwIDcwIEMyMzAgNzQsMjUwIDgyLDI4MCA5NiBMMjk4IDE2NSBMMjU1IDE3OCBMMjM4IDE0NSBMMjUwIDM0OCBDMjIwIDM4NiwxNDAgMzg2LDExMCAzNDggTDEyMiAxNDUgTDEwNSAxNzggTDYyIDE2NSBaIiBmaWxsPSIjZmZmZGY5IiBzdHJva2U9IiM2YTY2NDEiIHN0cm9rZS13aWR0aD0iNSIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8cGF0aCBkPSJNMTQ1IDc4IEMxNTAgMTEyLDE2NCAxMjgsMTgwIDEyOCBDMTk2IDEyOCwyMTAgMTEyLDIxNSA3OCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNmE2NjQxIiBzdHJva2Utd2lkdGg9IjQiLz4KPHBhdGggZD0iTTExMiAyMzAgQzE0NSAyNDIsMjE1IDI0MiwyNDggMjMwIiBmaWxsPSJub25lIiBzdHJva2U9IiM2YTY2NDEiIHN0cm9rZS13aWR0aD0iMyIgc3Ryb2tlLWRhc2hhcnJheT0iOCA3IiBvcGFjaXR5PSIuNyIvPgo8cGF0aCBkPSJNMTIyIDE0NSBDMTU1IDE2NCwyMDUgMTY0LDIzOCAxNDUiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzZhNjY0MSIgc3Ryb2tlLXdpZHRoPSIzIiBvcGFjaXR5PSIuNTUiLz4KPHRleHQgeD0iMjQiIHk9IjQxMiIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjE4IiBmb250LXdlaWdodD0iNzAwIiBmaWxsPSIjNmE2NjQxIj5TbGVldmUgRGV0YWlsPC90ZXh0Pgo8L3N2Zz4=","assets/styles/style06.svg":"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzNjAiIGhlaWdodD0iNTYwIiB2aWV3Qm94PSIwIDAgMzYwIDU2MCI+CjxyZWN0IHdpZHRoPSIzNjAiIGhlaWdodD0iNTYwIiByeD0iMjgiIGZpbGw9IiNkZWVjZWMiLz4KPGNpcmNsZSBjeD0iMzAwIiBjeT0iNjIiIHI9IjM0IiBmaWxsPSIjZmZmZmZmIiBvcGFjaXR5PSIuMzUiLz4KPHBhdGggZD0iTTgwIDk2IEMxMTAgODIsMTMwIDc0LDE1MCA3MCBDMTU4IDkwLDE3MCAxMjEsMTgwIDEyMSBDMTkwIDEyMSwyMDIgOTAsMjEwIDcwIEMyMzAgNzQsMjUwIDgyLDI4MCA5NiBMMjkzIDE2NSBMMjU1IDE3OCBMMjM4IDE0NSBMMjUwIDQ2OCBDMjIwIDUwNiwxNDAgNTA2LDExMCA0NjggTDEyMiAxNDUgTDEwNSAxNzggTDY3IDE2NSBaIiBmaWxsPSIjZmZmZGY5IiBzdHJva2U9IiM0MTY5NmQiIHN0cm9rZS13aWR0aD0iNSIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8cGF0aCBkPSJNMTQ1IDc4IEMxNTAgMTEyLDE2NCAxMjgsMTgwIDEyOCBDMTk2IDEyOCwyMTAgMTEyLDIxNSA3OCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNDE2OTZkIiBzdHJva2Utd2lkdGg9IjQiLz4KPHBhdGggZD0iTTExMiAyMzAgQzE0NSAyNDIsMjE1IDI0MiwyNDggMjMwIiBmaWxsPSJub25lIiBzdHJva2U9IiM0MTY5NmQiIHN0cm9rZS13aWR0aD0iMyIgc3Ryb2tlLWRhc2hhcnJheT0iOCA3IiBvcGFjaXR5PSIuNyIvPgo8cGF0aCBkPSJNMTIyIDE0NSBDMTU1IDE2NCwyMDUgMTY0LDIzOCAxNDUiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzQxNjk2ZCIgc3Ryb2tlLXdpZHRoPSIzIiBvcGFjaXR5PSIuNTUiLz4KPHRleHQgeD0iMjQiIHk9IjUzMiIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjE4IiBmb250LXdlaWdodD0iNzAwIiBmaWxsPSIjNDE2OTZkIj5BbmFya2FsaTwvdGV4dD4KPC9zdmc+","assets/styles/style07.svg":"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzNjAiIGhlaWdodD0iNDIwIiB2aWV3Qm94PSIwIDAgMzYwIDQyMCI+CjxyZWN0IHdpZHRoPSIzNjAiIGhlaWdodD0iNDIwIiByeD0iMjgiIGZpbGw9IiNmMmU1ZDgiLz4KPGNpcmNsZSBjeD0iMzAwIiBjeT0iNjIiIHI9IjM0IiBmaWxsPSIjZmZmZmZmIiBvcGFjaXR5PSIuMzUiLz4KPHBhdGggZD0iTTgwIDk2IEMxMTAgODIsMTMwIDc0LDE1MCA3MCBDMTU4IDkwLDE3MCAxMjksMTgwIDEyOSBDMTkwIDEyOSwyMDIgOTAsMjEwIDcwIEMyMzAgNzQsMjUwIDgyLDI4MCA5NiBMMjk2IDE2NSBMMjU1IDE3OCBMMjM4IDE0NSBMMjUwIDMyOCBDMjIwIDM2NiwxNDAgMzY2LDExMCAzMjggTDEyMiAxNDUgTDEwNSAxNzggTDY0IDE2NSBaIiBmaWxsPSIjZmZmZGY5IiBzdHJva2U9IiMyZjZmNjUiIHN0cm9rZS13aWR0aD0iNSIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8cGF0aCBkPSJNMTQ1IDc4IEMxNTAgMTEyLDE2NCAxMjgsMTgwIDEyOCBDMTk2IDEyOCwyMTAgMTEyLDIxNSA3OCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMmY2ZjY1IiBzdHJva2Utd2lkdGg9IjQiLz4KPHBhdGggZD0iTTExMiAyMzAgQzE0NSAyNDIsMjE1IDI0MiwyNDggMjMwIiBmaWxsPSJub25lIiBzdHJva2U9IiMyZjZmNjUiIHN0cm9rZS13aWR0aD0iMyIgc3Ryb2tlLWRhc2hhcnJheT0iOCA3IiBvcGFjaXR5PSIuNyIvPgo8cGF0aCBkPSJNMTIyIDE0NSBDMTU1IDE2NCwyMDUgMTY0LDIzOCAxNDUiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzJmNmY2NSIgc3Ryb2tlLXdpZHRoPSIzIiBvcGFjaXR5PSIuNTUiLz4KPHRleHQgeD0iMjQiIHk9IjM5MiIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjE4IiBmb250LXdlaWdodD0iNzAwIiBmaWxsPSIjMmY2ZjY1Ij5Cb2F0IE5lY2s8L3RleHQ+Cjwvc3ZnPg==","assets/styles/style08.svg":"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzNjAiIGhlaWdodD0iNTIwIiB2aWV3Qm94PSIwIDAgMzYwIDUyMCI+CjxyZWN0IHdpZHRoPSIzNjAiIGhlaWdodD0iNTIwIiByeD0iMjgiIGZpbGw9IiNlN2VmZTkiLz4KPGNpcmNsZSBjeD0iMzAwIiBjeT0iNjIiIHI9IjM0IiBmaWxsPSIjZmZmZmZmIiBvcGFjaXR5PSIuMzUiLz4KPHBhdGggZD0iTTgwIDk2IEMxMTAgODIsMTMwIDc0LDE1MCA3MCBDMTU4IDkwLDE3MCAxMDUsMTgwIDEwNSBDMTkwIDEwNSwyMDIgOTAsMjEwIDcwIEMyMzAgNzQsMjUwIDgyLDI4MCA5NiBMMjk4IDE2NSBMMjU1IDE3OCBMMjM4IDE0NSBMMjUwIDQyOCBDMjIwIDQ2NiwxNDAgNDY2LDExMCA0MjggTDEyMiAxNDUgTDEwNSAxNzggTDYyIDE2NSBaIiBmaWxsPSIjZmZmZGY5IiBzdHJva2U9IiM2ODUzNGEiIHN0cm9rZS13aWR0aD0iNSIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8cGF0aCBkPSJNMTQ1IDc4IEMxNTAgMTEyLDE2NCAxMjgsMTgwIDEyOCBDMTk2IDEyOCwyMTAgMTEyLDIxNSA3OCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNjg1MzRhIiBzdHJva2Utd2lkdGg9IjQiLz4KPHBhdGggZD0iTTExMiAyMzAgQzE0NSAyNDIsMjE1IDI0MiwyNDggMjMwIiBmaWxsPSJub25lIiBzdHJva2U9IiM2ODUzNGEiIHN0cm9rZS13aWR0aD0iMyIgc3Ryb2tlLWRhc2hhcnJheT0iOCA3IiBvcGFjaXR5PSIuNyIvPgo8cGF0aCBkPSJNMTIyIDE0NSBDMTU1IDE2NCwyMDUgMTY0LDIzOCAxNDUiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzY4NTM0YSIgc3Ryb2tlLXdpZHRoPSIzIiBvcGFjaXR5PSIuNTUiLz4KPHRleHQgeD0iMjQiIHk9IjQ5MiIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjE4IiBmb250LXdlaWdodD0iNzAwIiBmaWxsPSIjNjg1MzRhIj5QcmluY2VzcyBDdXQ8L3RleHQ+Cjwvc3ZnPg==","assets/styles/style09.svg":"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzNjAiIGhlaWdodD0iNDcwIiB2aWV3Qm94PSIwIDAgMzYwIDQ3MCI+CjxyZWN0IHdpZHRoPSIzNjAiIGhlaWdodD0iNDcwIiByeD0iMjgiIGZpbGw9IiNmM2UxZTEiLz4KPGNpcmNsZSBjeD0iMzAwIiBjeT0iNjIiIHI9IjM0IiBmaWxsPSIjZmZmZmZmIiBvcGFjaXR5PSIuMzUiLz4KPHBhdGggZD0iTTgwIDk2IEMxMTAgODIsMTMwIDc0LDE1MCA3MCBDMTU4IDkwLDE3MCAxMTMsMTgwIDExMyBDMTkwIDExMywyMDIgOTAsMjEwIDcwIEMyMzAgNzQsMjUwIDgyLDI4MCA5NiBMMjkzIDE2NSBMMjU1IDE3OCBMMjM4IDE0NSBMMjUwIDM3OCBDMjIwIDQxNiwxNDAgNDE2LDExMCAzNzggTDEyMiAxNDUgTDEwNSAxNzggTDY3IDE2NSBaIiBmaWxsPSIjZmZmZGY5IiBzdHJva2U9IiM4YzVjNjEiIHN0cm9rZS13aWR0aD0iNSIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8cGF0aCBkPSJNMTQ1IDc4IEMxNTAgMTEyLDE2NCAxMjgsMTgwIDEyOCBDMTk2IDEyOCwyMTAgMTEyLDIxNSA3OCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjOGM1YzYxIiBzdHJva2Utd2lkdGg9IjQiLz4KPHBhdGggZD0iTTExMiAyMzAgQzE0NSAyNDIsMjE1IDI0MiwyNDggMjMwIiBmaWxsPSJub25lIiBzdHJva2U9IiM4YzVjNjEiIHN0cm9rZS13aWR0aD0iMyIgc3Ryb2tlLWRhc2hhcnJheT0iOCA3IiBvcGFjaXR5PSIuNyIvPgo8cGF0aCBkPSJNMTIyIDE0NSBDMTU1IDE2NCwyMDUgMTY0LDIzOCAxNDUiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzhjNWM2MSIgc3Ryb2tlLXdpZHRoPSIzIiBvcGFjaXR5PSIuNTUiLz4KPHRleHQgeD0iMjQiIHk9IjQ0MiIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjE4IiBmb250LXdlaWdodD0iNzAwIiBmaWxsPSIjOGM1YzYxIj5QZXBsdW0gQmxvdXNlPC90ZXh0Pgo8L3N2Zz4=","assets/styles/style10.svg":"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzNjAiIGhlaWdodD0iNjAwIiB2aWV3Qm94PSIwIDAgMzYwIDYwMCI+CjxyZWN0IHdpZHRoPSIzNjAiIGhlaWdodD0iNjAwIiByeD0iMjgiIGZpbGw9IiNlOGUzZjEiLz4KPGNpcmNsZSBjeD0iMzAwIiBjeT0iNjIiIHI9IjM0IiBmaWxsPSIjZmZmZmZmIiBvcGFjaXR5PSIuMzUiLz4KPHBhdGggZD0iTTgwIDk2IEMxMTAgODIsMTMwIDc0LDE1MCA3MCBDMTU4IDkwLDE3MCAxMjEsMTgwIDEyMSBDMTkwIDEyMSwyMDIgOTAsMjEwIDcwIEMyMzAgNzQsMjUwIDgyLDI4MCA5NiBMMjk2IDE2NSBMMjU1IDE3OCBMMjM4IDE0NSBMMjUwIDUwOCBDMjIwIDU0NiwxNDAgNTQ2LDExMCA1MDggTDEyMiAxNDUgTDEwNSAxNzggTDY0IDE2NSBaIiBmaWxsPSIjZmZmZGY5IiBzdHJva2U9IiM2MjVhN2EiIHN0cm9rZS13aWR0aD0iNSIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8cGF0aCBkPSJNMTQ1IDc4IEMxNTAgMTEyLDE2NCAxMjgsMTgwIDEyOCBDMTk2IDEyOCwyMTAgMTEyLDIxNSA3OCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNjI1YTdhIiBzdHJva2Utd2lkdGg9IjQiLz4KPHBhdGggZD0iTTExMiAyMzAgQzE0NSAyNDIsMjE1IDI0MiwyNDggMjMwIiBmaWxsPSJub25lIiBzdHJva2U9IiM2MjVhN2EiIHN0cm9rZS13aWR0aD0iMyIgc3Ryb2tlLWRhc2hhcnJheT0iOCA3IiBvcGFjaXR5PSIuNyIvPgo8cGF0aCBkPSJNMTIyIDE0NSBDMTU1IDE2NCwyMDUgMTY0LDIzOCAxNDUiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzYyNWE3YSIgc3Ryb2tlLXdpZHRoPSIzIiBvcGFjaXR5PSIuNTUiLz4KPHRleHQgeD0iMjQiIHk9IjU3MiIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjE4IiBmb250LXdlaWdodD0iNzAwIiBmaWxsPSIjNjI1YTdhIj5Db2xsYXIgS3VydGk8L3RleHQ+Cjwvc3ZnPg==","assets/styles/style11.svg":"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzNjAiIGhlaWdodD0iNDQwIiB2aWV3Qm94PSIwIDAgMzYwIDQ0MCI+CjxyZWN0IHdpZHRoPSIzNjAiIGhlaWdodD0iNDQwIiByeD0iMjgiIGZpbGw9IiNmMWVhZDIiLz4KPGNpcmNsZSBjeD0iMzAwIiBjeT0iNjIiIHI9IjM0IiBmaWxsPSIjZmZmZmZmIiBvcGFjaXR5PSIuMzUiLz4KPHBhdGggZD0iTTgwIDk2IEMxMTAgODIsMTMwIDc0LDE1MCA3MCBDMTU4IDkwLDE3MCAxMjksMTgwIDEyOSBDMTkwIDEyOSwyMDIgOTAsMjEwIDcwIEMyMzAgNzQsMjUwIDgyLDI4MCA5NiBMMjk4IDE2NSBMMjU1IDE3OCBMMjM4IDE0NSBMMjUwIDM0OCBDMjIwIDM4NiwxNDAgMzg2LDExMCAzNDggTDEyMiAxNDUgTDEwNSAxNzggTDYyIDE2NSBaIiBmaWxsPSIjZmZmZGY5IiBzdHJva2U9IiM2YTY2NDEiIHN0cm9rZS13aWR0aD0iNSIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8cGF0aCBkPSJNMTQ1IDc4IEMxNTAgMTEyLDE2NCAxMjgsMTgwIDEyOCBDMTk2IDEyOCwyMTAgMTEyLDIxNSA3OCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNmE2NjQxIiBzdHJva2Utd2lkdGg9IjQiLz4KPHBhdGggZD0iTTExMiAyMzAgQzE0NSAyNDIsMjE1IDI0MiwyNDggMjMwIiBmaWxsPSJub25lIiBzdHJva2U9IiM2YTY2NDEiIHN0cm9rZS13aWR0aD0iMyIgc3Ryb2tlLWRhc2hhcnJheT0iOCA3IiBvcGFjaXR5PSIuNyIvPgo8cGF0aCBkPSJNMTIyIDE0NSBDMTU1IDE2NCwyMDUgMTY0LDIzOCAxNDUiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzZhNjY0MSIgc3Ryb2tlLXdpZHRoPSIzIiBvcGFjaXR5PSIuNTUiLz4KPHRleHQgeD0iMjQiIHk9IjQxMiIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjE4IiBmb250LXdlaWdodD0iNzAwIiBmaWxsPSIjNmE2NjQxIj5CcmlkYWwgQmxvdXNlPC90ZXh0Pgo8L3N2Zz4=","assets/styles/style12.svg":"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzNjAiIGhlaWdodD0iNTYwIiB2aWV3Qm94PSIwIDAgMzYwIDU2MCI+CjxyZWN0IHdpZHRoPSIzNjAiIGhlaWdodD0iNTYwIiByeD0iMjgiIGZpbGw9IiNkZWVjZWMiLz4KPGNpcmNsZSBjeD0iMzAwIiBjeT0iNjIiIHI9IjM0IiBmaWxsPSIjZmZmZmZmIiBvcGFjaXR5PSIuMzUiLz4KPHBhdGggZD0iTTgwIDk2IEMxMTAgODIsMTMwIDc0LDE1MCA3MCBDMTU4IDkwLDE3MCAxMDUsMTgwIDEwNSBDMTkwIDEwNSwyMDIgOTAsMjEwIDcwIEMyMzAgNzQsMjUwIDgyLDI4MCA5NiBMMjkzIDE2NSBMMjU1IDE3OCBMMjM4IDE0NSBMMjUwIDQ2OCBDMjIwIDUwNiwxNDAgNTA2LDExMCA0NjggTDEyMiAxNDUgTDEwNSAxNzggTDY3IDE2NSBaIiBmaWxsPSIjZmZmZGY5IiBzdHJva2U9IiM0MTY5NmQiIHN0cm9rZS13aWR0aD0iNSIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8cGF0aCBkPSJNMTQ1IDc4IEMxNTAgMTEyLDE2NCAxMjgsMTgwIDEyOCBDMTk2IDEyOCwyMTAgMTEyLDIxNSA3OCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNDE2OTZkIiBzdHJva2Utd2lkdGg9IjQiLz4KPHBhdGggZD0iTTExMiAyMzAgQzE0NSAyNDIsMjE1IDI0MiwyNDggMjMwIiBmaWxsPSJub25lIiBzdHJva2U9IiM0MTY5NmQiIHN0cm9rZS13aWR0aD0iMyIgc3Ryb2tlLWRhc2hhcnJheT0iOCA3IiBvcGFjaXR5PSIuNyIvPgo8cGF0aCBkPSJNMTIyIDE0NSBDMTU1IDE2NCwyMDUgMTY0LDIzOCAxNDUiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzQxNjk2ZCIgc3Ryb2tlLXdpZHRoPSIzIiBvcGFjaXR5PSIuNTUiLz4KPHRleHQgeD0iMjQiIHk9IjUzMiIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjE4IiBmb250LXdlaWdodD0iNzAwIiBmaWxsPSIjNDE2OTZkIj5QbGVhdGVkIEdvd248L3RleHQ+Cjwvc3ZnPg==","assets/styles/style13.svg":"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzNjAiIGhlaWdodD0iNDIwIiB2aWV3Qm94PSIwIDAgMzYwIDQyMCI+CjxyZWN0IHdpZHRoPSIzNjAiIGhlaWdodD0iNDIwIiByeD0iMjgiIGZpbGw9IiNmMmU1ZDgiLz4KPGNpcmNsZSBjeD0iMzAwIiBjeT0iNjIiIHI9IjM0IiBmaWxsPSIjZmZmZmZmIiBvcGFjaXR5PSIuMzUiLz4KPHBhdGggZD0iTTgwIDk2IEMxMTAgODIsMTMwIDc0LDE1MCA3MCBDMTU4IDkwLDE3MCAxMTMsMTgwIDExMyBDMTkwIDExMywyMDIgOTAsMjEwIDcwIEMyMzAgNzQsMjUwIDgyLDI4MCA5NiBMMjk2IDE2NSBMMjU1IDE3OCBMMjM4IDE0NSBMMjUwIDMyOCBDMjIwIDM2NiwxNDAgMzY2LDExMCAzMjggTDEyMiAxNDUgTDEwNSAxNzggTDY0IDE2NSBaIiBmaWxsPSIjZmZmZGY5IiBzdHJva2U9IiMyZjZmNjUiIHN0cm9rZS13aWR0aD0iNSIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8cGF0aCBkPSJNMTQ1IDc4IEMxNTAgMTEyLDE2NCAxMjgsMTgwIDEyOCBDMTk2IDEyOCwyMTAgMTEyLDIxNSA3OCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMmY2ZjY1IiBzdHJva2Utd2lkdGg9IjQiLz4KPHBhdGggZD0iTTExMiAyMzAgQzE0NSAyNDIsMjE1IDI0MiwyNDggMjMwIiBmaWxsPSJub25lIiBzdHJva2U9IiMyZjZmNjUiIHN0cm9rZS13aWR0aD0iMyIgc3Ryb2tlLWRhc2hhcnJheT0iOCA3IiBvcGFjaXR5PSIuNyIvPgo8cGF0aCBkPSJNMTIyIDE0NSBDMTU1IDE2NCwyMDUgMTY0LDIzOCAxNDUiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzJmNmY2NSIgc3Ryb2tlLXdpZHRoPSIzIiBvcGFjaXR5PSIuNTUiLz4KPHRleHQgeD0iMjQiIHk9IjM5MiIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjE4IiBmb250LXdlaWdodD0iNzAwIiBmaWxsPSIjMmY2ZjY1Ij5TcXVhcmUgTmVjazwvdGV4dD4KPC9zdmc+","assets/styles/style14.svg":"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzNjAiIGhlaWdodD0iNTIwIiB2aWV3Qm94PSIwIDAgMzYwIDUyMCI+CjxyZWN0IHdpZHRoPSIzNjAiIGhlaWdodD0iNTIwIiByeD0iMjgiIGZpbGw9IiNlN2VmZTkiLz4KPGNpcmNsZSBjeD0iMzAwIiBjeT0iNjIiIHI9IjM0IiBmaWxsPSIjZmZmZmZmIiBvcGFjaXR5PSIuMzUiLz4KPHBhdGggZD0iTTgwIDk2IEMxMTAgODIsMTMwIDc0LDE1MCA3MCBDMTU4IDkwLDE3MCAxMjEsMTgwIDEyMSBDMTkwIDEyMSwyMDIgOTAsMjEwIDcwIEMyMzAgNzQsMjUwIDgyLDI4MCA5NiBMMjk4IDE2NSBMMjU1IDE3OCBMMjM4IDE0NSBMMjUwIDQyOCBDMjIwIDQ2NiwxNDAgNDY2LDExMCA0MjggTDEyMiAxNDUgTDEwNSAxNzggTDYyIDE2NSBaIiBmaWxsPSIjZmZmZGY5IiBzdHJva2U9IiM2ODUzNGEiIHN0cm9rZS13aWR0aD0iNSIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8cGF0aCBkPSJNMTQ1IDc4IEMxNTAgMTEyLDE2NCAxMjgsMTgwIDEyOCBDMTk2IDEyOCwyMTAgMTEyLDIxNSA3OCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNjg1MzRhIiBzdHJva2Utd2lkdGg9IjQiLz4KPHBhdGggZD0iTTExMiAyMzAgQzE0NSAyNDIsMjE1IDI0MiwyNDggMjMwIiBmaWxsPSJub25lIiBzdHJva2U9IiM2ODUzNGEiIHN0cm9rZS13aWR0aD0iMyIgc3Ryb2tlLWRhc2hhcnJheT0iOCA3IiBvcGFjaXR5PSIuNyIvPgo8cGF0aCBkPSJNMTIyIDE0NSBDMTU1IDE2NCwyMDUgMTY0LDIzOCAxNDUiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzY4NTM0YSIgc3Ryb2tlLXdpZHRoPSIzIiBvcGFjaXR5PSIuNTUiLz4KPHRleHQgeD0iMjQiIHk9IjQ5MiIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjE4IiBmb250LXdlaWdodD0iNzAwIiBmaWxsPSIjNjg1MzRhIj5Qb3RsaSBTbGVldmU8L3RleHQ+Cjwvc3ZnPg==","assets/styles/style15.svg":"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzNjAiIGhlaWdodD0iNDcwIiB2aWV3Qm94PSIwIDAgMzYwIDQ3MCI+CjxyZWN0IHdpZHRoPSIzNjAiIGhlaWdodD0iNDcwIiByeD0iMjgiIGZpbGw9IiNmM2UxZTEiLz4KPGNpcmNsZSBjeD0iMzAwIiBjeT0iNjIiIHI9IjM0IiBmaWxsPSIjZmZmZmZmIiBvcGFjaXR5PSIuMzUiLz4KPHBhdGggZD0iTTgwIDk2IEMxMTAgODIsMTMwIDc0LDE1MCA3MCBDMTU4IDkwLDE3MCAxMjksMTgwIDEyOSBDMTkwIDEyOSwyMDIgOTAsMjEwIDcwIEMyMzAgNzQsMjUwIDgyLDI4MCA5NiBMMjkzIDE2NSBMMjU1IDE3OCBMMjM4IDE0NSBMMjUwIDM3OCBDMjIwIDQxNiwxNDAgNDE2LDExMCAzNzggTDEyMiAxNDUgTDEwNSAxNzggTDY3IDE2NSBaIiBmaWxsPSIjZmZmZGY5IiBzdHJva2U9IiM4YzVjNjEiIHN0cm9rZS13aWR0aD0iNSIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8cGF0aCBkPSJNMTQ1IDc4IEMxNTAgMTEyLDE2NCAxMjgsMTgwIDEyOCBDMTk2IDEyOCwyMTAgMTEyLDIxNSA3OCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjOGM1YzYxIiBzdHJva2Utd2lkdGg9IjQiLz4KPHBhdGggZD0iTTExMiAyMzAgQzE0NSAyNDIsMjE1IDI0MiwyNDggMjMwIiBmaWxsPSJub25lIiBzdHJva2U9IiM4YzVjNjEiIHN0cm9rZS13aWR0aD0iMyIgc3Ryb2tlLWRhc2hhcnJheT0iOCA3IiBvcGFjaXR5PSIuNyIvPgo8cGF0aCBkPSJNMTIyIDE0NSBDMTU1IDE2NCwyMDUgMTY0LDIzOCAxNDUiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzhjNWM2MSIgc3Ryb2tlLXdpZHRoPSIzIiBvcGFjaXR5PSIuNTUiLz4KPHRleHQgeD0iMjQiIHk9IjQ0MiIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjE4IiBmb250LXdlaWdodD0iNzAwIiBmaWxsPSIjOGM1YzYxIj5IaWdoIE5lY2s8L3RleHQ+Cjwvc3ZnPg==","assets/styles/style16.svg":"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzNjAiIGhlaWdodD0iNjAwIiB2aWV3Qm94PSIwIDAgMzYwIDYwMCI+CjxyZWN0IHdpZHRoPSIzNjAiIGhlaWdodD0iNjAwIiByeD0iMjgiIGZpbGw9IiNlOGUzZjEiLz4KPGNpcmNsZSBjeD0iMzAwIiBjeT0iNjIiIHI9IjM0IiBmaWxsPSIjZmZmZmZmIiBvcGFjaXR5PSIuMzUiLz4KPHBhdGggZD0iTTgwIDk2IEMxMTAgODIsMTMwIDc0LDE1MCA3MCBDMTU4IDkwLDE3MCAxMDUsMTgwIDEwNSBDMTkwIDEwNSwyMDIgOTAsMjEwIDcwIEMyMzAgNzQsMjUwIDgyLDI4MCA5NiBMMjk2IDE2NSBMMjU1IDE3OCBMMjM4IDE0NSBMMjUwIDUwOCBDMjIwIDU0NiwxNDAgNTQ2LDExMCA1MDggTDEyMiAxNDUgTDEwNSAxNzggTDY0IDE2NSBaIiBmaWxsPSIjZmZmZGY5IiBzdHJva2U9IiM2MjVhN2EiIHN0cm9rZS13aWR0aD0iNSIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8cGF0aCBkPSJNMTQ1IDc4IEMxNTAgMTEyLDE2NCAxMjgsMTgwIDEyOCBDMTk2IDEyOCwyMTAgMTEyLDIxNSA3OCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNjI1YTdhIiBzdHJva2Utd2lkdGg9IjQiLz4KPHBhdGggZD0iTTExMiAyMzAgQzE0NSAyNDIsMjE1IDI0MiwyNDggMjMwIiBmaWxsPSJub25lIiBzdHJva2U9IiM2MjVhN2EiIHN0cm9rZS13aWR0aD0iMyIgc3Ryb2tlLWRhc2hhcnJheT0iOCA3IiBvcGFjaXR5PSIuNyIvPgo8cGF0aCBkPSJNMTIyIDE0NSBDMTU1IDE2NCwyMDUgMTY0LDIzOCAxNDUiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzYyNWE3YSIgc3Ryb2tlLXdpZHRoPSIzIiBvcGFjaXR5PSIuNTUiLz4KPHRleHQgeD0iMjQiIHk9IjU3MiIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjE4IiBmb250LXdlaWdodD0iNzAwIiBmaWxsPSIjNjI1YTdhIj5QYW5lbCBLdXJ0aTwvdGV4dD4KPC9zdmc+","assets/styles/style17.svg":"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzNjAiIGhlaWdodD0iNDQwIiB2aWV3Qm94PSIwIDAgMzYwIDQ0MCI+CjxyZWN0IHdpZHRoPSIzNjAiIGhlaWdodD0iNDQwIiByeD0iMjgiIGZpbGw9IiNmMWVhZDIiLz4KPGNpcmNsZSBjeD0iMzAwIiBjeT0iNjIiIHI9IjM0IiBmaWxsPSIjZmZmZmZmIiBvcGFjaXR5PSIuMzUiLz4KPHBhdGggZD0iTTgwIDk2IEMxMTAgODIsMTMwIDc0LDE1MCA3MCBDMTU4IDkwLDE3MCAxMTMsMTgwIDExMyBDMTkwIDExMywyMDIgOTAsMjEwIDcwIEMyMzAgNzQsMjUwIDgyLDI4MCA5NiBMMjk4IDE2NSBMMjU1IDE3OCBMMjM4IDE0NSBMMjUwIDM0OCBDMjIwIDM4NiwxNDAgMzg2LDExMCAzNDggTDEyMiAxNDUgTDEwNSAxNzggTDYyIDE2NSBaIiBmaWxsPSIjZmZmZGY5IiBzdHJva2U9IiM2YTY2NDEiIHN0cm9rZS13aWR0aD0iNSIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8cGF0aCBkPSJNMTQ1IDc4IEMxNTAgMTEyLDE2NCAxMjgsMTgwIDEyOCBDMTk2IDEyOCwyMTAgMTEyLDIxNSA3OCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNmE2NjQxIiBzdHJva2Utd2lkdGg9IjQiLz4KPHBhdGggZD0iTTExMiAyMzAgQzE0NSAyNDIsMjE1IDI0MiwyNDggMjMwIiBmaWxsPSJub25lIiBzdHJva2U9IiM2YTY2NDEiIHN0cm9rZS13aWR0aD0iMyIgc3Ryb2tlLWRhc2hhcnJheT0iOCA3IiBvcGFjaXR5PSIuNyIvPgo8cGF0aCBkPSJNMTIyIDE0NSBDMTU1IDE2NCwyMDUgMTY0LDIzOCAxNDUiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzZhNjY0MSIgc3Ryb2tlLXdpZHRoPSIzIiBvcGFjaXR5PSIuNTUiLz4KPHRleHQgeD0iMjQiIHk9IjQxMiIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjE4IiBmb250LXdlaWdodD0iNzAwIiBmaWxsPSIjNmE2NjQxIj5DYXBlIEJsb3VzZTwvdGV4dD4KPC9zdmc+","assets/styles/style18.svg":"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzNjAiIGhlaWdodD0iNTYwIiB2aWV3Qm94PSIwIDAgMzYwIDU2MCI+CjxyZWN0IHdpZHRoPSIzNjAiIGhlaWdodD0iNTYwIiByeD0iMjgiIGZpbGw9IiNkZWVjZWMiLz4KPGNpcmNsZSBjeD0iMzAwIiBjeT0iNjIiIHI9IjM0IiBmaWxsPSIjZmZmZmZmIiBvcGFjaXR5PSIuMzUiLz4KPHBhdGggZD0iTTgwIDk2IEMxMTAgODIsMTMwIDc0LDE1MCA3MCBDMTU4IDkwLDE3MCAxMjEsMTgwIDEyMSBDMTkwIDEyMSwyMDIgOTAsMjEwIDcwIEMyMzAgNzQsMjUwIDgyLDI4MCA5NiBMMjkzIDE2NSBMMjU1IDE3OCBMMjM4IDE0NSBMMjUwIDQ2OCBDMjIwIDUwNiwxNDAgNTA2LDExMCA0NjggTDEyMiAxNDUgTDEwNSAxNzggTDY3IDE2NSBaIiBmaWxsPSIjZmZmZGY5IiBzdHJva2U9IiM0MTY5NmQiIHN0cm9rZS13aWR0aD0iNSIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8cGF0aCBkPSJNMTQ1IDc4IEMxNTAgMTEyLDE2NCAxMjgsMTgwIDEyOCBDMTk2IDEyOCwyMTAgMTEyLDIxNSA3OCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNDE2OTZkIiBzdHJva2Utd2lkdGg9IjQiLz4KPHBhdGggZD0iTTExMiAyMzAgQzE0NSAyNDIsMjE1IDI0MiwyNDggMjMwIiBmaWxsPSJub25lIiBzdHJva2U9IiM0MTY5NmQiIHN0cm9rZS13aWR0aD0iMyIgc3Ryb2tlLWRhc2hhcnJheT0iOCA3IiBvcGFjaXR5PSIuNyIvPgo8cGF0aCBkPSJNMTIyIDE0NSBDMTU1IDE2NCwyMDUgMTY0LDIzOCAxNDUiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzQxNjk2ZCIgc3Ryb2tlLXdpZHRoPSIzIiBvcGFjaXR5PSIuNTUiLz4KPHRleHQgeD0iMjQiIHk9IjUzMiIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjE4IiBmb250LXdlaWdodD0iNzAwIiBmaWxsPSIjNDE2OTZkIj5GZXN0aXZlIExlaGVuZ2E8L3RleHQ+Cjwvc3ZnPg=="};
function canvasSafeSrc(src){return CANVAS_SAFE_ASSETS[src]||src}

const seededCatalog=[
  ['assets/styles/style01.svg','Blouse back','blouse neck'],['assets/styles/style02.svg','Kurti neck','kurti neck'],['assets/styles/style03.svg','Lehenga style','lehenga'],['assets/styles/style04.svg','Gown drape','gown'],['assets/styles/style05.svg','Sleeve detail','sleeve blouse'],['assets/styles/style06.svg','Anarkali','kurti gown'],['assets/styles/style07.svg','Boat neck','neck blouse'],['assets/styles/style08.svg','Princess cut','blouse'],['assets/styles/style09.svg','Peplum blouse','blouse'],['assets/styles/style10.svg','Collar kurti','kurti neck'],['assets/styles/style11.svg','Bridal blouse','blouse neck'],['assets/styles/style12.svg','Pleated gown','gown'],['assets/styles/style13.svg','Square neck','neck blouse'],['assets/styles/style14.svg','Potli sleeve','sleeve blouse'],['assets/styles/style15.svg','High neck','neck kurti'],['assets/styles/style16.svg','Panel kurti','kurti'],['assets/styles/style17.svg','Cape blouse','blouse sleeve'],['assets/styles/style18.svg','Festive lehenga','lehenga']
].map((x,i)=>({id:'style-'+(i+1),src:x[0],title:x[1],tags:x[2],custom:false}));

function makeSamples(){
  const names=['Anita Sharma','Meena Rao','Lakshmi Devi','Sushma Reddy','Farzana Begum','Priya Nair','Kavitha','Rukmini','Neha Jain','Shailaja','Divya','Sana','Bhavani','Jyothi','Deepa','Ayesha','Rani','Geetha','Madhavi','Pooja','Keerthi','Swathi','Nandini','Reshma','Vasudha','Anjali','Harini','Saritha','Latha','Mounika'];
  const garments=['Blouse','Kurti','Lehenga','Gown','Alteration','Salwar Suit','Blouse','Kurti','Dress','Blouse'];
  const notePool=['Deep back neck with piping','Keep loose fit at waist','Match reference sleeve','Add side pockets','Simple festive finish','Alter shoulder and length','Contrast border finish','Princess cut fitting','Boat neck with hooks','Keep extra margin inside'];
  const rows=[];
  for(let i=0;i<30;i++){
    let status=i<12?'In Process':i<20?'Ready':'Ready';
    let completed=i>=20;
    let style=(i%18)+1;
    let finalStyle=((i+5)%18)+1;
    let delivery=completed?offsetDate(-(i-18)):offsetDate((i%7)-1);
    rows.push({
      id:'ORD-'+String(2001+i),customerName:names[i],phone:'9'+String(700000000+i*731).padStart(9,'0').slice(-9),garment:garments[i%garments.length],orderDate:offsetDate(-(i%11+1)),deliveryDate:delivery,status,notes:notePool[i%notePool.length],
      garmentImage:`assets/styles/style${String(style).padStart(2,'0')}.svg`,
      referenceImages:[`assets/styles/style${String(style).padStart(2,'0')}.svg`],
      finalImages:completed?[`assets/styles/style${String(finalStyle).padStart(2,'0')}.svg`]:[],sketch:'',
      payment:{total:900+(i%7)*550,advance:400+(i%5)*300},
      m:{bust:(34+i%6)+' in',waist:(28+i%7)+' in',hip:(36+i%8)+' in',shoulder:(13+i%3)+'.5 in',sleeve:(9+i%8)+' in',length:(38+i%9)+' in',notes:i%4===0?'Keep 1 inch extra margin':''},
      createdAt:isoOffset(-(i+2)),updatedAt:isoOffset(-(i%8),i%4),completedAt:completed?isoOffset(-(i-18)):''
    });
  }
  return rows;
}

function initialize(){
  if(localStorage.getItem(INIT_STORE)!=='1'){
    orders=makeSamples();deleted=[];localStorage.setItem(INIT_STORE,'1');saveOrders();
  }
}
function saveOrders(){localStorage.setItem(STORE,JSON.stringify(orders));localStorage.setItem(BIN_STORE,JSON.stringify(deleted))}
function saveProfile(){localStorage.setItem(PROFILE_STORE,JSON.stringify(profile))}
function saveCatalog(){localStorage.setItem(CATALOG_STORE,JSON.stringify(customCatalog))}
function saveStock(){localStorage.setItem(STOCK_STORE,JSON.stringify(shopStock))}
function saveConnections(){localStorage.setItem(CONNECTION_STORE,JSON.stringify(connections))}

function showScreen(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));const screen=$(id);if(!screen)return;screen.classList.add('active');
  const titles={dashboard:'Home',orders:'Orders',customers:'Customers',add:'Add Order',details:'Order Details',catalog:'Catalog',profile:'Profile',bin:'Recycle Bin'};$('screenTitle').textContent=translateExact(titles[id]||'TaraLoom');
  document.querySelectorAll('.bottom-nav button').forEach(b=>b.classList.toggle('active',b.dataset.nav===id||(id==='customers'&&b.dataset.nav==='orders')||(id==='bin'&&b.dataset.nav==='profile')));
  if(id==='orders')renderOrders();if(id==='catalog')renderCatalog();if(id==='customers')renderCustomers();if(id==='profile'){profileEditOpen=!profileHasData();fillProfile();renderSavedProfile();renderStock();renderConnections()}
  renderDashboard();renderBin();window.scrollTo({top:0,behavior:'smooth'});
}
function setOrderMode(mode){todayOnly=false;orderMode=mode;$('currentTab').classList.toggle('active',mode==='current');$('historyTab').classList.toggle('active',mode==='history');$('currentFilters').classList.toggle('hidden',mode==='history');$('historyHelp').classList.toggle('hidden',mode!=='history');renderOrders()}
function openHistoryTab(){todayOnly=false;showScreen('orders');setOrderMode('history')}
function openOrdersScreen(){todayOnly=false;showScreen('orders')}
function openTodayOrders(){orderMode='current';filter='all';todayOnly=true;showScreen('orders');$('currentTab').classList.add('active');$('historyTab').classList.remove('active');$('currentFilters').classList.remove('hidden');$('historyHelp').classList.add('hidden');document.querySelectorAll('#currentFilters .chip').forEach((c,i)=>c.classList.toggle('active',i===0));renderOrders();toast(translateExact(`Showing ${orders.filter(o=>!isCompleted(o)&&o.deliveryDate===today()).length} orders due today`))}
function openCurrentFilter(f){todayOnly=false;showScreen('orders');setOrderMode('current');filter=f;document.querySelectorAll('#currentFilters .chip').forEach((c,i)=>c.classList.toggle('active',i===({'all':0,'in process':1,'ready':2}[f]??-1)));renderOrders()}
function setFilter(f,el){todayOnly=false;filter=f;document.querySelectorAll('#currentFilters .chip').forEach(c=>c.classList.remove('active'));el.classList.add('active');renderOrders()}

function orderCard(o,compact=false){
  const visual=firstVisual(o),status=displayStatus(o);const img=visual?`<img class="order-thumb tappable-image" src="${visual}" alt="${esc(o.garment)}" onclick="event.stopPropagation();openImageViewer(this.src,${esc(JSON.stringify(o.garment))})">`:`<div class="order-thumb placeholder">🧵</div>`;
  return `<article class="order-card"><div class="order-main">${img}<div class="order-copy"><h3>${esc(o.customerName)} · ${esc(o.garment)}</h3><p class="order-date">Delivery: ${formatDate(o.deliveryDate)}</p><p class="status-text ${status==='Completed'?'completed':''}">${esc(status)}</p></div>${Number(o.payment?.total||0)>0?`<div class="money-mini">${money(paymentBalance(o))}<br><span class="muted">balance</span></div>`:''}</div><div class="card-actions"><button class="primary" onclick="viewDetails('${o.id}')">View</button>${!compact?`<button onclick="editOrder('${o.id}')">Edit</button><button onclick="shareOrder('${o.id}')">Share</button>`:''}</div></article>`
}
function renderDashboard(){
  $('statInProcess').textContent=orders.filter(o=>!isCompleted(o)&&o.status==='In Process').length;
  $('statReady').textContent=orders.filter(o=>!isCompleted(o)&&o.status==='Ready').length;
  $('statCompleted').textContent=orders.filter(isCompleted).length;
  const due=orders.filter(o=>!isCompleted(o)&&o.deliveryDate===today()).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
  $('statToday').textContent=due.length;
  $('todayList').innerHTML=due.map(o=>orderCard(o,true)).join('')||'<div class="empty">No deliveries due today.</div>';
  const recent=[...orders].sort((a,b)=>new Date(b.updatedAt||b.createdAt)-new Date(a.updatedAt||a.createdAt)).slice(0,4);
  $('recentList').innerHTML=recent.map(o=>orderCard(o,true)).join('')||'<div class="empty">No orders yet.</div>';
  $('todayLabel').innerHTML=new Date().toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short'}).replace(' ','<br>');
  $('businessGreeting').textContent=profile.business||'Today';
}
function renderOrders(){
  const q=($('searchInput').value||'').trim().toLowerCase();let list=orders.filter(o=>orderMode==='history'?isCompleted(o):!isCompleted(o));
  if(orderMode==='current'&&todayOnly)list=list.filter(o=>o.deliveryDate===today());
  if(orderMode==='current'&&filter!=='all')list=list.filter(o=>o.status.toLowerCase()===filter);if(q)list=list.filter(o=>[o.customerName,o.phone,o.garment,o.notes].join(' ').toLowerCase().includes(q));
  list.sort((a,b)=>orderMode==='history'?new Date(b.completedAt)-new Date(a.completedAt):new Date(a.deliveryDate)-new Date(b.deliveryDate));$('ordersList').innerHTML=list.map(o=>orderCard(o)).join('')||'<div class="empty">No matching orders.</div>';
}
function renderCustomers(){
  const q=($('customerSearch').value||'').trim().toLowerCase();const map=new Map();orders.forEach(o=>{const key=(o.phone||'')+'|'+o.customerName.toLowerCase();if(!map.has(key))map.set(key,{name:o.customerName,phone:o.phone||'',orders:[]});map.get(key).orders.push(o)});
  const list=[...map.values()].filter(c=>!q||(c.name+' '+c.phone).toLowerCase().includes(q)).sort((a,b)=>a.name.localeCompare(b.name));$('customerList').innerHTML=list.map(c=>{const last=[...c.orders].sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt))[0];return `<article class="customer-card"><div class="avatar">${esc(initials(c.name))}</div><div class="grow"><h3>${esc(c.name)}</h3><p>${esc(c.phone||'No phone')} · ${c.orders.length} orders · Last: ${esc(last.garment)}</p></div><button onclick="viewCustomerHistory(${esc(JSON.stringify(c.name))},${esc(JSON.stringify(c.phone))})">History</button></article>`}).join('')||'<div class="empty">No customers found.</div>';
}
function viewCustomerHistory(name,phone){
  const list=orders.filter(o=>(phone&&o.phone===phone)||(!phone&&o.customerName===name)).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));const m={};list.forEach(o=>Object.entries(o.m||{}).forEach(([k,v])=>{if(v)m[k]=v}));
  $('detailsContent').innerHTML=`<div class="detail-card"><div class="detail-top"><div><p class="kicker">Customer history</p><h1>${esc(name)}</h1><p class="muted">${esc(phone||'No phone saved')} · ${list.length} total orders</p></div><div class="avatar">${esc(initials(name))}</div></div><div class="detail-section"><h2>Latest measurements</h2><div class="measure-chips">${measurementChipsHtml(m)}</div></div><div class="detail-section"><h2>Orders</h2><div class="list">${list.map(o=>orderCard(o,true)).join('')}</div></div><div class="action-grid"><button onclick="showScreen('customers')">← Customers</button>${phone?`<button onclick="openWhatsApp('${esc(phone)}','Hi ${esc(name)}')">WhatsApp</button>`:''}</div></div>`;showScreen('details');
}

function resetForm(){
  $('orderForm').reset();$('editingId').value='';$('formHeading').textContent='Add Order';$('submitBtn').textContent='Save Order';$('orderDate').value=today();$('deliveryDate').value=offsetDate(3);$('stage').value='In Process';referenceImages=[];formSketchData='';formGarmentImage='';renderReferencePreview();renderGarmentPhotoPreview();$('formSketchWrap').classList.add('hidden');updateBalancePreview();
}
function updateBalancePreview(){$('balancePreview').textContent=money(Math.max(0,Number($('totalAmount').value||0)-Number($('advancePaid').value||0)))}
function addGarmentPhoto(file){if(!file)return;const r=new FileReader();r.onload=e=>{formGarmentImage=e.target.result;renderGarmentPhotoPreview();toast('Garment photo added')};r.readAsDataURL(file)}
$('garmentGalleryInput').addEventListener('change',e=>{addGarmentPhoto(e.target.files?.[0]);e.target.value=''});$('garmentCameraInput').addEventListener('change',e=>{addGarmentPhoto(e.target.files?.[0]);e.target.value=''});
function renderGarmentPhotoPreview(){$('garmentPhotoPreview').classList.toggle('hidden',!formGarmentImage);$('garmentPhotoPreview').innerHTML=formGarmentImage?`<div class="garment-preview-card"><img class="tappable-image" src="${formGarmentImage}" alt="Garment photo" onclick="openImageViewer(this.src,'Garment photo')"><button type="button" onclick="removeGarmentPhoto()">Remove</button></div>`:''}
function removeGarmentPhoto(){formGarmentImage='';renderGarmentPhotoPreview()}
function addFiles(files){[...files].slice(0,5).forEach(file=>{const r=new FileReader();r.onload=e=>{referenceImages.push(e.target.result);renderReferencePreview()};r.readAsDataURL(file)})}
$('galleryInput').addEventListener('change',e=>{addFiles(e.target.files);e.target.value='' });$('cameraInput').addEventListener('change',e=>{addFiles(e.target.files);e.target.value='' });
function renderReferencePreview(){$('referencePreview').innerHTML=referenceImages.map((src,i)=>`<div class="image-preview-card"><img class="tappable-image" src="${src}" alt="Reference ${i+1}" onclick="openImageViewer(this.src,'Reference photo')"><button type="button" onclick="removeReference(${i})">×</button></div>`).join('')}
function removeReference(i){referenceImages.splice(i,1);renderReferencePreview()}
$('orderForm').addEventListener('submit',e=>{
  e.preventDefault();if(!checkPhoneInput($('phone')))return;
  const id=$('editingId').value||'ORD-'+Date.now();const old=orders.find(x=>x.id===id);
  const o={id,customerName:$('customerName').value.trim(),phone:$('phone').value.trim(),garment:$('garment').value,orderDate:$('orderDate').value,deliveryDate:$('deliveryDate').value,status:$('stage').value,notes:$('notes').value.trim(),garmentImage:formGarmentImage,referenceImages:[...referenceImages],finalImages:old?.finalImages||[],sketch:formSketchData,payment:{total:Number($('totalAmount').value||0),advance:Number($('advancePaid').value||0)},m:{bust:$('bust').value.trim(),waist:$('waist').value.trim(),hip:$('hip').value.trim(),shoulder:$('shoulder').value.trim(),sleeve:$('sleeve').value.trim(),length:$('length').value.trim(),notes:$('mnotes').value.trim()},createdAt:old?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),completedAt:old?.completedAt||''};
  if(old)orders=orders.map(x=>x.id===id?o:x);else orders.unshift(o);saveOrders();renderDashboard();resetForm();showScreen('orders');setOrderMode('current');toast(old?'Order updated':'Order saved');
});
function editOrder(id){const o=orders.find(x=>x.id===id);if(!o)return;showScreen('add');$('editingId').value=o.id;$('formHeading').textContent='Edit Order';$('submitBtn').textContent='Save Changes';$('customerName').value=o.customerName;$('phone').value=o.phone||'';$('garment').value=o.garment;$('orderDate').value=o.orderDate;$('deliveryDate').value=o.deliveryDate;$('stage').value=o.status;$('notes').value=o.notes||'';formGarmentImage=o.garmentImage||'';referenceImages=[...(o.referenceImages||[])];formSketchData=o.sketch||'';renderGarmentPhotoPreview();renderReferencePreview();if(formSketchData){$('formSketchPreview').src=formSketchData;$('formSketchWrap').classList.remove('hidden')}else $('formSketchWrap').classList.add('hidden');$('totalAmount').value=o.payment?.total||'';$('advancePaid').value=o.payment?.advance||'';['bust','waist','hip','shoulder','sleeve','length'].forEach(k=>$(k).value=o.m?.[k]||'');$('mnotes').value=o.m?.notes||'';updateBalancePreview()}

function imageHtml(src,title,cls=''){return `<img class="tappable-image ${cls}" src="${src}" alt="${esc(title)}" onclick="openImageViewer(this.src,${esc(JSON.stringify(title))})">`}
function referenceMediaCard(id,src,i){return `<div class="detail-media-card"><img class="tappable-image" src="${src}" alt="Reference ${i+1}" onclick="openImageViewer(this.src,'Reference ${i+1}')"><div class="detail-media-actions"><button onclick="openDrawOnReference('${id}',${i})">✏️ Sketch copy</button><button class="danger-mini" onclick="deleteOrderImage('${id}','reference',${i})">Delete</button></div></div>`}
function finalMediaCard(id,src,i){return `<div class="detail-media-card"><img class="tappable-image" src="${src}" alt="Finished ${i+1}" onclick="openImageViewer(this.src,'Finished photo ${i+1}')"><div class="detail-media-actions"><button class="danger-mini wide-mini" onclick="deleteOrderImage('${id}','final',${i})">Delete</button></div></div>`}
function inlineEditHtml(o){
  const garmentOptions=['Blouse','Kurti','Lehenga','Gown','Shirt','Pants','Salwar Suit','Dress','Alteration','Other'].map(g=>`<option ${g===o.garment?'selected':''}>${g}</option>`).join('');
  return `<div id="inlineEditPanel" class="inline-edit hidden"><div class="inline-edit-head"><h2>Edit order here</h2><button onclick="toggleInlineEdit('${o.id}')">×</button></div><div class="inline-grid"><label>Name<input id="inlineName" value="${esc(o.customerName)}"></label><label>Phone<input id="inlinePhone" inputmode="numeric" maxlength="10" pattern="[6-9][0-9]{9}" title="Enter a 10-digit mobile number starting with 6, 7, 8 or 9" value="${esc(o.phone||'')}" oninput="sanitizeIndianPhone(this)"></label><label>Garment<select id="inlineGarment">${garmentOptions}</select></label><label>Delivery<input id="inlineDelivery" type="date" value="${esc(o.deliveryDate||'')}"></label><label>Status<select id="inlineStatus"><option ${o.status==='In Process'?'selected':''}>In Process</option><option ${o.status==='Ready'?'selected':''}>Ready</option></select></label><label>Order date<input id="inlineOrderDate" type="date" value="${esc(o.orderDate||'')}"></label></div><label>Notes<textarea id="inlineNotes" rows="2">${esc(o.notes||'')}</textarea></label><p class="inline-subhead">Measurements</p><div class="inline-grid measurement-inline"><label>Bust / Chest<input id="inlineBust" value="${esc(o.m?.bust||'')}"></label><label>Waist<input id="inlineWaist" value="${esc(o.m?.waist||'')}"></label><label>Hip<input id="inlineHip" value="${esc(o.m?.hip||'')}"></label><label>Shoulder<input id="inlineShoulder" value="${esc(o.m?.shoulder||'')}"></label><label>Sleeve<input id="inlineSleeve" value="${esc(o.m?.sleeve||'')}"></label><label>Length<input id="inlineLength" value="${esc(o.m?.length||'')}"></label></div><label>Other measurement notes<textarea id="inlineMnotes" rows="2">${esc(o.m?.notes||'')}</textarea></label><p class="inline-subhead">Payment</p><div class="inline-grid"><label>Total ₹<input id="inlineTotal" type="number" min="0" value="${Number(o.payment?.total||0)}"></label><label>Advance ₹<input id="inlineAdvance" type="number" min="0" value="${Number(o.payment?.advance||0)}"></label></div><button class="primary inline-save" onclick="saveInlineEdit('${o.id}')">Save Changes</button></div>`;
}
function viewDetails(id){
  const o=orders.find(x=>x.id===id);if(!o)return;
  const refs=(o.referenceImages||[]).map((src,i)=>referenceMediaCard(id,src,i)).join('');
  const finals=(o.finalImages||[]).map((src,i)=>finalMediaCard(id,src,i)).join('');
  const sketch=o.sketch?`<div class="detail-media-card"><img class="tappable-image sketch-img" src="${o.sketch}" alt="Sketch" onclick="openImageViewer(this.src,'Sketch')"><div class="detail-media-actions"><button onclick="openDraw('${id}')">Edit sketch</button><button class="danger-mini" onclick="deleteOrderImage('${id}','sketch',0)">Delete</button></div></div>`:'';
  const garmentPhoto=o.garmentImage?`<div class="garment-detail-card"><img class="tappable-image" src="${o.garmentImage}" alt="Garment photo" onclick="openImageViewer(this.src,'Garment photo')"><div class="garment-detail-actions"><label>Replace<input type="file" accept="image/*" hidden onchange="replaceGarmentPhoto('${id}',this)"></label><label>📷 Camera<input type="file" accept="image/*" capture="environment" hidden onchange="replaceGarmentPhoto('${id}',this)"></label><button class="danger-mini" onclick="deleteOrderImage('${id}','garment',0)">Delete</button></div></div>`:`<div class="detail-add-media two-action"><label>＋ Add garment photo<input type="file" accept="image/*" hidden onchange="replaceGarmentPhoto('${id}',this)"></label><label>📷 Camera<input type="file" accept="image/*" capture="environment" hidden onchange="replaceGarmentPhoto('${id}',this)"></label></div><p class="helper">No garment photo added.</p>`;
  $('detailsContent').innerHTML=`<div class="detail-card"><div class="detail-top"><div><p class="kicker">${esc(o.garment)}</p><h1>${esc(o.customerName)}</h1><p class="muted">${esc(o.phone||'No phone saved')}</p></div><div class="detail-top-actions"><span class="detail-status">${esc(displayStatus(o))}</span><button class="inline-edit-trigger" onclick="toggleInlineEdit('${id}')">✎ Edit</button></div></div>${inlineEditHtml(o)}<div class="detail-section"><div class="info-grid"><div class="info-box">Order date<b>${formatDate(o.orderDate)}</b></div><div class="info-box">Delivery<b>${formatDate(o.deliveryDate)}</b></div></div>${o.notes?`<p class="helper" style="margin:10px 0 0">${esc(o.notes)}</p>`:''}</div><div class="detail-section"><div class="detail-section-head"><h2>Garment photo</h2><span class="helper">Photo taken when order is received</span></div>${garmentPhoto}</div><div class="detail-section"><h2>Measurements</h2><div class="measure-chips measure-chips-with-icons">${measurementChipsHtml(o.m||{})}</div>${o.m?.notes?`<p class="helper" style="margin:9px 0 0">${esc(o.m.notes)}</p>`:''}</div><div class="detail-section"><div class="detail-section-head"><h2>Reference images</h2><span class="helper">Tap image for full view</span></div><div class="detail-add-media"><label>＋ Gallery<input type="file" accept="image/*" multiple hidden onchange="addReferenceToOrder('${id}',this)"></label><label>📷 Camera<input type="file" accept="image/*" capture="environment" hidden onchange="addReferenceToOrder('${id}',this)"></label><button onclick="openDraw('${id}')">✏️ Sketch</button></div><div class="media-gallery detail-media-grid">${refs}${sketch}</div>${!refs&&!sketch?'<p class="helper">No reference photos yet.</p>':''}</div><div class="detail-section"><div class="detail-section-head"><h2>Finished photos</h2></div><div class="detail-add-media one-action"><label>📷 Add finished photo<input type="file" accept="image/*" capture="environment" hidden onchange="addFinalPhoto('${id}',this)"></label></div><div class="media-gallery detail-media-grid">${finals}</div>${!finals?'<p class="helper">No finished photos yet.</p>':''}</div><div class="detail-section"><h2>Payment</h2><div class="payment-line"><span>Total</span><b>${money(o.payment?.total)}</b></div><div class="payment-line"><span>Advance</span><b>${money(o.payment?.advance)}</b></div><div class="payment-line"><span>Balance</span><strong>${money(paymentBalance(o))}</strong></div></div><div class="action-grid"><button onclick="shareOrder('${id}')">Share</button><button onclick="viewCustomerHistory(${esc(JSON.stringify(o.customerName))},${esc(JSON.stringify(o.phone||''))})">👥 History</button><button onclick="cycleStatus('${id}')">↔ Change Status</button>${isCompleted(o)?`<button onclick="reopenOrder('${id}')">Reopen</button>`:`<button onclick="completeOrder('${id}')">Finished</button>`}<button class="danger wide" onclick="moveBin('${id}')">♻️ Recycle Bin</button></div></div>`;showScreen('details');
}
function toggleInlineEdit(id){const p=$('inlineEditPanel');if(!p)return;p.classList.toggle('hidden');if(!p.classList.contains('hidden'))setTimeout(()=>$('inlineName')?.focus(),50)}
function saveInlineEdit(id){
  const o=orders.find(x=>x.id===id);if(!o)return;if(!$('inlineName').value.trim()){toast('Customer name is required');$('inlineName').focus();return}if(!checkPhoneInput($('inlinePhone')))return;
  o.customerName=$('inlineName').value.trim();o.phone=$('inlinePhone').value.trim();o.garment=$('inlineGarment').value;o.deliveryDate=$('inlineDelivery').value;o.orderDate=$('inlineOrderDate').value;o.status=$('inlineStatus').value;o.notes=$('inlineNotes').value.trim();o.m={bust:$('inlineBust').value.trim(),waist:$('inlineWaist').value.trim(),hip:$('inlineHip').value.trim(),shoulder:$('inlineShoulder').value.trim(),sleeve:$('inlineSleeve').value.trim(),length:$('inlineLength').value.trim(),notes:$('inlineMnotes').value.trim()};o.payment={total:Number($('inlineTotal').value||0),advance:Number($('inlineAdvance').value||0)};o.updatedAt=new Date().toISOString();saveOrders();renderDashboard();viewDetails(id);toast('Changes saved');
}
function replaceGarmentPhoto(id,input){const file=input.files?.[0];if(!file)return;const r=new FileReader();r.onload=e=>{const o=orders.find(x=>x.id===id);if(!o)return;o.garmentImage=e.target.result;o.updatedAt=new Date().toISOString();saveOrders();renderDashboard();viewDetails(id);toast('Garment photo saved')};r.readAsDataURL(file);input.value=''}
function addReferenceToOrder(id,input){const files=[...(input.files||[])].slice(0,5);if(!files.length)return;const o=orders.find(x=>x.id===id);if(!o)return;o.referenceImages=o.referenceImages||[];let pending=files.length;files.forEach(file=>{const r=new FileReader();r.onload=e=>{o.referenceImages.push(e.target.result);pending--;if(pending===0){o.updatedAt=new Date().toISOString();saveOrders();viewDetails(id);toast(files.length>1?'Reference photos added':'Reference photo added')}};r.readAsDataURL(file)});input.value=''}
function deleteOrderImage(id,kind,index){const o=orders.find(x=>x.id===id);if(!o||!confirm('Delete this image?'))return;if(kind==='garment')o.garmentImage='';else if(kind==='reference')o.referenceImages?.splice(index,1);else if(kind==='final')o.finalImages?.splice(index,1);else if(kind==='sketch')o.sketch='';o.updatedAt=new Date().toISOString();saveOrders();viewDetails(id);toast('Image deleted')}
function cycleStatus(id){const o=orders.find(x=>x.id===id);if(!o||isCompleted(o))return;o.status=o.status==='In Process'?'Ready':'In Process';o.updatedAt=new Date().toISOString();saveOrders();renderDashboard();viewDetails(id);toast('Status changed to '+o.status)}
function completeOrder(id){const o=orders.find(x=>x.id===id);if(!o)return;o.status='Ready';o.completedAt=new Date().toISOString();o.updatedAt=o.completedAt;saveOrders();renderDashboard();viewDetails(id);toast('Order marked Finished')}
function reopenOrder(id){const o=orders.find(x=>x.id===id);if(!o)return;o.completedAt='';o.status='In Process';o.updatedAt=new Date().toISOString();saveOrders();renderDashboard();viewDetails(id);toast('Order reopened')}
function addFinalPhoto(id,input){const file=input.files?.[0];if(!file)return;const r=new FileReader();r.onload=e=>{const o=orders.find(x=>x.id===id);if(!o)return;o.finalImages=o.finalImages||[];o.finalImages.push(e.target.result);o.updatedAt=new Date().toISOString();saveOrders();viewDetails(id);toast('Finished photo saved')};r.readAsDataURL(file)}
function moveBin(id){const o=orders.find(x=>x.id===id);if(!o||!confirm('Move this order to Recycle Bin?'))return;deleted.unshift(o);orders=orders.filter(x=>x.id!==id);saveOrders();showScreen('orders');renderOrders();toast('Moved to Recycle Bin')}
function renderBin(){$('binList').innerHTML=deleted.map(o=>`<article class="order-card"><div class="order-main"><div class="order-thumb placeholder">♻️</div><div class="order-copy"><h3>${esc(o.customerName)} · ${esc(o.garment)}</h3><p class="order-date">Deleted order</p></div></div><div class="card-actions"><button class="primary" onclick="restore('${o.id}')">Restore</button><button class="danger" onclick="deleteForever('${o.id}')">Delete Forever</button></div></article>`).join('')||'<div class="empty">Recycle bin is empty.</div>'}
function restore(id){const o=deleted.find(x=>x.id===id);if(!o)return;orders.unshift(o);deleted=deleted.filter(x=>x.id!==id);saveOrders();renderBin();renderDashboard();toast('Order restored')}
function deleteForever(id){if(!confirm('Delete permanently?'))return;deleted=deleted.filter(x=>x.id!==id);saveOrders();renderBin();toast('Deleted permanently')}

async function shareOrder(id){
  const o=orders.find(x=>x.id===id);if(!o)return;
  const hasFinished=(o.finalImages||[]).length>0;
  const text=`TaraLoom Order
Customer: ${o.customerName}
Garment: ${o.garment}
Status: ${displayStatus(o)}
Delivery: ${formatDate(o.deliveryDate)}
Total: ${money(o.payment?.total)}
Advance: ${money(o.payment?.advance)}
Balance: ${money(paymentBalance(o))}${o.notes?`
Notes: ${o.notes}`:''}${hasFinished?`
Finished photos: ${(o.finalImages||[]).length}`:''}`;
  try{
    if(navigator.share){
      const title=`${o.customerName} - ${o.garment}`;
      const files=await buildFinishedShareFiles(o);
      if(files.length && (!navigator.canShare || navigator.canShare({files}))) {
        await navigator.share({title,text,files});
        toast(files.length>1?'Order shared with finished photos':'Order shared with finished photo');
        return;
      }
      await navigator.share({title,text});
      toast(hasFinished?'Order shared. Finished photos attach on supported devices.':'Order shared');
      return;
    }
  }catch(e){
    if(e?.name==='AbortError')return;
    console.warn('Share failed',e);
  }
  try{
    await navigator.clipboard.writeText(text);
    toast(hasFinished?'Order details copied. Finished photos share on supported devices only.':'Order details copied');
  }catch{
    openWhatsApp(o.phone,text)
  }
}
function openWhatsApp(phone,text){const clean=(phone||'').replace(/\D/g,'');window.open(`https://wa.me/${clean}?text=${encodeURIComponent(text)}`,'_blank')}

function setCatalogFilter(f,el){catalogFilter=f;document.querySelectorAll('#catalogFilters .chip').forEach(c=>c.classList.remove('active'));el.classList.add('active');renderCatalog()}
function renderCatalog(){
  const q=($('catalogSearch').value||'').trim().toLowerCase();let items=[...customCatalog,...seededCatalog];if(catalogFilter!=='all')items=items.filter(x=>(x.tags||'').toLowerCase().includes(catalogFilter));if(q)items=items.filter(x=>((x.title||'')+' '+(x.tags||'')).toLowerCase().includes(q));
  $('catalogGrid').innerHTML=items.map(x=>`<article class="pin-card"><img src="${x.src}" alt="${esc(x.title||'Style')}" onclick="openImageViewer(this.src,${esc(JSON.stringify(x.title||'Style'))})"><div class="pin-label">${esc(x.title||'Saved style')}</div><div class="pin-actions"><button onclick="event.stopPropagation();shareCatalogStyle('${x.id}')" aria-label="Share" title="Share style">↗</button>${x.custom?`<button onclick="event.stopPropagation();renameCatalogStyle('${x.id}')" aria-label="Rename">✎</button><button class="pin-delete" onclick="event.stopPropagation();deleteCatalogStyle('${x.id}')" aria-label="Delete">×</button>`:''}</div></article>`).join('')||'<div class="empty">No styles found.</div>';
}
async function shareCatalogStyle(id){
  const item=[...customCatalog,...seededCatalog].find(x=>x.id===id);if(!item)return;
  const title=item.title||'TaraLoom style';const text=`TaraLoom Catalog — ${title}`;
  try{
    const file=await srcToPngShareFile(item.src,'taraloom-style');
    if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){await navigator.share({title,text,files:[file]});toast('Style image shared');return}
    if(navigator.share){await navigator.share({title,text});toast('Style shared');return}
  }catch(e){if(e?.name==='AbortError')return;console.warn('Catalog share failed',e)}
  try{await navigator.clipboard.writeText(text);toast('Style name copied. Image sharing needs a supported mobile browser.')}catch{toast('Sharing is not supported in this browser.')}
}
function startCatalogUpload(files){catalogFileQueue=[...(files||[])].slice(0,8);openNextCatalogFile()}
function openNextCatalogFile(){if(pendingCatalogStyle||!catalogFileQueue.length)return;const file=catalogFileQueue.shift();const r=new FileReader();r.onload=e=>{const suggested=(file.name||'').replace(/\.[^.]+$/,'').replace(/[-_]+/g,' ').trim();pendingCatalogStyle={src:e.target.result,title:suggested||'New style'};$('catalogPreviewImage').src=pendingCatalogStyle.src;$('catalogNameInput').value=pendingCatalogStyle.title;$('catalogModal').classList.add('show');setTimeout(()=>$('catalogNameInput').focus(),50)};r.readAsDataURL(file)}
function savePendingCatalogStyle(){if(!pendingCatalogStyle)return;const title=$('catalogNameInput').value.trim();if(!title){toast('Please give the style a name');$('catalogNameInput').focus();return}customCatalog.unshift({id:'custom-'+Date.now()+'-'+Math.random().toString(16).slice(2),src:pendingCatalogStyle.src,title,tags:'custom style '+title.toLowerCase(),custom:true});saveCatalog();renderCatalog();pendingCatalogStyle=null;$('catalogModal').classList.remove('show');toast('Style saved');setTimeout(openNextCatalogFile,120)}
function closeCatalogModal(clearQueue=true){$('catalogModal').classList.remove('show');pendingCatalogStyle=null;if(clearQueue)catalogFileQueue=[];else setTimeout(openNextCatalogFile,100)}
function catalogBackdropClose(e){if(e.target.id==='catalogModal')closeCatalogModal(true)}
function deleteCatalogStyle(id){const item=customCatalog.find(x=>x.id===id);if(!item||!confirm(`Delete “${item.title||'this style'}” from Catalog?`))return;customCatalog=customCatalog.filter(x=>x.id!==id);saveCatalog();renderCatalog();toast('Style deleted')}
function renameCatalogStyle(id){const item=customCatalog.find(x=>x.id===id);if(!item)return;const title=prompt('Style name',item.title||'');if(title===null)return;const clean=title.trim();if(!clean){toast('Name cannot be empty');return}item.title=clean;item.tags='custom style '+clean.toLowerCase();saveCatalog();renderCatalog();toast('Style name updated')}
$('catalogInput').addEventListener('change',e=>{startCatalogUpload(e.target.files);e.target.value=''});

function fillProfile(){$('profileBusiness').value=profile.business||'';$('profileName').value=profile.name||'';$('profilePhone').value=profile.phone||'';$('profileLanguage').value=profile.language||'English';$('profileDetails').value=profile.details||''}
function changeProfileLanguage(lang){profile.language=['English','Telugu','Hindi'].includes(lang)?lang:'English';saveProfile();setAppLanguage(profile.language);renderSavedProfile();toast(profile.language==='English'?'Language changed':profile.language==='Telugu'?'భాష మార్చబడింది':'भाषा बदल गई')}
function profileHasData(){return !!(profile.business||profile.name||profile.phone||profile.details)}
function toggleProfileEdit(force){
  const has=profileHasData();
  profileEditOpen=typeof force==='boolean'?force:!profileEditOpen;
  if(!has&&force!==false)profileEditOpen=true;
  $('profileForm').classList.toggle('hidden',!profileEditOpen);
  $('profileEditButton').textContent=profileEditOpen?'Close edit':(has?'✎ Edit profile':'Set up profile');
  if(profileEditOpen){fillProfile();setTimeout(()=>{if($('profileBusiness'))$('profileBusiness').focus()},60)}
}
function renderSavedProfile(){
  const has=profileHasData();
  const primary=profile.business||profile.name||'Set up your shop';
  const secondary=[];
  if(profile.name&&profile.business)secondary.push(profile.name);
  if(profile.phone)secondary.push(profile.phone);
  const detail=profile.details||(!has?'Add your business name, phone and preferred language.':'');
  $('savedProfileCard').innerHTML=`<div class="profile-avatar-large">${esc(initials(primary||'T'))}</div><div class="profile-hero-copy"><h2>${esc(primary)}</h2>${secondary.length?`<p class="profile-handle">${esc(secondary.join(' · '))}</p>`:''}${detail?`<p class="profile-description">${esc(detail)}</p>`:''}</div>`;
  $('profileBusinessSummary').textContent=has?(profile.business||profile.name||profile.phone||'Profile saved'):'Add your shop information';
  $('profileLanguageSummary').textContent=profile.language||'English';
  if(!has)profileEditOpen=true;
  $('profileForm').classList.toggle('hidden',!profileEditOpen);
  $('profileEditButton').textContent=profileEditOpen?'Close edit':(has?'✎ Edit profile':'Set up profile');
}
$('profileForm').addEventListener('submit',e=>{e.preventDefault();if(!checkPhoneInput($('profilePhone')))return;profile={business:$('profileBusiness').value.trim(),name:$('profileName').value.trim(),phone:$('profilePhone').value.trim(),language:$('profileLanguage').value,details:$('profileDetails').value.trim(),savedAt:new Date().toISOString()};saveProfile();setAppLanguage(profile.language);profileEditOpen=false;renderSavedProfile();renderDashboard();toast(translateExact('Profile saved'))});
function toggleProfileManager(id,force){
  const panel=$(id);if(!panel)return;const shouldOpen=typeof force==='boolean'?force:panel.classList.contains('hidden');
  ['stockManager','connectionManager'].forEach(x=>{if($(x))$(x).classList.add('hidden')});
  if(shouldOpen){panel.classList.remove('hidden');if(id==='stockManager')renderStock();if(id==='connectionManager')renderConnections();setTimeout(()=>panel.scrollIntoView({behavior:'smooth',block:'start'}),40)}
}
function renderStock(){
  const pending=shopStock.filter(x=>!x.done).length;$('stockSummary').textContent=shopStock.length?(pending?`${pending} item${pending===1?'':'s'} to buy`:'All requirements marked bought'):'Keep track of materials to buy';
  $('stockList').innerHTML=shopStock.map(x=>`<article class="manager-item ${x.done?'manager-item-done':''}"><div class="manager-item-main"><div class="manager-item-title"><b>${esc(x.item)}</b>${x.qty?`<span>${esc(x.qty)}</span>`:''}</div>${x.notes?`<p>${esc(x.notes)}</p>`:''}<small>${x.done?'Bought / available':'Needed for shop'}</small></div><div class="manager-item-actions"><button type="button" onclick="toggleStockDone('${x.id}')">${x.done?'Need again':'✓ Bought'}</button><button type="button" onclick="editStock('${x.id}')">Edit</button><button type="button" class="danger-mini" onclick="deleteStock('${x.id}')">Delete</button></div></article>`).join('')||'<div class="empty compact-empty">No requirements yet. Add thread, lining, hooks, zips or anything the shop needs.</div>';
}
$('stockForm').addEventListener('submit',e=>{e.preventDefault();const item=$('stockItem').value.trim();if(!item){$('stockItem').focus();return}const id=$('stockEditingId').value;const old=shopStock.find(x=>x.id===id);const row={id:id||'STOCK-'+Date.now(),item,qty:$('stockQty').value.trim(),notes:$('stockNotes').value.trim(),done:old?.done||false,updatedAt:new Date().toISOString()};if(old)shopStock=shopStock.map(x=>x.id===id?row:x);else shopStock.unshift(row);saveStock();resetStockForm();renderStock();toast(old?'Requirement updated':'Requirement added')});
function resetStockForm(){$('stockForm').reset();$('stockEditingId').value='';$('stockSaveBtn').textContent='Add requirement'}
function editStock(id){const x=shopStock.find(y=>y.id===id);if(!x)return;toggleProfileManager('stockManager',true);$('stockEditingId').value=x.id;$('stockItem').value=x.item;$('stockQty').value=x.qty||'';$('stockNotes').value=x.notes||'';$('stockSaveBtn').textContent='Save requirement';$('stockItem').focus()}
function toggleStockDone(id){const x=shopStock.find(y=>y.id===id);if(!x)return;x.done=!x.done;x.updatedAt=new Date().toISOString();saveStock();renderStock();toast(x.done?'Marked as bought':'Added back to requirements')}
function deleteStock(id){if(!confirm('Delete this requirement?'))return;shopStock=shopStock.filter(x=>x.id!==id);saveStock();renderStock();toast('Requirement deleted')}

function renderConnections(){
  $('connectionSummary').textContent=connections.length?`${connections.length} saved connection${connections.length===1?'':'s'}`:'Coworkers, artists and partner contacts';
  $('connectionList').innerHTML=connections.map(x=>`<article class="connection-card"><div class="connection-avatar">${esc(initials(x.name))}</div><div class="connection-copy"><div class="connection-title"><b>${esc(x.name)}</b><span>${esc(x.profession||'Connection')}</span></div>${x.shop?`<p><strong>${esc(x.shop)}</strong></p>`:''}${x.phone?`<p>📞 ${esc(x.phone)}</p>`:''}${x.address?`<p>📍 ${esc(x.address)}</p>`:''}${x.notes?`<p class="connection-notes">${esc(x.notes)}</p>`:''}</div><div class="manager-item-actions connection-actions">${x.phone?`<button type="button" onclick="openWhatsApp(${esc(JSON.stringify(x.phone))},${esc(JSON.stringify('Hi '+x.name))})">WhatsApp</button>`:''}<button type="button" onclick="editConnection('${x.id}')">Edit</button><button type="button" class="danger-mini" onclick="deleteConnection('${x.id}')">Delete</button></div></article>`).join('')||'<div class="empty compact-empty">No connections saved yet. Add coworkers, maggam workers, painters, handloom or crochet artists.</div>';
}
$('connectionForm').addEventListener('submit',e=>{e.preventDefault();if(!checkPhoneInput($('connectionPhone')))return;const name=$('connectionName').value.trim();if(!name){$('connectionName').focus();return}const id=$('connectionEditingId').value;const old=connections.find(x=>x.id===id);const row={id:id||'CON-'+Date.now(),name,profession:$('connectionProfession').value,shop:$('connectionShop').value.trim(),phone:$('connectionPhone').value.trim(),address:$('connectionAddress').value.trim(),notes:$('connectionNotes').value.trim(),createdAt:old?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};if(old)connections=connections.map(x=>x.id===id?row:x);else connections.unshift(row);saveConnections();resetConnectionForm();renderConnections();toast(old?'Connection updated':'Connection saved')});
function resetConnectionForm(){$('connectionForm').reset();$('connectionEditingId').value='';$('connectionSaveBtn').textContent='Save connection'}
function editConnection(id){const x=connections.find(y=>y.id===id);if(!x)return;toggleProfileManager('connectionManager',true);$('connectionEditingId').value=x.id;$('connectionName').value=x.name;$('connectionProfession').value=x.profession||'Coworker';$('connectionShop').value=x.shop||'';$('connectionPhone').value=x.phone||'';$('connectionAddress').value=x.address||'';$('connectionNotes').value=x.notes||'';$('connectionSaveBtn').textContent='Save changes';$('connectionName').focus()}
function deleteConnection(id){if(!confirm('Delete this connection?'))return;connections=connections.filter(x=>x.id!==id);saveConnections();renderConnections();toast('Connection deleted')}
function resetDemoData(){if(!confirm('Replace current orders with the 30 demo orders?'))return;orders=makeSamples();deleted=[];saveOrders();renderDashboard();renderOrders();renderBin();toast('30 demo orders loaded')}
function exportData(){const blob=new Blob([JSON.stringify({profile,orders,deleted,customCatalog,shopStock,connections,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='taraloom-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('Backup downloaded')}

function openImageViewer(src,title='Image'){$('imageViewer').src=src;$('imageViewerTitle').textContent=title;$('imageModal').classList.add('show');document.body.style.overflow='hidden'}
function closeImageViewer(){$('imageModal').classList.remove('show');$('imageViewer').src='';document.body.style.overflow=''}
function imageBackdropClose(e){if(e.target.id==='imageModal')closeImageViewer()}
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeImageViewer();closeDraw();closeCatalogModal(true)}})

const canvas=$('canvas'),ctx=canvas.getContext('2d');
let currentTool='pen',sketchHistory=[],redoHistory=[],activePointerId=null,lastPoint=null;
function canvasData(){
  try{return canvas.toDataURL('image/png')}
  catch(err){console.error('Sketch export failed',err);toast('Could not save this sketch. Please try again.');return ''}
}
function restoreCanvas(data){if(!data)return;const im=new Image();im.onload=()=>{ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(im,0,0,canvas.width,canvas.height)};im.src=data}
function pushHistory(){const data=canvasData();if(!data)return;sketchHistory.push(data);if(sketchHistory.length>40)sketchHistory.shift();redoHistory=[]}
function setTool(tool){currentTool=tool;$('penToolBtn').classList.toggle('tool-active',tool==='pen');$('eraserToolBtn').classList.toggle('tool-active',tool==='eraser')}
function prepCanvas(resetHistory=false){
  ctx.save();ctx.globalCompositeOperation='source-over';ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.strokeStyle='#eee7df';ctx.lineWidth=1;ctx.setLineDash([6,6]);ctx.beginPath();ctx.moveTo(20,70);ctx.lineTo(canvas.width-20,70);ctx.moveTo(canvas.width/2,20);ctx.lineTo(canvas.width/2,canvas.height-20);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#9c948b';ctx.font='26px Arial';ctx.fillText('Draw design or alteration here',30,48);ctx.restore();
  if(resetHistory){const data=canvasData();sketchHistory=data?[data]:[];redoHistory=[]}
}
function drawImageToCanvas(src,done){
  const im=new Image();
  im.onload=()=>{ctx.save();ctx.globalCompositeOperation='source-over';ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);const scale=Math.min(canvas.width/im.width,canvas.height/im.height);const w=im.width*scale,h=im.height*scale,x=(canvas.width-w)/2,y=(canvas.height-h)/2;ctx.drawImage(im,x,y,w,h);ctx.restore();const data=canvasData();sketchHistory=data?[data]:[];redoHistory=[];done&&done()};
  im.onerror=()=>{prepCanvas(true);toast('Reference could not load. You can still draw a sketch.');done&&done()};
  im.src=canvasSafeSrc(src);
}
function canvasPoint(clientX,clientY){const r=canvas.getBoundingClientRect();return{x:(clientX-r.left)*canvas.width/r.width,y:(clientY-r.top)*canvas.height/r.height}}
function beginStroke(clientX,clientY){pushHistory();drawing=true;lastPoint=canvasPoint(clientX,clientY);ctx.beginPath();ctx.moveTo(lastPoint.x,lastPoint.y)}
function continueStroke(clientX,clientY){
  if(!drawing)return;const p=canvasPoint(clientX,clientY);ctx.save();ctx.lineWidth=+$('penSize').value;ctx.lineCap='round';ctx.lineJoin='round';
  if(currentTool==='eraser'){ctx.globalCompositeOperation='source-over';ctx.strokeStyle='#ffffff'}else{ctx.globalCompositeOperation='source-over';ctx.strokeStyle=$('penColor').value}
  ctx.lineTo(p.x,p.y);ctx.stroke();ctx.restore();lastPoint=p;
}
function finishStroke(){drawing=false;activePointerId=null;lastPoint=null;ctx.beginPath()}
function pointerDown(e){e.preventDefault();activePointerId=e.pointerId;try{canvas.setPointerCapture(e.pointerId)}catch{}beginStroke(e.clientX,e.clientY)}
function pointerMove(e){if(!drawing||activePointerId!==e.pointerId)return;e.preventDefault();continueStroke(e.clientX,e.clientY)}
function pointerUp(e){if(activePointerId!==null&&e.pointerId!==activePointerId)return;e.preventDefault();try{canvas.releasePointerCapture(e.pointerId)}catch{}finishStroke()}
if(window.PointerEvent){
  canvas.addEventListener('pointerdown',pointerDown,{passive:false});canvas.addEventListener('pointermove',pointerMove,{passive:false});canvas.addEventListener('pointerup',pointerUp,{passive:false});canvas.addEventListener('pointercancel',pointerUp,{passive:false});
}else{
  canvas.addEventListener('mousedown',e=>{e.preventDefault();beginStroke(e.clientX,e.clientY)});
  canvas.addEventListener('mousemove',e=>{if(drawing){e.preventDefault();continueStroke(e.clientX,e.clientY)}});
  window.addEventListener('mouseup',finishStroke);
  canvas.addEventListener('touchstart',e=>{if(!e.touches[0])return;e.preventDefault();beginStroke(e.touches[0].clientX,e.touches[0].clientY)},{passive:false});
  canvas.addEventListener('touchmove',e=>{if(!drawing||!e.touches[0])return;e.preventDefault();continueStroke(e.touches[0].clientX,e.touches[0].clientY)},{passive:false});
  canvas.addEventListener('touchend',finishStroke,{passive:false});canvas.addEventListener('touchcancel',finishStroke,{passive:false});
}
function openDraw(id){
  activeDrawId=id;activeDrawMode='sketch';activeReferenceIndex=-1;$('drawModal').classList.add('show');$('drawTitle').textContent=id==='form'?'Draw the order sketch':'Draw the design';setTool('pen');finishStroke();
  requestAnimationFrame(()=>{prepCanvas(true);const data=id==='form'?formSketchData:orders.find(x=>x.id===id)?.sketch;if(data){const im=new Image();im.onload=()=>{ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(im,0,0,canvas.width,canvas.height);const snapshot=canvasData();sketchHistory=snapshot?[snapshot]:[];redoHistory=[]};im.src=canvasSafeSrc(data)}})
}
function openDrawOnReference(id,index){
  const o=orders.find(x=>x.id===id),src=o?.referenceImages?.[index];if(!src)return;activeDrawId=id;activeDrawMode='reference-copy';activeReferenceIndex=index;$('drawModal').classList.add('show');$('drawTitle').textContent='Sketch on a copy';setTool('pen');finishStroke();requestAnimationFrame(()=>drawImageToCanvas(src))
}
function closeDraw(){$('drawModal').classList.remove('show');finishStroke();activeDrawId='';activeDrawMode='sketch';activeReferenceIndex=-1}
function clearCanvas(){pushHistory();if(activeDrawMode==='reference-copy'){const o=orders.find(x=>x.id===activeDrawId),src=o?.referenceImages?.[activeReferenceIndex];if(src){drawImageToCanvas(src);return}}prepCanvas(false)}
function undoSketch(){if(sketchHistory.length<=1)return;const now=canvasData();if(now)redoHistory.push(now);const previous=sketchHistory.pop();restoreCanvas(sketchHistory[sketchHistory.length-1]||previous)}
function redoSketch(){if(!redoHistory.length)return;const next=redoHistory.pop();const now=canvasData();if(now)sketchHistory.push(now);restoreCanvas(next)}
function saveSketch(){
  finishStroke();const data=canvasData();if(!data)return;
  if(activeDrawMode==='reference-copy'){const o=orders.find(x=>x.id===activeDrawId);if(o){o.referenceImages=o.referenceImages||[];o.referenceImages.push(data);o.updatedAt=new Date().toISOString();saveOrders();const id=o.id;closeDraw();viewDetails(id);toast('Sketched copy added. Original kept.')}else closeDraw();return}
  if(activeDrawId==='form'){formSketchData=data;$('formSketchPreview').src=data;$('formSketchWrap').classList.remove('hidden');closeDraw();toast('Sketch added');return}
  const o=orders.find(x=>x.id===activeDrawId);if(o){o.sketch=data;o.updatedAt=new Date().toISOString();saveOrders();const id=o.id;closeDraw();viewDetails(id);toast('Sketch saved')}else closeDraw()
}

window.addEventListener('storage',e=>{
  if([STORE,BIN_STORE,PROFILE_STORE,CATALOG_STORE,STOCK_STORE,CONNECTION_STORE].includes(e.key)){
    orders=readJson(STORE,orders);deleted=readJson(BIN_STORE,deleted);profile=readJson(PROFILE_STORE,profile);customCatalog=readJson(CATALOG_STORE,customCatalog);shopStock=readJson(STOCK_STORE,shopStock);connections=readJson(CONNECTION_STORE,connections);
    setAppLanguage(profile.language||'English');fillProfile();renderSavedProfile();renderDashboard();renderOrders();renderCatalog();renderCustomers();renderStock();renderConnections();renderBin();
  }
});

initialize();resetForm();fillProfile();renderSavedProfile();renderDashboard();renderOrders();renderCatalog();renderCustomers();renderStock();renderConnections();renderBin();showScreen('dashboard');startLanguageSystem(profile.language||'English');
