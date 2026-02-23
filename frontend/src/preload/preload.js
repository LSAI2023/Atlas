/**
 * Electron 预加载脚本
 *
 * 在渲染进程加载前执行，通过 contextBridge 安全地向渲染进程暴露
 * 有限的 Electron/Node.js API，避免直接暴露完整的 Node.js 能力。
 *
 * 当前仅暴露了平台信息（process.platform），
 * 如需扩展 IPC 通信功能可在此添加方法。
 */

const { contextBridge, ipcRenderer } = require('electron')

// 向渲染进程的 window.electronAPI 注入安全的 API
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,  // 当前操作系统平台（darwin/win32/linux）
})
