import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { OrgNetworkNode } from './lobby';

interface SimNode {
  id: string;
  kind: 'party' | 'org';
  label: string;
  color: string;
  r: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fixed: boolean;
  orgId?: string;
  ties?: { party: string; memberCount: number }[];
  /** Single-tie orgs only: the spiral distance they were deliberately seeded at, so the
   * spring pulls toward THAT (already non-overlapping) radius instead of a generic
   * per-weight one — otherwise every single-tie org gets dragged toward the same
   * distance regardless of how many siblings share its party, collapsing a
   * carefully-spread 72-org spiral back into one overcrowded ring. */
  homeRadius?: number;
}

interface SimEdge {
  source: string;
  target: string;
  party: string;
  weight: number;
}

interface Graph {
  nodes: SimNode[];
  edges: SimEdge[];
}

const WIDTH = 760;
// Taller than a "natural" 2:1 spread so the graph doesn't get so squashed at
// mobile widths — height is independent of the width-driven scale factor, so
// this buys nodes more room to spread out without shrinking anything.
const HEIGHT = 560;
/** Extra invisible radius added to every node's tap/click target — the visible dot can stay small, the hit area doesn't have to. */
const HIT_PAD = 10;
/** Keep every node's *circle* (not just its center) fully inside the canvas. */
const EDGE_PAD = 4;
/** Hard ceiling on the settle animation's length, in frames (~2.3s at 60fps) — see runSim(). */
const MAX_FRAMES = 140;
/** Frame at which repulsion/spring forces start easing toward zero, tapering off by MAX_FRAMES. */
const EASE_START = 90;
/** Realistic early-exit energy for the sparser cross-party-only graph — the old 0.01 was never reachable. */
const STOP_ENERGY = 0.4;

function clampToCanvas(n: { x: number; y: number; r: number }) {
  n.x = Math.max(n.r + EDGE_PAD, Math.min(WIDTH - n.r - EDGE_PAD, n.x));
  n.y = Math.max(n.r + EDGE_PAD, Math.min(HEIGHT - n.r - EDGE_PAD, n.y));
}

/**
 * Directly separates any pair still closer than their combined tap-target radius
 * (r + HIT_PAD each). Springs and repulsion only make separation a *preference* —
 * several orgs sharing the same one or two parties all get pulled toward nearly
 * the same equilibrium point, and no amount of force-constant tuning reliably
 * wins that tug-of-war for all of them at once. This makes the minimum gap a
 * guarantee: push each violating pair apart by half the overlap, symmetrically.
 * Returns whether it moved anything, so the caller can stop once stable.
 */
function resolveOverlaps(nodes: SimNode[]): boolean {
  let moved = false;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      if (a.fixed && b.fixed) continue;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let dist = Math.hypot(dx, dy);
      const minGap = a.r + b.r + HIT_PAD * 2 + 6;
      if (dist >= minGap) continue;
      moved = true;
      if (dist < 0.01) {
        const jitter = Math.random() * Math.PI * 2;
        dx = Math.cos(jitter);
        dy = Math.sin(jitter);
        dist = 1;
      }
      const push = (minGap - dist) / 2;
      const ux = dx / dist;
      const uy = dy / dist;
      if (a.fixed) {
        b.x += ux * push * 2;
        b.y += uy * push * 2;
      } else if (b.fixed) {
        a.x -= ux * push * 2;
        a.y -= uy * push * 2;
      } else {
        a.x -= ux * push;
        a.y -= uy * push;
        b.x += ux * push;
        b.y += uy * push;
      }
    }
  }
  for (const n of nodes) clampToCanvas(n);
  return moved;
}

/** Runs resolveOverlaps to convergence (or a generous cap). Cheap — plain distance comparisons. */
function settleOverlaps(nodes: SimNode[]) {
  for (let pass = 0; pass < 200; pass++) {
    if (!resolveOverlaps(nodes)) break;
  }
}

