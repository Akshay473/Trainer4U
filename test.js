// Trainer4U logic tests — runs the REAL functions extracted from index.html
// between // <logic:start> and // <logic:end> markers (no duplicated formulas).
'use strict';
const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log('✓ ' + name); }
  else { failed++; console.log('✗ ' + name + (detail ? ' — ' + detail : '')); }
}
function eq(name, actual, expected) {
  check(name, actual === expected, `got ${JSON.stringify(actual)} expected ${JSON.stringify(expected)}`);
}

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const start = '// <logic:start>', end = '// <logic:end>';
const blocks = [];
let idx = 0;
while (true) {
  const s = html.indexOf(start, idx);
  if (s < 0) break;
  const e = html.indexOf(end, s + start.length);
  if (e < 0) break;
  blocks.push(html.slice(s + start.length, e));
  idx = e + end.length;
}
if (blocks.length === 0) throw new Error('No // <logic:start>/ // <logic:end> markers found in index.html');

// Provide only the constants the logic needs (from index.html: ACTIVITY_MULTIPLIERS, GOAL_LABELS)
const ACTIVITY_MULTIPLIERS = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, veryactive: 1.9 };
const GOAL_LABELS = { lose: 'Lose weight', gain: 'Gain weight', build: 'Build muscle', maintain: 'Maintain' };
const code = blocks.join('\n');
// Deterministic clock injected so loggedDays()/sleepAverage()/workoutsLast7() behave
// deterministically against the injected dates. Real code is called unchanged.
const todayMock = () => '2026-11-05';
const dateOffsetMock = days => {
  const d = new Date('2026-11-05'); d.setDate(d.getDate() + Number(days || 0));
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), dd = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${dd}`;
};
const factory = new Function('ACTIVITY_MULTIPLIERS', 'GOAL_LABELS', 'today', 'dateOffset',
  code + '\nreturn { clamp, round, sortedWeights, currentWeight, workoutsLast7, sleepAverage, loggedDays, bmiFor, bmiCategory, weightTrendPerWeek, weightTrendCategory, calorieDrift, proteinGap, sleepDeficit, baseTargets, getInsights, validateOnboarding, esc, escapeHTML };\n');
const L = factory(ACTIVITY_MULTIPLIERS, GOAL_LABELS, todayMock, dateOffsetMock);

function mkUser(over = {}) {
  const base = {
    profile: { name: 'Test', age: 30, sex: 'male', height: 180, weight: 80, targetWeight: 70,
      startWeight: 80, activity: 'moderate', goal: 'lose', diet: 'nonveg', allergies: '',
      injuries: '', equipment: ['bodyweight'], daysPerWeek: 3, experience: 'beginner' },
    logs: { food: [], weights: [], workouts: [], measurements: [], sleep: [], symptoms: [], hydration: {} },
    settings: { theme: '', trainerMode: 'gym' }
  };
  return Object.assign(base, over, { profile: Object.assign(base.profile, over.profile || {}) });
}

// --- baseTargets: BMR/TDEE/macros (Mifflin-St Jeor) ---
// male 80kg/180cm/30y: 10*80+6.25*180-5*30+5 = 1780; TDEE=1780*1.55=2759
const m = L.baseTargets(mkUser());
eq('baseTargets BMR male 80kg/180cm/30y', m.bmr, 1780);
eq('baseTargets TDEE moderate', m.tdee, 2759);
eq('baseTargets calories lose (-500)', m.calories, 2260);
eq('baseTargets protein lose 2g/kg', m.protein, 160);
check('baseTargets macros present', [m.carbs, m.fat, m.safeMin].every(v => Number.isFinite(v)), JSON.stringify(m));
// female 65kg/165cm/28y: 10*65+6.25*165-5*28-161 = 1380.25 -> 1380
const f = L.baseTargets(mkUser({ profile: { sex: 'female', weight: 65, height: 165, age: 28 } }));
eq('baseTargets BMR female 65kg/165cm/28y', f.bmr, 1380);
eq('baseTargets TDEE female moderate', f.tdee, 2139);
eq('baseTargets safeMin female', f.safeMin, 1200);
// maintain => delta 0, gain => +400
eq('baseTargets calories maintain', L.baseTargets(mkUser({ profile: { goal: 'maintain' } })).calories, 2760);
eq('baseTargets calories gain', L.baseTargets(mkUser({ profile: { goal: 'gain' } })).calories, 3160);

// --- BMI ---
eq('bmiFor 80kg/180cm', String(L.bmiFor(mkUser()).toFixed(1)), '24.7');
eq('bmiFor empty profile', L.bmiFor(mkUser({ profile: { height: 0 } })), 0);
eq('bmiCategory 23', L.bmiCategory(23).label, 'Healthy range');
eq('bmiCategory 17', L.bmiCategory(17).label, 'Underweight range');
eq('bmiCategory 31', L.bmiCategory(31).label, 'Obesity range');
eq('bmiCategory 27', L.bmiCategory(27).label, 'Overweight range');
eq('bmiCategory 0', L.bmiCategory(0).label, 'Not enough data');

// --- weight-trend ---
const weights = [
  { date: '2026-10-01', kg: 80 }, { date: '2026-10-15', kg: 81 }, { date: '2026-10-29', kg: 82 }
];
const trend = L.weightTrendPerWeek(weights, Date.parse('2026-10-29'));
eq('weightTrend perWeek', trend && trend.perWeek, 0.5);
eq('weightTrend category lose+', L.weightTrendCategory('lose', trend.perWeek), 'wrong-way');
eq('weightTrend category lose-', L.weightTrendCategory('lose', -0.5), 'on-track');
eq('weightTrend category gain-', L.weightTrendCategory('gain', -0.5), 'wrong-way');
eq('weightTrend too few', L.weightTrendPerWeek([{ date: '2026-10-01', kg: 80 }]), null);
eq('weightTrend empty', L.weightTrendPerWeek([]), null);

// --- calorie drift ---
const cd = L.calorieDrift([{ calories: 2300 }, { calories: 2400 }, { calories: 2500 }], 2000, 'lose');
eq('calorieDrift above avg', cd && cd.avg, 2400);
eq('calorieDrift above adjustment', cd && cd.adjustment, -100);
const cdl = L.calorieDrift([{ calories: 1500 }, { calories: 1600 }, { calories: 1400 }], 2000, 'lose');
eq('calorieDrift below adjustment', cdl && cdl.adjustment, 150);
eq('calorieDrift within tolerance', L.calorieDrift([{ calories: 2000 }, { calories: 2050 }, { calories: 2100 }], 2000, 'lose').adjustment, 0);
eq('calorieDrift too few', L.calorieDrift([{ calories: 2000 }], 2000, 'lose'), null);

// --- protein gap ---
const pg = L.proteinGap([{ protein: 50 }, { protein: 55 }, { protein: 60 }], 100);
eq('proteinGap avg', pg && pg.avg, 55);
eq('proteinGap bump', pg && pg.gap, 10);
eq('proteinGap ok', L.proteinGap([{ protein: 80 }, { protein: 75 }, { protein: 70 }], 100).gap, 0);
eq('proteinGap too few', L.proteinGap([{ protein: 50 }], 100), null);

// --- sleep deficit ---
const sd = L.sleepDeficit([{ hours: 6.0 }, { hours: 6.5 }, { hours: 5.5 }]);
check('sleepDeficit low avg', sd && sd.avg === 6 && sd.deficit === true, JSON.stringify(sd));
const sdOk = L.sleepDeficit([{ hours: 7.5 }, { hours: 8.0 }, { hours: 7.0 }]);
check('sleepDeficit ok', sdOk && sdOk.deficit === false, JSON.stringify(sdOk));
eq('sleepDeficit empty', L.sleepDeficit([]), null);

// --- getInsights (course-correction engine) ---
const ins = L.getInsights(mkUser());
check('getInsights returns adjustments shape',
  ['days','sets','calorie','protein'].every(k => k in ins.adjustments) && Array.isArray(ins.alerts),
  JSON.stringify(ins));
const alertedUser = mkUser({
  logs: { food: [
    { date: '2026-11-04', calories: 2600, protein: 55 },
    { date: '2026-11-03', calories: 2600, protein: 55 },
    { date: '2026-11-02', calories: 2600, protein: 55 } ],
    weights: [], workouts: [], measurements: [], sleep: [], symptoms: [], hydration: {} }
});
// getInsights uses loggedDays() which internally calls today()/dateOffset().
// In the test factory we inject deterministic dateOffset/today (factory args),
// so loggedDays returns the 7 calendar days ending 2026-11-05 — including
// 2026-11-04..11-02 — making the 3-day average visible to getInsights.
const ins2 = L.getInsights(alertedUser);
eq('getInsights calorie adjustment', ins2.adjustments.calorie, -100);
eq('getInsights protein adjustment', ins2.adjustments.protein, 10);
check('getInsights creates alerts', ins2.alerts.length >= 2, 'alerts=' + ins2.alerts.length);
// --- onboarding validation (rejects unrealistic values) ---
// valid: in-range numbers, sensible direction
eq('validateOnboarding valid', L.validateOnboarding({age:29,height:175,weight:80,targetWeight:75,goal:'lose'}).errors.length, 0);
// age 12–100
eq('validateOnboarding age 11 rejected', L.validateOnboarding({age:11,height:175,weight:80,goal:'lose'}).errors[0][0], 'age');
eq('validateOnboarding age 101 rejected', L.validateOnboarding({age:101,height:175,weight:80,goal:'lose'}).errors[0][0], 'age');
eq('validateOnboarding age 12 ok', L.validateOnboarding({age:12,height:175,weight:80,goal:'lose'}).errors.length, 0);
eq('validateOnboarding age 100 ok', L.validateOnboarding({age:100,height:175,weight:80,goal:'lose'}).errors.length, 0);
// height 120–230 cm
eq('validateOnboarding height 119 rejected', L.validateOnboarding({age:29,height:119,weight:80,goal:'lose'}).errors[0][0], 'height');
eq('validateOnboarding height 231 rejected', L.validateOnboarding({age:29,height:231,weight:80,goal:'lose'}).errors[0][0], 'height');
// weight 30–300 kg
eq('validateOnboarding weight 29 rejected', L.validateOnboarding({age:29,height:175,weight:29,goal:'lose'}).errors[0][0], 'weight');
eq('validateOnboarding weight 301 rejected', L.validateOnboarding({age:29,height:175,weight:301,goal:'lose'}).errors[0][0], 'weight');
// target weight in right direction for the goal
eq('validateOnboarding lose target >= weight rejected', L.validateOnboarding({age:29,height:175,weight:80,targetWeight:85,goal:'lose'}).errors[0][0], 'targetWeight');
eq('validateOnboarding gain target <= weight rejected', L.validateOnboarding({age:29,height:175,weight:80,targetWeight:75,goal:'gain'}).errors[0][0], 'targetWeight');
eq('validateOnboarding build target <= weight rejected', L.validateOnboarding({age:29,height:175,weight:80,targetWeight:75,goal:'build'}).errors[0][0], 'targetWeight');
eq('validateOnboarding maintain target == weight ok', L.validateOnboarding({age:29,height:175,weight:80,targetWeight:80,goal:'maintain'}).errors.length, 0);

// --- escaping (XSS) ---
eq('esc maps script tags', L.esc('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
eq('esc maps quotes', L.esc('a&b"c\'d'), 'a&amp;b&quot;c&#39;d');
eq('escapeHTML helper exists', typeof L.escapeHTML, 'function');

// currentWeight / clamp / round sanity
eq('currentWeight from profile', L.currentWeight(mkUser()), 80);
eq('clamp(5,10,20)', L.clamp(5, 10, 20), 10);
eq('round(1.5)', L.round(1.5), 1.5);

console.log('');
console.log('Passed: ' + passed + '  Failed: ' + failed + '  Blocks extracted: ' + blocks.length);
if (failed > 0) process.exit(1);
console.log('All tests passed!');
