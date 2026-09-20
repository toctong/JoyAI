"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/** 顶栏生成按钮：文案在「开始生成/重新生成」间切换，定宽不挤布局 */
export type ManjuHeaderGenerateAction = {
  label: string;
  onPrimary: () => void;
  disabled?: boolean;
  primaryDisabled?: boolean;
  loading?: boolean;
  /** 流程引导高亮：开始生成 */
  emphasis?: boolean;
  title?: string;
};

export type ManjuHeaderToolButton = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** 流程引导：plan / confirm 等，对应 data-manju-focus */
  focus?: string;
  emphasis?: boolean;
  title?: string;
};

export type ManjuHeaderTools = {
  add: ManjuHeaderToolButton;
  secondary?: ManjuHeaderToolButton;
  tertiary?: ManjuHeaderToolButton;
};

type HeaderSlotsApi = {
  setToolbar: (node: ReactNode) => void;
  setGenerateAction: (action: ManjuHeaderGenerateAction | null) => void;
  setTools: (tools: ManjuHeaderTools | null) => void;
  claimToolbar: () => number;
  claimActions: () => number;
  releaseToolbar: (owner: number) => void;
  releaseActions: (owner: number) => void;
};

const HeaderSlotsApiContext = createContext<HeaderSlotsApi | null>(null);
const HeaderSlotsViewContext = createContext<{
  toolbar: ReactNode;
  generateAction: ManjuHeaderGenerateAction | null;
  tools: ManjuHeaderTools | null;
}>({
  toolbar: null,
  generateAction: null,
  tools: null,
});

export function ManjuHeaderSlotsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [toolbar, setToolbar] = useState<ReactNode>(null);
  const [generateAction, setGenerateAction] =
    useState<ManjuHeaderGenerateAction | null>(null);
  const [tools, setTools] = useState<ManjuHeaderTools | null>(null);
  const toolbarOwnerRef = useRef(0);
  const actionsOwnerRef = useRef(0);

  const claimToolbar = useCallback(() => {
    toolbarOwnerRef.current += 1;
    return toolbarOwnerRef.current;
  }, []);

  const claimActions = useCallback(() => {
    actionsOwnerRef.current += 1;
    return actionsOwnerRef.current;
  }, []);

  const releaseToolbar = useCallback((owner: number) => {
    queueMicrotask(() => {
      if (toolbarOwnerRef.current === owner) setToolbar(null);
    });
  }, []);

  const releaseActions = useCallback((owner: number) => {
    queueMicrotask(() => {
      if (actionsOwnerRef.current === owner) {
        setGenerateAction(null);
        setTools(null);
      }
    });
  }, []);

  const api = useMemo(
    () => ({
      setToolbar,
      setGenerateAction,
      setTools,
      claimToolbar,
      claimActions,
      releaseToolbar,
      releaseActions,
    }),
    [claimActions, claimToolbar, releaseActions, releaseToolbar],
  );

  const view = useMemo(
    () => ({ toolbar, generateAction, tools }),
    [toolbar, generateAction, tools],
  );

  return (
    <HeaderSlotsApiContext.Provider value={api}>
      <HeaderSlotsViewContext.Provider value={view}>
        {children}
      </HeaderSlotsViewContext.Provider>
    </HeaderSlotsApiContext.Provider>
  );
}

export function useManjuHeaderSlotView() {
  return useContext(HeaderSlotsViewContext);
}

/**
 * 注册左侧 toolbar + 右侧固定槽位（工具按钮与生成配置）。
 * revision 变化时刷新内容，切步卸载时 release 避免闪烁。
 */
export function useRegisterManjuHeaderSlots(
  toolbar: ReactNode,
  generateAction: ManjuHeaderGenerateAction | null,
  tools: ManjuHeaderTools | null,
  revision: string | number,
) {
  const api = useContext(HeaderSlotsApiContext);
  const toolbarRef = useRef(toolbar);
  const actionRef = useRef(generateAction);
  const toolsRef = useRef(tools);
  toolbarRef.current = toolbar;
  actionRef.current = generateAction;
  toolsRef.current = tools;

  useLayoutEffect(() => {
    if (!api) return;
    const owner = api.claimToolbar();
    api.setToolbar(toolbarRef.current);
    return () => api.releaseToolbar(owner);
  }, [api]);

  useLayoutEffect(() => {
    if (!api) return;
    const owner = api.claimActions();
    api.setGenerateAction(actionRef.current);
    api.setTools(toolsRef.current);
    return () => api.releaseActions(owner);
  }, [api]);

  useLayoutEffect(() => {
    if (!api) return;
    api.setToolbar(toolbarRef.current);
    api.setGenerateAction(actionRef.current);
    api.setTools(toolsRef.current);
  }, [api, revision]);
}
