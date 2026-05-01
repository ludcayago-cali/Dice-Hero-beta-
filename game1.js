const $=s=>document.querySelector(s);const $$=s=>[...document.querySelectorAll(s)];
const State={MENU:'MENU',LOBBY:'LOBBY',CHAR:'CHARACTER_SELECT',BATTLE:'BATTLE',RESULT:'RESULT'};
let game={state:State.MENU,mode:'bot',playerLevel:1,story:{level:1,stage:1},selected:[],loadouts:{},charProgress:{},activeUnitId:null,turn:'player',dice:null,path:[],phase:'select',units:[],blocked:new Set(),log:[],lobbyCode:null,lastExpSummary:'',actionLock:false};
const chars=[
{id:'knight',name:'Iron Knight',role:'Fighter',unlock:1,hp:12,atk:2,skills:[['slash','Power Slash','active','Deal +1 attack damage.'],['guard','Stone Guard','active','Block: reduce next damage by 2.'],['armor','Iron Skin','passive','Take -1 damage from attacks.'],['taunt','Taunt','active','Enemy bot prefers this unit next turn.'],['counter','Counter Edge','passive','Deal 1 return damage after block.'],['charge','Shield Charge','active','Attack then push target 1 tile if possible.']]},
{id:'mage',name:'Blue Mage',role:'Mage',unlock:1,hp:9,atk:2,skills:[['bolt','Arc Bolt','active','Ranged attack up to 2 straight tiles.'],['heal','Mend','active','Heal ally for 3 anywhere.'],['focus','Arcane Focus','passive','Heal +1.'],['spark','Chain Spark','active','Deal 1 damage to nearby second enemy.'],['ward','Soft Ward','passive','First incoming hit each battle -1 damage.'],['renew','Renew','active','Heal 2 and cleanse block penalty.']]},
{id:'ranger',name:'Red Ranger',role:'Archer',unlock:10,hp:10,atk:2,skills:[['shot','Straight Shot','active','Attack up to 3 straight tiles.'],['trap','Pin Trap','active','Target loses 1 movement next turn.'],['eagle','Eagle Eye','passive','Range +1 on straight attacks.'],['rapid','Rapid Shot','active','Two weak shots for 1 damage each.'],['evade','Light Step','passive','First hit has 25% miss chance.'],['mark','Mark Target','active','Target takes +1 damage this round.']]},
{id:'cleric',name:'Sun Cleric',role:'Mage',unlock:20,hp:10,atk:1,skills:[['smite','Smite','active','Ranged holy hit for 2.'],['prayer','Prayer','active','Heal ally for 4.'],['blessing','Blessing','passive','Ally heals receive +1.'],['shield','Holy Shield','active','Give ally -2 damage shield.'],['aura','Calm Aura','passive','End turn heals self 1 if damaged.'],['revive','Last Light','active','Once per battle revive ally at 3 HP.']]}
];

