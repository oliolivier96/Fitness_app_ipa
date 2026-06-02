"use strict";

const STORAGE_KEY = "solo_leveling_fitness_system_v2";
const STAT_KEYS = ["strength", "endurance", "speed", "discipline"];
const DAILY_REMINDER_ID = 777001;
const TAB_ORDER = ["system", "progress", "workouts", "achievements"];
const SWIPE_THRESHOLD_PX = 56;
/** Per tap on daily quest rep lines (push-ups, sit-ups, squats, penalty burpees). Running uses +1 km per tap. */
const QUEST_REP_INCREMENT = 5;

const WORKOUT_MODE_CLASSIC = "classic";
const WORKOUT_MODE_RECOMMENDED = "recommended";

function normalizeWorkoutMode(mode) {
  return mode === WORKOUT_MODE_RECOMMENDED ? WORKOUT_MODE_RECOMMENDED : WORKOUT_MODE_CLASSIC;
}

function exerciseLabels(mode) {
  const m = normalizeWorkoutMode(mode);
  if (m === WORKOUT_MODE_RECOMMENDED) {
    return {
      push: "Decline push-ups",
      sit: "Inverted rows",
      squat: "Bulgarian split squats",
      pushQuest: "decline push-ups",
      sitQuest: "inverted rows",
      squatQuest: "bulgarian split squats",
      dailyReminder: "100 decline push-ups, 100 inverted rows, 100 Bulgarian split squats, 10 km run.",
    };
  }
  return {
    push: "Push-ups",
    sit: "Sit-ups",
    squat: "Squats",
    pushQuest: "push-ups",
    sitQuest: "sit-ups",
    squatQuest: "squats",
    dailyReminder: "100 push-ups, 100 sit-ups, 100 squats, 10 km run.",
  };
}

function getDailyFixedQuest(mode) {
  const labels = exerciseLabels(mode);
  return [
    { type: labels.pushQuest, unit: "reps", target: 100, xp: 40, stat: "strength" },
    { type: labels.sitQuest, unit: "reps", target: 100, xp: 40, stat: "endurance" },
    { type: labels.squatQuest, unit: "reps", target: 100, xp: 40, stat: "strength" },
    { type: "running", unit: "km", target: 10, xp: 80, stat: "speed" },
  ];
}

function getRankDef(rankId) {
  return RANK_DEFINITIONS.find((r) => r.id === rankId) || null;
}

function formatRankDisplay(rankId) {
  const def = getRankDef(rankId);
  return def ? def.name : `Rank ${rankId}`;
}

function getWorkoutMode() {
  return normalizeWorkoutMode(state.profile?.workoutMode);
}

function getMissionText(mission, mode) {
  const builder = MISSION_TEXT_BUILDERS[mission.textKey];
  if (!builder) return mission.textKey || "Mission";
  return builder(mission.textParams || {}, normalizeWorkoutMode(mode));
}

function rankIndex(rankId) {
  const i = RANK_ORDER.indexOf(rankId);
  return i < 0 ? 0 : i;
}

function canStartMissionQuest(mission) {
  return Boolean(mission.startQuest && MISSION_START_QUEST_IDS.has(mission.id));
}

function buildRepTaskForMode(exercise, target, mode, xp, stat) {
  const labels = exerciseLabels(mode);
  const type =
    exercise === "push" ? labels.pushQuest : exercise === "sit" ? labels.sitQuest : labels.squatQuest;
  const progressKey = exercise === "push" ? "pushups" : exercise === "sit" ? "situps" : "squats";
  return { type, unit: "reps", target, xp, stat, progressKey };
}

function buildMissionQuest(missionId) {
  const mission = RANK_MISSION_DEFS.find((m) => m.id === missionId);
  if (!mission?.startQuest) return null;
  const mode = getWorkoutMode();
  const labels = exerciseLabels(mode);
  const sq = mission.startQuest;
  const today = dayKey(new Date());

  if (sq.kind === "rep_day") {
    const task = buildRepTaskForMode(sq.exercise, sq.target, mode, 30, "strength");
    const progress = { pushups: 0, situps: 0, squats: 0 };
    progress[task.progressKey] = 0;
    return {
      missionId,
      missionSlot: mission.rank,
      title: getMissionText(mission, mode),
      date: today,
      tasks: [task],
      progress,
      totalXp: 30,
      completed: false,
      completeMode: "all",
    };
  }

  if (sq.kind === "run") {
    return {
      missionId,
      missionSlot: mission.rank,
      title: getMissionText(mission, mode),
      date: today,
      tasks: [{ type: "running", unit: "km", target: sq.km, xp: 40, stat: "speed", progressKey: "runningKm" }],
      progress: { runningKm: 0 },
      totalXp: 40,
      completed: false,
      completeMode: "all",
    };
  }

  if (sq.kind === "total_reps") {
    const t = sq.target;
    const pushT = buildRepTaskForMode("push", t, mode, 15, "strength");
    const sitT = buildRepTaskForMode("sit", t, mode, 15, "endurance");
    const sqT = buildRepTaskForMode("squat", t, mode, 15, "strength");
    return {
      missionId,
      missionSlot: mission.rank,
      title: getMissionText(mission, mode),
      date: today,
      tasks: [pushT, sitT, sqT],
      progress: { pushups: 0, situps: 0, squats: 0 },
      totalSumTarget: t,
      totalXp: 45,
      completed: false,
      completeMode: "total_sum",
    };
  }

  if (sq.kind === "pb_all") {
    const pbP = state.pbPushupsDayEver ?? 0;
    const pbS = state.pbSitupsDayEver ?? 0;
    const pbQ = state.pbSquatsDayEver ?? 0;
    return {
      missionId,
      missionSlot: mission.rank,
      title: getMissionText(mission, mode),
      date: today,
      tasks: [
        buildRepTaskForMode("push", pbP + 1, mode, 20, "strength"),
        buildRepTaskForMode("sit", pbS + 1, mode, 20, "endurance"),
        buildRepTaskForMode("squat", pbQ + 1, mode, 20, "strength"),
      ],
      progress: { pushups: 0, situps: 0, squats: 0 },
      pbBaseline: { push: pbP, sit: pbS, squat: pbQ },
      totalXp: 50,
      completed: false,
      completeMode: "all",
    };
  }

  if (sq.kind === "pb_sit_squat") {
    const pbSit = state.pbSitupsDayEver ?? 0;
    const pbSq = state.pbSquatsDayEver ?? 0;
    const sitTarget = Math.max(1, pbSit + 1);
    const sqTarget = Math.max(1, pbSq + 1);
    return {
      missionId,
      missionSlot: mission.rank,
      title: getMissionText(mission, mode),
      date: today,
      tasks: [
        {
          type: labels.sitQuest,
          unit: "reps",
          target: sitTarget,
          xp: 25,
          stat: "endurance",
          progressKey: "situps",
        },
        {
          type: labels.squatQuest,
          unit: "reps",
          target: sqTarget,
          xp: 25,
          stat: "strength",
          progressKey: "squats",
        },
      ],
      progress: { situps: 0, squats: 0 },
      pbBaseline: { sit: pbSit, squat: pbSq },
      totalXp: 35,
      completed: false,
      completeMode: "any",
    };
  }

  return null;
}

/** Rank ladder — single source for UI cards, labels, and progression order. */
const RANK_DEFINITIONS = [
  { id: "E", shortLabel: "E", name: "Rank E", group: "Hunter", tier: "hunter" },
  { id: "D", shortLabel: "D", name: "Rank D", group: "Hunter", tier: "hunter" },
  { id: "C", shortLabel: "C", name: "Rank C", group: "Hunter", tier: "hunter" },
  { id: "B", shortLabel: "B", name: "Rank B", group: "Hunter", tier: "hunter" },
  { id: "A", shortLabel: "A", name: "Rank A", group: "Hunter", tier: "hunter" },
  { id: "S", shortLabel: "S", name: "Rank S", group: "Hunter", tier: "hunter" },
  { id: "NL", shortLabel: "NL", name: "National Level", group: "Hunter", tier: "hunter" },
  { id: "MR", shortLabel: "MR", name: "Monarchs & Rulers", group: "Cosmic Beings", tier: "cosmic" },
  { id: "SM", shortLabel: "SM", name: "Shadow Monarch", group: "Cosmic Beings", tier: "cosmic" },
  { id: "AB", shortLabel: "AB", name: "Absolute Being", group: "The Creator", tier: "creator" },
];

const RANK_ORDER = RANK_DEFINITIONS.map((r) => r.id);

/** Ladder / mission panel tabs (display order). */
const RANK_LADDER_TABS = [
  { id: "hunter", label: "Hunter", rankIds: ["E", "D", "C", "B", "A", "S", "NL"] },
  { id: "cosmic", label: "Cosmic Beings", rankIds: ["MR", "SM"] },
  { id: "creator", label: "The Creator", rankIds: ["AB"] },
];

/** Highest rank assignable from baseline evaluation (push/sit/squat one-set test). */
const MAX_EVAL_RANK = "S";

/** Promotion from current rank: level + min reps (one set each); hunter tiers may require runKm. */
const RANK_PROMOTION = {
  E: { next: "D", level: 5, pushups: 25, situps: 35, squats: 50 },
  D: { next: "C", level: 10, pushups: 35, situps: 50, squats: 70 },
  C: { next: "B", level: 20, pushups: 50, situps: 70, squats: 100 },
  B: { next: "A", level: 35, pushups: 150, situps: 150, squats: 150, runKm: 10 },
  A: { next: "S", level: 50, pushups: 200, situps: 200, squats: 200, runKm: 10 },
  S: { next: "NL", level: 70, pushups: 150, situps: 180, squats: 250 },
  NL: { next: "MR", level: 90, pushups: 200, situps: 220, squats: 300 },
  MR: { next: "SM", level: 110, pushups: 250, situps: 260, squats: 350 },
  SM: { next: "AB", level: 150, pushups: 300, situps: 300, squats: 400 },
};

/** Missions that can launch an interactive rank mission quest. */
const MISSION_START_QUEST_IDS = new Set([
  "e_push_50_day",
  "d_push_100_day",
  "d_run_5km",
  "c_sit_70_set",
  "b_total_reps_200",
  "a_push_150_day",
  "a_run_10km",
]);

/** Dynamic mission copy — textKey + textParams; never hardcode exercise names here. */
const MISSION_TEXT_BUILDERS = {
  streak_days: (p) => `Complete ${p.days} days in a row`,
  streak_achieve: (p) => `Achieve a ${p.days}-day streak`,
  streak_maintain: (p) => `Maintain a ${p.days}-day streak`,
  push_day_total: (p, mode) =>
    `Do ${p.amount} ${exerciseLabels(mode).push.toLowerCase()} in one day`,
  run_session: (p) => `Run ${p.km} km in one session`,
  run_no_stop: (p) => `Run ${p.km} km without stopping`,
  sit_one_set: (p, mode) =>
    `Reach ${p.amount} ${exerciseLabels(mode).sit.toLowerCase()} in one set`,
  total_reps_workout: (p) => `Do ${p.amount} total reps in one workout`,
  daily_quest_streak: (p) => `Complete ${p.count} daily quests in a row`,
  daily_quest_count: (p) => `Complete ${p.count} daily quests`,
  pb_all_exercises: () => `Reach new personal best in all exercises`,
};

/**
 * Rank promotion missions — two per rank; required before re-evaluation.
 * Only progress while player holds mission.rank.
 */
