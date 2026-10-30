import { Game } from '../server/game';
import { botMove, botView } from '../server/bots';
const N = Number(process.argv[2] ?? 200);
for (const players of [2, 3, 4, 5]) {
  let total = 0, storms = 0, perfect = 0, deadStorm = 0; const dist: number[] = [];
  for (let g = 0; g < N; g++) {
    const ids = Array.from({ length: players }, (_, i) => `p${i}`);
    const game = new Game(ids);
    let guard = 0;
    while (!game.over && guard++ < 500) {
      const me = game.current;
      const m = botMove(botView(game, me));
      const err = m.type === 'play' ? game.play(me, m.cardId) : m.type === 'discard' ? game.discardCard(me, m.cardId) : game.hint(me, m.target, m.hint);
      if (err) throw new Error(err + JSON.stringify(m));
    }
    total += game.over!.score; dist.push(game.over!.score);
    if (game.over!.reason === 'storms') deadStorm++;
    storms += game.storms;
    if (game.over!.score === 25) perfect++;
  }
  dist.sort((a,b)=>a-b);
  console.log(`${players}j : moyenne ${(total / N).toFixed(2)}, médiane ${dist[N>>1]}, orages/partie ${(storms / N).toFixed(2)}, défaites ${deadStorm}, parfaites ${perfect}`);
}
