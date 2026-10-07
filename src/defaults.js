import { PHASES, todayISO } from './schedule';

export const DEFAULT_MODELS = [
  { name: '360 Dinghy', hours: 40 },
  { name: '405 Dinghy', hours: 60 },
  { name: '435 Dinghy', hours: 65 },
  { name: '470 Cuddy', hours: 120 },
  { name: '520 Cuddy', hours: 150 },
  { name: '585 Hard Top', hours: 250 },
  { name: '615 Hard Top', hours: 275 },
  { name: '665 Hard Top', hours: 300 },
  { name: '740 Hard Top', hours: 350 },
  { name: '765 Hard Top', hours: 380 },
  { name: '780 Walk Around', hours: 425 },
  { name: '795 Hard Top', hours: 450 },
];

export const DEFAULT_SETTINGS = {
  hoursPerDay: 8, // productive hours per bay per working day
  bays: { precnc: 1, fabrication: 4, coatings: 1, fitout: 2 },
  split: { precnc: 10, fabrication: 45, coatings: 10, fitout: 35 }, // % of model hours per phase
};

export function estimatesFor(hours, split, existing) {
  return Object.fromEntries(
    PHASES.map((p) => [
      p.key,
      {
        actual: 0,
        done: false,
        bay: 1,
        ...(existing ? existing[p.key] : {}),
        est: Math.round((hours * (split[p.key] || 0)) / 100),
      },
    ])
  );
}

export const newId = () => Math.random().toString(36).slice(2, 10);

export function makeBoat(state) {
  const m = state.models[0];
  return {
    id: newId(),
    customer: '',
    model: m.name,
    startDate: todayISO(),
    targetDate: '',
    notes: '',
    archived: false,
    completedDate: null,
    phases: estimatesFor(m.hours, state.settings.split),
  };
}

function example(customer, modelName, start, target, bays, actuals, doneCount) {
  const m = DEFAULT_MODELS.find((x) => x.name === modelName);
  const phases = estimatesFor(m.hours, DEFAULT_SETTINGS.split);
  PHASES.forEach((p, i) => {
    phases[p.key].bay = bays[i] || 1;
    phases[p.key].actual = actuals[i] || 0;
    phases[p.key].done = i < doneCount;
  });
  return { id: newId(), customer, model: modelName, startDate: start, targetDate: target, notes: 'Example boat – delete when you add real ones', archived: false, completedDate: null, phases };
}

export const DEFAULT_STATE = {
  version: 1,
  savedAt: null,
  settings: DEFAULT_SETTINGS,
  models: DEFAULT_MODELS,
  boats: [
    example('Example – Dealer A', '585 Hard Top', '2026-09-07', '2026-11-20', [1, 1, 1, 1], [27, 118, 10, 0], 2),
    example('Example – Customer B', '470 Cuddy', '2026-09-28', '2026-11-06', [1, 2, 1, 2], [12, 30, 0, 0], 1),
    example('Example – Dealer C', '740 Hard Top', '2026-10-12', '2027-01-29', [1, 1, 1, 2], [0, 0, 0, 0], 0),
    example('Example – Customer D', '405 Dinghy', '2026-10-19', '2026-11-13', [1, 2, 1, 1], [0, 0, 0, 0], 0),
  ],
};
