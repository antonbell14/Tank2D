# Tank en carton : livrable de l'interface (accueil et lobby)

Ce document décrit chaque écran et onglet du jeu, ce qu'il contient, et surtout **ce qui est relié à quoi** : quel réglage modifie quel autre onglet.

## 1. Vue d'ensemble

```
Accueil  ──[JOUER]──▶  LOBBY (4 onglets + barre de lancement)  ──[Lancer la partie]──▶  PARTIE
                        ├─ 🪖 Joueur
                        ├─ 🎮 Partie
                        ├─ 👥 Équipes
                        └─ ⚙ Options
```

- Le **serveur** (`server.py`) garde l'état partagé : mode, carte, réglages, équipes, classes, couleurs. Tous les joueurs voient la même chose, en direct.
- Le **navigateur** garde les préférences personnelles (voir §7). Elles ne sont jamais partagées avec les autres joueurs.
- L'**hôte** (le premier connecté) contrôle la partie. Les autres joueurs voient les réglages mais ne peuvent pas les modifier.

## 2. Page d'accueil

| Élément | Rôle |
|---|---|
| Titre « TANK EN CARTON » | Seul texte affiché, sur un fond animé (carte qui défile, chars et obus). |
| Bouton **JOUER** (ou Entrée / Espace) | Ferme l'accueil en fondu et affiche le lobby. |

Le fond ne communique pas avec le reste du jeu. Il est coupé dès qu'on entre dans le lobby, pour ne pas consommer de ressources.

## 3. Onglet 🪖 Joueur

**Contenu**
- Pseudo, 16 couleurs au choix.
- **Aperçu du char** (à droite) : il tourne à 360°, avec une tourelle qui balance.
- 3 cartes de classe (Léger, Lourd, Sniper) : titre, char dessiné, description, barres Vie / Vitesse / Cadence / Puissance.

**Ce que cet onglet modifie ailleurs**

| Action ici | Effet |
|---|---|
| Choisir une **couleur** | L'aperçu et les 3 chars des cartes de classe changent immédiatement. Dans **Équipes**, le pourtour de ton avatar prend cette couleur. En partie, ta tourelle (modes équipes) ou tout ton char (chacun pour soi) prend cette couleur. |
| Choisir une **classe** | L'aperçu change de forme. Dans **Équipes**, ta ligne affiche « Joueur · Lourd ». En partie, ça fixe tes PV, ta vitesse, ta cadence et tes obus. |
| Changer le **pseudo** | Il apparaît dans **Équipes** et dans le tableau des scores. |

**Ce qui influence cet onglet**
- La classe n'est modifiable que dans le lobby. Une fois la partie lancée, le serveur ignore le changement.
- En chacun pour soi, la couleur voulue n'est attribuée que si personne ne l'a déjà. Les humains sont servis avant les bots.

## 4. Onglet 🎮 Partie