const SAVE_KEY='dice_tactics_save_v1';
const XP_REQ=[0,100,150,220,300,400,520,660,820,1000];
function ensureProgress(){
  chars.forEach(c=>{
    if(!game.charProgress[c.id])game.charProgress[c.id]={level:1,exp:0};
    if(!game.loadouts[c.id])game.loadouts[c.id]=c.skills.slice(0,2).map(s=>s[0]);
  });
}
function safeLoad(){
  try{
    const raw=localStorage.getItem(SAVE_KEY);
    if(raw){
      const data=JSON.parse(raw);
      game.playerLevel=data.playerLevel||1;
      game.story=data.story||{level:1,stage:1};
      game.charProgress=data.charProgress||{};
      game.loadouts=data.loadouts||{};
    }
  }catch(e){console.warn('Save load failed',e)}
  ensureProgress();
}
function saveGame(){
  try{ensureProgress();localStorage.setItem(SAVE_KEY,JSON.stringify({playerLevel:game.playerLevel,story:game.story,charProgress:game.charProgress,loadouts:game.loadouts}));}
  catch(e){console.warn('Save failed',e)}
}
function resetSave(){
  if(!confirm('Clear saved progress on this browser?'))return;
  localStorage.removeItem(SAVE_KEY);
  game.playerLevel=1;game.story={level:1,stage:1};game.loadouts={};game.charProgress={};ensureProgress();
  renderMenuProgress();renderChars();$('#skillPanel h3').textContent='Select a character';$('#skillContent').innerHTML='';
}
function charProg(id){ensureProgress();return game.charProgress[id]}
function expNeeded(level){return level>=10?0:XP_REQ[level]}
function expPercent(id){const p=charProg(id),need=expNeeded(p.level);return need?Math.min(100,Math.floor((p.exp/need)*100)):100}
function expBarHtml(id){const p=charProg(id),need=expNeeded(p.level),pct=expPercent(id);return `<div class="expWrap"><div class="expTop"><span>Lv ${p.level}</span><span>${need?`${p.exp}/${need} EXP`:'MAX'}</span></div><div class="expBar"><div class="expFill" style="width:${pct}%"></div></div><small>${pct}%</small></div>`}
function addCharacterExp(charId,amount){
  const c=chars.find(x=>x.id===charId);if(!c)return '';
  const p=charProg(charId);let leveled=[];p.exp+=amount;
  while(p.level<10&&p.exp>=expNeeded(p.level)){p.exp-=expNeeded(p.level);p.level++;leveled.push(p.level)}
  return `${c.name}: +${amount} EXP (${p.level>=10?'MAX':p.exp+'/'+expNeeded(p.level)})${leveled.length?' | Level up: '+leveled.join(' → '):''}`;
}
function awardCharacterExp(win){
  const reward=game.mode==='story'?(win?40:15):game.mode==='bot'?(win?30:10):(win?25:10);
  const used=[...new Set(game.units.filter(u=>u.team==='player').map(u=>u.char.id))];
  const lines=used.map(id=>addCharacterExp(id,reward));
  game.lastExpSummary=lines.join('\n');
  saveGame();
  return {reward,lines};
}
function renderMenuProgress(){const el=$('#saveInfo');if(el)el.textContent=`Saved: Player Lv ${game.playerLevel} | Story ${game.story.level}-${game.story.stage}`}
function initSaveUI(){
  const panel=document.querySelector('.menuPanel');
  if(panel&&!$('#saveInfo')){const info=document.createElement('div');info.id='saveInfo';info.className='saveInfo';panel.appendChild(info);const btn=document.createElement('button');btn.id='resetSaveBtn';btn.textContent='Clear Save';btn.onclick=resetSave;panel.appendChild(btn)}
  renderMenuProgress();
}
function show(id){$$('.screen').forEach(x=>x.classList.remove('active'));$(id).classList.add('active')}
function setState(s){game.state=s;show(s===State.MENU?'#menuScreen':s===State.LOBBY?'#lobbyScreen':s===State.CHAR?'#characterScreen':s===State.BATTLE?'#battleScreen':'#resultScreen');if(s===State.MENU)renderMenuProgress()}
function log(t){game.log.unshift(t);renderLog()}
function renderLog(){if(!$('#gameLog'))return;$('#gameLog').innerHTML=game.log.map(x=>`<div class="logLine">${x}</div>`).join('')}
$$('[data-action]').forEach(b=>b.onclick=()=>{let a=b.dataset.action;if(a==='story')startChar('story');if(a==='bot')startChar('bot');if(a==='create')createLobby();if(a==='join')joinLobby()});
$('#backMenuBtn').onclick=()=>setState(State.MENU);$('#lobbyBotBtn').onclick=()=>startChar('bot');$('#simulateJoinBtn').onclick=()=>{game.mode='pvp';$('#lobbyStatus').textContent='Opponent joined. Moving to character selection...';setTimeout(()=>startChar('pvp'),500)};
$('#charBackBtn').onclick=()=>setState(State.MENU);$('#startBattleBtn').onclick=()=>startBattle();$('#rollBtn').onclick=rollDice;$('#endTurnBtn').onclick=endTurn;$('#returnLobbyBtn').onclick=()=>confirm('Exit battle?')&&setState(State.MENU);$('#resultMenuBtn').onclick=()=>setState(State.MENU);$('#nextBtn').onclick=()=>{if(game.mode==='story')startChar('story');else startChar(game.mode)};
function createLobby(){game.lobbyCode=Math.random().toString(36).substring(2,7).toUpperCase();$('#lobbyCode').textContent=game.lobbyCode;$('#lobbyStatus').textContent='Waiting for opponent...';setState(State.LOBBY)}
function joinLobby(){let code=$('#joinCodeInput').value.trim().toUpperCase();if(code.length<3)return alert('Enter a game code.');game.lobbyCode=code;$('#lobbyCode').textContent=code;$('#lobbyStatus').textContent='Joined lobby. Simulating host connection...';setState(State.LOBBY);setTimeout(()=>startChar('pvp'),700)}
function startChar(mode){ensureProgress();game.mode=mode;game.selected=[];$('#charModeTitle').textContent=mode==='story'?`Story Mode: Level ${game.story.level}-${game.story.stage}`:mode==='pvp'?'PvP Character Selection':'Bot Battle Character Selection';renderChars();setState(State.CHAR)}
function renderChars(){
  const wrap=$('#characterList');
  wrap.innerHTML='';
  chars.forEach(c=>{
    let locked=game.playerLevel<c.unlock, sel=game.selected.includes(c.id);
    let d=document.createElement('div');
    d.className=`charCard ${sel?'selected':''} ${locked?'locked':''}`;
    d.innerHTML=`<h3>${c.name}</h3><p>${c.role}</p><p>${locked?'Unlock at player level '+c.unlock:'Unlocked'}</p>${expBarHtml(c.id)}`;
    d.onclick=()=>{
      if(locked)return;
      if(sel){game.selected=game.selected.filter(x=>x!==c.id)}
      else if(game.selected.length<2){game.selected.push(c.id);defaultLoadout(c)}
      renderChars();
      renderSkills(c.id);
    };
    wrap.appendChild(d)
  });
  updateStartButton();
}
function defaultLoadout(c){
  if(game.loadouts[c.id])return;
  game.loadouts[c.id]=c.skills.slice(0,2).map(s=>s[0]);
}
function unlockedSkillCount(c){let lvl=charProg(c.id).level;return 3+(lvl>=3?1:0)+(lvl>=5?1:0)+(lvl>=7?1:0)}
function validLoadout(id){return game.loadouts[id]&&game.loadouts[id].length===2}
function updateStartButton(){
  let ready=game.selected.length===2&&game.selected.every(validLoadout);
  $('#selectedSummary').textContent=`Selected: ${game.selected.length} / 2 | Skills ready: ${game.selected.filter(validLoadout).length} / ${game.selected.length}`;
  $('#startBattleBtn').disabled=!ready;
}
function toggleSkill(charId,skillId,unlocked){
  const note=$('#skillNote');
  if(!unlocked){if(note)note.textContent='Skill is locked.';return;}
  let load=game.loadouts[charId]||[];
  if(load.includes(skillId)){
    load=load.filter(x=>x!==skillId);
  }else{
    if(load.length>=2){if(note)note.textContent='Only 2 skills can be equipped per character. Unequip one first.';return;}
    load.push(skillId);
  }
  game.loadouts[charId]=load;
  saveGame();
  renderSkills(charId);
  updateStartButton();
}
function renderSkills(id){
  let c=chars.find(x=>x.id===id);
  if(!c)return;
  defaultLoadout(c);
  let load=game.loadouts[c.id]||[];
  $('#skillPanel h3').textContent=c.name+' Skills';
  $('#skillContent').innerHTML=`${expBarHtml(c.id)}<p id="skillNote">Choose exactly 2 skills for this character. Equipped: ${load.length}/2.</p><div class="skillGrid">${c.skills.map((s,i)=>{let unlocked=i<unlockedSkillCount(c);let eq=load.includes(s[0]);let unlockText=i<3?'Available at Lv 1':i===3?'Unlocks at Lv 3':i===4?'Unlocks at Lv 5':'Unlocks at Lv 7';return `<div class="skillCard ${eq?'equipped':''} ${!unlocked?'lockedSkill':''}" onclick="toggleSkill('${c.id}','${s[0]}',${unlocked})"><b>${s[1]}</b> <small>${s[2]}</small><p>${s[3]}</p><small>${unlocked?(eq?'Equipped':'Unlocked - click to equip'):unlockText}</small></div>`}).join('')}</div>`;
  updateStartButton();
}


