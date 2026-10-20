# RoomFit 3D v0.2.0 — 预发布

日期：2026-10-20 · 作者：Links Tam · Windows x64

新增面向新手的首页与五步图纸导入；本地数字/英文单位 OCR；150 个不同结构的通用参数化家具（45 个电竞类）；12 个可编辑模板（6 个电竞空间）；个人纯色 GLB 资料、支撑/替换、RGB 与近似色温。保留 2D/3D、工程保存恢复和同源网格 Blender Cycles。主工作流中英文切换与浅色文字对比度已有修正。本次公开资料加入原创应用图标、Links Tam 署名、中英文文档和完整第三方声明。

下载 RoomFit3D-v0.2.0-Windows-x64-Setup.exe。家具、模板、OCR/PDF 资源已内置；Assets ZIP 是可选定义/参考包，Source ZIP 是完整源码备份，均不是普通用户首次运行必需。未提供经验证的 Portable。安装包未签名，可能出现 SmartScreen 提示；核对来源与 SHA-256，不要关闭系统安全防护。当前验证 Windows 11 x64，其他 Windows 版本尚未验收。

高清渲染需要独立 Blender（验证版本 4.5.9 LTS），在应用里选择 blender.exe。Blender 没有打包进安装器；普通编辑不需要它。

限制：家具尺寸需要核对；OCR 不是完整中文/语义识别；候选墙/门窗必须确认；无透视矫正；GLB 无纹理/动画/压缩支持；RoomPlan JSON/ZIP 是数据导入，没有手机扫描采集应用；高级编辑器翻译未全部完成；碰撞/净距提示不构成工程安全认证。没有干净虚拟机安装/卸载测试，因此请勾选 Pre-release。

许可：RoomFit 新增内容 MIT，Links Tam；openPlan3D MIT，theLodgeStudio；Kenney、ambientCG、OCR/PDF 和其他依赖保留各自许可证。见 THIRD_PARTY_NOTICES.md。

校验：在下载目录打开 PowerShell，运行 `Get-FileHash -Algorithm SHA256 .\RoomFit3D-v0.2.0-Windows-x64-Setup.exe`，与 SHA256SUMS.txt 中同名文件逐字对比。下载完成后再核对文件大小与哈希。


---

# RoomFit 3D v0.2.0 — Pre-release

2026-10-20 · Links Tam · Windows x64

Beginner home, guided floor-plan review with local numeric/Latin-unit OCR, 150 structurally distinct generic parametric assets (45 gaming), 12 editable examples (6 gaming), personal solid-material GLB records, support/replacement, RGB and approximate colour temperature. Includes 2D/3D editing, save/recovery, shared-geometry Blender Cycles and Chinese/English main workflows. Publication materials add original RoomFit branding and retain upstream attribution.

Download RoomFit3D-v0.2.0-Windows-x64-Setup.exe. Furniture, OCR and PDF resources are included. The optional Assets ZIP contains definitions/reference examples; Source ZIP is a full source backup. Neither is required for normal installation. No verified portable build is supplied. The installer is unsigned; verify source and SHA-256 without disabling protection. Tested on Windows 11 x64, not other Windows versions or a clean VM.

High-quality rendering requires separate Blender (tested: 4.5.9 LTS), selected in the app. Editing needs no Blender.

Known limits: estimated furniture dimensions; partial OCR requiring manual wall/opening review; no perspective correction; no textured/animated/compressed GLB; RoomPlan import is not a delivered phone capture app; incomplete advanced UI translation; approximate geometric checks. Mark this release as Pre-release.

RoomFit additions are MIT, Links Tam. Upstream openPlan3D is MIT, theLodgeStudio. Third-party assets/dependencies retain their respective licenses; see THIRD_PARTY_NOTICES.md.

Verify downloads using `Get-FileHash -Algorithm SHA256 .\RoomFit3D-v0.2.0-Windows-x64-Setup.exe` and compare against SHA256SUMS.txt.
