export function buildStyles(accentColor: string): string {
  return `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .wc-launcher {
      position: fixed; bottom: 20px; width: 56px; height: 56px; border-radius: 50%;
      background: ${accentColor}; color: white; border: none; cursor: pointer;
      box-shadow: 0 4px 14px rgba(0,0,0,0.25); display: flex; align-items: center; justify-content: center;
      z-index: 2147483000; transition: transform 0.15s ease;
    }
    .wc-launcher:hover { transform: scale(1.06); }
    .wc-launcher svg { width: 26px; height: 26px; fill: white; }
    .wc-panel {
      position: fixed; bottom: 88px; width: 360px; max-width: calc(100vw - 32px); height: 520px;
      max-height: calc(100vh - 120px); background: white; border-radius: 14px;
      box-shadow: 0 12px 40px rgba(0,0,0,0.2); display: flex; flex-direction: column; overflow: hidden;
      z-index: 2147483000; border: 1px solid rgba(0,0,0,0.06);
    }
    .wc-panel.wc-hidden, .wc-launcher.wc-hidden { display: none; }
    .wc-header {
      background: ${accentColor}; color: white; padding: 14px 16px; font-weight: 600; font-size: 15px;
      display: flex; align-items: center; justify-content: space-between;
    }
    .wc-header button { background: none; border: none; color: white; cursor: pointer; font-size: 18px; opacity: 0.85; }
    .wc-messages { flex: 1; overflow-y: auto; padding: 12px; background: #f7f8fa; display: flex; flex-direction: column; gap: 8px; }
    .wc-msg { max-width: 82%; padding: 9px 12px; border-radius: 12px; font-size: 13.5px; line-height: 1.4; word-wrap: break-word; }
    .wc-msg.visitor { align-self: flex-end; background: ${accentColor}; color: white; border-bottom-right-radius: 4px; }
    .wc-msg.agent { align-self: flex-start; background: white; color: #1a1a1a; border: 1px solid #e7e7ea; border-bottom-left-radius: 4px; }
    .wc-msg.system { align-self: center; background: transparent; color: #8a8f98; font-size: 12px; }
    .wc-context-card { align-self: stretch; background: white; border: 1px solid #e7e7ea; border-radius: 10px; padding: 10px 12px; font-size: 12.5px; }
    .wc-context-card .wc-ctx-kind { text-transform: uppercase; letter-spacing: 0.04em; font-size: 10px; color: ${accentColor}; font-weight: 700; margin-bottom: 2px; }
    .wc-context-card .wc-ctx-title { font-weight: 600; color: #1a1a1a; margin-bottom: 4px; }
    .wc-context-card .wc-ctx-summary { color: #5c6169; margin-bottom: 6px; }
    .wc-context-card table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
    .wc-context-card td { padding: 2px 0; font-size: 12px; color: #40454d; vertical-align: top; }
    .wc-context-card td:first-child { color: #8a8f98; padding-right: 8px; white-space: nowrap; }
    .wc-context-card a { color: ${accentColor}; text-decoration: none; font-weight: 600; font-size: 12px; }
    .wc-composer { display: flex; gap: 8px; padding: 10px; border-top: 1px solid #eee; background: white; }
    .wc-composer input { flex: 1; border: 1px solid #e0e1e5; border-radius: 20px; padding: 9px 14px; font-size: 13.5px; outline: none; }
    .wc-composer input:focus { border-color: ${accentColor}; }
    .wc-composer button { background: ${accentColor}; color: white; border: none; border-radius: 20px; padding: 0 16px; cursor: pointer; font-size: 13px; font-weight: 600; }
    .wc-composer button:disabled { opacity: 0.5; cursor: default; }
  `;
}
