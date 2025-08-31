const state = {
  data: [],
  pool: [], // filtered indexes by section
  order: [],
  idx: -1,
  attempts: 0,
  correct: 0,
  current: null,
  filterSection: '',
  sortMode: 'sequential',
  showPopup: true,
};

const $ = (sel) => document.querySelector(sel);
const $answer = $('#answer');
const $feedback = $('#feedback');
const $sectionFilter = $('#sectionFilter');
const $sortMode = $('#sortMode');
const $skip = $('#skipBtn');
const $reset = $('#resetBtn');
const $correct = $('#correct');
const $attempts = $('#attempts');
const $remaining = $('#remaining');
const $total = $('#total');
const $ja = $('#ja');
const $jaEx = $('#jaExample');
const $hint = $('#hint');
const $enEx = $('#enExample');
const $sectionTag = $('#sectionTag');
const $loadError = $('#loadError');
const $popup = $('#popup');
const $popupSwitch = $('#popupSwitch');
const $overlay = $('#overlay');

let popupTimer = null;

function setUILocked(flag) {
  const controls = [$answer, $skip, $reset, $sectionFilter, $sortMode, $popupSwitch];
  for (const el of controls) {
    if (el) el.disabled = !!flag;
  }
}

// ---- Progress Persistence ----
const PROGRESS_KEY = 'progress_v1';

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function saveProgress() {
  try {
    const payload = {
      v: 1,
      filterSection: state.filterSection,
      sortMode: state.sortMode,
      order: Array.isArray(state.order) ? state.order.slice(0, 100000) : [],
      pool: Array.isArray(state.pool) ? state.pool.slice(0, 100000) : [],
      idx: clamp(Number(state.idx ?? -1), -1, (state.order?.length || 0) - 1),
      attempts: clamp(Number(state.attempts || 0), 0, 1e9),
      correct: clamp(Number(state.correct || 0), 0, 1e9),
      total: state.data.length,
    };
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(payload));
  } catch (_) {}
}

function tryRestoreProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return false;
    const p = JSON.parse(raw);
    if (!p || p.v !== 1) return false;
    if (!Array.isArray(p.order) || p.order.length === 0) return false;
    const N = state.data.length;
    const valid = (arr) => Array.isArray(arr) ? arr.filter((i) => Number.isInteger(i) && i >= 0 && i < N) : [];
    const order = valid(p.order);
    const pool = valid(p.pool);
    if (!order.length) return false;

    state.filterSection = typeof p.filterSection === 'string' ? p.filterSection : '';
    state.sortMode = p.sortMode === 'random' ? 'random' : 'sequential';
    state.order = order;
    state.pool = pool.length ? pool : order.slice();
    state.idx = clamp(Number(p.idx ?? -1), -1, order.length - 1);
    state.attempts = clamp(Number(p.attempts || 0), 0, 1e9);
    state.correct = clamp(Number(p.correct || 0), 0, state.attempts);

    if ($sectionFilter) {
      let found = false;
      for (const opt of $sectionFilter.options) {
        if (opt.value === state.filterSection) { found = true; break; }
      }
      $sectionFilter.value = found ? state.filterSection : '';
    }
    if ($sortMode) {
      $sortMode.value = state.sortMode;
    }

    if (state.idx >= 0 && state.idx < state.order.length) {
      const item = state.data[state.order[state.idx]];
      showCard(item);
      updateScore();
    } else {
      state.idx = -1;
      nextCard();
    }
    return true;
  } catch (_) {
    return false;
  }
}

function showPopup(text) {
  if (!state.showPopup) return;
  const msg = (text || '').trim();
  if (!$popup || !msg) return;
  $popup.textContent = msg;
  $popup.classList.add('show');
  if ($overlay) $overlay.classList.add('show');
  setUILocked(true);
  if (popupTimer) clearTimeout(popupTimer);
  popupTimer = setTimeout(() => {
    $popup.classList.remove('show');
    if ($overlay) $overlay.classList.remove('show');
    setUILocked(false);
  }, 1000);
}

