import { useEffect, useState } from "react";
import type { Message } from "@web-chat/shared";
import { DashboardApi } from "../api";

function formatBytes(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Renders a type:"file" Message — image preview or a download button, fetched with auth headers. */
export function AttachmentBubble({ api, message }: { api: DashboardApi; message: Message }) {
  const isImage = message.attachmentType?.startsWith("image/") ?? false;
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!isImage) return;
    let revoke: string | null = null;
    void api.fetchAttachment(message.id).then((blob) => {
      const url = URL.createObjectURL(blob);
      revoke = url;
      setObjectUrl(url);
    });
    return () => {
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [api, message.id, isImage]);

  async function download() {
    setDownloading(true);
    try {
      const blob = await api.fetchAttachment(message.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = message.attachmentName ?? "file";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  if (isImage) {
    return (
      <div className="attachment-bubble attachment-image">
        {objectUrl ? (
          <img src={objectUrl} alt={message.attachmentName ?? "attachment"} onClick={() => void download()} />
        ) : (
          <div className="attachment-image-loading">Loading image…</div>
        )}
      </div>
    );
  }

  return (
    <button className="attachment-bubble attachment-file" disabled={downloading} onClick={() => void download()}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
      </svg>
      <div className="attachment-file-info">
        <div className="attachment-file-name">{message.attachmentName ?? "file"}</div>
        <div className="muted small">{downloading ? "Downloading…" : formatBytes(message.attachmentSize)}</div>
      </div>
    </button>
  );
}
