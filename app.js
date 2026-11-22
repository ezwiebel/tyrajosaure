'use strict';

/* ---------- Utilitaires ---------- */

const $ = (sel) => document.querySelector(sel);
const STORAGE_KEY = 'tyrajosaure:v1';
const uid = () => Math.random().toString(36).slice(2, 10);

const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

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
    if (s && Array.isArray(s.givers) && Array.isArray(s.children)) return s;
  } catch (_) { /* ignore */ }
  return { givers: [], children: [] };
}

function organizer() {
  const state = loadState();
  const save = () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { /* ignore */ }
  };

  const message = $('#message');
  const say = (text, kind = '') => { message.textContent = text; message.className = `message ${kind}`; };

  function render() {
    // Listes
    for (const key of ['givers', 'children']) {
      const ul = $(`#${key}`);
      ul.replaceChildren(...state[key].map((item) =>
        el('li', {},
          item.name,
          el('button', {
            className: 'del', type: 'button', textContent: '×', title: 'Supprimer',
            onclick: () => remove(key, item.id),
          }))));
    }

    // Exclusions
    const box = $('#exclusions');
    if (!state.givers.length || !state.children.length) {
      box.replaceChildren(el('p', { className: 'empty', textContent: 'Ajoutez des donneurs et des enfants d\'abord.' }));
    } else {
      box.replaceChildren(...state.givers.map((g) =>
        el('div', { className: 'excl-row' },
          el('div', { className: 'who', textContent: g.name }),
          el('div', { className: 'chips' }, ...state.children.map((c) => {
            const off = g.excl.includes(c.id);
            return el('button', {
              type: 'button',
              className: `chip${off ? ' off' : ''}`,
              textContent: c.name,
              title: off ? 'Exclu — toucher pour autoriser' : 'Autorisé — toucher pour exclure',
              onclick: () => toggle(g, c.id),
            });
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

  // Toute modification rend le dernier tirage obsolète
  function invalidate() {
    $('#results').hidden = true;
    say('');
    save();
    render();
  }

  document.querySelectorAll('form.add').forEach((form) => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = form.querySelector('input');
      const name = input.value.trim();
      if (!name) return;
      const key = form.dataset.list;
      if (state[key].some((x) => x.name.toLowerCase() === name.toLowerCase())) {
        say(`« ${name} » est déjà dans la liste.`, 'error');
        return;
      }
      state[key].push(key === 'givers' ? { id: uid(), name, excl: [] } : { id: uid(), name });
      input.value = '';
      input.focus();
      invalidate();
    });
  });

  $('#draw').addEventListener('click', () => {
    const { givers, children } = state;
    if (givers.length > children.length) {
      say(`Il y a ${givers.length} donneurs pour seulement ${children.length} enfant(s) : ajoutez des enfants ou regroupez des donneurs.`, 'error');
      return;
    }
    const blocked = givers.find((g) => children.every((c) => g.excl.includes(c.id)));
    if (blocked) {
      say(`${blocked.name} a exclu tous les enfants !`, 'error');
      return;
    }
    const result = draw(givers, children);
    if (!result) {
      say('Impossible de trouver une répartition avec ces exclusions. Retirez-en quelques-unes.', 'error');
      return;
    }

    const extra = children.length - givers.length;
    if (extra > 0) say(`Tirage effectué ! Attention : ${extra} enfant(s) n'auront pas de donneur.`, 'warn');
    else say('Tirage effectué ! 🦖 Le Tyrajosaure a parlé.', 'ok');

    showLinks(result);
  });

  function showLinks(result) {
    const drawId = uid().slice(0, 5).toUpperCase();
    const date = new Date().toISOString().slice(0, 10);
    const base = location.origin === 'null' || location.protocol === 'file:'
      ? location.href.split('#')[0]
      : location.origin + location.pathname;
    const childName = (id) => state.children.find((c) => c.id === id).name;

    $('#draw-info').textContent = `Tirage n° ${drawId} du ${new Date().toLocaleDateString('fr-FR')}. Un nouveau tirage rend ces liens obsolètes.`;
    $('#links').replaceChildren(...state.givers.map((g) => {
      const url = `${base}#r=${encode({ g: g.name, c: childName(result[g.id]), id: drawId, d: date })}`;
      const copy = el('button', { className: 'btn small', type: 'button', textContent: '📋 Copier' });
      copy.onclick = async () => {
        try {
          await navigator.clipboard.writeText(url);
          copy.textContent = '✅ Copié';
        } catch (_) {
          window.prompt('Copiez ce lien :', url);
        }
        setTimeout(() => { copy.textContent = '📋 Copier'; }, 1800);
      };
      const actions = el('div', { className: 'actions' }, copy);
      if (navigator.share) {
        actions.append(el('button', {
          className: 'btn small', type: 'button', textContent: '📤 Partager',
          onclick: () => navigator.share({ title: 'Tyrajosaure 🦖', text: `${g.name}, découvre à qui tu fais un cadeau :`, url }).catch(() => {}),
        }));
      }
      return el('li', {}, el('strong', { textContent: g.name }), actions);
    }));
    $('#results').hidden = false;
    $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  $('#reset').addEventListener('click', () => {
    if (!window.confirm('Effacer tous les donneurs, enfants et exclusions ?')) return;
    state.givers = [];
    state.children = [];
    invalidate();
  });

  render();
  $('#organizer').hidden = false;
}

/* ---------- Vue révélation ---------- */

function reveal(payload) {
  let data;
  try {
    data = decode(payload);
    if (!data.g || !data.c) throw new Error('incomplet');
  } catch (_) {
    $('#broken').hidden = false;
    return;
  }
  $('#r-giver').textContent = data.g;
  $('#r-child').textContent = data.c;
  if (data.id) $('#r-info').textContent = `Tirage n° ${data.id}${data.d ? ` du ${new Date(data.d).toLocaleDateString('fr-FR')}` : ''}`;
  document.title = `Tyrajosaure — ${data.g}`;

  $('#reveal-btn').addEventListener('click', () => {
    const egg = $('#egg');
    egg.classList.add('shake');
    setTimeout(() => {
      $('#reveal-btn').hidden = true;
      $('#r-child-box').hidden = false;
    }, 1500);
  }, { once: true });

  $('#reveal').hidden = false;
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
