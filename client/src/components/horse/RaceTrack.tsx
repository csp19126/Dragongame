import { memo, useEffect, useRef, useState, type MutableRefObject } from "react";
import {
  HORSES, HORSE_TRACK_M, HORSE_RUN_ON, raceShot, type RaceSim,
} from "@shared/horse";

/**
 * The race, drawn in SVG: galloping horses with jockeys in their silks, a camera that follows the
 * leading pack along a long track, the grandstand, rails, distance boards and the finish post.
 * One requestAnimationFrame loop moves everything with transforms; React only draws the scene
 * once per round (and when the width changes).
 */

export interface TrackApi {
  /** Where a horse is on screen (px from the track's top-left), for the cheers */
  horseAt(h: number): { x: number; y: number } | null;
}

const H = 244;
const SPAN = 0.24; // share of the track the camera shows
const LANE0 = 86; // ground line of the first (farthest) lane
const LANE = 19;
const FAR_RAIL = 58;
const NEAR_RAIL = 232;
const POSES = 8;
const STRIDES = 37; // strides over the whole track
const D2R = Math.PI / 180;

const laneY = (lane: number) => LANE0 + lane * LANE;
const laneScale = (lane: number) => 0.6 + lane * 0.016;

// ---------------------------------------------------------------------------------------------
// The horse, in its own coordinates: facing right, hooves on y = 0, body centred on x = 0

function leg(hx: number, hy: number, a1: number, a2: number, u: number, l: number) {
  const kx = hx + u * Math.sin(a1 * D2R), ky = hy + u * Math.cos(a1 * D2R);
  const fx = kx + l * Math.sin(a2 * D2R), fy = ky + l * Math.cos(a2 * D2R);
  return { kx, ky, fx, fy };
}

/** Leg angles through a stride. ψ in [0, 1): stance (hoof back along the ground), then the swing */
function legAngles(psi: number, front: boolean) {
  const st = 0.42;
  if (psi < st) {
    const k = psi / st;
    return { a1: 32 - 64 * k, a2: 32 - 64 * k + (front ? 0 : 8) };
  }
  const k = (psi - st) / (1 - st);
  const a1 = -32 + 64 * (0.5 - 0.5 * Math.cos(Math.PI * k));
  const fold = Math.sin(Math.PI * k) * (front ? 95 : 70);
  return { a1, a2: a1 - fold };
}

function Leg({ hx, hy, a1, a2, far, front }: { hx: number; hy: number; a1: number; a2: number; far: boolean; front: boolean }) {
  const u = front ? 10 : 11, l = front ? 11 : 10.5;
  const { kx, ky, fx, fy } = leg(hx, hy, a1, a2, u, l);
  const d = `M${hx.toFixed(1)},${hy.toFixed(1)} L${kx.toFixed(1)},${ky.toFixed(1)} L${fx.toFixed(1)},${fy.toFixed(1)}`;
  return (
    <g>
      <path d={`M${hx.toFixed(1)},${hy.toFixed(1)} L${kx.toFixed(1)},${ky.toFixed(1)}`} stroke="currentColor" strokeWidth={front ? 5 : 6.5} strokeLinecap="round" fill="none" />
      <path d={d} stroke="currentColor" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {far && <path d={d} stroke="rgba(0,0,0,0.38)" strokeWidth={front ? 3.4 : 4} strokeLinecap="round" strokeLinejoin="round" fill="none" />}
      <circle cx={fx} cy={fy - 0.5} r={1.9} fill="#1c1917" />
    </g>
  );
}

const HIP = { x: -11, y: -22 }, SHOULDER = { x: 11, y: -21 };
// Transverse gallop: hind legs, then the front legs a little later
const PHASE = { hindFar: 0, hindNear: 0.1, frontFar: 0.38, frontNear: 0.48 };