function startBattle(){if(game.selected.length!==2||!game.selected.every(validLoadout)){alert('Choose exactly 2 skills for each selected character.');return;}game.units=[];game.blocked=new Set(['2,2','3,2','5,3','1,5','6,5','4,6']);let picks=game.selected.map(id=>chars.find(c=>c.id===id));picks.forEach((c,i)=>game.units.push(makeUnit(c,'player',0,i?2:5)));let enemies=game.mode==='story'&&game.story.stage===3?[chars[0],chars[1],chars[2]]:[chars[0],chars[1]];enemies.forEach((c,i)=>game.units.push(makeUnit(c,'enemy',7,i?2:5,i===2)));game.turn='player';game.phase='select';game.dice=null;game.path=[];game.activeUnitId=null;game.log=[];$('#modeLabel').textContent=game.mode.toUpperCase();$('#storyLabel').textContent=game.mode==='story'?`Level ${game.story.level} Stage ${game.story.stage}`:'';setState(State.BATTLE);renderBoard();log('Select a player unit, then roll dice.')}
function makeUnit(c,team,x,y,boss=false){return{id:team+'_'+c.id+'_'+Math.random().toString(36).slice(2,5),char:c,team,x,y,hp:c.hp+(boss?4:0),maxHp:c.hp+(boss?4:0),atk:c.atk+(boss?1:0),block:false,acted:false,taunt:false}}
function renderBoard(){const b=$('#board');b.innerHTML='';for(let y=0;y<8;y++)for(let x=0;x<8;x++){let t=document.createElement('div');t.className=`tile ${(x+y)%2?'dark':''} ${game.blocked.has(`${x},${y}`)?'blocked':''}`;t.dataset.x=x;t.dataset.y=y;t.textContent=`${x},${y}`;if(isValidNext(x,y))t.classList.add('valid');if(game.path.some(p=>p.x===x&&p.y===y))t.classList.add('path');t.onclick=()=>tileClick(x,y);let u=game.units.find(u=>u.x===x&&u.y===y&&u.hp>0);if(u){let el=document.createElement('div');el.className=`unit ${u.team} ${u.id===game.activeUnitId?'active':''}`;el.innerHTML=`${u.char.role[0]}<span class="hpTag">${u.hp}</span>`;t.appendChild(el)}b.appendChild(t)}renderStatus();renderLog();$('#turnLabel').textContent=game.turn==='player'?'Player Turn':'Enemy Turn';$('#diceBox').textContent=game.dice??'-'}
function renderStatus(){$('#unitStatus').innerHTML=game.units.map(u=>`<div class="statusUnit"><b>${u.team==='player'?'Blue':'Red'} ${u.char.name}</b><br>HP ${u.hp}/${u.maxHp} ${u.hp<=0?'DOWN':''}</div>`).join('')}
function current(){return game.units.find(u=>u.id===game.activeUnitId)}
function tileClick(x,y){if(game.turn!=='player'||game.actionLock)return;let u=game.units.find(u=>u.x===x&&u.y===y&&u.team==='player'&&u.hp>0&&!u.acted);if(game.phase==='select'&&u){game.activeUnitId=u.id;game.phase='roll';log(`${u.char.name} selected. Roll dice.`);renderBoard();return}if(game.phase==='move'){let a=current();if(!a)return;let last=game.path.at(-1)||{x:a.x,y:a.y};if(Math.abs(last.x-x)+Math.abs(last.y-y)!==1)return log('Invalid tile: move orthogonally only.');if(game.blocked.has(`${x},${y}`)||unitAtExcept(x,y,a.id))return log('Invalid tile: blocked or occupied.');game.path.push({x,y});renderBoard();if(game.path.length===game.dice)setTimeout(resolveMove,250)}}
function isValidNext(x,y){if(game.phase!=='move')return false;let a=current();if(!a)return false;let last=game.path.at(-1)||{x:a.x,y:a.y};return Math.abs(last.x-x)+Math.abs(last.y-y)===1&&!game.blocked.has(`${x},${y}`)&&!unitAtExcept(x,y,a.id)}
function unitAt(x,y){return game.units.find(u=>u.x===x&&u.y===y&&u.hp>0)}
function rollDice(){if(game.actionLock)return;if(game.turn!=='player'||game.phase!=='roll')return log('Select an unused character first.');let box=$('#diceBox');box.classList.add('rolling');let n=0,spin=setInterval(()=>{box.textContent=1+Math.floor(Math.random()*6);n++},70);setTimeout(()=>{clearInterval(spin);box.classList.remove('rolling');game.dice=1+Math.floor(Math.random()*6);box.textContent=game.dice;game.phase='move';game.path=[];log(`Rolled ${game.dice}. Move exactly ${game.dice} steps.`);renderBoard()},650)}
async function resolveMove(){
  let a=current();
  if(!a||game.actionLock)return;
  game.actionLock=true;
  const steps=[...game.path];
  game.path=[];
  game.phase='moving';
  for(const step of steps){
    a.x=step.x;
    a.y=step.y;
    renderBoard();
    const unitEl=getUnitEl(a);
    if(unitEl)unitEl.classList.add(game.dice<=2?'walkAnim':'runAnim');
    await wait(game.dice<=2?360:260);
  }
  game.phase='action';
  game.actionLock=false;
  renderBoard();
  let usable=getUsableSkills(a);
  if(usable.length)showActions(a,usable);
  else{log('No usable equipped skill from final tile. Action skipped.');a.acted=true;game.phase='select';checkTurnDone();renderBoard()}
}
function adjacentEnemies(a){return game.units.filter(u=>u.team!==a.team&&u.hp>0&&Math.abs(u.x-a.x)+Math.abs(u.y-a.y)===1)}
function getSkillDef(charId,skillId){let c=chars.find(x=>x.id===charId);return c?.skills.find(s=>s[0]===skillId)}
function equippedActiveSkills(a){return (game.loadouts[a.char.id]||[]).map(id=>getSkillDef(a.char.id,id)).filter(s=>s&&s[2]==='active')}
function inStraightRange(a,t,r){return (a.x===t.x||a.y===t.y)&&Math.abs(a.x-t.x)+Math.abs(a.y-t.y)<=r}
function skillTargets(a,skillId){
  const enemies=game.units.filter(u=>u.team!==a.team&&u.hp>0);
  const allies=game.units.filter(u=>u.team===a.team&&u.hp>0&&u.hp<u.maxHp);
  if(['heal','prayer','renew'].includes(skillId))return allies;
  if(['guard','shield'].includes(skillId))return [a];
  if(['bolt','smite'].includes(skillId))return enemies.filter(t=>inStraightRange(a,t,2));
  if(skillId==='shot')return enemies.filter(t=>inStraightRange(a,t,3));
  return enemies.filter(t=>Math.abs(t.x-a.x)+Math.abs(t.y-a.y)===1);
}
function getUsableSkills(a){return equippedActiveSkills(a).map(s=>({def:s,targets:skillTargets(a,s[0])})).filter(x=>x.targets.length)}
function directionFrom(a,t){
  if(t.x===a.x&&t.y===a.y)return 'Self';
  if(t.x===a.x&&t.y<a.y)return 'North';
  if(t.x===a.x&&t.y>a.y)return 'South';
  if(t.y===a.y&&t.x>a.x)return 'East';
  if(t.y===a.y&&t.x<a.x)return 'West';
  return `${t.x},${t.y}`;
}
function targetLabel(a,t){
  const side=t.team==='player'?'Blue':'Red';
  return `${directionFrom(a,t)}: ${side} ${t.char.name} HP ${t.hp}/${t.maxHp}`;
}
function addSkipButton(p,a){
  let skip=document.createElement('button');
  skip.textContent='Skip';
  skip.onclick=()=>{p.classList.add('hidden');a.acted=true;game.phase='select';checkTurnDone();renderBoard()};
  p.appendChild(skip);
}
function showActions(a,usable){
  let p=$('#actionPanel');
  p.innerHTML='';
  p.classList.remove('hidden');
  usable.forEach(item=>{
    const id=item.def[0], name=item.def[1], desc=item.def[3];
    let btn=document.createElement('button');
    btn.textContent=item.targets.length>1?`${name} (${item.targets.length} targets)`:name;
    btn.title=desc;
    btn.onclick=()=>{
      if(item.targets.length>1)showTargetChoices(a,id,item.def,item.targets,usable);
      else useSkill(a,id,item.targets[0]);
    };
    p.appendChild(btn);
  });
  addSkipButton(p,a);
}
function showTargetChoices(a,skillId,def,targets,usable){
  let p=$('#actionPanel');
  p.innerHTML='';
  let title=document.createElement('div');
  title.className='actionTitle';
  title.textContent=`Choose target for ${def[1]}`;
  p.appendChild(title);
  targets.forEach(t=>{
    let btn=document.createElement('button');
    btn.textContent=targetLabel(a,t);
    btn.onclick=()=>useSkill(a,skillId,t);
    p.appendChild(btn);
  });
  let back=document.createElement('button');
  back.textContent='Back';
  back.onclick=()=>showActions(a,usable);
  p.appendChild(back);
  addSkipButton(p,a);
}

