import { Typography, Avatar, Spin } from 'antd'
import { UserOutlined, RobotOutlined } from '@ant-design/icons'
import { Message } from '../services/api'
import dayjs from 'dayjs'

const { Text, Paragraph } = Typography

interface MessageBubbleProps {
  message: Message
  isStreaming?: boolean
}

function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const isUser = message.role === 'user'

  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        marginBottom: 24,
        flexDirection: isUser ? 'row-reverse' : 'row',
      }}
    >
      <Avatar
        icon={isUser ? <UserOutlined /> : <RobotOutlined />}
        style={{
          backgroundColor: isUser ? '#1890ff' : '#52c41a',
          flexShrink: 0,
        }}
      />
      <div
        style={{
          maxWidth: '70%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: isUser ? 'flex-end' : 'flex-start',
        }}
      >
        <div
          style={{
            padding: '12px 16px',
            borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
            background: isUser ? '#1890ff' : '#fff',
            color: isUser ? '#fff' : 'inherit',
            boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
          }}
        >
          <Paragraph
            style={{
              margin: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              color: isUser ? '#fff' : 'inherit',
            }}
          >
            {message.content}
            {isStreaming && (
              <span
                style={{
                  display: 'inline-block',
                  width: 8,
                  height: 16,
                  background: '#52c41a',
                  marginLeft: 2,
                  animation: 'blink 1s infinite',
                }}
              />
            )}
          </Paragraph>
        </div>
        <Text
          type="secondary"
          style={{
            fontSize: 11,
            marginTop: 4,
          }}
        >
          {dayjs(message.created_at).format('HH:mm')}
        </Text>
      </div>
      <style>{`
        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
      `}</style>
    </div>
  )
}

export default MessageBubble
