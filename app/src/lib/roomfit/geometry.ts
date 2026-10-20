import clipping from "polygon-clipping";
import type { RoomScene, Furniture } from "./scene";
import { jambMm, doorLeafWidth } from "./openings";
import {catalog} from './catalog';
import {collisionParts} from './collisionParts';
export type P = { x: number; z: number };
export const area = (p: P[]) =>
  Math.abs(
    p.reduce((a, v, i) => {
      const q = p[(i + 1) % p.length];
      return a + v.x * q.z - q.x * v.z;
    }, 0),
  ) / 2;
export function footprint(
  f: Pick<Furniture, "x" | "z" | "width" | "depth" | "rotation">,
): P[] {
  const a = (f.rotation * Math.PI) / 180,
    c = Math.cos(a),
    s = Math.sin(a);
  const def=catalog.find(c=>c.id===('catalogId' in f?f.catalogId:undefined));
  const outline=def?.family==='desk'&&def.features.includes('L') ? [[-1,-1],[1,-1],[1,-.14],[-.24,-.14],[-.24,1],[-1,1]] : [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  return outline.map(([x, z]) => ({
    x: f.x + ((x * f.width) / 2) * c + ((z * f.depth) / 2) * s,
    z: f.z - ((x * f.width) / 2) * s + ((z * f.depth) / 2) * c,
  }));
}
const poly = (p: P[]) => [
  [
    ...p.map((p) => [p.x, p.z] as [number, number]),
    [p[0].x, p[0].z] as [number, number],
  ],
];
const multiArea = (p: number[][][][]) =>
  p.reduce(
    (a, polygon) =>
      a +
      polygon.reduce(
        (a, ring, i) =>
          a + (i === 0 ? 1 : -1) * area(ring.map(([x, z]) => ({ x, z }))),
        0,
      ),
    0,
  );
export function overlaps(a: P[], b: P[]): boolean {
  return multiArea(clipping.intersection(poly(a), poly(b))) > 1;
}
export function pointSegment(p: P, a: P, b: P): number {
  const dx = b.x - a.x,
    dz = b.z - a.z;
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1),
    ),
  );
  return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz);
}
export function distance(a: P[], b: P[]): number {
  if (overlaps(a, b)) return 0;
  return Math.min(
    ...a.flatMap((p) =>
      b.map((q, i) => pointSegment(p, q, b[(i + 1) % b.length])),
    ),
    ...b.flatMap((p) =>
      a.map((q, i) => pointSegment(p, q, a[(i + 1) % a.length])),
    ),
  );
}
export interface Finding {
  severity: "error" | "warning";
  message: string;
  ids: string[];
}
export function analyze(s: RoomScene): Finding[] {
  const out: Finding[] = [];
  for (const f of s.furniture) {
    if (["curtain", "floor_lamp"].includes(f.catalogId)) continue;
    const a = footprint(f),
      total = area(a);
    const roomPolygons = s.rooms.map((r) => poly(r.polygon));
    const inside = multiArea(
      clipping.intersection(
        poly(a),
        clipping.union(roomPolygons[0], ...roomPolygons.slice(1)),
      ),
    );
    if (total - inside > 1)
      out.push({
        severity: "error",
        message: `${f.name} 越出房间或与墙体相交`,
        ids: [f.id],
      });
    for (const g of s.furniture) {
      if (
        g.id <= f.id ||
        ["curtain", "floor_lamp"].includes(g.catalogId) ||
        f.y >= g.y + g.height ||
        g.y >= f.y + f.height
      )
        continue;
      if (overlaps(a, footprint(g)) && collisionParts(f,s.assets).some(p=>collisionParts(g,s.assets).some(q=>p.y<q.y+q.height-.5&&q.y<p.y+p.height-.5&&overlaps(footprint(p),footprint(q)))))
        out.push({
          severity: "error",
          message: `${f.name} 与 ${g.name} 碰撞`,
          ids: [f.id, g.id],
        });
    }
    for (const o of s.openings.filter((o) => o.kind === "door")) {
      if (f.y >= o.height || f.y + f.height <= 0) continue;
      const w = s.walls.find((w) => w.id === o.wallId)!;
      const dx = w.end.x - w.start.x,
        dz = w.end.z - w.start.z,
        l = Math.hypot(dx, dz),
        ux = dx / l,
        uz = dz / l;
      const sign = o.swing === "left" ? 1 : -1;
      const leafWidth = doorLeafWidth(o.width);
      const hinge = {
        x: w.start.x + ux * (o.offset - sign * (o.width / 2 - jambMm)),
        z: w.start.z + uz * (o.offset - sign * (o.width / 2 - jambMm)),
      };
      const sector = [
        hinge,
        ...Array.from({ length: 49 }, (_, i) => {
          const a = (i * Math.PI) / 96;
          return {
            x:
              hinge.x +
              sign * ux * leafWidth * Math.cos(a) -
              uz * leafWidth * Math.sin(a),
            z:
              hinge.z +
              sign * uz * leafWidth * Math.cos(a) +
              ux * leafWidth * Math.sin(a),
          };
        }),
      ];
      if (overlaps(a, sector))
        out.push({
          severity: "error",
          message: `${f.name} 阻挡门扇开启`,
          ids: [f.id, o.id],
        });
    }
    if (f.confidence === "estimated")
      out.push({
        severity: "warning",
        message: `${f.name} 的尺寸尚待确认`,
        ids: [f.id],
      });
  }
  if (s.dimensionConfidence === "estimated")
    out.push({
      severity: "warning",
      message: "房间比例未经确认，不能判断已验证适配",
      ids: [],
    });
  for(const f of s.furniture){
    const def=catalog.find(c=>c.id===f.catalogId);if(!def)continue;
    if(f.y<0||f.y+f.height>s.rooms[0].height+1)out.push({severity:'error',message:`${f.name} 超出地面或层高 / Outside floor or ceiling`,ids:[f.id]});
    if(f.support){const parent=s.furniture.find(p=>p.id===f.support!.parentId);if(parent&&!footprint(f).every(p=>pointInPolygon(p,footprint(parent))))out.push({severity:'warning',message:`${f.name} 超出支撑面，需核对承重与安装 / Check support overhang and mounting`,ids:[f.id,parent.id]});}
    if(def.family==='arm'&&!f.support)out.push({severity:'warning',message:`${f.name} 尚未指定桌面夹装支撑 / Confirm desk clamp support`,ids:[f.id]});
    const service=def.family==='cabinet'&&!def.features.includes('open')?500:def.family==='chair'&&!def.features.includes('bench')?600:0;
    if(service){const a=f.rotation*Math.PI/180,sign=def.family==='chair'?-1:1,z=f.z+sign*Math.cos(a)*(f.depth/2+service/2),x=f.x+sign*Math.sin(a)*(f.depth/2+service/2),zone=footprint({...f,width:f.width*.85,depth:service,x,z});const blocks=s.furniture.filter(g=>g.id!==f.id&&g.id!==f.support?.parentId&&g.y<f.y+f.height&&g.y+g.height>f.y&&overlaps(zone,footprint(g)));if(blocks.length||!zone.every(p=>s.rooms.some(r=>pointInPolygon(p,r.polygon))))out.push({severity:'warning',message:`${f.name} ${def.family==='chair'?'座椅后退空间':'柜门/抽屉服务空间'}建议 ${service} mm，需核对 / Check recommended operating clearance`,ids:[f.id,...blocks.map(g=>g.id)]});}
    for(const o of s.openings.filter(o=>o.kind==='window')){const wall=s.walls.find(w=>w.id===o.wallId)!;const len=Math.hypot(wall.end.x-wall.start.x,wall.end.z-wall.start.z);const opening={...f,x:wall.start.x+(wall.end.x-wall.start.x)*o.offset/len,z:wall.start.z+(wall.end.z-wall.start.z)*o.offset/len,width:o.width,depth:wall.thickness+100,rotation:-Math.atan2(wall.end.z-wall.start.z,wall.end.x-wall.start.x)*180/Math.PI};if(f.y<o.sill+o.height&&f.y+f.height>o.sill&&overlaps(footprint(f),footprint(opening)))out.push({severity:'warning',message:`${f.name} 接近窗台或窗扇，核对窗高和开启空间 / Verify window sill and opening clearance`,ids:[f.id,o.id]});}
  }
  return out;
}
function pointInPolygon(p:P,polygon:P[]){let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if(pointSegment(p,a,b)<.1)return true;if((a.z>p.z)!==(b.z>p.z)&&p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)inside=!inside;}return inside;}
export function clearance(s: RoomScene, f: Furniture) {
  const p = footprint(f);
  return Math.min(
    ...s.rooms.flatMap((r) =>
      r.polygon.map((q, i) =>
        Math.min(
          ...p.map((v) =>
            pointSegment(v, q, r.polygon[(i + 1) % r.polygon.length]),
          ),
        ),
      ),
    ),
  );
}
