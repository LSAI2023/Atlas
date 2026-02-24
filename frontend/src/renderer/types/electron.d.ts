export interface ElectronAPI {
  platform: string
  backendPort?: number
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
