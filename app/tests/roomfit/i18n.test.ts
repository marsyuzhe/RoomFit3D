import { describe, it, expect } from "vitest";
import {parse} from 'svelte/compiler';
import {readFileSync} from 'node:fs';
import { translate } from "../../src/lib/roomfit/i18n";
import { en } from "../../src/lib/roomfit/messages.en";
import { bedroom } from "../../src/lib/roomfit/scene";
import {
  encodeScene,
  furnitureCSV,
  planSVG,
} from "../../src/lib/roomfit/storage";
describe("RoomFit Chinese and English", () => {
  it("translates static labels, multiline help and dynamic checks without changing user paths", () => {
    expect(translate("en", "导入图纸")).toBe("Import plan");
    expect(translate("zh", "导入图纸")).toBe("导入图纸");
    expect(translate("en", "双人床 与 衣柜 碰撞")).toBe(
      "Double bed collides with Wardrobe",
    );
    expect(translate("en", "工程已保存：D:\\我的项目\\卧室.roomfit")).toBe(
      "Project saved: D:\\我的项目\\卧室.roomfit",
    );
    expect(translate("en", "待机")).toBe("Idle");
    expect(translate("zh", "running")).toBe("渲染中");
    expect(translate("en", "复核换算长度 3000 mm，偏差 0.00%。")).toBe(
      "Verification length: 3000 mm, error: 0.00%.",
    );
  });
  it("covers every migrated template label with an English phrase", () => {
    expect(Object.keys(en).length).toBeGreaterThan(250);
    expect(
      Object.values(en).every(
        (v) => v.trim().length > 0 && !/[\u3400-\u9fff]/.test(v),
      ),
    ).toBe(true);
    const paths=['src/routes/studio/+page.svelte',...['FloorPlanImport','ScanImport','AdvancedPlan','Plan','Viewport'].map(n=>`src/lib/roomfit/${n}.svelte`)];
    const labels=new Set<string>();
    function literals(node:any){if(!node||typeof node!=='object')return;if(node.type==='Literal'&&typeof node.value==='string'&&/[\u3400-\u9fff]/.test(node.value))labels.add(node.value);for(const [key,value]of Object.entries(node))if(key!=='loc')if(Array.isArray(value))value.forEach(literals);else if(value&&typeof value==='object')literals(value);}
    function walk(node:any){if(!node||typeof node!=='object')return;if(node.type==='CallExpression'&&node.callee?.name==='$tr')node.arguments.forEach(literals);for(const [key,value]of Object.entries(node))if(key!=='loc')if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);}
    for(const path of paths)walk(parse(readFileSync(path,'utf8'),{modern:true}));
    expect(labels.size).toBeGreaterThan(180);
    for(const label of labels)expect(translate('en',label),label).not.toMatch(/[\u3400-\u9fff]/);
  });
  it("localizes export headings without mutating saved dimensions or names", () => {
    const s = bedroom(),
      before = encodeScene(s);
    expect(furnitureCSV(s, "en")).toContain('"Width mm"');
    expect(furnitureCSV(s, "zh")).toContain('"宽 mm"');
    expect(planSVG(s, "en")).toContain("Double bed");
    expect(encodeScene(s)).toBe(before);
  });
});