function getTileEl(x,y){return document.querySelector(`.tile[data-x="${x}"][data-y="${y}"]`)}
function getUnitEl(u){const tile=getTileEl(u.x,u.y);return tile?tile.querySelector('.unit'):null}
function setActionButtonsDisabled(disabled=true){$$('#actionPanel button').forEach(b=>b.disabled=disabled)}
function showFloatingText(target,text,kind='damage'){
  const tile=getTileEl(target.x,target.y);if(!tile)return;
  const el=document.createElement('div');
  el.className=`floatText ${kind}`;
  el.textContent=text;
  tile.appendChild(el);
  setTimeout(()=>el.remove(),900);
}
function showEffect(target,kind='hit'){
  const tile=getTileEl(target.x,target.y);if(!tile)return;
  const fx=document.createElement('div');
  fx.className=`fx ${kind}`;
  tile.appendChild(fx);
  setTimeout(()=>fx.remove(),700);
}
function reactUnit(u,kind='hit'){
  renderBoard();
  const el=getUnitEl(u);if(!el)return;
  el.classList.add(kind==='heal'?'healReact':kind==='block'?'blockReact':'hitReact');
  setTimeout(()=>el.classList.remove('hitReact','healReact','blockReact'),450);
}
function prepAction(a,skillId){
  game.actionLock=true;
  setActionButtonsDisabled(true);
  $('#actionPanel').classList.add('pendingAction');
  const skill=getSkillDef(a.char.id,skillId);
  log(`${a.char.name} prepares ${skill?skill[1]:'action'}...`);
}
function finishAction(){
  game.actionLock=false;
  $('#actionPanel').classList.remove('pendingAction');
}
function useSkill(a,skillId,target){
  if(game.actionLock)return;
  prepAction(a,skillId);
  if(['heal','prayer','renew'].includes(skillId))return doSkillHeal(a,target,skillId);
  if(['guard','shield'].includes(skillId))return doSkillBlock(a,skillId);
  return doAttack(a,target,skillId)
}
function doSkillBlock(a,skillId){
  setTimeout(()=>{
    $('#actionPanel').classList.add('hidden');
    a.block=true;
    showEffect(a,'block');
    reactUnit(a,'block');
    log(a.char.name+' uses '+getSkillDef(a.char.id,skillId)[1]+'.');
    a.acted=true;
    finishAction();
    afterAction();
  },650)
}
function doSkillHeal(a,target,skillId){
  let base=skillId==='prayer'?4:skillId==='renew'?2:3;
  let amt=base+(game.loadouts[a.char.id]?.includes('focus')?1:0);
  setTimeout(()=>{
    $('#actionPanel').classList.add('hidden');
    target.hp=Math.min(target.maxHp,target.hp+amt);
    showEffect(target,'heal');
    showFloatingText(target,'+'+amt,'heal');
    reactUnit(target,'heal');
    log(a.char.name+' uses '+getSkillDef(a.char.id,skillId)[1]+' on '+target.char.name+' for '+amt+'.');
    a.acted=true;
    finishAction();
    afterAction();
  },700)
}
function doAttack(a,t,skillId='slash'){
  setTimeout(()=>{
    $('#actionPanel').classList.add('hidden');
    showEffect(t,'slashFx');
    let dmg=a.atk+(skillId==='slash'?1:0);
    if(t.block){dmg=Math.max(0,dmg-2);t.block=false}
    if(game.loadouts[t.char.id]?.includes('armor'))dmg=Math.max(0,dmg-1);
    t.hp=Math.max(0,t.hp-dmg);
    showFloatingText(t,'-'+dmg,'damage');
    reactUnit(t,'hit');
    let name=(getSkillDef(a.char.id,skillId)?.[1]||'Attack');
    log(a.char.name+' uses '+name+' on '+t.char.name+' for '+dmg+'.');
    a.acted=true;
    finishAction();
    afterAction();
  },700)
}
function afterAction(){if(checkWinLose())return;game.phase='select';checkTurnDone();renderBoard()}
function checkTurnDone(){if(game.units.filter(u=>u.team==='player'&&u.hp>0).every(u=>u.acted))endTurn()}
function endTurn(){if(game.turn==='player'){game.units.filter(u=>u.team==='player').forEach(u=>u.acted=false);game.turn='enemy';game.phase='enemy_roll';game.dice=null;game.activeUnitId=null;$('#actionPanel').classList.add('hidden');log('Enemy turn. Bot must roll dice first.');renderBoard();setTimeout(enemyTurn,700)}else{game.units.filter(u=>u.team==='enemy').forEach(u=>u.acted=false);game.turn='player';game.phase='select';game.dice=null;game.activeUnitId=null;log('Player turn. Select a unit.');renderBoard()}}
async function enemyTurn(){
  for(const e of game.units.filter(u=>u.team==='enemy'&&u.hp>0)){
    game.activeUnitId=e.id;
    game.phase='enemy_roll';
    game.dice=null;
    renderBoard();
    await botRoll(e);
    game.phase='enemy_move';
    const d=game.dice;
    const path=chooseBotPath(e,d);
    if(path.length!==d){
      log(`${e.char.name} rolled ${d} but cannot complete all ${d} steps. No attack allowed.`);
      e.acted=true;
      await wait(350);
      continue;
    }
    for(const step of path){
      e.x=step.x;
      e.y=step.y;
      renderBoard();
      const unitEl=getUnitEl(e);if(unitEl)unitEl.classList.add(d<=2?'walkAnim':'runAnim');
      await wait(d<=2?360:260);
    }
    game.phase='enemy_action';
    const adj=adjacentEnemies(e)[0];
    if(adj){
      let dmg=e.atk;
      if(adj.block){dmg=Math.max(0,dmg-2);adj.block=false}
      if(game.loadouts[adj.char.id]?.includes('armor'))dmg=Math.max(0,dmg-1);
      await wait(450);
      adj.hp=Math.max(0,adj.hp-dmg);
      showEffect(adj,'slashFx');
      showFloatingText(adj,'-'+dmg,'damage');
      reactUnit(adj,'hit');
      log(`${e.char.name} attacks ${adj.char.name} for ${dmg} after rolling and moving ${d} steps.`);
      await wait(650);
    }else{
      log(`${e.char.name} rolled ${d} and moved ${d} steps. Final tile is not adjacent, so no attack.`);
      await wait(300);
    }
    e.acted=true;
    if(checkWinLose())return;
  }
  game.activeUnitId=null;
  endTurn();
}
function botRoll(e){
  return new Promise(resolve=>{
    const box=$('#diceBox');
    box.classList.add('rolling');
    log(`${e.char.name} is rolling dice...`);
    const spin=setInterval(()=>{box.textContent=1+Math.floor(Math.random()*6)},70);
    setTimeout(()=>{
      clearInterval(spin);
      box.classList.remove('rolling');
      game.dice=1+Math.floor(Math.random()*6);
      box.textContent=game.dice;
      log(`${e.char.name} rolled ${game.dice}. Bot must move exactly ${game.dice} steps before any attack.`);
      renderBoard();
      resolve();
    },650);
  });
}
function chooseBotPath(e,steps){
  const target=nearestPlayer(e);
  if(!target)return [];
  const path=[];
  let pos={x:e.x,y:e.y};
  for(let i=0;i<steps;i++){
    let opts=[[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy])=>({x:pos.x+dx,y:pos.y+dy}))
      .filter(p=>p.x>=0&&p.y>=0&&p.x<8&&p.y<8&&!game.blocked.has(`${p.x},${p.y}`)&&!unitAtExcept(p.x,p.y,e.id));
    if(!opts.length)return path;
    const remaining=steps-i-1;
    opts.sort((a,b)=>botScore(a,target,remaining)-botScore(b,target,remaining));
    const choice=opts[0];
    path.push(choice);
    pos=choice;
  }
  return path;
}
function botScore(p,target,remaining){
  const dist=Math.abs(p.x-target.x)+Math.abs(p.y-target.y);
  if(remaining===0)return Math.abs(dist-1);
  return dist;
}
function unitAtExcept(x,y,ignoreId){return game.units.find(u=>u.id!==ignoreId&&u.x===x&&u.y===y&&u.hp>0)}
function nearestPlayer(e){return game.units.filter(u=>u.team==='player'&&u.hp>0).sort((a,b)=>Math.abs(a.x-e.x)+Math.abs(a.y-e.y)-Math.abs(b.x-e.x)-Math.abs(b.y-e.y))[0]}
function wait(ms){return new Promise(r=>setTimeout(r,ms))}
function checkWinLose(){
  let players=game.units.some(u=>u.team==='player'&&u.hp>0), enemies=game.units.some(u=>u.team==='enemy'&&u.hp>0);
  if(players&&enemies)return false;
  let win=players&&!enemies;
  const xp=awardCharacterExp(win);
  if(game.mode==='story'){
    if(win){game.story.stage++;if(game.story.stage>3){game.story.stage=1;game.story.level++;game.playerLevel++;}}
    else game.story.stage=1;
  }
  saveGame();
  $('#resultTitle').textContent=win?'Victory':'Defeat';
  $('#resultText').innerHTML=xpText(win,xp);
  setState(State.RESULT);
  return true;
}
function xpText(win,xp){return `<b>${win?'You won':'You lost'}.</b><br>EXP acquired:<br>${xp.lines.map(x=>`• ${x}`).join('<br>')}${game.mode==='story'?`<br><br>Saved Story Progress: Level ${game.story.level}, Stage ${game.story.stage}.`:''}`}
safeLoad();initSaveUI();setState(State.MENU);
