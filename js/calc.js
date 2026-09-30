/**
 * FPヒアリングサイト — 公的保障の試算
 *
 * ブラウザ内で完結する固定ロジックです。AIは使いません。
 * 制度の数字はすべて下の PUBLIC に集約しています。制度改正のときはここだけ直してください。
 * 考え方は D-AI-FP（d-ai-fp/js/calc.js）の遺族年金・障害年金・傷病手当金の概算を流用しています。
 */

// 令和8年4月分からの数字（2026-09-30 に公式ページで確認。出典は SPEC.md 付録A）
const PUBLIC = {
  fiscalYear: '令和8年度',
  basic2: 847300, // 障害基礎年金2級＝老齢基礎年金の満額（昭和31年4月2日以後生まれ）
  basic1: 1059125, // 障害基礎年金1級
  childAdd12: 243800, // 子の加算（第1子・第2子）
  childAdd3: 81300, // 子の加算（第3子以降）
  spouseAdd: 243800, // 障害厚生年金1・2級の配偶者加給（配偶者65歳未満）
  grade3Min: 635500, // 障害厚生年金3級の最低保障
  widowAdd: 635500, // 中高齢寡婦加算（40〜65歳）
  payoutRate: 5.481 / 1000, // 報酬比例部分の乗率（平成15年4月以後・昭和21年4月2日以後生まれ）出典: nenkin.go.jp …/20150401-01.files/hirei.pdf
  minMonths: 300, // 加入期間が300月未満なら300月とみなす
  survivorRate: 0.75, // 遺族厚生年金は報酬比例の4分の3
  sickRate: 2 / 3, // 傷病手当金は標準報酬日額の3分の2
  sickMonths: 18, // 傷病手当金は通算1年6か月
  // 年金の平均標準報酬額の上限の目安（月65万円×12＋賞与150万円×2 を12で割った額）
  remunCapMonthly: (650000 * 12 + 1500000 * 2) / 12,
};

/**
 * 回答から計算に使う条件をまとめる
 * 年収は帯なので、下限と上限の2通りで計算して幅で示す
 */
function publicProfile(A) {
  const band = parseBand(A.income);
  // 自分が勤務先の健康保険に入っている＝厚生年金にも入っているとみなす
  // （わからない場合は働き方で判断する）
  let employee;
  if (A.health === 'work') employee = true;
  else if (A.health === 'kokuho' || A.health === 'fuyou') employee = false;
  else employee = A.job === 'employee' || A.job === 'civil';

  const kids = childrenUnder18(A);
  return {
    band, // { lo, hi } 円。hi が null なら上限なし
    employee,
    hasSpouse: A.spouse === 'yes',
    gender: A.gender, // 'm' | 'f' | 'x'
    age: ageFromDate(A.birth),
    spouseAge: A.spouse === 'yes' ? ageFromDate(A.spouseBirth) : null,
    kids, // 18歳の年度末までの子の人数（めやす）
    youngestKidYearsLeft: youngestYearsLeft(A),
  };
}

/** 'r400-450' → { lo: 4000000, hi: 4500000 }。わからない等は null */
function parseBand(v) {
  if (!v || !/^r\d/.test(v)) return null;
  const m = v.match(/^r(\d+)-(\d+)?$/);
  if (!m) return null;
  return { lo: Number(m[1]) * 10000, hi: m[2] ? Number(m[2]) * 10000 : null };
}

/** 'YYYY-MM-DD' から今日時点の満年齢 */
function ageFromDate(s) {
  if (!s) return null;
  const b = new Date(s + 'T00:00:00');
  if (isNaN(b)) return null;
  const t = new Date();
  let age = t.getFullYear() - b.getFullYear();
  if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) age--;
  return age;
}

/** 子どもの生まれ年から、18歳の年度末までにいる子の人数（生まれ月は聞かないのでめやす） */
function childrenUnder18(A) {
  const y = new Date().getFullYear();
  return kidYears(A).filter((by) => y - by <= 17).length;
}

/** いちばん下の子が18歳の年度末を迎えるまでのおおよその年数 */
function youngestYearsLeft(A) {
  const ys = kidYears(A);
  if (!ys.length) return 0;
  const y = new Date().getFullYear();
  return Math.max(0, Math.max(...ys) + 18 - y);
}

function kidYears(A) {
  const n = Number(A.childCount || 0);
  const out = [];
  for (let i = 1; i <= n; i++) {
    const v = Number(A['child' + i]);
    if (v) out.push(v);
  }
  return out;
}

/** 子の加算の合計（年額） */
function childAddTotal(kids) {
  let t = 0;
  for (let i = 1; i <= kids; i++) t += i <= 2 ? PUBLIC.childAdd12 : PUBLIC.childAdd3;
  return t;
}

/** 報酬比例部分（年額・300月みなし）。年収を12で割った額を平均標準報酬額とみなす */
function hoshuHirei(annual) {
  const monthly = Math.min(annual / 12, PUBLIC.remunCapMonthly);
  return monthly * PUBLIC.payoutRate * PUBLIC.minMonths;
}

/** 年収の下限・上限それぞれで計算し、{lo, hi} で返す（上限なしの帯は下限のみ） */
function byBand(band, fn) {
  if (!band) return null;
  return { lo: fn(band.lo), hi: band.hi == null ? null : fn(band.hi) };
}