function normalize(s) {
  return (s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^\s+|\s+$/g, '');
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function lastTokenInflectionPattern(raw) {
  const base = raw || '';
  const esc = escapeRegExp(base);
  if (!base) return '';
  const alts = new Set();
  const last = base.slice(-1);
  const prev = base.slice(-2, -1);
  const vowels = 'aeiouAEIOU';
  const lastEsc = escapeRegExp(last);
  const pre = base.slice(0, -1);

  // Exact
  alts.add(esc);
  // Possessive
  alts.add(esc + "'s");
  // Plural/3rd person
  alts.add(esc + 's');
  alts.add(esc + 'es');
  // -y endings (consonant + y)
  const isConsY = last.toLowerCase() === 'y' && (!prev || !vowels.includes(prev));
  if (isConsY) {
    alts.add(escapeRegExp(base.slice(0, -1)) + 'ies');
    alts.add(escapeRegExp(base.slice(0, -1)) + 'ied');
  }
  // -ed forms
  alts.add(esc + 'ed');
  if (last.toLowerCase() === 'e') {
    alts.add(esc + 'd');
  }
  // -ing forms
  alts.add(esc + 'ing');
  if (base.toLowerCase().endsWith('ie')) {
    alts.add(escapeRegExp(base.slice(0, -2)) + 'ying'); // lie -> lying
  } else if (last.toLowerCase() === 'e') {
    alts.add(escapeRegExp(base.slice(0, -1)) + 'ing'); // make -> making
  }
  // Double final consonant heuristic for short words (plan -> planned/planning)
  const consonants = 'bcdfghjklmnpqrstvwxyzBCDFGHJKLMNPQRSTVWXYZ';
  if (consonants.includes(last)) {
    alts.add(esc + lastEsc + 'ed');
    alts.add(esc + lastEsc + 'ing');
  }

  return '(?:' + Array.from(alts).join('|') + ')';
}

function buildPhraseRegex(word) {
  const w = (word || '').trim();
  if (!w) return null;
  const tokens = w.split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;
  const parts = tokens.map((t, i) => (i === tokens.length - 1 ? lastTokenInflectionPattern(t) : escapeRegExp(t)));
  const joined = parts.join('\\s+');
  return new RegExp(`(^|[^A-Za-z])(${joined})(?=[^A-Za-z]|$)`, 'gi');
}

function makeCloze(sentence, word) {
  const s = sentence || '';
  const re = buildPhraseRegex(word);
  if (!s || !re) return s;
  return s.replace(re, (_, p1, matched) => p1 + matched.replace(/[A-Za-z]/g, '_'));
}

function escapeHTML(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function makeHighlighted(sentence, word) {
  const s = sentence || '';
  if (!s) return '';
  const re = buildPhraseRegex(word);
  if (!re) return escapeHTML(s);
  let out = '';
  let last = 0;
  let m;
  while ((m = re.exec(s)) !== null) {
    const start = m.index;
    const full = m[0];
    const prefix = m[1] || '';
    const target = m[2] || '';
    out += escapeHTML(s.slice(last, start));
    out += escapeHTML(prefix);
    out += `<span class="answer">${escapeHTML(target)}</span>`;
    last = start + full.length;
    if (re.lastIndex === m.index) re.lastIndex++;
  }
  out += escapeHTML(s.slice(last));
  return out;
}

function setFeedback(text, kind) {
  $feedback.textContent = text || '';
  $feedback.className = 'feedback' + (kind ? ' ' + kind : '');
}

function updateScore() {
  $correct.textContent = String(state.correct);
  $attempts.textContent = String(state.attempts);
  const remaining = Math.max(0, state.order.length - (state.idx + 1));
  $remaining.textContent = String(remaining);
  if ($total)
    $total.textContent = String(state.pool.length || state.data.length || 0);
}

function showCard(item) {
  state.current = item;
  const $right = document.querySelector('section.right');
  if ($right) {
    $right.classList.remove('show-full');
    $right.classList.remove('show-hint');
  }
  $ja.textContent = item.ja || '';
  $jaEx.textContent = item.ja_example || '';
  $hint.textContent = item.en ? `英語: ${item.en}` : '';
  // Prepare both cloze and full versions in a single element; toggle via CSS
  const cloze = makeCloze(item.en_example || '', item.en || '');
  const full = makeHighlighted(item.en_example || '', item.en || '');
  $enEx.innerHTML = `<span class="cloze">${escapeHTML(cloze)}</span><span class="full">${full}</span>`;
  if (item.section) {
    $sectionTag.textContent = item.section;
    $sectionTag.classList.remove('hidden');
  } else {
    $sectionTag.classList.add('hidden');
  }
  setFeedback('', '');
  $answer.value = '';
  $answer.focus();
  saveProgress();
}

function nextCard() {
  if (!state.order.length) {
    $ja.textContent = '選択したセクションに該当する単語がありません。';
    $jaEx.textContent = '';
    $hint.textContent = '';
    $enEx.innerHTML = '';
    setFeedback('', '');
    updateScore();
    return;
  }
  state.idx++;
  if (state.idx >= state.order.length) {
    state.idx = 0;
    if (state.sortMode === 'random') {
      state.order = shuffle(state.order);
    }
  }
  const item = state.data[state.order[state.idx]];
  showCard(item);
  updateScore();
  saveProgress();
}

function onSubmit() {
  const input = normalize($answer.value);
  const target = normalize(state.current?.en || '');
  if (!input) return;
  state.attempts++;
  if (input === target) {
    state.correct++;
    setFeedback('正解！', 'ok');
    updateScore();
    // Show popup with English example for 1s (if enabled)
    try {
      showPopup(state.current?.en_example || '');
    } catch (_) {}
    saveProgress();
    setTimeout(nextCard, 1000);
  } else {
    setFeedback('不正解…（ヒントは右の和訳にマウスオーバー、または Shift キー押下中）', 'ng');
    updateScore();
    saveProgress();
  }
}

$answer.addEventListener('keydown', (e) => {
  if ($answer.disabled) return;
  if (e.key === 'Enter') {
    onSubmit();
  }
});
$skip.addEventListener('click', () => nextCard());
$reset.addEventListener('click', () => {
  if (!confirm('進行状況をリセットしますか？（保存データも消去）')) return;
  try { localStorage.removeItem(PROGRESS_KEY); } catch (_) {}
  const source = state.pool.length
    ? state.pool
    : [...Array(state.data.length).keys()];
  state.attempts = 0;
  state.correct = 0;
  state.order = state.sortMode === 'random' ? shuffle([...source]) : [...source];
  state.idx = -1;
  nextCard();
  saveProgress();
});

function rebuildOrder() {
  const source = state.pool.length ? state.pool : [];
  state.order =
    state.sortMode === 'random' ? shuffle([...source]) : [...source];
  state.idx = -1;
}

function populateSections() {
  const sections = new Set();
  for (const it of state.data) {
    if (it && typeof it.section === 'string' && it.section.trim()) {
      sections.add(it.section.trim());
    }
  }
  const sorted = Array.from(sections).sort((a, b) => a.localeCompare(b, 'ja'));
  while ($sectionFilter.options.length > 1) $sectionFilter.remove(1);
  for (const s of sorted) {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    $sectionFilter.appendChild(opt);
  }
}

function applySectionFilter(sectionValue) {
  state.filterSection = sectionValue || '';
  const pool = [];
  for (let i = 0; i < state.data.length; i++) {
    const it = state.data[i];
    if (!state.filterSection) {
      pool.push(i);
    } else if ((it?.section || '').trim() === state.filterSection) {
      pool.push(i);
    }
  }
  state.pool = pool;
  rebuildOrder();
  state.attempts = 0;
  state.correct = 0;
  nextCard();
  saveProgress();
}

async function load() {
  try {
    const res = await fetch('words/english_words.json', {cache: 'no-cache'});
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    if (!Array.isArray(json)) throw new Error('JSON は配列ではありません');
    state.data = json.filter(Boolean);
    populateSections();
    const restored = tryRestoreProgress();
    if (!restored) {
      applySectionFilter($sectionFilter ? $sectionFilter.value : '');
    }
  } catch (err) {
    console.error(err);
    $loadError.classList.remove('hidden');
    $loadError.textContent =
      'データ読み込みに失敗しました。ローカルサーバで開いてください（例: `npx serve` や VS Code Live Server）。';
    $ja.textContent = 'words/english_words.json を取得できませんでした。';
    $jaEx.textContent = '';
    $enEx.innerHTML = '';
    $hint.textContent = '';
  }
}

if ($sortMode) {
  $sortMode.value = state.sortMode;
}

if ($sectionFilter) {
  $sectionFilter.addEventListener('change', () => {
    applySectionFilter($sectionFilter.value);
  });
}

if ($sortMode) {
  $sortMode.addEventListener('change', () => {
    state.sortMode = $sortMode.value === 'sequential' ? 'sequential' : 'random';
    state.attempts = 0;
    state.correct = 0;
    rebuildOrder();
    nextCard();
    saveProgress();
  });
}

load();

// Initialize popup switch (default ON). Persist preference in localStorage.
try {
  const stored = localStorage.getItem('showPopup');
  if (stored === 'true' || stored === 'false') {
    state.showPopup = stored === 'true';
  }
} catch (_) {}
if ($popupSwitch) {
  $popupSwitch.checked = !!state.showPopup;
  $popupSwitch.addEventListener('change', () => {
    state.showPopup = !!$popupSwitch.checked;
    try { localStorage.setItem('showPopup', String(state.showPopup)); } catch (_) {}
  });
}

// Save on visibility change/unload as a safety
window.addEventListener('pagehide', saveProgress);
window.addEventListener('beforeunload', saveProgress);

// UI: reveal full English example while hovering Japanese (mouse) or touching (mobile)
(function setupExampleReveal() {
  const $ja = document.querySelector('#ja');
  const $right = document.querySelector('section.right');
  if (!$ja || !$right) return;
  const show = () => $right.classList.add('show-full');
  const hide = () => $right.classList.remove('show-full');
  $ja.addEventListener('mouseenter', show);
  $ja.addEventListener('mouseleave', hide);
  const isTouch = 'ontouchstart' in window || (navigator && navigator.maxTouchPoints > 0);
  if (isTouch) {
    $ja.addEventListener('touchstart', show, { passive: true });
    $ja.addEventListener('touchend', hide);
    $ja.addEventListener('touchcancel', hide);
  }
  $right.addEventListener('mouseleave', hide);
})();

// UI: while holding Shift key, temporarily show hint
(function setupHintWhileShift() {
  const $right = document.querySelector('section.right');
  if (!$right) return;
  const add = () => $right.classList.add('show-hint');
  const remove = () => $right.classList.remove('show-hint');
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Shift' || e.shiftKey) add();
  });
  document.addEventListener('keyup', (e) => {
    if (e.key === 'Shift' || !e.shiftKey) remove();
  });
  window.addEventListener('blur', remove);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') remove();
  });
})();
