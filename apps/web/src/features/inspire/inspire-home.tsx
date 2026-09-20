"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUpRight, Sparkles } from "lucide-react";
import { useActiveWallpaper } from "@/features/appearance";
import { InspireScrubVideo } from "./inspire-scrub-video";
import { InspireDepthCanvas } from "./inspire-depth-canvas";
import {
  buildTransition,
  clampScene,
  INSPIRE_SCENE_COUNT,
  lineDelay,
  smoothstep,
  type InspireTransition,
} from "./inspire-media";
import "./inspire-home.css";

const CreationComposer = dynamic(
  () =>
    import("@/features/studio/creation-composer").then((m) => m.CreationComposer),
  {
    ssr: false,
    loading: () => (
      <div className="joy-inspire-composer-skeleton" aria-hidden />
    ),
  },
);

const FOCUS = [50, 30, 75] as const;
const SCENE_LABELS = ["创作", "能力", "入口"] as const;

const CAPABILITIES = [
  { title: "图像与视频", desc: "提示词直出画面" },
  { title: "无限画布", desc: "节点编排视觉流程" },
  { title: "漫剧工作台", desc: "分镜到成片一条链" },
] as const;

const ENTRANCES = [
  { href: "/explore", label: "探索", hint: "发现灵感" },
  { href: "/canvas", label: "画布", hint: "自由编排" },
  { href: "/manju", label: "漫剧", hint: "叙事成片" },
  { href: "/assets", label: "资产", hint: "素材库" },
] as const;

function makeGate(ms = 280) {
  let last = -Infinity;
  return (now: number, blocked: boolean) => {
    const ok = now - last > ms;
    if (ok && !blocked) last = now;
    return ok && !blocked;
  };
}

