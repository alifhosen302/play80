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