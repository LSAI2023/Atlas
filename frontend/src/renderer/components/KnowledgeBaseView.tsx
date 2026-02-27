/**
 * 知识库文档管理视图组件
 *
 * 展示选中知识库的文档列表，支持：
 * - 文档上传：拖拽或点击上传（支持 PDF/DOCX/TXT/MD）
 * - 文档列表：显示文件名、大小、分片数量
 * - 文档预览：右侧抽屉展示文档的所有分片内容（Markdown 渲染）
 * - 文档删除：带确认弹窗
 */

import { useEffect, useRef } from 'react'
import { Upload, Tag, Popconfirm, Spin, Drawer, message, Button } from 'antd'
import {
  InboxOutlined,
  EyeOutlined,
  DeleteOutlined,
  FileTextOutlined,
  ArrowLeftOutlined,
  ReloadOutlined,
  LoadingOutlined,
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
    reindexDocument,
    refreshDocuments,
    fetchDocumentDetail,
    clearPreview,
  } = useKnowledgeBaseStore()

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 当文档列表中存在 pending 或 processing 状态时，自动轮询刷新
  const hasPendingDocs = currentDocuments.some(
    (doc) => doc.status === 'pending' || doc.status === 'processing'
  )

  useEffect(() => {
    if (hasPendingDocs) {
      pollingRef.current = setInterval(() => {
        refreshDocuments()
      }, 3000)
    }
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
  }, [hasPendingDocs, refreshDocuments])

  // 获取当前选中的知识库信息
  const currentKB = knowledgeBases.find((kb) => kb.id === currentKnowledgeBaseId)

  /** 文件上传配置 */
  const uploadProps: UploadProps = {
    showUploadList: false,  // 不显示 antd 默认的上传列表（使用自定义列表）
    beforeUpload: async (file) => {
      try {
        await uploadDocument(file)
        message.success(`${file.name} 已上传，正在后台处理分片`)
      } catch {
        message.error(`${file.name} 上传失败`)
      }
      return false  // 阻止 antd 的默认上传行为，使用自定义上传逻辑
    },
    accept: '.pdf,.docx,.txt,.md',  // 限制可选文件类型
  }

  /** 格式化文件大小为人类可读格式 */
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // 未选中知识库时显示空状态引导
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
      {/* 顶部：知识库名称和描述 */}
      <div className="main-header">
        <div className="kb-view-title" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
          <div style={{ fontWeight: 600, fontSize: 16, lineHeight: 1.4 }}>{currentKB.name}</div>
          <div style={{ color: '#999', fontSize: 13, lineHeight: 1.4 }}>
            {currentKB.description || '暂无备注'}
          </div>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="kb-view-content">
        <div className="kb-view-inner">
          {/* 文件上传区域 */}
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

          {/* 文档列表 */}
          <div className="kb-document-list">
            {currentDocuments.map((doc) => (
              <div key={doc.id} className="kb-document-card">
                {/* 文件图标 */}
                <div className="kb-document-card-icon">
                  {doc.status === 'pending' || doc.status === 'processing' ? (
                    <LoadingOutlined style={{ color: '#1677ff' }} />
                  ) : (
                    <FileTextOutlined style={{ color: '#999' }} />
                  )}
                </div>
                {/* 文件信息：名称、大小、状态/分片数 */}
                <div className="kb-document-card-info">
                  <div className="kb-document-card-name">{doc.filename}</div>
                  <div className="kb-document-card-meta">
                    <span>{formatFileSize(doc.file_size)}</span>
                    <span style={{ margin: '0 6px' }}>·</span>
                    {doc.status === 'pending' && (
                      <Tag color="default" className="kb-chunk-tag">等待处理</Tag>
                    )}
                    {doc.status === 'processing' && (
                      <Tag color="processing" className="kb-chunk-tag">分片处理中</Tag>
                    )}
                    {doc.status === 'failed' && (
                      <Tag color="error" className="kb-chunk-tag">处理失败</Tag>
                    )}
                    {doc.status === 'completed' && (
                      doc.chunk_count > 0 ? (
                        <Tag color="success" className="kb-chunk-tag">
                          {doc.chunk_count} 个片段
                        </Tag>
                      ) : (
                        <Tag color="warning" className="kb-chunk-tag">
                          未分片
                        </Tag>
                      )
                    )}
                  </div>
                </div>
                {/* 操作按钮：重试/预览/删除 */}
                <div className="kb-document-card-actions">
                  {doc.status === 'failed' && (
                    <Button
                      type="link"
                      size="small"
                      icon={<ReloadOutlined />}
                      onClick={() => {
                        reindexDocument(doc.id)
                        message.info('重新分片已启动')
                      }}
                      style={{ padding: 0, marginRight: 8 }}
                    >
                      重试
                    </Button>
                  )}
                  {doc.status === 'completed' && (
                    <EyeOutlined
                      onClick={() => fetchDocumentDetail(doc.id)}
                      style={{ color: '#666', marginRight: 8 }}
                      title="预览分片"
                    />
                  )}
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
            {/* 空状态：无文档时提示上传 */}
            {currentDocuments.length === 0 && !uploading && (
              <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>
                暂无文档，请上传
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 文档预览抽屉：展示文档的所有分片内容 */}
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
            {/* 文档元信息 */}
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
            {/* 分片内容列表 */}
            <div className="document-preview-chunks">
              {previewDocument.summary && (
                <div className="document-chunk-card">
                  <div className="document-chunk-header">文档摘要</div>
                  <div className="document-chunk-content">
                    <XMarkdown content={previewDocument.summary} />
                  </div>
                </div>
              )}
              {previewDocument.chunks && previewDocument.chunks.length > 0 ? (
                previewDocument.chunks.map((chunk, index) => (
                  <div key={index} className="document-chunk-card">
                    <div className="document-chunk-header">
                      片段 {typeof chunk.metadata.chunk_index === 'number' ? chunk.metadata.chunk_index + 1 : index + 1}
                      {' / '}
                      {typeof chunk.metadata.total_chunks === 'number' ? chunk.metadata.total_chunks : previewDocument.chunks.length}
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

      {/* 全局加载遮罩（预览加载时显示） */}
      {previewLoading && (
        <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 1000 }}>
          <Spin tip="加载中..." />
        </div>
      )}

    </div>
  )
}

export default KnowledgeBaseView
