import {it,expect} from 'vitest';
import {createRoom,addItem} from '../../src/lib/roomfit/scene';
import {analyze,area,footprint} from '../../src/lib/roomfit/geometry';
it('does not report a PC under a desk as solid overlap, but detects the desk legs',()=>{const s=createRoom(),desk=addItem(s,'desk',1800,1500),pc=addItem(s,'pc_itx',1800,1500);expect(analyze(s).filter(f=>f.severity==='error'&&f.ids.includes(pc.id)&&f.ids.includes(desk.id))).toHaveLength(0);pc.x=desk.x+desk.width/2-40;expect(analyze(s).some(f=>f.severity==='error'&&f.ids.includes(pc.id)&&f.ids.includes(desk.id))).toBe(true);});
it('uses the actual L-shaped desktop footprint under rotation',()=>{const s=createRoom(),desk=addItem(s,'gaming_desk_l');const a=area(footprint(desk));expect(a).toBeCloseTo(desk.width*desk.depth*(.43+.38*.57),2);desk.rotation=137;expect(area(footprint(desk))).toBeCloseTo(a,2);});
