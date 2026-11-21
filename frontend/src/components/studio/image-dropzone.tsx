import { useRef, useState, type DragEvent } from "react";
import { ACCEPT_ATTRIBUTE, firstImageFile } from "../../image/image-loader.ts";
import { ImageIcon, Upload } from "../icons.tsx";

interface ImageDropzoneProps {
  onFile: (file: File) => void;
  busy: boolean;
  error: string | null;
}

/** Empty-state drop target. Paste (Ctrl/Cmd+V) is handled by the studio. */
export function ImageDropzone({ onFile, busy, error }: ImageDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = firstImageFile(event.dataTransfer);
    if (file) onFile(file);
  };

  return (
    <div
      className={`dropzone${dragging ? " dropzone--active" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <span className="dropzone-icon" aria-hidden="true">
        <ImageIcon />
      </span>
      <p className="dropzone-title">{busy ? "Opening image…" : "Drop a reference image"}</p>
      <p className="dropzone-sub">JPEG, PNG, WebP, GIF, AVIF or BMP · or paste from clipboard</p>
      <button type="button" className="button button--primary" onClick={() => inputRef.current?.click()} disabled={busy}>
        <Upload /> Choose image
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
      {error && (
        <p className="dropzone-error" role="alert">
          {error}
        </p>
      )}
      <p className="privacy-note">Your image stays on this device. Nothing is uploaded.</p>
    </div>
  );
}
