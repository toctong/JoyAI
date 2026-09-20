"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Check,
  ChevronDown,
  FileText,
  History,
  PanelLeftClose,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/shared/lib/utils";
import {
  SCRIPT_AI_PANEL_TEMPLATES,
  SCRIPT_AI_TYPES,
  type ScriptAiType,
} from "./script-ai-templates";
import { useScriptAiChat } from "./use-script-ai-chat";
import "./script-ai-panel.css";

type Props = {
  projectId: string;
  modelId?: string;
  scriptText: string;
  onApplyScript: (script: string, meta?: { hook?: string }) => void;
  onCollapse: () => void;
};

function shouldShowPendingDots(content: string) {
  return !content.trim();
}

export function ScriptAiPanel({
  projectId,
  modelId,
  scriptText,
  onApplyScript,
  onCollapse,
}: Props) {
  const {
    hydrated,
    conversations,
    activeConversation,
    messages,
    aiType,
    setAiType,
    draftPrompt,
    setDraftPrompt,
    historyOpen,
    openHistory,
    closeHistory,
    scriptRefEnabled,
    setScriptRefEnabled,
    sending,
    createNewChat,
    selectConversation,
    deleteConversation,
    sendMessage,
    retryMessage,
    applyMessageScript,
  } = useScriptAiChat({
    projectId,
    modelId,
    scriptText,
    onApplyScript,
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const typeMenuRef = useRef<HTMLDivElement>(null);
  const [typeOpen, setTypeOpen] = useState(false);

  const scriptPlain = scriptText.trim();
  const hasScript = scriptPlain.length > 0;
  const showEmptyState = messages.length === 0;
  const scriptRefPreview =
    scriptPlain.length > 24
      ? `${scriptPlain.slice(0, 24)}…`
      : scriptPlain;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  useEffect(() => {
    if (!typeOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!typeMenuRef.current?.contains(e.target as Node)) {
        setTypeOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [typeOpen]);

  const handleTemplateClick = (category: ScriptAiType, desc: string) => {
    setAiType(category);
    setDraftPrompt(desc);
  };

  const handleSend = () => {
    if (!draftPrompt.trim() || sending) return;
    if (scriptRefEnabled && !scriptPlain) return;
    void sendMessage(draftPrompt, {
      scriptRef: scriptRefEnabled && Boolean(scriptPlain),
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="manju-ai-panel">
      {historyOpen ? (
        <div className="manju-ai-chat-history">
          <div className="manju-ai-chat-history__head">
            <span className="manju-ai-chat-history__title">
              <History className="size-4" />
              对话历史
            </span>
            <button
              type="button"
              className="manju-ai-panel__icon-btn"
              aria-label="关闭历史"
              onClick={closeHistory}
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="manju-ai-chat-history__scroll">
            {conversations.every((c) => c.messages.length === 0) ? (
              <p className="manju-ai-chat-history__empty">暂无历史对话</p>
            ) : (
              <ul className="manju-ai-chat-history__list">
                {conversations.map((c) => (
                  <li key={c.id} className="manju-ai-chat-history__row">
                    <button
                      type="button"
                      className={cn(
                        "manju-ai-chat-history__item",
                        c.id === activeConversation?.id &&
                          "manju-ai-chat-history__item--active",
                      )}
                      onClick={() => selectConversation(c.id)}
                    >
                      <span className="manju-ai-chat-history__item-body">
                        <strong>{c.title}</strong>
                        <span>
                          {new Date(c.updatedAt).toLocaleString("zh-CN", {
                            month: "numeric",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="manju-ai-chat-history__delete"
                      aria-label="删除对话"
                      onClick={() => deleteConversation(c.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      <header className="manju-ai-panel__top">
        <div className="manju-ai-panel__brand">
          <span className="manju-ai-panel__mark" aria-hidden>
            <Sparkles className="size-5" />
          </span>
          <div className="manju-ai-panel__brand-text">
            <strong>JoyAI 帮写</strong>
            <p>说说想怎么改，我来写</p>
          </div>
        </div>
        <div className="manju-ai-panel__top-actions">
          <button
            type="button"
            className="manju-ai-panel__icon-btn"
            aria-label="新建对话"
            title="新建对话"
            onClick={createNewChat}
          >
            <Plus className="size-4" />
          </button>
          <button
            type="button"
            className={cn(
              "manju-ai-panel__icon-btn",
              historyOpen && "manju-ai-panel__icon-btn--active",
            )}
            aria-label="对话历史"
            title="对话历史"
            onClick={historyOpen ? closeHistory : openHistory}
          >
            <History className="size-4" />
          </button>
          <button
            type="button"
            className="manju-ai-panel__icon-btn"
            aria-label="收起 AI 帮写"
            onClick={onCollapse}
          >
            <PanelLeftClose className="size-4" />
          </button>
        </div>
      </header>

      <div ref={scrollRef} className="manju-ai-panel__scroll">
        {!hydrated ? (
          <div className="manju-ai-panel__loading">
            <div className="manju-ai-panel__loading-dots" aria-hidden>
              <span />
              <span />
              <span />
            </div>
            <p>正在加载对话…</p>
          </div>
        ) : showEmptyState ? (
          <div className="manju-ai-panel__empty">
            <div className="manju-ai-panel__hero">
              <span className="manju-ai-panel__hero-icon" aria-hidden>
                <span className="manju-ai-panel__hero-bubble" />
              </span>
              <h2>从一句话到完整剧本</h2>
              <p>你只需告诉我：类型 + 故事 | AI 帮你生成完整剧本</p>
            </div>
            <div className="manju-ai-panel__templates">
              {SCRIPT_AI_PANEL_TEMPLATES.map((t) => (
                <button
                  key={t.title}
                  type="button"
                  className="manju-ai-panel__template"
                  onClick={() => handleTemplateClick(t.category, t.desc)}
                >
                  <span className="manju-ai-panel__template-icon" aria-hidden>
                    <Sparkles className="size-4" />
                  </span>
                  <span className="manju-ai-panel__template-body">
                    <strong>{t.title}</strong>
                    <span>
                      {t.category} / {t.desc}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="manju-ai-panel__messages">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "manju-ai-panel__message",
                  `manju-ai-panel__message--${message.role}`,
                  message.pending && "manju-ai-panel__message--pending",
                  message.script && "manju-ai-panel__message--has-script",
                  message.error && "manju-ai-panel__message--error",
                )}
              >
                <div className="manju-ai-panel__message-body">
                  {message.script ? (
                    <pre className="manju-ai-panel__message-script">
                      {message.script}
                    </pre>
                  ) : null}
                  {message.content ? (
                    <p className="manju-ai-panel__message-text">
                      {message.content}
                    </p>
                  ) : null}
                  {message.pending &&
                  shouldShowPendingDots(message.content) &&
                  !message.script ? (
                    <span className="manju-ai-panel__pending-dots" aria-hidden>
                      <span />
                      <span />
                      <span />
                    </span>
                  ) : null}
                  {!message.pending &&
                  (message.script || message.content) ? (
                    <div className="manju-ai-panel__message-footer">
                      {message.error ? (
                        <button
                          type="button"
                          className="manju-ai-panel__retry"
                          onClick={() =>
                            retryMessage(message.id, {
                              scriptRef: scriptRefEnabled && hasScript,
                            })
                          }
                        >
                          重试
                        </button>
                      ) : null}
                      {message.script && !message.scriptApplied ? (
                        <button
                          type="button"
                          className="manju-ai-panel__apply"
                          onClick={() => applyMessageScript(message.id)}
                        >
                          应用修改
                        </button>
                      ) : null}
                      {message.scriptApplied ? (
                        <span className="manju-ai-panel__applied">
                          已应用到右侧预览
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {hasScript ? (
        scriptRefEnabled ? (
          <div
            className={cn(
              "manju-ai-panel__ref manju-ai-panel__ref--active",
              sending && "manju-ai-panel__ref--busy",
            )}
          >
            <FileText className="manju-ai-panel__ref-icon" aria-hidden />
            <p className="manju-ai-panel__ref-label">
              <span className="manju-ai-panel__ref-name">已引用右侧剧本</span>
              <span className="manju-ai-panel__ref-sep" aria-hidden>
                ·
              </span>
              <span className="manju-ai-panel__ref-meta">
                {sending ? "AI 润色参考中" : `${scriptPlain.length} 字`}
              </span>
            </p>
            <button
              type="button"
              className="manju-ai-panel__ref-remove"
              aria-label="取消引用"
              title="取消引用后，AI 将不再读取右侧剧本"
              onClick={() => setScriptRefEnabled(false)}
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="manju-ai-panel__ref manju-ai-panel__ref--invite"
            onClick={() => setScriptRefEnabled(true)}
          >
            <FileText className="manju-ai-panel__ref-icon" aria-hidden />
            <span className="manju-ai-panel__ref-label">
              <span className="manju-ai-panel__ref-name">引用右侧剧本</span>
              <span className="manju-ai-panel__ref-sep" aria-hidden>
                ·
              </span>
              <span className="manju-ai-panel__ref-meta">
                {scriptRefPreview || `${scriptPlain.length} 字`}
              </span>
            </span>
            <span className="manju-ai-panel__ref-action">引用</span>
          </button>
        )
      ) : null}

      <div className="manju-ai-panel__composer">
        <Textarea
          className="manju-ai-panel__input"
          value={draftPrompt}
          onChange={(e) => setDraftPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!hydrated || sending}
          placeholder={
            hasScript
              ? "告诉 AI 你想怎么改剧本…"
              : "描述你想要做什么片子，一句话也可以"
          }
          rows={3}
        />
        <div
          className={cn(
            "manju-ai-panel__composer-bar",
            hasScript && "manju-ai-panel__composer-bar--no-type",
          )}
        >
          {!hasScript ? (
            <div className="manju-ai-panel__type" ref={typeMenuRef}>
              <button
                type="button"
                className={cn(
                  "manju-ai-panel__type-trigger",
                  typeOpen && "manju-ai-panel__type-trigger--open",
                )}
                aria-haspopup="listbox"
                aria-expanded={typeOpen}
                onClick={() => setTypeOpen((v) => !v)}
              >
                <span>{aiType}</span>
                <ChevronDown className="manju-ai-panel__type-chevron size-3.5" />
              </button>
              {typeOpen ? (
                <ul className="manju-ai-panel__type-menu" role="listbox">
                  {SCRIPT_AI_TYPES.map((type) => {
                    const active = aiType === type;
                    return (
                      <li key={type} role="option" aria-selected={active}>
                        <button
                          type="button"
                          className={cn(
                            "manju-ai-panel__type-item",
                            active && "manju-ai-panel__type-item--active",
                          )}
                          onClick={() => {
                            setAiType(type);
                            setTypeOpen(false);
                          }}
                        >
                          <span>{type}</span>
                          {active ? <Check className="size-3.5" /> : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          ) : null}
          <div className="manju-ai-panel__composer-actions">
            <button
              type="button"
              className="manju-ai-panel__send"
              aria-label="发送"
              title="发送"
              onClick={handleSend}
              disabled={!hydrated || sending || !draftPrompt.trim()}
            >
              <ArrowUp className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
