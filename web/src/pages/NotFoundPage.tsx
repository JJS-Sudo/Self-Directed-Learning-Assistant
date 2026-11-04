import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <section className="area">
      <p className="eyebrow">404</p>
      <h1 className="area-title">没有这个区</h1>
      <p className="lede">地址里的路径不属于六个区。检查一下拼写，或者回到目标重新开始。</p>
      <p className="action-row">
        <Link className="link" to="/">
          回到目标
        </Link>
      </p>
    </section>
  )
}
