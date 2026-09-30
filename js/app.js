/**
 * FPヒアリングサイト — 画面の動き
 *
 * 流れ：同意 → 入力（STEPS）→ 確認 → 送信 → 完了
 * 入力途中の内容はこの端末の sessionStorage だけに置き、送信後に消します。
 * サーバー（GAS）に送るのは、確認画面で「送信する」を押したときの1回だけです。
 */

const DRAFT_KEY = 'fphs-draft';
const $ = (s, el = document) => el.querySelector(s);

// 案内URLの合言葉（?t=...）。GAS 側で照合し、一致しない送信は受け付けない
const TOKEN = new URLSearchParams(location.search).get('t') || '';

let A = loadDraft(); // 回答
let current = -1; // -1=同意画面、0..STEPS.length-1=入力、STEPS.length=確認

/* 下書きの保存 ------------------------------------------------------- */
function loadDraft() {
  try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY)) || {}; } catch (e) { return {}; }
}
function saveDraft() {
  try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(A)); } catch (e) { /* 保存できなくても入力は続けられる */ }
}
function clearDraft() {
  try { sessionStorage.removeItem(DRAFT_KEY); } catch (e) { /* なにもしない */ }
}

/* 画面の切り替え ----------------------------------------------------- */
function show(id) {
  ['view-consent', 'view-form', 'view-confirm', 'view-done'].forEach((v) => { $('#' + v).hidden = v !== id; });
  window.scrollTo(0, 0);
}

function goStep(i) {
  current = i;
  if (i < 0) return show('view-consent');
  if (i >= STEPS.length) { renderConfirm(); return show('view-confirm'); }
  renderStep(i);
  show('view-form');
}

/* 入力画面の組み立て ------------------------------------------------- */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderProgress(i) {
  const pct = Math.round(((i + 1) / (STEPS.length + 1)) * 100);
  $('#progress-bar').style.width = pct + '%';
  $('#progress-text').textContent = `${i + 1} / ${STEPS.length}　${STEPS[i].title}`;
}

function renderStep(i) {
  const s = STEPS[i];
  renderProgress(i);
  const html = [`<h2 class="step-title">${esc(s.title)}</h2>`];
  if (s.lead) html.push(`<p class="lead">${esc(s.lead)}</p>`);
  s.q.forEach((q) => html.push(renderQuestion(q)));
  $('#step-body').innerHTML = html.join('');
  $('#btn-back').textContent = i === 0 ? '同意画面へ' : '戻る';
  $('#btn-next').textContent = i === STEPS.length - 1 ? '確認画面へ' : '次へ';
  applyVisibility();
}

function renderQuestion(q) {
  const req = q.required ? '<span class="req">必須</span>' : '';
  const note = q.note ? `<p class="q-note">${esc(q.note)}</p>` : '';
  const help = q.help
    ? `<details class="help" data-help="${q.help}"><summary>迷ったら：めやすを見る</summary><div class="help-body"></div></details>`
    : '';
  return `<div class="q" data-q="${q.id}">
    <div class="q-label">${esc(q.label)}${req}</div>${note}
    ${renderInput(q)}${help}
    <p class="q-error" hidden></p>
  </div>`;
}

function renderInput(q) {
  const v = A[q.id];
  switch (q.type) {
    case 'text':
    case 'kana':
      return `<input type="text" class="inp" name="${q.id}" maxlength="${q.max || 100}" placeholder="${esc(q.placeholder || '')}" value="${esc(v || '')}" autocomplete="off">`;
    case 'textarea':
      return `<textarea class="inp" name="${q.id}" rows="3" maxlength="${q.max || 500}" placeholder="${esc(q.placeholder || '')}">${esc(v || '')}</textarea>`;
    case 'date':
      return `<input type="date" class="inp" name="${q.id}" min="1930-01-01" max="${new Date().toISOString().slice(0, 10)}" value="${esc(v || '')}">`;
    case 'select':
      return `<select class="inp" name="${q.id}"><option value="">選んでください</option>${q.options
        .map((o) => `<option value="${o.v}"${o.v === v ? ' selected' : ''}>${esc(o.l)}</option>`).join('')}</select>`;
    case 'single':
    case 'multi': {
      const t = q.type === 'single' ? 'radio' : 'checkbox';
      const arr = Array.isArray(v) ? v : [v];
      return `<div class="chips">${q.options.map((o) => `<label class="chip"><input type="${t}" name="${q.id}" value="${o.v}"${arr.includes(o.v) ? ' checked' : ''}><span>${esc(o.l)}</span></label>`).join('')}</div>`;
    }
    case 'children': {
      const n = Math.min(Number(A.childCount || 0), 5);
      const years = birthYears();
      let h = '';
      for (let i = 1; i <= n; i++) {
        h += `<div class="child"><span class="visit-no">${i}人目</span>
          <label class="sub">お名前<input type="text" class="inp" name="child${i}Name" maxlength="40" placeholder="例：山田 さくら" value="${esc(A['child' + i + 'Name'] || '')}" autocomplete="off"></label>
          <label class="sub">ふりがな（カタカナ）<input type="text" class="inp" name="child${i}Kana" maxlength="40" placeholder="例：ヤマダ サクラ" value="${esc(A['child' + i + 'Kana'] || '')}" autocomplete="off"></label>
          <label class="sub">生まれ年<select class="inp" name="child${i}"><option value="">選んでください</option>${years
          .map((o) => `<option value="${o.v}"${A['child' + i] === o.v ? ' selected' : ''}>${o.l}</option>`).join('')}</select></label></div>`;
      }
      return h;
    }
    case 'visits': {
      let h = '<p class="q-note">だいたいの時期で大丈夫です。</p>';
      for (let i = 1; i <= 3; i++) {
        h += `<div class="visit"><span class="visit-no">${i}件目</span>
          <label class="sub">はじまり<input type="month" class="inp" name="v${i}From" value="${esc(A['v' + i + 'From'] || '')}"></label>
          <label class="sub">おわり<input type="month" class="inp" name="v${i}To" value="${A['v' + i + 'To'] === 'now' ? '' : esc(A['v' + i + 'To'] || '')}"${A['v' + i + 'To'] === 'now' ? ' disabled' : ''}></label>
          <label class="chip small"><input type="checkbox" name="v${i}Now"${A['v' + i + 'To'] === 'now' ? ' checked' : ''}><span>今も続いている</span></label></div>`;
      }
      return h;
    }
    default:
      return '';
  }
}

