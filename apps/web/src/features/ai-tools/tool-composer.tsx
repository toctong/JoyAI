"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
} from "react";
import type { Editor } from "@tiptap/core";
import { useDropzone } from "react-dropzone";
import { Eraser, Plus, X } from "lucide-react";
import {
  AiPromptEditor,
  serializeToPlainText,
  setEditorPlainText,
} from "@/features/ai-prompt";
import { CanvasRefHoverPreview } from "@/features/canvas/canvas-ref-preview";
import {
  filesFromClipboardData,
  readClipboardImageFiles,
} from "@/shared/lib/clipboard";
import { cn } from "@/shared/lib/utils";
import type { ToolPendingRef } from "./use-ai-tool-job";
import "@/features/studio/creation-composer.css";

type Props = {
  note: string;
  onNoteChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
  showRefs: boolean;
  refs: ToolPendingRef[];
  canAdd: boolean;
  uploadHint?: string;
  onAddFiles: (files: FileList | File[]) => void;
  onRemoveRef: (localId: string) => void;
  onClearRefs: () => void;
  className?: string;
};

/**
 * Tools-side prompt shell — same joy-composer chrome as Studio, without
 * model/params/send (those stay on the tool page). Paste / drop images → refs.
 */
export function ToolComposer({
  note,
  onNoteChange,
  placeholder = "例如想要的色调、文案、场景…",
  disabled,
  showRefs,
  refs,
  canAdd,
  uploadHint = "参考图",
  onAddFiles,
  onRemoveRef,
  onClearRefs,
  className,
}: Props) {
  const editorRef = useRef<Editor | null>(null);
  const suppressExpandRef = useRef(false);
  const [editorFocused, setEditorFocused] = useState(false);
  const [composerHovered, setComposerHovered] = useState(false);
  const [refsExpanded, setRefsExpanded] = useState(false);

  const canUploadRef = showRefs && !disabled;
  const canAddMoreRef = canUploadRef && canAdd;
  const canClear = Boolean(note.trim() || refs.length);

  useEffect(() => {
    const ed = editorRef.current;
    if (!ed || editorFocused) return;
    const current = serializeToPlainText(ed.getJSON());
    if (current === note) return;
    setEditorPlainText(ed, note, []);
  }, [note, editorFocused]);

  const onDropFiles = useCallback(
    (files: File[]) => {
      if (!canUploadRef || !files.length) return;
      suppressExpandRef.current = true;
      setRefsExpanded(false);
      onAddFiles(files);
    },
    [canUploadRef, onAddFiles],
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: (files) => onDropFiles(files),
    accept: { "image/*": [] },
    multiple: true,
    noClick: true,
    disabled: !canAddMoreRef,
  });

  const pasteRefsFromClipboard = useCallback(
    (event: ClipboardEvent) => {
      if (!canUploadRef) return;
      const files = filesFromClipboardData(event.clipboardData).filter((f) =>
        f.type.startsWith("image/"),
      );
      if (files.length) {
        event.preventDefault();
        event.stopPropagation();
        onDropFiles(files);
        return;
      }
      const types = Array.from(event.clipboardData?.types ?? []);
      const html = event.clipboardData?.getData("text/html") || "";
      const plain = event.clipboardData?.getData("text/plain") || "";
      const looksLikeImage =
        Array.from(event.clipboardData?.items ?? []).some((item) =>
          item.type.startsWith("image/"),
        ) ||
        types.some((t) => t.startsWith("image/")) ||
        (!plain.trim() &&
          (types.includes("Files") || /<img[\s>]/i.test(html)));
      if (!looksLikeImage) return;
      event.preventDefault();
      event.stopPropagation();
      void readClipboardImageFiles().then((asyncFiles) => {
        if (asyncFiles.length) onDropFiles(asyncFiles);
      });
    },
    [canUploadRef, onDropFiles],
  );

  useEffect(() => {
    if (!canUploadRef) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() !== "v") return;
      if (event.altKey || event.shiftKey) return;
      if (!editorFocused && !composerHovered) return;

      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        const editable =
          target.isContentEditable ||
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT";
        if (editable) return;
      }

      event.preventDefault();
      void readClipboardImageFiles().then((files) => {
        if (files.length) onDropFiles(files);
      });
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [canUploadRef, composerHovered, editorFocused, onDropFiles]);

  function clearComposer() {
    onNoteChange("");
    onClearRefs();
    const ed = editorRef.current;
    if (ed) setEditorPlainText(ed, "", []);
    setRefsExpanded(false);
  }

  return (
    <div className={cn("joy-ai-tool-composer", className)}>
      <div className="joy-composer-wrap">
        <div
          {...getRootProps()}
          className={cn(
            "joy-composer",
            "is-dock",
            "is-static",
            isDragActive && "is-dragging",
          )}
          onMouseEnter={() => setComposerHovered(true)}
          onMouseLeave={() => setComposerHovered(false)}
          onPaste={pasteRefsFromClipboard}
        >
          <input {...getInputProps()} />
          <div className="joy-composer-corner">
            {canClear && !disabled ? (
              <button
                type="button"
                className="joy-composer-clear"
                aria-label="清除输入与参考图"
                title="清除"
                onClick={(e) => {
                  e.stopPropagation();
                  clearComposer();
                }}
              >
                <Eraser className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>
            ) : null}
          </div>

          <div className="joy-composer-body">
            {canUploadRef ? (
              <div
                className={cn(
                  "joy-composer-ref-stack",
                  refsExpanded && "is-open",
                  refs.length === 0 && "is-empty",
                )}
                data-count={refs.length}
                aria-label="参考图"
                onMouseEnter={() => {
                  if (suppressExpandRef.current) return;
                  if (refs.length > 0) setRefsExpanded(true);
                }}
                onMouseLeave={() => {
                  suppressExpandRef.current = false;
                  setRefsExpanded(false);
                }}
                onBlurCapture={(e) => {
                  if (
                    !e.currentTarget.contains(e.relatedTarget as Node | null)
                  ) {
                    setRefsExpanded(false);
                  }
                }}
              >
                <div className="joy-composer-ref-fan">
                  <div
                    className={cn(
                      "joy-composer-ref-fan-layer",
                      refsExpanded && "is-open",
                    )}
                    style={
                      {
                        ["--ref-n"]: String(refs.length),
                        ["--ref-slots"]: String(
                          refs.length + (canAddMoreRef ? 1 : 0),
                        ),
                      } as Record<string, string>
                    }
                  >
                    {canAddMoreRef ? (
                      <button
                        type="button"
                        className={cn(
                          "joy-composer-upload",
                          refs.length === 0
                            ? "is-empty"
                            : refsExpanded
                              ? "is-card"
                              : "is-fab",
                        )}
                        onClick={open}
                        aria-label={
                          refs.length === 0
                            ? `添加${uploadHint}`
                            : "继续添加参考图"
                        }
                      >
                        <Plus className="h-4 w-4" strokeWidth={1.75} />
                        {refs.length === 0 || refsExpanded ? (
                          <span className="joy-composer-upload-label">
                            {uploadHint}
                          </span>
                        ) : null}
                      </button>
                    ) : null}
                    {refs.map((ref, i) => (
                      <CanvasRefHoverPreview
                        key={ref.localId}
                        kind="image"
                        url={ref.previewUrl}
                        className={cn(
                          "joy-composer-ref-card",
                          "is-image",
                          i % 2 === 0 ? "is-tilt-a" : "is-tilt-b",
                        )}
                        thumbClassName="size-full"
                        preview
                        style={
                          {
                            ["--ref-i"]: String(i),
                            ["--ref-x"]: String(canAddMoreRef ? i + 1 : i),
                          } as Record<string, string>
                        }
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={ref.previewUrl} alt="" />
                        <button
                          type="button"
                          className="joy-composer-ref-remove"
                          aria-label={`移除图片${i + 1}`}
                          disabled={disabled}
                          onClick={() => onRemoveRef(ref.localId)}
                        >
                          <X className="h-3 w-3" />
                        </button>
                        <span className="joy-composer-ref-index">
                          图片{i + 1}
                        </span>
                      </CanvasRefHoverPreview>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="joy-composer-main">
              <div
                onFocusCapture={() => setEditorFocused(true)}
                onBlurCapture={(e) => {
                  if (
                    !e.currentTarget.contains(e.relatedTarget as Node | null)
                  ) {
                    setEditorFocused(false);
                  }
                }}
              >
                <AiPromptEditor
                  editorRef={editorRef}
                  initialText={note}
                  mentionItems={[]}
                  placeholder={
                    canUploadRef
                      ? `${placeholder}（可粘贴图片到参考）`
                      : placeholder
                  }
                  disabled={disabled}
                  allowKindSwitch={false}
                  onPlainChange={onNoteChange}
                  onPasteFiles={
                    canUploadRef
                      ? (files) => {
                          onDropFiles(files);
                        }
                      : undefined
                  }
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
