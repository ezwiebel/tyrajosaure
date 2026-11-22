'use strict';

/* ---------- Utilitaires ---------- */

const $ = (sel) => document.querySelector(sel);
const STORAGE_KEY = 'tyrajosaure:v1';
const uid = () => Math.random().toString(36).slice(2, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

// Une ligne de journal : morceaux de texte brut ou [classe, texte]
const line = (...parts) => {
  const frag = document.createDocumentFragment();
  for (const p of parts) frag.append(Array.isArray(p) ? el('span', { className: p[0], textContent: p[1] }) : p);
  frag.append('\n');
  return frag;
};

// Affiche des lignes une à une, façon terminal
async function print(pre, lines, delay = 220) {
  for (const l of lines) {
    pre.append(l);
    if (!REDUCED) await sleep(delay);
  }
}

// Encodage base64url compatible Unicode (accents, emojis…)
const encode = (obj) => {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const decode = (str) => {
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
};

const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/* ---------- Tirage ---------- */

/**
 * Attribue à chaque donneur un enfant distinct, en respectant les exclusions.
 * Retourne { giverId: childId } ou null si c'est impossible.
 */
function draw(givers, children) {
  const allowed = (g, c) => !g.excl.includes(c.id);
  const isValid = (pick) => givers.every((g, i) => allowed(g, pick[i]));

  // 1) Rejet : uniforme sur toutes les solutions valides
  for (let t = 0; t < 5000; t++) {
    const pick = shuffle(children).slice(0, givers.length);
    if (isValid(pick)) return Object.fromEntries(givers.map((g, i) => [g.id, pick[i].id]));
  }

  // 2) Backtracking aléatoire : trouve une solution si elle existe
  const used = new Set();
  const result = {};
  const order = [...givers].sort((a, b) => b.excl.length - a.excl.length);
  const solve = (k) => {
    if (k === order.length) return true;
    const g = order[k];
    for (const c of shuffle(children)) {
      if (used.has(c.id) || !allowed(g, c)) continue;
      used.add(c.id); result[g.id] = c.id;
      if (solve(k + 1)) return true;
      used.delete(c.id);
    }
    return false;
  };
  return solve(0) ? result : null;
}

/* ---------- Vue organisateur ---------- */

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (s && Array.isArray(s.givers) && Array.isArray(s.children)) {
      if (!Array.isArray(s.draws)) s.draws = [];
      return s;
    }
  } catch (_) { /* ignore */ }
  return { givers: [], children: [], draws: [] };
}

