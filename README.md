# Hanabi

**Un feu d'artifice à plusieurs mains. Tu vois les cartes de tous, sauf les tiennes.**

👉 **Jouer : https://hanabi-2bap.onrender.com** (la première ouverture peut prendre jusqu'à une minute, le temps que le serveur gratuit se réveille)

Jeu multijoueur coopératif en ligne, à jouer entre amis depuis un navigateur, sur téléphone ou ordinateur, sans compte ni installation.
D'après *Hanabi*, le jeu d'Antoine Bauza édité par Cocktail Games et Les XII Singes (projet de fans, non officiel, avec ses propres visuels).

## Règles en bref

- De 2 à 5 joueurs, tous dans le même camp. 50 cartes en cinq couleurs (rouge, jaune, vert, bleu, blanc) ; dans chaque couleur, trois 1, deux 2, deux 3, deux 4 et un seul 5.
- 5 cartes en main à 2 ou 3 joueurs, 4 à 4 ou 5. On tient ses cartes à l'envers : on voit celles des autres, jamais les siennes.
- À son tour, une seule action :
  - **donner un indice** (un des 8 jetons) : montrer à un partenaire toutes ses cartes d'une couleur, ou toutes ses cartes d'une valeur ;
  - **défausser** une carte : un jeton revient. Impossible quand les 8 jetons sont disponibles ;
  - **jouer** une carte : si elle prolonge son feu, elle y est posée, sinon elle est défaussée et un orage éclate. Compléter un feu avec son 5 rend un jeton.
- On pioche après avoir joué ou défaussé.
- Le troisième orage arrête la partie, qui est perdue. À 25 points, le feu est parfait et la partie s'arrête. Quand la pioche est vide, chacun joue une dernière fois, celui qui a pioché la dernière carte compris.
- Le score est la somme des plus hautes cartes posées sur chaque feu.

Les règles suivent le livret Cocktail Games de 2019 : matériel, mains, actions, jeton rendu par un 5, défausse interdite à 8 jetons, fin de partie et score. Le livret autorise aussi un indice qui ne désigne aucune carte (« Tu n'as pas de cartes blanches »), et conseille de réorganiser sa main pour se souvenir des indices.

Sont des choix de ce jeu :

- **0 point en cas de défaite.** Le livret dit seulement que la partie est perdue ; on compte 0, comme l'édition allemande et les adaptations en ligne.
- **Le premier joueur est tiré au sort.** Le livret le donne à celui qui porte les vêtements les plus colorés.
- **La carte piochée arrive à gauche**, et chacun peut ensuite ranger sa main et incliner une carte à sa guise. Ces gestes se voient, comme à une vraie table.
- **Un indice s'affiche 8 secondes, puis disparaît.** Aucune marque ne reste sur les cartes et aucun historique n'est envoyé au client : se souvenir fait partie du jeu.
- **La défausse est rangée par couleur et par valeur**, sans l'ordre dans lequel les cartes sont tombées.
- **Pas de chat**, seulement des réactions qui ne disent rien des cartes : le livret interdit de commenter le tour des autres.
- **Les spectateurs ne voient aucune carte.** Sinon, un joueur pourrait ouvrir un second onglet en spectateur pour regarder sa propre main.
- L'appréciation du score est formulée à notre façon. La sixième couleur multicolore et la variante « Bouquet final » ne sont pas proposées.

## Les bots

Ils ne voient jamais leurs propres cartes, mais se souviennent de chaque indice, côté serveur. Ils suivent quelques conventions simples, expliquées dans les règles du jeu :

- la **carte en danger** est la plus à droite des cartes qu'aucun indice n'a désignées : c'est elle qu'on défausse ;
- un indice **vise une carte** : la carte en danger si elle est désignée, sinon la plus à gauche des cartes nouvellement désignées. Elle est **jouable tout de suite** ;
- sur la carte en danger, un indice qui peut désigner un 5 ou la dernière carte utile est une **sauvegarde** : on la garde ;
- on ne désigne **jamais une carte devenue inutile**, ni le double d'une carte déjà désignée.

Celui qui donne un indice simule la lecture qu'en fera son partenaire, et ne donne que des indices bien compris. Entre bots, la moyenne se situe entre 20 et 22 points sur 25 de 2 à 5 joueurs, avec moins d'une défaite pour cent parties (`npx tsx test/sim.ts 300` pour mesurer).

## Fonctionnalités

- Tables privées avec code à 4 lettres, lien d'invitation, partage natif et QR code
- Indice en trois gestes : toucher la main d'un partenaire, choisir une couleur ou une valeur, voir en aperçu les cartes désignées, valider
- L'indice reçu s'illumine sur le moment, avec une phrase claire, puis disparaît
- Jouer ou défausser en deux temps : on soulève la carte, puis on choisit
- Ranger sa main (glisser ou flèches) et incliner une carte, gestes visibles de tous
- Feu d'artifice sur canevas à chaque carte réussie, orage à chaque erreur, bouquet final proportionnel au score
- Défausse face visible, pioche et jetons sur la table, rien de plus : ni probabilités, ni décompte, ni historique
- Bots coopératifs à conventions, partie d'entraînement en un clic
- Réactions, règles consultables en jeu
- Reprise automatique après une coupure, pilote automatique si un joueur s'absente, spectateurs
- Temps de réflexion réglable par l'hôte
- Sons synthétisés et vibrations, animations réduites si le système le demande

## Développement

```bash
npm install
npm run dev:server   # serveur temps réel sur http://localhost:3100
npm run dev:client   # interface sur http://localhost:5182
npm test             # règles, secrets, conventions, bots et table
npm run build && npm run e2e   # partie complète avec de vrais clients connectés
npx tsx test/sim.ts 300        # force des bots : 300 parties par nombre de joueurs
```

`HA_FAST=1` accélère les bots et les chronos (tests locaux uniquement).

## Architecture

- `shared/` : contrat client/serveur, constantes et règle des indices
- `server/` : Express + Socket.IO, moteur de partie (`game.ts`), règles des cartes et lecture des indices (`cards.ts`), bots (`bots.ts`), table et minuteries (`room.ts`). Le serveur fait autorité : une carte ne sort que vers ceux qui ont le droit de la voir, jamais vers son propriétaire, et la mémoire des indices ne quitte pas le serveur
- `client/` : React + Vite + Framer Motion. Les cartes sont dans `components/Cards.tsx`, le ciel et ses feux dans `components/Sky.tsx`, l'indice dans `components/HintSheet.tsx`, la table dans `screens/Table.tsx`
- Déploiement : un seul service Node (`npm ci && npm run build`, puis `npm start`)