const RANK_MISSION_DEFS = [
  { id: "e_streak_3", rank: "E", textKey: "streak_days", textParams: { days: 3 }, check: (s) => s.streak >= 3 },
  {
    id: "e_push_50_day",
    rank: "E",
    textKey: "push_day_total",
    textParams: { amount: 50 },
    check: (s, d) => (d.maxPushupsInDay || 0) >= 50,
    startQuest: { kind: "rep_day", exercise: "push", target: 50 },
  },
  {
    id: "d_push_100_day",
    rank: "D",
    textKey: "push_day_total",
    textParams: { amount: 100 },
    check: (s, d) => (d.maxPushupsInDay || 0) >= 100,
    startQuest: { kind: "rep_day", exercise: "push", target: 100 },
  },
  {
    id: "d_run_5km",
    rank: "D",
    textKey: "run_session",
    textParams: { km: 5 },
    check: (s, d) => (d.maxRunSingleSessionKm || 0) >= 5,
    startQuest: { kind: "run", km: 5 },
  },
  { id: "c_streak_7", rank: "C", textKey: "streak_achieve", textParams: { days: 7 }, check: (s) => s.streak >= 7 },
  {
    id: "c_sit_70_set",
    rank: "C",
    textKey: "sit_one_set",
    textParams: { amount: 70 },
    check: (s, d) => (d.maxSitupsOneSet || 0) >= 70,
    startQuest: { kind: "rep_day", exercise: "sit", target: 70 },
  },
  {
    id: "b_total_reps_200",
    rank: "B",
    textKey: "total_reps_workout",
    textParams: { amount: 200 },
    check: (s, d) => (d.maxTotalRepsInDay || 0) >= 200,
    startQuest: { kind: "total_reps", target: 200 },
  },
  {
    id: "b_quest_streak_10",
    rank: "B",
    textKey: "daily_quest_streak",
    textParams: { count: 10 },
    check: (s) => s.streak >= 10,
  },
  {
    id: "a_push_150_day",
    rank: "A",
    textKey: "push_day_total",
    textParams: { amount: 150 },
    check: (s, d) => (d.maxPushupsInDay || 0) >= 150,
    startQuest: { kind: "rep_day", exercise: "push", target: 150 },
  },
  {
    id: "a_run_10km",
    rank: "A",
    textKey: "run_no_stop",
    textParams: { km: 10 },
    check: (s, d) => (d.maxRunSingleSessionKm || 0) >= 10,
    startQuest: { kind: "run", km: 10 },
  },
  { id: "s_streak_14", rank: "S", textKey: "streak_maintain", textParams: { days: 14 }, check: (s) => s.streak >= 14 },
  {
    id: "s_quest_20",
    rank: "S",
    textKey: "daily_quest_count",
    textParams: { count: 20 },
    check: (s) => (s.completedQuestDays || 0) >= 20,
  },
  { id: "nl_streak_30", rank: "NL", textKey: "streak_maintain", textParams: { days: 30 }, check: (s) => s.streak >= 30 },
  {
    id: "nl_quest_40",
    rank: "NL",
    textKey: "daily_quest_count",
    textParams: { count: 40 },
    check: (s) => (s.completedQuestDays || 0) >= 40,
  },
  { id: "mr_streak_45", rank: "MR", textKey: "streak_maintain", textParams: { days: 45 }, check: (s) => s.streak >= 45 },
  {
    id: "mr_quest_60",
    rank: "MR",
    textKey: "daily_quest_count",
    textParams: { count: 60 },
    check: (s) => (s.completedQuestDays || 0) >= 60,
  },
  { id: "sm_streak_60", rank: "SM", textKey: "streak_maintain", textParams: { days: 60 }, check: (s) => s.streak >= 60 },
  {
    id: "sm_quest_75",
    rank: "SM",
    textKey: "daily_quest_count",
    textParams: { count: 75 },
    check: (s) => (s.completedQuestDays || 0) >= 75,
  },
];

/** @deprecated Use RANK_MISSION_DEFS — kept as alias for any external reference. */
const RANK_MISSIONS = RANK_MISSION_DEFS;

const STARTING_LEVEL_BY_RANK = {
  E: 1,
  D: RANK_PROMOTION.E.level,
  C: RANK_PROMOTION.D.level,
  B: RANK_PROMOTION.C.level,
  A: RANK_PROMOTION.B.level,
  S: RANK_PROMOTION.A.level,
  NL: RANK_PROMOTION.S.level,
  MR: RANK_PROMOTION.NL.level,
  SM: RANK_PROMOTION.MR.level,
  AB: RANK_PROMOTION.SM.level,
};

const ACHIEVEMENTS = [
  { id: "first_quest", title: "First Quest Completed", check: (s) => s.completedQuestDays >= 1 },
  { id: "streak_7", title: "7-Day Streak", check: (s) => s.streak >= 7 },
  { id: "rank_d", title: "Reached D Rank", rankTarget: "D", check: (s) => rankIndex(s.rank) >= rankIndex("D") },
  { id: "rank_c", title: "Reached C Rank", rankTarget: "C", check: (s) => rankIndex(s.rank) >= rankIndex("C") },
  { id: "rank_b", title: "Reached B Rank", rankTarget: "B", check: (s) => rankIndex(s.rank) >= rankIndex("B") },
  { id: "rank_a", title: "Reached A Rank", rankTarget: "A", check: (s) => rankIndex(s.rank) >= rankIndex("A") },
  { id: "rank_s", title: "Reached S Rank", rankTarget: "S", check: (s) => rankIndex(s.rank) >= rankIndex("S") },
  { id: "rank_nl", title: "National Level", rankTarget: "NL", check: (s) => rankIndex(s.rank) >= rankIndex("NL") },
  { id: "rank_mr", title: "Monarchs & Rulers", rankTarget: "MR", check: (s) => rankIndex(s.rank) >= rankIndex("MR") },
  { id: "rank_sm", title: "Shadow Monarch", rankTarget: "SM", check: (s) => rankIndex(s.rank) >= rankIndex("SM") },
  { id: "rank_ab", title: "Absolute Being", rankTarget: "AB", check: (s) => rankIndex(s.rank) >= rankIndex("AB") },
  { id: "warrior_50", title: "Strength 50", check: (s) => s.stats.strength >= 50 },
];

const TITLES = [
  {
    id: "push_specialist",
    name: "Push-up Specialist",
    check: (s) => (s.workoutTotals?.pushups || 0) >= 50,
  },
  {
    id: "iron_core",
    name: "Iron Core",
    check: (s) => (s.workoutTotals?.situps || 0) >= 80,
  },
  {
    id: "leg_machine",
    name: "Leg Machine",
    check: (s) => (s.workoutTotals?.squats || 0) >= 120,
  },
  {
    id: "consistent_hunter",
    name: "Consistent Hunter",
    check: (s) => s.streak >= 7,
  },
];

/** One line per day (index chosen from calendar date). */
const DAILY_MOTIVATIONS = [
  "The System notes your effort — make today impossible to ignore.",
  "One clean session is enough to keep your streak alive. Start.",
  "Hunters level up in silence; let today's work be your proof.",
  "Discipline is paying the rep tax when motivation clocks out.",
  "Your stats rise when you do. No shortcuts — only consistency.",
  "Today's quest is a practice run for the player you're becoming.",
  "Small reps compound into stats no one can take from you.",
  "Choose the hard thing once; the rest of the day gets easier.",
  "The bar doesn't get lighter — you get quietly stronger.",
  "Show up tired. Finish proud. The System remembers both.",
  "Future you is built from reps you almost skipped.",
  "Pain today is XP tomorrow; earn it on purpose.",
  "Streaks aren't luck — they're receipts from yesterday's you.",
  "You're not behind; you're one session away from momentum.",
  "Train like the next rank is watching — because it is.",
  "Comfort zones don't drop loot. Step in anyway.",
  "Half effort yields half stats. Full send, hunter.",
  "Breath steady, form honest, ego left at the door.",
  "Every rep is a vote for the life you say you want.",
  "The Hunter who rests strategically still rises — but never by accident.",
  "No epic montage — just you vs. the next set. Win that.",
  "Your legs may shake; your choice to continue doesn't have to.",
  "Stack enough ordinary days and you become extraordinary.",
  "Sweat is boring; regret lasts longer. Pick boring.",
  "If it's heavy, you're earning something worth keeping.",
  "Speed isn't hype — it's showing up again before doubt returns.",
  "Endurance is refusing to negotiate the last few reps.",
  "You don't need perfect — you need present.",
  "Lock in today; let excuses expire unread.",
  "The System rewards hunters who finish what they start.",
  "When motivation fades, let obligation carry you — that's discipline.",
  "Someone weaker than you started yesterday. Beat the old you.",
  "Your body adapts to the work you repeat. Repeat the right work.",
  "Champions are carved from routine, not inspiration.",
  "If you're breathing, you can do one more honest rep.",
  "The scoreboard resets at sunrise — earn today's entry.",
  "Leave the session knowing you didn't steal from yourself.",
  "Every level starts with a single unwilling step forward.",
  "Rest is earned — but growth is chased.",
  "You are the main quest. Side quests can wait.",
  "Make discomfort familiar; that's where the upgrades live.",
  "Today's pain is tomorrow's warm-up — invest accordingly.",
  "Hunters train through doubt because doubt doesn't pay XP.",
  "Your streak is a story — write a line that doesn't embarrass you.",
  "Strong isn't a feeling; it's what you do when you feel weak.",
  "Close the loop: plan, execute, log, repeat.",
  "No audience required — the work still counts.",
  "Be the version of you that doesn't need a pep talk to begin.",
];

const el = {
  profileSetup: document.getElementById("profileSetup"),
  appMain: document.getElementById("appMain"),
  playerName: document.getElementById("playerName"),
  setupStepName: document.getElementById("setupStepName"),
  setupStepWorkout: document.getElementById("setupStepWorkout"),
  setupStepEval: document.getElementById("setupStepEval"),
  setupNextNameBtn: document.getElementById("setupNextNameBtn"),
  setupNextWorkoutBtn: document.getElementById("setupNextWorkoutBtn"),
  setupBackWorkoutBtn: document.getElementById("setupBackWorkoutBtn"),
  setupBackEvalBtn: document.getElementById("setupBackEvalBtn"),
  setupEvalIntro: document.getElementById("setupEvalIntro"),
  initPushLabel: document.getElementById("initPushLabel"),
  initSitLabel: document.getElementById("initSitLabel"),
  initSquatLabel: document.getElementById("initSquatLabel"),
  initPushups: document.getElementById("initPushups"),
  initSitups: document.getElementById("initSitups"),
  initSquats: document.getElementById("initSquats"),
  createProfileBtn: document.getElementById("createProfileBtn"),
  evalModalPushLabel: document.getElementById("evalModalPushLabel"),
  evalModalSitLabel: document.getElementById("evalModalSitLabel"),
  evalModalSqLabel: document.getElementById("evalModalSqLabel"),
  totalPushLabel: document.getElementById("totalPushLabel"),
  totalSitLabel: document.getElementById("totalSitLabel"),
  totalSquatLabel: document.getElementById("totalSquatLabel"),
  autoWorkoutNote: document.getElementById("autoWorkoutNote"),
  notifyBtn: document.getElementById("notifyBtn"),
  hudParticles: document.getElementById("hudParticles"),

  swipeHint: document.getElementById("swipeHint"),
  dailyMotivation: document.getElementById("dailyMotivation"),
  bottomNav: document.getElementById("bottomNav"),
  navSystemBtn: document.getElementById("navSystemBtn"),
  navProgressBtn: document.getElementById("navProgressBtn"),
  navWorkoutsBtn: document.getElementById("navWorkoutsBtn"),
  navAchievementsBtn: document.getElementById("navAchievementsBtn"),

  systemTab: document.getElementById("systemTab"),
  progressTab: document.getElementById("progressTab"),
  workoutsTab: document.getElementById("workoutsTab"),
  achievementsTab: document.getElementById("achievementsTab"),

  playerHeader: document.getElementById("playerHeader"),
  playerTitleLine: document.getElementById("playerTitleLine"),
  titleEquipRow: document.getElementById("titleEquipRow"),
  titleSelect: document.getElementById("titleSelect"),
  levelText: document.getElementById("levelText"),
  rankText: document.getElementById("rankText"),
  streakText: document.getElementById("streakText"),
  xpFill: document.getElementById("xpFill"),
  xpText: document.getElementById("xpText"),

  statStrength: document.getElementById("statStrength"),
  statEndurance: document.getElementById("statEndurance"),
  statSpeed: document.getElementById("statSpeed"),
  statDiscipline: document.getElementById("statDiscipline"),

  questPanel: document.getElementById("questPanel"),
  questDate: document.getElementById("questDate"),
  questDoubleBadge: document.getElementById("questDoubleBadge"),
  questTasks: document.getElementById("questTasks"),
  questRewards: document.getElementById("questRewards"),
  questProgressHint: document.getElementById("questProgressHint"),
  penaltyWarning: document.getElementById("penaltyWarning"),
  completeQuestBtn: document.getElementById("completeQuestBtn"),

  weightInput: document.getElementById("weightInput"),
  logWeightBtn: document.getElementById("logWeightBtn"),
  weightLatest: document.getElementById("weightLatest"),
  weightHistory: document.getElementById("weightHistory"),
  weightChart: document.getElementById("weightChart"),

  totalPushups: document.getElementById("totalPushups"),
  totalSitups: document.getElementById("totalSitups"),
  totalSquats: document.getElementById("totalSquats"),
  totalRunning: document.getElementById("totalRunning"),
  workoutHistoryList: document.getElementById("workoutHistoryList"),
  achievementProgressList: document.getElementById("achievementProgressList"),

  rankEvalBlock: document.getElementById("rankEvalBlock"),
  rankEvalHint: document.getElementById("rankEvalHint"),
  rankEvalLevelWarn: document.getElementById("rankEvalLevelWarn"),
  rankEvalBtn: document.getElementById("rankEvalBtn"),

  systemModal: document.getElementById("systemModal"),
  modalTitle: document.getElementById("modalTitle"),
  modalBody: document.getElementById("modalBody"),
  closeModalBtn: document.getElementById("closeModalBtn"),

  rankEvalModal: document.getElementById("rankEvalModal"),
  evalModalPush: document.getElementById("evalModalPush"),
  evalModalSit: document.getElementById("evalModalSit"),
  evalModalSq: document.getElementById("evalModalSq"),
  rankEvalCancelBtn: document.getElementById("rankEvalCancelBtn"),
  rankEvalSubmitBtn: document.getElementById("rankEvalSubmitBtn"),

  rankMissionsList: document.getElementById("rankMissionsList"),
  rankLadderTabs: document.getElementById("rankLadderTabs"),
  rankLadder: document.getElementById("rankLadder"),
  rankMissionsTabs: document.getElementById("rankMissionsTabs"),
  missionQuestBlock: document.getElementById("missionQuestBlock"),
  missionQuestTitle: document.getElementById("missionQuestTitle"),
  missionQuestTasks: document.getElementById("missionQuestTasks"),
  missionQuestRewards: document.getElementById("missionQuestRewards"),
  missionQuestProgressHint: document.getElementById("missionQuestProgressHint"),
  completeMissionQuestBtn: document.getElementById("completeMissionQuestBtn"),
  questPanelTitle: document.getElementById("questPanelTitle"),
};

