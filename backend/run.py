"""
PyInstaller 入口脚本

用 Python 代码启动 uvicorn，作为 PyInstaller 打包的入口点。
通过环境变量 ATLAS_PORT 接收 Electron 主进程分配的端口。
"""

import os
import uvicorn


def main():
    host = os.environ.get("ATLAS_HOST", "127.0.0.1")
    port = int(os.environ.get("ATLAS_PORT", "8000"))

    uvicorn.run(
        "app.main:app",
        host=host,
        port=port,
        log_level="info",
    )


if __name__ == "__main__":
    main()