/* 入力の読み取り ----------------------------------------------------- */
function readInput(el) {
  const name = el.name;
  if (!name) return;
  if (/^v\dNow$/.test(name)) {
    const i = name[1];
    const to = $(`[name="v${i}To"]`);
    to.disabled = el.checked;
    A[`v${i}To`] = el.checked ? 'now' : to.value;
  } else if (el.type === 'checkbox') {
    A[name] = [...document.querySelectorAll(`[name="${name}"]:checked`)].map((x) => x.value);
  } else if (isKanaField(name)) {
    // 入力中（変換中）に欄の文字は書き換えず、保存する値だけカタカナにそろえる
    A[name] = toKatakana(el.value);
  } else {
    A[name] = el.value;
  }
  saveDraft();
}

function isKanaField(name) {
  return name === 'kana' || name === 'spouseKana' || /^child\dKana$/.test(name);
}

/** 表示条件（showIf）に合わない質問を隠す。人数が変わったら子の欄を作り直す */
function applyVisibility() {
  if (current < 0 || current >= STEPS.length) return;
  STEPS[current].q.forEach((q) => {
    const box = $(`[data-q="${q.id}"]`);
    if (box) box.hidden = !!(q.showIf && !q.showIf(A));
  });
  refreshOpenHelps();
}

function refreshOpenHelps() {
  document.querySelectorAll('details.help[open]').forEach(fillHelp);
}

function fillHelp(d) {
  const fn = FIGURES[d.dataset.help];
  if (fn) $('.help-body', d).innerHTML = fn(A);
}

/* 入力チェック ------------------------------------------------------- */
function validateStep(i) {
  let ok = true;
  STEPS[i].q.forEach((q) => {
    if (q.showIf && !q.showIf(A)) return;
    const box = $(`[data-q="${q.id}"]`);
    const err = $('.q-error', box);
    let msg = '';
    const v = A[q.id];
    if (q.required && (!v || !String(v).trim())) msg = 'ご入力ください。';
    if (!msg && q.type === 'kana' && v && !isKatakana(v)) msg = 'カタカナでご入力ください。';
    if (!msg && q.type === 'children') {
      const bad = [];
      for (let k = 1; k <= Math.min(Number(A.childCount || 0), 5); k++) {
        const kv = A['child' + k + 'Kana'];
        if (kv && !isKatakana(kv)) bad.push(k + '人目');
      }
      if (bad.length) msg = `${bad.join('・')}のふりがなは、カタカナでご入力ください。`;
    }
    if (!msg && q.type === 'date' && v && ageFromDate(v) == null) msg = '日付の形式をご確認ください。';
    if (!msg && q.id === 'birth' && v) {
      const age = ageFromDate(v);
      if (age < 15 || age > 95) msg = '生年月日をご確認ください。';
    }
    err.textContent = msg;
    err.hidden = !msg;
    if (msg && ok) { box.scrollIntoView({ behavior: 'smooth', block: 'center' }); ok = false; }
  });
  return ok;
}