**Contenu** (modifiable par l'hôte uniquement)
1. **Mode de jeu** : Équipes, Battle royale, Roi de la colline, Capture du drapeau, Élimination. Une bannière explique le mode choisi.
2. **Carte** : galerie de 10 cartes. Un clic ouvre la **vue agrandie** (grille, obstacles, téléporteurs, repères du mode, conseils). L'hôte confirme avec « Choisir cette carte ».
3. **Réglages** : un seul réglage principal qui change avec le mode, plus la vitesse de zone en battle royale.
4. **Bonus activés** : 12 bonus activables ou désactivables un par un.

**Ce que le choix du MODE change** (la chaîne de dépendances principale)

| Dans… | Ce qui s'adapte |
|---|---|
| **Équipes** | Mode *Battle royale* ou *Élimination* (chacun pour soi) : les colonnes jaune et bleue disparaissent, une colonne « Participants » apparaît (bouton « Participer »). Les autres modes affichent jaune, bleu et spectateurs. |
| **Équipes** (joueurs) | Le serveur replace automatiquement tous les participants : tous « Participants » en chacun pour soi, répartis entre jaune et bleu dans l'autre sens. Les spectateurs restent spectateurs. |
| **Barre de lancement** | Il faut **2 participants** minimum en chacun pour soi, **1** dans les autres modes. Le message d'état et le bouton « Lancer » en dépendent. |
| **Réglages** (même onglet) | Le libellé et les bornes du réglage changent : Manches pour gagner (Équipes 1 à 15, Battle royale 1 à 10), Secondes sur la colline (15 à 300), Captures pour gagner (1 à 10), Vies par joueur (1 à 10). « Vitesse de la zone » n'apparaît qu'en battle royale. |
| **Vue agrandie d'une carte** | Les repères changent : zones de départ jaune et bleu (équipes), départs en cercle (chacun pour soi), colline, drapeaux ou fin de zone. Le conseil de stratégie s'adapte aussi. |
| **Bannière du mode** | Son texte reprend la valeur du réglage (« Première équipe à 5 manches »). |
| **En partie** | Les libellés du tableau des scores, le HUD (barre de colline, drapeaux, zone rouge) et les règles de réapparition suivent le mode. |

**Ce que la CARTE change**
- La galerie met en évidence la carte active (✓ Choisie), pour tout le monde.
- Les cartes **Aléatoire**, **Grande arène** et **Bunkers** ont des téléporteurs, **Banquise** a un sol glissant : ces règles s'appliquent en partie.
- Les caisses et ruines détruites réapparaissent à chaque manche.

**Ce que les BONUS changent**
- Seuls les bonus activés apparaissent sur la carte en partie.

## 5. Onglet 👥 Équipes

**Contenu**
- Colonnes **Équipe jaune**, **Spectateurs**, **Équipe bleue** (ou **Participants** et **Spectateurs** en chacun pour soi).
- Boutons « Rejoindre » et « + BOT » (le bot s'ajoute avec une fenêtre de choix de difficulté et de classe).
- Un badge numérique sur l'onglet indique le nombre de combattants.

**Dépendances**

| Cause | Effet dans cet onglet |
|---|---|
| Mode choisi dans **Partie** | Change les colonnes affichées (voir §4). |
| Couleur et classe choisies dans **Joueur** | Visibles sur ta ligne : pourtour de l'avatar et nom de la classe. |
| Pas hôte | Les boutons « + BOT » et la suppression de bot (×) sont masqués. |
| Rejoindre une équipe | Met à jour le compteur de l'onglet, le message d'état en bas et l'activation du bouton « Lancer ». |

**Équilibrage automatique** : si on demande une équipe inexistante (par exemple « Participer » alors que le mode est par équipes), le serveur place le joueur dans l'équipe la moins remplie.

## 6. Onglet ⚙ Options (100 % personnel)

Ces réglages ne concernent que **ton** appareil.

| Réglage | Effet |
|---|---|
| Sons / Volume | Active ou coupe les bruitages en partie, et règle leur niveau. |
| Viser à la souris | La tourelle suit le curseur et le clic gauche tire. Ajoute aussi une mention d'aide dans le pied de page en partie. |
| Sensibilité de la visée | Vitesse de rotation de la tourelle vers le curseur (instantanée au maximum). N'a d'effet que si « Viser à la souris » est activé. |
| Screamer | Une surprise sur **ton** écran quand tu meurs. |
| Boutons tactiles | Affichent la croix directionnelle et les boutons FEU / mine / téléport / scores pendant la partie. Cachent l'aide clavier. Activés d'office sur écran tactile. |
| Taille, opacité, gauche/droite | Règlent la disposition des boutons tactiles. L'aperçu à côté se met à jour en direct. |
| QR code / adresse | Pour rejoindre depuis un autre appareil sur le même Wi-Fi. |

## 7. Ce qui est mémorisé et où

| Donnée | Où | Partagée ? |
|---|---|---|
| Mode, carte, réglages, bonus | Serveur | Oui, tous les joueurs |
| Équipe, classe, couleur, pseudo | Serveur | Oui |
| Classe et couleur préférées | Navigateur | Non : renvoyées au serveur à chaque connexion |
| Sons, volume, visée, sensibilité, screamer, boutons tactiles | Navigateur | Non |
| Pseudo | Non mémorisé : « Joueur » par défaut à chaque visite | – |

## 8. Barre de lancement (toujours visible)

- Affiche un message d'état qui dépend du mode et du nombre de combattants.
- Le bouton **Lancer la partie** n'apparaît que pour l'hôte et reste grisé tant qu'il n'y a pas assez de participants.
- Un joueur non hôte voit « En attente du lancement par l'hôte ».

## 9. Schéma des dépendances

```
 Mode (Partie) ────▶ Colonnes affichées (Équipes)
        │            └▶ Placement auto des joueurs (serveur)
        ├──────────▶ Libellé + bornes du réglage (Partie)
        ├──────────▶ Repères de la vue agrandie (Partie)
        ├──────────▶ Minimum de joueurs ──▶ Bouton Lancer (barre)
        └──────────▶ Règles et HUD en partie

 Couleur / Classe (Joueur) ──▶ Aperçu + cartes de classe (Joueur)
                          └─▶ Ligne du joueur (Équipes)
                          └─▶ Char en partie

 Carte (Partie) ───────────▶ Galerie ✓ + vue agrandie
                          └▶ Téléporteurs, glace, obstacles en partie

 Options ──────────────────▶ Uniquement ton appareil : sons, visée, tactile
```

## 10. Points d'attention

- Les repères de la vue agrandie (colline, drapeaux, fin de zone) sont **approximatifs** : le serveur choisit la position exacte au lancement.
- La carte aléatoire est générée à chaque manche : la galerie ne montre qu'un « ? ».
- Les boutons tactiles n'ont pas été testés sur un appareil réel, seulement vérifiés visuellement.
- Le pseudo n'est pas mémorisé entre deux visites.
