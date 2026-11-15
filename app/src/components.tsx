import type { ReactNode } from "react";

type ButtonVariant = 'primary' | 'secondary' | 'tertiary'

export function Button({
  children,
  variant = 'secondary',
}: {
  children: ReactNode
  variant?: ButtonVariant
}) {
  return <button className={`btn ${variant}`}>{children}</button>
}

export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card">
      <header className="card-header">
        <h3>{title}</h3>
      </header>
      {children}
    </section>
  )
}

export function StatusBadge({ label, kind }: { label: string; kind: 'info' | 'warn' | 'good' }) {
  return <span className={`badge ${kind}`}>{label}</span>
}
