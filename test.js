// Trainer4U logic tests — runs the REAL functions extracted from index.html
// between // <logic:start> and // <logic:end> markers (no duplicated formulas).
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
const memoryStorage = (() => {
  const values = new Map();
  return { getItem: key => values.has(key) ? values.get(key) : null, setItem: (key, value) => values.set(key, String(value)) };
})();
const factory = new Function('ACTIVITY_MULTIPLIERS', 'GOAL_LABELS', 'today', 'dateOffset', 'localStorage', 'DB_KEY', 'SCHEMA_VERSION', 'uid',
  code + '\nreturn { clamp, round, safeNum, sortedWeights, currentWeight, weightProgress, workoutsLast7, sleepAverage, loggedDays, bmiFor, bmiCategory, weightTrendPerWeek, weightTrendCategory, calorieDrift, proteinGap, sleepDeficit, macroTargets, baseTargets, getInsights, validateOnboarding, validateCustomFood, gramsForPortion, foodEntryFromFood, validateImportData, recipeMatchScore, groceryItemsForRecipe, groceryMerge, groceryText, weekStart, loadDB, esc, escapeHTML, FOOD_DB, filterFoodItems, APP_VERSION, userUnits, kgToLb, lbToKg, cmToIn, inToCm, weightUnit, lengthUnit, displayWeight, displayLength, parseWeightInput, parseLengthInput, heightDisplay, planRationale, isEncryptedExport, validateEncryptedEnvelope, EXERCISES, HOLD_EXERCISES, injuryAvoids, hasEquipment, equipmentScore, repRangeFor, swapMap, swapCandidates, applyPlanSwaps, sessionSetDone, workoutDraftFromSession, sessionBests, isPlateaued, workoutVolume, estimatedOneRepMax, personalRecords, newRecords, FORM_FIGURES, formatRestTime, planEditsFor, setPlanEdit, applyPlanEdits, filterWorkoutHistory };\n');
const L = factory(ACTIVITY_MULTIPLIERS, GOAL_LABELS, todayMock, dateOffsetMock, memoryStorage, 'trainer4u_db_v2', 2, () => 'test-food-id');

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
['', '   ', null, undefined].forEach((blankTarget, index) => {
  const result = L.validateOnboarding({age:29,height:175,weight:80,targetWeight:blankTarget,goal:'lose'});
  eq(`validateOnboarding blank target ${index} accepted`, result.errors.length, 0);
  eq(`validateOnboarding blank target ${index} stored as null`, result.values.targetWeight, null);
});
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
eq('safeNum parses form values', L.safeNum('4', 3), 4);
eq('safeNum uses fallback', L.safeNum('bad', 3), 3);

// --- regression tests for confirmed defects ---
eq('weekStart Monday', L.weekStart('2026-11-02'), '2026-11-02');
eq('weekStart Sunday returns Monday', L.weekStart('2026-11-08'), '2026-11-02');

const wrongWay = mkUser({ profile: { startWeight: 80, weight: 85, targetWeight: 70, goal: 'lose' } });
eq('weightProgress wrong-way gives no credit', L.weightProgress(wrongWay).pct, 0);
const rightWay = mkUser({ profile: { startWeight: 80, weight: 75, targetWeight: 70, goal: 'lose' } });
eq('weightProgress right-way gives credit', L.weightProgress(rightWay).pct, 50);

const constrainedMacros = L.macroTargets(1200, 300, 'lose');
check('macro minimums stay reconciled with calorie target',
  constrainedMacros.carbs >= 50 && constrainedMacros.fat >= 35 && constrainedMacros.protein >= 60 &&
  4 * (constrainedMacros.protein + constrainedMacros.carbs) + 9 * constrainedMacros.fat <= 1200,
  JSON.stringify(constrainedMacros));

const sampleRecipe = { ingredients: [{ name: 'Chicken breast' }, { name: 'Cooked rice' }, { name: 'Broccoli' }] };
const match = L.recipeMatchScore(sampleRecipe, 'chicken, rice');
eq('recipeMatchScore matches ingredients', match.matched.length, 2);
eq('recipeMatchScore identifies missing', match.missing.length, 1);
eq('recipeMatchScore empty input', L.recipeMatchScore(sampleRecipe, ''), null);

