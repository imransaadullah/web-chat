import { useRef, useState } from "react";

/** Paperclip button + hidden file input, shared by the support and team reply boxes. */
export function AttachButton({ onFile }: { onFile: (file: File) => Promise<void> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      await onFile(file);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <input ref={inputRef} type="file" className="attach-input" onChange={(e) => void handleChange(e)} />
      <button
        type="button"
        className="attach-btn"
        disabled={busy}
        title="Attach a file"
        onClick={() => inputRef.current?.click()}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
        </svg>
      </button>
    </>
  );
}
