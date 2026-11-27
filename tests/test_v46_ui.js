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
for(const id of ['p8ChessLeave','p8ChessResign','p8ChessDraw','p8ChessRestart','p8ChessWin','p8ChessOnline'])assert(arena.includes('id="'+id+'"'),'Chess control '+id);
assert(!arena.includes("el('p8ChessBack')"),'Stale missing chess element handler');
assert(chess.includes('function resign')&&chess.includes('function agreeDraw'),'Chess game ends supported');
console.log('PASS V4.6: Tournament cards, source assets, login redirects, chess controls and terminal logic');
