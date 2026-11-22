# 🦖 Tyrajosaure

Le tirage au sort qui a du mordant ! Petit site pour tirer au sort **quel adulte (ou couple) offre un cadeau à quel enfant** à Noël.

## Fonctionnement

1. Ajoutez les **donneurs** (adulte seul ou couple, ex. « Marie & Jean ») et les **enfants**.
2. Dans **Exclusions**, touchez les enfants qu'un donneur ne doit pas tirer (ses propres enfants, par ex.).
3. Lancez le tirage : chaque donneur reçoit un enfant différent.
4. Envoyez à chacun **son lien secret** : en l'ouvrant, il découvre uniquement l'enfant qui lui est attribué. Personne, pas même l'organisateur, ne voit les résultats des autres.

La saisie **et tous les tirages** sont conservés dans le navigateur de l'organisateur (`localStorage`) : le dernier tirage s'affiche à chaque ouverture et les précédents restent dans un historique. Si quelqu'un oublie à qui il doit offrir, il suffit de lui renvoyer son lien, sans refaire de tirage. Attention : ces données sont propres à ce navigateur et à cet appareil.

> ℹ️ Le résultat est encodé dans le lien (base64) : c'est une obfuscation, pas du chiffrement. Largement suffisant entre gens de confiance.

## Technique

HTML + CSS + JavaScript vanilla, aucune dépendance, aucun build, aucun serveur. Il suffit d'ouvrir `index.html`, ou de servir le dossier avec n'importe quel serveur statique :

```sh
python3 -m http.server
```

Le tirage utilise un mélange aléatoire avec rejet (uniforme sur toutes les répartitions valides), puis un backtracking pour détecter les cas impossibles.
