"use client";

import { useEffect, useRef } from "react";
import { INSPIRE_MEDIA } from "./inspire-media";

const VERT = `attribute vec2 position; varying vec2 uv;
void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}`;

const FRAG = `precision highp float;
varying vec2 uv;
uniform sampler2D picture, depthMap, water;
uniform vec2 fit;
uniform float strength;
void main(){
  vec2 base=(uv-.5)*fit+.5;
  float d=texture2D(depthMap,base).r;
  vec2 flow=(texture2D(water,uv).rg*255.-128.)/127.;
  float background=1.-smoothstep(.16,.45,d);
  vec2 refraction=flow*.026*background*strength;
  vec3 color=texture2D(picture,clamp(base+refraction,.001,.999)).rgb;
  color+=vec3(.65,.8,1.)*length(flow)*.035*background*strength;
  gl_FragColor=vec4(color,1.);
}`;

type WaterField = {
  w: number;
  h: number;
  pixels: Uint8Array;
  resetPointer: () => void;
  move: (x: number, y: number) => void;
  update: (dt: number) => void;
};

function createWaterField(): WaterField {
  const W = 96;
  const H = 64;
  const size = W * H;
  let vx = new Float32Array(size);
  let vy = new Float32Array(size);
  let nx = new Float32Array(size);
  let ny = new Float32Array(size);
  const pixels = new Uint8Array(size * 4);
  let prevX = -1;
  let prevY = -1;

  const sample = (field: Float32Array, x: number, y: number) => {
    x = Math.min(94, Math.max(1, x));
    y = Math.min(62, Math.max(1, y));
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const i = y0 * W + x0;
    return (
      (field[i]! * (1 - fx) + field[i + 1]! * fx) * (1 - fy) +
      (field[i + W]! * (1 - fx) + field[i + W + 1]! * fx) * fy
    );
  };

  return {
    w: W,
    h: H,
    pixels,
    resetPointer() {
      prevX = -1;
      prevY = -1;
    },
    move(xn, yn) {
      const x = xn * W;
      const y = yn * H;
      if (prevX < 0) {
        prevX = x;
        prevY = y;
        return;
      }
      const dx = Math.max(-6, Math.min(6, x - prevX));
      const dy = Math.max(-6, Math.min(6, y - prevY));
      const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy)));
      const force = Math.min(2, Math.hypot(dx, dy));
      for (let s = 0; s <= steps; s++) {
        const cx = prevX + ((x - prevX) * s) / steps;
        const cy = prevY + ((y - prevY) * s) / steps;
        for (
          let py = Math.max(1, Math.floor(cy - 5));
          py < Math.min(H - 1, cy + 5);
          py++
        ) {
          for (
            let px = Math.max(1, Math.floor(cx - 5));
            px < Math.min(W - 1, cx + 5);
            px++
          ) {
            const ox = px - cx;
            const oy = py - cy;
            const w = Math.exp(-(ox * ox + oy * oy) / 9) / steps;
            const i = py * W + px;
            vx[i] = Math.max(
              -3,
              Math.min(3, vx[i]! + (dx * 0.3 - oy * force * 0.12) * w),
            );
            vy[i] = Math.max(
              -3,
              Math.min(3, vy[i]! + (dy * 0.3 + ox * force * 0.12) * w),
            );
          }
        }
      }
      prevX = x;
      prevY = y;
    },
    update(dt) {
      const damp = 0.964 ** dt;
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          const i = y * W + x;
          const sx = x - vx[i]! * dt * 0.7;
          const sy = y - vy[i]! * dt * 0.7;
          nx[i] =
            (sample(vx, sx, sy) * 0.92 +
              (vx[i - 1]! + vx[i + 1]! + vx[i - W]! + vx[i + W]!) * 0.02) *
            damp;
          ny[i] =
            (sample(vy, sx, sy) * 0.92 +
              (vy[i - 1]! + vy[i + 1]! + vy[i - W]! + vy[i + W]!) * 0.02) *
            damp;
        }
      }
      const swapX = vx;
      vx = nx;
      nx = swapX;
      const swapY = vy;
      vy = ny;
      ny = swapY;
      for (let i = 0; i < size; i++) {
        pixels[i * 4] = Math.round(
          127.5 + Math.max(-1, Math.min(1, vx[i]! * 0.6)) * 127.5,
        );
        pixels[i * 4 + 1] = Math.round(
          127.5 + Math.max(-1, Math.min(1, vy[i]! * 0.6)) * 127.5,
        );
        pixels[i * 4 + 2] = 0;
        pixels[i * 4 + 3] = 255;
      }
    },
  };
}