/* ------------------------------------------------------------------
 * 傷病手当金（月額）
 * 勤務先の健康保険に自分が入っている人だけが対象。国保・扶養の人は原則なし
 * 賞与は聞いていないため、年収÷12 を月給とみなす（賞与がある人は実際より多めに出る）
 * ---------------------------------------------------------------- */
function sickAllowance(P) {
  if (!P.employee) return { eligible: false };
  return {
    eligible: true,
    monthly: byBand(P.band, (y) => (y / 12) * PUBLIC.sickRate),
    months: PUBLIC.sickMonths,
  };
}

/* ------------------------------------------------------------------
 * 障害年金（等級別・月額）
 * 厚生年金の人：障害基礎年金＋障害厚生年金。それ以外：障害基礎年金のみ（3級はない）
 * 配偶者加給は配偶者がいる場合に加える（生計維持・65歳未満などの条件はめやすとして省略）
 * ---------------------------------------------------------------- */
function disabilityPension(P) {
  const kidAdd = childAddTotal(P.kids);
  const spouse = P.hasSpouse ? PUBLIC.spouseAdd : 0;
  const calc = (grade) => (annual) => {
    const hh = P.employee ? hoshuHirei(annual) : 0;
    let y = 0;
    if (grade === 1) y = PUBLIC.basic1 + kidAdd + (P.employee ? hh * 1.25 + spouse : 0);
    if (grade === 2) y = PUBLIC.basic2 + kidAdd + (P.employee ? hh + spouse : 0);
    if (grade === 3) y = P.employee ? Math.max(hh, PUBLIC.grade3Min) : 0;
    return y / 12;
  };
  // 厚生年金に入っていない人は年収に関係なく定額なので、年収不明でも計算できる
  const band = P.band || (!P.employee ? { lo: 0, hi: 0 } : null);
  return {
    employee: P.employee,
    g1: byBand(band, calc(1)),
    g2: byBand(band, calc(2)),
    g3: P.employee ? byBand(band, calc(3)) : null,
  };
}

/* ------------------------------------------------------------------
 * 遺族年金（ご本人に万一のとき、ご家族が受け取る月額）
 * 2段で示す：①子が18歳の年度末までの間 ②その後
 * 夫が遺族になる場合は、遺族厚生年金に55歳以上などの条件がある
 * ---------------------------------------------------------------- */
function survivorPension(P) {
  const survivorIsWife = P.gender === 'm'; // ご本人が男性なら遺族は妻、と仮定
  const withKids = P.kids > 0;
  const band = P.band || (!P.employee ? { lo: 0, hi: 0 } : null);

  // ① 子がいる間：遺族基礎年金＋遺族厚生年金（夫が55歳未満でも子が遺族厚生年金を受ける）
  const phase1 = withKids
    ? byBand(band, (annual) => {
        const kosei = P.employee ? hoshuHirei(annual) * PUBLIC.survivorRate : 0;
        return (PUBLIC.basic2 + childAddTotal(P.kids) + kosei) / 12;
      })
    : null;

  // ② 子の独立後（または子がいない場合）
  let phase2 = null;
  let phase2Note = '';
  if (!P.hasSpouse) {
    phase2Note = withKids
      ? 'お子さまの独立後、遺族年金は原則として終わります。'
      : '配偶者・18歳未満のお子さまがいない場合、遺族年金の対象になるご家族は限られます（父母は55歳以上などの条件あり）。';
  } else if (!P.employee) {
    phase2Note = '国民年金だけの場合、お子さまがいない（独立した）配偶者への遺族年金は原則ありません（寡婦年金・死亡一時金の対象になる場合があります）。';
  } else if (survivorIsWife) {
    phase2 = byBand(band, (annual) => {
      const kosei = hoshuHirei(annual) * PUBLIC.survivorRate;
      // 妻が40歳以上なら65歳まで中高齢寡婦加算がつく（ここでは加算ありの額も示す）
      return (kosei + PUBLIC.widowAdd) / 12;
    });
    phase2Note = '妻が40〜65歳の間は中高齢寡婦加算（年63.55万円）を含めた額です。40歳未満で子のない妻は加算なし、30歳未満で子のない妻は5年間のみの受け取りです。';
  } else if (P.gender === 'f') {
    phase2Note = '夫が遺族になる場合、遺族厚生年金は「妻が亡くなったときに夫が55歳以上」が条件で、受け取りは60歳からです。';
  } else {
    phase2Note = '配偶者が妻か夫かで条件が変わります。';
  }

  return { withKids, phase1, phase2, phase2Note, yearsLeft: P.youngestKidYearsLeft, survivorIsWife };
}

/* ------------------------------------------------------------------
 * 積立の増え方（毎月末に積立・月複利。手数料・税金は考えない）
 * 断定値は出さず、3/5/7/9% の幅で示す（コンサルレポートのデザイン仕様の規則）
 * ---------------------------------------------------------------- */
function futureValue(monthly, years, rate) {
  const r = rate / 12;
  const n = years * 12;
  return r === 0 ? monthly * n : monthly * ((Math.pow(1 + r, n) - 1) / r);
}

/** 円 → 「12.3万円」。幅は「12.3〜15.4万円」 */
function man(v) {
  return (Math.round(v / 1000) / 10).toLocaleString('ja-JP', { maximumFractionDigits: 1 }) + '万円';
}
function manRange(r) {
  if (!r) return '—';
  if (r.hi == null) return man(r.lo) + '以上';
  if (Math.abs(r.hi - r.lo) < 500) return man(r.lo);
  return man(r.lo).replace('万円', '') + '〜' + man(r.hi);
}
