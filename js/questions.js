/**
 * FPヒアリングサイト — 質問の定義
 *
 * 画面・確認画面・送信データは、すべてこの定義から組み立てます。
 * 質問を足す・消すときは、GAS 側（gas/Code.gs の FIELDS）も同じ id で直してください。
 * （node tools/check-fields.mjs で食い違いを検査できます）
 */

const CONFIG = {
  fpName: '宮崎 大輔',
  lineUrl: 'https://lin.ee/zhjRjmC',
  // GAS を公開したら、発行された Web アプリの URL をここに入れる
  gasUrl: 'https://script.google.com/macros/s/AKfycbz7pvlI_yK4_5i9vw0rKUtu1acb2AaVtlDu1zwCBSazVTWh-rJrsz3IEREwZfeCHwFwWA/exec',
};

/* 選択肢のひな形 ------------------------------------------------------ */
const opt = (v, l) => ({ v, l });
const UNKNOWN = opt('unknown', 'わからない');
const NOANSWER = opt('noanswer', '答えたくない');

/** 50万円刻みの年収帯 */
function incomeBands() {
  const o = [opt('none', '収入なし'), opt('r0-100', '100万円未満')];
  for (let a = 100; a < 1000; a += 50) o.push(opt(`r${a}-${a + 50}`, `${a}〜${a + 50}万円`));
  o.push(opt('r1000-', '1,000万円以上'), UNKNOWN, NOANSWER);
  return o;
}

/** 生まれ年（お子さま用・今年から30年前まで） */
function birthYears() {
  const y = new Date().getFullYear();
  const o = [];
  for (let i = y; i >= y - 30; i--) o.push(opt(String(i), `${i}年`));
  return o;
}

const JOBS = [
  opt('employee', '会社員'),
  opt('civil', '公務員'),
  opt('self', '自営業・フリーランス'),
  opt('part', 'パート・アルバイト'),
  opt('home', '専業主婦（夫）'),
  opt('other', 'その他'),
];

const COMPANIES = [
  '日本生命', '第一生命', '明治安田生命', '住友生命', 'かんぽ生命', 'ソニー生命',
  'プルデンシャル生命', 'ジブラルタ生命', 'オリックス生命', 'アフラック', 'メットライフ生命',
  'アクサ生命', '東京海上日動あんしん生命', 'SOMPOひまわり生命', 'FWD生命', 'チューリッヒ生命',
  'はなさく生命', '楽天生命', '都道府県民共済', 'コープ共済', 'JA共済',
].map((n, i) => opt('c' + (i + 1), n)).concat([opt('other', 'その他'), UNKNOWN]);

/* ステップ定義 -------------------------------------------------------
 * type: text / date / single / multi / select / children / visits / textarea
 * showIf(A): 表示条件。false のときは入力も送信もしない
 * help: 「迷ったら」の図解キー（js/figures.js）
 */
