/**
 * Built-in 2D entourage symbols (people, vehicles, planting) drawn as
 * plan-view line art. Each def's paths are SVG path strings in a
 * 100 × (100 × aspect) viewBox, so they render identically as inline SVG
 * previews and as Path2D strokes on the canvas.
 */

export interface EntourageDef {
  id: string;
  name: string;
  category: 'people' | 'vehicles' | 'planting' | 'outdoor';
  width: number; // default real-world width in cm
  aspect: number; // height / width of the symbol's bounding box
  paths: string[]; // SVG path data in a 100 x (100*aspect) viewBox
}

// ── Path generators (deterministic — no randomness) ─────────────────

function circlePath(cx: number, cy: number, r: number): string {
  return `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;
}

function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  return `M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`;
}

/** Puffy tree-canopy outline: alternating outer/inner control points around a circle */
function cloudPath(cx: number, cy: number, r: number, lobes: number): string {
  const pts: string[] = [];
  const step = (Math.PI * 2) / lobes;
  const start = { x: cx + r * 0.82, y: cy };
  let d = `M ${start.x.toFixed(1)} ${start.y.toFixed(1)}`;
  for (let i = 1; i <= lobes; i++) {
    const aMid = step * (i - 0.5);
    const aEnd = step * i;
    const mx = cx + Math.cos(aMid) * r * 1.06;
    const my = cy + Math.sin(aMid) * r * 1.06;
    const ex = cx + Math.cos(aEnd) * r * 0.82;
    const ey = cy + Math.sin(aEnd) * r * 0.82;
    d += ` Q ${mx.toFixed(1)} ${my.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;
  }
  pts.push(d + ' Z');
  return pts[0];
}