function organizer() {
  const state = loadState();
  const saveLocal = () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { /* ignore */ }
  };

  /* --- Synchronisation avec le serveur (si présent) --- */
  const sync = { enabled: false, rev: 0, busy: false, dirty: false };
  const syncLine = $('#sync');
  const syncSay = (text, kind = '') => { syncLine.textContent = text; syncLine.className = `sync ${kind}`; };
  const hasContent = (s) => s.givers.length || s.children.length || s.draws.length;

  // Remplace l'état courant par celui du serveur
  function adopt(data) {
    state.givers = Array.isArray(data.givers) ? data.givers : [];
    state.children = Array.isArray(data.children) ? data.children : [];
    state.draws = Array.isArray(data.draws) ? data.draws : [];
    saveLocal();
    render();
    renderDraws();
  }

  async function push() {
    if (sync.busy) { sync.dirty = true; return; }
    sync.busy = true;
    sync.dirty = false;
    try {
      const res = await fetch('api/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rev: sync.rev, data: state }),
      });
      const body = await res.json();
      if (res.status === 409) {
        sync.rev = body.rev;
        adopt(body.data || {});
        sync.dirty = false;
        syncSay('! Quelqu\'un a modifié les données depuis un autre appareil : la page a été mise à jour. Refaites votre dernière modification si besoin.', 'warn');
      } else if (res.ok) {
        sync.rev = body.rev;
        syncSay('✓ Enregistré sur le serveur', 'ok');
      } else {
        throw new Error(body.error || res.status);
      }
    } catch (_) {
      syncSay('! Serveur injoignable : enregistré sur cet appareil uniquement', 'warn');
    }
    sync.busy = false;
    if (sync.dirty) push();
  }

  async function connect() {
    if (!location.protocol.startsWith('http')) return;
    try {
      const res = await fetch('api/state', { cache: 'no-store' });
      if (!res.ok) return;
      const remote = await res.json();
      sync.enabled = true;
      sync.rev = remote.rev;
      if (remote.data) {
        adopt(remote.data);
        syncSay('✓ Données chargées depuis le serveur', 'ok');
      } else if (hasContent(state)) {
        push(); // première fois : on envoie ce qui était sur cet appareil
      } else {
        syncSay('✓ Connecté au serveur', 'ok');
      }
    } catch (_) { /* pas de serveur : mode local */ }
  }

  const save = () => {
    saveLocal();
    if (sync.enabled) push();
  };

  const log = $('#log');
  const say = (...parts) => log.replaceChildren(line(...parts));

  function render() {
    // Listes
    for (const key of ['givers', 'children']) {
      $(`#${key}`).replaceChildren(...state[key].map((item) =>
        el('li', {},
          el('span', { className: 'name', textContent: item.name }),
          el('button', {
            className: 'del', type: 'button', textContent: '×',
            title: `Supprimer ${item.name}`,
            onclick: () => remove(key, item.id),
          }))));
    }

    // Exclusions
    const box = $('#exclusions');
    if (!state.givers.length || !state.children.length) {
      box.replaceChildren(el('p', { className: 'empty', textContent: 'Ajoutez d\'abord des donneurs et des enfants.' }));
    } else {
      box.replaceChildren(...state.givers.map((g) =>
        el('div', { className: 'excl-row' },
          el('div', { className: 'who', textContent: g.name }),
          el('div', { className: 'chips' }, ...state.children.map((c) => {
            const off = g.excl.includes(c.id);
            return el('button', {
              type: 'button',
              className: `chip${off ? ' off' : ''}`,
              title: off ? 'Exclu : cliquer pour autoriser' : 'Autorisé : cliquer pour exclure',
              ariaPressed: String(off),
              onclick: () => toggle(g, c.id),
            }, el('span', { className: 'box', textContent: off ? '✗ ' : '✓ ' }), el('span', { className: 'name', textContent: c.name }));
          })))));
    }
    $('#draw').disabled = !state.givers.length || !state.children.length;
  }

  function remove(key, id) {
    state[key] = state[key].filter((x) => x.id !== id);
    if (key === 'children') state.givers.forEach((g) => { g.excl = g.excl.filter((c) => c !== id); });
    invalidate();
  }

  function toggle(giver, childId) {
    giver.excl = giver.excl.includes(childId)
      ? giver.excl.filter((c) => c !== childId)
      : [...giver.excl, childId];
    invalidate();
  }

  // Après toute modification des listes : on sauvegarde et on réaffiche
  function invalidate() {
    log.replaceChildren();
    save();
    render();
    renderDraws();
  }

  document.querySelectorAll('form.add').forEach((form) => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = form.querySelector('input');
      const name = input.value.trim();
      if (!name) return;
      const key = form.dataset.list;
      if (state[key].some((x) => x.name.toLowerCase() === name.toLowerCase())) {
        say(['err', '✗ '], `« ${name} » est déjà dans la liste`);
        return;
      }
      state[key].push(key === 'givers' ? { id: uid(), name, excl: [] } : { id: uid(), name });
      input.value = '';
      input.focus();
      invalidate();
    });
  });

  let running = false;
  $('#draw').addEventListener('click', async () => {
    if (running) return;
    if (state.draws.length && !window.confirm(
      'Un tirage a déjà été fait. En relancer un changera les résultats pour tout le monde '
      + '(l\'ancien restera consultable dans l\'historique). Continuer ?',
    )) return;
    const { givers, children } = state;
    const nbExcl = givers.reduce((n, g) => n + g.excl.length, 0);
    log.replaceChildren();
    running = true;

    await print(log, [
      line(['dim', '… '], `${givers.length} donneur(s), ${children.length} enfant(s), ${nbExcl} exclusion(s)`),
    ]);

    const fail = async (msg) => { await print(log, [line(['err', '✗ '], msg)]); running = false; };

    if (givers.length > children.length) {
      return fail(`${givers.length} donneurs pour ${children.length} enfant(s) : ajoutez des enfants ou regroupez des donneurs`);
    }
    const blocked = givers.find((g) => children.every((c) => g.excl.includes(c.id)));
    if (blocked) return fail(`${blocked.name} a exclu tous les enfants`);

    const result = draw(givers, children);
    if (!result) return fail('aucune répartition possible avec ces exclusions, retirez-en quelques-unes');

    const extra = children.length - givers.length;
    await print(log, [
      line(['dim', '… '], 'le Tyrajosaure mélange les prénoms dans son bonnet'),
      ...(extra > 0 ? [line(['warn', '! '], `attention : ${extra} enfant(s) sans donneur`)] : []),
      line(['ok', '✓ '], `c'est fait ! ${givers.length} lien(s) secret(s) à envoyer ci-dessous`),
    ]);
    saveDraw(result);
    running = false;
  });

  // Empreinte des listes, pour savoir si elles ont changé depuis un tirage
  const signature = () => JSON.stringify([state.givers, state.children]);

  function saveDraw(result) {
    const childName = (id) => state.children.find((c) => c.id === id).name;
    state.draws.unshift({
      id: uid().slice(0, 5).toUpperCase(),
      date: new Date().toISOString(),
      pairs: state.givers.map((g) => ({ g: g.name, c: childName(result[g.id]) })),
      sig: signature(),
    });
    save();
    renderDraws();
    $('#results').scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' });
  }

  const base = location.protocol === 'file:'
    ? location.href.split('#')[0]
    : location.origin + location.pathname;

  const when = (iso) => {
    const d = new Date(iso);
    return `${d.toLocaleDateString('fr-FR')} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
  };

  // Liste des liens secrets d'un tirage
  function linkList(draw) {
    return el('ul', { className: 'links' }, ...draw.pairs.map(({ g, c }) => {
      const url = `${base}#r=${encode({ g, c, id: draw.id, d: draw.date.slice(0, 10) })}`;
      const copy = el('button', { className: 'btn small', type: 'button', textContent: 'Copier' });
      copy.onclick = async () => {
        try {
          await navigator.clipboard.writeText(url);
          copy.textContent = 'Copié ✓';
        } catch (_) {
          window.prompt('Copiez ce lien :', url);
        }
        setTimeout(() => { copy.textContent = 'Copier'; }, 1800);
      };
      const actions = el('span', { className: 'actions' }, copy);
      if (navigator.share) {
        actions.append(el('button', {
          className: 'btn small', type: 'button', textContent: 'Partager',
          onclick: () => navigator.share({ title: 'Tyrajosaure 🦖', text: `${g}, découvre à qui tu fais un cadeau :`, url }).catch(() => {}),
        }));
      }
      return el('li', {},
        el('span', { className: 'name', textContent: g }),
        el('span', { className: 'dots', ariaHidden: 'true' }),
        actions);
    }));
  }

  function renderDraws() {
    const [last, ...older] = state.draws;
    $('#results').hidden = !last;
    if (!last) return;

    $('#links').replaceChildren(linkList(last));
    $('#draw-info').textContent = `Tirage n° ${last.id} du ${when(last.date)}.`;
    $('#draw-stale').hidden = last.sig === signature();

    const history = $('#history');
    history.hidden = !older.length;
    $('#history-count').textContent = older.length;
    $('#history-list').replaceChildren(...older.map((d) =>
      el('div', { className: 'old-draw' },
        el('div', { className: 'old-head' },
          el('strong', { textContent: `Tirage n° ${d.id}` }),
          el('span', { className: 'hint', textContent: `du ${when(d.date)}` }),
          el('button', {
            className: 'del', type: 'button', textContent: '×',
            title: 'Supprimer ce tirage de l\'historique',
            onclick: () => {
              if (!window.confirm(`Supprimer définitivement le tirage n° ${d.id} ?`)) return;
              state.draws = state.draws.filter((x) => x !== d);
              save();
              renderDraws();
            },
          })),
        linkList(d))));
  }

  $('#reset').addEventListener('click', () => {
    if (!window.confirm('Effacer tous les donneurs, enfants et exclusions ? (les tirages déjà faits restent consultables)')) return;
    state.givers = [];
    state.children = [];
    invalidate();
  });

  render();
  renderDraws();
  $('#organizer').hidden = false;
  connect();
}

