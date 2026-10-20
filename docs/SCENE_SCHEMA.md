# RoomScene v3 — 0.2.0

当前写出版本为 3，读取 v1/v2 时显式迁移为 v3，拒绝未知未来版本。毫米坐标和相机约定沿用 v2。

新增 furniture.support：parentId、局部 x/z、相对 rotation、offsetY。场景持久化世界位置并保留支撑关系；编辑后同步。禁止不存在、自引用或循环父级。

新增 furniture.modules：cols/rows，1–8，重建隔板而非缩放整柜。

新增 furniture.light：enabled、color、intensity、可选 temperature；实时材质与实际 Cycles 的 emission/point-light 清单共享参数。UI 颜色预设可直接用。

furniture.assetId 引用 assets 中的 RoomFitMesh1 纯网格数据。已接受的 GLB 转换为本地米制、中心与地面对齐的分组网格，包含索引、PBR 基色/粗糙度/金属度/发光值；原始外形比例必须保持。不执行外部脚本或下载外部资源，不支持纹理/动画/压缩模型。原始 RoomPlan 来源 JSON 继续作为独立资产保留。

渲染清单仍为 RoomFitRender v1，增加 emission、emissionStrength 和 lights。投影核验采用房间内至少三个稳定前向采样点，排除相机平面附近/后方的数值无界投影；不放松原有 1e-5 阈值。

## 历史 v2 基础约定（以下字段说明仍适用，版本号与 assetId 限制以 v3 为准）

# RoomScene v2

权威校验器：`app/src/lib/roomfit/scene.ts`。文件扩展名 `.roomfit`，当前是 UTF-8 JSON，不是假称已经实现 ZIP 工程包。

## 坐标和单位

- `units: "mm"`。建筑、家具、门窗和相机位置全部是毫米。
- 右手坐标：X 平面向右，Y 上，Z 平面向下。平面点 `{x,z}`，家具中心 `{x,y,z}`。
- 家具 rotation 为绕 +Y 的右手角度，度。平面投影是逆时针；上游 Canvas 的正角相反，因此适配器使用负号。
- Three 显示网格为米；Blender Z-up 世界为 `(x,-z,y)/1000`。转换函数有双向测试，禁止在 UI 内随意换轴。
- FOV 明确为**垂直视场角**。Blender 使用 vertical sensor fit 和等效焦距。导出三个参考点的投影结果，渲染前逐点断言误差 < 1e-5 归一化画幅。

## 主要字段

| 字段 | 内容 |
|---|---|
| schema/version/id/name/author | 固定 RoomFit3D、版本 2、项目身份及 Links Tam 署名 |
| createdAt/modifiedAt | ISO 8601 时间 |
| dimensionConfidence | measured / drawing / manufacturer / confirmed / estimated |
| rooms | 有序净轮廓 polygon、层高、名字、可信度 |
| walls | 起终点为中心线，厚/高，颜色、锁定信息 |
| openings | wallId、沿墙中心距离 offset、门/窗、洞宽/高、窗台 sill、铰链侧 swing |
| furniture | 目录 ID、外廓宽深高、中心坐标、朝向、来源可信度、商品字段与锁定 |
| materials | 地面和墙面 kind/color/roughness/metalness/tileMm |
| camera | 毫米 position/target 和垂直 fov |
| render | preset、width/height、samples、exposure |
| clearanceTarget | 用户个人净距目标，不是规范阈值 |
| assets/notes | 预留资产字典和说明；本版本拒绝引用个人 GLB 资源 |

门窗 offset 指中心线上的实体洞口中心，不是开口左边。墙体切分真实扣除洞口。门框为 35 mm，叶片宽为洞口减去两侧门框及 5 mm 间隙；渲染铰链和分析扫掠共用这些参数。门显示为轻微开启，分析验证到 90° 的完整开启区域。

## 精度与验证

- 计算采用双精度毫米数据。没有为外观修改家具实际尺寸。
- 单元测试外廓容差 0.01 mm；导出到 Blender float 网格的独立包围盒误差要求 < 0.01 mm。
- 碰撞交集面积 > 1 mm² 认为相交；门扇弧用 48 段，半径 775 mm 时弦高误差约 0.104 mm。接触边界不当作穿透。
- net polygon 是完成面内部净轮廓；矩形 3600×3200 配 120 mm 墙时墙中心线为 -60 至 3660，不把中心线面积冒充净面积。
- 保存前/载入后校验有限值、尺寸范围、唯一 ID、墙引用和洞口边界。未知版本或未知单位拒绝打开，没有进行未经测试的猜测迁移。
- 新建房间的输入属于用户确认值，默认不宣称现场实测；目录家具默认 estimated。碰撞清空也不会自动输出“已验证适配”。

## 已知建模边界

尚未覆盖多层住宅关系、房间内部孔洞、复杂曲面、自由楼梯/柱、每对象多材质贴图、完整资产打包及方案容器。破坏性字段变化和迁移必须显式升级/测试版本，不应静默丢失用户信息。

## v1 → v2 迁移与底图

读取 v1 时仅升级版本号到 2，既有毫米几何、相机和材质不变；经过同一校验器后才接受。保存统一写 v2，旧程序拒绝 v2，避免重新保存时丢失底图。未来版本仍拒绝。

floorPlan 为可选字段，记录当前页 PNG/JPEG dataUrl（16 MB 内）、像素宽高（最长边 2400）、原文件名、页码、左上毫米 position、mmPerPixel、透明度、calibration、crossCheck 和候选线。像素坐标只属于底图；生成墙时转换为毫米。每条候选含 id、a/b 像素点、像素厚、accepted 与 detected/manual 来源。底图数据禁止远程 URL；校准像素距离乘比例必须等于已知毫米长度。
