/**
 * Electron 主进程入口文件
 *
 * 负责创建和管理应用窗口以及后端进程：
 * - 生产模式下自动启动 PyInstaller 打包的后端（atlas-backend）
 * - 寻找可用端口、轮询健康检查、管理进程生命周期
 * - 开发环境加载 Vite 开发服务器，生产环境加载打包文件
 * - 通过 IPC 将后端端口同步传递给渲染进程
 */

const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const { spawn } = require('child_process')
const net = require('net')
const http = require('http')

/** 后端子进程引用 */
let backendProcess = null

/** 动态分配的后端端口 */
let backendPort = null

/** 主窗口引用 */
let mainWindow = null

// ===== IPC 通信 =====

// 渲染进程同步获取后端端口
ipcMain.on('get-backend-port', (event) => {
  event.returnValue = backendPort
})

// ===== 端口查找 =====

/**
 * 查找一个可用的 TCP 端口。
 * 通过绑定端口 0 让操作系统自动分配。
 */
function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port
      server.close(() => resolve(port))
    })
    server.on('error', reject)
  })
}

// ===== 后端进程管理 =====

/**
 * 启动后端进程（仅生产模式）。
 * 后端可执行文件位于 Resources/backend/atlas-backend。
 */
async function startBackend() {
  backendPort = await findAvailablePort()
  console.log(`[Atlas] 后端端口: ${backendPort}`)

  // PyInstaller 打包产物位于 Resources/backend/atlas-backend/atlas-backend
  const backendPath = path.join(
    process.resourcesPath,
    'backend',
    'atlas-backend',
    'atlas-backend'
  )

  console.log(`[Atlas] 后端路径: ${backendPath}`)

  backendProcess = spawn(backendPath, [], {
    env: {
      ...process.env,
      ATLAS_PORT: String(backendPort),
      ATLAS_HOST: '127.0.0.1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  // 转发后端日志
  backendProcess.stdout.on('data', (data) => {
    console.log(`[backend] ${data.toString().trim()}`)
  })

  backendProcess.stderr.on('data', (data) => {
    console.error(`[backend] ${data.toString().trim()}`)
  })

  // 后端进程意外退出
  backendProcess.on('exit', (code, signal) => {
    console.log(`[Atlas] 后端进程退出: code=${code}, signal=${signal}`)
    // 仅在非主动关闭时弹出错误对话框
    if (code !== 0 && code !== null && mainWindow && !mainWindow.isDestroyed()) {
      dialog.showErrorBox(
        'Atlas 后端异常退出',
        `后端进程意外退出（退出码: ${code}）。\n请重新启动应用。`
      )
    }
    backendProcess = null
  })

  backendProcess.on('error', (err) => {
    console.error(`[Atlas] 后端启动失败:`, err)
    dialog.showErrorBox(
      'Atlas 后端启动失败',
      `无法启动后端服务：${err.message}\n请确认应用完整性。`
    )
    backendProcess = null
  })
}

/**
 * 轮询后端 /health 接口，等待后端就绪。
 * @param {number} maxRetries - 最大重试次数
 * @param {number} interval - 重试间隔（毫秒）
 */
function waitForBackend(maxRetries = 60, interval = 500) {
  return new Promise((resolve, reject) => {
    let retries = 0

    function check() {
      const req = http.get(
        `http://127.0.0.1:${backendPort}/health`,
        (res) => {
          if (res.statusCode === 200) {
            console.log(`[Atlas] 后端就绪`)
            resolve()
          } else {
            retry()
          }
        }
      )

      req.on('error', () => retry())
      req.setTimeout(2000, () => {
        req.destroy()
        retry()
      })
    }

    function retry() {
      retries++
      if (retries >= maxRetries) {
        reject(new Error('后端启动超时'))
      } else {
        setTimeout(check, interval)
      }
    }

    check()
  })
}

/**
 * 优雅关闭后端进程：先发 SIGTERM，5 秒超时后 SIGKILL。
 */
function stopBackend() {
  return new Promise((resolve) => {
    if (!backendProcess) {
      resolve()
      return
    }

    console.log('[Atlas] 正在关闭后端...')

    const killTimer = setTimeout(() => {
      if (backendProcess) {
        console.log('[Atlas] 后端未响应 SIGTERM，发送 SIGKILL')
        backendProcess.kill('SIGKILL')
      }
      resolve()
    }, 5000)

    backendProcess.once('exit', () => {
      clearTimeout(killTimer)
      console.log('[Atlas] 后端已关闭')
      resolve()
    })

    backendProcess.kill('SIGTERM')
  })
}

// ===== 窗口管理 =====

/**
 * 创建主应用窗口
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,  // 等后端就绪后再显示
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),  // 预加载脚本路径
      contextIsolation: true,   // 启用上下文隔离（安全最佳实践）
      nodeIntegration: false,   // 禁用 Node.js 集成（安全最佳实践）
    },
    titleBarStyle: 'hiddenInset',          // macOS 隐藏标题栏但保留交通灯按钮
    trafficLightPosition: { x: 16, y: 16 }, // 交通灯按钮位置偏移
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  return mainWindow
}

// ===== 应用生命周期 =====

app.whenReady().then(async () => {
  const win = createWindow()

  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    // === 开发模式 ===
    // 不启动后端（开发者自行运行），直接连接 Vite 开发服务器
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
    win.show()
  } else {
    // === 生产模式 ===
    try {
      // 启动后端并等待就绪
      await startBackend()
      await waitForBackend()

      // 加载打包后的前端页面
      win.loadFile(path.join(__dirname, '../../dist/index.html'))
      win.show()
    } catch (err) {
      console.error('[Atlas] 启动失败:', err)
      dialog.showErrorBox(
        'Atlas 启动失败',
        `后端服务启动失败：${err.message}\n请检查应用是否完整，或联系开发者。`
      )
      app.quit()
    }
  }

  // macOS 特性：点击 Dock 图标时，如果没有窗口则重新创建
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
      if (app.isPackaged) {
        mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'))
      } else {
        mainWindow.loadURL('http://localhost:5173')
      }
      mainWindow.show()
    }
  })
})

// 应用退出前关闭后端进程
app.on('before-quit', async (event) => {
  if (backendProcess) {
    event.preventDefault()
    await stopBackend()
    app.quit()
  }
})

// 所有窗口关闭时退出应用（macOS 除外）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
