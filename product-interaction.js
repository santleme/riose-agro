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