function buildGraph(orgs: OrgNetworkNode[], parties: { name: string; color: string; seats: number }[], crossPartyOnly: boolean): Graph {
  const cx = WIDTH / 2;
  const cy = HEIGHT / 2;
  const ringR = 130;

  const partyAngle = new Map(parties.map((p, i) => [p.name, (i / parties.length) * Math.PI * 2 - Math.PI / 2]));

  const filtered = orgs.filter((o) => (crossPartyOnly ? o.ties.length >= 2 : o.ties.length >= 1));

  // A party with zero ties in the current filter (e.g. Fraktionslos, which nobody
  // declares an org role through) gets no node — an anchor nothing points to is
  // just clutter, not a party someone forgot to connect.
  const tiedPartyNames = new Set(filtered.flatMap((o) => o.ties.map((t) => t.party)));
  const nodes: SimNode[] = parties
    .filter((p) => tiedPartyNames.has(p.name))
    .map((p) => {
      const angle = partyAngle.get(p.name) ?? 0;
      return {
        id: `party:${p.name}`,
        kind: 'party' as const,
        label: p.name,
        color: p.color,
        r: 20 + Math.sqrt(p.seats) * 0.9,
        x: cx + ringR * Math.cos(angle),
        y: cy + ringR * Math.sin(angle),
        vx: 0,
        vy: 0,
        fixed: false,
      };
    });

  const edges: SimEdge[] = [];
  const partyNodeByName = new Map(nodes.map((n) => [n.label, n]));

  // Single-tie orgs (the vast majority once "all" is shown — e.g. 72 orgs that
  // each touch only CDU/CSU) all pull toward the exact same point in the spring
  // simulation, so pure physics piles them into an unreadable blob no matter how
  // strong repulsion gets — there just isn't a force pushing them to *spread out*
  // around their one party. Give them a deterministic sunflower-spiral seed
  // around that party instead: it's an area-filling packing (radius ∝ √i), so it
  // scales to a large N without needing an ever-larger ring. Physics still runs
  // on top for interactivity, but starts from an already non-overlapping layout.
  const singleTieByParty = new Map<string, OrgNetworkNode[]>();
  const multiTie: OrgNetworkNode[] = [];
  for (const o of filtered) {
    if (o.ties.length === 1) {
      const party = o.ties[0].party;
      const list = singleTieByParty.get(party) ?? [];
      list.push(o);
      singleTieByParty.set(party, list);
    } else {
      multiTie.push(o);
    }
  }

  const makeOrgNode = (o: OrgNetworkNode, x: number, y: number, homeRadius?: number): SimNode => {
    const seeded: SimNode = {
      id: `org:${o.org.id}`,
      kind: 'org',
      label: o.org.name,
      color: 'oklch(78% 0.01 260)',
      r: Math.min(22, 8 + Math.sqrt(o.totalMembers) * 2.6),
      x,
      y,
      vx: 0,
      vy: 0,
      fixed: false,
      orgId: o.org.id,
      ties: o.ties,
      homeRadius,
    };
    clampToCanvas(seeded);
    return seeded;
  };

  // A bounded arc, not a full 360° spiral — parties sit close together on a ring
  // around the canvas center, so a full spiral happily seeds some orgs pointing
  // straight through a *different* party on the inward-facing side.
  const ARC_SPAN = Math.PI * 1.15; // ~207°
  // How far apart two node centers must be for their *tap targets* (r + HIT_PAD),
  // not just their visible dots, to stay comfortably separate.
  const MIN_GAP = 2 * (13 + HIT_PAD) + 6;

  /**
   * Concentric arcs at increasing radius, like the hemicycle seat chart: each
   * row's node count is computed from its actual available circumference
   * (arcSpan × radius) divided by the required spacing, so — unlike a spiral
   * formula tuned by trial and error — the minimum gap is a guarantee by
   * construction, not a hopeful side effect.
   */
  function packArc(count: number, startRadius: number): { radius: number; angleOffset: number }[] {
    const positions: { radius: number; angleOffset: number }[] = [];
    let radius = startRadius;
    let remaining = count;
    while (remaining > 0) {
      const circumference = ARC_SPAN * radius;
      const rowCount = Math.min(remaining, Math.max(1, Math.floor(circumference / MIN_GAP)));
      for (let k = 0; k < rowCount; k++) {
        const frac = rowCount === 1 ? 0.5 : k / (rowCount - 1);
        positions.push({ radius, angleOffset: (frac - 0.5) * ARC_SPAN });
      }
      remaining -= rowCount;
      radius += MIN_GAP;
    }
    return positions;
  }

  for (const [partyName, group] of singleTieByParty) {
    const anchor = partyNodeByName.get(partyName);
    const ax = anchor?.x ?? cx;
    const ay = anchor?.y ?? cy;
    const anchorR = anchor?.r ?? 24;
    const outwardAngle = partyAngle.get(partyName) ?? 0;
    // Sorted so the layout is stable across re-renders instead of shuffling on every rebuild.
    const sorted = [...group].sort((a, b) => a.org.id.localeCompare(b.org.id));
    const positions = packArc(sorted.length, anchorR + 30);
    sorted.forEach((o, i) => {
      const { radius, angleOffset } = positions[i];
      const angle = outwardAngle + angleOffset;
      nodes.push(makeOrgNode(o, ax + radius * Math.cos(angle), ay + radius * Math.sin(angle), radius));
    });
  }

  for (const o of multiTie) {
    const angles = o.ties.map((t) => partyAngle.get(t.party) ?? 0);
    const avgAngle = Math.atan2(
      angles.reduce((s, a) => s + Math.sin(a), 0),
      angles.reduce((s, a) => s + Math.cos(a), 0),
    );
    const seedR = 230 + Math.random() * 60;
    nodes.push(makeOrgNode(o, cx + seedR * Math.cos(avgAngle) + (Math.random() - 0.5) * 40, cy + seedR * Math.sin(avgAngle) + (Math.random() - 0.5) * 40));
  }

  for (const o of filtered) {
    for (const t of o.ties) {
      edges.push({ source: `party:${t.party}`, target: `org:${o.org.id}`, party: t.party, weight: t.memberCount });
    }
  }

  // Guarantee the minimum gap on the very first rendered frame, synchronously —
  // this can't wait for the animation loop's first requestAnimationFrame tick.
  // That tick can lag a beat in the ordinary case, but if the tab isn't actively
  // compositing (backgrounded, throttled), rAF may not fire at all for a while;
  // the initial layout has to already be correct on its own, not just "will
  // become correct once physics gets a chance to run."
  settleOverlaps(nodes);

  return { nodes, edges };
}

