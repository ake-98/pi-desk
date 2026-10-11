import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Disable all context menus everywhere (including text selections and
// editable fields) — this is an app shell, not a browser page.
document.addEventListener("contextmenu", (e) => e.preventDefault());

/** Last-resort boundary: render the error instead of a silent white screen. */
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <pre
          style={{
            padding: 24,
            whiteSpace: "pre-wrap",
            fontFamily: "monospace",
            fontSize: 12,
          }}
        >
          {`界面出错了：\n\n${this.state.error.message ?? String(this.state.error)}`}
        </pre>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