// --- grocery list ---
const groceryRecipe = { name: 'Test Curry', ingredients: [{ name: 'Chicken', qty: '200 g' }, { name: 'Onion', qty: '1' }, { name: '', qty: 'ignored' }] };
const groceryItems = L.groceryItemsForRecipe(groceryRecipe);
eq('groceryItemsForRecipe keeps named ingredients', groceryItems.length, 2);
eq('groceryItemsForRecipe tags the recipe', groceryItems[0].recipe, 'Test Curry');
check('groceryItemsForRecipe handles a bad recipe', L.groceryItemsForRecipe(null).length === 0 && L.groceryItemsForRecipe({}).length === 0);
let gid = 0;
const uidFn = () => `g${++gid}`;
const merged = L.groceryMerge([], groceryItems, uidFn);
eq('groceryMerge adds all items', merged.added, 2);
eq('groceryMerge assigns ids', merged.list[0].id, 'g1');
const mergedAgain = L.groceryMerge(merged.list, groceryItems, uidFn);
eq('groceryMerge skips duplicates from the same recipe', mergedAgain.added, 0);
eq('groceryMerge keeps the list unchanged on duplicates', mergedAgain.list.length, 2);
const mergedOther = L.groceryMerge(merged.list, L.groceryItemsForRecipe({ name: 'Other Dish', ingredients: [{ name: 'Chicken', qty: '100 g' }] }), uidFn);
eq('groceryMerge allows the same ingredient from another recipe', mergedOther.added, 1);
const gtext = L.groceryText(merged.list);
check('groceryText groups by recipe', gtext.includes('Test Curry:') && gtext.includes('- Chicken (200 g)'));
const gtextChecked = L.groceryText([{ id: 'x', name: 'Chicken', qty: '200 g', recipe: 'Test Curry', checked: true }]);
eq('groceryText omits bought items', gtextChecked, '');
eq('groceryText empty list', L.groceryText([]), '');

// --- guided workout session ---
const sessionDay = { weekday: 1, exercises: [
  { name: 'Squat', sets: 2, reps: '8-10', rest: 90 },
  { name: 'Push-up', sets: 2, reps: '10-12', rest: 60 }
] };
let sess = { dayIndex: 1, exerciseIdx: 0, setsDone: 0, startedAt: 1000000, entries: [] };
let out = L.sessionSetDone(sess, sessionDay);
eq('session: first set done counts up', out.session.setsDone, 1);
eq('session: mid-exercise rest offered', out.restSeconds, 90);
check('session: not advanced mid-exercise', !out.advanced && !out.finished);
out = L.sessionSetDone(out.session, sessionDay);
check('session: last set advances', out.advanced && !out.finished);
eq('session: advance resets set count', out.session.setsDone, 0);
eq('session: advance moves to next exercise', out.session.exerciseIdx, 1);
eq('session: rest carries into the next exercise', out.restSeconds, 90);
out = L.sessionSetDone(out.session, sessionDay);
out = L.sessionSetDone(out.session, sessionDay);
check('session: final set finishes', out.finished && !out.advanced);
eq('session: no rest after the final set', out.restSeconds, 0);
const badDay = L.sessionSetDone({ dayIndex: 0, exerciseIdx: 3, setsDone: 0, entries: [] }, sessionDay);
check('session: out-of-range index finishes safely', badDay.finished);
const draftOut = L.workoutDraftFromSession({ startedAt: 0, entries: [{ weight: '20', reps: '10' }] }, { weekday: 2 }, 30 * 60000);
eq('session: draft duration from elapsed time', draftOut.duration, 30);
eq('session: draft targets the trained day', draftOut.day, 2);
eq('session: draft carries entries', draftOut.entries.length, 1);
check('session: very short sessions floor at 5 minutes', L.workoutDraftFromSession({ startedAt: 0, entries: [] }, { weekday: 2 }, 60000).duration === 5);
check('session: missing times fall back to 45', L.workoutDraftFromSession({}, { weekday: 2 }, 0).duration === 45);

// --- plateau detection ---
const mkWorkoutLog = (date, name, weight, reps) => ({ date, exercises: [{ name, weight, reps }] });
const stalledUser = { logs: { workouts: [
  mkWorkoutLog('2026-11-01', 'Bench', 60, 5),
  mkWorkoutLog('2026-11-05', 'Bench', 60, 5),
  mkWorkoutLog('2026-11-08', 'Bench', 60, 4),
  mkWorkoutLog('2026-11-01', 'Squat', 80, 5),
  mkWorkoutLog('2026-11-05', 'Squat', 80, 5),
  mkWorkoutLog('2026-11-08', 'Squat', 85, 5)
] } };
const benchSeries = L.sessionBests(stalledUser, 'Bench');
eq('plateau: one point per session', benchSeries.length, 3);
eq('plateau: weighted series kind', benchSeries[0].kind, 'weighted');
check('plateau: stalled weighted exercise detected', L.isPlateaued(benchSeries));
check('plateau: progressing exercise not flagged', !L.isPlateaued(L.sessionBests(stalledUser, 'Squat')));
check('plateau: two sessions is not enough data', !L.isPlateaued(benchSeries.slice(0, 2)));
check('plateau: empty history is safe', !L.isPlateaued(L.sessionBests({ logs: { workouts: [] } }, 'Bench')));
const bwUser = { logs: { workouts: [
  mkWorkoutLog('2026-11-01', 'Push-up', 0, 10),
  mkWorkoutLog('2026-11-05', 'Push-up', 0, 10),
  mkWorkoutLog('2026-11-08', 'Push-up', 0, 10)
] } };
const bwSeries = L.sessionBests(bwUser, 'Push-up');
eq('plateau: bodyweight series uses reps', bwSeries[0].kind, 'reps');
check('plateau: stalled bodyweight exercise detected', L.isPlateaued(bwSeries));
const multiSetUser = { logs: { workouts: [
  { date: '2026-11-01', exercises: [{ name: 'Row', weight: 40, reps: 8 }, { name: 'Row', weight: 45, reps: 5 }] },
  { date: '2026-11-05', exercises: [{ name: 'Row', weight: 45, reps: 5 }] },
  { date: '2026-11-08', exercises: [{ name: 'Row', weight: 44, reps: 5 }] }
] } };
check('plateau: best set per session wins', L.isPlateaued(L.sessionBests(multiSetUser, 'Row')));

