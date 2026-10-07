export const PHASES = [
  { key: 'precnc', label: 'Pre-CNC – Cutting & Folding', short: 'Pre-CNC', color: '#6f8396' },
  { key: 'fabrication', label: 'Fabrication', short: 'Fabrication', color: '#1f5f8b' },
  { key: 'coatings', label: 'Coatings', short: 'Coatings', color: '#b08d3c' },
  { key: 'fitout', label: 'Fit Out', short: 'Fit Out', color: '#3f7d5a' },
];

const pad = (n) => String(n).padStart(2, '0');
export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseISO = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const todayISO = () => toISO(new Date());
export const fmt = (d) =>
  d ? d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' }) : '–';
export const fmtISO = (s) => (s ? fmt(parseISO(s)) : '–');

export const isWorkday = (d) => d.getDay() !== 0 && d.getDay() !== 6;

export function nextWorkday(d) {
  const x = new Date(d);
  while (!isWorkday(x)) x.setDate(x.getDate() + 1);
  return x;
}

// Date of the nth working day, counting the start date (moved to a workday) as day 1.
export function addWorkdays(d, n) {
  const x = nextWorkday(d);
  let c = 1;
  while (c < n) {
    x.setDate(x.getDate() + 1);
    if (isWorkday(x)) c++;
  }
  return x;
}

// Hours used for scheduling: finished phases use actual hours; open phases use
// the estimate, or actual hours if they have already run over the estimate.
// A phase with 0 hours (e.g. no coating) is skipped and takes no time.
export function scheduleHours(p) {
  if (p.done) return Number(p.actual) || 0;
  return Math.max(Number(p.est) || 0, Number(p.actual) || 0);
}

export const isSkipped = (p) => scheduleHours(p) <= 0;

// Phases run back to back in working hours, so the next phase starts as soon as the
// previous one's hours run out (possibly the same day). Changing any phase's hours
// moves every later phase and the finish date.
export function scheduleBoat(boat, settings) {
  const hpd = Number(settings.hoursPerDay) || 8;
  const base = nextWorkday(parseISO(boat.startDate));
  const EPS = 1e-9;
  let offset = 0; // working hours elapsed since the start date
  let finish = base;
  const phases = {};
  for (const ph of PHASES) {
    const hrs = scheduleHours(boat.phases[ph.key]);
    if (hrs <= 0) {
      phases[ph.key] = { skipped: true, hrs: 0, days: 0 };
      continue;
    }
    const firstDay = Math.floor(offset / hpd);
    const lastDay = Math.floor((offset + hrs - EPS) / hpd);
    const start = addWorkdays(base, firstDay + 1);
    const end = addWorkdays(base, lastDay + 1);
    phases[ph.key] = { start, end, days: lastDay - firstDay + 1, hrs };
    offset += hrs;
    finish = end;
  }
  const late = boat.targetDate ? finish > parseISO(boat.targetDate) : false;
  const est = PHASES.reduce((t, ph) => t + (Number(boat.phases[ph.key].est) || 0), 0);
  const actual = PHASES.reduce((t, ph) => t + (Number(boat.phases[ph.key].actual) || 0), 0);
  const current = PHASES.find((ph) => !boat.phases[ph.key].done && !phases[ph.key].skipped);
  return { phases, finish, late, est, actual, current };
}

export function bayList(settings) {
  const rows = [];
  for (const ph of PHASES) {
    const n = Number(settings.bays[ph.key]) || 1;
    for (let i = 1; i <= n; i++) {
      rows.push({ phase: ph, bay: i, label: n > 1 ? `${ph.short} – Bay ${i}` : ph.short });
    }
  }
  return rows;
}

// Returns a Set of "boatId:phaseKey" where two boats are booked into the same bay at the same time.
export function bayConflicts(boats, scheds) {
  const clash = new Set();
  for (const ph of PHASES) {
    const items = boats
      .filter((b) => !b.phases[ph.key].done && !scheds[b.id].phases[ph.key].skipped)
      .map((b) => ({ id: b.id, bay: b.phases[ph.key].bay || 1, ...scheds[b.id].phases[ph.key] }));
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i], b = items[j];
        if (a.bay === b.bay && a.start <= b.end && b.start <= a.end) {
          clash.add(`${a.id}:${ph.key}`);
          clash.add(`${b.id}:${ph.key}`);
        }
      }
    }
  }
  return clash;
}
