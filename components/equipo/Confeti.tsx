"use client";

import { useEffect, useRef } from "react";

export interface Disparo {
  id: number; // cambia en cada disparo
  tipo: "grande" | "chico";
  x?: number; // origen (px de la ventana) para el disparo chico
  y?: number;
}

const COLORES = ["#4F46E5", "#818CF8", "#10B981", "#34D399", "#F59E0B", "#F43F5E", "#22D3EE", "#FFFFFF"];

interface Particula {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  w: number;
  h: number;
  color: string;
  vida: number;
  circulo: boolean;
}

/** Confeti en canvas, sin dependencias. Respeta "reducir movimiento" del sistema. */
export default function Confeti({ disparo }: { disparo: Disparo | null }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const particulas = useRef<Particula[]>([]);
  const animando = useRef(false);

  useEffect(() => {
    if (!disparo || !canvas.current) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const c = canvas.current;
    const dpr = window.devicePixelRatio || 1;
    c.width = window.innerWidth * dpr;
    c.height = window.innerHeight * dpr;
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const nuevas: Particula[] = [];
    const crear = (x: number, y: number, angulo: number, abertura: number, fuerza: number) => {
      const a = angulo + (Math.random() - 0.5) * abertura;
      const v = fuerza * (0.55 + Math.random() * 0.6);
      nuevas.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        w: 6 + Math.random() * 6,
        h: 4 + Math.random() * 6,
        color: COLORES[Math.floor(Math.random() * COLORES.length)],
        vida: 1,
        circulo: Math.random() < 0.25,
      });
    };
    const W = window.innerWidth;
    const H = window.innerHeight;
    if (disparo.tipo === "grande") {
      for (let i = 0; i < 90; i++) crear(0, H * 0.75, -Math.PI / 3, 0.9, 17);
      for (let i = 0; i < 90; i++) crear(W, H * 0.75, (-2 * Math.PI) / 3, 0.9, 17);
      for (let i = 0; i < 60; i++) crear(W / 2, H * 0.3, -Math.PI / 2, Math.PI * 1.6, 11);
    } else {
      const x = disparo.x ?? W / 2;
      const y = disparo.y ?? H / 2;
      for (let i = 0; i < 40; i++) crear(x, y, -Math.PI / 2, Math.PI * 1.2, 9);
    }
    particulas.current.push(...nuevas);

    if (animando.current) return;
    animando.current = true;
    let previo = performance.now();
    const paso = (t: number) => {
      const dt = Math.min(2, (t - previo) / 16.7);
      previo = t;
      ctx.clearRect(0, 0, W, H);
      particulas.current = particulas.current.filter((p) => p.vida > 0 && p.y < H + 40);
      for (const p of particulas.current) {
        p.vy += 0.35 * dt; // gravedad
        p.vx *= 0.99;
        p.vy *= 0.99;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        p.vida -= 0.006 * dt;
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, p.vida * 1.5));
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.circulo) {
          ctx.beginPath();
          ctx.arc(0, 0, p.w / 2.5, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot)));
        }
        ctx.restore();
      }
      if (particulas.current.length) requestAnimationFrame(paso);
      else {
        animando.current = false;
        ctx.clearRect(0, 0, W, H);
      }
    };
    requestAnimationFrame(paso);
  }, [disparo]);

  return <canvas ref={canvas} aria-hidden className="pointer-events-none fixed inset-0 z-[60] h-full w-full" />;
}
