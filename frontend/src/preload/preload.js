/**
 * Electron 预加载脚本
 *
 * 在渲染进程加载前执行，通过 contextBridge 安全地向渲染进程暴露
 * 有限的 Electron/Node.js API，避免直接暴露完整的 Node.js 能力。
 *
 * 暴露的 API：
 * - platform: 当前操作系统平台
 * - backendPort: 后端服务端口号（生产模式由主进程动态分配）
 */

const { contextBridge, ipcRenderer } = require('electron')

// 同步获取后端端口（生产模式下由主进程分配，开发模式返回 undefined）
const backendPort = ipcRenderer.sendSync('get-backend-port')

// 向渲染进程的 window.electronAPI 注入安全的 API
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,       // 当前操作系统平台（darwin/win32/linux）
  backendPort: backendPort || undefined,  // 后端服务端口号
})