// --- workout volume ---
eq('volume sums weight x reps', L.workoutVolume({ exercises: [{ weight: 60, reps: 5 }, { weight: 60, reps: 5 }, { weight: 40, reps: 8 }] }), 920);
eq('volume skips bodyweight sets', L.workoutVolume({ exercises: [{ weight: 0, reps: 12 }] }), 0);
eq('volume handles an empty workout', L.workoutVolume({ exercises: [] }), 0);
eq('volume tolerates junk', L.workoutVolume(null), 0);

memoryStorage.setItem('trainer4u_db_v2', JSON.stringify({
  schemaVersion: 0,
  profiles: { legacy: { username: 'legacy', profile: { name: 'Keep me' } } }
}));
const migrated = L.loadDB();
eq('old-schema migration preserves profile', migrated.profiles.legacy.profile.name, 'Keep me');
eq('old-schema migration updates version', migrated.schemaVersion, 2);
eq('old-schema migration keeps default equipment', migrated.profiles.legacy.profile.equipment[0], 'bodyweight');

// --- custom foods and portion-based logging ---
const customFood = { id: 'dal-1', name: 'Homemade dal', servingLabel: '1 bowl', servingGrams: 250, calories: 280, protein: 18, carbs: 35, fat: 6 };
eq('valid custom food accepted', L.validateCustomFood(customFood).errors.length, 0);
eq('custom food requires a serving name', L.validateCustomFood({ ...customFood, servingLabel: '' }).errors[0][0], 'servingLabel');
eq('custom food rejects blank nutrition', L.validateCustomFood({ ...customFood, calories: '' }).errors.some(([field]) => field === 'calories'), true);
eq('custom food rejects excess serving weight', L.validateCustomFood({ ...customFood, servingGrams: 2001 }).errors.some(([field]) => field === 'servingGrams'), true);
eq('custom serving converts to grams', L.gramsForPortion(1.5, 'serving', customFood), 375);
eq('100 g portions convert to grams', L.gramsForPortion(2.5, '100g', customFood), 250);
check('ounces convert to grams', Math.abs(L.gramsForPortion(1, 'oz', customFood) - 28.349523125) < 0.000001);
eq('unknown portion rejected', Number.isNaN(L.gramsForPortion(1, 'plates', customFood)), true);
const customEntry = L.foodEntryFromFood('2026-11-05', 'Lunch', customFood, 375, '1.5 × 1 bowl');
eq('custom entry uses saved serving calories', customEntry.calories, 420);
eq('custom entry scales protein', customEntry.protein, 27);
eq('custom entry scales carbs', customEntry.carbs, 52.5);
eq('custom entry scales fat', customEntry.fat, 9);
eq('custom entry preserves portion label', customEntry.portion, '1.5 × 1 bowl');
const builtInEntry = L.foodEntryFromFood('2026-11-05', 'Breakfast', { name: 'Test food', cal: 143, protein: 12.6, carbs: 0.7, fat: 9.5 }, 100);
eq('built-in food keeps per-100g calories', builtInEntry.calories, 143);

// --- food database coverage and filtering ---
const foodNames = L.FOOD_DB.map(food => food.name);
for (const staple of ['Roti / chapati', 'Dosa', 'Idli', 'Dal (lentil curry)', 'Chole (chickpea curry)', 'Rajma (kidney bean curry)', 'Chicken biryani', 'Curd (dahi, plain)', 'Ghee', 'Palak paneer', 'Sambar', 'Poha, cooked']) {
  check(`food database covers ${staple}`, foodNames.includes(staple));
}
check('food database has no duplicate names', new Set(foodNames).size === foodNames.length);
const sourced = L.FOOD_DB.filter(food => food.src || food.basis);
check('added foods carry provenance', sourced.length >= 40);
check('provenance fields are paired and well formed', sourced.every(food =>
  typeof food.src === 'string' && food.src.length > 10 &&
  ['raw', 'cooked', 'prepared'].includes(food.basis)));
const fdcSourced = sourced.filter(food => /^USDA FDC \d+/.test(food.src));
check('verified entries name their USDA FDC record', fdcSourced.length >= 5);
eq('roti adopts its verified FDC values', L.FOOD_DB.find(food => food.name === 'Roti / chapati').cal, 299);
eq('idli adopts its verified FDC values', L.FOOD_DB.find(food => food.name === 'Idli').cal, 128);
const implausible = L.FOOD_DB.filter(food => {
  const estimate = food.protein * 4 + food.carbs * 4 + food.fat * 9;
  return !(food.cal > 0 && food.cal <= 1000 && estimate >= food.cal * 0.5 && estimate <= food.cal * 1.6);
});
eq('food database values stay nutritionally plausible', implausible.length, 0);
eq('blank filter returns the whole database', L.filterFoodItems('  ', L.FOOD_DB, []).builtIn.length, L.FOOD_DB.length);
eq('filter matches case-insensitively', L.filterFoodItems('DOSA', L.FOOD_DB, []).builtIn.length, 2);
check('filter matches substrings', L.filterFoodItems('dal', L.FOOD_DB, [customFood]).custom.length === 1 &&
  L.filterFoodItems('dal', L.FOOD_DB, [customFood]).custom[0].name === 'Homemade dal');