function poseLegs(k: number) {
  if (k >= POSES) {
    // Standing, with a little weight shift between the two standing poses
    const s = k === POSES ? 0 : 3;
    return {
      hindFar: { a1: -4 + s, a2: 6 }, hindNear: { a1: 4, a2: 10 - s }, frontFar: { a1: 2, a2: 2 }, frontNear: { a1: -3 + s, a2: -3 + s },
    };
  }
  const psi = (o: number) => (k / POSES + o) % 1;
  return {
    hindFar: legAngles(psi(PHASE.hindFar), false), hindNear: legAngles(psi(PHASE.hindNear), false),
    frontFar: legAngles(psi(PHASE.frontFar), true), frontNear: legAngles(psi(PHASE.frontNear), true),
  };
}

/** Behind the body: far legs and the tail */
function FarPose({ k }: { k: number }) {
  const L = poseLegs(k);
  const running = k < POSES;
  const w = running ? Math.sin((k / POSES) * Math.PI * 2) : k === POSES ? 0 : 0.6;
  const tipY = -20 + w * 3, tipX = running ? -36 : -27;
  return (
    <g id={`hf${k}`}>
      <path d={`M-15,-29 C${-22},-31 ${tipX + 6},${tipY - 6} ${tipX},${tipY} C${tipX + 5},${tipY - 1} ${-21},-23 -15,-24 Z`} style={{ fill: "var(--mane)" }} />
      <Leg hx={HIP.x + 2} hy={HIP.y} {...L.hindFar} far front={false} />
      <Leg hx={SHOULDER.x - 2} hy={SHOULDER.y} {...L.frontFar} far front />
    </g>
  );
}

/** In front of the body: near legs, neck, head and mane */
function NearPose({ k }: { k: number }) {
  const L = poseLegs(k);
  const running = k < POSES;
  const nod = running ? Math.sin((k / POSES) * Math.PI * 2 + 1) * 4 : -12;
  const flow = running ? Math.sin((k / POSES) * Math.PI * 4) * 1.6 : 0;
  return (
    <g id={`hn${k}`}>
      <Leg hx={HIP.x} hy={HIP.y} {...L.hindNear} far={false} front={false} />
      <Leg hx={SHOULDER.x} hy={SHOULDER.y} {...L.frontNear} far={false} front />
      <g transform={`rotate(${nod.toFixed(1)} 11 -27)`}>
        <path d="M6,-31 L14,-43 C16,-46 20,-47 22,-45 L19,-37 C18,-32 15,-27 12,-24 Z" fill="currentColor" />
        <path d="M16,-46 C19,-49 24,-47 27,-43 L33,-38 C34.5,-36.5 33,-34 30.5,-34.6 L22,-37.5 Z" fill="currentColor" />
        <path d="M17,-46 L18.5,-51 L20.5,-46.5 Z" fill="currentColor" />
        <circle cx={23.2} cy={-43} r={0.9} fill="#0c0a09" />
        <path d="M30,-36 L34,-37" stroke="#0c0a09" strokeWidth={0.8} />
        <path d={`M17,-47 Q11,${-44 + flow} 6,${-33 + flow} L${3 - flow},${-36 + flow} L7,${-38 - flow} L${4 - flow},${-41} L10,${-43 - flow} Z`} style={{ fill: "var(--mane)" }} />
      </g>
    </g>
  );
}