/* 確認画面 ----------------------------------------------------------- */
function renderConfirm() {
  let h = '';
  STEPS.forEach((s, i) => {
    const rows = flattenAnswers(A).filter(([id]) => stepOf(id) === i);
    h += `<section class="confirm-sec"><div class="confirm-head"><h3>${esc(s.title)}</h3>
      <button type="button" class="btn-link" data-edit="${i}">修正する</button></div><dl>`;
    rows.forEach(([, label, val]) => { h += `<dt>${esc(label)}</dt><dd>${val ? esc(val) : '<span class="muted">未回答</span>'}</dd>`; });
    h += '</dl></section>';
  });
  $('#confirm-body').innerHTML = h;
  $('#send-error').hidden = true;
}

/** 平らにした行の id が、どのステップの質問かを返す */
function stepOf(id) {
  const base = /^child\d(Name|Kana)?$/.test(id) ? 'children' : /^visit\d$/.test(id) ? 'visits' : id;
  return STEPS.findIndex((s) => s.q.some((q) => q.id === base));
}

/* 送信 --------------------------------------------------------------- */
/**
 * GAS に送る。通信の失敗や、GAS の応答の代わりに Google のエラーページが返った場合は、
 * 同じ送信IDのまま最大3回まで送り直す（GAS 側で同じIDは1行にまとめるので二重にならない）。
 * 合言葉違いなど GAS が {ok:false} を返したときは送り直さない
 */
async function postWithRetry(body) {
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      // text/plain で送ると、GAS への送信で事前確認（CORS のプリフライト）が発生しない
      const res = await fetch(CONFIG.gasUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body });
      return JSON.parse(await res.text());
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw lastErr;
}

function newSendId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
}

async function send() {
  const btn = $('#btn-send');
  const errBox = $('#send-error');
  errBox.hidden = true;
  if (!CONFIG.gasUrl) {
    errBox.textContent = '送信先が設定されていません（準備中）。お手数ですが、公式LINEでお知らせください。';
    errBox.hidden = false;
    return;
  }
  btn.disabled = true;
  btn.textContent = '送信中…';
  $('#send-wait').hidden = false;
  // 送信ID：1回の回答に1つ。届いたのに応答が失敗して再送されても、GAS 側で二重に登録しない
  if (!A._sid) {
    A._sid = newSendId();
    saveDraft();
  }
  const payload = {
    token: TOKEN,
    sid: A._sid,
    consentAt: A._consentAt || '',
    answers: flattenAnswers(A).map(([id, , val]) => [id, val]),
  };
  try {
    const data = await postWithRetry(JSON.stringify(payload));
    if (!data.ok) throw new Error(data.error || 'failed');
    clearDraft();
    A = {};
    $('#done-no').textContent = data.id || '';
    show('view-done');
  } catch (e) {
    errBox.textContent = '送信の完了を確認できませんでした。通信環境を確認して、もう一度「送信する」を押してください（何度押しても二重に届くことはありません）。続く場合は公式LINEでお知らせください。';
    errBox.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = '送信する';
    $('#send-wait').hidden = true;
  }
}

/* 初期化 ------------------------------------------------------------- */
function init() {
  document.querySelectorAll('[data-fp-name]').forEach((el) => { el.textContent = CONFIG.fpName; });
  document.querySelectorAll('[data-line-url]').forEach((el) => { el.href = CONFIG.lineUrl; });

  const agree = $('#agree');
  agree.checked = !!A._consentAt;
  $('#btn-agree').disabled = !agree.checked;
  agree.addEventListener('change', () => { $('#btn-agree').disabled = !agree.checked; });
  $('#btn-agree').addEventListener('click', () => {
    A._consentAt = A._consentAt || new Date().toISOString();
    saveDraft();
    goStep(0);
  });

  $('#step-body').addEventListener('input', (e) => { readInput(e.target); if (e.target.type !== 'text' && e.target.tagName !== 'TEXTAREA') applyVisibility(); });
  $('#step-body').addEventListener('change', (e) => {
    readInput(e.target);
    // ふりがなは入力が終わったところで、欄の文字もカタカナにそろえる
    if (isKanaField(e.target.name)) e.target.value = A[e.target.name] || '';
    // 子の人数が変わったら、生まれ年の欄を作り直す
    if (e.target.name === 'childCount') { const box = $('[data-q="children"]'); if (box) box.outerHTML = renderQuestion(STEPS[current].q.find((q) => q.id === 'children')); }
    applyVisibility();
  });
  $('#step-body').addEventListener('toggle', (e) => { if (e.target.matches('details.help') && e.target.open) fillHelp(e.target); }, true);

  $('#btn-next').addEventListener('click', () => { if (validateStep(current)) goStep(current + 1); });
  $('#btn-back').addEventListener('click', () => goStep(current - 1));
  $('#confirm-body').addEventListener('click', (e) => { const b = e.target.closest('[data-edit]'); if (b) goStep(Number(b.dataset.edit)); });
  $('#btn-confirm-back').addEventListener('click', () => goStep(STEPS.length - 1));
  $('#btn-send').addEventListener('click', send);

  if (!TOKEN) $('#token-warning').hidden = false;
  show('view-consent');
}

document.addEventListener('DOMContentLoaded', init);
