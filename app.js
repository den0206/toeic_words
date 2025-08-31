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

function makeCloze(sentence, word) {
  const s = sentence || '';
  const w = (word || '').trim();
  if (!s || !w) return s;
  const re = new RegExp(`\\b${escapeRegExp(w)}\\b`, 'gi');
  const blank = w.replace(/[A-Za-z]/g, '_');
  return s.replace(re, blank || '____');
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
  const w = (word || '').trim();
  if (!s) return '';
  if (!w) return escapeHTML(s);
  const safe = escapeHTML(s);
  const re = new RegExp(`(\\b)(${escapeRegExp(w)})(\\b)`, 'gi');
  return safe.replace(re, '$1<span class="answer">$2</span>$3');
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
    setTimeout(nextCard, 450);
  } else {
    setFeedback('不正解…（ヒントは右の和訳にマウスオーバー）', 'ng');
    updateScore();
  }
}

$answer.addEventListener('keydown', (e) => {
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
