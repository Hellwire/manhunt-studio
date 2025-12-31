// src/UIError.js
export default class UIError {
    static _installed = false;
    static _container = null;
    static _lastFingerprint = null;
    static _lastTime = 0;

    static installGlobalHooks() {
        if (UIError._installed) return;
        UIError._installed = true;

        window.addEventListener("error", (e) => {
            // e.error may be undefined for some script/load errors
            const err = e?.error || new Error(e?.message || "Unknown error");
            UIError.report(err, "window.error");
        });

        window.addEventListener("unhandledrejection", (e) => {
            const reason = e?.reason;
            const err = reason instanceof Error ? reason : new Error(String(reason ?? "Unhandled promise rejection"));
            UIError.report(err, "window.unhandledrejection");
        });
    }

    static guard(fn, context = "UI action") {
        try {
            const res = fn();

            // Catch async errors if callback returns a Promise
            if (res && typeof res.then === "function" && typeof res.catch === "function") {
                return res.catch((err) => {
                    UIError.report(err, context);
                    // prevent silent failures; rethrow if you want upstream to handle too
                    return undefined;
                });
            }

            return res;
        } catch (err) {
            UIError.report(err, context);
            return undefined;
        }
    }

    static report(err, context = "Error") {
        // Normalize to Error
        const e = err instanceof Error ? err : new Error(String(err ?? "Unknown error"));
        const msg = (e && e.message) ? e.message : String(e);

        // Avoid spamming identical popups rapidly (same message+context within 500ms)
        const fingerprint = `${context}::${msg}`;
        const now = Date.now();
        if (UIError._lastFingerprint === fingerprint && (now - UIError._lastTime) < 500) {
            UIError._lastTime = now;
            console.error(`[UIError] ${context}`, e);
            return;
        }
        UIError._lastFingerprint = fingerprint;
        UIError._lastTime = now;

        console.error(`[UIError] ${context}`, e);
        UIError._toast({
            title: "Action failed",
            subtitle: context,
            message: msg,
            details: e.stack ? String(e.stack) : null,
        });
    }

    static _ensureContainer() {
        if (UIError._container) return UIError._container;

        // CSS (injected once)
        const style = document.createElement("style");
        style.type = "text/css";
        style.textContent = `
            .uierr-container{
                position: fixed;
                top: 12px;
                right: 12px;
                z-index: 999999;
                max-width: 520px;
                width: calc(100vw - 24px);
                pointer-events: none;
                font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
            }
            .uierr-toast{
                pointer-events: auto;
                margin-bottom: 10px;
                border: 1px solid rgba(0,0,0,0.15);
                border-radius: 10px;
                background: rgba(25,25,25,0.96);
                color: #fff;
                box-shadow: 0 8px 24px rgba(0,0,0,0.25);
                overflow: hidden;
            }
            .uierr-head{
                display:flex;
                align-items:flex-start;
                justify-content:space-between;
                padding: 10px 12px;
                gap: 10px;
            }
            .uierr-title{
                font-weight: 700;
                font-size: 14px;
                line-height: 1.2;
                margin: 0;
            }
            .uierr-sub{
                margin: 2px 0 0 0;
                font-size: 12px;
                opacity: 0.9;
                word-break: break-word;
            }
            .uierr-body{
                padding: 0 12px 12px 12px;
                font-size: 13px;
                line-height: 1.35;
                word-break: break-word;
                white-space: pre-wrap;
            }
            .uierr-actions{
                display:flex;
                gap: 8px;
                padding: 0 12px 12px 12px;
                flex-wrap: wrap;
            }
            .uierr-btn{
                border: 1px solid rgba(255,255,255,0.18);
                background: rgba(255,255,255,0.08);
                color: #fff;
                border-radius: 8px;
                padding: 6px 10px;
                cursor: pointer;
                font-size: 12px;
            }
            .uierr-btn:hover{
                background: rgba(255,255,255,0.12);
            }
            .uierr-close{
                border: none;
                background: transparent;
                color: rgba(255,255,255,0.85);
                cursor: pointer;
                font-size: 18px;
                line-height: 1;
                padding: 0 2px;
                margin-top: -2px;
            }
            .uierr-details{
                display:none;
                padding: 10px 12px 12px 12px;
                border-top: 1px solid rgba(255,255,255,0.12);
                font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
                font-size: 11px;
                opacity: 0.95;
                white-space: pre-wrap;
                word-break: break-word;
                max-height: 200px;
                overflow: auto;
            }
            .uierr-toast.uierr-open .uierr-details{
                display:block;
            }
        `;
        document.head.appendChild(style);

        const container = document.createElement("div");
        container.className = "uierr-container";
        document.body.appendChild(container);

        UIError._container = container;
        return container;
    }

    static _toast({ title, subtitle, message, details }) {
        const container = UIError._ensureContainer();

        const toast = document.createElement("div");
        toast.className = "uierr-toast";

        const head = document.createElement("div");
        head.className = "uierr-head";

        const left = document.createElement("div");
        const hTitle = document.createElement("div");
        hTitle.className = "uierr-title";
        hTitle.textContent = title || "Error";

        const hSub = document.createElement("div");
        hSub.className = "uierr-sub";
        hSub.textContent = subtitle || "";

        left.appendChild(hTitle);
        left.appendChild(hSub);

        const close = document.createElement("button");
        close.className = "uierr-close";
        close.type = "button";
        close.textContent = "×";
        close.addEventListener("click", () => toast.remove());

        head.appendChild(left);
        head.appendChild(close);

        const body = document.createElement("div");
        body.className = "uierr-body";
        body.textContent = message || "Unknown error";

        const actions = document.createElement("div");
        actions.className = "uierr-actions";

        const btnDetails = document.createElement("button");
        btnDetails.className = "uierr-btn";
        btnDetails.type = "button";
        btnDetails.textContent = details ? "Details" : "Dismiss";
        btnDetails.addEventListener("click", () => {
            if (!details) {
                toast.remove();
                return;
            }
            toast.classList.toggle("uierr-open");
        });

        const btnCopy = document.createElement("button");
        btnCopy.className = "uierr-btn";
        btnCopy.type = "button";
        btnCopy.textContent = "Copy";
        btnCopy.addEventListener("click", async () => {
            const text = [
                `Title: ${title || "Error"}`,
                `Context: ${subtitle || ""}`,
                `Message: ${message || ""}`,
                details ? `\n${details}` : ""
            ].join("\n");
            try {
                await navigator.clipboard.writeText(text);
            } catch (_) {
                // Fallback
                const ta = document.createElement("textarea");
                ta.value = text;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand("copy");
                ta.remove();
            }
        });

        actions.appendChild(btnDetails);
        actions.appendChild(btnCopy);

        const detailsEl = document.createElement("div");
        detailsEl.className = "uierr-details";
        detailsEl.textContent = details || "";

        toast.appendChild(head);
        toast.appendChild(body);
        toast.appendChild(actions);
        if (details) toast.appendChild(detailsEl);

        container.appendChild(toast);

        // Auto-dismiss after 12s if not opened
        setTimeout(() => {
            if (!toast.isConnected) return;
            if (toast.classList.contains("uierr-open")) return;
            toast.remove();
        }, 12000);
    }
}
