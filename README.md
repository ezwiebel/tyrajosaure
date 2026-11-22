# 🦖 Tyrajosaure

Le tirage au sort qui a du mordant ! Petit site pour tirer au sort **quel adulte (ou couple) offre un cadeau à quel enfant** à Noël.

- [Fonctionnement](#fonctionnement)
- [Structure du dépôt](#structure-du-dépôt)
- [Tester en local](#tester-en-local)
- [Déployer sur un serveur](#déployer-sur-un-serveur)
- [API](#api)
- [Notes pour les agents et contributeurs](#notes-pour-les-agents-et-contributeurs)

## Fonctionnement

1. Ajoutez les **donneurs** (adulte seul ou couple, ex. « Marie & Jean ») et les **enfants**.
2. Dans l'étape **« Qui ne peut pas tirer qui ? »**, cliquez sur les enfants qu'un donneur ne doit pas tirer (ses propres enfants, par ex.).
3. Lancez le tirage : chaque donneur reçoit un enfant différent.
4. Envoyez à chacun **son lien secret** : en l'ouvrant, il découvre uniquement l'enfant qui lui est attribué. Personne, pas même l'organisateur, ne voit les résultats des autres.

Les listes **et tous les tirages** sont enregistrés sur le serveur, avec une copie dans le navigateur. Le dernier tirage s'affiche à chaque ouverture et les précédents restent dans un historique. Si quelqu'un oublie à qui il doit offrir, il suffit de lui renvoyer son lien, sans refaire de tirage.

> ⚠️ Le résultat est encodé dans le lien (base64) : c'est une obfuscation, pas du chiffrement. La page organisateur n'a **pas de mot de passe** : toute personne qui ouvre le site peut voir les listes et les liens (donc les résultats) et les modifier. Prévu pour un usage familial, entre gens de confiance.

## Structure du dépôt

| Chemin | Rôle |
|---|---|
| `public/` | Le site : `index.html`, `style.css`, `app.js`. JavaScript vanilla, aucune dépendance, aucun build. |
| `server.py` | Serveur Python (bibliothèque standard uniquement) : sert `public/` et l'[API](#api) de stockage. |
| `Dockerfile` | Image `python:3.13-alpine` (~70 Mo), utilisateur non-root, healthcheck. |
| `docker-compose.yml` | Déploiement derrière **nginx-proxy + acme-companion** (réseau externe, pas de port publié). |
| `docker-compose.local.yml` | Surcharge pour tester en local **sans proxy** (publie le port sur `127.0.0.1`). |
| `.env.example` | Variables (`DOMAIN`, `PROXY_NETWORK`, `LOCAL_PORT`) à copier dans `.env`. `DOMAIN` est indispensable en production. |

Le site a deux modes, choisis automatiquement au chargement :

- **avec serveur** (servi en `http(s)://` et `api/state` répond) : les données sont lues et enregistrées sur le serveur, avec une copie dans le `localStorage` ;
- **sans serveur** (ouverture de `public/index.html` en `file://`, ou API absente) : tout reste dans le `localStorage` du navigateur.

## Tester en local

Trois façons de faire, de la plus légère à la plus proche de la production. Aucune n'a besoin de nginx-proxy.

### 1. Sans rien installer : ouvrir le fichier

Ouvrez `public/index.html` dans un navigateur. Mode **sans serveur** : les données restent dans ce navigateur. Pratique pour tester l'interface et le tirage.

### 2. Avec Python 3 (sans Docker)

```sh
python3 server.py
# → http://localhost:8000   (données dans ./data/state.json)
```

Variables d'environnement facultatives : `PORT` (défaut `8000`), `DATA_DIR` (défaut `./data`), `PUBLIC_DIR` (défaut `./public`).

```sh
PORT=8080 DATA_DIR=/tmp/tyra python3 server.py
```

Repartir de zéro : arrêter le serveur (`Ctrl+C`) et supprimer `data/state.json`.

### 3. Avec Docker, comme en production (sans proxy)

`docker-compose.local.yml` ajoute un port publié sur `127.0.0.1` et remplace le réseau externe du proxy par un réseau créé automatiquement :

```sh
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
# → http://localhost:8000   (autre port : LOCAL_PORT=8080 docker compose …)
```

Arrêter et **tout supprimer**, données de test comprises : `Ctrl+C` puis

```sh
docker compose -f docker-compose.yml -f docker-compose.local.yml down -v
```

> Ne lancez pas cette commande `down -v` sur le serveur de production : `-v` supprime le volume de données.

### Vérifications rapides

Avec le serveur lancé (méthode 2 ou 3) :

```sh
curl -s localhost:8000/api/state
# {"rev": 0, "data": null}           ← aucun enregistrement encore

curl -s -X PUT -d '{"rev":0,"data":{"givers":[],"children":[],"draws":[]}}' localhost:8000/api/state
# {"rev": 1}

curl -s -o /dev/null -w '%{http_code}\n' -X PUT -d '{"rev":0,"data":{}}' localhost:8000/api/state
# 409                                ← révision périmée : refusé

curl -s -o /dev/null -w '%{http_code}\n' localhost:8000/server.py
# 404                                ← seul public/ est servi
```

Puis dans le navigateur, sur `http://localhost:8000` :

1. Ajoutez 3 donneurs, 4 enfants et quelques exclusions, puis lancez le tirage.
2. En bas de page, la ligne d'état doit indiquer **« ✓ Enregistré sur le serveur »**.
3. Ouvrez la même adresse dans une **fenêtre privée** : les listes et le tirage doivent y apparaître (ils viennent du serveur).
4. Copiez un lien secret et ouvrez-le : seul l'enfant attribué à ce donneur s'affiche.
5. Avec Docker, vérifiez l'état du conteneur : `docker ps` doit afficher `(healthy)`.

## Déployer sur un serveur

### Prérequis

- Docker avec le plugin Compose (`docker compose version`).
- [nginx-proxy](https://github.com/nginx-proxy/nginx-proxy) et [acme-companion](https://github.com/nginx-proxy/acme-companion) déjà en place, reliés à un **réseau Docker partagé**. Retrouvez son nom avec `docker network ls` (ou `docker inspect nginx-proxy`).
- Un enregistrement DNS (A/AAAA) du domaine choisi pointant vers le serveur.

### Installation

```sh
git clone https://github.com/ezwiebel/tyrajosaure.git
cd tyrajosaure
cp .env.example .env     # puis adapter DOMAIN (obligatoire) et PROXY_NETWORK
docker compose up -d --build
```

> ⚠️ Sans `DOMAIN` dans `.env`, le compose utilise le domaine d'exemple `tyrajosaure.example.com` : le site ne sera pas joignable et aucun certificat ne sera obtenu. Vérifiez avec `docker compose config | grep VIRTUAL_HOST`.

Le conteneur `tyrajosaure` rejoint le réseau du proxy et déclare `VIRTUAL_HOST`, `VIRTUAL_PORT=8000` et `LETSENCRYPT_HOST`. nginx-proxy route alors le domaine vers lui, et acme-companion obtient le certificat (cela peut prendre une minute). Aucun port n'est publié sur l'hôte.

Si acme-companion n'a pas d'e-mail par défaut (`DEFAULT_EMAIL`), ajoutez `LETSENCRYPT_EMAIL: vous@exemple.fr` dans la section `environment` de `docker-compose.yml`.

### Vérifier le déploiement

```sh
docker compose ps                        # STATUS doit afficher (healthy)
docker compose logs -f                   # requêtes reçues par le serveur
curl -s https://<DOMAIN>/api/state       # {"rev": …, "data": …}
```

### Mettre à jour

```sh
git pull
docker compose up -d --build
```

Les données sont dans le volume Docker `tyrajosaure_tyrajosaure-data` (le préfixe est le nom du dossier, donc du projet Compose). Elles sont conservées lors des mises à jour et des redémarrages.

### Sauvegarder et restaurer

```sh
# Sauvegarde
docker compose cp tyrajosaure:/data/state.json ./state-backup.json

# Restauration (puis recharger la page dans le navigateur)
docker compose cp ./state-backup.json tyrajosaure:/data/state.json
```

### Sans nginx-proxy

Avec un autre reverse proxy (Caddy, Traefik, nginx classique…), publiez le port du conteneur sur l'hôte, comme le fait `docker-compose.local.yml`, et faites pointer le proxy vers `127.0.0.1:8000`. On peut aussi lancer `python3 server.py` directement, par exemple dans un service systemd. Le serveur ne gère pas le HTTPS : c'est le rôle du proxy.

## API

Les données tiennent dans un seul fichier, `$DATA_DIR/state.json`, écrit de façon atomique.

| Requête | Réponse |
|---|---|
| `GET /api/state` | `200 {"rev": n, "data": {...}}`. `data` vaut `null` si rien n'a encore été enregistré. |
| `PUT /api/state` avec `{"rev": n, "data": {...}}` | `200 {"rev": n+1}` si `n` est la révision actuelle. Sinon `409` avec l'état actuel : quelqu'un a enregistré entre-temps, rien n'est écrasé. |
| | `400` si le JSON est invalide, `413` au-delà de 512 Kio. |

Format de `data` (celui du `localStorage`, clé `tyrajosaure:v1`) :

```json
{
  "givers":   [{ "id": "k3j9x2ab", "name": "Marie & Jean", "excl": ["p0q8z1cd"] }],
  "children": [{ "id": "p0q8z1cd", "name": "Zoé" }],
  "draws":    [{ "id": "AB12C", "date": "2026-11-22T14:00:00.000Z",
                 "pairs": [{ "g": "Marie & Jean", "c": "Léo" }], "sig": "…" }]
}
```

`draws` est trié du plus récent au plus ancien. Un lien secret a la forme `…/#r=<base64url({"g": donneur, "c": enfant, "id": n° du tirage, "d": "AAAA-MM-JJ"})>`. Il ne dépend pas du serveur : un lien reste valable même si les données sont effacées.

## Notes pour les agents et contributeurs

- **Aucune dépendance, aucun build, aucun test automatisé.** On vérifie avec les commandes de [Vérifications rapides](#vérifications-rapides).
- La logique de tirage est dans `public/app.js`, fonction `draw()` : mélange aléatoire avec rejet (uniforme sur toutes les répartitions valides), puis backtracking pour détecter les cas impossibles.
- Garder `server.py` sur la bibliothèque standard, et le site sans framework ni CDN.
- Le site doit continuer de fonctionner en `file://` (mode sans serveur).
- Changer le format des liens secrets casserait les liens déjà envoyés : rester rétrocompatible.
