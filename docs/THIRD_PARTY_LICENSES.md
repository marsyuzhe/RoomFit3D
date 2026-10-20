# 第三方来源与授权记录

RoomFit 3D 新增代码作者：Links Tam。原项目和组件版权不得替换为产品作者署名。本文件记录已知来源，不表示所有上游实验功能和素材已通过正式发布审计。

| 内容 | 实际用途 | 来源与许可 |
|---|---|---|
| openPlan3D 源码 | 墙洞、房间算法、完整绘墙 Canvas、参考家具结构和保留的上游工程 | [laanlabs/openPlan3D](https://github.com/laanlabs/openPlan3D)，固定提交见 ADR；MIT，Copyright 2026 theLodgeStudio；全文保留 app/LICENSE 与 assets/licenses/openPlan3D-MIT.txt |
| Three.js 及官方 examples | 实时网格、控制器、RoundedBoxGeometry | [Three.js](https://github.com/mrdoob/three.js/blob/dev/LICENSE)，MIT，许可证保留在依赖和自动生成 notices |
| Svelte/SvelteKit/Vite 等 | UI 与构建 | 锁定版本见 app/package-lock.json，完整 npm 授权清单见 npm-inventory.json / NPM-NOTICES.txt |
| polygon-clipping / splaytree | 房间/旋转矩形布尔几何 | npm 安装包 LICENSE、MIT；未自行重写成熟多边形布尔库 |
| Zod | 输入与文件校验 | MIT，见自动生成 notices |
| Mozilla PDF.js 6.4.299 | 本地 PDF 多页解码，随应用提供 worker、CMaps、标准字体及 WASM 解码器 | [官方项目](https://github.com/mozilla/pdf.js)，Apache-2.0；原文保留 assets/licenses/pdfjs-LICENSE.txt、NPM-NOTICES.txt，字体/解码器目录保留各自许可 |
| Floor plan 1.jpg | 独立真实图纸的候选提取测试输入，不是实测还原样板 | Ashlynn Schindler，作者公有领域释放；完整来源、原图指纹和无尺寸标注限制见 samples/C-SOURCE.md |
| Electron / Chromium | Windows 桌面、WebGL、PDF | Electron MIT 与 Chromium 多组件许可；运行时 LICENSE/LICENSES.chromium.html 随分发保留 |
| Kenney Furniture Kit / Nature Kit | 上游保留的 GLB 资源；Studio 当前用程序化结构家具 | [Kenney](https://kenney.nl/assets)，各自 CC0；原文 static/models/furniture-kit-License.txt、nature-kit-License.txt 随发行带出 |
| ambientCG 纹理 | 上游资源，Studio 高清当前为程序化材质 | [ambientCG 许可](https://docs.ambientcg.com/license/)，CC0；各贴图来源编号保留 static/textures/CREDITS.md |
| RoomFit 床、帘、共享网格缩略图 | 实际首轮样例与渲染 | Links Tam 新建/改写代码产生；未使用外部商业模型或 AI 成图 |
| Blender 4.5.9 LTS | 外部本地 Cycles 可执行程序 | 官方 [Blender 源码](https://github.com/blender/blender)，下载内 copyright.txt 和 license/ 保留。源码下载地址 https://download.blender.org/source/ 。安装包不内置或重许可 Blender |

## 仅评估、没有混入 RoomFit 新增代码/权重

- Blueprint3D Modern：MIT，`research/Blueprint3D/LICENSE`。库与 Next 示例完成构建验证。
- 3D New Era AI：MIT OR Apache-2.0，两个 LICENSE 原文在克隆中，未复制其代码到 RoomFit 模块。
- three-gpu-pathtracer：上游实验 render lab 依赖仍在 fork 锁文件内；正式高清后端使用 Cycles，不声称已交付该实验页面。
- CubiCasa5k：[官方 LICENSE](https://raw.githubusercontent.com/CubiCasa/CubiCasa5k/master/LICENSE) 是 CC BY-NC 4.0；没有打包训练数据、预训练权重，也没有直接把数据集许可外推到权重和所有子目录。
- Poly Haven：查看 [官方许可](https://polyhaven.com/license)；此次未下载或打包其 HDRI/模型。

## 发行约束

独立 Blender 程序与 RoomFit 分开调用，用户不需要进入 Blender 操作。不把 MIT 许可证当成所有资产、数据集和预训练权重的授权。后续引入用户模型或新素材必须记录来源、版本、许可和所需署名。当前没有自动抓取淘宝、京东、宜家商业模型。

自动生成的 npm 清单覆盖开发和运行依赖，可能包含并未随运行时分发的开发工具；实际发行仍保留其所含依赖的原始许可证。