/**
 * One physics step. Returns the average per-node kinetic energy, used to decide when the
 * layout has settled.
 *
 * `intensity` (1 = full strength, ramping down to ~0 near the end of the animation budget)
 * scales only the repulsion and spring forces — the two forces that fight the hard overlap
 * resolver below every frame and, measured against real data, keep the system oscillating
 * indefinitely rather than ever converging (average energy was still 30–80 at frame 1000,
 * versus the 0.01 stop threshold). Easing those two out lets the last stretch of the
 * animation decelerate into stillness instead of being cut off mid-jitter by the frame cap.
 * The centering pull and the overlap resolver stay at full strength throughout — the former
 * is what keeps the graph on-canvas, the latter is what guarantees no two nodes visibly
 * overlap even in the very first settled frame.
 */
function tick(nodes: SimNode[], edges: SimEdge[], intensity: number): number {
  const cx = WIDTH / 2;
  const cy = HEIGHT / 2;
  const byId = new Map(nodes.map((n) => [n.id, n]));

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      let distSq = dx * dx + dy * dy;
      if (distSq < 1) {
        dx = Math.random() - 0.5;
        dy = Math.random() - 0.5;
        distSq = 1;
      }
      const dist = Math.sqrt(distSq);
      const force = (2600 / distSq) * intensity;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      if (!a.fixed) {
        a.vx += fx;
        a.vy += fy;
      }
      if (!b.fixed) {
        b.vx -= fx;
        b.vy -= fy;
      }
    }
  }

  for (const e of edges) {
    const s = byId.get(e.source);
    const t = byId.get(e.target);
    if (!s || !t) continue;
    const dx = t.x - s.x;
    const dy = t.y - s.y;
    const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    // A single-tie org's spring targets the exact radius it was arc-packed at (see
    // homeRadius) instead of a generic per-weight distance — otherwise every
    // single-tie org on a crowded party gets pulled toward the same ring and the
    // deliberately spread-out packing collapses back into one overcrowded circle.
    const idealLen = t.homeRadius ?? 210 / Math.sqrt(e.weight);
    const force = (dist - idealLen) * 0.02 * intensity;
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;
    if (!s.fixed) {
      s.vx += fx;
      s.vy += fy;
    }
    if (!t.fixed) {
      t.vx -= fx;
      t.vy -= fy;
    }
  }

  let energy = 0;
  for (const n of nodes) {
    if (!n.fixed) {
      n.vx += (cx - n.x) * 0.0012;
      n.vy += (cy - n.y) * 0.0012;
      // Damped harder than the original 0.82 — at that value the repulsion/spring
      // forces above re-inject velocity faster than it bleeds off, which is the
      // other half of why the simulation never reached the stop threshold.
      n.vx *= 0.72;
      n.vy *= 0.72;
      n.x += n.vx;
      n.y += n.vy;
      clampToCanvas(n);
      energy += n.vx * n.vx + n.vy * n.vy;
    }
  }
  // Run last, after forces have had their say: enforces the hard minimum gap that
  // the soft forces above only encourage (springs can pull same-party siblings
  // right back toward each other every frame). Has to fully converge before the
  // velocity-based energy below drops enough to stop the loop — a still-
  // unresolved overlap freezes in place once ticking stops.
  settleOverlaps(nodes);
  return energy / Math.max(1, nodes.length);
}

