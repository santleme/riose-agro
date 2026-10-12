const form=document.getElementById('product-command-form');
const input=document.getElementById('product-command');
const messages=document.getElementById('product-messages');
const timeline=document.getElementById('product-time');
const timelineStart=document.getElementById('timeline-start');
let currentHour=6;

function appendMessage(kind,text){
  const item=document.createElement('div');
  item.className=kind==='user'?'user-message':'system-message';
  if(kind==='user')item.textContent=text;
  else {const mark=document.createElement('span');mark.className='message-mark';mark.textContent='R';const paragraph=document.createElement('p');paragraph.textContent=text;item.append(mark,paragraph);}
  messages.append(item);
  while(messages.children.length>12)messages.firstElementChild.remove();
  messages.scrollTop=messages.scrollHeight;
}
function syncMirror(){const mirror=document.getElementById('diet-mirror');if(mirror)mirror.value=document.getElementById('diet').value;}
function setSelect(id,value){const control=document.getElementById(id);if(!control)return;control.value=value;control.dispatchEvent(new Event('change',{bubbles:true}));}
function roundSupplement(value){return Math.min(4,Math.max(0,Math.round(value*2)/2));}
function submitCommand(raw){
  const command=raw.trim();if(!command)return;
  appendMessage('user',command);
  input.value='';
  const text=command.toLowerCase();
  if(/compare|baseline|counterfactual/.test(text)){
    appendMessage('system','I’ll compare the current pasture world with confinement over 30 days, using the same starting herd and model rules. The comparison panel will show the assumptions and limits.');
    document.getElementById('compare').click();return;
  }
  if(/drought|seca|water access|irrigat|dry spell/.test(text)){
    appendMessage('system','The current model does not simulate drought duration, irrigation, or soil-water balance. Its climate options are mild, hot, and rain, so I left this world unchanged.');return;
  }
  if(/north pasture|east pasture|move (the )?(herd|cattle|animals)|move cattle|move the herd/.test(text)){
    appendMessage('system','Animals move between areas under the model’s own behavior rules. Directly assigning a herd to a named paddock is not supported yet, so I left their positions unchanged.');return;
  }
  const housing=/confinement|barn|feedlot/.test(text)?'barn':/pasture|grass|pasto/.test(text)?'pasture':null;
  const weather=/hot|heat|calor/.test(text)?'hot':/rain|chuv|wet/.test(text)?'rain':/mild|normal|ameno/.test(text)?'normal':null;
  const supplementMatch=text.match(/(?:supplement|suplement\w*)\D{0,16}(\d+(?:[.,]\d+)?)/);
  const diet=/concentrate|concentrado/.test(text)?'concentrate':/balanced|balancead/.test(text)?'balanced':null;
  const changes=[];
  if(housing){document.getElementById(housing==='barn'?'barnbtn':'pasturebtn').click();changes.push(housing==='barn'?'herd location set to confinement':'herd location set to pasture');}
  if(weather){setSelect('weather',weather);changes.push(({normal:'climate set to mild',hot:'climate set to hot',rain:'climate set to rain'})[weather]);}
  if(diet){setSelect('diet',diet);changes.push('feed plan set to '+({pasture:'pasture',balanced:'balanced feed',concentrate:'higher concentrate'})[diet]);}
  if(supplementMatch){const amount=roundSupplement(Number(supplementMatch[1].replace(',','.')));const slider=document.getElementById('supplement');slider.value=String(amount);slider.dispatchEvent(new Event('input',{bubbles:true}));slider.dispatchEvent(new Event('change',{bubbles:true}));changes.push('supplement set to '+amount+' kg DM per animal per day');}
  if(!changes.length){appendMessage('system','I can currently change herd location, climate, feed plan, or supplement, and run the 30-day comparison. I can explain other requests, but I will not change unsupported model variables.');return;}
  appendMessage('system','Applied to the live scenario: '+changes.join('; ')+'. The simulation continues using its current rules; these conditions are not calibrated forecasts.');
}
form.addEventListener('submit',event=>{event.preventDefault();submitCommand(input.value);});
document.querySelectorAll('[data-command]').forEach(button=>button.addEventListener('click',()=>submitCommand(button.dataset.command)));
document.getElementById('diet').addEventListener('change',syncMirror);
document.getElementById('method-link').addEventListener('click',()=>document.getElementById('method').click());
document.addEventListener('riose:world-state',event=>{
  currentHour=event.detail.hour;
  const day=Math.floor(currentHour/24)+1;
  const safeDay=Math.min(30,day);
  timeline.min=String(safeDay);
  if(Number(timeline.value)<safeDay)timeline.value=String(safeDay);
  timelineStart.textContent='Day '+String(safeDay).padStart(2,'0');
  timeline.style.setProperty('--time-progress',((safeDay-1)/29*100)+'%');
  const animal=event.detail.animal;
  const selected=document.getElementById('animalname');
  selected.setAttribute('aria-label',animal.name+' animal '+String(animal.id).padStart(3,'0'));
  syncMirror();
});
timeline.addEventListener('input',()=>{timelineStart.textContent='Day '+String(timeline.value).padStart(2,'0');timeline.style.setProperty('--time-progress',((Number(timeline.value)-1)/29*100)+'%');});
timeline.addEventListener('change',()=>{const day=Math.max(Math.ceil((currentHour-6)/24)+1,Number(timeline.value));timeline.value=String(Math.min(30,day));document.dispatchEvent(new CustomEvent('riose:seek-day',{detail:{day}}));});

