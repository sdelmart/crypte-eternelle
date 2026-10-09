# Crypte Éternelle

Roguelike d'action en 2D pour navigateur. Aucune dépendance, aucun build : ouvre `index.html`.

## Jouer

- Double-clique sur `index.html`, ou lance un serveur local : `python3 -m http.server` puis ouvre http://localhost:8000
- Les polices viennent de Google Fonts. Hors ligne, le jeu utilise des polices système.

## Contrôles

| Action            | Clavier / souris  | Manette      |
| ----------------- | ----------------- | ------------ |
| Bouger            | ZQSD (ou WASD)    | Stick gauche |
| Tirer             | Souris ou flèches | Stick droit  |
| Dash (invincible) | Espace / Maj      | A / RB / RT  |
| Bombe             | E                 | X / LB       |
| Carte             | Tab               | Select       |
| Pause             | Échap / P         | Start        |
| Plein écran / son | F / M             | —            |

## Contenu

- 5 étages générés aléatoirement (salle de trésor, boutique, salle secrète, boss)
- 3 héros : Élyra la Mage, Nyx la Rôdeuse (débloquée en vainquant un boss), Aldric le Chevalier (débloqué en atteignant l'étage 3)
- 7 types d'ennemis plus des variantes d'élite, et 4 boss avec une seconde phase
- 21 objets qui se combinent, et un Grimoire qui les répertorie
- Autel des âmes : améliorations permanentes entre les parties
- Musique et sons générés en temps réel (Web Audio)
- Sauvegarde locale (localStorage) de la progression et des paramètres

## Structure

```
js/utils.js     constantes, maths, collisions
js/audio.js     paramètres, effets sonores, musique procédurale
js/input.js     clavier, souris, manette
js/items.js     objets, héros, améliorations
js/dungeon.js   génération des étages et rendu des salles
js/entities.js  joueur, ennemis, IA des boss
js/render.js    dessin des personnages et primitives
js/game.js      logique de partie
js/draw.js      rendu du jeu, HUD et menus
js/main.js      boucle principale
```
