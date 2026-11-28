'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const src=fs.readFileSync('assets/play80_rules_gate.js','utf8');
const html=fs.readFileSync('assets/index.html','utf8');
assert(fs.statSync('assets/play80_premium_game_icons_atlas.webp').size>10000);
assert(html.includes('<script src="play80_rules_gate.js"></script>'));
for(const g of ['wheel','dice','flight','ludo','chess','crazyshow','2048','memory','carnival','cups','apples','slots','roulette','blackjack','plinko','mines','keno','scratch']){
  assert(src.includes(g+':')||src.includes("'"+g+"':")||src.includes('"'+g+'":'),g+' game missing');
}
for(const requirement of ['#p8OpenChess','#localLudoBtn','[data-arcade]','[data-open]','OK, PLAY','overflow-y:auto','stopImmediatePropagation','MutationObserver','play80_premium_game_icons_atlas.webp'])assert(src.includes(requirement),requirement);
assert(!src.includes('localStorage.setItem'),'Do not permanently bypass rules');
console.log('PASS: 18 game-entry rules, premium game icon atlas, scrollable rules gate, no sticky bypass');
assert(html.includes('localPracticeScreens'),'Local practice games must be visibly distinguished');
assert(html.includes('মূল ওয়ালেট বা টার্নওভারে যোগ হয় না'),'Practice balance disclosure required');
const online=fs.readFileSync('assets/play80_online.js','utf8');
for(const marker of ['applyServerWallet','walletReadVersion','walletOwner===account.id','refreshServerWallet'])assert(online.includes(marker),marker);
assert(!online.includes('balance=wallets?.[0]||{balance:0,held_balance:0}'),'No fabricated zero wallet');

assert(src.includes('"crazyshow":["Crazy Wheel Show","crazyshow"'),'Crazy show must not reuse Carnival icon');
assert(fs.statSync('assets/play80_crazyshow_premium.svg').size>1000,'Original distinct show icon');

const vm=require('node:vm');
const vStart=online.indexOf('function validateTurnoverSnapshot(data)');
const vEnd=online.indexOf('  async function readTurnover()',vStart);
assert(vStart>=0&&vEnd>vStart);
const validate=vm.runInNewContext(online.slice(vStart,vEnd)+';validateTurnoverSnapshot');
const sample={items:[{source:'deposit',required:50,completed:20},{source:'daily_bonus',required:20,completed:20}],withdrawal_guard_enabled:true,withdrawable_coins:0};
assert.equal(validate(sample).remaining,30);assert.equal(validate(sample).items.length,1);
for(const bad of [{...sample,withdrawable_coins:undefined},{...sample,withdrawable_coins:'0'},{...sample,items:[{source:'deposit',required:-1,completed:0}]},{...sample,items:[{source:'deposit',required:1,completed:2}]},{...sample,items:[null]}])assert.equal(validate(bad),null);
assert(online.includes('version===turnoverReadVersion'),'Reject stale read results');
console.log('PASS server snapshot validation and stale-response guard');