/** Spiky conifer outline (star polygon) */
function starPath(cx: number, cy: number, rOuter: number, rInner: number, points: number): string {
  let d = '';
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? rOuter : rInner;
    const a = (Math.PI * i) / points - Math.PI / 2;
    const x = (cx + Math.cos(a) * r).toFixed(1);
    const y = (cy + Math.sin(a) * r).toFixed(1);
    d += (i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`);
  }
  return d + ' Z';
}

/** Radial ticks (tree branches / umbrella spokes) */
function spokesPath(cx: number, cy: number, rFrom: number, rTo: number, count: number, angleOffset = 0): string {
  let d = '';
  for (let i = 0; i < count; i++) {
    const a = (Math.PI * 2 * i) / count + angleOffset;
    d += `M ${(cx + Math.cos(a) * rFrom).toFixed(1)} ${(cy + Math.sin(a) * rFrom).toFixed(1)} L ${(cx + Math.cos(a) * rTo).toFixed(1)} ${(cy + Math.sin(a) * rTo).toFixed(1)} `;
  }
  return d.trim();
}

/** Horizontal squiggle across a hedge body */
function squigglePath(x0: number, x1: number, y: number, amp: number, waves: number): string {
  const w = (x1 - x0) / waves;
  let d = `M ${x0} ${y}`;
  for (let i = 0; i < waves; i++) {
    const mx = x0 + w * (i + 0.5);
    const ex = x0 + w * (i + 1);
    const my = y + (i % 2 === 0 ? -amp : amp);
    d += ` Q ${mx.toFixed(1)} ${my.toFixed(1)} ${ex.toFixed(1)} ${y}`;
  }
  return d;
}

function roundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
  return `M ${x + r} ${y} H ${x + w - r} Q ${x + w} ${y} ${x + w} ${y + r} V ${y + h - r} Q ${x + w} ${y + h} ${x + w - r} ${y + h} H ${x + r} Q ${x} ${y + h} ${x} ${y + h - r} V ${y + r} Q ${x} ${y} ${x + r} ${y} Z`;
}

// ── Symbol definitions ───────────────────────────────────────────────

export const entourageCatalog: EntourageDef[] = [
  // People (plan view: shoulder ellipse + head)
  {
    id: 'person', name: 'Person', category: 'people', width: 55, aspect: 0.6,
    paths: [ellipsePath(50, 30, 46, 26), circlePath(50, 30, 15)],
  },
  {
    id: 'people-pair', name: 'Two People', category: 'people', width: 100, aspect: 0.62,
    paths: [
      ellipsePath(30, 34, 27, 22), circlePath(30, 34, 9),
      ellipsePath(70, 28, 27, 22), circlePath(70, 28, 9),
    ],
  },

  // Vehicles (plan view, nose to the right)
  {
    id: 'car-sedan', name: 'Sedan', category: 'vehicles', width: 460, aspect: 0.4,
    paths: [
      roundedRectPath(2, 3, 96, 34, 9),
      'M 66 5 Q 59 20 66 35', // windshield
      'M 28 5 Q 34 20 28 35', // rear window
      'M 30 8 H 62 M 30 32 H 62', // roof edges
    ],
  },
  {
    id: 'car-suv', name: 'SUV', category: 'vehicles', width: 470, aspect: 0.42,
    paths: [
      roundedRectPath(2, 3, 96, 36, 6),
      'M 70 5 Q 64 21 70 37',
      'M 22 5 Q 27 21 22 37',
      'M 24 8 H 67 M 24 34 H 67',
    ],
  },
  {
    id: 'car-pickup', name: 'Pickup', category: 'vehicles', width: 520, aspect: 0.38,
    paths: [
      roundedRectPath(2, 3, 96, 32, 6),
      'M 74 5 Q 68 19 74 33', // windshield
      'M 52 3 V 35', // cab back
      'M 6 7 H 48 M 6 31 H 48 M 6 19 H 48', // bed ribs
    ],
  },

  // Planting
  {
    id: 'tree-deciduous', name: 'Deciduous Tree', category: 'planting', width: 400, aspect: 1,
    paths: [cloudPath(50, 50, 46, 12), circlePath(50, 50, 2.5), spokesPath(50, 50, 6, 30, 5, 0.4)],
  },
  {
    id: 'tree-conifer', name: 'Conifer', category: 'planting', width: 300, aspect: 1,
    paths: [starPath(50, 50, 47, 30, 12), circlePath(50, 50, 2.5)],
  },
  {
    id: 'shrub', name: 'Shrub', category: 'planting', width: 120, aspect: 0.9,
    paths: [cloudPath(34, 56, 26, 8), cloudPath(64, 50, 30, 9), cloudPath(50, 34, 22, 7)],
  },
  {
    id: 'hedge', name: 'Hedge', category: 'planting', width: 200, aspect: 0.3,
    paths: [
      roundedRectPath(1, 2, 98, 26, 6),
      squigglePath(8, 92, 15, 7, 7),
    ],
  },
  {
    id: 'potted-plant', name: 'Potted Plant', category: 'planting', width: 60, aspect: 1,
    paths: [circlePath(50, 50, 46), circlePath(50, 50, 16), spokesPath(50, 50, 18, 44, 8, 0.2)],
  },
  {
    id: 'grass-tuft', name: 'Grass', category: 'planting', width: 80, aspect: 0.5,
    paths: [
      'M 10 45 L 16 12 L 22 45 M 30 48 L 38 5 L 46 48 M 54 45 L 60 15 L 66 45 M 72 48 L 80 10 L 88 48',
    ],
  },

  // Outdoor
  {
    id: 'patio-umbrella', name: 'Patio Umbrella', category: 'outdoor', width: 250, aspect: 1,
    paths: [circlePath(50, 50, 47), circlePath(50, 50, 4), spokesPath(50, 50, 5, 46, 8)],
  },
];

export function getEntourageDef(id: string): EntourageDef | undefined {
  return entourageCatalog.find((d) => d.id === id);
}

export const entourageCategories: { key: EntourageDef['category']; label: string; icon: string }[] = [
  { key: 'people', label: 'People', icon: '🚶' },
  { key: 'vehicles', label: 'Vehicles', icon: '🚗' },
  { key: 'planting', label: 'Planting', icon: '🌳' },
  { key: 'outdoor', label: 'Outdoor', icon: '⛱️' },
];
