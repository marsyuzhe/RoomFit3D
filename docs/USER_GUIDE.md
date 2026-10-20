# 使用指南 / Quick start

1. 首次打开选择输入房间尺寸、上传图纸或装修模板。模板是虚构的示例布局。
2. 输入宽、深和层高；尺寸可用 `120cm`、`1.2m` 或 `1200mm`。所有参考值都应与实物核对。
3. 图纸可用图片或 PDF。选页/裁切后运行 OCR，确认数字与单位，再在实际尺寸线的两个端点标定；核对第二个尺寸。人工修正墙线和门窗，确认闭合轮廓后生成三维。
4. 家具库搜索并添加家具；在属性中改尺寸、旋转和颜色。检查碰撞、净距和门扇空间提示。桌面物件可以建立支撑关系；需要独立移动时先解除支撑。
5. 在 2D/3D 与视角之间切换，设置灯光/RGB。照片只作参考；个人 GLB 只支持未压缩静态纯色网格，需要确认单位、朝向与尺寸。
6. 保存 `.roomfit` 工程；自动恢复仅保存最近本机编辑状态，不能代替主动备份。
7. 高清效果需在设置中选择独立 Blender 程序，然后提交 Cycles 渲染。状态和日志会显示实际运行结果；渲染耗时取决于硬件。

Use the language selector for English. Start with dimensions or an editable example, add furniture, verify real measurements, review geometric hints, preview/render, and save a `.roomfit` file. Floor plan suggestions always need manual review. See V020_USER_GUIDE.zh-CN.md for detailed Chinese instructions and KNOWN_LIMITATIONS.md for feature boundaries.
