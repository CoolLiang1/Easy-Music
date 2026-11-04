import type { ReactNode } from "react";

import { tagGroupLabels } from "../../i18n/zh";
import type { Tag, TagGroup } from "../../types/tag";
import { Icon, type IconName } from "./Icon";

type PageHeaderProps = {
  actions?: ReactNode;
  back?: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  title: ReactNode;
  titleId?: string;
};

export function PageHeader({ actions, back, description, meta, title, titleId }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="page-header-text">
        {back}
        <h1 className="page-title" id={titleId}>
          {title}
        </h1>
        {description ? <p className="page-desc">{description}</p> : null}
        {meta ? <div className="page-meta">{meta}</div> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

type EmptyStateProps = {
  action?: ReactNode;
  compact?: boolean;
  description?: ReactNode;
  icon?: IconName;
  title: ReactNode;
};

export function EmptyState({ action, compact = false, description, icon = "music", title }: EmptyStateProps) {
  return (
    <div className={compact ? "empty compact" : "empty"}>
      <div className="empty-icon">
        <Icon name={icon} size={24} />
      </div>
      <p className="empty-title">{title}</p>
      {description ? <p className="empty-desc">{description}</p> : null}
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  );
}

type CalloutProps = {
  children: ReactNode;
  title?: ReactNode;
  tone?: "info" | "warn" | "danger" | "success";
};

const calloutIcons: Record<NonNullable<CalloutProps["tone"]>, IconName> = {
  danger: "alert",
  info: "info",
  success: "check",
  warn: "alert",
};

export function Callout({ children, title, tone = "info" }: CalloutProps) {
  return (
    <div className={`callout callout-${tone}`} role={tone === "danger" ? "alert" : "status"}>
      <Icon name={calloutIcons[tone]} size={18} />
      <div className="callout-body">
        {title ? <strong className="callout-title">{title}</strong> : null}
        {children}
      </div>
    </div>
  );
}

export function LoadingRows({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="正在加载" className="skeleton-list">
      {Array.from({ length: rows }, (_, index) => (
        <div className="skeleton-row" key={index}>
          <div className="skeleton" />
          <div className="skeleton" style={{ width: `${55 + ((index * 17) % 35)}%` }} />
          <div className="skeleton" />
        </div>
      ))}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="row" role="status">
      <span aria-hidden="true" className="spinner" />
      {label ? <span>{label}</span> : null}
    </span>
  );
}

export function LevelMeter({ paused = false }: { paused?: boolean }) {
  return (
    <span aria-hidden="true" className={paused ? "eq paused" : "eq"}>
      <span />
      <span />
      <span />
    </span>
  );
}

export const tagGroupOrder: TagGroup[] = ["scene", "type", "feature"];

export function TagChip({ tag }: { tag: Pick<Tag, "name" | "group"> }) {
  return (
    <span className={`chip chip-${tag.group}`} title={`${tagGroupLabels[tag.group] ?? ""}：${tag.name}`}>
      {tag.name}
    </span>
  );
}

export function TagChips({ max, tags }: { max?: number; tags: Array<Pick<Tag, "name" | "group"> & { id?: number }> }) {
  if (tags.length === 0) return null;
  const sorted = [...tags].sort(
    (a, b) => tagGroupOrder.indexOf(a.group) - tagGroupOrder.indexOf(b.group),
  );
  const visible = max ? sorted.slice(0, max) : sorted;
  const hidden = sorted.length - visible.length;

  return (
    <span className="chip-list">
      {visible.map((tag, index) => (
        <TagChip key={tag.id ?? `${tag.group}-${tag.name}-${index}`} tag={tag} />
      ))}
      {hidden > 0 ? <span className="chip chip-more">+{hidden}</span> : null}
    </span>
  );
}

export function GroupHeading({ count, group }: { count?: number; group: TagGroup }) {
  return (
    <div className="group-heading">
      <span className={`group-dot ${group}`} />
      {tagGroupLabels[group]}
      {count !== undefined ? <span className="count">{count}</span> : null}
    </div>
  );
}

export function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}
