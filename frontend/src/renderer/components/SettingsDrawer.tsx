import { useEffect } from 'react'
import { Drawer, Upload, Tag, Popconfirm, Spin, message } from 'antd'
import {
  InboxOutlined,
  EyeOutlined,
  DeleteOutlined,
  CheckOutlined,
  FileTextOutlined,
  ArrowLeftOutlined,
} from '@ant-design/icons'
import type { UploadProps } from 'antd'
import { useDocumentStore } from '../stores/documentStore'

interface SettingsDrawerProps {
  open: boolean
  onClose: () => void
}

function SettingsDrawer({ open, onClose }: SettingsDrawerProps) {
  const {
    documents,
    selectedDocumentIds,
    uploading,
    previewDocument,
    previewLoading,
    fetchDocuments,
    uploadDocument,
    deleteDocument,
    toggleDocumentSelection,
    fetchDocumentDetail,
    clearPreview,
  } = useDocumentStore()

  useEffect(() => {
    if (open) {
      fetchDocuments()
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      clearPreview()
    }
  }, [open])

  const uploadProps: UploadProps = {
    showUploadList: false,
    beforeUpload: async (file) => {
      try {
        await uploadDocument(file)
        message.success(`${file.name} 上传成功`)
      } catch {
        message.error(`${file.name} 上传失败`)
      }
      return false
    },
    accept: '.pdf,.docx,.txt,.md',
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // Preview view
  if (previewDocument) {
    return (
      <Drawer
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ArrowLeftOutlined
              onClick={clearPreview}
              style={{ cursor: 'pointer', color: '#666' }}
            />
            <span>文档预览</span>
          </div>
        }
        placement="right"
        width={520}
        open={open}
        onClose={onClose}
        styles={{ body: { padding: 0 } }}
      >
        <div className="document-preview">
          <div className="document-preview-header">
            <div className="document-preview-filename">{previewDocument.filename}</div>
            <div className="document-preview-meta">
              <span>{formatFileSize(previewDocument.file_size)}</span>
              <span style={{ margin: '0 8px' }}>·</span>
              <span>{previewDocument.file_type}</span>
            </div>
            <div style={{ marginTop: 8 }}>
              {previewDocument.chunk_count > 0 ? (
                <Tag color="success">已分片 ({previewDocument.chunk_count}个片段)</Tag>
              ) : (
                <Tag color="warning">未分片</Tag>
              )}
            </div>
          </div>
          <div className="document-preview-chunks">
            {previewDocument.chunks && previewDocument.chunks.length > 0 ? (
              previewDocument.chunks.map((chunk, index) => (
                <div key={index} className="document-chunk-card">
                  <div className="document-chunk-header">
                    片段 {chunk.metadata.chunk_index + 1} / {chunk.metadata.total_chunks}
                  </div>
                  <div className="document-chunk-content">{chunk.content}</div>
                </div>
              ))
            ) : (
              <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>
                暂无分片数据
              </div>
            )}
          </div>
        </div>
      </Drawer>
    )
  }

  // Main view - knowledge base management
  return (
    <Drawer
      title="设置"
      placement="right"
      width={420}
      open={open}
      onClose={onClose}
      styles={{ body: { padding: 0 } }}
    >
      <div className="settings-section">
        <div className="settings-section-title">知识库管理</div>

        {/* Upload area */}
        <Upload {...uploadProps}>
          <div className="settings-upload-area">
            <InboxOutlined style={{ fontSize: 28, color: '#999', marginBottom: 8 }} />
            <div style={{ color: '#666' }}>点击或拖拽上传文档</div>
            <div style={{ color: '#999', fontSize: 12, marginTop: 4 }}>
              支持 PDF、Word、TXT、MD
            </div>
            {uploading && <Spin size="small" style={{ marginTop: 8 }} />}
          </div>
        </Upload>

        {/* Document list */}
        <div className="settings-document-list">
          {documents.map((doc) => {
            const isSelected = selectedDocumentIds.includes(doc.id)
            return (
              <div
                key={doc.id}
                className={`settings-document-card ${isSelected ? 'selected' : ''}`}
                onClick={() => toggleDocumentSelection(doc.id)}
              >
                <div className="settings-document-card-icon">
                  {isSelected ? (
                    <CheckOutlined style={{ color: '#52c41a' }} />
                  ) : (
                    <FileTextOutlined style={{ color: '#999' }} />
                  )}
                </div>
                <div className="settings-document-card-info">
                  <div className="settings-document-card-name">{doc.filename}</div>
                  <div className="settings-document-card-meta">
                    <span>{formatFileSize(doc.file_size)}</span>
                    <span style={{ margin: '0 6px' }}>·</span>
                    {doc.chunk_count > 0 ? (
                      <Tag color="success" className="settings-chunk-tag">
                        已分片 ({doc.chunk_count}个片段)
                      </Tag>
                    ) : (
                      <Tag color="warning" className="settings-chunk-tag">
                        未分片
                      </Tag>
                    )}
                  </div>
                </div>
                <div className="settings-document-card-actions">
                  <EyeOutlined
                    onClick={(e) => {
                      e.stopPropagation()
                      fetchDocumentDetail(doc.id)
                    }}
                    style={{ color: '#666', marginRight: 8 }}
                    title="预览"
                  />
                  <Popconfirm
                    title="删除文档"
                    description="确定要删除这个文档吗？"
                    onConfirm={(e) => {
                      e?.stopPropagation()
                      deleteDocument(doc.id)
                    }}
                    okText="删除"
                    cancelText="取消"
                  >
                    <DeleteOutlined
                      onClick={(e) => e.stopPropagation()}
                      style={{ color: '#999' }}
                      title="删除"
                    />
                  </Popconfirm>
                </div>
              </div>
            )
          })}
          {documents.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>
              暂无文档，请上传
            </div>
          )}
        </div>
      </div>

      {previewLoading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Spin tip="加载中..." />
        </div>
      )}
    </Drawer>
  )
}

export default SettingsDrawer
