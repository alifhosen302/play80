'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const html=fs.readFileSync('assets/index.html','utf8');
const arena=fs.readFileSync('assets/play80_bet_arena.js','utf8');
const chess=fs.readFileSync('assets/play80_chess.js','utf8');
const tournament=fs.readFileSync('assets/play80_tournament_menu.js','utf8');
const tourOnline=fs.readFileSync('assets/play80_tournament.js','utf8');
for(const key of ['bubble','block','memory','2048']){
  assert(html.includes('data-tour-choice="'+key+'"'),key+' tournament card missing');
}
for(const path of ['assets/tournament_bubble_premium.svg','assets/tournament_block_premium.svg','assets/tournament_memory_premium.svg','assets/tournament_puzzle_premium.svg']){
  assert(fs.statSync(path).size>500,path+' premium logo missing');
  assert(fs.readFileSync(path,'utf8').includes('<svg'),path+' invalid SVG');
}
assert(html.includes('id="p8TournamentCatalog"')&&html.includes('id="p8TournamentDetail"'),'Tournament catalog/detail');
assert(html.includes('data-open="account"')&&html.includes('id="cloudLoginEmail"')&&html.includes('id="cloudRegister"'),'Online account login controls');
assert(html.includes("name='account'")||html.includes("name='account'")||html.includes("name='account'"),'old local owner routes must be redirected to online login');
assert(tourOnline.includes('Public tournament status')&&tourOnline.includes('play80_tournament_public'),'Read-only event countdown before login');
assert(tournament.includes("if(!['bubble','block','memory'].includes(current))return;"),'Free previews use the local practice route');
const preview=tournament.slice(tournament.indexOf('function practice(){'),tournament.indexOf("$('p8TourPractice').addEventListener"));
assert(preview.includes('resetLocalMemory()')&&preview.includes("navigate('2048')"),'All four games have preview routes');
assert(!/\.rpc\(|play80_memory_start|play80_tournament_join|debitCoins/.test(preview),'Local preview must not join or debit a tournament');
assert(tourOnline.includes('t.rules?.late_registration===true')&&tourOnline.includes('for(const p of ranks){'),'Late join and full authenticated leaderboard');
assert(arena.includes('id="p8BlackName"')&&arena.includes('id="p8WhiteName"'),'Both chess player names');
for(const id of ['p8ChessLeave','p8ChessResign','p8ChessRestart','p8ChessWin'])assert(arena.includes('id="'+id+'"'),'Chess control '+id);
assert(!arena.includes("el('p8ChessBack')"),'Stale missing chess element handler');
assert(chess.includes('function resign')&&chess.includes('function agreeDraw'),'Chess game ends supported');
console.log('PASS V4.6: Tournament cards, source assets, login redirects, chess controls and terminal logic');

// Original, nonredeemable offline show: phase clock and guarded delayed callbacks.
for(const marker of ['cwRoundClock','cwHistory','cwStartSelection','cwGuardedDelay','cwPauseShow','cwCanSelect','data-phase="spin"','grid-template-columns:repeat(2,minmax(0,1fr))'])assert(html.includes(marker),marker);
assert(html.includes('round&&cwPending===round&&!round.finished'),'Delayed callbacks cannot settle a later round');
assert(html.includes('if(document.hidden){cwSoundStop();cwPauseShow();}'),'Backgrounding pauses new rounds');
assert(html.includes('cwDeadline=Date.now()+12000'),'Selection countdown');
assert(html.includes('if(!cwCanSelect())return;const total=cwSum();'),'Spectator rounds do not require points');
console.log('PASS: Original offline show presentation and lifecycle checks');

const vm=require('node:vm');
const start=html.indexOf('let cwAutoRunning=false,cwPhase=');
const end=html.indexOf('function cwGuardedDelay',start);
const delayEnd=html.indexOf('\n}',end)+2;
assert(start>0&&end>start&&delayEnd>end,'Clock implementation available');
const phaseSource=html.slice(start,delayEnd);
let now=10000,spins=0,calls=0,id=0;
const nodes={},intervals=new Map(),delayed=[];
const context=vm.createContext({
 Date:{now:()=>now}, document:{hidden:false},screen:'crazyshow',cwBusy:false,cwBets:{},cwPending:null,
 $:name=>nodes[name]??=( {dataset:{},textContent:''} ),
 setInterval:fn=>{intervals.set(++id,fn);return id;},clearInterval:n=>intervals.delete(n),
 setTimeout:fn=>{delayed.push(fn);return ++id;},cwSpeak:()=>{},cwSetRoundMessage:()=>{},cwRefresh:()=>{},
 cwSpinRound:()=>{spins++;},cwGetSpot:()=>null
});
vm.runInContext(phaseSource,context);
const run=src=>vm.runInContext(src,context);
run('cwAutoRunning=true;cwStartSelection()');
assert.equal(nodes.cwRoundClock.textContent,'12');
assert.equal(intervals.size,1);
now+=11999;run('cwTick()');assert.equal(spins,0);
now+=1;run('cwTick()');assert.equal(spins,1);assert.equal(intervals.size,0);
run('cwStartSelection();cwPauseShow()');assert.equal(intervals.size,0);assert.equal(run('cwCanSelect()'),false);
now+=15000;run('cwTick()');assert.equal(spins,1,'Paused show cannot create another round');
context.cwPending={finished:false};
context.mark=()=>{calls++};
run('cwGuardedDelay(mark,100)');
context.cwPending={finished:false};delayed.shift()();assert.equal(calls,0,'Stale result ignored');
run('cwGuardedDelay(mark,100)');delayed.shift()();assert.equal(calls,1,'Current result runs once');
run('cwAutoRunning=true;cwStartSelection()');context.document.hidden=true;run('cwTick()');assert.equal(intervals.size,0,'Background clock stops');
console.log('PASS: Simulated clock, pause, hidden tab and stale callbacks');

assert(html.includes('p8GameInteriorDesign'),'Premium game interior styling');
for(const marker of ['p8DiceHigh','p8DiceSeven','p8DiceLow','diceRenderHistory','diceCancel','diceGroup(sum)','dicePractice.history.slice(0,12)'])assert(html.includes(marker),marker);
const diceLogic=html.slice(html.indexOf('// Avatar Dice is a free probability practice'),html.indexOf('// Demo-only virtual point requests.'));
assert(!/award\(|debitCoins\(|state\.points|\.rpc\(/.test(diceLogic),'Free dice practice cannot alter wallet');
const groupSource=html.match(/function diceGroup\(sum\)\{[^}]+\}/)[0];
const group=vm.runInNewContext(groupSource+';diceGroup');
const outcomes=[0,0,0,0];
for(let a=1;a<=6;a++)for(let b=1;b<=6;b++)outcomes[group(a+b)]++;
assert.deepEqual(outcomes,[0,15,6,15],'All 36 possible dice sums correctly classified');
console.log('PASS: Avatar Dice sum grouping, wallet isolation and visual controls');

// Every red pip face must be faithful to the actual die value.
const pipSource=html.match(/const diceMiniPositions=Object\.freeze\((\[[^\n]+\])\);/)[1];
const pipMap=JSON.parse(pipSource);
for(let face=1;face<=6;face++){assert.equal(pipMap[face].length,face);assert.equal(new Set(pipMap[face]).size,face);assert(pipMap[face].every(p=>p>=0&&p<=8));}
assert.deepEqual(pipMap[1],[4]);assert(html.includes('p8DiceMiniPip')&&html.includes('diceMiniFace(r.a),diceMiniFace(r.b)'));
console.log('PASS: six accurate 3D-styled red-pip miniature dice faces');

// Game-only quality/break controls, lifecycle and one-shot bonus choice.
for(const marker of ['p8GraphicsQuality','p8PlayTime','p8BreakMinutes','p8GamePerformance','flightPause','flightResume','flightDeadline=performance.now()+6000','cwRoundCounter','cwBonusTimer','cwClaimBonusAction','cwStopBonusClock'])assert(html.includes(marker),marker);
assert(html.includes('if(!cwClaimBonusAction())return;goBtn.disabled=true;'),'Bonus timer and click cannot both act');
assert(html.includes("if(screen!=='flight'||document.hidden){flightPause();return;}"),'Background flight is paused');
assert(html.includes("if(screen!=='arcade')return;const g=arc.game;"),'Hidden controls cannot start round');
console.log('PASS: game-only settings, flight lifecycle and bonus one-shot guards');

const skill=fs.readFileSync('assets/play80_skill_preview.js','utf8');
for(const key of ['temple','candy','subway','coinrun'])assert(html.includes('data-tour-choice="'+key+'"'),key);
assert(!/\.rpc\(|state\.points|localStorage|fetch\(/.test(skill),'Free preview must not mutate account or standings');
assert(html.includes("'p8-practice','skill-preview'"),'Preview route enabled');
