/**
 * 配置页面组件
 *
 * 分组展示所有可配置项，支持：
 * - 查看当前值和默认值
 * - 编辑并保存配置
 * - 一键重置为默认值
 */

import { useState, useEffect } from 'react'
import { Input, InputNumber, Switch, Button, message, Spin } from 'antd'
import { ArrowLeftOutlined, UndoOutlined } from '@ant-design/icons'
import { settingsApi, SettingItem } from '../services/api'

interface SettingsPageProps {
  onBack: () => void
}

function SettingsPage({ onBack }: SettingsPageProps) {
  const [settings, setSettings] = useState<Record<string, SettingItem>>({})
  const [editValues, setEditValues] = useState<Record<string, string | number | boolean>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    setLoading(true)
    try {
      const data = await settingsApi.get()
      setSettings(data.settings)
      const values: Record<string, string | number | boolean> = {}
      for (const [key, item] of Object.entries(data.settings)) {
        values[key] = item.current
      }
      setEditValues(values)
    } catch {
      message.error('加载配置失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // 只提交有变化的配置项
      const changed: Record<string, string | number | boolean> = {}
      for (const [key, value] of Object.entries(editValues)) {
        if (settings[key] && value !== settings[key].current) {
          changed[key] = value
        }
      }
      if (Object.keys(changed).length === 0) {
        message.info('没有需要保存的更改')
        setSaving(false)
        return
      }
      await settingsApi.update(changed)
      message.success('配置已保存')
      await loadSettings()
    } catch {
      message.error('保存配置失败')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    setSaving(true)
    try {
      await settingsApi.reset()
      message.success('已重置为默认值')
      await loadSettings()
    } catch {
      message.error('重置失败')
    } finally {
      setSaving(false)
    }
  }

  // 按分组组织配置项
  const groups: Record<string, { key: string; item: SettingItem }[]> = {}
  for (const [key, item] of Object.entries(settings)) {
    if (!groups[item.group]) groups[item.group] = []
    groups[item.group].push({ key, item })
  }

  if (loading) {
    return (
      <div className="main-content">
        <div className="empty-state">
          <Spin />
        </div>
      </div>
    )
  }

  return (
    <div className="main-content">
      {/* 顶部标题栏 */}
      <div className="main-header">
        <div className="settings-header" style={{ display: 'flex', alignItems: 'center', gap: 12, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <ArrowLeftOutlined onClick={onBack} style={{ cursor: 'pointer', color: '#666' }} />
          <span style={{ fontWeight: 600, fontSize: 16 }}>设置</span>
        </div>
      </div>

      {/* 配置内容区域 */}
      <div className="kb-view-content">
        <div className="kb-view-inner" style={{ maxWidth: 600 }}>
          {Object.entries(groups).map(([groupName, items]) => (
            <div key={groupName} style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#333', marginBottom: 16, paddingBottom: 8, borderBottom: '1px solid #f0f0f0' }}>
                {groupName}
              </div>
              {items.map(({ key, item }) => (
                <div key={key} style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: '#333' }}>{item.label}</span>
                    {item.is_custom && (
                      <span style={{ fontSize: 11, color: '#1890ff', marginLeft: 8 }}>已自定义</span>
                    )}
                  </div>
                  {item.type === 'bool' ? (
                    <Switch
                      checked={!!editValues[key]}
                      onChange={(val) => setEditValues({ ...editValues, [key]: val })}
                    />
                  ) : item.type === 'float' ? (
                    <InputNumber
                      value={editValues[key] as number}
                      onChange={(val) => setEditValues({ ...editValues, [key]: val ?? item.default })}
                      style={{ width: '100%' }}
                      min={0}
                      max={1}
                      step={0.1}
                    />
                  ) : item.type === 'int' ? (
                    <InputNumber
                      value={editValues[key] as number}
                      onChange={(val) => setEditValues({ ...editValues, [key]: val ?? item.default })}
                      style={{ width: '100%' }}
                      min={1}
                    />
                  ) : (
                    <Input
                      value={editValues[key] as string}
                      onChange={(e) => setEditValues({ ...editValues, [key]: e.target.value })}
                    />
                  )}
                  <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
                    默认值：{String(item.default)}
                  </div>
                </div>
              ))}
            </div>
          ))}

          {/* 操作按钮 */}
          <div style={{ display: 'flex', gap: 12, paddingTop: 8, paddingBottom: 24 }}>
            <Button type="primary" onClick={handleSave} loading={saving}>
              保存
            </Button>
            <Button icon={<UndoOutlined />} onClick={handleReset} loading={saving}>
              重置默认
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SettingsPage
