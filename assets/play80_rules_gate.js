/* PLAY80: premium game art & mandatory game-entry rules screen */
(()=>{
'use strict';
const rules={"2048":["2048 Practice","2048","Swipe to merge equal tiles into larger numbers. Only server-verified tournament results qualify for tournament rewards."],"wheel":["Spin Time","wheel","Choose a demo-coin stake and spin the wheel. The displayed sectors determine the virtual reward."],"dice":["Avatar Dice","dice","Choose a number and roll two dice. Matching the number earns the displayed demo points."],"flight":["Sky Flight","flight","Start a virtual flight round and cash out before the simulated crash."],"ludo":["Color Ludo","ludo","Choose 2, 3 or 4 local players, teams or AI. Roll dice and move tokens according to the game rules. Remote live turns are not enabled."],"chess":["Chess","chess","Two players share one device for local Chess practice. White moves first; check, checkmate, castling, en passant and promotion apply. Remote turns are not enabled."],"crazyshow":["Crazy Wheel Show","carnival","Choose demo chips and spots, then spin the virtual wheel. AI hosts and audience are fictional."],"memory":["Memory Challenge","scratch","Flip cards to find matching pairs. Tournament rewards require a server-verified finished match."],"carnival":["Carnival Wheel","carnival","Each spin costs 10 virtual coins and pays a random demo outcome of 0, 10, 20, 30 or 50."],"cups":["Cup Shuffle","cups","Track the ball through six shuffles of three cups. Choose correctly for 30 demo coins."],"apples":["Apple Tree","apples","Each row holds two safe apples and one rotten apple. Collect after a safe row or continue at risk."],"slots":["Fruit Slots","slots","Spin three fruit reels. Triple strawberries, other triples and pairs have different demo rewards."],"roulette":["Roulette","roulette","Choose Red, Black or Green and spin. Each virtual round costs 10 coins."],"blackjack":["Blackjack","blackjack","Hit or Stand to approach 21 without busting. The demo dealer draws to 17."],"plinko":["Plinko","plinko","Select 10, 20 or 50 virtual coins, drop a ball and receive the landing bucket's demo reward."],"mines":["Mines","mines","Reveal gems while avoiding two mines hidden among nine tiles. Collect or keep playing."],"keno":["Keno","keno","Pick four numbers from 1–20. Six numbers are drawn and matches determine the demo reward."],"scratch":["Scratch Cards","scratch","Reveal nine fruit cards. Three or more identical symbols can win demo coins."]};
const atlas={wheel:[0,0],dice:[1,0],flight:[2,0],ludo:[3,0],chess:[0,1],carnival:[1,1],cups:[2,1],apples:[3,1],slots:[0,2],roulette:[1,2],blackjack:[2,2],plinko:[3,2],mines:[0,3],keno:[1,3],scratch:[2,3],'2048':[3,3]};
const style=document.createElement('style');
style.textContent=[
".p8PremiumIcon{display:block;width:min(95%,112px);aspect-ratio:1;background:url('play80_premium_game_icons_atlas.webp') no-repeat;background-size:400% 400%;border-radius:18%;box-shadow:0 5px 24px #0009}",
".gameCard .art:has(.p8PremiumIcon){display:flex;align-items:center;justify-content:center;background:radial-gradient(circle,#6340a2,#16132c 80%)!important;padding:6px!important;overflow:hidden}",
".gameCard:has(.p8PremiumIcon){border-color:#a18ad7;box-shadow:0 8px 24px #0807198c}",
"#p8RulesOverlay{position:fixed;inset:0;z-index:100000;display:none;align-items:center;justify-content:center;padding:12px;box-sizing:border-box;background:#08091cf5;color:#fff}",
"#p8RulesOverlay.open{display:flex}",
"#p8RulesSheet{display:flex;flex-direction:column;width:100%;max-width:590px;max-height:96%;overflow:hidden;border:1px solid #ae86ef;border-radius:20px;background:linear-gradient(145deg,#302046,#10172c)}",
"#p8RulesHead{display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid #8b68ba75}",
"#p8RulesHead .p8PremiumIcon{width:66px;flex:none}",
"#p8RulesHead h2{margin:0 0 4px;font-size:21px}",
"#p8RulesBody{overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;min-height:0;flex:1;padding:18px 20px 36px;line-height:1.75;font-size:14px}",
"#p8RulesBody h3{font-size:16px;color:#ffe3a2;margin:16px 0 7px}",
"#p8RulesBody li{padding:5px 0}",
"#p8RulesFoot{display:flex;gap:10px;flex:none;padding:13px 15px;border-top:1px solid #8b68ba75;background:#141730}",
"#p8RulesFoot button{flex:1;min-width:0;min-height:46px;border:1px solid #9071cc;border-radius:12px;background:#282141;color:#fff;font-weight:800}",
"#p8RulesAccept{background:linear-gradient(120deg,#ac62fa,#6845d6)!important}",
".p8RulesNotice{border-radius:10px;border:1px solid #9d78c8;padding:11px;background:#372749}",
"#screen-2048 .play80Surface>p,#screen-chess .play80Promo>p,#screen-chess .play80Surface>p.p8ChessNotice{display:none!important}"
].join('\n');
document.head.append(style);
function icon(name){const p=atlas[name];if(!p)return null;const x=document.createElement('span');x.className='p8PremiumIcon';x.setAttribute('aria-hidden','true');x.style.backgroundPosition=(p[0]*100/3)+'% '+(p[1]*100/3)+'%';return x;}
function txt(parent,tag,value){const x=document.createElement(tag);x.textContent=value;parent.append(x);return x;}
const overlay=document.createElement('div');overlay.id='p8RulesOverlay';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-labelledby','p8RulesTitle');
overlay.innerHTML='<div id="p8RulesSheet"><header id="p8RulesHead"><div id="p8RulesIcon"></div><div><h2 id="p8RulesTitle">Game Rules</h2><small>PLAY80 · BEFORE YOU PLAY</small></div></header><div id="p8RulesBody" tabindex="0"></div><footer id="p8RulesFoot"><button type="button" id="p8RulesBack">BACK</button><button type="button" id="p8RulesAccept">OK, PLAY</button></footer></div>';
document.body.append(overlay);
let pending=null,ignore=false,priorFocus=null;
function close(){overlay.classList.remove('open');document.body.style.removeProperty('overflow');pending=null;priorFocus?.focus?.();priorFocus=null;}
function show(game,target){
const r=rules[game];if(!r)return;pending=target;priorFocus=document.activeElement;
document.getElementById('p8RulesTitle').textContent=r[0];
const image=document.getElementById('p8RulesIcon');image.replaceChildren();const a=icon(r[1]);if(a)image.append(a);
const b=document.getElementById('p8RulesBody');b.replaceChildren();
txt(b,'h3','How to play · খেলার নিয়ম');txt(b,'p',r[2]);
txt(b,'h3','Before you start · খেলার আগে জানুন');
const ul=txt(b,'ul','');
txt(ul,'li','Only virtual Demo Coins/Points are used. There are no real-money deposits, cash withdrawals or cash prizes.');
txt(ul,'li','The currently implemented game mechanics apply. New user-approved rules will be disclosed here before the game, not invented.');
txt(ul,'li','Operational results appear within gameplay; emergency security, error and permission notices may still appear.');
const note=txt(b,'p','Rules, disclosures and promotional explanations belong here. After OK, PLAY, the game screen should focus on gameplay.');note.className='p8RulesNotice';
b.scrollTop=0;overlay.classList.add('open');document.body.style.overflow='hidden';document.getElementById('p8RulesAccept').focus();
}
document.getElementById('p8RulesBack').addEventListener('click',close);
document.getElementById('p8RulesAccept').addEventListener('click',()=>{const el=pending;if(!el)return;close();ignore=true;try{el.click();}finally{ignore=false;}});
document.addEventListener('keydown',e=>{if(overlay.classList.contains('open')&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close();}},true);
document.addEventListener('click',e=>{
if(ignore||overlay.classList.contains('open'))return;
const el=e.target.closest('[data-arcade],[data-open],#p8OpenChess,#localLudoBtn,#tourPlay');
if(!el)return;
const game=el.id==='p8OpenChess'?'chess':el.id==='tourPlay'?'memory':el.id==='localLudoBtn'?'ludo':el.dataset.arcade||el.dataset.open;
if(!Object.prototype.hasOwnProperty.call(rules,game))return;
e.preventDefault();e.stopImmediatePropagation();show(game,el);
},true);
function decorate(){
document.querySelectorAll('.gameTile .gameCard').forEach(card=>{
const game=card.dataset.arcade||card.dataset.open,art=card.querySelector('.art');
if(!rules[game]||!art||art.querySelector('.p8PremiumIcon'))return;
const a=icon(rules[game][1]);if(a){art.replaceChildren(a);art.setAttribute('aria-label',rules[game][0]+' premium icon');}
});
}
decorate();new MutationObserver(decorate).observe(document.body,{childList:true,subtree:true});
window.PLAY80RulesGate=Object.freeze({games:Object.keys(rules),isOpen:()=>overlay.classList.contains('open')});
})();