check('filter handles a missing custom library', L.filterFoodItems('egg', L.FOOD_DB, null).builtIn.length >= 2);
eq('filter with no matches returns empty lists', L.filterFoodItems('zzzz-nothing', L.FOOD_DB, [customFood]).builtIn.length +
  L.filterFoodItems('zzzz-nothing', L.FOOD_DB, [customFood]).custom.length, 0);

const validExport = mkUser();
const cleaned = L.validateImportData({ profile: validExport.profile, logs: validExport.logs, settings: validExport.settings });
eq('valid import preserves profile name', cleaned.profile.name, 'Test');
eq('older import gets an empty custom food library', cleaned.customFoods.length, 0);
const customImport = L.validateImportData({
  profile: validExport.profile,
  logs: { ...validExport.logs, food: [{ ...customEntry, id: 'food-1' }] },
  customFoods: [customFood],
  settings: validExport.settings
});
eq('custom food library survives import', customImport.customFoods[0].name, 'Homemade dal');
eq('custom serving survives import', customImport.customFoods[0].servingGrams, 250);
eq('diary portion survives import', customImport.logs.food[0].portion, '1.5 × 1 bowl');
let duplicateCustomIdsRejected = false;
try {
  L.validateImportData({ profile: validExport.profile, logs: validExport.logs, customFoods: [customFood, customFood], settings: validExport.settings });
} catch (error) { duplicateCustomIdsRejected = true; }
check('duplicate custom food IDs rejected', duplicateCustomIdsRejected);
const xssText = '<svg onload=window.__importXss=1>';
const xssImport = L.validateImportData({
  profile: { ...validExport.profile, name: xssText },
  logs: { ...validExport.logs, food: [{ date: '2026-11-05', meal: 'Snack', name: xssText, grams: 100, calories: 10, protein: 1, carbs: 1, fat: 0 }] },
  settings: validExport.settings
});
eq('import treats markup as text', xssImport.logs.food[0].name, xssText);
eq('escaping neutralizes imported markup', L.esc(xssImport.logs.food[0].name).includes('<img'), false);
let malformedRejected = false;
try {
  L.validateImportData({ profile: validExport.profile, logs: { ...validExport.logs, food: [null] }, settings: validExport.settings });
} catch (error) { malformedRejected = true; }
check('malformed food entry rejected before persistence', malformedRejected);
let badSettingsRejected = false;
try {
  L.validateImportData({ profile: validExport.profile, logs: validExport.logs, settings: { theme: 'bad' } });
} catch (error) { badSettingsRejected = true; }
check('invalid settings rejected', badSettingsRejected);

// --- unit conversion helpers (stored data stays metric) ---
eq('kgToLb converts', L.round(L.kgToLb(80), 1), 176.4);
eq('lbToKg round-trips', L.round(L.lbToKg(L.kgToLb(80)), 2), 80);
eq('cmToIn converts', L.round(L.cmToIn(100), 1), 39.4);
eq('inToCm round-trips', L.round(L.inToCm(L.cmToIn(180)), 2), 180);
eq('userUnits defaults to metric', L.userUnits({}), 'metric');
eq('userUnits detects imperial', L.userUnits({ settings: { units: 'imperial' } }), 'imperial');
eq('displayWeight metric passes through', L.displayWeight(80, 'metric'), 80);
eq('displayWeight imperial converts', L.displayWeight(80, 'imperial'), 176.4);
eq('displayWeight handles null', L.displayWeight(null, 'metric'), null);
check('parseWeightInput imperial stores kg', Math.abs(L.parseWeightInput('176.4', 'imperial') - 80.01) < 0.01);
eq('parseWeightInput metric passes through', L.parseWeightInput('80', 'metric'), 80);
eq('displayLength imperial converts', L.displayLength(100, 'imperial'), 39.4);
check('parseLengthInput imperial stores cm', Math.abs(L.parseLengthInput('39.4', 'imperial') - 100.08) < 0.01);
eq('heightDisplay metric', L.heightDisplay(175, 'metric'), '175 cm');
eq('heightDisplay imperial', L.heightDisplay(175, 'imperial'), '5 ft 9 in');
eq('import defaults missing units to metric', cleaned.settings.units, 'metric');
const imperialImport = L.validateImportData({ profile: validExport.profile, logs: validExport.logs, settings: { theme: '', trainerMode: 'gym', units: 'imperial' } });
eq('import accepts imperial units', imperialImport.settings.units, 'imperial');
let badUnitsRejected = false;
try {
  L.validateImportData({ profile: validExport.profile, logs: validExport.logs, settings: { units: 'bad' } });
} catch (error) { badUnitsRejected = true; }
check('invalid units setting rejected', badUnitsRejected);