function pillStyle(active: boolean) {
  return {
    padding: '6px 13px',
    border: 'none',
    cursor: 'pointer',
    background: active ? 'oklch(45% 0.16 265)' : 'white',
    color: active ? 'white' : 'oklch(30% 0.01 260)',
    fontSize: 12,
    fontWeight: 600,
  } as const;
}

export function PartyOrgGraph({
  orgs,
  parties,
  onOpenOrg,
  labels,
}: {
  orgs: OrgNetworkNode[];
  parties: { name: string; color: string; seats: number }[];
  onOpenOrg: (orgId: string) => void;
  labels: {
    sub: string;
    crossPartyToggle: string;
    allToggle: string;
    orgCountTemplate: string;
    viewOrg: string;
    empty: string;
  };
}) {
  const [crossPartyOnly, setCrossPartyOnly] = useState(true);
  // A Set, not a single string: clicking a second party narrows the highlight to
  // organisations tied to ALL selected parties, rather than replacing the selection.
  const [activeParties, setActiveParties] = useState<Set<string>>(new Set());
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [hoveredOrgId, setHoveredOrgId] = useState<string | null>(null);
  const [, forceRender] = useState(0);
  // Drives a CSS transition on every node/edge for the brief "grow into place" reveal below
  // — deliberately NOT another physics pass. A plain interpolation can't oscillate the way
  // the force simulation did, so this is how motion comes back without the risk of it going
  // wild again.
  const [settling, setSettling] = useState(false);

  const graphRef = useRef<Graph | null>(null);
  const draggingRef = useRef<string | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const dragMovedRef = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const rafRef = useRef<number | null>(null);
  const framesRef = useRef(0);

  const orgsKey = orgs.map((o) => `${o.org.id}:${o.ties.length}:${o.totalMembers}`).join(',');
  const partiesKey = parties.map((p) => `${p.name}:${p.seats}`).join(',');

  if (graphRef.current === null) {
    graphRef.current = buildGraph(orgs, parties, crossPartyOnly);
  }

  function runSim() {
    if (rafRef.current !== null) return;
    const step = () => {
      const graph = graphRef.current;
      if (!graph) return;
      // Measured against real production data, the simulation's energy never actually
      // drops anywhere near the old 0.01 stop threshold — it just oscillates (average
      // energy was still 30–80 at frame 1000), so the loop always ran the full budget.
      // MAX_FRAMES is a hard cap on how long that's ever visible; EASE_START tapers the
      // repulsion/spring forces to zero over the last stretch so it decelerates into
      // stillness instead of being cut off mid-jitter. STOP_ENERGY is a realistic early
      // exit for the sparser cross-party-only graph, which can genuinely go still.
      const intensity = framesRef.current < EASE_START ? 1 : Math.max(0, 1 - (framesRef.current - EASE_START) / (MAX_FRAMES - EASE_START));
      const energy = tick(graph.nodes, graph.edges, intensity);
      framesRef.current++;
      forceRender((v) => v + 1);
      if (energy > STOP_ENERGY && framesRef.current < MAX_FRAMES) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(step);
  }

  useEffect(() => {
    // buildGraph()'s deterministic seeding (arc-packed single-tie orgs, spiral-seeded
    // multi-tie ones) plus its synchronous settleOverlaps() pass already produces a
    // non-overlapping, reasonably spread layout on its own — no physics needed to arrive at
    // a *correct* layout. The spring/repulsion physics in tick() is a stiff, explicit-Euler
    // system that overshoots every frame rather than smoothly decaying (confirmed against
    // real data: energy swung between 40 and 125 frame-to-frame for 90+ frames before it was
    // ever forced to ease out), so animating the graph INTO that layout with real physics
    // looked like the whole thing spinning wildly, not springing into place.
    //
    // What follows instead is a plain interpolation, not a simulation: every node's true
    // resting position is already known from buildGraph(), so it's rendered once pulled
    // partway toward the canvas center, then — a frame later — snapped to its real position
    // with a CSS transition active, so the browser tweens it smoothly over. There's no
    // feedback loop here for anything to destabilize; it can't "go wild" the way physics did.
    const graph = buildGraph(orgs, parties, crossPartyOnly);
    const cx = WIDTH / 2;
    const cy = HEIGHT / 2;
    const restingPositions = graph.nodes.map((n) => ({ x: n.x, y: n.y }));
    graph.nodes.forEach((n, i) => {
      n.x = cx + (restingPositions[i].x - cx) * 0.4;
      n.y = cy + (restingPositions[i].y - cy) * 0.4;
    });
    graphRef.current = graph;
    framesRef.current = 0;
    setActiveParties(new Set());
    setActiveOrgId(null);
    setSettling(true);
    forceRender((v) => v + 1);

    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const current = graphRef.current;
        if (current === graph) {
          graph.nodes.forEach((n, i) => {
            n.x = restingPositions[i].x;
            n.y = restingPositions[i].y;
          });
          forceRender((v) => v + 1);
        }
      });
    });
    const settleTimer = setTimeout(() => setSettling(false), 500);

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      clearTimeout(settleTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgsKey, partiesKey, crossPartyOnly]);

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  function pointFromEvent(e: ReactPointerEvent) {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * WIDTH, y: ((e.clientY - rect.top) / rect.height) * HEIGHT };
  }

  function handlePointerDown(id: string, e: ReactPointerEvent<SVGGElement>) {
    draggingRef.current = id;
    dragStartRef.current = pointFromEvent(e);
    dragMovedRef.current = false;
    // A drag starting mid-reveal must track the pointer 1:1, not lag behind a CSS transition.
    setSettling(false);
    const node = graphRef.current?.nodes.find((n) => n.id === id);
    if (node) node.fixed = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function handlePointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    const id = draggingRef.current;
    if (!id) return;
    const node = graphRef.current?.nodes.find((n) => n.id === id);
    if (!node) return;
    const { x, y } = pointFromEvent(e);
    // A plain click/tap fires pointerdown then pointerup with essentially no movement in
    // between — only a real drag (moved more than a few px) should ever re-trigger the
    // settle animation below. Below this threshold it's just a click and physics stays put.
    const start = dragStartRef.current;
    if (start && Math.hypot(x - start.x, y - start.y) > 3) dragMovedRef.current = true;
    node.x = x;
    node.y = y;
    // A drag can otherwise carry a node's *center* past the canvas edge (a pointer
    // released outside the SVG still reports a valid, out-of-range coordinate) —
    // clamp here too, not just in the physics tick, so a dragged node can't park
    // itself half-clipped off the visible card.
    clampToCanvas(node);
    node.vx = 0;
    node.vy = 0;
    forceRender((v) => v + 1);
  }
  function handlePointerUp() {
    const id = draggingRef.current;
    if (id) {
      const node = graphRef.current?.nodes.find((n) => n.id === id);
      if (node) node.fixed = false;
    }
    draggingRef.current = null;
    dragStartRef.current = null;
    // Only a genuine drag needs the neighbouring nodes to re-settle around the moved one —
    // a plain click (selecting/highlighting a node) must never replay the settle animation.
    if (dragMovedRef.current) {
      framesRef.current = 0;
      runSim();
    }
    dragMovedRef.current = false;
  }

  function toggleParty(name: string) {
    setActiveOrgId(null);
    setActiveParties((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  const graph = graphRef.current;
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const orgCount = graph.nodes.filter((n) => n.kind === 'org').length;

  // An org "matches" the current party selection when it's tied to EVERY selected
  // party, not just any one of them — that intersection is the whole point of
  // letting more than one party be active at once.
  const matchedOrgIds =
    activeParties.size > 0
      ? new Set(
          graph.nodes
            .filter((n) => n.kind === 'org' && n.ties && [...activeParties].every((p) => n.ties!.some((t) => t.party === p)))
            .map((n) => n.orgId),
        )
      : null;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
        <p style={{ fontSize: 12.5, color: 'oklch(48% 0.01 260)', margin: 0, maxWidth: 560 }}>{labels.sub}</p>
        <div style={{ display: 'flex', border: '1px solid oklch(90% 0.006 260)', borderRadius: 16, overflow: 'hidden', flexShrink: 0 }}>
          <button onClick={() => setCrossPartyOnly(true)} style={pillStyle(crossPartyOnly)}>
            {labels.crossPartyToggle}
          </button>
          <button onClick={() => setCrossPartyOnly(false)} style={pillStyle(!crossPartyOnly)}>
            {labels.allToggle}
          </button>
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: 'oklch(55% 0.01 260)', marginBottom: 8 }}>{labels.orgCountTemplate.replace('{n}', String(orgCount))}</div>

      {orgCount === 0 ? (
        <p style={{ fontSize: 13.5, color: 'oklch(48% 0.01 260)' }}>{labels.empty}</p>
      ) : (
        <div
          key={`${orgsKey}|${partiesKey}|${crossPartyOnly}`}
          style={{ border: '1px solid oklch(90% 0.006 260)', borderRadius: 14, background: 'white', overflow: 'hidden' }}
        >
          <svg
            ref={svgRef}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            style={{ width: '100%', height: 'auto', display: 'block', cursor: 'grab', overflow: 'hidden' }}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onClick={() => {
              setActiveParties(new Set());
              setActiveOrgId(null);
            }}
          >
            {graph.edges.map((e, i) => {
              const s = byId.get(e.source);
              const t = byId.get(e.target);
              if (!s || !t) return null;
              const highlighted =
                activeParties.size > 0 ? activeParties.has(e.party) && matchedOrgIds!.has(t.orgId) : activeOrgId ? t.orgId === activeOrgId : false;
              const dimmed = (activeParties.size > 0 || activeOrgId !== null) && !highlighted;
              return (
                <g key={i}>
                  <line
                    x1={s.x}
                    y1={s.y}
                    x2={t.x}
                    y2={t.y}
                    className={highlighted ? 'pb-flow-edge' : undefined}
                    stroke={highlighted ? s.color : 'oklch(85% 0.006 260)'}
                    strokeWidth={Math.min(7, 1.2 + e.weight * 0.7)}
                    opacity={dimmed ? 0.12 : highlighted ? 0.9 : 0.55}
                    style={settling ? { transition: 'x1 480ms cubic-bezier(0.22,1,0.36,1), y1 480ms cubic-bezier(0.22,1,0.36,1), x2 480ms cubic-bezier(0.22,1,0.36,1), y2 480ms cubic-bezier(0.22,1,0.36,1)' } : undefined}
                  />
                  {/* Tie count on the line itself — only when a single org is the focus (party-only
                      selection can highlight dozens of edges at once, where per-edge numbers would
                      just be more clutter; the "→ N orgs" summary covers that case instead). */}
                  {highlighted && activeOrgId !== null && (
                    <text
                      x={(s.x + t.x) / 2}
                      y={(s.y + t.y) / 2}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={10.5}
                      fontWeight={700}
                      fill="oklch(25% 0.01 260)"
                      paintOrder="stroke"
                      stroke="white"
                      strokeWidth={4}
                    >
                      {e.weight}
                    </text>
                  )}
                </g>
              );
            })}
            {graph.nodes.map((n) => {
              const isActiveOrg = n.kind === 'org' && n.orgId === activeOrgId;
              const isActiveParty = n.kind === 'party' && activeParties.has(n.label);
              const isHoveredOrg = n.kind === 'org' && n.orgId === hoveredOrgId;
              const matched = n.kind === 'org' && matchedOrgIds !== null && matchedOrgIds.has(n.orgId);
              const dimmed = activeParties.size > 0 ? n.kind === 'org' && !matched : activeOrgId !== null && n.kind === 'org' && !isActiveOrg;
              const orgFill = isActiveOrg || matched ? 'oklch(45% 0.16 265)' : isHoveredOrg ? 'oklch(66% 0.015 260)' : 'oklch(78% 0.01 260)';
              // The one explicitly clicked org gets a name label that stays put, and
              // hovering any org previews its name too — auto-labelling every "big" node
              // by tie count (the old rule) looked unexplained and piled into text mush
              // once several sat near each other.
              const showLabel = isActiveOrg || isHoveredOrg;
              return (
                <g
                  key={n.id}
                  onPointerDown={(e) => handlePointerDown(n.id, e)}
                  onMouseEnter={() => {
                    if (n.kind === 'org') setHoveredOrgId(n.orgId ?? null);
                  }}
                  onMouseLeave={() => {
                    if (n.kind === 'org') setHoveredOrgId((id) => (id === n.orgId ? null : id));
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (n.kind === 'party') toggleParty(n.label);
                    else
                      setActiveOrgId((id) => {
                        setActiveParties(new Set());
                        return id === n.orgId ? null : (n.orgId ?? null);
                      });
                  }}
                  style={{ cursor: 'pointer', touchAction: 'none' }}
                  opacity={dimmed ? 0.25 : 1}
                >
                  {/* Invisible, larger tap target — the visible dot can stay small without becoming hard to hit on a phone. */}
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={n.r + HIT_PAD}
                    fill="transparent"
                    style={settling ? { transition: 'cx 480ms cubic-bezier(0.34,1.56,0.64,1), cy 480ms cubic-bezier(0.34,1.56,0.64,1)' } : undefined}
                  />
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={n.r}
                    fill={n.kind === 'party' ? n.color : orgFill}
                    stroke={
                      n.kind === 'party'
                        ? isActiveParty
                          ? 'oklch(45% 0.16 265)'
                          : 'white'
                        : isActiveOrg || matched
                          ? 'oklch(35% 0.18 265)'
                          : isHoveredOrg
                            ? 'oklch(45% 0.02 260)'
                            : 'oklch(65% 0.01 260)'
                    }
                    strokeWidth={n.kind === 'party' ? (isActiveParty ? 4 : 2) : isHoveredOrg ? 1.8 : 1.2}
                    style={{
                      transition: settling
                        ? 'fill 100ms, stroke 100ms, cx 480ms cubic-bezier(0.34,1.56,0.64,1), cy 480ms cubic-bezier(0.34,1.56,0.64,1)'
                        : 'fill 100ms, stroke 100ms',
                    }}
                  />
                  {n.kind === 'party' && (
                    <text
                      x={n.x}
                      y={n.y}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={11}
                      fontWeight={700}
                      fill="white"
                      style={settling ? { transition: 'x 480ms cubic-bezier(0.34,1.56,0.64,1), y 480ms cubic-bezier(0.34,1.56,0.64,1)' } : undefined}
                    >
                      {n.label}
                    </text>
                  )}
                  {showLabel && (
                    <text
                      x={n.x}
                      y={n.y - n.r - 5}
                      textAnchor="middle"
                      fontSize={10}
                      fontWeight={600}
                      fill="oklch(25% 0.01 260)"
                      paintOrder="stroke"
                      stroke="white"
                      strokeWidth={4}
                    >
                      {n.label.length > 30 ? `${n.label.slice(0, 28)}…` : n.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {activeOrgId &&
        (() => {
          const org = orgs.find((o) => o.org.id === activeOrgId);
          if (!org) return null;
          return (
            <div style={{ marginTop: 10, padding: 14, background: 'oklch(97% 0.006 260)', borderRadius: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{org.org.name}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {org.ties.map((t) => (
                  <span
                    key={t.party}
                    style={{ fontSize: 11.5, padding: '3px 9px', borderRadius: 10, background: 'white', border: '1px solid oklch(90% 0.006 260)' }}
                  >
                    {t.party}: {t.memberCount}
                  </span>
                ))}
              </div>
              <button
                onClick={() => onOpenOrg(org.org.id)}
                style={{ border: 'none', background: 'none', color: 'oklch(45% 0.16 265)', fontWeight: 700, cursor: 'pointer', fontSize: 12.5, padding: 0 }}
              >
                {labels.viewOrg} →
              </button>
            </div>
          );
        })()}

      {activeParties.size > 0 && (
        <div style={{ marginTop: 10, fontSize: 12, color: 'oklch(48% 0.01 260)' }}>
          {[...activeParties].join(' + ')} → {matchedOrgIds?.size ?? 0}
        </div>
      )}
    </div>
  );
}
