// Test de bout en bout : 3 humains (socket.io) + 2 bots jouent une partie complète sur le serveur compilé.
// Un spectateur arrive en cours de route. Usage : npm run build && npm run e2e
import { spawn } from 'node:child_process';
import { io } from 'socket.io-client';

const PORT = 3900 + Math.floor(Math.random() * 90);
const URL = `http://localhost:${PORT}`;
const server = spawn(process.execPath, ['dist/server/index.mjs'], {
  env: { ...process.env, PORT: String(PORT), HA_FAST: '1' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  server.kill();
  process.exit(1);
};
setTimeout(() => fail('délai dépassé (3 min)'), 180_000).unref();

await new Promise((resolve) => server.stdout.on('data', (d) => String(d).includes('prêt') && resolve()));

let audited = 0;
let faces = 0;
let hints = 0;
let gestures = 0;
const COLORS = ['rouge', 'jaune', 'vert', 'bleu', 'blanc'];

function client(name, { player = true } = {}) {
  const socket = io(URL, { transports: ['websocket'], forceNew: true });
  const c = { name, socket, view: null };
  socket.on('state', (v) => {
    c.view = v;
    audit(v);
    if (player) play(c);
  });
  c.call = (event, payload = {}) => new Promise((res) => socket.emit(event, payload, res));
  return c;
}

/** Vérifie les secrets sur chaque état reçu. */
function audit(v) {
  const g = v.game;
  if (v.phase !== 'playing' || !g) return;
  audited++;
  const json = JSON.stringify(v);
  for (const word of ['"touched"', '"mark"', '"intent"', '"colors"', '"values"', '"not":', '"token"']) if (json.includes(word)) fail(`la vue contient ${word}`);
  if (Array.isArray(g.deck)) fail('la pioche circule');
  const seated = g.order.includes(v.me);
  for (const p of v.players) {
    for (const card of p.hand ?? []) {
      const shown = card.color !== undefined || card.value !== undefined;
      if (p.id === v.me && shown) fail(`${p.name} voit ses propres cartes`);
      if (!seated && shown) fail('un spectateur voit une carte');
      if (shown) faces++;
    }
  }
  for (const e of g.events) {
    if (e.until < v.serverNow - 50) fail('un événement expiré circule encore');
    if (e.kind === 'hint') hints++;
  }
  if (g.events.length > 6) fail('trop d’événements : on dirait un historique');
}

let busy = new Set();
/** Une stratégie de joueur pressé, avec quelques gestes de table. */
function play(c) {
  const v = c.view;
  const g = v?.game;
  if (!v || v.phase !== 'playing' || !g || g.ended || g.turnId !== v.me) return;
  const key = `${c.name}:${g.seq}`;
  if (busy.has(key)) return;
  busy.add(key);
  const me = v.players.find((p) => p.id === v.me);
  const hand = me.hand;
  const ack = () => {};
  if (Math.random() < 0.15 && hand.length > 1) {
    gestures++;
    c.socket.emit('game:tilt', { cardId: hand[0].id }, ack);
    c.socket.emit('game:arrange', { order: [...hand.map((x) => x.id)].reverse() }, ack);
  }
  const others = v.players.filter((p) => p.id !== v.me && g.order.includes(p.id));
  const r = Math.random();
  if (g.hints > 0 && (r < 0.5 || g.hints === 8)) {
    const target = others[Math.floor(Math.random() * others.length)];
    const hint = Math.random() < 0.5 ? { kind: 'color', color: COLORS[Math.floor(Math.random() * 5)] } : { kind: 'value', value: 1 + Math.floor(Math.random() * 5) };
    c.socket.emit('game:hint', { target: target.id, hint, seq: g.seq }, ack);
  } else if (g.hints < 8 && r < 0.97) {
    c.socket.emit('game:discard', { cardId: hand[hand.length - 1].id, seq: g.seq }, ack);
  } else {
    c.socket.emit('game:play', { cardId: hand[0].id, seq: g.seq }, ack);
  }
}

const a = client('Aiko');
const b = client('Bao');
const d = client('Chloé');
await Promise.all([a, b, d].map((c) => new Promise((r) => (c.socket.connected ? r() : c.socket.on('connect', r)))));

const created = await a.call('room:create', { name: 'Aiko', avatar: 'lanterne' });
if (!created.ok) fail(`création : ${created.error}`);
const code = created.data.code;
const joined = await b.call('room:join', { code: code.toLowerCase(), name: 'Bao', avatar: 'furin' });
if (!joined.ok) fail(`jointure : ${joined.error}`);
const third = await d.call('room:join', { code, name: 'Chloé', avatar: 'lune' });
if (!third.ok) fail(`jointure : ${third.error}`);
for (let i = 0; i < 2; i++) await a.call('room:addBot');
const extra = await a.call('room:addBot');
if (extra.ok) fail('six joueurs ne devraient pas pouvoir s’asseoir');
const denied = await b.call('game:start');
if (denied.ok) fail('un invité ne devrait pas pouvoir lancer la partie');
const started = await a.call('game:start');
if (!started.ok) fail(`lancement : ${started.error}`);
console.log(`✓ table ${code} lancée à 5 joueurs`);
await new Promise((r) => setTimeout(r, 100));
const sizes = a.view.players.map((p) => p.hand?.length);
if (sizes.some((n) => n !== 4)) fail(`à 5 joueurs, quatre cartes chacun (reçu ${sizes})`);
console.log('✓ quatre cartes chacun, la sienne de dos');

// Un curieux arrive en cours de partie : il regarde, sans voir aucune carte.
const spy = client('Curieux', { player: false });
await new Promise((r) => spy.socket.on('connect', r));
const watching = await spy.call('room:join', { code, name: 'Curieux', avatar: 'tortue' });
if (!watching.ok) fail(`spectateur : ${watching.error}`);

// Bao se déconnecte puis revient avec son jeton : il doit retrouver sa place et sa main.
const before = b.view.players.find((p) => p.id === b.view.me).hand.map((x) => x.id).join();
b.socket.disconnect();
await new Promise((r) => setTimeout(r, 30));
const b2 = client('Bao');
await new Promise((r) => b2.socket.on('connect', r));
const resumed = await b2.call('room:join', { code, ...joined.data, resumeOnly: true });
if (!resumed.ok || resumed.data.playerId !== joined.data.playerId) fail('reprise de session échouée');
console.log(`✓ reconnexion de Bao sur sa place (main de ${before.split(',').length} cartes)`);

await new Promise((resolve) => {
  const check = setInterval(() => {
    if (a.view?.phase === 'finished') {
      clearInterval(check);
      resolve();
    }
  }, 50);
});
if (!audited || !faces) fail("aucun état n'a été contrôlé");
if (!hints) fail("aucun indice n'a été vu");
console.log(`✓ personne ne voit ses cartes, le spectateur aucune, sur ${audited} états reçus (${gestures} gestes de table)`);
const final = a.view.final;
if (final.players.length !== 5) fail('il doit y avoir 5 joueurs au bilan');
if (final.players.some((p) => !Array.isArray(p.hand) || p.hand.some((c) => !c.color))) fail('les mains doivent être révélées à la fin');
const score = Object.values(final.fireworks).reduce((x, y) => x + y, 0);
if (final.reason !== 'storms' && final.score !== score) fail('score incohérent');
if (final.reason === 'storms' && final.score !== 0) fail('trois orages : 0 point');
console.log(`✓ partie terminée (${final.reason}), score ${final.score}`);

await a.call('game:restart');
await new Promise((r) => setTimeout(r, 150));
if (a.view.phase !== 'lobby') fail('retour au salon échoué');
if (!a.view.players.some((p) => p.name === 'Curieux' && p.status === 'spectator')) fail('le spectateur doit rester à la table, complète');
console.log('✓ retour au salon pour une revanche');

for (const c of [a, b2, d, spy]) c.socket.close();
server.kill();
console.log('✓ test de bout en bout réussi');
process.exit(0);
