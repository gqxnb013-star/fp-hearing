/**
 * FPヒアリングサイト — 「迷ったら」の図解
 *
 * 入力中の回答から公的保障のめやすを計算し（js/calc.js）、図と短い説明を返します。
 * 図はインライン SVG。外部画像は使いません。
 * 特定の商品をすすめる表現・将来を断定する表現は書かないこと（d-ai-fp/docs/compliance.md）。
 */

const NOTE_PUBLIC =
  `公的制度の一般的な試算（${PUBLIC.fiscalYear}の金額）です。年収は帯の下限〜上限で計算し、厚生年金の加入期間は300月とみなしています。実際の支給額は加入記録・審査・制度改正で変わります。`;

/** 横棒1本：上にラベル、下に棒と金額（金額が右端で切れないよう、棒の最大幅を残しておく） */
const ROW_H = 40;
function barRow(y, label, valueText, ratio, color) {
  const bw = Math.max(4, Math.min(1, ratio) * 200);
  return `
    <text x="0" y="${y + 12}" class="fig-label">${label}</text>
    <rect x="0" y="${y + 17}" width="${bw}" height="16" rx="4" fill="${color}"></rect>
    <text x="${bw + 6}" y="${y + 30}" class="fig-value">${valueText}</text>`;
}

function svg(h, body, w = 340) {
  return `<svg viewBox="0 0 ${w} ${h}" class="fig" role="img" aria-hidden="true">${body}</svg>`;
}

function needIncome(P) {
  return P.employee && !P.band
    ? '<p class="fig-warn">年収を選ぶと、あなたの場合の金額を表示できます（「ご本人のこと」の年収）。</p>'
    : '';
}

