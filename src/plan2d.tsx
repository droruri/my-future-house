import type { House, Pt } from './house';

const PAD = 1;

export function planBounds(house: House): { minX: number; minZ: number; maxX: number; maxZ: number } | null {
  const pts: Pt[] = [
    ...house.walls.flatMap((w) => [w.a, w.b]),
    ...house.rooms.flatMap((r) => r.polygon),
  ];
  if (pts.length === 0) return null;
  return {
    minX: Math.min(...pts.map((p) => p.x)),
    maxX: Math.max(...pts.map((p) => p.x)),
    minZ: Math.min(...pts.map((p) => p.z)),
    maxZ: Math.max(...pts.map((p) => p.z)),
  };
}

const ROOM_FILL = { room: '#e6d9c0', wet: '#bcd3e2', balcony: '#cdd6c5', service_balcony: '#d8dcb5', mamad: '#e2bcbc' } as const;
const pts = (poly: Pt[]) => poly.map((p) => `${p.x},${p.z}`).join(' ');
const centroid = (poly: Pt[]) => {
  const p = poly.slice(0, -1);
  const n = Math.max(1, p.length);
  return { x: p.reduce((a, q) => a + q.x, 0) / n, z: p.reduce((a, q) => a + q.z, 0) / n };
};

/** 2D plan (top view, north up) with the overall dimensions marked. */
export function Plan2D({ house }: { house: House }) {
  const b = planBounds(house);
  if (!b) return <div>אין קירות להצגה</div>;
  const w = b.maxX - b.minX;
  const d = b.maxZ - b.minZ;
  const fs = Math.max(0.25, Math.max(w, d) / 40);
  return (
    <svg
      role="img"
      aria-label="תוכנית דו־ממדית"
      viewBox={`${b.minX - PAD} ${b.minZ - PAD} ${w + 2 * PAD} ${d + 2 * PAD}`}
      className="h-full w-full bg-surface"
    >
      {house.rooms.map((r) => (
        <polygon key={r.id} points={pts(r.polygon)} fill={ROOM_FILL[r.kind]} stroke="none" />
      ))}
      {house.walls.map((wl) => (
        <line key={wl.id} x1={wl.a.x} y1={wl.a.z} x2={wl.b.x} y2={wl.b.z} stroke="#333" strokeWidth={wl.thickness} />
      ))}
      {house.openings.map((o) => {
        const wl = house.walls.find((x) => x.id === o.wallId);
        if (!wl) return null;
        const len = Math.hypot(wl.b.x - wl.a.x, wl.b.z - wl.a.z) || 1;
        const ux = (wl.b.x - wl.a.x) / len;
        const uz = (wl.b.z - wl.a.z) / len;
        return (
          <line
            key={o.id}
            x1={wl.a.x + ux * o.offset}
            y1={wl.a.z + uz * o.offset}
            x2={wl.a.x + ux * (o.offset + o.width)}
            y2={wl.a.z + uz * (o.offset + o.width)}
            stroke={o.kind === 'door' ? '#b5651d' : '#4aa3df'}
            strokeWidth={wl.thickness * 0.6}
          />
        );
      })}
      {house.rooms.map((r) => {
        const c = centroid(r.polygon);
        return (
          <text key={`t${r.id}`} x={c.x} y={c.z} fontSize={fs} textAnchor="middle" direction="rtl" fill="#222">
            {r.name}
          </text>
        );
      })}
      <g stroke="#c0392b" fill="#c0392b" strokeWidth={fs / 10} fontSize={fs} textAnchor="middle">
        <line x1={b.minX} y1={b.maxZ + PAD * 0.5} x2={b.maxX} y2={b.maxZ + PAD * 0.5} />
        <text x={(b.minX + b.maxX) / 2} y={b.maxZ + PAD * 0.5 - fs * 0.3} stroke="none">{w.toFixed(2)} מ׳</text>
        <line x1={b.minX - PAD * 0.5} y1={b.minZ} x2={b.minX - PAD * 0.5} y2={b.maxZ} />
        <text
          x={b.minX - PAD * 0.5 - fs * 0.3}
          y={(b.minZ + b.maxZ) / 2}
          stroke="none"
          transform={`rotate(-90 ${b.minX - PAD * 0.5 - fs * 0.3} ${(b.minZ + b.maxZ) / 2})`}
        >
          {d.toFixed(2)} מ׳
        </text>
      </g>
    </svg>
  );
}
