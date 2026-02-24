#!/bin/bash
#
# Atlas 一键构建脚本
#
# 将前后端打包为 macOS .dmg 安装包：
#   1. PyInstaller 打包 Python 后端为独立可执行文件
#   2. Vite 构建前端静态资源
#   3. electron-builder 打包为 .dmg
#
# 前提条件：
#   - backend/.venv 虚拟环境已创建并安装了依赖
#   - Node.js 18+ 及 npm
#
# 使用方法：
#   bash build.sh
#

set -e

# 项目根目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "========================================"
echo "  Atlas macOS 应用构建"
echo "========================================"
echo ""

# ===== 第一步：PyInstaller 打包后端 =====
echo "[1/3] 打包 Python 后端..."
echo "----------------------------------------"

cd "$SCRIPT_DIR/backend"

# 激活虚拟环境
if [ -d ".venv" ]; then
    echo "激活虚拟环境 .venv ..."
    source .venv/bin/activate
elif [ -d "venv" ]; then
    echo "激活虚拟环境 venv ..."
    source venv/bin/activate
else
    echo "错误：未找到 Python 虚拟环境（.venv 或 venv）"
    echo "请先创建虚拟环境: python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt"
    exit 1
fi

# 确保 PyInstaller 可用
if ! command -v pyinstaller &> /dev/null; then
    echo "正在安装 PyInstaller..."
    pip install pyinstaller
fi

# 安装后端依赖（确保完整）
echo "安装后端依赖..."
pip install -r requirements.txt

# 清理旧的构建产物
rm -rf build/ dist/

# 执行 PyInstaller 打包
echo "执行 PyInstaller 打包..."
pyinstaller atlas-backend.spec --noconfirm

echo "✓ 后端打包完成: backend/dist/atlas-backend/"
echo ""

# ===== 第二步：Vite 构建前端 =====
echo "[2/3] 构建前端资源..."
echo "----------------------------------------"

cd "$SCRIPT_DIR/frontend"

# 安装前端依赖
echo "安装前端依赖..."
npm install

# TypeScript 编译 + Vite 构建
echo "执行 Vite 构建..."
npm run build

echo "✓ 前端构建完成: frontend/dist/"
echo ""

# ===== 第三步：electron-builder 打包 =====
echo "[3/3] 打包 Electron 应用..."
echo "----------------------------------------"

# electron-builder 打包为 DMG
npx electron-builder --mac

echo ""
echo "========================================"
echo "  构建完成！"
echo "========================================"
echo ""
echo "输出目录: frontend/out/"
echo ""
ls -lh "$SCRIPT_DIR/frontend/out/"*.dmg 2>/dev/null || echo "（DMG 文件列表）"
echo ""
echo "注意："
echo "  - 应用未签名，首次打开需右键 → 打开"
echo "  - 用户需提前安装 Ollama (https://ollama.com)"
