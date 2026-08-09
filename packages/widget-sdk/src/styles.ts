export function buildStyles(accentColor: string): string {
  return `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }

    :host {
      --wc-accent: ${accentColor};
      --wc-accent-dark: color-mix(in srgb, ${accentColor} 78%, black);
      --wc-accent-soft: color-mix(in srgb, ${accentColor} 12%, white);
      --wc-text: #0f172a;
      --wc-text-muted: #64748b;
      --wc-text-faint: #94a3b8;
      --wc-border: #e6e9ef;
      --wc-bg: #ffffff;
      --wc-bg-subtle: #f7f8fb;
      --wc-radius-lg: 20px;
      --wc-radius-md: 14px;
      --wc-shadow-panel: 0 24px 60px -14px rgba(15,23,42,.28), 0 6px 20px -6px rgba(15,23,42,.14);
      --wc-shadow-launcher: 0 10px 26px -6px color-mix(in srgb, ${accentColor} 55%, black 15%);
    }

    /* ---- Launcher ---------------------------------------------------- */
    .wc-launcher {
      position: fixed; bottom: 20px; width: 60px; height: 60px; border-radius: 50%;
      background: linear-gradient(135deg, var(--wc-accent), var(--wc-accent-dark));
      color: white; border: none; cursor: pointer;
      box-shadow: var(--wc-shadow-launcher);
      display: flex; align-items: center; justify-content: center;
      z-index: 2147483000; transition: transform .2s cubic-bezier(.34,1.56,.64,1), box-shadow .2s ease;
    }
    .wc-launcher:hover { transform: scale(1.07) translateY(-1px); box-shadow: 0 14px 30px -6px color-mix(in srgb, ${accentColor} 60%, black 20%); }
    .wc-launcher:active { transform: scale(.95); }
    .wc-launcher svg { width: 25px; height: 25px; fill: white; }
    .wc-launcher.wc-hidden { display: none; }

    .wc-launcher-badge {
      position: absolute; top: -2px; right: -2px; min-width: 20px; height: 20px; padding: 0 5px;
      border-radius: 10px; background: #ef4444; color: white; font-size: 11px; font-weight: 700;
      display: flex; align-items: center; justify-content: center; border: 2px solid white;
      box-shadow: 0 2px 6px rgba(0,0,0,.25); animation: wc-pop .22s cubic-bezier(.34,1.56,.64,1);
      line-height: 1;
    }
    .wc-launcher-badge.wc-hidden { display: none; }
    @keyframes wc-pop { from { transform: scale(0); } to { transform: scale(1); } }

    /* ---- Panel ---------------------------------------------------- */
    .wc-panel {
      position: fixed; bottom: 92px; width: 384px; max-width: calc(100vw - 32px); height: 610px;
      max-height: calc(100vh - 120px); background: var(--wc-bg); border-radius: var(--wc-radius-lg);
      box-shadow: var(--wc-shadow-panel); display: flex; flex-direction: column; overflow: hidden;
      z-index: 2147483000; border: 1px solid rgba(15,23,42,.06);
      animation: wc-panel-in .22s cubic-bezier(.16,1,.3,1);
    }
    .wc-panel.wc-hidden { display: none; }
    @keyframes wc-panel-in { from { opacity: 0; transform: translateY(14px) scale(.98); } to { opacity: 1; transform: none; } }

    /* ---- Header ---------------------------------------------------- */
    .wc-header {
      background: linear-gradient(135deg, var(--wc-accent), var(--wc-accent-dark));
      color: white; padding: 18px 18px 14px; flex-shrink: 0;
    }
    .wc-header-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
    .wc-header-text { min-width: 0; }
    .wc-header-title { font-weight: 700; font-size: 16px; letter-spacing: -.01em; }
    .wc-header-subtitle { font-size: 12px; color: rgba(255,255,255,.75); margin-top: 2px; }
    .wc-header-close {
      background: rgba(255,255,255,.15); border: none; color: white; cursor: pointer;
      width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
      transition: background .15s ease; flex-shrink: 0;
    }
    .wc-header-close:hover { background: rgba(255,255,255,.28); }
    .wc-header-close svg { width: 13px; height: 13px; }

    .wc-tabs { display: flex; gap: 4px; padding: 4px; margin-top: 14px; background: rgba(255,255,255,.15); border-radius: 10px; }
    .wc-tabs.wc-hidden { display: none; }
    .wc-tab {
      flex: 1; position: relative; background: none; border: none; padding: 7px 0; font-size: 12.5px;
      font-weight: 650; color: rgba(255,255,255,.78); cursor: pointer; border-radius: 8px;
      transition: background .15s ease, color .15s ease;
    }
    .wc-tab.active { background: white; color: var(--wc-accent-dark); }
    .wc-tab-dot {
      position: absolute; top: 4px; right: 18%; width: 6px; height: 6px; border-radius: 50%;
      background: #ef4444; display: none;
    }
    .wc-tab.has-unread .wc-tab-dot { display: block; }

    /* ---- Message list ---------------------------------------------------- */
    .wc-messages { flex: 1; overflow-y: auto; padding: 16px 14px; background: var(--wc-bg-subtle); display: flex; flex-direction: column; gap: 12px; }
    .wc-messages.wc-hidden { display: none; }
    .wc-messages::-webkit-scrollbar, .wc-team-list::-webkit-scrollbar { width: 6px; }
    .wc-messages::-webkit-scrollbar-thumb, .wc-team-list::-webkit-scrollbar-thumb { background: rgba(15,23,42,.14); border-radius: 3px; }

    .wc-msg-row { display: flex; align-items: flex-end; gap: 8px; max-width: 86%; animation: wc-msg-in .18s ease; }
    .wc-msg-row.mine { align-self: flex-end; flex-direction: row-reverse; }
    .wc-msg-row.theirs { align-self: flex-start; }
    @keyframes wc-msg-in { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } }

    .wc-avatar {
      width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center;
      justify-content: center; font-size: 10.5px; font-weight: 700; color: white; background: var(--wc-text-muted);
    }
    .wc-avatar svg { width: 13px; height: 13px; fill: white; }
    .wc-avatar-spacer { width: 26px; flex-shrink: 0; }

    .wc-msg-col { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
    .wc-msg-row.mine .wc-msg-col { align-items: flex-end; }
    .wc-msg-sender { font-size: 10.5px; font-weight: 650; color: var(--wc-text-faint); padding: 0 3px; }
    .wc-msg { padding: 9px 13px; border-radius: 16px; font-size: 13.5px; line-height: 1.45; word-wrap: break-word; }
    .wc-msg.visitor {
      background: linear-gradient(135deg, var(--wc-accent), var(--wc-accent-dark)); color: white;
      border-bottom-right-radius: 5px; box-shadow: 0 2px 8px -3px rgba(0,0,0,.2);
    }
    .wc-msg.agent { background: var(--wc-bg); color: var(--wc-text); border: 1px solid var(--wc-border); border-bottom-left-radius: 5px; }
    .wc-msg.system { align-self: center; background: transparent; color: var(--wc-text-faint); font-size: 11.5px; text-align: center; }
    .wc-msg-time { font-size: 10px; color: var(--wc-text-faint); padding: 0 3px; }

    .wc-file-msg {
      display: flex; align-items: center; gap: 9px; padding: 9px 13px; border-radius: 14px; background: var(--wc-bg);
      border: 1px solid var(--wc-border); cursor: pointer; font: inherit; text-align: left; min-width: 180px;
      box-shadow: 0 1px 3px rgba(15,23,42,.04); transition: border-color .15s ease;
    }
    .wc-file-msg:hover { border-color: var(--wc-accent); }
    .wc-file-msg svg { width: 20px; height: 20px; fill: var(--wc-accent-dark); flex-shrink: 0; }
    .wc-file-info { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
    .wc-file-name { font-size: 12.5px; font-weight: 650; color: var(--wc-text); word-break: break-all; }
    .wc-file-size { font-size: 10.5px; color: var(--wc-text-faint); }

    /* ---- Context card ---------------------------------------------------- */
    .wc-context-card {
      align-self: stretch; background: var(--wc-bg); border: 1px solid var(--wc-border); border-radius: var(--wc-radius-md);
      padding: 13px 14px; font-size: 12.5px; box-shadow: 0 1px 3px rgba(15,23,42,.04);
    }
    .wc-ctx-head { display: flex; align-items: center; gap: 9px; margin-bottom: 8px; }
    .wc-ctx-icon {
      width: 28px; height: 28px; border-radius: 9px; background: var(--wc-accent-soft); color: var(--wc-accent-dark);
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    .wc-ctx-icon svg { width: 14px; height: 14px; }
    .wc-ctx-headtext { min-width: 0; }
    .wc-ctx-kind { text-transform: uppercase; letter-spacing: .05em; font-size: 9.5px; color: var(--wc-accent-dark); font-weight: 700; }
    .wc-ctx-title { font-weight: 650; color: var(--wc-text); font-size: 13px; margin-top: 1px; }
    .wc-ctx-summary { color: var(--wc-text-muted); margin-bottom: 8px; line-height: 1.4; }
    .wc-context-card table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    .wc-context-card td { padding: 4px 0; font-size: 12px; color: var(--wc-text); vertical-align: top; border-top: 1px solid var(--wc-border); }
    .wc-context-card tr:first-child td { border-top: none; }
    .wc-context-card td:first-child { color: var(--wc-text-faint); padding-right: 10px; white-space: nowrap; font-weight: 500; }
    .wc-context-card a {
      display: inline-flex; align-items: center; gap: 3px; color: var(--wc-accent-dark); text-decoration: none;
      font-weight: 650; font-size: 12px; white-space: nowrap;
    }
    .wc-context-card a svg { width: 11px; height: 11px; flex-shrink: 0; }
    .wc-context-card a:hover { text-decoration: underline; }
    .wc-ctx-view-snapshot {
      display: flex; align-items: center; gap: 4px; background: none; border: none; padding: 0; margin-top: 8px;
      color: var(--wc-accent-dark); font-weight: 650; font-size: 12px; cursor: pointer;
    }
    .wc-snapshot-frame { margin-top: 8px; border: 1px solid var(--wc-border); border-radius: 10px; padding: 9px; max-height: 220px; overflow: auto; font-size: 11.5px; background: var(--wc-bg-subtle); }
    .wc-snapshot-frame.wc-hidden { display: none; }
    .wc-snapshot-frame * { max-width: 100%; }
    .wc-snap-img-placeholder { background: #eee; color: #9a9ea5; font-size: 10.5px; padding: 4px 6px; border-radius: 4px; display: inline-block; }
    .wc-snap-field { background: #f4f4f7; border: 1px solid #e0e1e5; border-radius: 4px; padding: 2px 5px; display: inline-block; }
    .wc-snap-truncated { color: #9a9ea5; font-style: italic; }

    /* ---- Pre-chat form ---------------------------------------------------- */
    .wc-prechat { display: flex; flex-direction: column; gap: 12px; padding: 4px 2px 2px; }
    .wc-prechat-intro { font-size: 12.5px; color: var(--wc-text-muted); line-height: 1.5; }
    .wc-prechat label { display: flex; flex-direction: column; gap: 5px; font-size: 12px; color: var(--wc-text); font-weight: 650; }
    .wc-prechat input {
      border: 1px solid var(--wc-border); border-radius: 10px; padding: 10px 12px; font-size: 13.5px; font-weight: 400;
      outline: none; background: var(--wc-bg); color: var(--wc-text); transition: border-color .15s ease, box-shadow .15s ease;
    }
    .wc-prechat input:focus { border-color: var(--wc-accent); box-shadow: 0 0 0 3px var(--wc-accent-soft); }
    .wc-prechat-error { color: #dc2626; font-size: 11.5px; }
    .wc-prechat-error.wc-hidden { display: none; }
    .wc-prechat-submit {
      background: linear-gradient(135deg, var(--wc-accent), var(--wc-accent-dark)); color: white; border: none;
      border-radius: 10px; padding: 11px 14px; font-size: 13.5px; font-weight: 650; cursor: pointer;
      transition: filter .15s ease, transform .1s ease;
    }
    .wc-prechat-submit:hover { filter: brightness(1.06); }
    .wc-prechat-submit:active { transform: scale(.98); }

    /* ---- Composer ---------------------------------------------------- */
    .wc-composer { display: flex; gap: 8px; padding: 12px; border-top: 1px solid var(--wc-border); background: var(--wc-bg); align-items: center; flex-shrink: 0; }
    .wc-composer.wc-hidden { display: none; }
    .wc-composer input {
      flex: 1; border: 1px solid var(--wc-border); border-radius: 22px; padding: 10px 16px; font-size: 13.5px;
      outline: none; background: var(--wc-bg-subtle); color: var(--wc-text); transition: border-color .15s ease, background .15s ease;
    }
    .wc-composer input:focus { border-color: var(--wc-accent); background: var(--wc-bg); }
    .wc-composer-send {
      background: linear-gradient(135deg, var(--wc-accent), var(--wc-accent-dark)); color: white; border: none;
      border-radius: 50%; width: 38px; height: 38px; flex-shrink: 0; cursor: pointer; display: flex;
      align-items: center; justify-content: center; transition: transform .12s cubic-bezier(.34,1.56,.64,1), opacity .15s ease;
    }
    .wc-composer-send:hover:not(:disabled) { transform: scale(1.07); }
    .wc-composer-send:active:not(:disabled) { transform: scale(.93); }
    .wc-composer-send:disabled { opacity: .4; cursor: default; }
    .wc-composer-send svg { width: 15px; height: 15px; fill: white; margin-left: 1px; }

    /* ---- Team list / picker ---------------------------------------------------- */
    .wc-team-list { flex: 1; overflow-y: auto; padding: 14px; background: var(--wc-bg-subtle); display: flex; flex-direction: column; gap: 8px; }
    .wc-team-list.wc-hidden { display: none; }
    .wc-team-new {
      display: flex; align-items: center; justify-content: center; gap: 6px; background: var(--wc-bg);
      color: var(--wc-accent-dark); border: 1.5px dashed var(--wc-border); border-radius: 12px; padding: 10px 12px;
      font-size: 12.5px; font-weight: 650; cursor: pointer; transition: border-color .15s ease, background .15s ease;
    }
    .wc-team-new:hover { border-color: var(--wc-accent); background: var(--wc-accent-soft); }
    .wc-team-new svg { width: 13px; height: 13px; }
    .wc-team-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; color: var(--wc-text-faint); font-size: 12.5px; padding: 34px 10px; text-align: center; }
    .wc-team-empty svg { width: 30px; height: 30px; opacity: .5; }
    .wc-team-row {
      display: flex; align-items: center; gap: 10px; text-align: left; background: var(--wc-bg);
      border: 1px solid var(--wc-border); border-radius: 12px; padding: 9px 11px; font-size: 13px; cursor: pointer;
      transition: box-shadow .15s ease, border-color .15s ease, transform .1s ease; color: var(--wc-text);
    }
    .wc-team-row:hover { border-color: var(--wc-accent); box-shadow: 0 3px 12px -4px rgba(15,23,42,.18); }
    .wc-team-row:active { transform: scale(.99); }
    .wc-team-row-label { flex: 1; font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .wc-team-row-badge { font-size: 9.5px; font-weight: 700; color: var(--wc-accent-dark); background: var(--wc-accent-soft); padding: 2px 6px; border-radius: 6px; text-transform: uppercase; letter-spacing: .03em; flex-shrink: 0; }
    .wc-team-chevron { color: var(--wc-text-faint); flex-shrink: 0; }
    .wc-team-chevron svg { width: 14px; height: 14px; }

    .wc-team-picker-row { display: flex; align-items: center; gap: 10px; font-size: 13px; padding: 8px 6px; border-radius: 8px; cursor: pointer; transition: background .12s ease; color: var(--wc-text); }
    .wc-team-picker-row:hover { background: var(--wc-bg); }
    .wc-team-picker-row input[type="checkbox"] { width: 16px; height: 16px; accent-color: var(--wc-accent); cursor: pointer; }
    .wc-team-title-input {
      border: 1px solid var(--wc-border); border-radius: 10px; padding: 9px 12px; font-size: 13px; outline: none;
      margin-top: 6px; background: var(--wc-bg); color: var(--wc-text); width: 100%;
    }
    .wc-team-title-input.wc-hidden { display: none; }
    .wc-team-title-input:focus { border-color: var(--wc-accent); box-shadow: 0 0 0 3px var(--wc-accent-soft); }

    .wc-link-btn { display: inline-block; background: none; border: none; padding: 0; margin-top: 10px; color: var(--wc-text-muted); font-weight: 650; font-size: 12px; cursor: pointer; }
    .wc-link-btn:hover { color: var(--wc-text); }

    .wc-team-back {
      background: none; border: none; color: var(--wc-text-muted); cursor: pointer; width: 28px; height: 28px;
      border-radius: 50%; display: flex; align-items: center; justify-content: center; transition: background .15s ease, color .15s ease; flex-shrink: 0;
    }
    .wc-team-back:hover { background: rgba(15,23,42,.06); color: var(--wc-text); }
    .wc-team-back svg { width: 15px; height: 15px; }
    .wc-team-thread-head { display: flex; align-items: center; gap: 6px; padding-bottom: 12px; margin-bottom: 12px; border-bottom: 1px solid var(--wc-border); }
    .wc-team-thread-title { font-weight: 650; font-size: 13.5px; color: var(--wc-text); }
  `;
}
