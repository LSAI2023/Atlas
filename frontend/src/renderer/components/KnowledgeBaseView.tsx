/**
 * 知识库文档管理视图组件
 *
 * 展示选中知识库的文档列表，支持：
 * - 文档上传：拖拽或点击上传（支持 PDF/DOCX/TXT/MD）
 * - 文档列表：显示文件名、大小、分片数量
 * - 文档预览：右侧抽屉展示文档的所有分片内容（Markdown 渲染）
 * - 文档删除：带确认弹窗
 */

import { useState } from 'react'
import { Upload, Tag, Popconfirm, Spin, Drawer, message, Modal, Input } from 'antd'
import {
  InboxOutlined,
  EyeOutlined,
  DeleteOutlined,
  FileTextOutlined,
  ArrowLeftOutlined,
  EditOutlined,
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
    updateKnowledgeBase,
  } = useKnowledgeBaseStore()

  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')

  // 获取当前选中的知识库信息
  const currentKB = knowledgeBases.find((kb) => kb.id === currentKnowledgeBaseId)

  /** 打开编辑弹窗 */
  const openEditModal = () => {
    if (!currentKB) return
    setEditName(currentKB.name)
    setEditDesc(currentKB.description || '')
    setEditModalOpen(true)
  }

  /** 保存编辑 */
  const handleEditSave = async () => {
    if (!currentKB || !editName.trim()) return
    try {
      await updateKnowledgeBase(currentKB.id, {
        name: editName.trim(),
        description: editDesc.trim(),
      })
      setEditModalOpen(false)
      message.success('知识库已更新')
    } catch {
      message.error('更新失败')
    }
  }

  /** 文件上传配置 */
  const uploadProps: UploadProps = {
    showUploadList: false,  // 不显示 antd 默认的上传列表（使用自定义列表）
    beforeUpload: async (file) => {
      try {
        await uploadDocument(file)
        message.success(`${file.name} 上传成功`)
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
        <div className="kb-view-title">
          <span style={{ fontWeight: 600, fontSize: 16 }}>{currentKB.name}</span>
          {currentKB.description && (
            <span style={{ color: '#999', fontSize: 13, marginLeft: 12 }}>
              {currentKB.description}
            </span>
          )}
          <EditOutlined
            onClick={openEditModal}
            style={{ color: '#999', fontSize: 13, marginLeft: 8, cursor: 'pointer' }}
            title="编辑知识库"
          />
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
                  <FileTextOutlined style={{ color: '#999' }} />
                </div>
                {/* 文件信息：名称、大小、分片数 */}
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
                {/* 操作按钮：预览和删除 */}
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

      {/* 全局加载遮罩（预览加载时显示） */}
      {previewLoading && (
        <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 1000 }}>
          <Spin tip="加载中..." />
        </div>
      )}

      {/* 编辑知识库弹窗 */}
      <Modal
        title="编辑知识库"
        open={editModalOpen}
        onOk={handleEditSave}
        onCancel={() => setEditModalOpen(false)}
        okText="保存"
        cancelText="取消"
        okButtonProps={{ disabled: !editName.trim() }}
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 6, fontSize: 13, color: '#333' }}>名称</div>
          <Input
            placeholder="知识库名称"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
          />
        </div>
        <div>
          <div style={{ marginBottom: 6, fontSize: 13, color: '#333' }}>描述（可选）</div>
          <Input.TextArea
            placeholder="描述知识库的内容和用途，有助于 AI 更好地理解和检索"
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
            rows={3}
          />
        </div>
      </Modal>
    </div>
  )
}

export default KnowledgeBaseView