/* ---------- Vue révélation ---------- */

async function reveal(payload) {
  let data;
  try {
    data = decode(payload);
    if (!data.g || !data.c) throw new Error('incomplet');
  } catch (_) {
    $('#broken').hidden = false;
    return;
  }
  document.title = `Tyrajosaure — ${data.g}`;
  $('#reveal').hidden = false;

  const out = $('#r-out');
  const when = data.d ? ` du ${new Date(data.d).toLocaleDateString('fr-FR')}` : '';
  await print(out, [
    line('Bonjour ', ['hl', data.g], ' !'),
    line(['dim', `tirage${data.id ? ` n° ${data.id}` : ''}${when}`]),
    line(''),
    line(['dim', '… '], 'le Tyrajosaure renifle la forêt de sapins'),
  ], 350);

  const btn = $('#reveal-btn');
  btn.hidden = false;
  btn.focus();

  btn.addEventListener('click', async () => {
    btn.hidden = true;

    // Barre de progression ASCII
    const bar = el('span');
    out.append(line(['dim', '… '], bar));
    const W = 20;
    for (let i = 0; i <= W; i++) {
      bar.textContent = `[${'#'.repeat(i)}${'.'.repeat(W - i)}] ${Math.round((i / W) * 100)}%`;
      if (!REDUCED) await sleep(60 + Math.random() * 90);
    }

    // Boîte autour du prénom
    const label = `  >> ${data.c} <<  `;
    const width = [...label].length;
    const edge = `+${'-'.repeat(width)}+`;
    await print(out, [
      line(['ok', '✓ '], 'trouvé ! vous offrez un cadeau à :'),
      line(''),
      line(['hl', `  ${edge}`]),
      line(['hl', `  |${label}|`]),
      line(['hl', `  ${edge}`]),
      line(''),
      line(['dim', '  RAWR ! Joyeux Noël 🎄']),
    ], 250);
  }, { once: true });
}

/* ---------- Routage ---------- */

function route() {
  document.querySelectorAll('main').forEach((m) => { m.hidden = true; });
  const match = location.hash.match(/^#r=(.+)$/);
  if (match) reveal(match[1]);
  else organizer();
}

window.addEventListener('hashchange', () => location.reload());
route();