/** The body, saddle cloth and jockey (silks in the horse's colour, number on the cloth) */
function HorseBody({ h }: { h: number }) {
  const info = HORSES[h];
  const dark = "#1c1917";
  const silksStroke = info.color === "#f8fafc" || info.color === "#facc15" ? "#57534e" : "rgba(0,0,0,0.35)";
  return (
    <>
      <circle cx={-11} cy={-25} r={7.6} fill="currentColor" />
      <circle cx={11} cy={-24.5} r={7} fill="currentColor" />
      <path d="M-15,-28 C-15,-32 -8,-32.5 -2,-32 L10,-31 C15,-30.5 17,-27 16,-22 C15,-19 11,-17.5 6,-17.5 L-8,-17.5 C-14,-17.5 -16,-22 -15,-28 Z" fill="currentColor" />
      {/* Saddle cloth */}
      <rect x={-7} y={-31} width={12} height={10} rx={1.5} fill={info.color} stroke="rgba(255,255,255,0.85)" strokeWidth={0.7} />
      <text x={-1} y={-23.2} textAnchor="middle" fontSize={8.2} fontWeight={900} fill={info.ink} style={{ fontFamily: "system-ui, sans-serif" }}>{h + 1}</text>
      {/* Jockey: boot and leg, crouched body, arm to the reins, head and cap */}
      <path d="M-1,-33 L4,-27.5 L1.5,-25" stroke={dark} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M-4,-34 C-2,-41 7,-43.5 12,-40 C11,-35.5 4,-33 -4,-34 Z" fill={info.color} stroke={silksStroke} strokeWidth={0.6} />
      <path d="M9,-39 L16,-35.5 L20,-38" stroke={info.color} strokeWidth={2.2} fill="none" strokeLinecap="round" />
      <path d="M20,-38 L21,-40" stroke="#7c2d12" strokeWidth={0.7} />
      <circle cx={14} cy={-43.3} r={2.9} fill="#f2c9a0" />
      <path d="M11,-43.6 C11,-47.6 17,-47.8 17.2,-44 L19.3,-43.4 L11,-43.4 Z" fill={info.color} stroke={silksStroke} strokeWidth={0.5} />
    </>
  );
}

function Defs() {
  const crowdColors = ["#f87171", "#fbbf24", "#60a5fa", "#34d399", "#f472b6", "#e5e7eb", "#a78bfa", "#fb923c"];
  return (
    <defs>
      {Array.from({ length: POSES + 2 }, (_, k) => <FarPose key={`f${k}`} k={k} />)}
      {Array.from({ length: POSES + 2 }, (_, k) => <NearPose key={`n${k}`} k={k} />)}
      <pattern id="hr-turf" width={80} height={10} patternUnits="userSpaceOnUse">
        <rect width={80} height={10} fill="#2f7d32" />
        <rect width={40} height={10} fill="#33873a" />
      </pattern>
      <pattern id="hr-crowd" width={120} height={34} patternUnits="userSpaceOnUse">
        <rect width={120} height={34} fill="#3b2a4f" />
        {Array.from({ length: 3 }, (_, row) => Array.from({ length: 10 }, (_, i) => {
          const x = i * 12 + (row % 2) * 6 + 3, y = 8 + row * 10;
          const c = crowdColors[(i * 3 + row * 5) % crowdColors.length];
          return (
            <g key={`${row}-${i}`}>
              <rect x={x - 3.5} y={y + 1.5} width={7} height={6} rx={2.5} fill={c} opacity={0.85} />
              <circle cx={x} cy={y} r={2.6} fill={(i + row) % 3 ? "#f2c9a0" : "#c68e5f"} />
            </g>
          );
        }))}
      </pattern>
      <linearGradient id="hr-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#1e1b4b" />
        <stop offset="1" stopColor="#4c1d95" />
      </linearGradient>
      <linearGradient id="hr-turf-shade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="rgba(0,0,0,0.25)" />
        <stop offset="0.25" stopColor="rgba(0,0,0,0)" />
        <stop offset="1" stopColor="rgba(0,0,0,0.12)" />
      </linearGradient>
    </defs>
  );
}

const MARKERS = [1400, 1200, 1000, 800, 600, 400, 300, 200, 100];

