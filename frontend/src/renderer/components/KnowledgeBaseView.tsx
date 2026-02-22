import { Upload, Tag, Popconfirm, Spin, Drawer, message } from 'antd'
import {
  InboxOutlined,
  EyeOutlined,
  DeleteOutlined,
  FileTextOutlined,
  ArrowLeftOutlined,
} from '@ant-design/icons'
import type { UploadProps } from 'antd'
import XMarkdown from '@ant-design/x-markdown'
import { useKnowledgeBaseStore } from '../stores/knowledgeBaseStore'

function KnowledgeBaseView() {
  const {
    knowledgeBases,
    currentKnowledgeBaseId,
    currentDocuments,
    uploading,
    previewDocument,
    previewLoading,
    uploadDocument,
    deleteDocument,
    fetchDocumentDetail,
    clearPreview,
  } = useKnowledgeBaseStore()

  const currentKB = knowledgeBases.find((kb) => kb.id === currentKnowledgeBaseId)

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

  if (!currentKB) {
    return (
      <div className="main-content">
        <div className="empty-state">
          <FileTextOutlined className="empty-state-icon" />
          <div style={{ fontSize: 16, marginBottom: 8 }}>选择一个知识库</div>
          <div style={{ fontSize: 13 }}>从左侧选择或创建知识库来管理文档</div>
        </div>
      </div>
    )
  }

  return (
    <div className="main-content">
      {/* Header */}
      <div className="main-header">
        <div className="kb-view-title">
          <span style={{ fontWeight: 600, fontSize: 16 }}>{currentKB.name}</span>
          {currentKB.description && (
            <span style={{ color: '#999', fontSize: 13, marginLeft: 12 }}>
              {currentKB.description}
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="kb-view-content">
        <div className="kb-view-inner">
          {/* Upload area */}
          <Upload {...uploadProps}>
            <div className="kb-upload-area">
              <InboxOutlined style={{ fontSize: 18, color: '#999' }} />
              <span style={{ color: '#666' }}>点击或拖拽上传文档</span>
              <span style={{ color: '#999', fontSize: 12 }}>
                支持 PDF、Word、TXT、MD
              </span>
              {uploading && <Spin size="small" />}
            </div>
          </Upload>

          {/* Document list */}
          <div className="kb-document-list">
            {currentDocuments.map((doc) => (
              <div key={doc.id} className="kb-document-card">
                <div className="kb-document-card-icon">
                  <FileTextOutlined style={{ color: '#999' }} />
                </div>
                <div className="kb-document-card-info">
                  <div className="kb-document-card-name">{doc.filename}</div>
                  <div className="kb-document-card-meta">
                    <span>{formatFileSize(doc.file_size)}</span>
                    <span style={{ margin: '0 6px' }}>·</span>
                    {doc.chunk_count > 0 ? (
                      <Tag color="success" className="kb-chunk-tag">
                        {doc.chunk_count} 个片段
                      </Tag>
                    ) : (
                      <Tag color="warning" className="kb-chunk-tag">
                        未分片
                      </Tag>
                    )}
                  </div>
                </div>
                <div className="kb-document-card-actions">
                  <EyeOutlined
                    onClick={() => fetchDocumentDetail(doc.id)}
                    style={{ color: '#666', marginRight: 8 }}
                    title="预览分片"
                  />
                  <Popconfirm
                    title="删除文档"
                    description="确定要删除这个文档吗？"
                    onConfirm={() => deleteDocument(doc.id)}
                    okText="删除"
                    cancelText="取消"
                  >
                    <DeleteOutlined style={{ color: '#999' }} title="删除" />
                  </Popconfirm>
                </div>
              </div>
            ))}
            {currentDocuments.length === 0 && !uploading && (
              <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>
                暂无文档，请上传
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chunk preview drawer */}
      <Drawer
        title={
          previewDocument ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ArrowLeftOutlined
                onClick={clearPreview}
                style={{ cursor: 'pointer', color: '#666' }}
              />
              <span>文档预览</span>
            </div>
          ) : '文档预览'
        }
        placement="right"
        width={'calc(100vw - 260px)'}
        open={!!previewDocument}
        onClose={clearPreview}
        styles={{ body: { padding: 0 } }}
      >
        {previewDocument && (
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
                    <div className="document-chunk-content">
                      <XMarkdown content={chunk.content} />
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>
                  暂无分片数据
                </div>
              )}
            </div>
          </div>
        )}
      </Drawer>

      {previewLoading && (
        <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 1000 }}>
          <Spin tip="加载中..." />
        </div>
      )}
    </div>
  )
}

export default KnowledgeBaseView
