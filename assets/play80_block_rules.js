/* PLAY80 Block Puzzle: pure placement rules, shared by UI and regression tests.
 * Scores in this module are local practice only, never trusted as server results.
 */
(function(root,factory){
  const rules=factory();
  if(typeof module==='object'&&module.exports)module.exports=rules;
  else root.Play80BlockRules=rules;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const SIZE=8;
  const SHAPES=Object.freeze([
    [[0,0]],[[0,0],[0,1]],[[0,0],[1,0]],
    [[0,0],[0,1],[0,2]],[[0,0],[1,0],[2,0]],
    [[0,0],[0,1],[0,2],[0,3]],[[0,0],[1,0],[2,0],[3,0]],
    [[0,0],[0,1],[1,0]],[[0,0],[0,1],[1,1]],[[0,0],[1,0],[1,1]],[[0,1],[1,0],[1,1]],
    [[0,0],[0,1],[1,0],[1,1]],
    [[0,0],[0,1],[0,2],[1,0],[1,1],[1,2]],
    [[0,0],[0,1],[1,0],[1,1],[2,0],[2,1]],
    [[0,0],[0,1],[0,2],[1,1]],[[0,1],[1,0],[1,1],[2,1]],
    [[0,0],[1,0],[2,0],[2,1],[2,2]],[[0,0],[0,1],[0,2],[1,2],[2,2]],
    [[0,1],[0,2],[1,0],[1,1]],[[0,0],[0,1],[1,1],[1,2]],
    [[0,0],[0,1],[0,2],[1,0],[2,0],[2,1]],[[0,0],[0,1],[1,0],[1,1],[2,0],[2,1],[3,0]]
  ].map(shape=>Object.freeze(shape.map(p=>Object.freeze(p)))));
  const COLORS=['#ef547b','#35bcec','#f5c641','#58d88a','#a779ff','#fb9146'];
  const makePieces=(random=Math.random)=>Array.from({length:3},()=>({shape:SHAPES[Math.floor(random()*SHAPES.length)],color:COLORS[Math.floor(random()*COLORS.length)]}));
  function cellsFor(piece,row,col){
    if(!piece||!Number.isInteger(row)||!Number.isInteger(col))return null;
    const positions=piece.shape.map(([r,c])=>[row+r,col+c]);
    if(positions.some(([r,c])=>r<0||c<0||r>=SIZE||c>=SIZE))return null;
    return positions.map(([r,c])=>r*SIZE+c);
  }
  function canPlace(board,piece,row,col){const cells=cellsFor(piece,row,col);return !!cells&&cells.every(i=>!board[i]);}
  function place(board,piece,row,col){
    if(!canPlace(board,piece,row,col))return null;
    const next=board.slice(),cells=cellsFor(piece,row,col);for(const i of cells)next[i]=piece.color;
    const cleared=new Set();let lines=0;
    for(let r=0;r<SIZE;r++)if(next.slice(r*SIZE,(r+1)*SIZE).every(Boolean)){lines++;for(let c=0;c<SIZE;c++)cleared.add(r*SIZE+c);}
    for(let c=0;c<SIZE;c++)if(Array.from({length:SIZE},(_,r)=>next[r*SIZE+c]).every(Boolean)){lines++;for(let r=0;r<SIZE;r++)cleared.add(r*SIZE+c);}
    for(const i of cleared)next[i]=null;
    return {board:next,placed:cells,cleared:[...cleared],lines,score:cells.length+cleared.size*5};
  }
  function hasMove(board,pieces){return pieces.some(piece=>piece&&Array.from({length:SIZE*SIZE},(_,i)=>i).some(i=>canPlace(board,piece,Math.floor(i/SIZE),i%SIZE)));}
  return Object.freeze({SIZE,SHAPES,COLORS,makePieces,cellsFor,canPlace,place,hasMove});
});