// --- encrypted backup envelopes ---
eq('isEncryptedExport detects envelopes', L.isEncryptedExport({ encrypted: true }), true);
eq('isEncryptedExport ignores plain exports', L.isEncryptedExport({ app: 'Trainer4U' }), false);
eq('isEncryptedExport ignores arrays', L.isEncryptedExport([{ encrypted: true }]), false);
const goodEnvelope = { app: 'Trainer4U', encrypted: true, version: 1,
  kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 250000, salt: 'a'.repeat(32) },
  cipher: { name: 'AES-GCM', iv: 'b'.repeat(24) }, data: 'cd'.repeat(64) };
let goodAccepted = true;
try { L.validateEncryptedEnvelope(goodEnvelope); } catch (error) { goodAccepted = false; }
check('valid envelope accepted', goodAccepted);
[['salt', { ...goodEnvelope, kdf: { ...goodEnvelope.kdf, salt: 'xyz' } }],
 ['iterations', { ...goodEnvelope, kdf: { ...goodEnvelope.kdf, iterations: 5 } }],
 ['kdf name', { ...goodEnvelope, kdf: { ...goodEnvelope.kdf, name: 'scrypt' } }],
 ['iv', { ...goodEnvelope, cipher: { name: 'AES-GCM', iv: 'zz' } }],
 ['cipher name', { ...goodEnvelope, cipher: { name: 'AES-CBC', iv: 'b'.repeat(24) } }],
 ['ciphertext', { ...goodEnvelope, data: 'not-hex' }],
 ['odd ciphertext', { ...goodEnvelope, data: 'abc' }]].forEach(pair => {
  let rejected = false;
  try { L.validateEncryptedEnvelope(pair[1]); } catch (error) { rejected = true; }
  check(`damaged envelope rejected (${pair[0]})`, rejected);
});

// --- plan rationale (Why this week card) ---
const mkPlan = (days, trainingDays, labels, adjustmentDays = 0) => ({
  days, trainingDays, mode: 'gym',
  adjustments: { days: adjustmentDays },
  schedule: labels.map((label, index) => ({ weekday: index * 2, rest: false, recovery: false, label, focus: label }))
    .concat([{ weekday: 6, rest: true, recovery: false, label: 'Rest & recover', focus: '' }])
});
const rationale3 = L.planRationale(mkPlan(3, 3, ['Push', 'Pull', 'Legs']), mkUser());
check('rationale explains the committed days', rationale3.some(line => line.includes('3 days per week') && line.includes('commit')));
check('rationale names the 3-day split', rationale3.some(line => line.includes('Push, Pull, Legs')));
check('rationale explains rest days', rationale3.some(line => line.includes('recovery')));
check('rationale explains progression', rationale3.some(line => line.includes('top of a rep range')));
const rationaleAdjusted = L.planRationale(mkPlan(2, 2, ['Upper Body', 'Lower Body'], -1), mkUser());
check('rationale explains auto-coaching trims', rationaleAdjusted.some(line => line.includes('trimmed') && line.includes('3 days per week')));
check('rationale covers whole body on few days', rationaleAdjusted.some(line => line.includes('cover the whole body')));
const rationaleInjury = L.planRationale(mkPlan(3, 3, ['Push', 'Pull', 'Legs']), mkUser({ profile: { injuries: 'lower back' } }));
check('rationale notes injury filtering', rationaleInjury.some(line => line.includes('aggravate')));
const rationale5 = L.planRationale(mkPlan(5, 5, ['Push', 'Pull', 'Legs', 'Upper', 'Lower']), mkUser({ profile: { daysPerWeek: 5 } }));
check('rationale explains twice-a-week coverage on 5 days', rationale5.some(line => line.includes('more than once a week')));

// Workout history filters
const whUser = [
  { id: 'w1', label: 'Upper A', date: '2026-11-05', duration: 50, notes: 'Felt strong' },
  { id: 'w2', label: 'Lower B', date: '2026-11-03', duration: 45, notes: 'Knee warmup' },
  { id: 'w3', label: 'Upper B', date: '2026-10-20', duration: 55, notes: '' },
  { id: 'w4', label: 'Lower A', date: '2026-10-01', duration: 40, notes: 'Light day' }
];
check('history filter returns all sorted newest first', L.filterWorkoutHistory(whUser, { period: 'all', query: '' }).map(w => w.id).join(',') === 'w1,w2,w3,w4');
check('history filter last 7 days excludes older sessions', L.filterWorkoutHistory(whUser, { period: 'week', query: '' }).map(w => w.id).join(',') === 'w1,w2');
check('history filter last 30 days keeps the month window', L.filterWorkoutHistory(whUser, { period: 'month', query: '' }).map(w => w.id).join(',') === 'w1,w2,w3');
check('history filter search matches label case-insensitively', L.filterWorkoutHistory(whUser, { period: 'all', query: 'lower' }).map(w => w.id).join(',') === 'w2,w4');
check('history filter search matches notes', L.filterWorkoutHistory(whUser, { period: 'all', query: 'knee' }).map(w => w.id).join(',') === 'w2');
check('history filter combines period and search', L.filterWorkoutHistory(whUser, { period: 'week', query: 'upper' }).map(w => w.id).join(',') === 'w1');
check('history filter with no filters defaults to all', L.filterWorkoutHistory(whUser, null).length === 4);