type Props = {
  scene: number;
  paused: boolean;
  /** 0–1 refraction strength target */
  strength: number;
};

/**
 * WebGL depth refraction + low-res fluid trail (pointer-driven).
 * Renders hero + depth maps; hidden until textures load.
 */
export function InspireDepthCanvas({ scene, paused, strength }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef({ scene, paused, strength });

  useEffect(() => {
    propsRef.current = { scene, paused, strength };
  }, [scene, paused, strength]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      powerPreference: "low-power",
    });
    if (!gl) return;

    let disposed = false;
    let raf = 0;
    let visible = true;
    let lastTs = 0;
    const textures: WebGLTexture[] = [];
    const shaders: WebGLShader[] = [];

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }
      shaders.push(shader);
      return shader;
    };

    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const posLoc = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const uniforms = {
      picture: gl.getUniformLocation(program, "picture"),
      depth: gl.getUniformLocation(program, "depthMap"),
      water: gl.getUniformLocation(program, "water"),
      fit: gl.getUniformLocation(program, "fit"),
      strength: gl.getUniformLocation(program, "strength"),
    };

    const makeTexture = () => {
      const tex = gl.createTexture();
      if (!tex) return null;
      textures.push(tex);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return tex;
    };

    const water = createWaterField();
    const waterTex = makeTexture();
    if (!waterTex) return;
    water.update(1);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      water.w,
      water.h,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      water.pixels,
    );

    const loadTexture = (src: string) =>
      new Promise<WebGLTexture>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          if (disposed) return;
          const tex = makeTexture();
          if (!tex) {
            reject(new Error("texture"));
            return;
          }
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            img,
          );
          resolve(tex);
        };
        img.onerror = reject;
        img.src = src;
      });

    const scenes: Array<{ picture: WebGLTexture; depth: WebGLTexture } | null> =
      [null, null, null];

    INSPIRE_MEDIA.heroes.forEach((hero, i) => {
      void Promise.all([loadTexture(hero), loadTexture(INSPIRE_MEDIA.depths[i]!)])
        .then(([picture, depth]) => {
          scenes[i] = { picture, depth };
        })
        .catch(() => undefined);
    });

    let strengthSmooth = 0;
    const host = canvas.closest(".joy-inspire") as HTMLElement | null;

    const onMove = (e: PointerEvent) => {
      if (propsRef.current.paused || e.pointerType === "touch") return;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const x = (e.clientX - rect.left) / rect.width;
      const y = 1 - (e.clientY - rect.top) / rect.height;
      water.move(x, y);
    };
    const onLeave = () => water.resetPointer();

    host?.addEventListener("pointermove", onMove, { passive: true });
    host?.addEventListener("pointerleave", onLeave);

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const io = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;
    });
    io.observe(canvas);

    const frame = (ts: number) => {
      raf = requestAnimationFrame(frame);
      if (disposed || !visible || document.hidden || propsRef.current.paused) {
        return;
      }
      const dt = Math.min(2, Math.max(0.3, (ts - lastTs) / 16.667));
      lastTs = ts;
      const pack = scenes[propsRef.current.scene];
      if (!pack) {
        canvas.style.visibility = "hidden";
        return;
      }
      canvas.style.visibility = "visible";
      strengthSmooth += (propsRef.current.strength - strengthSmooth) * 0.08;
      water.update(dt);

      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, waterTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        water.w,
        water.h,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        water.pixels,
      );
      gl.uniform1i(uniforms.water, 2);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, pack.picture);
      gl.uniform1i(uniforms.picture, 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, pack.depth);
      gl.uniform1i(uniforms.depth, 1);

      const aspect = canvas.width / canvas.height;
      const target = 16 / 9;
      gl.uniform2f(
        uniforms.fit,
        Math.min(1, aspect / target),
        Math.min(1, target / aspect),
      );
      gl.uniform1f(uniforms.strength, strengthSmooth);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };
    raf = requestAnimationFrame(frame);

    const onLost = (e: Event) => {
      e.preventDefault();
      canvas.style.visibility = "hidden";
      cancelAnimationFrame(raf);
    };
    canvas.addEventListener("webglcontextlost", onLost);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      host?.removeEventListener("pointermove", onMove);
      host?.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("webglcontextlost", onLost);
      ro.disconnect();
      io.disconnect();
      for (const tex of textures) gl.deleteTexture(tex);
      for (const sh of shaders) gl.deleteShader(sh);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    };
  }, []);

  return (
    <canvas ref={canvasRef} className="joy-inspire-depth" aria-hidden />
  );
}
