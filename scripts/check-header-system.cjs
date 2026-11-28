const fs=require('fs');
const html=fs.readFileSync('www/index.html','utf8');
const css=fs.readFileSync('www/lamset-design-system.css','utf8');
const ids=['lfMenuToggle','lfHeaderAlerts','lfHeaderSettings','lfHeaderSearch','lfHeaderAlertCount'];
for(const id of ids)if(!html.includes('id="'+id+'"'))throw new Error('Missing header control: '+id);
if((html.match(/id="lf-header-system-v1"/g)||[]).length!==1)throw new Error('Expected one canonical header stylesheet');
for(const id of ['lf-header-final-icons-v5','lf-android-fixed-header-v4','lf-header-no-button-chrome-v7','lf-header-final-icons-v6','lf-header-notification-badge-material-v1'])if(html.includes('id="'+id+'"'))throw new Error('Legacy header stylesheet remains: '+id);
if(/\.iconbtn,\.lf-header-menu,\.lf-drawer-close,\.lf-header-alerts,\.lf-header-settings\{[^}]*border-radius:50%/s.test(css))throw new Error('Legacy circular header rule remains');
if(/\.lf-app-header::before\s*\{/.test(css))throw new Error('Header pseudo surface remains');
const start=html.indexOf('<header class="lf-app-header"'),end=html.indexOf('</header>',start),header=html.slice(start,end);
const order=['lfMenuToggle','lfHeaderAlerts','lfHeaderSettings','lfHeaderSearch'].map(id=>header.indexOf('id="'+id+'"'));
if(!order.every((v,i)=>v>=0&&(i===0||v>order[i-1])))throw new Error('Header button order changed');
if(!/id="lfHeaderAlertCount"[^>]*aria-live="polite"/.test(header))throw new Error('Notification badge accessibility missing');

const styleStart=html.indexOf('<style id="lf-header-system-v1">');
const styleEnd=html.indexOf('</style>',styleStart);
if(styleStart<0||styleEnd<0)throw new Error('Canonical header style block missing');
const headerCss=html.slice(styleStart,styleEnd);
for(const rule of [
  '.lf-header-actions>button',
  'border-radius:0!important',
  'background:transparent!important',
  'html[data-theme="dark"]',
  '#lfDrawerBackdrop.lf-drawer-backdrop',
  'inset:0!important',
  'z-index:310!important',
  '#lfSideDrawer.lf-side-drawer',
  'z-index:320!important'
])if(!headerCss.includes(rule))throw new Error('Canonical header/drawer rule missing: '+rule);
if(/\.lf-app-header\{[^}]*position:fixed/s.test(headerCss))throw new Error('Legacy floating header positioning remains');
if(/\.lf-header-actions>button\{[^}]*border-radius:(?!0)/s.test(headerCss))throw new Error('Circular header button styling returned');


const finalStyleStart=html.lastIndexOf('<style id="lf-header-icons-final-override-v2">');
const finalStyleEnd=html.indexOf('</style>',finalStyleStart);
const bodyEnd=html.lastIndexOf('</body>');
if(finalStyleStart<0||finalStyleEnd<0||bodyEnd<finalStyleEnd)throw new Error('Final header icon override is missing or misplaced');
if(html.indexOf('<style',finalStyleEnd)>bodyEnd)throw new Error('A later stylesheet can override the final header icon cleanup');
const finalHeaderCss=html.slice(finalStyleStart,finalStyleEnd);
for(const id of ['lfMenuToggle','lfHeaderAlerts','lfHeaderSettings','lfHeaderSearch']){
 if(!finalHeaderCss.includes('#'+id))throw new Error('Final icon cleanup missing: '+id);
}
for(const rule of ['border:0!important','border-radius:0!important','background:transparent!important','background-image:none!important','box-shadow:none!important','content:none!important','focus-visible']){
 if(!finalHeaderCss.includes(rule))throw new Error('Final icon cleanup rule missing: '+rule);
}

console.log('Header system checks passed.');
