const fs=require('fs');
const html=fs.readFileSync('www/index.html','utf8');
const id='lf-accessible-theme-layout-v1';
const marker='<style id="'+id+'">';
const start=html.indexOf(marker);
const end=html.indexOf('</style>',start);
if(start<0||end<0)throw new Error('Final accessibility theme stylesheet is missing');
if(html.indexOf(marker,start+1)>=0)throw new Error('Duplicate accessibility theme stylesheet');
const css=html.slice(start,end);
const required=[
 '--lf-text:#1C1E21','--lf-muted:#65676B','--lf-border:#CED0D4',
 '--lf-text:#E4E6EB','--lf-muted:#B0B3B8','--lf-border:#4A4D52',
 'html[data-theme="dark"]','button.danger','button.success','button.warning',
 'white-space:normal','overflow-wrap:anywhere','min-width:0',
 'white-space:nowrap!important','word-break:normal!important','min-width:fit-content!important','flex-wrap:wrap!important',
 '.tablewrap,.table-wrap','prefers-reduced-motion'
];
for(const token of required)if(!css.includes(token))throw new Error('Accessibility theme rule missing: '+token);
if(!/html\[data-theme="dark"\][\s\S]*?button:not\(\.nav button\)[\s\S]*?color:var\(--lf-action-ink,var\(--lf-text\)\)!important/.test(css))
 throw new Error('Dark-mode secondary button text contrast rule is missing');
if(!/html\[data-theme="dark"\][\s\S]*?\.card[\s\S]*?color:var\(--lf-text\)!important/.test(css))
 throw new Error('Dark-mode card text contrast rule is missing');
if(!/button\s*\{[\s\S]*?white-space:nowrap!important[\s\S]*?overflow-wrap:normal!important/.test(css))
 throw new Error('Button labels must remain on one line');
if(!/:where\(\.actions,[\s\S]*?flex-wrap:wrap!important/.test(css))
 throw new Error('Action groups must wrap rather than compress button labels');

const fitScript=html.slice(html.indexOf('<script id="lf-button-label-fit-v1">'),html.indexOf('</script>',html.indexOf('<script id="lf-button-label-fit-v1">'))+9);
if(!fitScript.includes('MAX_SHRINK_RATIO=0.90')||!fitScript.includes('MIN_FONT_SIZE=12')||!fitScript.includes('button.scrollWidth>button.clientWidth+1'))
 throw new Error('Adaptive button label fitting behavior is missing');
if(!fitScript.includes('MutationObserver')||!fitScript.includes('ResizeObserver'))
 throw new Error('Adaptive button label fitting must support dynamic content and resizing');

console.log('Accessibility theme, button labels and text-layout checks passed.');
