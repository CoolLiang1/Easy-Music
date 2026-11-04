import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { Icon } from "./Icon";

type ModalProps = {
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  title: string;
  wide?: boolean;
};

export function Modal({ children, footer, onClose, title, wide = false }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const root = dialogRef.current;
    const firstFocusable =
      root?.querySelector<HTMLElement>("[data-autofocus]") ??
      root?.querySelector<HTMLElement>(
        "input, select, textarea, button:not([data-dismiss])",
      );
    firstFocusable?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus?.();
    };
  }, []);

  return createPortal(
    <div
      className="modal-wrap"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="presentation"
    >
      <div
        aria-label={title}
        aria-modal="true"
        className={wide ? "modal wide" : "modal"}
        ref={dialogRef}
        role="dialog"
      >
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button
            aria-label="关闭"
            className="icon-btn sm"
            data-dismiss
            onClick={onClose}
            type="button"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

type ConfirmOptions = {
  confirmLabel?: string;
  message?: ReactNode;
  title: string;
  tone?: "danger" | "default";
};

type PendingConfirm = ConfirmOptions & {
  resolve: (confirmed: boolean) => void;
};

const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(
  null,
);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setPending({ ...options, resolve });
      }),
    [],
  );

  const settle = useCallback(
    (confirmed: boolean) => {
      pending?.resolve(confirmed);
      setPending(null);
    },
    [pending],
  );

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {pending ? (
        <Modal
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => settle(false)} type="button">
                取消
              </button>
              <button
                className={pending.tone === "danger" ? "btn btn-danger" : "btn btn-primary"}
                data-autofocus
                onClick={() => settle(true)}
                type="button"
              >
                {pending.confirmLabel ?? "确定"}
              </button>
            </>
          }
          onClose={() => settle(false)}
          title={pending.title}
        >
          {pending.message ? <div>{pending.message}</div> : null}
        </Modal>
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const value = useContext(ConfirmContext);
  if (!value) {
    throw new Error("useConfirm must be used within ConfirmProvider.");
  }

  return value;
}