export const RaceTrack = memo(function RaceTrack({ sim, getT, mine, apiRef }: {
  sim: RaceSim | null;
  /** ms since the off on the server's clock (negative before it), or null while loading */
  getT: () => number | null;
  /** Horses the player backed, as a string like "1,4" so the scene isn't redrawn needlessly */
  mine: string;
  apiRef?: MutableRefObject<TrackApi | null>;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(360);
  const svg = useRef<SVGSVGElement>(null);
  const zoomG = useRef<SVGGElement>(null);
  const world = useRef<SVGGElement>(null);
  const nearRail = useRef<SVGGElement>(null);
  const crowd = useRef<SVGGElement>(null);
  const flash = useRef<HTMLDivElement>(null);
  const horseG = useRef<(SVGGElement | null)[]>([]);
  const bobG = useRef<(SVGGElement | null)[]>([]);
  const farU = useRef<(SVGUseElement | null)[]>([]);
  const nearU = useRef<(SVGUseElement | null)[]>([]);
  const dust = useRef<(SVGGElement | null)[]>([]);
  const pos = useRef<{ x: number; y: number }[]>(HORSES.map((_, i) => ({ x: 0, y: laneY(i) })));
  const mineSet = new Set(mine ? mine.split(",").map(Number) : []);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || 360));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = { horseAt: (h) => pos.current[h] ?? null };
    return () => { apiRef.current = null; };
  }, [apiRef]);

  useEffect(() => {
    const trackPx = W / SPAN;
    const last = { frame: [] as string[], filter: "", flash: -1 };
    let id = 0;
    const draw = () => {
      id = requestAnimationFrame(draw);
      const t = getT();
      const shot = raceShot(sim, t ?? -1);
      const prog = (h: number) => (sim && shot.mode !== "gate" ? sim.progress(h, shot.d) : 0);
      const ps = HORSES.map((_, h) => prog(h));
      // Camera: the leader about three quarters across; at the gate, the stalls a third across
      let left: number;
      if (shot.mode === "gate") left = -0.45 * SPAN;
      else if (shot.mode === "replay") left = 1 - 0.64 * SPAN;
      else left = Math.min(Math.max(Math.max(...ps) - 0.74 * SPAN, -0.45 * SPAN), 1 - 0.55 * SPAN);
      const xOf = (p: number) => (p - left) * trackPx;
      const shift = `translate(${(-left * trackPx).toFixed(1)},0)`;
      world.current?.setAttribute("transform", shift);
      nearRail.current?.setAttribute("transform", shift);
      const period = 120;
      const cx = -(((left * trackPx * 0.5) % period) + period) % period;
      const finalStretch = shot.mode === "live" && sim && Math.max(...ps) > 0.85 && Math.max(...ps) < 1 + HORSE_RUN_ON;
      const bounce = finalStretch ? Math.abs(Math.sin(performance.now() / 110)) * 1.5 : 0;
      crowd.current?.setAttribute("transform", `translate(${cx.toFixed(1)},${(-bounce).toFixed(1)})`);

      // Horses
      let leadX = 0, leadY = 0;
      const order = sim && shot.mode !== "gate" ? sim.standings(shot.d) : [];
      HORSES.forEach((_, h) => {
        const g = horseG.current[h];
        if (!g) return;
        const p = ps[h];
        const s = laneScale(h);
        const nose = 30 * s;
        let x = xOf(p) - nose;
        const minX = 16;
        const offLeft = x < minX;
        if (offLeft) x = minX;
        const y = laneY(h);
        g.setAttribute("transform", `translate(${x.toFixed(1)},${y}) scale(${s})`);
        g.style.opacity = offLeft ? "0.55" : "1";
        pos.current[h] = { x, y: y - 30 * s };
        if (order[0] === h) { leadX = x + nose; leadY = y; }
        if (order[1] === h) leadY = (leadY + y) / 2;
        // Stride: the legs turn over with the ground covered, so they slow down with the horse
        let frame: number;
        const running = shot.mode !== "gate" && p > 0 && p < 1 + HORSE_RUN_ON * 0.97;
        if (running) {
          const phi = p * STRIDES + h * 0.37;
          frame = Math.floor((phi - Math.floor(phi)) * POSES);
          const bob = -Math.abs(Math.sin((phi - Math.floor(phi)) * Math.PI * 2)) * 1.8;
          bobG.current[h]?.setAttribute("transform", `translate(0,${bob.toFixed(2)})`);
        } else {
          frame = POSES + (Math.floor(performance.now() / 900 + h * 0.7) % 2);
          bobG.current[h]?.setAttribute("transform", "translate(0,0)");
        }
        const key = String(frame);
        if (last.frame[h] !== key) {
          last.frame[h] = key;
          farU.current[h]?.setAttribute("href", `#hf${frame}`);
          nearU.current[h]?.setAttribute("href", `#hn${frame}`);
        }
        // Dust kicked up behind the hooves
        const dg = dust.current[h];
        if (dg) {
          const kids = dg.children;
          for (let i = 0; i < kids.length; i++) {
            const c = kids[i] as SVGElement;
            if (!running || p < 0.01) { c.style.opacity = "0"; continue; }
            const age = ((p * STRIDES * 0.5 + i / kids.length) % 1);
            c.setAttribute("transform", `translate(${(-14 - age * 26).toFixed(1)},${(-2 - age * 7).toFixed(1)}) scale(${(0.6 + age * 1.6).toFixed(2)})`);
            c.style.opacity = ((1 - age) * 0.55).toFixed(2);
          }
        }
      });

      // Zoom on a close finish, and in the replay
      const z = shot.zoom * (shot.mode === "replay" ? 0.14 : 0.3);
      if (z > 0.001) {
        const ax = shot.mode === "replay" ? xOf(1) : Math.min(Math.max(leadX, 60), W - 40);
        const ay = shot.mode === "replay" ? (laneY(0) + laneY(7)) / 2 - 12 : Math.min(Math.max(leadY - 14, 60), H - 40);
        zoomG.current?.setAttribute("transform", `translate(${ax.toFixed(1)},${ay.toFixed(1)}) scale(${(1 + z).toFixed(3)}) translate(${(-ax).toFixed(1)},${(-ay).toFixed(1)})`);
      } else zoomG.current?.setAttribute("transform", "");

      // Photo finish: a sepia freeze frame with a flash
      const filter = shot.freeze ? "sepia(0.85) contrast(1.15) brightness(1.05)" : shot.mode === "replay" ? "saturate(0.75) contrast(1.05)" : "";
      if (filter !== last.filter && svg.current) { last.filter = filter; svg.current.style.filter = filter; }
      const fl = Math.round(shot.flash * 100) / 100;
      if (fl !== last.flash && flash.current) { last.flash = fl; flash.current.style.opacity = String(fl); }
    };
    id = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(id);
  }, [sim, W, getT]);

  const trackPx = W / SPAN;
  const worldFrom = -0.45 * trackPx, worldTo = 1.35 * trackPx;
  const posts = Array.from({ length: Math.ceil((HORSE_TRACK_M * 1.8) / 25) }, (_, i) => worldFrom + i * (25 / HORSE_TRACK_M) * trackPx);
  const finishX = trackPx;

  return (
    <div ref={box} className="relative w-full overflow-hidden rounded-2xl border-2 border-white/20 select-none bg-[#2f7d32]" style={{ height: H }} data-testid="horse-track">
      <svg ref={svg} width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block" style={{ willChange: "filter" }}>
        <Defs />
        <g ref={zoomG}>
          {/* Sky, grandstand and crowd */}
          <rect x={0} y={0} width={W} height={50} fill="url(#hr-sky)" />
          <g ref={crowd}>
            <rect x={0} y={4} width={W + 240} height={9} fill="#14532d" />
            {Array.from({ length: Math.ceil((W + 240) / 60) }, (_, i) => (
              <path key={i} d={`M${i * 60},4 L${i * 60 + 30},0 L${i * 60 + 60},4 Z`} fill={i % 2 ? "#facc15" : "#dc2626"} />
            ))}
            <rect x={0} y={13} width={W + 240} height={34} fill="url(#hr-crowd)" />
            {Array.from({ length: Math.ceil((W + 240) / 240) }, (_, i) => (
              <g key={i} transform={`translate(${i * 240 + 70},38)`}>
                <rect x={0} y={0} width={88} height={11} rx={2} fill="#7f1d1d" stroke="#facc15" strokeWidth={0.8} />
                <text x={44} y={8.4} textAnchor="middle" fontSize={8} fontWeight={900} fill="#fde68a" style={{ fontFamily: "system-ui, sans-serif" }}>VnSlot 888</text>
              </g>
            ))}
          </g>
          <g ref={world}>
            {/* Turf */}
            <rect x={worldFrom} y={50} width={worldTo - worldFrom} height={H - 50} fill="url(#hr-turf)" />
            {/* Far rail, posts and distance boards */}
            <rect x={worldFrom} y={FAR_RAIL - 2} width={worldTo - worldFrom} height={3} fill="#f8fafc" />
            {posts.map((x, i) => <rect key={i} x={x - 1} y={FAR_RAIL - 2} width={2} height={8} fill="#e5e7eb" />)}
            {MARKERS.map((m) => {
              const x = (1 - m / HORSE_TRACK_M) * trackPx;
              return (
                <g key={m} transform={`translate(${x},${FAR_RAIL - 16})`}>
                  <rect x={-1} y={8} width={2} height={10} fill="#e5e7eb" />
                  <rect x={-15} y={-1} width={30} height={11} rx={2} fill={m <= 200 ? "#dc2626" : "#f8fafc"} stroke="#111827" strokeWidth={0.6} />
                  <text x={0} y={7.6} textAnchor="middle" fontSize={7.5} fontWeight={900} fill={m <= 200 ? "#fff" : "#111827"} style={{ fontFamily: "system-ui, sans-serif" }}>{m}m</text>
                </g>
              );
            })}
            {/* Finish line and the winning post */}
            <rect x={finishX - 2} y={FAR_RAIL} width={4} height={NEAR_RAIL - FAR_RAIL} fill="#f8fafc" opacity={0.95} />
            <rect x={finishX + 2} y={FAR_RAIL} width={1.5} height={NEAR_RAIL - FAR_RAIL} fill="#dc2626" opacity={0.8} />
            <rect x={finishX - 1.5} y={FAR_RAIL - 36} width={3} height={38} fill="#f8fafc" />
            <circle cx={finishX} cy={FAR_RAIL - 38} r={7} fill="#dc2626" stroke="#fff" strokeWidth={2} />
            <text x={finishX} y={FAR_RAIL - 35.5} textAnchor="middle" fontSize={7} fontWeight={900} fill="#fff">🏁</text>
            {/* Start stalls */}
            {HORSES.map((_, i) => (
              <g key={i} transform={`translate(0,${laneY(i)})`}>
                <rect x={-4} y={-30} width={3} height={30} fill="#9ca3af" />
                <rect x={-4} y={-31} width={26} height={2.5} fill="#6b7280" />
                <rect x={20} y={-30} width={3} height={30} fill="#d1d5db" />
              </g>
            ))}
          </g>
          {/* Horses, far lane first */}
          {HORSES.map((info, h) => (
            <g key={h} ref={(el) => { horseG.current[h] = el; }} style={{ color: info.coat, ["--mane" as string]: info.mane }} data-testid={`horse-${h + 1}`}>
              <ellipse cx={0} cy={0} rx={20} ry={3.4} fill={mineSet.has(h) ? "rgba(250,204,21,0.75)" : "rgba(0,0,0,0.28)"} />
              <g ref={(el) => { dust.current[h] = el; }}>
                {[0, 1, 2].map((i) => <circle key={i} cx={0} cy={0} r={3.2} fill="#d6c7a1" style={{ opacity: 0 }} />)}
              </g>
              <g ref={(el) => { bobG.current[h] = el; }}>
                <use ref={(el) => { farU.current[h] = el; }} href={`#hf${POSES}`} />
                <HorseBody h={h} />
                <use ref={(el) => { nearU.current[h] = el; }} href={`#hn${POSES}`} />
              </g>
            </g>
          ))}
          {/* Near rail, in front of the horses (moves with the world) */}
          <rect x={0} y={NEAR_RAIL} width={W} height={H - NEAR_RAIL} fill="#1f5e24" />
          <g ref={nearRail}>
            <rect x={worldFrom} y={NEAR_RAIL} width={worldTo - worldFrom} height={3.5} fill="#f8fafc" />
            {posts.map((x, i) => i % 2 === 0 && <rect key={i} x={x - 1.2} y={NEAR_RAIL} width={2.4} height={12} fill="#e5e7eb" />)}
            <rect x={finishX - 2} y={NEAR_RAIL - 4} width={4} height={16} fill="#dc2626" />
          </g>
          <rect x={0} y={50} width={W} height={H - 50} fill="url(#hr-turf-shade)" pointerEvents="none" />
        </g>
      </svg>
      <div ref={flash} className="absolute inset-0 bg-white pointer-events-none" style={{ opacity: 0 }} />
    </div>
  );
});