const FIGURES = {
  /* 万一のとき：毎月いくら残したいか */
  survivor(A) {
    const P = publicProfile(A);
    const S = survivorPension(P);
    const rows = [];
    let y = 4;
    const top = (r) => (r ? (r.hi != null ? r.hi : r.lo) : 0);
    const scale = Math.max(top(S.phase1), top(S.phase2), 150000);
    if (S.phase1) { rows.push(barRow(y, 'お子さまがいる間', manRange(S.phase1) + '/月', top(S.phase1) / scale, 'var(--primary)')); y += ROW_H; }
    if (S.phase2) { rows.push(barRow(y, S.withKids ? '独立した後' : '配偶者に', manRange(S.phase2) + '/月', top(S.phase2) / scale, 'var(--primary-light)')); y += ROW_H; }
    const fig = rows.length ? svg(y + 2, rows.join('')) : '';
    return `
      <p><strong>あなたに万一のことがあったとき、ご家族が受け取る遺族年金のめやす</strong>です。
      「毎月の生活費 − 遺族年金 − 配偶者の収入」が、保険などで準備したい金額の考え方になります。</p>
      ${needIncome(P)}${fig}
      ${S.phase1 ? '' : '<p>18歳の年度末までのお子さまがいない場合、遺族基礎年金はありません。</p>'}
      ${S.phase2Note ? `<p>${S.phase2Note}</p>` : ''}
      <p class="fig-note">${NOTE_PUBLIC}</p>`;
  },

  /* 万一のとき：いつまで */
  survivorTimeline(A) {
    const P = publicProfile(A);
    const S = survivorPension(P);
    const yrs = S.yearsLeft;
    const W = 320, x0 = 10;
    const span = 40; // 今から40年を描く
    const k = (W - x0 * 2) / span;
    const kidW = Math.min(yrs, span) * k;
    // 文字は棒の中に入れず、棒の下に置く（短い棒でも文字が重ならないように）
    const body = `
      <text x="${x0}" y="12" class="fig-axis">今</text>
      ${yrs > 0 ? `<text x="${x0 + kidW}" y="12" class="fig-axis" text-anchor="middle">約${yrs}年後</text>` : ''}
      <text x="${W - x0}" y="12" class="fig-axis" text-anchor="end">40年後</text>
      <rect x="${x0}" y="18" width="${W - x0 * 2}" height="18" rx="4" fill="var(--line)"></rect>
      ${yrs > 0 ? `<rect x="${x0}" y="18" width="${kidW}" height="18" rx="4" fill="var(--primary)"></rect>` : ''}
      ${yrs > 0 ? `<text x="${x0}" y="52" class="fig-label">■ 子育て中：必要額が大きい</text>` : ''}
      <text x="${x0}" y="${yrs > 0 ? 68 : 52}" class="fig-label">□ ${yrs > 0 ? '独立後' : 'これから'}：必要額は年々小さく</text>`;
    return `
      <p>必要な保障額は、お子さまが小さいうちが最も大きく、独立に向けて小さくなっていきます。
      「子どもが独立するまで」は、いちばん下のお子さまが18歳の年度末を迎えるまで（${yrs > 0 ? '約' + yrs + '年' : 'お子さまの入力なし'}）がひとつの目安です。</p>
      ${svg(74, body)}
      <p class="fig-note">生まれ月はお伺いしていないため、年数はめやすです。</p>`;
  },

  /* 入院・手術 */
  medical() {
    const body = `
      <rect x="10" y="10" width="300" height="24" rx="4" fill="var(--line)"></rect>
      <text x="16" y="27" class="fig-label">かかった医療費（10割）</text>
      <rect x="10" y="44" width="90" height="24" rx="4" fill="var(--primary-light)"></rect>
      <text x="106" y="61" class="fig-label">窓口負担は原則3割</text>
      <rect x="10" y="78" width="45" height="24" rx="4" fill="var(--primary)"></rect>
      <text x="61" y="95" class="fig-label">さらに、ひと月の上限がある</text>`;
    return `
      <p>健康保険には<strong>高額療養費制度</strong>があり、ひと月に病院の窓口で払う医療費には、年齢と所得に応じた上限があります。
      入院の保険は、この上限を超える部分ではなく、<strong>差額ベッド代・食事代・収入の減少</strong>などへの備えと考えると選びやすくなります。</p>
      ${svg(108, body)}
      <p class="fig-note">上限額は所得区分によって異なります。具体的な金額は面談でご説明します。</p>`;
  },

  /* がん */
  cancer() {
    const body = `
      <text x="10" y="16" class="fig-axis">以前</text>
      <rect x="60" y="4" width="200" height="18" rx="4" fill="var(--primary)"></rect><text x="66" y="17" class="fig-inbar">入院して治療</text>
      <text x="10" y="48" class="fig-axis">最近</text>
      <rect x="60" y="36" width="70" height="18" rx="4" fill="var(--primary)"></rect><text x="66" y="49" class="fig-inbar">入院</text>
      <rect x="134" y="36" width="170" height="18" rx="4" fill="var(--primary-light)"></rect><text x="140" y="49" class="fig-inbar">通院で抗がん剤・放射線</text>`;
    return `
      <p>がんの治療は、入院期間が短くなり、<strong>通院しながら治療を続ける</strong>ケースが増えています。
      入院が前提の保障だけだと、通院中心の治療では受け取れる額が小さくなることがあります。</p>
      ${svg(60, body)}
      <ul class="fig-list">
        <li><strong>診断一時金</strong>：診断された時点でまとまったお金。使い道が自由</li>
        <li><strong>通院治療への備え</strong>：抗がん剤・放射線などの通院に対応</li>
        <li><strong>実費</strong>：自由診療などかかった費用を補う</li>
      </ul>
      <p class="fig-note">がんの保障には、加入から通常90日の待ち期間があります。</p>`;
  },

  /* 就業不能：毎月いくら */
  disability(A) {
    const P = publicProfile(A);
    const sick = sickAllowance(P);
    const dis = disabilityPension(P);
    const top = (r) => (r ? (r.hi != null ? r.hi : r.lo) : 0);
    const scale = Math.max(top(sick.monthly), top(dis.g1), 150000);
    let y = 4;
    const rows = [];
    if (sick.eligible && sick.monthly) { rows.push(barRow(y, '傷病手当金', manRange(sick.monthly) + '/月', top(sick.monthly) / scale, 'var(--info)')); y += ROW_H; }
    if (dis.g1) { rows.push(barRow(y, '障害年金 1級', manRange(dis.g1) + '/月', top(dis.g1) / scale, 'var(--primary)')); y += ROW_H; }
    if (dis.g2) { rows.push(barRow(y, '障害年金 2級', manRange(dis.g2) + '/月', top(dis.g2) / scale, 'var(--primary)')); y += ROW_H; }
    if (dis.g3) { rows.push(barRow(y, '障害年金 3級', manRange(dis.g3) + '/月', top(dis.g3) / scale, 'var(--primary-light)')); y += ROW_H; }
    return `
      <p><strong>働けなくなったときに、あなたが受け取れる公的保障のめやす</strong>です。
      「毎月の生活費 − 公的保障」が、保険などで準備したい金額の考え方になります。</p>
      ${needIncome(P)}${rows.length ? svg(y + 2, rows.join('')) : ''}
      ${sick.eligible ? '<p>傷病手当金は、会社を休んで給与が出ない日に、最長1年6か月受け取れます。</p>'
        : '<p><strong>国民健康保険・扶養の方には、傷病手当金は原則ありません。</strong>休んだ日から収入が止まる点に注意が必要です。</p>'}
      ${P.kokuhoEmployee ? '<p>お勤め先で国民健康保険組合（建設国保など）に入っている場合は、厚生年金の障害年金は受け取れますが、傷病手当金がない、または金額や条件が異なることがあります。面談で確認します。</p>' : ''}
      <p>障害年金は、障害の状態が所定の等級に当てはまる場合に受け取れます。どの等級になるかは審査で決まり、該当しない場合もあります。${dis.employee ? '' : '厚生年金に入っていない方は、障害基礎年金（1級・2級）のみで、3級はありません。'}</p>
      <p class="fig-note">${NOTE_PUBLIC}傷病手当金は賞与を含まずに計算するため、賞与がある方は実際より多めに出ます。会社独自の上乗せは含みません。</p>`;
  },

  /* 就業不能：いつまで */
  disabilityTimeline(A) {
    const P = publicProfile(A);
    const sick = sickAllowance(P);
    const body = `
      <text x="10" y="12" class="fig-axis">休み始め</text>
      <text x="130" y="12" class="fig-axis" text-anchor="middle">1年6か月</text>
      <rect x="10" y="18" width="120" height="22" rx="4" fill="${sick.eligible ? 'var(--info)' : 'var(--warn)'}"></rect>
      <text x="16" y="33" class="fig-inbar">${sick.eligible ? '傷病手当金' : '公的保障なし'}</text>
      <rect x="132" y="18" width="190" height="22" rx="4" fill="var(--primary)"></rect>
      <text x="138" y="33" class="fig-inbar">障害年金（等級に該当時）</text>`;
    return `
      <p>働けない期間が長引くほど、公的保障は<strong>「傷病手当金 → 障害年金」</strong>と移り変わります。
      障害年金の対象にならない状態が続くと、収入の空白ができることがあります。</p>
      ${svg(46, body)}
      <p>短い期間（1〜2年）の備えは貯蓄や傷病手当金で足りることもあり、長い期間の備えは、住宅ローンの残り年数やお子さまの独立までの年数を目安にすると考えやすくなります。</p>`;
  },

  /* 就業不能：原因 */
  disabilityCause() {
    const row = (y, name, marks) => `
      <text x="0" y="${y}" class="fig-label">${name}</text>
      ${marks.map((m, i) => `<text x="${150 + i * 62}" y="${y}" class="fig-mark ${m ? 'on' : 'off'}" text-anchor="middle">${m ? '○' : '—'}</text>`).join('')}`;
    const body = `
      ${['重い病気', 'ケガ', 'メンタル'].map((h, i) => `<text x="${150 + i * 62}" y="14" class="fig-axis" text-anchor="middle">${h}</text>`).join('')}
      ${row(38, '5疾病だけの型', [1, 0, 0])}
      ${row(62, '障害・介護も含む型', [1, 1, 0])}
      ${row(86, '精神疾患も含む型', [1, 1, 1])}`;
    return `
      <p>就業不能の保険は、<strong>商品によって対象になる原因が違います</strong>。「重い病気だけ」の型では、ケガや心の不調で働けなくなっても受け取れません。</p>
      ${svg(96, body)}
      <p class="fig-note">型の分け方は一般的な例です。実際の対象・条件は商品ごとに確認します。</p>`;
  },

  /* 保険料の考え方 */
  premiumStyle() {
    const body = `
      <rect x="4" y="4" width="150" height="70" rx="8" fill="var(--primary-tint)" stroke="var(--primary)"></rect>
      <text x="79" y="30" class="fig-head" text-anchor="middle">守る保障</text>
      <text x="79" y="52" class="fig-label" text-anchor="middle">掛け捨て・必要な分だけ</text>
      <rect x="182" y="4" width="150" height="70" rx="8" fill="#fff6e0" stroke="var(--primary-light)"></rect>
      <text x="257" y="30" class="fig-head" text-anchor="middle">育てるお金</text>
      <text x="257" y="52" class="fig-label" text-anchor="middle">運用・貯蓄で将来へ</text>`;
    return `
      <p>保険料は<strong>「守る保障」と「育てるお金」に分けて考える</strong>と、何にいくら払っているかが見えやすくなります。</p>
      ${svg(80, body)}
      <ul class="fig-list">
        <li><strong>掛け捨て</strong>：同じ保障なら保険料は安め。満期のお金はありません</li>
        <li><strong>貯蓄・運用も兼ねる</strong>：保障と積立が一緒。途中でやめると戻るお金が少ない時期があります</li>
      </ul>`;
  },

  /* 投資：値動き */
  risk() {
    const rates = [0.03, 0.05, 0.07, 0.09];
    const fv = rates.map((r) => futureValue(10000, 20, r));
    const max = fv[fv.length - 1];
    const rows = rates.map((r, i) => barRow(4 + i * ROW_H, `年率${Math.round(r * 100)}%`, man(fv[i]), fv[i] / max, i < 2 ? 'var(--primary)' : 'var(--primary-light)')).join('');
    const principal = barRow(4 + 4 * ROW_H, '積み立てた元本', man(240 * 10000), 2400000 / max, 'var(--ink-soft)');
    return `
      <p>毎月1万円を20年間積み立てた場合、<strong>増え方は運用の利回りによって大きく変わります</strong>（下は計算の例）。</p>
      ${svg(4 + 5 * ROW_H + 4, rows + principal)}
      <p>利回りが高いものほど値動きも大きく、<strong>途中で元本を下回る時期もあります</strong>。使う時期が近いお金ほど、値動きの小さい置き場所が向いています。</p>
      <p class="fig-note">毎月末に積み立て、月複利で運用した場合の試算です（手数料・税金は考慮していません）。年率は計算のための例で、将来の運用成果をお約束するものではありません。</p>`;
  },
};