// Static release checks for CSP, icons and the removed insecure hash fallback.
const inlineScript = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
const scriptHash = crypto.createHash('sha256').update(inlineScript).digest('base64');
check('CSP hash matches the actual inline script', html.includes(`'sha256-${scriptHash}'`));
const serviceWorker = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8');
check('service worker cache tracks the app build version', serviceWorker.includes(`v${L.APP_VERSION}`));
check('page forces a service worker update check on load', html.includes('registration.update()'));
check('page reloads once when a new worker takes over', html.includes('controllerchange'));
check('app shows the build version', html.includes('Build ${APP_VERSION}'));
check('non-cryptographic password fallback removed', !html.includes('fallbackHash'));
check('service worker limits cache deletion to its own prefix', serviceWorker.includes('name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME'));
check('service worker restricts requests to its own scope', serviceWorker.includes('url.pathname.startsWith(APP_SCOPE.pathname)'));
const proprietaryLicense = fs.readFileSync(path.join(__dirname, 'LICENSE'), 'utf8');
const legacyMitLicense = fs.readFileSync(path.join(__dirname, 'licenses/MIT-through-c5b049e.txt'), 'utf8');
const packageMetadata = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
check('proprietary license preserves the exact MIT cutoff', proprietaryLicense.includes('c5b049e927cbf6f9edf84ab3bfba4a3482fd9e5c') && proprietaryLicense.includes('commits after the commit identified above'));
check('license transition does not revoke earlier MIT permissions', proprietaryLicense.includes('does not') && proprietaryLicense.includes('revokes, narrows, or otherwise changes any permission'));
check('license does not claim general ideas or independent development', proprietaryLicense.includes('not general ideas, concepts, features') && proprietaryLicense.includes('independently developed'));
check('legacy MIT permission text remains available', legacyMitLicense.startsWith('MIT License') && legacyMitLicense.includes('Permission is hereby granted, free of charge'));
check('package metadata prevents an unintended open-source or publish declaration', packageMetadata.license === 'UNLICENSED' && packageMetadata.private === true);
check('progressive overload uses 12-rep upper bound', html.includes("const topOfRange = goal === 'lose' ? 15 : 12;"));
for (const size of [192, 512]) {
  const icon = require('fs').readFileSync(path.join(__dirname, `icons/manifest-${size}.png`));
  check(`manifest icon ${size} is a real PNG`, icon.subarray(1, 4).toString() === 'PNG' && icon.readUInt32BE(16) === size && icon.readUInt32BE(20) === size);
}

// --- Exercise swaps ---
{
  const swapUser = mkUser();
  const day = () => ({ rest: false, recovery: false, weekday: 0, exercises: [
    { name: 'Push-up', sets: 3, reps: '12–15', rest: 45, cues: 'original cues' },
    { name: 'Bodyweight squat', sets: 3, reps: '12–15', rest: 45, cues: 'squat cues' }
  ] });
  const mkPlan = () => ({ mode: 'gym', schedule: [day()] });

  check('swapMap is empty without stored swaps', Object.keys(L.swapMap(swapUser, 'gym')).length === 0);

  const pushAlts = L.swapCandidates(swapUser, 'gym', ['Bodyweight squat'], 'Push-up');
  check('swap candidates share the movement slot', pushAlts.length > 0 && pushAlts.every(name => {
    const ex = L.EXERCISES.find(item => item.name === name);
    return ex.slots.includes('pushH');
  }), pushAlts.join(','));
  check('swap candidates exclude the original and the day’s other picks', !pushAlts.includes('Push-up') && !pushAlts.includes('Bodyweight squat'));
  check('swap candidates are sorted', JSON.stringify(pushAlts) === JSON.stringify([...pushAlts].sort()));

  swapUser.planSwaps = { gym: { 0: { 'Push-up': 'Incline push-up' } } };
  const swapped = L.applyPlanSwaps(swapUser, mkPlan());
  eq('stored swap replaces the exercise', swapped.schedule[0].exercises[0].name, 'Incline push-up');
  eq('swap keeps the prescribed sets', swapped.schedule[0].exercises[0].sets, 3);
  check('swap pulls the replacement’s cues', swapped.schedule[0].exercises[0].cues !== 'original cues');
  eq('the other exercise is untouched', swapped.schedule[0].exercises[1].name, 'Bodyweight squat');

  swapUser.planSwaps = { gym: { 0: { 'Push-up': 'Barbell back squat' } } };
  const rejected = L.applyPlanSwaps(swapUser, mkPlan());
  eq('a swap to a different movement slot is ignored', rejected.schedule[0].exercises[0].name, 'Push-up');

  const homeUser = mkUser({ profile: { equipment: ['bodyweight'] } });
  const homeAlts = L.swapCandidates(homeUser, 'home', [], 'Push-up');
  check('home swaps stay within owned equipment', homeAlts.length > 0 && homeAlts.every(name => {
    const ex = L.EXERCISES.find(item => item.name === name);
    return ex.equip.includes('bodyweight');
  }), homeAlts.join(','));

  const injuredUser = mkUser({ profile: { injuries: 'knee pain' } });
  const squatAlts = L.swapCandidates(injuredUser, 'gym', [], 'Leg extension');
  check('injury notes filter swap candidates', !squatAlts.some(name => L.injuryAvoids(L.EXERCISES.find(ex => ex.name === name), 'knee pain')));

  swapUser.planSwaps = { gym: { 0: { 'Bodyweight squat': 'Wall sit' } } };
  const holdSwap = L.applyPlanSwaps(swapUser, mkPlan());
  eq('swapping to an isometric hold switches to seconds', holdSwap.schedule[0].exercises[1].reps, '30–45 sec');

  swapUser.planSwaps = { gym: { 0: { 'Wall sit': 'Goblet squat' } } };
  const holdPlan = { mode: 'gym', schedule: [{ rest: false, recovery: false, weekday: 0, exercises: [
    { name: 'Wall sit', sets: 3, reps: '30–45 sec', rest: 45, cues: 'wall cues' }
  ] }] };
  const unhold = L.applyPlanSwaps(swapUser, holdPlan);
  eq('swapping off a hold restores the goal rep range', unhold.schedule[0].exercises[0].reps, L.repRangeFor(swapUser.profile.goal));

  swapUser.planSwaps = { home: { 0: { 'Push-up': 'Incline push-up' } } };
  const otherMode = L.applyPlanSwaps(swapUser, mkPlan());
  eq('swaps are scoped per training mode', otherMode.schedule[0].exercises[0].name, 'Push-up');

  const restPlan = { mode: 'gym', schedule: [{ rest: true, weekday: 1, exercises: [] }, { rest: false, recovery: true, weekday: 2, exercises: [{ name: 'Easy walk', sets: 1, reps: '15–20 min', rest: 0, cues: '' }] }] };
  swapUser.planSwaps = { gym: { 1: { 'Easy walk': 'Box breathing' }, 2: { 'Easy walk': 'Box breathing' } } };
  const untouched = L.applyPlanSwaps(swapUser, restPlan);
  check('rest and recovery days are never swapped', untouched.schedule[0].exercises.length === 0 && untouched.schedule[1].exercises[0].name === 'Easy walk');
}

