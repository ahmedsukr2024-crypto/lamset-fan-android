const fs=require('node:fs');
const assert=require('node:assert/strict');
const html=fs.readFileSync('www/index.html','utf8');
const css=fs.readFileSync('www/lamset-appearance-controls.css','utf8');

for(const color of ['#0866FF','#8B4B9F','#FB6518','#00C8F0'])assert(html.includes(color),'missing palette color '+color);
for(const id of ['appearanceMode','uiFontScale','uiDensity','uiSpacing','uiButtonShape','uiButtonEffect','uiCardDensity','reduceMotionSetting'])assert(html.includes('id="'+id+'"'),'missing appearance setting '+id);
for(const value of ['comfortable','standard','compact','narrow','medium','wide','round','raised','flat','normal'])assert(html.includes('value="'+value+'"'),'missing appearance option '+value);
for(const key of ['normalizeAppearanceSettings','readAppearanceSettings','beginAppearanceDraft','applyLamsetAppearance','renderAppearanceSettings','previewAppearanceSettings','saveAppearanceSettings','setAppearancePalette','commitAppearanceSettings','cancelAppearanceSettings','resetAppearanceSettings'])assert(html.includes('function '+key+'('),'missing appearance function '+key);

assert(html.includes('onchange="previewAppearanceSettings()"'),'appearance controls must preview before save');
assert(!html.includes('onchange="saveAppearanceSettings()"'),'appearance controls must not persist changes immediately');
assert(html.includes('function previewAppearanceSettings(){')&&html.includes('lfAppearanceDraft=normalizeAppearanceSettings(next);applyLamsetAppearance();'),'preview must apply a draft without saving it');
assert(!/function previewAppearanceSettings\(\)\{[\s\S]*?db\.appSettings\s*=/.test(html),'preview must not write to persistent app settings');
assert(html.includes('function commitAppearanceSettings(){')&&html.includes('db.appSettings={...previous,...lfAppearanceDraft};')&&html.includes('if(!save())'),'save action must persist the reviewed draft with rollback on failure');
assert(html.includes('function cancelAppearanceSettings(){lfAppearanceDraft=null;applyLamsetAppearance();'),'cancel must restore the saved appearance');
assert(html.includes("function resetAppearanceSettings(){lfAppearanceDraft={mode:'system',palette:'facebook'"),'reset must prepare defaults for preview, not save immediately');
assert(html.includes("if(page!=='settings')lfDiscardAppearanceDraft(false);"),'leaving settings must discard an unsaved preview');
assert(html.includes('root.dataset.buttonShape=p.buttonShape')&&html.includes('root.dataset.buttonEffect=p.buttonEffect')&&html.includes('root.dataset.cardDensity=p.cardDensity')&&html.includes('root.dataset.spacing=p.spacing'),'all appearance choices must apply globally');

for(const selector of ['html[data-button-shape="medium"]','html[data-button-effect="flat"]','html[data-card-density="compact"]','html[data-spacing="narrow"]','html[data-spacing="wide"]','html[data-font-scale="large"]'])assert(css.includes(selector),'missing global appearance style '+selector);
assert(css.includes('button.lf-palette-option.selected'),'selected palette state missing');
console.log('Approved appearance preview, save/cancel/reset flow, persistence guards, and global styles checks passed.');
