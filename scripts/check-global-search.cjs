const fs=require('fs');
const html=fs.readFileSync('www/index.html','utf8');
const css=fs.readFileSync('www/lamset-design-system.css','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const mustHtml=[
 ['global search modal','lfGlobalSearchModal'],
 ['all collection scan','Object.entries(db||{})'],
 ['recursive record search','lfGlobalSearchValues'],
 ['invoice number search','invoiceNumber'],
 ['search result routing','openLamsetGlobalSearchResult'],
 ['single close control','data-global-search-close'],
 ['page search registry','lfGlobalSearchPages'],
 ['page result group','الصفحات'],
 ['record result group','نتائج البيانات والسجلات'],
 ['direct page navigation','if(kind===\'page\'){tab(target);return}'],
 ['page alias matching','lfGlobalSearchPageResults']
];
for(const [label,needle] of mustHtml){if(!html.includes(needle))throw new Error('Missing '+label)}
if(html.includes('lf-global-search-page-layout-v2'))throw new Error('Search layout CSS was injected into document preview HTML');
if(html.includes('</span>×'))throw new Error('Duplicate close glyph remains');
const searchStart=html.indexOf('<div id="lfGlobalSearchModal"');
const searchEnd=html.indexOf('</section></div>',searchStart);
if(searchStart<0||searchEnd<0)throw new Error('Global search page markup is incomplete');
const searchMarkup=html.slice(searchStart,searchEnd);
if((searchMarkup.match(/data-global-search-close/g)||[]).length!==1)throw new Error('Global search must have exactly one close control');
if((searchMarkup.match(/data-lucide="x"/g)||[]).length!==1)throw new Error('Global search must have exactly one close icon');
if(!html.includes('LamsetLocalDB.listTreasuryMovements()')||!html.includes('LamsetLocalDB.listCashLinks()')||!html.includes('LamsetLocalDB.listTreasuryCloseouts()'))throw new Error('Treasury records are missing from global search');
const pageBlock=html.slice(html.indexOf('const lfGlobalSearchPages=['),html.indexOf('];',html.indexOf('const lfGlobalSearchPages=['))+2);
const pageIds=[...pageBlock.matchAll(/\bid:'([^']+)'/g)].map(m=>m[1]);
if(pageIds.length!==17)throw new Error('Expected all 17 top-level application pages in global search; found '+pageIds.length);
const panelTags=[...html.matchAll(/<(?:section|div)\\b[^>]*>/g)].map(match=>match[0]);
for(const id of pageIds){const panel=panelTags.some(tag=>tag.includes('id="'+id+'"')&&/\\bclass="[^"]*\\bpanel\\b/.test(tag));if(!panel)throw new Error('Page shortcut points to a missing panel: '+id)}
const fullScreen=['#lfGlobalSearchModal.lf-global-search-modal','height:100%!important','max-width:none!important','align-items:stretch!important'];
for(const needle of fullScreen){if(!css.includes(needle))throw new Error('Missing full-screen search CSS: '+needle)}
for(const needle of ['.lf-global-search-group{','.lf-global-search-group-title{'])if(!css.includes(needle))throw new Error('Missing grouped search styling: '+needle);
if(!css.includes('Keep header icon hit areas square')||!css.includes('place-items:center!important')||!css.includes('border:0!important'))throw new Error('Header centering and border removal rules missing');
if(!pkg.scripts['check:all'].includes('check-global-search.cjs'))throw new Error('Global search check not included in check:all');
console.log('Global search page shortcuts, 17 routes, aliases, treasury coverage, grouped results, and header checks passed');
