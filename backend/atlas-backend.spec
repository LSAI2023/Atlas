# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller 打包配置文件

将 Atlas 后端打包为独立可执行文件。
使用 collect_submodules 自动收集 chromadb 等复杂包的全部子模块，
避免手工列 hidden imports 时遗漏动态导入的模块。

使用方法：
    cd backend
    pyinstaller atlas-backend.spec
"""

import sys
from pathlib import Path
from PyInstaller.utils.hooks import collect_submodules, collect_data_files

block_cipher = None

# 项目根目录
backend_dir = Path(SPECPATH)

# 自动收集 chromadb 全部子模块（含动态导入的 rust、telemetry 等）
chromadb_hiddenimports = collect_submodules('chromadb')
chromadb_datas = collect_data_files('chromadb')

# 自动收集其他有动态导入的包
extra_hiddenimports = (
    collect_submodules('onnxruntime')
    + collect_submodules('langchain_text_splitters')
    + collect_submodules('langchain_core')
    + collect_submodules('pydantic')
    + collect_submodules('pydantic_settings')
)

extra_datas = (
    collect_data_files('chromadb')
    + collect_data_files('onnxruntime')
)

a = Analysis(
    ['run.py'],
    pathex=[str(backend_dir)],
    binaries=[],
    datas=extra_datas,
    hiddenimports=chromadb_hiddenimports + extra_hiddenimports + [
        # FastAPI & ASGI
        'uvicorn',
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',

        'fastapi',
        'fastapi.middleware',
        'fastapi.middleware.cors',

        'starlette',
        'starlette.responses',
        'starlette.middleware',
        'starlette.routing',

        # SQLAlchemy + aiosqlite
        'sqlalchemy',
        'sqlalchemy.ext.asyncio',
        'sqlalchemy.dialects.sqlite',
        'aiosqlite',

        # ChromaDB 外部依赖
        'onnxruntime',
        'tokenizers',
        'tqdm',
        'posthog',
        'overrides',
        'pypika',
        'tenacity',

        # 文档解析
        'fitz',        # PyMuPDF
        'pymupdf',
        'docx',        # python-docx
        'chardet',

        # Ollama 客户端
        'ollama',
        'httpx',

        # 其他可能需要的依赖
        'multipart',
        'python_multipart',
        'anyio',
        'anyio._backends',
        'anyio._backends._asyncio',
        'sniffio',
        'certifi',
        'httpcore',
        'idna',
        'h11',

        # 应用自身模块
        'app',
        'app.main',
        'app.config',
        'app.models',
        'app.models.models',
        'app.db',
        'app.db.database',
        'app.db.crud',
        'app.core',
        'app.core.rag',
        'app.core.vectorstore',
        'app.core.chunker',
        'app.core.parser',
        'app.core.ollama',
        'app.api',
        'app.api.chat',
        'app.api.documents',
        'app.api.knowledge_bases',
        'app.api.history',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'tkinter',
        'matplotlib',
        'scipy',
        'numpy.testing',
        'pytest',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='atlas-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,    # 不弹出终端窗口
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='atlas-backend',
)
