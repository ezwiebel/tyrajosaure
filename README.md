# 🦖 Tyrajosaure

Le tirage au sort qui a du mordant ! Petit site pour tirer au sort **quel adulte (ou couple) offre un cadeau à quel enfant** à Noël.

## Fonctionnement

1. Ajoutez les **donneurs** (adulte seul ou couple, ex. « Marie & Jean ») et les **enfants**.
2. Dans **Exclusions**, touchez les enfants qu'un donneur ne doit pas tirer (ses propres enfants, par ex.).
3. Lancez le tirage : chaque donneur reçoit un enfant différent.
4. Envoyez à chacun **son lien secret** : en l'ouvrant, il découvre uniquement l'enfant qui lui est attribué. Personne, pas même l'organisateur, ne voit les résultats des autres.

Les listes **et tous les tirages** sont enregistrés sur le serveur (avec une copie dans le navigateur). Le dernier tirage s'affiche à chaque ouverture et les précédents restent dans un historique. Si quelqu'un oublie à qui il doit offrir, il suffit de lui renvoyer son lien, sans refaire de tirage.

> ℹ️ Le résultat est encodé dans le lien (base64) : c'est une obfuscation, pas du chiffrement. Largement suffisant entre gens de confiance. La page organisateur n'est pas protégée par un mot de passe.

## Technique

- `public/` : le site (HTML + CSS + JavaScript vanilla, aucune dépendance, aucun build).
- `server.py` : un petit serveur Python (bibliothèque standard uniquement) qui sert `public/` et une mini-API :
  - `GET /api/state` → `{"rev": n, "data": {...}}`
  - `PUT /api/state` avec `{"rev": n, "data": {...}}` → `{"rev": n+1}`, ou `409` avec l'état actuel si quelqu'un a enregistré entre-temps (pas d'écrasement silencieux).
  - Les données tiennent dans un seul fichier : `$DATA_DIR/state.json`.
- Sans serveur (en ouvrant directement `public/index.html`), le site fonctionne seul avec le `localStorage`.

Le tirage utilise un mélange aléatoire avec rejet (uniforme sur toutes les répartitions valides), puis un backtracking pour détecter les cas impossibles.

### En local

```sh
python3 server.py          # http://localhost:8000, données dans ./data/
```

### En production (Docker + nginx-proxy + acme-companion)

Le `docker-compose.yml` déclare `VIRTUAL_HOST`, `VIRTUAL_PORT` et `LETSENCRYPT_HOST` pour `tyrajosaure.example.com` et rejoint le réseau externe du proxy (`nginx-proxy` par défaut, à surcharger via `PROXY_NETWORK` dans un fichier `.env`).

```sh
docker compose up -d --build
```

Les données sont dans le volume `tyrajosaure-data`. Sauvegarde :

```sh
docker compose cp tyrajosaure:/data/state.json ./state-backup.json
```
