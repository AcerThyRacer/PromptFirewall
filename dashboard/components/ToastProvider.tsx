'use client';
import React, {
    createContext,
    useContext,
    useState,
    useCallback,
    type ReactNode,
} from 'react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
    id: number;
    message: string;
    type: ToastType;
}

interface ToastContextType {
    toasts: Toast[];
    addToast: (message: string, type?: ToastType, durationMs?: number) => void;
}

const ToastContext = createContext<ToastContextType>({
    toasts: [],
    addToast: () => { },
});

export const useToast = () => useContext(ToastContext);

let toastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const addToast = useCallback(
        (message: string, type: ToastType = 'info', durationMs = 3000) => {
            const id = ++toastId;
            setToasts((prev) => [...prev, { id, message, type }]);
            setTimeout(() => {
                setToasts((prev) => prev.filter((t) => t.id !== id));
            }, durationMs);
        },
        []
    );

    const ICONS: Record<ToastType, string> = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️',
    };

    return (
        <ToastContext.Provider value={{ toasts, addToast }}>
            {children}
            <div className="toast-container" aria-live="polite">
                {toasts.map((toast) => (
                    <div
                        key={toast.id}
                        className={`toast toast-${toast.type}`}
                        role="alert"
                    >
                        <span className="toast-icon">{ICONS[toast.type]}</span>
                        <span className="toast-message">{toast.message}</span>
                        <button
                            className="toast-close"
                            onClick={() =>
                                setToasts((prev) =>
                                    prev.filter((t) => t.id !== toast.id)
                                )
                            }
                            aria-label="Dismiss"
                        >
                            ✕
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}