const STEPS = [
  {
    key: 'self', title: 'ご本人のこと',
    lead: 'まずはご本人について教えてください。',
    q: [
      { id: 'name', label: 'お名前', type: 'text', required: true, placeholder: '例：山田 花子', max: 40 },
      { id: 'birth', label: '生年月日', type: 'date', required: true },
      { id: 'gender', label: '性別', type: 'single', options: [opt('f', '女性'), opt('m', '男性'), opt('x', '答えたくない')],
        note: '保険料や公的年金の条件が性別で変わるため、お伺いしています。' },
      { id: 'job', label: '働き方', type: 'single', options: JOBS },
      { id: 'health', label: 'ご自身の健康保険証はどれですか', type: 'single',
        options: [opt('work', '勤務先の健康保険（共済を含む）に自分で加入'), opt('fuyou', '家族の扶養に入っている'), opt('kokuho', '国民健康保険'), UNKNOWN],
        note: '病気やケガで休んだときの「傷病手当金」があるかどうかが、ここで分かれます。' },
      { id: 'income', label: '年収（税込み・額面）', type: 'select', options: incomeBands(),
        note: 'だいたいで大丈夫です。公的保障のめやすの計算に使います。' },
    ],
  },
  {
    key: 'family', title: 'ご家族のこと',
    q: [
      { id: 'spouse', label: '配偶者・パートナー', type: 'single', options: [opt('yes', 'いる'), opt('no', 'いない')] },
      { id: 'spouseBirth', label: '配偶者・パートナーの生年月日', type: 'date', showIf: (A) => A.spouse === 'yes' },
      { id: 'spouseJob', label: '配偶者・パートナーの働き方', type: 'single', options: JOBS, showIf: (A) => A.spouse === 'yes' },
      { id: 'spouseIncome', label: '配偶者・パートナーの年収（税込み）', type: 'select', options: incomeBands(), showIf: (A) => A.spouse === 'yes' },
      { id: 'childCount', label: 'お子さまの人数', type: 'select',
        options: [opt('0', 'いない'), opt('1', '1人'), opt('2', '2人'), opt('3', '3人'), opt('4', '4人'), opt('5', '5人以上')] },
      { id: 'children', label: 'お子さまの生まれ年', type: 'children', showIf: (A) => Number(A.childCount) > 0 },
      { id: 'plans', label: 'これからの予定（いくつでも）', type: 'multi',
        options: [opt('marry', '結婚'), opt('baby', '出産'), opt('house', '住宅の購入'), opt('job', '転職・独立'), opt('none', '特になし')] },
    ],
  },
  {
    key: 'money', title: '住まいとお金',
    q: [
      { id: 'house', label: 'お住まい', type: 'single',
        options: [opt('rent', '賃貸'), opt('loan', '持ち家（住宅ローンあり）'), opt('own', '持ち家（ローンなし）'), opt('parents', '実家'), opt('other', 'その他')] },
      { id: 'savings', label: '預貯金のおおよその額', type: 'select',
        options: [opt('s0-100', '100万円未満'), opt('s100-300', '100〜300万円'), opt('s300-500', '300〜500万円'), opt('s500-1000', '500〜1,000万円'), opt('s1000-', '1,000万円以上'), NOANSWER] },
      { id: 'nisa', label: 'NISA', type: 'single', options: [opt('yes', '使っている'), opt('no', '使っていない'), UNKNOWN] },
      { id: 'ideco', label: 'iDeCo', type: 'single', options: [opt('yes', '使っている'), opt('no', '使っていない'), UNKNOWN] },
      { id: 'premiumCap', label: '保険料として無理のない金額（ご本人・月額）', type: 'select',
        options: [opt('p0-1', '1万円未満'), opt('p1-2', '1〜2万円'), opt('p2-3', '2〜3万円'), opt('p3-5', '3〜5万円'), opt('p5-', '5万円以上'), UNKNOWN] },
    ],
  },
  {
    key: 'policy', title: '今の保険',
    lead: '保障の中身は、証券や設計書の写真から確認します。ここではざっくりで大丈夫です。',
    q: [
      { id: 'policyCount', label: '入っている保険の数（ご本人）', type: 'single',
        options: [opt('0', '入っていない'), opt('1', '1件'), opt('2', '2件'), opt('3', '3件'), opt('4', '4件以上'), UNKNOWN] },
      { id: 'companies', label: '保険会社（いくつでも）', type: 'multi', options: COMPANIES, showIf: (A) => A.policyCount !== '0' },
      { id: 'hasDocs', label: '保険証券や設計書は手元にありますか', type: 'single',
        options: [opt('all', 'すべてある'), opt('some', '一部ある'), opt('none', 'ない'), UNKNOWN], showIf: (A) => A.policyCount !== '0',
        note: '手元にある場合は、送信後に公式LINEへ写真を送っていただきます。' },
      { id: 'groupIns', label: '勤務先の団体保険', type: 'single', options: [opt('yes', '入っている'), opt('no', '入っていない'), UNKNOWN] },
    ],
  },
  {
    key: 'health', title: '健康のこと',
    lead: '病名や理由はお伺いしません。「ある・ない」と時期だけ教えてください。',
    q: [
      { id: 'checkup', label: '直近の健康診断の結果表は手元にありますか', type: 'single',
        options: [opt('yes', 'ある'), opt('no', 'ない'), opt('notaken', '健康診断を受けていない')],
        note: 'ある場合は、送信後に公式LINEへ写真を送っていただきます。' },
      { id: 'recent3m', label: '最近3か月以内に、医師の診察・検査・治療・投薬を受けましたか', type: 'single',
        options: [opt('yes', 'ある'), opt('no', 'ない'), NOANSWER] },
      { id: 'past5y', label: '過去5年以内に、病気やケガで入院・手術、または続けての通院・服薬がありましたか', type: 'single',
        options: [opt('yes', 'ある'), opt('no', 'ない'), NOANSWER] },
      { id: 'visits', label: 'その時期（最大3件）', type: 'visits', showIf: (A) => A.past5y === 'yes' },
    ],
  },
  {
    key: 'hope', title: '保障のご希望',
    lead: '迷ったら「めやすを見る」を開いてください。あなたの入力に合わせた公的保障のめやすを表示します。',
    q: [
      { id: 'deathMonthly', label: '万一のとき、ご家族に毎月いくらくらい残したいですか', type: 'single',
        options: [opt('10', '月10万円'), opt('15', '月15万円'), opt('20', '月20万円'), opt('25', '月25万円以上'), opt('unknown', 'わからない・相談したい')],
        help: 'survivor' },
      { id: 'deathUntil', label: 'それはいつまで必要ですか', type: 'single',
        options: [opt('kids', '子どもが独立するまで'), opt('65', '65歳まで'), opt('life', '一生涯'), opt('unknown', 'わからない・相談したい')],
        help: 'survivorTimeline' },
      { id: 'medical', label: '入院・手術への備え方', type: 'single',
        options: [opt('daily', '入院日額でこつこつ'), opt('lump', 'まとまった一時金'), opt('min', '公的保障で足りる分は減らしたい'), opt('unknown', 'わからない・相談したい')],
        help: 'medical' },
      { id: 'cancer', label: 'がんへの備え', type: 'single',
        options: [opt('lump', '診断されたときの一時金'), opt('outpatient', '通院治療への備え'), opt('actual', '治療費の実費'), opt('keep', '今のままでよい'), opt('unknown', 'わからない・相談したい')],
        help: 'cancer' },
      { id: 'diMonthly', label: '就業不能：働けなくなったとき、毎月いくら必要ですか', type: 'single',
        options: [opt('5', '月5万円'), opt('10', '月10万円'), opt('15', '月15万円'), opt('20', '月20万円以上'), opt('public', '公的保障・会社の制度で足りる'), opt('unknown', 'わからない・相談したい')],
        help: 'disability' },
      { id: 'diUntil', label: '就業不能：それはいつまで必要ですか', type: 'single',
        options: [opt('2y', '1〜2年'), opt('5y', '5年'), opt('60', '60歳まで'), opt('65', '65歳まで'), opt('unknown', 'わからない・相談したい')],
        help: 'disabilityTimeline' },
      { id: 'diCause', label: '就業不能：どんな原因まで備えたいですか（いくつでも）', type: 'multi',
        options: [opt('major', '重い病気（がん・脳・心臓など）'), opt('injury', 'ケガ'), opt('mental', '心の不調（メンタル）'), opt('unknown', 'わからない・相談したい')],
        help: 'disabilityCause' },
      { id: 'premiumStyle', label: '保険料の考え方', type: 'single',
        options: [opt('term', '掛け捨てで必要な分だけ'), opt('saving', '貯蓄や運用も兼ねたい'), opt('split', '保障と運用を分けて持ちたい'), opt('unknown', 'わからない・相談したい')],
        help: 'premiumStyle' },
    ],
  },
  {
    key: 'invest', title: 'お金を育てることについて',
    q: [
      { id: 'invExp', label: '投資の経験', type: 'single',
        options: [opt('none', 'ない'), opt('little', 'NISA・iDeCoなどを少し'), opt('years', '数年以上続けている')] },
      { id: 'invPurpose', label: 'お金を育てる目的（いくつでも）', type: 'multi',
        options: [opt('retire', '老後'), opt('edu', '教育費'), opt('house', '住宅'), opt('none', '特に決めていない')] },
      { id: 'invHorizon', label: '使う予定までの期間', type: 'single',
        options: [opt('lt5', '5年未満'), opt('5-10', '5〜10年'), opt('10-20', '10〜20年'), opt('gt20', '20年以上')] },
      { id: 'invRisk', label: '値動きへの考え方', type: 'single',
        options: [opt('safe', '元本が減るのは避けたい'), opt('mid', '多少の上下ならよい'), opt('long', '長く持つなら大きな上下もよい'), UNKNOWN],
        help: 'risk' },
      { id: 'invMonthly', label: '毎月まわせる金額', type: 'single',
        options: [opt('0-5k', '5千円まで'), opt('5k-1', '5千円〜1万円'), opt('1-2', '1〜2万円'), opt('2-3', '2〜3万円'), opt('3-', '3万円超'), UNKNOWN] },
    ],
  },
  {
    key: 'meet', title: '気になること・次のお話',
    q: [
      { id: 'concerns', label: '気になっていること（いくつでも）', type: 'multi',
        options: [opt('cost', '保険料'), opt('unclear', '保障の中身がわからない'), opt('cancer', 'がん'), opt('di', '就業不能（働けないとき）'), opt('retire', '老後'), opt('edu', '教育費')] },
      { id: 'meetStyle', label: '次のお話の方法', type: 'single', options: [opt('zoom', 'Zoom'), opt('face', '対面'), opt('any', 'どちらでも')] },
      { id: 'meetDays', label: 'ご都合のよい曜日（いくつでも）', type: 'multi', options: [opt('wd', '平日'), opt('sat', '土曜'), opt('sun', '日曜・祝日')] },
      { id: 'meetTimes', label: 'ご都合のよい時間帯（いくつでも）', type: 'multi', options: [opt('am', '午前'), opt('pm', '午後'), opt('eve', '夜（18時以降）')] },
      { id: 'comment', label: 'ひとこと（任意）', type: 'textarea', max: 500, placeholder: '伝えておきたいことがあれば' },
    ],
  },
];

