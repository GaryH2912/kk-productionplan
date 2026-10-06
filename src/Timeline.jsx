import { fmt } from './schedule';

const DAY_W = 16;
const DAY_MS = 864e5;

// rows: [{ key, label, sub, badge, marker?: Date, onClick?, bars: [{ key, start, end, color, text, progress, conflict, done, title, onClick }] }]
export default function Timeline({ rows, empty = 'Nothing scheduled yet.' }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dates = [today];
  rows.forEach((r) => {
    r.bars.forEach((b) => dates.push(b.start, b.end));
    if (r.marker) dates.push(r.marker);
  });

  const min = new Date(Math.min(...dates));
  min.setDate(min.getDate() - 3);
  while (min.getDay() !== 1) min.setDate(min.getDate() - 1); // start on a Monday
  const max = new Date(Math.max(...dates));
  max.setDate(max.getDate() + 14);

  const nDays = Math.round((max - min) / DAY_MS) + 1;
  const width = nDays * DAY_W;
  const x = (d) => Math.round((d - min) / DAY_MS) * DAY_W;

  const weeks = [];
  for (let i = 0; i < nDays; i += 7) {
    const d = new Date(min);
    d.setDate(d.getDate() + i);
    weeks.push(d);
  }

  const track = {
    width,
    backgroundImage: `repeating-linear-gradient(to right, transparent 0 ${5 * DAY_W}px, var(--weekend) ${5 * DAY_W}px ${7 * DAY_W}px)`,
  };
  const todayX = x(today) + DAY_W / 2;

  return (
    <div className="timeline">
      <div className="tl-row tl-head">
        <div className="tl-label" />
        <div className="tl-track" style={{ width }}>
          {weeks.map((w) => (
            <div key={+w} className="tl-week" style={{ left: x(w), width: 7 * DAY_W }}>
              {fmt(w)}
            </div>
          ))}
        </div>
      </div>
      {rows.length === 0 && <div className="tl-empty">{empty}</div>}
      {rows.map((r) => (
        <div className="tl-row" key={r.key}>
          <div className={`tl-label${r.onClick ? ' clickable' : ''}`} onClick={r.onClick}>
            <div className="tl-title">
              {r.label} {r.badge}
            </div>
            {r.sub && <div className="tl-sub">{r.sub}</div>}
          </div>
          <div className="tl-track" style={track}>
            <div className="tl-today" style={{ left: todayX }} title="Today" />
            {r.bars.map((b) => {
              const w = x(b.end) - x(b.start) + DAY_W;
              return (
                <div
                  key={b.key}
                  className={`tl-bar${b.conflict ? ' conflict' : ''}${b.done ? ' done' : ''}`}
                  style={{ left: x(b.start), width: w, background: b.color }}
                  title={b.title}
                  onClick={b.onClick}
                >
                  {b.progress > 0 && !b.done && (
                    <div className="tl-progress" style={{ width: `${Math.min(100, b.progress * 100)}%` }} />
                  )}
                  {w > 44 && <span>{b.text}</span>}
                </div>
              );
            })}
            {r.marker && (
              <div className="tl-marker" style={{ left: x(r.marker) + DAY_W / 2 }} title={`Target delivery ${fmt(r.marker)}`} />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
