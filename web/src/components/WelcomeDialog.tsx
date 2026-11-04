import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Copy, Database, KeyRound, Leaf, MessageCircle, Sparkles, X } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
}

const WECHAT_ID = 'wxid_0bz0pezewo1w22'

export function WelcomeDialog({ open, onClose }: Props) {
  const [copied, setCopied] = useState(false)
  const primaryRef = useRef<HTMLButtonElement>(null)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!open) return
    setCopied(false)
    primaryRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  useEffect(
    () => () => {
      if (copyTimer.current !== null) clearTimeout(copyTimer.current)
    },
    [],
  )

  if (!open) return null

  const copyWechat = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(WECHAT_ID)
      setCopied(true)
      if (copyTimer.current !== null) clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div
      className="welcome-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="welcome-card" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
        <button type="button" className="welcome-close" aria-label="关闭" onClick={onClose}>
          <X size={16} strokeWidth={1.8} />
        </button>

        <header className="welcome-head">
          <span className="welcome-mark" aria-hidden="true">
            <Leaf size={20} strokeWidth={1.7} />
          </span>
          <p className="welcome-eyebrow">第一次见面 · 3 分钟上手</p>
          <h2 id="welcome-title">欢迎使用自我导向学习辅助器</h2>
          <p className="welcome-sub">
            把一个目标变成一条学得完的路径。数据全部留在本机，不注册、不上传。
          </p>
        </header>

        <ol className="welcome-steps">
          <li>
            <span className="step-num">1</span>
            <div>
              <strong>先建一个目标</strong>
              <p>
                在「目标」写下想学的东西和一句可判定的成功判据，地图、路径、验收都会围着它长出来。
              </p>
            </div>
          </li>
          <li>
            <span className="step-num">2</span>
            <div>
              <strong>配好 API Key</strong>
              <p>
                右上角钥匙图标 → 「API Key」。DeepSeek 必填，用来生成地图 / 路径 / 题目；Tavily
                可选，用来联网找资源。Key 只存在本机，只回显后 4 位，也不会进导出包。
              </p>
            </div>
          </li>
          <li>
            <span className="step-num">3</span>
            <div>
              <strong>让 AI 开始拆解</strong>
              <p>去「地图」点「AI 自动生成知识地图」，或在「路径」生成学习路径。之后随时可改。</p>
            </div>
          </li>
        </ol>

        <div className="welcome-keys">
          <div className="welcome-key-item">
            <KeyRound size={15} strokeWidth={1.7} aria-hidden="true" />
            <div>
              <strong>DeepSeek</strong>
              <span>必填 · 按量计费，一次生成约一两分钱</span>
            </div>
          </div>
          <div className="welcome-key-item">
            <Database size={15} strokeWidth={1.7} aria-hidden="true" />
            <div>
              <strong>Tavily</strong>
              <span>可选 · 有免费额度，没配就只用模型知识</span>
            </div>
          </div>
          <Link to="/settings" className="link welcome-key-link" onClick={onClose}>
            去配置 API Key →
          </Link>
        </div>

        <div className="welcome-feedback">
          <MessageCircle size={16} strokeWidth={1.7} aria-hidden="true" />
          <div className="welcome-feedback-text">
            <strong>遇到问题、想提需求或优化建议，加我微信</strong>
            <span>加好友时备注「学习辅助器」，我会尽快回。</span>
          </div>
          <code className="wechat-id">{WECHAT_ID}</code>
          <button type="button" className="wechat-copy" onClick={() => void copyWechat()}>
            {copied ? (
              <>
                <Check size={14} strokeWidth={2} /> 已复制
              </>
            ) : (
              <>
                <Copy size={14} strokeWidth={1.8} /> 复制
              </>
            )}
          </button>
        </div>

        <div className="welcome-actions">
          <p className="welcome-hint">
            <Sparkles size={13} strokeWidth={1.7} aria-hidden="true" />
            没有 Key 也能先建目标、看示例库 · 非商业免费，商用需授权
          </p>
          <button type="button" className="button" ref={primaryRef} onClick={onClose}>
            我知道了，开始使用
          </button>
        </div>
      </div>
    </div>
  )
}