/** 送信・確認用に、表示中の質問を平らな [id, label, 表示値] の配列にする */
function flattenAnswers(A) {
  const rows = [];
  STEPS.forEach((s) => s.q.forEach((q) => {
    if (q.showIf && !q.showIf(A)) return;
    if (q.type === 'children') {
      for (let i = 1; i <= Number(A.childCount || 0); i++) rows.push(['child' + i, `お子さま${i}人目の生まれ年`, A['child' + i] ? A['child' + i] + '年' : '']);
      return;
    }
    if (q.type === 'visits') {
      for (let i = 1; i <= 3; i++) {
        const f = A['v' + i + 'From'], t = A['v' + i + 'To'];
        if (!f && !t) continue;
        rows.push(['visit' + i, `通院・入院など ${i}件目`, `${ymLabel(f)} 〜 ${t === 'now' ? '今も続いている' : ymLabel(t)}`]);
      }
      return;
    }
    rows.push([q.id, q.label, displayValue(q, A[q.id])]);
  }));
  return rows;
}

function displayValue(q, v) {
  if (v == null || v === '' || (Array.isArray(v) && !v.length)) return '';
  if (q.options) {
    const find = (x) => (q.options.find((o) => o.v === x) || { l: x }).l;
    return Array.isArray(v) ? v.map(find).join('、') : find(v);
  }
  return String(v);
}

function ymLabel(v) {
  if (!v) return '？';
  const [y, m] = v.split('-');
  return `${y}年${Number(m)}月`;
}