const chatToggle=document.getElementById('chat-toggle');
const chatPanel=document.getElementById('world-chat');
const chatClose=document.getElementById('chat-close');
const agentContext=document.getElementById('agent-context');
const contextClose=document.getElementById('context-close');
const contextKicker=document.getElementById('context-kicker');
const animalDetail=document.getElementById('animal-detail');
const entityDetail=document.getElementById('entity-detail');
const entityName=document.getElementById('context-entity-name');
const entitySummary=document.getElementById('context-entity-summary');
const entityValueRow=document.getElementById('context-entity-value-row');
const entityValueLabel=document.getElementById('context-entity-value-label');
const entityValue=document.getElementById('context-entity-value');
const entityAction=document.getElementById('context-entity-action');
let selectedEntity=null;
function renderEntity(detail={}){
  const entity=detail.entity;if(!entity)return;
  selectedEntity=entity;agentContext.hidden=false;animalDetail.hidden=true;entityDetail.hidden=false;
  contextKicker.textContent=entity.type==='paddock'?'Pasture':entity.type==='tree'?'Orchard / tree':entity.type==='water'?'Water':entity.type==='path'?'Farm path':entity.type==='fence'?'Fence':entity.type==='structure'?'Farm structure':entity.type==='crop'?'Crop beds':'Farm element';
  entityName.textContent=entity.name;
  entityValueRow.hidden=true;entityAction.hidden=true;
  const config=detail.config??{};
  if(entity.type==='paddock'){
    entitySummary.textContent='Modelled pasture stock. The world updates the herd and pasture state over time.';
    entityValueRow.hidden=false;entityValueLabel.textContent='Available dry matter';
    const amount=detail.pastures?.[entity.index];entityValue.textContent=Number.isFinite(amount)?Math.round(amount).toLocaleString('en-US')+' kg DM':'—';
  }else if(entity.type==='structure'&&entity.id==='cattle-shed'){
    entitySummary.textContent=config.housing==='barn'?'The herd is currently configured for confinement.':'This structure is part of the farm. The herd is currently configured for pasture.';
    entityAction.hidden=false;entityAction.textContent=config.housing==='barn'?'Set herd to pasture':'Set herd to confinement';entityAction.dataset.housing=config.housing==='barn'?'pasture':'barn';
  }else if(entity.type==='water')entitySummary.textContent='Water source in the scene. Individual water volume and depletion are not modelled yet.';
  else if(entity.type==='tree')entitySummary.textContent='Tree in the farm scene. Canopy growth and shade are not modelled yet.';
  else if(entity.type==='fence')entitySummary.textContent='Fence boundary in the farm scene. It does not currently constrain animal movement.';
  else if(entity.type==='path')entitySummary.textContent='Farm route connecting the pastures and structures.';
  else if(entity.type==='crop')entitySummary.textContent='Crop beds in the farm scene. Crop growth is not part of the current model.';
  else if(entity.type==='vehicle')entitySummary.textContent='Farm vehicle in the scene. Machinery deployment is not modelled yet.';
  else entitySummary.textContent='Structure in the farm scene.';
}
entityAction.addEventListener('click',()=>{if(!selectedEntity||entityAction.hidden)return;const target=entityAction.dataset.housing;document.getElementById(target==='barn'?'barnbtn':'pasturebtn').click();renderEntity({entity:selectedEntity,config:{housing:target}});});
function setChatOpen(open){chatPanel.hidden=!open;chatToggle.hidden=open;chatToggle.setAttribute('aria-expanded',String(open));if(open)input.focus();else chatToggle.focus();}
chatToggle.addEventListener('click',()=>setChatOpen(true));
chatClose.addEventListener('click',()=>setChatOpen(false));
contextClose.addEventListener('click',()=>{agentContext.hidden=true;selectedEntity=null;});
document.addEventListener('riose:agent-selected',()=>{selectedEntity=null;agentContext.hidden=false;animalDetail.hidden=false;entityDetail.hidden=true;contextKicker.textContent='Selected animal';});
document.addEventListener('riose:entity-selected',event=>renderEntity(event.detail));
document.addEventListener('riose:world-state',event=>{if(selectedEntity?.type==='paddock'){const amount=event.detail.pastures?.[selectedEntity.index];entityValue.textContent=Number.isFinite(amount)?Math.round(amount).toLocaleString('en-US')+' kg DM':'—';}if(selectedEntity?.type==='structure'&&selectedEntity.id==='cattle-shed')renderEntity({...event.detail,entity:selectedEntity});});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!chatPanel.hidden)setChatOpen(false);});