let touchStartX = 0;
let touchStartY = 0;

function isNativeCapacitorApp() {
  const c = window.Capacitor;
  return Boolean(c && typeof c.isNativePlatform === "function" && c.isNativePlatform());
}

function isStandaloneDisplay() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.navigator.standalone === true
  );
}

function isIosSafari() {
  const ua = navigator.userAgent || "";
  return /iPhone|iPad|iPod/i.test(ua) && !/CriOS|FxiOS|EdgiOS/i.test(ua);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js", { scope: "./" })
      .catch((err) => console.warn("Service worker registration failed", err));
  });
}

function updateOfflineBanner() {
  const banner = document.getElementById("offlineBanner");
  if (!banner) return;
  banner.classList.toggle("hidden", navigator.onLine);
}

function maybeShowInstallHint() {
  if (isNativeCapacitorApp() || isStandaloneDisplay()) return;
  const dismissed = localStorage.getItem("solofit_install_hint_dismissed") === "1";
  if (dismissed) return;
  if (!isIosSafari()) return;
  const hint = document.getElementById("installHint");
  if (hint) hint.classList.remove("hidden");
}

function bindPwaChrome() {
  const dismiss = document.getElementById("installHintDismiss");
  if (dismiss) {
    dismiss.addEventListener("click", () => {
      localStorage.setItem("solofit_install_hint_dismissed", "1");
      document.getElementById("installHint")?.classList.add("hidden");
    });
  }
  updateOfflineBanner();
  window.addEventListener("online", updateOfflineBanner);
  window.addEventListener("offline", updateOfflineBanner);
}

let setupStep = 0;
let state = loadState();

function hasActiveProfile() {
  return Boolean(state.profile?.name?.trim());
}

function bootstrap() {
  registerServiceWorker();
  bindPwaChrome();
  maybeShowInstallHint();
  try {
    init();
  } catch (error) {
    console.error("Init failed; enabling setup fallback.", error);
    bindSetupEvents();
    showSetupStep(0);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}

function init() {
  bindEvents();
  initVisualFx();
  initSwipeNavigation();
  showSetupStep(0);
  processDayTurnover();
  ensureQuestForToday();
  refreshUI();
  runTitleUnlockOnLoad();
  ensureDailyReminder();
}

function bindSetupEvents() {
  if (el.profileSetup) {
    el.profileSetup.addEventListener("click", onProfileSetupClick);
  }
  if (el.playerName) {
    el.playerName.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onSetupNextName();
      }
    });
  }
  if (el.createProfileBtn) el.createProfileBtn.addEventListener("click", createProfile);
}

function bindEvents() {
  bindSetupEvents();
  if (el.completeQuestBtn) el.completeQuestBtn.addEventListener("click", completeQuest);
  if (el.logWeightBtn) el.logWeightBtn.addEventListener("click", logWeight);
  if (el.closeModalBtn) {
    el.closeModalBtn.addEventListener("click", () => el.systemModal.classList.add("hidden"));
  }
  if (el.notifyBtn) el.notifyBtn.addEventListener("click", requestNotificationPermission);

  if (el.rankEvalBtn) el.rankEvalBtn.addEventListener("click", openRankEvalModal);
  if (el.rankEvalCancelBtn) el.rankEvalCancelBtn.addEventListener("click", closeRankEvalModal);
  if (el.rankEvalSubmitBtn) el.rankEvalSubmitBtn.addEventListener("click", submitRankReevaluation);

  if (el.titleSelect) {
    el.titleSelect.addEventListener("change", () => {
      const v = el.titleSelect.value;
      state.equippedTitleId = v || null;
      saveState();
      updateEquippedTitleLine();
    });
  }

  if (el.navSystemBtn) el.navSystemBtn.addEventListener("click", () => setActiveTab("system"));
  if (el.navProgressBtn) el.navProgressBtn.addEventListener("click", () => setActiveTab("progress"));
  if (el.navWorkoutsBtn) el.navWorkoutsBtn.addEventListener("click", () => setActiveTab("workouts"));
  if (el.navAchievementsBtn) el.navAchievementsBtn.addEventListener("click", () => setActiveTab("achievements"));

  if (el.questPanel) {
    el.questPanel.addEventListener("click", onQuestPanelClick);
  }
  if (el.rankLadderTabs) el.rankLadderTabs.addEventListener("click", onRankLadderTabClick);
  if (el.rankMissionsTabs) el.rankMissionsTabs.addEventListener("click", onRankMissionsTabClick);
  if (el.rankMissionsList) {
    el.rankMissionsList.addEventListener("click", onRankMissionsListClick);
  }
  if (el.completeMissionQuestBtn) {
    el.completeMissionQuestBtn.addEventListener("click", completeMissionQuest);
  }
}