// --- Personal records ---
{
  eq('Epley: a single rep is the one-rep max', L.estimatedOneRepMax(100, 1), 100);
  eq('Epley: 100 x 10 estimates 133.33', Math.round(L.estimatedOneRepMax(100, 10) * 100) / 100, 133.33);
  eq('no load means no record', L.estimatedOneRepMax(0, 15), 0);
  eq('no reps means no record', L.estimatedOneRepMax(100, 0), 0);

  const prUser = mkUser();
  prUser.logs.workouts = [
    { id: 'w1', date: '2026-11-01', exercises: [{ name: 'Bench', weight: 60, reps: 8 }, { name: 'Row', weight: 50, reps: 10 }] },
    { id: 'w2', date: '2026-11-03', exercises: [{ name: 'Bench', weight: 70, reps: 5 }, { name: 'Plank', weight: 0, reps: 0 }] }
  ];
  const prs = L.personalRecords(prUser);
  eq('one record per exercise, bodyweight skipped', prs.length, 2);
  const bench = prs.find(r => r.name === 'Bench');
  check('record picks the stronger set by estimated 1RM', bench.weight === 70 && bench.reps === 5 && bench.date === '2026-11-03', JSON.stringify(bench));
  check('records sort strongest first', prs[0].oneRepMax >= prs[1].oneRepMax);
  check('records survive an empty workout log', L.personalRecords(mkUser()).length === 0);

  // newRecords: a first-ever set is a baseline, not a record claim.
  const baseUser = mkUser();
  baseUser.logs.workouts = [{ id: 'first', date: '2026-11-01', exercises: [{ name: 'Bench', weight: 100, reps: 5 }] }];
  eq('first logged set does not cry record', L.newRecords(baseUser, 'first').length, 0);

  baseUser.logs.workouts.push({ id: 'second', date: '2026-11-03', exercises: [{ name: 'Bench', weight: 100, reps: 6 }, { name: 'Row', weight: 40, reps: 10 }] });
  const hits = L.newRecords(baseUser, 'second');
  check('beating a prior best is flagged', hits.length === 1 && hits[0] === 'Bench', hits.join(','));

  baseUser.logs.workouts.push({ id: 'third', date: '2026-11-05', exercises: [{ name: 'Bench', weight: 90, reps: 5 }] });
  eq('a weaker session is not a record', L.newRecords(baseUser, 'third').length, 0);
  eq('unknown workout id flags nothing', L.newRecords(baseUser, 'missing').length, 0);
  check('the workout itself is excluded from its own comparison', L.newRecords(baseUser, 'second').length === 1);
}