export function InspireHome() {
  const router = useRouter();
  const theme = useActiveWallpaper();
  const stageMedia = theme?.kind === "stage" ? (theme.stage ?? null) : null;
  const rootRef = useRef<HTMLElement>(null);
  const sceneRef = useRef(0);
  const transitionRef = useRef<InspireTransition | null>(null);
  const cooldownUntil = useRef(0);

  const [scene, setScene] = useState(0);
  const [transition, setTransition] = useState<InspireTransition | null>(null);
  const [progress, setProgress] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [coarsePointer, setCoarsePointer] = useState(false);
  const [trailOn, setTrailOn] = useState(true);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const coarse = window.matchMedia("(hover: none)");
    const sync = () => {
      setReducedMotion(reduce.matches);
      setCoarsePointer(coarse.matches);
    };
    sync();
    reduce.addEventListener("change", sync);
    coarse.addEventListener("change", sync);
    return () => {
      reduce.removeEventListener("change", sync);
      coarse.removeEventListener("change", sync);
    };
  }, []);

  const finishTransition = useCallback(() => {
    const t = transitionRef.current;
    if (!t) return;
    sceneRef.current = t.to;
    setScene(t.to);
    transitionRef.current = null;
    setTransition(null);
    setProgress(0);
    cooldownUntil.current = performance.now() + 180;
  }, []);

  const jumpTo = useCallback((target: number) => {
    transitionRef.current = null;
    setTransition(null);
    setProgress(0);
    const next = clampScene(target);
    sceneRef.current = next;
    setScene(next);
    cooldownUntil.current = performance.now() + 180;
  }, []);

  const advance = useCallback(
    (dir: number) => {
      if (transitionRef.current || performance.now() < cooldownUntil.current) {
        return;
      }
      const next = clampScene(sceneRef.current + dir);
      if (next === sceneRef.current) return;

      const t = buildTransition(sceneRef.current, next);
      if (t && stageMedia && !reducedMotion) {
        transitionRef.current = t;
        setProgress(0);
        setTransition(t);
      } else {
        sceneRef.current = next;
        setScene(next);
        cooldownUntil.current = performance.now() + 180;
      }
    },
    [reducedMotion, stageMedia],
  );

  useEffect(() => {
    const gate = makeGate();
    let touch: { x: number; y: number } | null = null;

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.deltaY === 0) return;
      e.preventDefault();
      const dy =
        e.deltaY *
        (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1);
      if (Math.abs(dy) < 2) return;
      if (
        gate(
          performance.now(),
          !!transitionRef.current || performance.now() < cooldownUntil.current,
        )
      ) {
        advance(Math.sign(dy));
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof Element &&
        e.target.closest("a,button,input,textarea,select,[contenteditable]")
      ) {
        return;
      }
      const dir = ["ArrowDown", "PageDown", " "].includes(e.key)
        ? 1
        : ["ArrowUp", "PageUp"].includes(e.key)
          ? -1
          : 0;
      if (!dir) return;
      e.preventDefault();
      if (!e.repeat) advance(dir);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        touch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else touch = null;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!touch || e.touches.length !== 1) {
        if (e.touches.length !== 1) touch = null;
        return;
      }
      const n = e.touches[0];
      if (Math.abs(n.clientY - touch.y) > Math.abs(n.clientX - touch.x)) {
        e.preventDefault();
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      const start = touch;
      touch = null;
      if (!start || e.changedTouches.length === 0) return;
      const end = e.changedTouches[0];
      const dy = start.y - end.clientY;
      if (Math.abs(dy) > 35 && Math.abs(dy) > Math.abs(start.x - end.clientX)) {
        advance(Math.sign(dy));
      }
    };

    const el = rootRef.current;
    el?.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    el?.addEventListener("touchstart", onTouchStart, { passive: true });
    el?.addEventListener("touchmove", onTouchMove, { passive: false });
    el?.addEventListener("touchend", onTouchEnd);
    el?.addEventListener("touchcancel", () => {
      touch = null;
    });

    return () => {
      el?.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
      el?.removeEventListener("touchstart", onTouchStart);
      el?.removeEventListener("touchmove", onTouchMove);
      el?.removeEventListener("touchend", onTouchEnd);
    };
  }, [advance]);

  const displayScene = clampScene(
    transition
      ? progress < 0.5
        ? transition.from
        : transition.to
      : scene,
  );
  const copyScene = transition
    ? progress >= 0.5
      ? clampScene(transition.to)
      : -1
    : scene;

  const createVisible = +(copyScene === 0);
  const abilityVisible = +(copyScene === 1);
  const entrancesVisible = +(copyScene === 2);
  const focus =
    transition != null
      ? FOCUS[clampScene(transition.from)] +
        (FOCUS[clampScene(transition.to)] - FOCUS[clampScene(transition.from)]) *
          smoothstep(progress)
      : FOCUS[displayScene];

  const trailActive = trailOn && !reducedMotion;
  const showTrail = trailActive && !coarsePointer && !transition;

  const stageStyle = {
    "--inspire-focus": `${focus}%`,
  } as CSSProperties;

  return (
    <section
      ref={rootRef}
      className="joy-inspire"
      aria-label="灵感开场"
      data-scene={displayScene}
      aria-busy={!!transition}
      style={stageStyle}
    >
      {stageMedia ? (
      <div className="joy-inspire-stage" aria-hidden>
        {stageMedia.heroes.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={src}
            src={src}
            alt=""
            data-static-scene={i}
            className="joy-inspire-media"
            style={{ opacity: displayScene === i ? 1 : 0 }}
            draggable={false}
          />
        ))}

        <div
          className="joy-inspire-canvas-layer"
          style={{ opacity: showTrail ? 1 : 0 }}
        >
          <InspireDepthCanvas
            scene={displayScene}
            paused={!trailActive || coarsePointer}
            strength={transition ? 0 : 1}
          />
        </div>

        {([0, 1] as const).flatMap((index) =>
          ([false, true] as const).map((reverse) => (
            <InspireScrubVideo
              key={`${index}-${reverse}`}
              index={index}
              reverse={reverse}
              prepared={reverse ? scene > index : scene >= index}
              active={
                transition?.index === index && transition.reverse === reverse
                  ? transition
                  : null
              }
              onProgress={setProgress}
              onFinish={finishTransition}
            />
          )),
        )}
      </div>
      ) : null}

      <button
        type="button"
        className="joy-inspire-advance"
        aria-label={transition ? "画面切换中" : "进入下一个画面"}
        tabIndex={-1}
        disabled={!!transition}
        onClick={() => advance(1)}
      />

      {!reducedMotion && !coarsePointer && stageMedia ? (
        <button
          type="button"
          className="joy-inspire-trail-toggle"
          aria-pressed={trailOn}
          aria-label={trailOn ? "关闭水面拖尾" : "开启水面拖尾"}
          title={trailOn ? "关闭水面拖尾" : "开启水面拖尾"}
          onClick={() => setTrailOn((v) => !v)}
        >
          <Sparkles size={15} aria-hidden />
        </button>
      ) : null}

      <div
        className={`joy-inspire-create ${createVisible ? "is-visible" : ""}`}
        style={{
          opacity: createVisible,
          pointerEvents: createVisible > 0.9 ? "auto" : "none",
          visibility: createVisible === 0 ? "hidden" : "visible",
        }}
        aria-hidden={createVisible < 0.9}
      >
        <CreationComposer
          variant="hero"
          onSubmitted={() => router.push("/studio")}
        />
      </div>

      <article
        className={`joy-inspire-panel joy-inspire-ability ${abilityVisible ? "is-visible" : ""}`}
        style={{
          opacity: abilityVisible,
          pointerEvents: abilityVisible > 0.9 ? "auto" : "none",
          visibility: abilityVisible === 0 ? "hidden" : "visible",
        }}
        aria-hidden={abilityVisible < 0.9}
      >
        <p className="joy-inspire-kicker reveal-line" style={lineDelay(0)}>
          02
        </p>
        <h2 className="reveal-line" style={lineDelay(1)}>
          一条链路，
          <br />
          把想法做成画面。
        </h2>
        <ul className="joy-inspire-ability-list">
          {CAPABILITIES.map((item, i) => (
            <li
              key={item.title}
              className="reveal-line"
              style={lineDelay(2 + i)}
            >
              <strong>{item.title}</strong>
              <span>{item.desc}</span>
            </li>
          ))}
        </ul>
      </article>

      <article
        className={`joy-inspire-panel joy-inspire-entrances ${entrancesVisible ? "is-visible" : ""}`}
        style={{
          opacity: entrancesVisible,
          pointerEvents: entrancesVisible > 0.9 ? "auto" : "none",
          visibility: entrancesVisible === 0 ? "hidden" : "visible",
        }}
        aria-hidden={entrancesVisible < 0.9}
      >
        <p className="joy-inspire-kicker reveal-line" style={lineDelay(0)}>
          03
        </p>
        <h2 className="reveal-line" style={lineDelay(1)}>
          从这里继续。
        </h2>
        <div className="joy-inspire-entrance-grid">
          {ENTRANCES.map((item, i) => (
            <button
              key={item.href}
              type="button"
              className="joy-inspire-entrance reveal-line"
              style={lineDelay(2 + i)}
              onClick={() => router.push(item.href)}
            >
              <span>
                <b>{item.label}</b>
                <small>{item.hint}</small>
              </span>
              <ArrowUpRight size={18} aria-hidden />
            </button>
          ))}
        </div>
      </article>

      <footer className="joy-inspire-footer">
        <div className="joy-inspire-dots" aria-label="场景选择">
          {Array.from({ length: INSPIRE_SCENE_COUNT }, (_, i) => (
            <button
              key={i}
              type="button"
              className={displayScene === i ? "is-active" : undefined}
              aria-label={SCENE_LABELS[i]}
              aria-current={displayScene === i ? "step" : undefined}
              onClick={() => jumpTo(i)}
            >
              0{i + 1}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="joy-inspire-next"
          disabled={!!transition || scene >= INSPIRE_SCENE_COUNT - 1}
          aria-label="下一个画面"
          onClick={() => advance(1)}
        >
          <ArrowDown size={22} aria-hidden />
        </button>
      </footer>

      <div className="joy-inspire-progress" aria-hidden>
        <i style={{ transform: `scaleX(${scene / (INSPIRE_SCENE_COUNT - 1)})` }} />
      </div>
    </section>
  );
}