function defaultState() {
  return {
    profile: null,
    level: 1,
    xp: 0,
    streak: 0,
    rank: "E",
    stats: { strength: 1, endurance: 1, speed: 1, discipline: 1 },
    dailyQuest: null,
    missionQuest: null,
    weightHistory: [],
    workoutHistory: [],
    workoutTotals: { pushups: 0, situps: 0, squats: 0, runningKm: 0 },
    unlockedTitles: [],
    equippedTitleId: null,
    rankMissionsCompleted: {},
    pbPushupsDayEver: 0,
    pbSitupsDayEver: 0,
    pbSquatsDayEver: 0,
    unlockedAchievements: [],
    completedQuestDays: 0,
    completedDoubleDailyQuest: false,
    penaltyPending: false,
    alertsEnabled: false,
    activeTab: "system",
    lastActiveDate: dayKey(new Date()),
    lastRankUpAvailablePopupKey: "",
    rankLadderTab: null,
    rankMissionsTab: null,
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const base = defaultState();
    const merged = {
      ...base,
      ...parsed,
      stats: { ...base.stats, ...(parsed.stats || {}) },
      workoutTotals: { ...base.workoutTotals, ...(parsed.workoutTotals || {}) },
      weightHistory: Array.isArray(parsed.weightHistory) ? parsed.weightHistory : [],
      workoutHistory: Array.isArray(parsed.workoutHistory) ? parsed.workoutHistory : [],
      unlockedAchievements: Array.isArray(parsed.unlockedAchievements) ? parsed.unlockedAchievements : [],
      unlockedTitles: Array.isArray(parsed.unlockedTitles) ? parsed.unlockedTitles : [],
      equippedTitleId:
        typeof parsed.equippedTitleId === "string" && parsed.equippedTitleId
          ? parsed.equippedTitleId
          : null,
      rankMissionsCompleted:
        parsed.rankMissionsCompleted && typeof parsed.rankMissionsCompleted === "object"
          ? { ...base.rankMissionsCompleted, ...parsed.rankMissionsCompleted }
          : { ...base.rankMissionsCompleted },
      pbPushupsDayEver: typeof parsed.pbPushupsDayEver === "number" ? parsed.pbPushupsDayEver : base.pbPushupsDayEver,
      pbSitupsDayEver: typeof parsed.pbSitupsDayEver === "number" ? parsed.pbSitupsDayEver : base.pbSitupsDayEver,
      pbSquatsDayEver: typeof parsed.pbSquatsDayEver === "number" ? parsed.pbSquatsDayEver : base.pbSquatsDayEver,
    };
    if (parsed.profile && typeof parsed.profile === "object") {
      const profileName = String(parsed.profile.name || "").trim();
      if (profileName) {
        merged.profile = {
          name: profileName,
          lastEval: parsed.profile.lastEval || null,
          workoutMode: normalizeWorkoutMode(parsed.profile.workoutMode),
        };
      } else {
        merged.profile = null;
      }
    }
    if (merged.equippedTitleId && !merged.unlockedTitles.includes(merged.equippedTitleId)) {
      merged.equippedTitleId = null;
    }
    if (typeof merged.completedDoubleDailyQuest !== "boolean") {
      merged.completedDoubleDailyQuest = Boolean(merged.completedDoubleDailyQuest);
    }
    if (merged.missionQuest && typeof merged.missionQuest !== "object") {
      merged.missionQuest = null;
    }
    merged.rank = normalizeSavedRank(merged.rank);
    const validRankTabIds = new Set(RANK_LADDER_TABS.map((t) => t.id));
    if (!validRankTabIds.has(merged.rankLadderTab)) merged.rankLadderTab = null;
    if (!validRankTabIds.has(merged.rankMissionsTab)) merged.rankMissionsTab = null;
    merged.rankMissionsCompleted = migrateRankMissionsCompleted(merged.rankMissionsCompleted || {});
    if (merged.missionQuest?.missionId) {
      const validIds = new Set(RANK_MISSION_DEFS.map((m) => m.id));
      if (!validIds.has(merged.missionQuest.missionId)) merged.missionQuest = null;
    }
    return merged;
  } catch (error) {
    console.error("Failed to load state", error);
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function evalScore(pushups, situps, squats) {
  return pushups + situps + squats;
}

/** Score thresholds for starting rank (+20 points per tier vs original). Never above MAX_EVAL_RANK. */
function rankFromEvalScore(score) {
  if (score <= 60) return "E";
  if (score <= 100) return "D";
  if (score <= 150) return "C";
  if (score <= 210) return "B";
  if (score <= 280) return "A";
  return MAX_EVAL_RANK;
}

function normalizeSavedRank(rankId) {
  return RANK_ORDER.includes(rankId) ? rankId : "E";
}

function migrateRankMissionsCompleted(completed) {
  const m = { ...completed };
  if (m.mr_streak_30 && !m.nl_streak_30) m.nl_streak_30 = true;
  if (m.mr_quest_50 && !m.nl_quest_40) m.nl_quest_40 = true;
  if (m.mr_streak_60 && !m.mr_streak_45) m.mr_streak_45 = true;
  if (m.mr_quest_75 && !m.mr_quest_60) m.mr_quest_60 = true;
  if (m.mr_quest_75 && !m.sm_quest_75) m.sm_quest_75 = true;
  if (m.mr_streak_60 && !m.sm_streak_60) m.sm_streak_60 = true;
  delete m.nl_total_reps_300;
  delete m.nl_pb_all;
  delete m.sm_total_reps_500;
  delete m.mr_streak_60;
  delete m.mr_quest_75;
  return m;
}

function rankLadderTabForRank(rankId) {
  for (const tab of RANK_LADDER_TABS) {
    if (tab.rankIds.includes(rankId)) return tab.id;
  }
  return RANK_LADDER_TABS[0].id;
}

function rankIdsForLadderTab(tabId) {
  const tab = RANK_LADDER_TABS.find((t) => t.id === tabId);
  return tab ? [...tab.rankIds] : [...RANK_LADDER_TABS[0].rankIds];
}

function renderRankTabBar(containerEl, activeTabId) {
  if (!containerEl) return;
  containerEl.innerHTML = "";
  for (const tab of RANK_LADDER_TABS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "rank-tab";
    btn.dataset.rankTab = tab.id;
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-selected", String(tab.id === activeTabId));
    if (tab.id === activeTabId) btn.classList.add("rank-tab--active");
    btn.textContent = tab.label;
    containerEl.appendChild(btn);
  }
}

function startingLevelForEvalRank(rank) {
  const L = STARTING_LEVEL_BY_RANK[rank];
  return typeof L === "number" && L >= 1 ? L : 1;
}

/** Matches normal level-up rule: each stat equals level at equilibrium. */
function statsForStartingLevel(level) {
  const L = Math.max(1, Math.floor(level));
  return { strength: L, endurance: L, speed: L, discipline: L };
}

function parseEvalInt(raw) {
  const n = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function nextRank(rank) {
  const i = RANK_ORDER.indexOf(rank);
  if (i < 0 || i >= RANK_ORDER.length - 1) return null;
  return RANK_ORDER[i + 1];
}

function rankPromotionMissionSummary(rank) {
  const missions = RANK_MISSION_DEFS.filter((m) => m.rank === rank);
  if (!missions.length) return "";
  const mode = getWorkoutMode();
  return missions.map((m) => getMissionText(m, mode)).join(" · ");
}

function rankPromotionHint() {
  const rank = state.rank || "E";
  const next = nextRank(rank);
  if (!next) return `You hold ${formatRankDisplay(rank)}. No further promotion.`;
  const req = RANK_PROMOTION[rank];
  if (!req) return "";
  const labels = exerciseLabels(state.profile?.workoutMode);
  const missionsDone = areRankMissionsCompleteForRank(rank);
  const missionList = rankPromotionMissionSummary(rank);
  const missionNote = missionsDone
    ? " Rank missions: done."
    : missionList
      ? ` Rank missions: ${missionList}.`
      : " Rank missions: incomplete.";
  const runNote =
    typeof req.runKm === "number"
      ? `, ${req.runKm} km run in one session (max distance in workout history)`
      : "";
  const legendNote =
    rankIndex(rank) >= rankIndex(MAX_EVAL_RANK)
      ? " Legend ranks cannot be earned from baseline evaluation — missions and re-evaluation only."
      : "";
  return `Next: ${formatRankDisplay(next)} — Level ${req.level}+ and ${req.pushups} / ${req.situps} / ${req.squats} reps (${labels.push}, ${labels.sit}, ${labels.squat}, one set each)${runNote}.${missionNote}${legendNote}`;
}

/** Rank assigned from one-set screening scores (same rules as baseline evaluation). */
function rankFromScreeningScores(pushups, situps, squats) {
  return rankFromEvalScore(evalScore(pushups, situps, squats));
}

function lastScreeningRank() {
  const ev = state.profile?.lastEval;
  if (!ev) return null;
  const pu = Number(ev.pushups);
  const su = Number(ev.situps);
  const sq = Number(ev.squats);
  if (!Number.isFinite(pu) || !Number.isFinite(su) || !Number.isFinite(sq)) return null;
  return rankFromScreeningScores(pu, su, sq);
}

/** Last screening still places the hunter at their current rank (e.g. S → S). */
function lastScreeningMatchesCurrentRank() {
  const screened = lastScreeningRank();
  if (!screened) return false;
  return screened === (state.rank || "E");
}

function promotionLevelRequirementMet(rank) {
  const req = RANK_PROMOTION[rank];
  if (!req) return true;
  return state.level >= req.level;
}

function canOpenRankReevaluation() {
  const current = state.rank || "E";
  if (!nextRank(current)) return false;
  if (promotionLevelRequirementMet(current)) return true;
  if (rankIndex(current) <= rankIndex(MAX_EVAL_RANK) && lastScreeningMatchesCurrentRank()) return true;
  return false;
}

function updateRankEvalBlockUI() {
  if (!el.rankEvalBlock) return;
  const current = state.rank || "E";
  const next = nextRank(current);
  const showEval = Boolean(next);
  el.rankEvalBlock.classList.toggle("hidden", !showEval);
  if (!showEval) return;

  const req = RANK_PROMOTION[current];
  const levelOk = promotionLevelRequirementMet(current);
  const screeningMatches = lastScreeningMatchesCurrentRank();
  const canOpen = canOpenRankReevaluation();

  if (el.rankEvalHint) el.rankEvalHint.textContent = rankPromotionHint();

  if (el.rankEvalLevelWarn && req) {
    if (!levelOk && !canOpen) {
      el.rankEvalLevelWarn.textContent = `Rank re-evaluation is locked until Level ${req.level} (you are Level ${state.level}).`;
      el.rankEvalLevelWarn.classList.remove("hidden");
    } else if (!levelOk && screeningMatches) {
      el.rankEvalLevelWarn.textContent = `You can update your screening. Promotion to ${formatRankDisplay(next)} stays locked until Level ${req.level} (you are Level ${state.level}).`;
      el.rankEvalLevelWarn.classList.remove("hidden");
    } else {
      el.rankEvalLevelWarn.classList.add("hidden");
    }
  }

  if (el.rankEvalBtn) {
    el.rankEvalBtn.disabled = !canOpen;
    el.rankEvalBtn.setAttribute("aria-disabled", String(!canOpen));
    el.rankEvalBtn.title = canOpen
      ? ""
      : req
        ? `Locked until Level ${req.level}`
        : "Rank re-evaluation unavailable";
  }
}

function getSetupWorkoutMode() {
  const picked = document.querySelector('input[name="workoutMode"]:checked');
  return normalizeWorkoutMode(picked?.value);
}

function showSetupStep(step) {
  const n = Number(step);
  if (!Number.isFinite(n) || n < 0 || n > 2) return;
  setupStep = n;
  const stepName = el.setupStepName || document.getElementById("setupStepName");
  const stepWorkout = el.setupStepWorkout || document.getElementById("setupStepWorkout");
  const stepEval = el.setupStepEval || document.getElementById("setupStepEval");
  if (stepName) stepName.classList.toggle("hidden", n !== 0);
  if (stepWorkout) stepWorkout.classList.toggle("hidden", n !== 1);
  if (stepEval) stepEval.classList.toggle("hidden", n !== 2);
  if (el.profileSetup) el.profileSetup.dataset.setupStep = String(n);
  if (n === 2) updateSetupEvalLabels(getSetupWorkoutMode());
}

function updateSetupEvalLabels(mode) {
  const labels = exerciseLabels(mode);
  if (el.initPushLabel) el.initPushLabel.textContent = `Max ${labels.push.toLowerCase()} (1 set)`;
  if (el.initSitLabel) el.initSitLabel.textContent = `Max ${labels.sit.toLowerCase()} (1 set)`;
  if (el.initSquatLabel) el.initSquatLabel.textContent = `Max ${labels.squat.toLowerCase()} (1 set)`;
  if (el.setupEvalIntro) {
    el.setupEvalIntro.innerHTML =
      `Enter how many <strong>${labels.push.toLowerCase()}</strong>, <strong>${labels.sit.toLowerCase()}</strong>, and <strong>${labels.squat.toLowerCase()}</strong> you can do in one set. Score = sum of all three (1 point each). Your <strong>starting rank</strong> is assigned from that score (hunter ranks <strong>E through S</strong> only). National Level and above require progression, rank missions, and re-evaluation.`;
  }
}

function applyExerciseLabelsToUI(mode) {
  const labels = exerciseLabels(mode);
  if (el.totalPushLabel) el.totalPushLabel.textContent = labels.push;
  if (el.totalSitLabel) el.totalSitLabel.textContent = labels.sit;
  if (el.totalSquatLabel) el.totalSquatLabel.textContent = labels.squat;
  if (el.evalModalPushLabel) el.evalModalPushLabel.textContent = labels.push;
  if (el.evalModalSitLabel) el.evalModalSitLabel.textContent = labels.sit;
  if (el.evalModalSqLabel) el.evalModalSqLabel.textContent = labels.squat;
  if (el.autoWorkoutNote) {
    el.autoWorkoutNote.innerHTML = `Workouts are logged automatically when you tap <strong>Complete daily quest</strong> on the System tab (${labels.push.toLowerCase()}, ${labels.sit.toLowerCase()}, ${labels.squat.toLowerCase()}, run).`;
  }
}

function isProfileSetupVisible() {
  return Boolean(el.profileSetup && !el.profileSetup.classList.contains("hidden"));
}

function handleSetupAction(action) {
  if (!action || hasActiveProfile() || !isProfileSetupVisible()) return;
  if (action === "next-name") onSetupNextName();
  else if (action === "next-workout") onSetupNextWorkout();
  else if (action === "back-workout") showSetupStep(0);
  else if (action === "back-eval") showSetupStep(1);
}

function onProfileSetupClick(e) {
  const btn = e.target.closest("[data-setup-action]");
  if (!btn) return;
  handleSetupAction(btn.getAttribute("data-setup-action"));
}

function onSetupNextName() {
  const name = el.playerName?.value.trim();
  if (!name) {
    showModal("Name required", "Enter your hunter name, then tap Next.");
    return;
  }
  showSetupStep(1);
}

function onSetupNextWorkout() {
  showSetupStep(2);
}

function entryDateKeyFromEntry(e) {
  if (e.dateKey && /^\d{4}-\d{2}-\d{2}$/.test(e.dateKey)) return e.dateKey;
  if (e.date && typeof e.date === "string") {
    const m = e.date.match(/(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  return dayKey(new Date());
}

function aggregateWorkoutsByDay() {
  const push = {};
  const sit = {};
  const sq = {};
  for (const e of state.workoutHistory || []) {
    const dk = e.dateKey || entryDateKeyFromEntry(e);
    if (!dk) continue;
    if (e.type === "pushups") push[dk] = (push[dk] || 0) + (e.reps || 0);
    if (e.type === "situps") sit[dk] = (sit[dk] || 0) + (e.reps || 0);
    if (e.type === "squats") sq[dk] = (sq[dk] || 0) + (e.reps || 0);
  }
  return { push, sit, sq };
}

function maxNumericValues(obj) {
  let m = 0;
  for (const v of Object.values(obj)) {
    if (typeof v === "number" && v > m) m = v;
  }
  return m;
}

function maxRunSingleSessionKmFromHistory() {
  let m = 0;
  for (const e of state.workoutHistory || []) {
    if (e.type === "running" && typeof e.distance === "number") m = Math.max(m, e.distance);
  }
  return m;
}

function computeMissionDerived() {
  const prevP = state.pbPushupsDayEver ?? 0;
  const prevS = state.pbSitupsDayEver ?? 0;
  const prevQ = state.pbSquatsDayEver ?? 0;
  const { push, sit, sq } = aggregateWorkoutsByDay();
  let maxPush = 0;
  const dayKeys = new Set([...Object.keys(push), ...Object.keys(sit), ...Object.keys(sq)]);
  for (const v of Object.values(push)) maxPush = Math.max(maxPush, v);
  const maxSit = maxNumericValues(sit);
  const maxSq = maxNumericValues(sq);
  let maxTotalReps = 0;
  for (const dk of dayKeys) {
    const total = (push[dk] || 0) + (sit[dk] || 0) + (sq[dk] || 0);
    maxTotalReps = Math.max(maxTotalReps, total);
  }
  const evalSit = Number(state.profile?.lastEval?.situps);
  const maxSitOneSet = Number.isFinite(evalSit) ? Math.max(maxSit, evalSit) : maxSit;
  const improvedSitOrSq = maxSit > prevS || maxSq > prevQ;
  const improvedAll = maxPush > prevP && maxSit > prevS && maxSq > prevQ;
  state.pbPushupsDayEver = Math.max(prevP, maxPush);
  state.pbSitupsDayEver = maxSit;
  state.pbSquatsDayEver = maxSq;
  return {
    maxPushupsInDay: maxPush,
    maxRunSingleSessionKm: maxRunSingleSessionKmFromHistory(),
    personalBestImprovedSitupsOrSquats: improvedSitOrSq,
    personalBestImprovedAll: improvedAll,
    maxSitupsInDay: maxSit,
    maxSquatsInDay: maxSq,
    maxTotalRepsInDay: maxTotalReps,
    maxSitupsOneSet: maxSitOneSet,
    prevSitupsBeforeUpdate: prevS,
    prevSquatsBeforeUpdate: prevQ,
  };
}

function areRankMissionsCompleteForRank(rank) {
  const done = state.rankMissionsCompleted || {};
  const need = RANK_MISSION_DEFS.filter((m) => m.rank === rank);
  if (!need.length) return true;
  return need.every((m) => done[m.id]);
}

function processRankMissionProgress(options = {}) {
  const silent = options.silent === true;
  if (!state.profile) return [];
  const mode = getWorkoutMode();
  const d = computeMissionDerived();
  const done = { ...(state.rankMissionsCompleted || {}) };
  const newly = [];
  for (const m of RANK_MISSION_DEFS) {
    if (done[m.id]) continue;
    if (state.rank !== m.rank) continue;
    if (m.check(state, d)) {
      done[m.id] = true;
      newly.push({ ...m, text: getMissionText(m, mode) });
    }
  }
  state.rankMissionsCompleted = done;
  if (newly.length && !silent) {
    showModal(
      "Rank mission complete",
      `${newly.map((x) => `• ${x.text}`).join("\n")}\n\nProgress saved for rank re-evaluation.`
    );
  }
  return newly;
}

function onRankMissionsListClick(e) {
  const btn = e.target.closest("[data-start-mission]");
  if (!btn) return;
  const missionId = btn.getAttribute("data-start-mission");
  if (!missionId) return;
  startMissionQuest(missionId);
}

function startMissionQuest(missionId) {
  if (!state.profile) return;
  const mission = RANK_MISSION_DEFS.find((m) => m.id === missionId);
  if (!mission || !canStartMissionQuest(mission)) return;
  const done = state.rankMissionsCompleted || {};
  if (done[missionId]) {
    showModal("Mission complete", "This rank mission is already complete.");
    return;
  }
  if (state.rank !== mission.rank) {
    showModal("Locked", `Complete missions for ${formatRankDisplay(state.rank)} first.`);
    return;
  }
  const quest = buildMissionQuest(missionId);
  if (!quest) {
    showModal("System", "Could not start this mission quest.");
    return;
  }
  state.missionQuest = quest;
  saveState();
  refreshUI({ skipProcessRankMissions: true });
  setActiveTab("system");
  showModal("Rank mission quest", `${quest.title}\n\nLog reps or distance in the quest panel, then complete the mission quest.`);
}

function onRankLadderTabClick(e) {
  const btn = e.target.closest("[data-rank-tab]");
  if (!btn || !el.rankLadderTabs?.contains(btn)) return;
  state.rankLadderTab = btn.dataset.rankTab;
  saveState();
  renderRankLadder();
}

function onRankMissionsTabClick(e) {
  const btn = e.target.closest("[data-rank-tab]");
  if (!btn || !el.rankMissionsTabs?.contains(btn)) return;
  state.rankMissionsTab = btn.dataset.rankTab;
  saveState();
  renderRankMissions();
}

function renderRankMissions() {
  if (!el.rankMissionsList) return;
  const playerRank = state.rank || "E";
  const playerIdx = rankIndex(playerRank);
  const activeTabId = state.rankMissionsTab || rankLadderTabForRank(playerRank);
  const tabRankIds = new Set(rankIdsForLadderTab(activeTabId));
  renderRankTabBar(el.rankMissionsTabs, activeTabId);
  const done = state.rankMissionsCompleted || {};
  const mode = getWorkoutMode();
  const activeMissionId = state.missionQuest?.missionId;
  el.rankMissionsList.innerHTML = "";

  for (const m of RANK_MISSION_DEFS) {
    if (!tabRankIds.has(m.rank)) continue;
    const li = document.createElement("li");
    li.className = "rank-mission-item";
    const missionIdx = rankIndex(m.rank);
    const locked = playerIdx < missionIdx;
    const isCurrent = playerRank === m.rank;
    const isDone = Boolean(done[m.id]);
    const badge = getRankDef(m.rank)?.shortLabel || m.rank;
    const text = getMissionText(m, mode);
    const otherQuestActive =
      state.missionQuest && !state.missionQuest.completed && state.missionQuest.missionId !== m.id;
    const showStart =
      canStartMissionQuest(m) && isCurrent && !isDone && !locked && !otherQuestActive;
    const isActive = activeMissionId === m.id && state.missionQuest && !state.missionQuest.completed;

    if (locked) {
      li.classList.add("rank-mission-item--locked");
      li.innerHTML = `<span class="rank-mission-badge">${badge}</span><span class="rank-mission-text">${text}</span><span class="rank-mission-status muted">Locked (${formatRankDisplay(m.rank)})</span>`;
    } else if (!isCurrent) {
      li.classList.toggle("rank-mission-item--done", isDone);
      li.innerHTML = `<span class="rank-mission-badge">${badge}</span><span class="rank-mission-text">${text}</span><span class="rank-mission-status muted">${isDone ? "Complete" : "—"}</span>`;
    } else {
      li.classList.toggle("rank-mission-item--done", isDone);
      li.classList.toggle("rank-mission-item--active", isActive);
      const startBtn = showStart
        ? `<button type="button" class="btn small rank-mission-start" data-start-mission="${m.id}">${isActive ? "Quest active" : "Start quest"}</button>`
        : "";
      li.innerHTML = `<span class="rank-mission-badge">${badge}</span><span class="rank-mission-text">${text}</span><span class="rank-mission-status">${isDone ? "Complete" : "Incomplete"}</span>${startBtn}`;
    }
    el.rankMissionsList.appendChild(li);
  }
}

function renderRankLadder() {
  if (!el.rankLadder) return;
  const current = state.rank || "E";
  const curIdx = rankIndex(current);
  const activeTabId = state.rankLadderTab || rankLadderTabForRank(current);
  renderRankTabBar(el.rankLadderTabs, activeTabId);
  el.rankLadder.innerHTML = "";

  const grid = document.createElement("div");
  grid.className = "rank-ladder-grid";
  grid.setAttribute("role", "list");

  for (const rankId of rankIdsForLadderTab(activeTabId)) {
    const def = getRankDef(rankId);
    if (!def) continue;
    const idx = rankIndex(def.id);
    const card = document.createElement("article");
    card.className = "rank-ladder-card";
    card.setAttribute("role", "listitem");
    if (def.id === current) card.classList.add("rank-ladder-card--current");
    else if (idx < curIdx) card.classList.add("rank-ladder-card--achieved");
    else card.classList.add("rank-ladder-card--locked");
    card.innerHTML = `
      <span class="rank-ladder-card__code">${def.shortLabel}</span>
      <span class="rank-ladder-card__name">${def.name}</span>
    `;
    grid.appendChild(card);
  }
  el.rankLadder.appendChild(grid);
}

function createProfile() {
  const name = el.playerName.value.trim();
  if (!name) {
    showModal("Profile Incomplete", "Enter your hunter name to initialize The System.");
    return;
  }
  const workoutMode = getSetupWorkoutMode();
  const labels = exerciseLabels(workoutMode);
  const pu = parseEvalInt(el.initPushups?.value ?? "");
  const su = parseEvalInt(el.initSitups?.value ?? "");
  const sq = parseEvalInt(el.initSquats?.value ?? "");
  if (pu === null || su === null || sq === null) {
    showModal(
      "Evaluation Incomplete",
      `Enter how many ${labels.push.toLowerCase()}, ${labels.sit.toLowerCase()}, and ${labels.squat.toLowerCase()} you can do in one set (whole numbers ≥ 0).`
    );
    return;
  }

  const score = evalScore(pu, su, sq);
  const rank = rankFromEvalScore(score);
  const startLevel = startingLevelForEvalRank(rank);
  const today = dayKey(new Date());
  state.profile = {
    name,
    workoutMode,
    lastEval: { pushups: pu, situps: su, squats: sq, score, date: today },
  };
  state.rank = rank;
  state.level = startLevel;
  state.xp = 0;
  state.stats = statsForStartingLevel(startLevel);
  state.pbPushupsDayEver = pu;
  state.pbSitupsDayEver = su;
  state.pbSquatsDayEver = sq;
  state.lastActiveDate = today;
  ensureQuestForToday();
  saveState();
  refreshUI();
  showModal(
    "System Initialized",
    `${name}, evaluation score ${score.toFixed(1)}. Starting rank: ${formatRankDisplay(rank)} (evaluation assigns up to ${formatRankDisplay(MAX_EVAL_RANK)} only). Your journey begins at Level ${startLevel}.`
  );
}

function dayKey(date) {
  return date.toISOString().slice(0, 10);
}

function hashDayKey(key) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function dailyMotivationForToday() {
  const idx = hashDayKey(dayKey(new Date())) % DAILY_MOTIVATIONS.length;
  return DAILY_MOTIVATIONS[idx];
}

function updateDailyMotivation() {
  if (!el.dailyMotivation) return;
  el.dailyMotivation.textContent = dailyMotivationForToday();
}

function processDayTurnover() {
  const today = dayKey(new Date());
  const last = state.lastActiveDate;
  if (!last || last === today) return;

  const missedQuest = Boolean(state.profile && state.dailyQuest && !state.dailyQuest.completed && last !== today);
  if (missedQuest) {
    state.penaltyPending = true;
    state.streak = 0;
    const xpLost = applyMissedQuestXpPenalty();
    applyMissedQuestStatPenalty();
    saveState();
    setTimeout(() => {
      showModal(
        "Penalty — Daily Quest Failed",
        `You did not complete the daily quest before the day ended. Streak reset. Lost ${xpLost} XP. All stats −1 (minimum 1). Today's quest includes extra penalty reps until you clear it.`
      );
    }, 450);
  }
  state.lastActiveDate = today;
}

function applyMissedQuestXpPenalty() {
  const need = xpToNextLevel(state.level);
  const loss = Math.max(25, Math.floor(need * 0.22));
  const before = state.xp;
  const deducted = Math.min(loss, before);
  state.xp = before - deducted;
  return deducted;
}

function applyMissedQuestStatPenalty() {
  STAT_KEYS.forEach((key) => {
    state.stats[key] = Math.max(1, state.stats[key] - 1);
  });
}

function ensureQuestForToday() {
  const today = dayKey(new Date());
  const wantDouble = false;
  if (!state.dailyQuest || state.dailyQuest.date !== today) {
    state.dailyQuest = buildDailyQuest(state.penaltyPending, wantDouble);
    state.dailyQuest.date = today;
    state.dailyQuest.completed = false;
    notifySystem("System Alert: Daily Quest Available", "Your fixed daily quest is waiting.");
    saveState();
  } else if (!state.dailyQuest.completed && Boolean(state.dailyQuest.isDouble) !== wantDouble) {
    state.dailyQuest = buildDailyQuest(state.penaltyPending, wantDouble);
    state.dailyQuest.date = today;
    state.dailyQuest.completed = false;
    saveState();
  }
  migrateDailyQuestProgressIfNeeded();
}

function buildDailyQuest(withPenalty, doubleMode) {
  const repMult = doubleMode ? 2 : 1;
  const mode = state.profile?.workoutMode || WORKOUT_MODE_CLASSIC;
  const tasks = getDailyFixedQuest(mode).map((task) => {
    const t = { ...task };
    if (task.unit === "km" && task.type === "running") {
      t.target = task.target;
    } else if (task.unit === "reps") {
      t.target = task.target * repMult;
      t.xp = task.xp * repMult;
    }
    return t;
  });
  if (withPenalty) {
    tasks.push({
      type: "penalty burpees",
      unit: "reps",
      target: 60,
      xp: 30,
      stat: "discipline",
      penalty: true,
    });
  }
  const totalXp = tasks.reduce((sum, task) => sum + task.xp, 0);
  const progress = {
    pushups: 0,
    situps: 0,
    squats: 0,
    runningKm: 0,
  };
  if (withPenalty) progress.burpees = 0;
  return { tasks, totalXp, isDouble: Boolean(doubleMode), progress };
}

function taskToProgressKey(task) {
  if (task.progressKey) return task.progressKey;
  if (task.unit === "km" && task.type === "running") return "runningKm";
  if (task.penalty && String(task.type).includes("burpee")) return "burpees";
  if (task.type === "push-ups" || task.type === "decline push-ups") return "pushups";
  if (task.type === "sit-ups" || task.type === "inverted rows") return "situps";
  if (task.type === "squats" || task.type === "bulgarian split squats") return "squats";
  return null;
}

function findTaskInQuest(quest, key) {
  if (!quest?.tasks) return null;
  return quest.tasks.find((t) => taskToProgressKey(t) === key) || null;
}

function findTaskByProgressKey(key, scope) {
  if (scope === "mission" && state.missionQuest) {
    return findTaskInQuest(state.missionQuest, key);
  }
  if (scope === "daily" && state.dailyQuest) {
    return findTaskInQuest(state.dailyQuest, key);
  }
  if (state.missionQuest && !state.missionQuest.completed) {
    const m = findTaskInQuest(state.missionQuest, key);
    if (m) return m;
  }
  if (state.dailyQuest) {
    return findTaskInQuest(state.dailyQuest, key);
  }
  return null;
}

function migrateDailyQuestProgressIfNeeded() {
  const dq = state.dailyQuest;
  if (!dq || !dq.tasks) return;
  if (!dq.progress) {
    dq.progress = { pushups: 0, situps: 0, squats: 0, runningKm: 0 };
    const hasPen = dq.tasks.some((t) => t.penalty);
    if (hasPen) dq.progress.burpees = 0;
  }
  if (dq.completed) {
    dq.tasks.forEach((task) => {
      const k = taskToProgressKey(task);
      if (k) dq.progress[k] = task.target;
    });
  }
}

function allTargetsMetForQuest(quest) {
  if (!quest?.tasks || !quest.progress) return false;
  if (quest.completeMode === "total_sum") {
    const sum =
      (quest.progress.pushups || 0) + (quest.progress.situps || 0) + (quest.progress.squats || 0);
    return sum >= (quest.totalSumTarget || 0);
  }
  if (quest.completeMode === "any") {
    return quest.tasks.some((task) => {
      const k = taskToProgressKey(task);
      if (!k) return false;
      return (quest.progress[k] ?? 0) >= task.target;
    });
  }
  return quest.tasks.every((task) => {
    const k = taskToProgressKey(task);
    if (!k) return true;
    return (quest.progress[k] ?? 0) >= task.target;
  });
}

function allQuestTargetsMet() {
  return allTargetsMetForQuest(state.dailyQuest);
}

function allMissionQuestTargetsMet() {
  return allTargetsMetForQuest(state.missionQuest);
}

function incrementQuestProgress(key, delta, scope) {
  if (!state.profile) return;
  const quest =
    scope === "mission"
      ? state.missionQuest
      : scope === "daily"
        ? state.dailyQuest
        : state.missionQuest && !state.missionQuest.completed
          ? state.missionQuest
          : state.dailyQuest;
  if (!quest || quest.completed) return;
  const task = findTaskInQuest(quest, key);
  if (!task) return;
  const cur = quest.progress[key] ?? 0;
  quest.progress[key] = Math.min(task.target, cur + delta);
  saveState();
  refreshUI({ skipProcessRankMissions: true });
}

function markQuestProgressDone(key, scope) {
  if (!state.profile) return;
  const quest =
    scope === "mission"
      ? state.missionQuest
      : scope === "daily"
        ? state.dailyQuest
        : state.missionQuest && !state.missionQuest.completed
          ? state.missionQuest
          : state.dailyQuest;
  if (!quest || quest.completed) return;
  const task = findTaskInQuest(quest, key);
  if (!task) return;
  quest.progress[key] = task.target;
  saveState();
  refreshUI({ skipProcessRankMissions: true });
}

function onQuestPanelClick(e) {
  const btn = e.target.closest("[data-quest-action]");
  if (!btn) return;
  const scope = btn.getAttribute("data-quest-scope") || "daily";
  const quest = scope === "mission" ? state.missionQuest : state.dailyQuest;
  if (!quest || quest.completed) return;
  const action = btn.getAttribute("data-quest-action");
  const key = btn.getAttribute("data-quest-key");
  if (!action || !key) return;
  if (action === "inc") {
    const step = key === "runningKm" ? 1 : QUEST_REP_INCREMENT;
    incrementQuestProgress(key, step, scope);
  } else if (action === "done") {
    markQuestProgressDone(key, scope);
  }
}

function completeQuest() {
  if (!state.profile) return;
  if (state.dailyQuest.completed) {
    showModal("Already Cleared", "Daily quest already completed.");
    return;
  }
  if (!allQuestTargetsMet()) {
    showModal(
      "Progress incomplete",
      "Log progress with +5 (reps) or +1 km (run) or Done for each exercise until every target is met, then tap Complete daily quest."
    );
    return;
  }

  state.dailyQuest.completed = true;
  state.completedQuestDays += 1;
  state.streak += 1;
  state.penaltyPending = false;
  if (state.dailyQuest.isDouble) {
    state.completedDoubleDailyQuest = true;
  }

  const bonusXp = streakBonusXp();
  grantXp(state.dailyQuest.totalXp + bonusXp);
  for (const task of state.dailyQuest.tasks) {
    state.stats[task.stat] += task.penalty ? 2 : 1;
  }

  recordQuestWorkouts(state.dailyQuest, "daily_quest");

  const newAchievements = unlockNewAchievements({ silent: true });
  const newTitles = unlockNewTitles({ silent: true });
  const newRankMissions = processRankMissionProgress({ silent: true });
  saveState();
  refreshUI({ skipProcessRankMissions: true, suppressRankUpAvailabilityPopup: true });
  playQuestCompleteFx();
  let questBody = `+${state.dailyQuest.totalXp} XP earned. Streak bonus: +${bonusXp} XP. Workout totals updated automatically.`;
  if (newAchievements.length) {
    questBody += `\n\nAchievements unlocked: ${newAchievements.join(" · ")}.`;
  }
  if (newTitles.length) {
    questBody += `\n\nTitle unlocked: ${newTitles.map((t) => t.name).join(", ")}. Equip it under your name.`;
  }
  if (newRankMissions.length) {
    questBody += `\n\nRank mission completed: ${newRankMissions.map((m) => m.text).join(" · ")}.`;
  }
  showModal("System", questBody);
  pulseHud();
}

function completeMissionQuest() {
  if (!state.profile || !state.missionQuest) return;
  if (state.missionQuest.completed) {
    showModal("Already Cleared", "Mission quest already completed.");
    return;
  }
  if (!allMissionQuestTargetsMet()) {
    const hint =
      state.missionQuest.completeMode === "any"
        ? "Beat your personal best in at least one exercise (or hit the target), then complete."
        : "Log progress until every target is met, then tap Complete mission quest.";
    showModal("Progress incomplete", hint);
    return;
  }

  state.missionQuest.completed = true;
  const xpEarned = state.missionQuest.totalXp || 25;
  recordQuestWorkouts(state.missionQuest, "rank_mission_quest");
  grantXp(xpEarned);

  const newRankMissions = processRankMissionProgress({ silent: true });
  state.missionQuest = null;
  saveState();
  refreshUI({ skipProcessRankMissions: true, suppressRankUpAvailabilityPopup: true });
  playQuestCompleteFx();

  let body = `Mission quest cleared. +${xpEarned} XP.`;
  if (newRankMissions.length) {
    body += `\n\nRank mission complete: ${newRankMissions.map((m) => m.text).join(" · ")}.`;
  }
  showModal("System", body);
  pulseHud();
}

function recordQuestWorkouts(quest, source) {
  if (!quest?.tasks || !quest.progress) return;
  const when = new Date().toLocaleString();
  const dateKey = dayKey(new Date());
  const p = quest.progress;
  const entries = [];
  for (const task of quest.tasks) {
    if (task.penalty && String(task.type).includes("burpee")) {
      continue;
    }
    const key = taskToProgressKey(task);
    if (!key) continue;
    const amount = p[key] ?? 0;
    if (amount <= 0) continue;
    if (task.unit === "km" && task.type === "running") {
      state.workoutTotals.runningKm = Number((state.workoutTotals.runningKm + amount).toFixed(2));
      entries.push({
        id: crypto.randomUUID(),
        date: when,
        dateKey,
        type: "running",
        reps: 0,
        distance: amount,
        source: "daily_quest",
      });
      continue;
    }
    if (task.type === "push-ups" || task.type === "decline push-ups") {
      state.workoutTotals.pushups += amount;
      entries.push({
        id: crypto.randomUUID(),
        date: when,
        dateKey,
        type: "pushups",
        reps: amount,
        distance: 0,
        source: "daily_quest",
      });
      continue;
    }
    if (task.type === "sit-ups" || task.type === "inverted rows") {
      state.workoutTotals.situps += amount;
      entries.push({
        id: crypto.randomUUID(),
        date: when,
        dateKey,
        type: "situps",
        reps: amount,
        distance: 0,
        source: "daily_quest",
      });
      continue;
    }
    if (task.type === "squats" || task.type === "bulgarian split squats") {
      state.workoutTotals.squats += amount;
      entries.push({
        id: crypto.randomUUID(),
        date: when,
        dateKey,
        type: "squats",
        reps: amount,
        distance: 0,
        source,
      });
    }
  }
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    state.workoutHistory.unshift(entries[i]);
  }
  state.workoutHistory = state.workoutHistory.slice(0, 100);
}

function recordDailyQuestWorkoutsFromDailyState() {
  recordQuestWorkouts(state.dailyQuest, "daily_quest");
}

function playQuestCompleteFx() {
  document.body.classList.remove("fx-quest-complete");
  void document.body.offsetWidth;
  document.body.classList.add("fx-quest-complete");
  window.setTimeout(() => document.body.classList.remove("fx-quest-complete"), 1000);
}

function streakBonusXp() {
  if (state.streak >= 30) return 100;
  if (state.streak >= 14) return 45;
  if (state.streak >= 7) return 20;
  return 0;
}

function grantXp(amount) {
  state.xp += amount;
  let leveledUp = 0;
  while (state.xp >= xpToNextLevel(state.level)) {
    state.xp -= xpToNextLevel(state.level);
    state.level += 1;
    leveledUp += 1;
    STAT_KEYS.forEach((key) => {
      state.stats[key] += 1;
    });
  }

  if (leveledUp > 0) {
    showModal("Level Up", `You gained ${leveledUp} level(s). Current: Level ${state.level}, Rank ${state.rank}.`);
  }
}

function xpToNextLevel(level) {
  return 90 + Math.floor(level * 22);
}

function openRankEvalModal() {
  if (!state.profile) return;
  if (!canOpenRankReevaluation()) {
    const current = state.rank || "E";
    const req = RANK_PROMOTION[current];
    const next = nextRank(current);
    if (req && next) {
      showModal(
        "Re-evaluation locked",
        `Rank re-evaluation is locked until Level ${req.level} (you are Level ${state.level}). Reach Level ${req.level} to re-evaluate for ${formatRankDisplay(next)}.`
      );
    }
    return;
  }
  applyExerciseLabelsToUI(state.profile.workoutMode);
  const ev = state.profile.lastEval;
  if (el.evalModalPush) el.evalModalPush.value = ev ? String(ev.pushups) : "";
  if (el.evalModalSit) el.evalModalSit.value = ev ? String(ev.situps) : "";
  if (el.evalModalSq) el.evalModalSq.value = ev ? String(ev.squats) : "";
  if (el.rankEvalModal) {
    el.rankEvalModal.classList.remove("hidden");
    el.rankEvalModal.setAttribute("aria-hidden", "false");
  }
}

function closeRankEvalModal() {
  if (el.rankEvalModal) {
    el.rankEvalModal.classList.add("hidden");
    el.rankEvalModal.setAttribute("aria-hidden", "true");
  }
}

function submitRankReevaluation() {
  if (!state.profile) return;
  const current = state.rank || "E";
  const next = nextRank(current);
  if (!next) {
    showModal("Max Rank", `You already hold ${formatRankDisplay(current)}.`);
    closeRankEvalModal();
    return;
  }
  const req = RANK_PROMOTION[current];
  if (!req) {
    closeRankEvalModal();
    return;
  }

  const pu = parseEvalInt(el.evalModalPush?.value ?? "");
  const su = parseEvalInt(el.evalModalSit?.value ?? "");
  const sq = parseEvalInt(el.evalModalSq?.value ?? "");
  const labels = exerciseLabels(state.profile.workoutMode);
  if (pu === null || su === null || sq === null) {
    showModal(
      "Invalid input",
      `Enter whole numbers (≥ 0) for ${labels.push.toLowerCase()}, ${labels.sit.toLowerCase()}, and ${labels.squat.toLowerCase()}.`
    );
    return;
  }

  if (state.level < req.level) {
    showModal(
      "Promotion locked",
      `Promotion to ${formatRankDisplay(next)} is locked until Level ${req.level} (you are Level ${state.level}). You can update your screening scores, but rank-up requires the minimum level.`
    );
    return;
  }

  if (pu < req.pushups || su < req.situps || sq < req.squats) {
    showModal(
      "Evaluation failed",
      `Threshold for ${current} → ${next}: ${req.pushups} ${labels.push.toLowerCase()}, ${req.situps} ${labels.sit.toLowerCase()}, ${req.squats} ${labels.squat.toLowerCase()}. Your result: ${pu} / ${su} / ${sq}.`
    );
    return;
  }

  if (typeof req.runKm === "number") {
    const maxRun = maxRunSingleSessionKmFromHistory();
    if (maxRun + 1e-9 < req.runKm) {
      showModal(
        "Run requirement not met",
        `Promotion ${current} → ${next} requires at least ${req.runKm} km in a single session (logged in workout history). Your longest session: ${maxRun.toFixed(2)} km.`
      );
      return;
    }
  }

  if (!areRankMissionsCompleteForRank(current)) {
    showModal(
      "Rank missions incomplete",
      `Complete every mission for Rank ${current} before re-evaluation. Check the Rank missions panel on the System tab.`
    );
    return;
  }

  const prev = state.rank;
  state.rank = next;
  const score = evalScore(pu, su, sq);
  state.profile.lastEval = {
    pushups: pu,
    situps: su,
    squats: sq,
    score,
    date: dayKey(new Date()),
  };
  state.pbPushupsDayEver = Math.max(state.pbPushupsDayEver ?? 0, pu);
  state.pbSitupsDayEver = Math.max(state.pbSitupsDayEver ?? 0, su);
  state.pbSquatsDayEver = Math.max(state.pbSquatsDayEver ?? 0, sq);
  const newAch = unlockNewAchievements({ silent: true });
  saveState();
  closeRankEvalModal();
  refreshUI({ suppressRankUpAvailabilityPopup: true });
  const achExtra = newAch.length ? `\n\nAchievement unlocked: ${newAch.join(" | ")}.` : "";
  showModal(
    "System",
    `The System confirms your performance. Rank ${prev} → ${next}. Evaluation score: ${score.toFixed(1)}.${achExtra}`
  );
  pulseHud();
}

function logWeight() {
  if (!state.profile) return;
  const value = Number(el.weightInput.value);
  if (!Number.isFinite(value) || value <= 0) {
    showModal("Invalid Weight", "Enter a valid weight in kg.");
    return;
  }

  const entry = {
    id: crypto.randomUUID(),
    date: new Date().toLocaleDateString(),
    value: Number(value.toFixed(1)),
  };
  state.weightHistory.push(entry);
  state.weightHistory = state.weightHistory.slice(-120);

  el.weightInput.value = "";
  saveState();
  refreshUI();
  pulseHud();
}

function unlockNewAchievements(options = {}) {
  const silent = options.silent === true;
  const unlocked = new Set(state.unlockedAchievements);
  const newOnes = [];
  for (const achievement of ACHIEVEMENTS) {
    if (!unlocked.has(achievement.id) && achievement.check(state)) {
      unlocked.add(achievement.id);
      newOnes.push(achievement.title);
    }
  }
  state.unlockedAchievements = [...unlocked];
  if (newOnes.length && !silent) {
    showModal("Achievement Unlocked", newOnes.join(" | "));
  }
  return newOnes;
}

function unlockNewTitles(options = {}) {
  const silent = options.silent === true;
  const unlocked = new Set(state.unlockedTitles || []);
  const newOnes = [];
  for (const title of TITLES) {
    if (!unlocked.has(title.id) && title.check(state)) {
      unlocked.add(title.id);
      newOnes.push(title);
    }
  }
  state.unlockedTitles = [...unlocked];
  if (newOnes.length && !silent) {
    const names = newOnes.map((t) => `"${t.name}"`).join(", ");
    showModal("Title unlocked", `The System grants you: ${names}. Equip it under your name.`);
  }
  return newOnes;
}

function runTitleUnlockOnLoad() {
  if (!state.profile) return;
  const newTitles = unlockNewTitles({ silent: true });
  if (newTitles.length) {
    saveState();
    renderTitleUI();
    const names = newTitles.map((t) => `"${t.name}"`).join(", ");
    showModal("Title unlocked", `The System grants you: ${names}. Equip it under your name.`);
  }
}

function renderTitleUI() {
  if (!el.titleSelect || !el.titleEquipRow) return;
  const unlocked = new Set(state.unlockedTitles || []);
  const sorted = TITLES.filter((t) => unlocked.has(t.id));
  el.titleSelect.innerHTML = "";
  const optNone = document.createElement("option");
  optNone.value = "";
  optNone.textContent = "— None —";
  el.titleSelect.appendChild(optNone);
  sorted.forEach((t) => {
    const o = document.createElement("option");
    o.value = t.id;
    o.textContent = t.name;
    el.titleSelect.appendChild(o);
  });
  const eq = state.equippedTitleId && unlocked.has(state.equippedTitleId) ? state.equippedTitleId : "";
  el.titleSelect.value = eq;
  el.titleEquipRow.classList.toggle("hidden", sorted.length === 0);
  updateEquippedTitleLine();
}

function updateEquippedTitleLine() {
  if (!el.playerTitleLine) return;
  const unlocked = new Set(state.unlockedTitles || []);
  const def = TITLES.find((t) => t.id === state.equippedTitleId);
  if (def && unlocked.has(def.id)) {
    el.playerTitleLine.textContent = def.name;
    el.playerTitleLine.classList.remove("hidden");
  } else {
    el.playerTitleLine.textContent = "";
    el.playerTitleLine.classList.add("hidden");
  }
}

function achievementProgressMeta(achievement, s) {
  const unlocked = s.unlockedAchievements.includes(achievement.id);
  if (unlocked) {
    return { pct: 100, line: "Unlocked", eta: "Complete" };
  }
  if (achievement.rankTarget) {
    const target = achievement.rankTarget;
    const targetIdx = RANK_ORDER.indexOf(target);
    const curIdx = RANK_ORDER.indexOf(s.rank);
    const done = curIdx >= targetIdx;
    const pct = done ? 100 : 0;
    if (done) {
      return { pct: 100, line: `Current rank: ${s.rank}`, eta: "Complete" };
    }

    const prev = RANK_ORDER[targetIdx - 1];
    const req = prev ? RANK_PROMOTION[prev] : null;
    const runNote = typeof req?.runKm === "number" ? ` and at least ${req.runKm} km in one run` : "";
    const labels = exerciseLabels(s.profile?.workoutMode);
    const eta = req
      ? `Re-evaluate ${prev} → ${target}: Level ${req.level}+ and ${req.pushups} / ${req.situps} / ${req.squats} reps (${labels.push}, ${labels.sit}, ${labels.squat}, one set each)${runNote}.`
      : `Re-evaluate to reach ${target}.`;

    return {
      pct,
      line: `Target ${target} not reached yet (current: ${s.rank}).`,
      eta,
    };
  }
  switch (achievement.id) {
    case "first_quest": {
      const pct = s.completedQuestDays >= 1 ? 100 : 0;
      return {
        pct,
        line: s.completedQuestDays >= 1 ? "Done" : "Finish any daily quest once.",
        eta: s.completedQuestDays >= 1 ? "—" : "Complete today's quest and tap “Mark Quest Complete”.",
      };
    }
    case "streak_7": {
      const pct = Math.min(100, Math.floor((s.streak / 7) * 100));
      const daysLeft = Math.max(0, 7 - s.streak);
      return {
        pct,
        line: `Streak ${s.streak} / 7`,
        eta: daysLeft === 0 ? "Finish today's quest to maintain." : `About ${daysLeft} more day(s) at max streak if you don't miss.`,
      };
    }
    case "rank_d": {
      const done = s.rank !== "E";
      const pct = done ? 100 : 0;
      return {
        pct,
        line: done ? `Current rank: ${s.rank}` : "Still Rank E",
        eta: done ? "—" : "Pass Rank re-evaluation when you meet Level 5 and the rep threshold (E→D).",
      };
    }
    case "warrior_50": {
      const need = 50;
      const str = s.stats.strength;
      const pct = Math.min(100, Math.floor((str / need) * 100));
      const left = Math.max(0, need - str);
      return {
        pct,
        line: `Strength ${str} / ${need}`,
        eta: left === 0 ? "Reach 50 STR." : `~${left} more STR (quests + logging help).`,
      };
    }
    default:
      return { pct: 0, line: "", eta: "" };
  }
}

async function requestNotificationPermission() {
  if (isNativeCapacitorApp() && getLocalNotifications()) {
    try {
      const plugin = getLocalNotifications();
      let permissions = await plugin.checkPermissions();
      if (permissions.display !== "granted") {
        permissions = await plugin.requestPermissions();
      }
      if (permissions.display === "granted") {
        state.alertsEnabled = true;
        saveState();
        await scheduleDailyReminder();
        showModal("Alerts Enabled", "Native iPhone alerts are enabled.");
      } else {
        state.alertsEnabled = false;
        saveState();
        showModal("Alerts Disabled", "iPhone notification permission was not granted.");
      }
      refreshUI();
      return;
    } catch (error) {
      console.error("Notification permission failed", error);
      showModal("Alert Error", "Could not enable native alerts. Please try again.");
      return;
    }
  }

  if (!("Notification" in window)) {
    showModal(
      "Unavailable",
      "Alerts need a supported browser. On iPhone, add SoloFit to your Home Screen first; scheduled reminders are limited on web."
    );
    return;
  }
  Notification.requestPermission().then((permission) => {
    state.alertsEnabled = permission === "granted";
    saveState();
    refreshUI();
    const pwaNote = isStandaloneDisplay()
      ? "Alerts work while SoloFit is open. iOS may not show scheduled reminders for web apps."
      : "For best results on iPhone, use Add to Home Screen, then enable alerts.";
    showModal(
      state.alertsEnabled ? "Alerts Enabled" : "Alerts Disabled",
      state.alertsEnabled ? `You will receive System alerts when the app is open. ${pwaNote}` : "Notifications remain disabled."
    );
  });
}

function getLocalNotifications() {
  return window.Capacitor?.Plugins?.LocalNotifications || null;
}

function notifySystem(title, body) {
  if (!state.alertsEnabled) return;
  const plugin = getLocalNotifications();
  if (isNativeCapacitorApp() && plugin) {
    plugin
      .schedule({
        notifications: [
          { id: Number(String(Date.now()).slice(-8)), title, body, schedule: { at: new Date(Date.now() + 1500) } },
        ],
      })
      .catch((error) => console.error("Native notify failed", error));
    return;
  }
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body });
  }
}

async function ensureDailyReminder() {
  if (!state.alertsEnabled || !isNativeCapacitorApp()) return;
  await scheduleDailyReminder();
}

async function scheduleDailyReminder() {
  const plugin = getLocalNotifications();
  if (!plugin) return;
  const permissions = await plugin.checkPermissions();
  if (permissions.display !== "granted") return;

  const nextReminder = nextReminderTime();
  await plugin.cancel({ notifications: [{ id: DAILY_REMINDER_ID }] });
  await plugin.schedule({
    notifications: [
      {
        id: DAILY_REMINDER_ID,
        title: "The System: Daily Quest",
        body: exerciseLabels(state.profile?.workoutMode).dailyReminder,
        schedule: { at: nextReminder },
      },
    ],
  });
}

function nextReminderTime() {
  const now = new Date();
  const target = new Date(now);
  target.setHours(8, 0, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  return target;
}

function refreshUI(options = {}) {
  updateDailyMotivation();
  const hasProfile = hasActiveProfile();
  el.profileSetup.classList.toggle("hidden", hasProfile);
  if (!hasProfile) showSetupStep(setupStep);
  el.appMain.classList.toggle("hidden", !hasProfile);
  el.bottomNav.classList.toggle("hidden", !hasProfile);
  el.swipeHint.classList.toggle("hidden", !hasProfile);
  el.notifyBtn.classList.toggle("hidden", state.alertsEnabled);
  document.body.classList.toggle("has-profile", hasProfile);
  document.body.dataset.rank = state.rank || "E";
  if (!hasProfile) return;

  applyExerciseLabelsToUI(state.profile.workoutMode);

  if (options.skipProcessRankMissions) {
    computeMissionDerived();
  } else {
    const nrm = processRankMissionProgress({ silent: true });
    if (nrm.length) {
      saveState();
      showModal(
        "System",
        `${nrm.map((x) => `• ${x.text}`).join("\n")}\n\nProgress saved for rank re-evaluation.`
      );
    }
  }

  updateRankEvalBlockUI();

  const neededXp = xpToNextLevel(state.level);
  const xpPercent = Math.min(100, Math.floor((state.xp / neededXp) * 100));

  el.playerHeader.textContent = state.profile.name;
  renderTitleUI();
  el.levelText.textContent = `Level ${state.level}`;
  el.rankText.textContent = formatRankDisplay(state.rank);
  el.streakText.textContent = `Streak: ${state.streak} day(s)`;
  el.xpFill.style.width = `${xpPercent}%`;
  el.xpText.textContent = `XP ${state.xp} / ${neededXp}`;

  el.statStrength.textContent = String(state.stats.strength);
  el.statEndurance.textContent = String(state.stats.endurance);
  el.statSpeed.textContent = String(state.stats.speed);
  el.statDiscipline.textContent = String(state.stats.discipline);

  renderMissionQuest();
  renderQuest();
  renderRankLadder();
  renderWeight();
  renderWorkouts();
  renderAchievementProgress();
  updateBottomNav();
  setActiveTab(state.activeTab || "system", true);
  renderRankMissions();
  if (!options.suppressRankUpAvailabilityPopup) checkRankUpAvailabilityPopup();
}

function checkRankUpAvailabilityPopup() {
  if (!state.profile) return;
  const cur = state.rank || "E";
  const next = nextRank(cur);
  if (!next) return;

  const req = RANK_PROMOTION[cur];
  if (!req) return;
  if (state.level < req.level) return;
  if (!areRankMissionsCompleteForRank(cur)) return;

  const ev = state.profile.lastEval;
  if (!ev) return;
  const evPushups = Number(ev.pushups);
  const evSitups = Number(ev.situps);
  const evSquats = Number(ev.squats);
  if (!Number.isFinite(evPushups) || !Number.isFinite(evSitups) || !Number.isFinite(evSquats)) return;
  if (evPushups < req.pushups || evSitups < req.situps || evSquats < req.squats) return;

  if (typeof req.runKm === "number") {
    const maxRun = maxRunSingleSessionKmFromHistory();
    if (maxRun + 1e-9 < req.runKm) return;
  }

  const key = `${dayKey(new Date())}|${next}`;
  if (state.lastRankUpAvailablePopupKey === key) return;
  state.lastRankUpAvailablePopupKey = key;
  saveState();

  showModal(
    "System",
    `Rank ${next} is ready. Tap “Rank re-evaluation” on the System tab to confirm your promotion.`
  );
}

function renderQuestTaskList(quest, listEl, scope, completed) {
  if (!listEl || !quest?.tasks) {
    if (listEl) listEl.innerHTML = "";
    return;
  }
  listEl.innerHTML = "";
  quest.tasks.forEach((task, i) => {
    const li = document.createElement("li");
    li.className = "quest-row quest-row--interactive";
    li.style.setProperty("--stagger", String(i));
    const key = taskToProgressKey(task);
    const p = quest.progress[key] ?? 0;
    const label = String(task.type).toUpperCase();
    const unit = task.unit === "km" ? "km" : task.unit;
    const incLabel = task.unit === "km" ? "+1 km" : `+${QUEST_REP_INCREMENT}`;

    if (completed) {
      li.innerHTML = `<div class="quest-row-main">${label} — ${p} / ${task.target} ${unit} (+${task.xp} XP)</div>`;
    } else {
      li.innerHTML = `
        <div class="quest-row-main">${label} — <strong>${p}</strong> / ${task.target} ${unit} (+${task.xp} XP)</div>
        <div class="quest-row-actions">
          <button type="button" class="btn small secondary" data-quest-action="inc" data-quest-scope="${scope}" data-quest-key="${key}">${incLabel}</button>
          <button type="button" class="btn small" data-quest-action="done" data-quest-scope="${scope}" data-quest-key="${key}">Done</button>
        </div>
      `;
    }
    if (task.penalty) {
      li.style.borderColor = "#8f2f44";
      li.style.color = "#ffb3be";
    }
    listEl.appendChild(li);
  });
}

function renderMissionQuest() {
  const mq = state.missionQuest;
  const show = Boolean(mq && !mq.completed);
  if (el.missionQuestBlock) el.missionQuestBlock.classList.toggle("hidden", !show);
  if (!show) {
    if (el.missionQuestTasks) el.missionQuestTasks.innerHTML = "";
    return;
  }
  if (el.missionQuestTitle) {
    const rankLabel = mq.missionSlot ? formatRankDisplay(mq.missionSlot) : "Rank mission";
    el.missionQuestTitle.textContent = `${rankLabel}: ${mq.title || "Rank mission"}`;
  }
  renderQuestTaskList(mq, el.missionQuestTasks, "mission", mq.completed);
  if (el.missionQuestRewards) {
    el.missionQuestRewards.textContent = `Reward: +${mq.totalXp} XP`;
  }
  const met = allMissionQuestTargetsMet();
  if (el.completeMissionQuestBtn) {
    el.completeMissionQuestBtn.disabled = mq.completed || !met;
    el.completeMissionQuestBtn.textContent = mq.completed ? "Mission quest completed" : "Complete mission quest";
  }
  if (el.missionQuestProgressHint) {
    if (mq.completed) {
      el.missionQuestProgressHint.textContent = "";
    } else if (mq.completeMode === "total_sum") {
      const sum =
        (mq.progress.pushups || 0) + (mq.progress.situps || 0) + (mq.progress.squats || 0);
      el.missionQuestProgressHint.textContent = met
        ? "Total reps target met — complete the mission quest."
        : `Log ${QUEST_REP_INCREMENT} reps across push / sit / squat (${sum} / ${mq.totalSumTarget} total).`;
    } else if (mq.completeMode === "any") {
      el.missionQuestProgressHint.textContent = met
        ? "Target met — complete the mission quest."
        : `Beat your PB on at least one exercise (${QUEST_REP_INCREMENT} reps or Done per line).`;
    } else if (!met) {
      el.missionQuestProgressHint.textContent = `Use +${QUEST_REP_INCREMENT} (reps) or +1 km (run) or Done on each line.`;
    } else {
      el.missionQuestProgressHint.textContent = "All targets met — tap Complete mission quest.";
    }
  }
}

function renderQuest() {
  if (!el.questTasks) return;

  const todayReadable = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  if (!state.dailyQuest || !state.dailyQuest.tasks) {
    el.questTasks.innerHTML = "";
    if (el.questDoubleBadge) el.questDoubleBadge.classList.add("hidden");
    if (el.questDate) el.questDate.textContent = "";
    return;
  }

  if (el.questPanelTitle) {
    el.questPanelTitle.textContent = "Daily Quest";
  }
  if (el.questDate) el.questDate.textContent = `Issued: ${todayReadable}`;
  if (el.questDoubleBadge) {
    const mode = getWorkoutMode();
    const l = exerciseLabels(mode);
    const hidden = !state.dailyQuest.isDouble;
    el.questDoubleBadge.classList.toggle("hidden", hidden);
    if (!hidden) {
      el.questDoubleBadge.textContent = `Double volume — A-rank mission (200 ${l.push.toLowerCase()} / 200 ${l.sit.toLowerCase()} / 200 ${l.squat.toLowerCase()} · 10 km run)`;
    }
  }

  renderQuestTaskList(state.dailyQuest, el.questTasks, "daily", state.dailyQuest.completed);

  el.questRewards.textContent = `Total Reward: +${state.dailyQuest.totalXp} XP`;
  el.penaltyWarning.classList.toggle("hidden", !state.penaltyPending);
  const met = allQuestTargetsMet();
  el.completeQuestBtn.disabled = state.dailyQuest.completed || !met;
  el.completeQuestBtn.textContent = state.dailyQuest.completed ? "Quest Completed" : "Complete daily quest";
  if (el.questProgressHint) {
    if (state.dailyQuest.completed) {
      el.questProgressHint.textContent = "";
    } else if (!met) {
      el.questProgressHint.textContent = `Use +${QUEST_REP_INCREMENT} (reps) or +1 km (run) or Done on each exercise until every target is met.`;
    } else {
      el.questProgressHint.textContent = "All targets met — tap Complete daily quest.";
    }
  }
}

function renderAchievementProgress() {
  el.achievementProgressList.innerHTML = "";
  const visibleRankTargets = new Set([state.rank, nextRank(state.rank)].filter(Boolean));
  const visible = ACHIEVEMENTS.filter((achievement) => {
    return achievement.rankTarget && visibleRankTargets.has(achievement.rankTarget);
  });

  if (!visible.length) {
    const li = document.createElement("li");
    li.className = "achievement-progress-item";
    li.innerHTML = `<p class="muted">No rank achievements available yet.</p>`;
    el.achievementProgressList.appendChild(li);
    return;
  }

  visible.forEach((achievement) => {
    const { pct, line, eta } = achievementProgressMeta(achievement, state);
    const li = document.createElement("li");
    li.className = "achievement-progress-item";
    li.innerHTML = `
      <div class="achievement-progress-head">
        <strong>${achievement.title}</strong>
        <span class="achievement-pct">${pct}%</span>
      </div>
      <div class="xp-bar achievement-bar"><div class="xp-fill" style="width:${pct}%"></div></div>
      <p class="muted achievement-line">${line}</p>
      <p class="muted achievement-eta">${eta}</p>
    `;
    el.achievementProgressList.appendChild(li);
  });
}

function renderWorkouts() {
  const t = state.workoutTotals;
  el.totalPushups.textContent = String(t.pushups || 0);
  el.totalSitups.textContent = String(t.situps || 0);
  el.totalSquats.textContent = String(t.squats || 0);
  el.totalRunning.textContent = `${Number((t.runningKm || 0).toFixed(2))} km`;

  const visibleHistory = state.workoutHistory.filter((e) => e.type !== "burpees");
  el.workoutHistoryList.innerHTML = "";
  if (!visibleHistory.length) {
    const li = document.createElement("li");
    li.textContent = "Complete a daily quest to log workouts automatically.";
    el.workoutHistoryList.appendChild(li);
    return;
  }
  visibleHistory.forEach((entry) => {
    const li = document.createElement("li");
    const auto = entry.source === "daily_quest" ? " · Auto" : "";
    if (entry.type === "running") {
      li.textContent = `${entry.date} · Running · ${entry.distance} km${auto}`;
    } else {
      li.textContent = `${entry.date} · ${formatWorkoutType(entry.type)} · ${entry.reps} reps${auto}`;
    }
    el.workoutHistoryList.appendChild(li);
  });
}

function formatWorkoutType(type) {
  const labels = exerciseLabels(state.profile?.workoutMode);
  if (type === "pushups") return labels.push;
  if (type === "situps") return labels.sit;
  if (type === "squats") return labels.squat;
  return type;
}

function updateBottomNav() {
  const tab = state.activeTab || "system";
  el.navSystemBtn.classList.toggle("active", tab === "system");
  el.navProgressBtn.classList.toggle("active", tab === "progress");
  el.navWorkoutsBtn.classList.toggle("active", tab === "workouts");
  el.navAchievementsBtn.classList.toggle("active", tab === "achievements");
}

function setActiveTab(tab, skipSave = false) {
  const prev = state.activeTab || "system";
  const next = TAB_ORDER.includes(tab) ? tab : "system";
  const prevIdx = TAB_ORDER.indexOf(prev);
  const nextIdx = TAB_ORDER.indexOf(next);
  const sameTab = prev === next;

  state.activeTab = next;

  el.systemTab.classList.toggle("hidden", next !== "system");
  el.progressTab.classList.toggle("hidden", next !== "progress");
  el.workoutsTab.classList.toggle("hidden", next !== "workouts");
  el.achievementsTab.classList.toggle("hidden", next !== "achievements");

  const activePanel =
    next === "system"
      ? el.systemTab
      : next === "progress"
        ? el.progressTab
        : next === "workouts"
          ? el.workoutsTab
          : el.achievementsTab;

  const tabAnimMs = 520;
  [el.systemTab, el.progressTab, el.workoutsTab, el.achievementsTab].forEach((p) =>
    p.classList.remove("tab-panel--anim-in", "tab-panel--from-next", "tab-panel--from-prev")
  );

  if (!skipSave && activePanel && !sameTab) {
    const goingForward = nextIdx > prevIdx;
    window.requestAnimationFrame(() => {
      activePanel.classList.add("tab-panel--anim-in", goingForward ? "tab-panel--from-next" : "tab-panel--from-prev");
      window.setTimeout(() => {
        activePanel.classList.remove("tab-panel--anim-in", "tab-panel--from-next", "tab-panel--from-prev");
      }, tabAnimMs);
    });
  }

  updateBottomNav();
  if (!skipSave) saveState();
}

function tabIndex() {
  const i = TAB_ORDER.indexOf(state.activeTab);
  return i < 0 ? 0 : i;
}

function initSwipeNavigation() {
  const root = el.appMain;
  if (!root) return;

  root.addEventListener(
    "touchstart",
    (e) => {
      if (!state.profile || e.touches.length !== 1) return;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    },
    { passive: true }
  );

  root.addEventListener(
    "touchend",
    (e) => {
      if (!state.profile || !e.changedTouches.length) return;
      const x = e.changedTouches[0].clientX;
      const y = e.changedTouches[0].clientY;
      const dx = x - touchStartX;
      const dy = y - touchStartY;
      if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) < Math.abs(dy)) return;

      const idx = tabIndex();
      if (dx < 0 && idx < TAB_ORDER.length - 1) {
        setActiveTab(TAB_ORDER[idx + 1]);
      } else if (dx > 0 && idx > 0) {
        setActiveTab(TAB_ORDER[idx - 1]);
      }
    },
    { passive: true }
  );
}

function renderWeight() {
  const list = state.weightHistory || [];
  el.weightHistory.innerHTML = "";

  if (!list.length) {
    el.weightLatest.textContent = "No weight entries yet.";
    const li = document.createElement("li");
    li.textContent = "No weight history yet.";
    el.weightHistory.appendChild(li);
    drawWeightChart([]);
    return;
  }

  const latest = list[list.length - 1];
  el.weightLatest.textContent = `Latest: ${latest.value} kg (${latest.date})`;

  for (let i = list.length - 1; i >= 0; i -= 1) {
    const entry = list[i];
    const li = document.createElement("li");
    li.textContent = `${entry.date} - ${entry.value} kg`;
    el.weightHistory.appendChild(li);
  }
  drawWeightChart(list.slice(-30));
}

function drawWeightChart(points) {
  const canvas = el.weightChart;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#12152a";
  ctx.fillRect(0, 0, width, height);

  if (!points.length) {
    ctx.fillStyle = "#a8acd4";
    ctx.font = "16px Inter, Arial, sans-serif";
    ctx.fillText("Add weight entries to see your graph", 24, 44);
    return;
  }

  const pad = 28;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);

  ctx.strokeStyle = "rgba(168,172,212,0.22)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i += 1) {
    const y = pad + ((height - pad * 2) / 3) * i;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(width - pad, y);
    ctx.stroke();
  }

  ctx.strokeStyle = "#7f77ff";
  ctx.lineWidth = 3;
  ctx.beginPath();
  points.forEach((point, index) => {
    const x = pad + ((width - pad * 2) * index) / Math.max(1, points.length - 1);
    const y = height - pad - ((point.value - min) / range) * (height - pad * 2);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = "#f6f7ff";
  ctx.font = "14px Inter, Arial, sans-serif";
  ctx.fillText(`Latest: ${points[points.length - 1].value.toFixed(1)} kg`, pad, 20);
}

function showModal(title, body) {
  el.modalTitle.textContent = title;
  el.modalBody.textContent = body;
  document.body.classList.remove("system-flash");
  void document.body.offsetWidth;
  document.body.classList.add("system-flash");
  if ("vibrate" in navigator) navigator.vibrate(40);
  el.systemModal.classList.remove("hidden");
  const card = el.systemModal.querySelector(".modal-card");
  if (card) {
    card.classList.remove("modal-card--pop");
    void card.offsetWidth;
    card.classList.add("modal-card--pop");
  }
}

function initVisualFx() {
  if (!el.hudParticles || el.hudParticles.childElementCount > 0) return;
  for (let i = 0; i < 18; i += 1) {
    const particle = document.createElement("span");
    particle.className = "hud-particle";
    particle.style.left = `${Math.random() * 100}%`;
    particle.style.top = `${Math.random() * 100}%`;
    particle.style.animationDelay = `${Math.random() * 6}s`;
    particle.style.animationDuration = `${5 + Math.random() * 8}s`;
    el.hudParticles.appendChild(particle);
  }
}

function pulseHud() {
  document.body.classList.remove("hud-pulse");
  void document.body.offsetWidth;
  document.body.classList.add("hud-pulse");
}

/** Inline onclick fallback for Capacitor WebView if listeners fail to attach. */
window.SoloFit = {
  setupAction(action) {
    handleSetupAction(action);
  },
};