// --- Form figures ---
{
  const withFig = L.EXERCISES.filter(ex => ex.fig);
  eq('seventy-eight exercises ship a form figure', withFig.length, 78);
  check('every fig key resolves to an SVG', withFig.every(ex => L.FORM_FIGURES[ex.fig] && L.FORM_FIGURES[ex.fig].startsWith('<svg')), withFig.map(ex => ex.fig).join(','));
  check('every figure has an accessible label', withFig.every(ex => L.FORM_FIGURES[ex.fig].includes('aria-label=')));
  check('every figured exercise has numbered steps', withFig.every(ex => Array.isArray(ex.steps) && ex.steps.length >= 3));
  const regressions = L.EXERCISES.filter(ex => ex.lvl === 0);
  check('beginner regressions exist and stay bodyweight', regressions.some(ex => ex.name === 'Wall push-up') && regressions.some(ex => ex.name === 'Knee push-up') && regressions.every(ex => ex.equip.includes('bodyweight')) && regressions.length >= 5);
  check('moving figures animate, static holds do not', ['squat', 'pushup', 'deadlift', 'bench', 'gobletsquat', 'backsquat', 'walkinglunge', 'rdl', 'kbswing', 'legpress', 'ohp', 'laterlaise', 'dip', 'pullup', 'dbrow', 'facepull', 'barbellcurl', 'skullcrusher', 'deadbug', 'kneepushup', 'wallpushup'].every(k => L.FORM_FIGURES[k].includes('<animate')) && !L.FORM_FIGURES.plank.includes('<animate') && !L.FORM_FIGURES.wallsit.includes('<animate'));
  check('figures are inline SVG with no external references', Object.values(L.FORM_FIGURES).every(markup => !markup.includes('href') && !markup.includes('url(')));
}

check('formatRestTime formats 90 seconds', L.formatRestTime(90) === '1:30', L.formatRestTime(90));
check('formatRestTime formats 45 seconds', L.formatRestTime(45) === '0:45', L.formatRestTime(45));
check('formatRestTime clamps zero and negatives', L.formatRestTime(0) === '0:00' && L.formatRestTime(-5) === '0:00');
check('formatRestTime rounds partial seconds up', L.formatRestTime(89.2) === '1:30' && L.formatRestTime(60.1) === '1:01');

{
  const tuneUser = () => ({ profile: { goal: 'maintain', injuries: '' }, planEdits: {} });
  const tunePlan = () => ({ mode: 'gym', schedule: [
    { weekday: 0, weekdayName: 'Mon', rest: false, recovery: false, exercises: [{ name: 'A', sets: 3, reps: '10-12', rest: 60 }, { name: 'B', sets: 4, reps: '10-12', rest: 60 }] },
    { weekday: 1, weekdayName: 'Tue', rest: true, recovery: false, exercises: [] }
  ] });
  const u1 = tuneUser();
  L.setPlanEdit(u1, 'gym', 0, 'A', { sets: 9 });
  const p1 = L.applyPlanEdits(u1, tunePlan());
  check('plan tuning clamps custom sets to 6', p1.schedule[0].exercises[0].sets === 6, String(p1.schedule[0].exercises[0].sets));
  const u2 = tuneUser();
  L.setPlanEdit(u2, 'gym', 0, 'A', { sets: 0 });
  check('plan tuning clamps custom sets to 1', L.applyPlanEdits(u2, tunePlan()).schedule[0].exercises[0].sets === 1);
  const u3 = tuneUser();
  L.setPlanEdit(u3, 'gym', 0, 'B', { off: true });
  const p3 = L.applyPlanEdits(u3, tunePlan());
  check('plan tuning removes an exercise and records it for restore', p3.schedule[0].exercises.length === 1 && p3.schedule[0].exercises[0].name === 'A' && p3.schedule[0].removed.join(',') === 'B', JSON.stringify(p3.schedule[0].removed));
  L.setPlanEdit(u3, 'gym', 0, 'B', { off: false });
  const p4 = L.applyPlanEdits(u3, tunePlan());
  check('plan tuning restore brings the exercise back and prunes storage', p4.schedule[0].exercises.length === 2 && !u3.planEdits.gym[0], JSON.stringify(u3.planEdits));
  const u5 = tuneUser();
  L.setPlanEdit(u5, 'gym', 0, 'Ghost', { sets: 5, off: true });
  const p5 = L.applyPlanEdits(u5, tunePlan());
  check('plan tuning ignores edits for exercises no longer planned', p5.schedule[0].exercises.length === 2 && p5.schedule[0].exercises[0].sets === 3);
  const u6 = tuneUser();
  L.setPlanEdit(u6, 'gym', 1, 'A', { off: true });
  check('plan tuning leaves rest days untouched', L.applyPlanEdits(u6, tunePlan()).schedule[1].exercises.length === 0 && L.applyPlanEdits(u6, tunePlan()).schedule[1].rest === true);
  check('plan tuning edits are scoped per mode and weekday', Object.keys(L.planEditsFor(u1, 'home', 0)).length === 0 && Object.keys(L.planEditsFor(u1, 'gym', 2)).length === 0);
}

console.log('');
console.log('Passed: ' + passed + '  Failed: ' + failed + '  Blocks extracted: ' + blocks.length);
if (failed > 0) process.exit(1);
console.log('All tests passed!');
