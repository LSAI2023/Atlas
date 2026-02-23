/**
 * Electron 主进程入口文件
 *
 * 负责创建和管理应用窗口：
 * - 创建 BrowserWindow 并配置窗口属性
 * - 开发环境加载 Vite 开发服务器，生产环境加载打包文件
 * - 处理窗口生命周期事件（macOS 激活时重新创建窗口等）
 */

const { app, BrowserWindow } = require('electron')
const path = require('path')

/**
 * 创建主应用窗口
 */
function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),  // 预加载脚本路径
      contextIsolation: true,   // 启用上下文隔离（安全最佳实践）
      nodeIntegration: false,   // 禁用 Node.js 集成（安全最佳实践）
    },
    titleBarStyle: 'hiddenInset',          // macOS 隐藏标题栏但保留交通灯按钮
    trafficLightPosition: { x: 16, y: 16 }, // 交通灯按钮位置偏移
  })

  // 根据环境加载不同的页面来源
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    // 开发环境：连接 Vite 开发服务器（支持热更新）
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    // 生产环境：加载打包后的静态文件
    win.loadFile(path.join(__dirname, '../index.html'))
  }
}

// 应用就绪后创建窗口
app.whenReady().then(() => {
  createWindow()

  // macOS 特性：点击 Dock 图标时，如果没有窗口则重新创建
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// 所有窗口关闭时退出应用（macOS 除外，macOS 应用会保持在 Dock 中）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
