# Windows 安装 / Installation

当前验证：Windows 11 x64，最小窗口 1100×720。下载 Releases 的 RoomFit3D-v0.2.0-Windows-x64-Setup.exe，并核对 SHA256SUMS.txt。运行安装向导，可选安装位置。未签名安装包可能有 SmartScreen 提示；核实来源与哈希，不要关闭系统防护。未提供经过验证的便携版。

安装包包含家具目录、模板、OCR 数据和 PDF 解码器。RoomFit3D-Assets-v0.2.0.zip 是可选的源码定义/模板参考包，不是首次运行必须安装的 DLC。

普通编辑不需要 Blender。真实 Cycles 需要单独安装 Blender 4.5.9 LTS（本次测试版本）。应用可在常见 Program Files 安装位置发现它，也可以用“选择 Blender”按钮指定 blender.exe。显卡后端失败时会尝试 CPU，速度取决于硬件。Blender 本身不内置于本安装包。

首次启动选择上传图纸、输入尺寸或模板。常用工作流支持简体中文/English；部分高级继承界面尚未完全翻译。用户数据保存于 Electron 的本机用户数据目录，工程通过原生保存对话框写入所选路径。
