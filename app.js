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

function buildPhraseRegex(word) {
  const w = (word || '').trim();
  if (!w) return null;
  const tokens = w.split(/\s+/).filter(Boolean).map(escapeRegExp);
  if (!tokens.length) return null;
  // Allow simple inflection on the last token (plural/possessive/verb endings)
  const last = tokens.length - 1;
  tokens[last] = `${tokens[last]}(?:'s|s|es|ed|ing)?`;
  const joined = tokens.join('\\s+');
  // Not surrounded by letters to avoid partial matches
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
    setTimeout(nextCard, 1000);
  } else {
    setFeedback('不正解…（ヒントは右の和訳にマウスオーバー）', 'ng');
    updateScore();
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
  const source = state.pool.length
    ? state.pool
    : [...Array(state.data.length).keys()];
  if (!source.length) return;
  state.attempts = 0;
  state.correct = 0;
  state.order =
    state.sortMode === 'random' ? shuffle([...source]) : [...source];
  state.idx = -1;
  nextCard();
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
}

async function load() {
  try {
    const res = await fetch('words/english_words.json', {cache: 'no-cache'});
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    if (!Array.isArray(json)) throw new Error('JSON は配列ではありません');
    state.data = json.filter(Boolean);
    populateSections();
    applySectionFilter($sectionFilter ? $sectionFilter.value : '');
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
