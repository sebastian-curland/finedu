// chart.js — hand-rolled inline SVG line chart. Generic, content-agnostic:
// no imports from calc/ or content/, and no charting library/CDN.
//
// lineChart(container, points, {width, height, labelFormatter}):
//  - `points` is [{x, y}, ...], assumed sorted ascending by x.
//  - renders a responsive <svg> (sized to the container via viewBox, so it
//    scales with CSS width: 100%) with two axis lines, a polyline through
//    the points, small dots at each point, and a handful of y-value labels.
//  - `labelFormatter(value)` formats numbers for the axis labels and the
//    endpoint label (defaults to Math.round + toLocaleString).
//
// This function replaces the container's content each call — callers own
// the container element (create/reuse it themselves).

const PADDING = { top: 16, right: 16, bottom: 24, left: 16 };

function defaultLabelFormatter(value) {
  return Math.round(value).toLocaleString('he-IL');
}

/** Picks up to `count` evenly-spaced indices from [0, length-1], including both ends. */
function pickIndices(length, count) {
  if (length <= count) {
    return Array.from({ length }, (_, i) => i);
  }
  const indices = [];
  for (let i = 0; i < count; i++) {
    indices.push(Math.round((i * (length - 1)) / (count - 1)));
  }
  return [...new Set(indices)];
}

export function lineChart(container, points, { width = 320, height = 160, labelFormatter = defaultLabelFormatter } = {}) {
  if (!container) return;

  if (!Array.isArray(points) || points.length === 0) {
    container.innerHTML = '';
    return;
  }

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xMin = xs.reduce((min, x) => Math.min(min, x), Infinity);
  const xMax = xs.reduce((max, x) => Math.max(max, x), -Infinity);
  const yMin = ys.reduce((min, y) => Math.min(min, y), 0);
  const yMax = ys.reduce((max, y) => Math.max(max, y), -Infinity);

  const plotW = width - PADDING.left - PADDING.right;
  const plotH = height - PADDING.top - PADDING.bottom;

  const scaleX = (x) => (xMax === xMin ? PADDING.left : PADDING.left + ((x - xMin) / (xMax - xMin)) * plotW);
  const scaleY = (y) => (yMax === yMin ? PADDING.top + plotH : PADDING.top + plotH - ((y - yMin) / (yMax - yMin)) * plotH);

  const linePoints = points.map((p) => `${scaleX(p.x)},${scaleY(p.y)}`).join(' ');

  const labelIndices = pickIndices(points.length, 4);
  const labels = labelIndices
    .map((i) => {
      const p = points[i];
      const cx = scaleX(p.x);
      const cy = scaleY(p.y);
      const anchor = i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle';
      return `
        <circle cx="${cx}" cy="${cy}" r="3" class="chart-dot" />
        <text x="${cx}" y="${cy - 8}" text-anchor="${anchor}" class="chart-label">${labelFormatter(p.y)}</text>
      `;
    })
    .join('');

  const axisY = PADDING.top + plotH;

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" class="chart-svg" role="img" aria-label="גרף קו">
      <line x1="${PADDING.left}" y1="${axisY}" x2="${width - PADDING.right}" y2="${axisY}" class="chart-axis" />
      <line x1="${PADDING.left}" y1="${PADDING.top}" x2="${PADDING.left}" y2="${axisY}" class="chart-axis" />
      <polyline points="${linePoints}" class="chart-line" fill="none" />
      ${labels}
    </svg>
  `;
}
