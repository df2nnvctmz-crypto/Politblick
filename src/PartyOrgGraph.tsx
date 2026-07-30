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
const HEIGHT = 460;

function buildGraph(orgs: OrgNetworkNode[], parties: { name: string; color: string; seats: number }[], crossPartyOnly: boolean): Graph {
  const cx = WIDTH / 2;
  const cy = HEIGHT / 2;
  const ringR = 130;

  const partyAngle = new Map(parties.map((p, i) => [p.name, (i / parties.length) * Math.PI * 2 - Math.PI / 2]));

  const nodes: SimNode[] = parties.map((p) => {
    const angle = partyAngle.get(p.name) ?? 0;
    return {
      id: `party:${p.name}`,
      kind: 'party',
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

  const filtered = orgs.filter((o) => (crossPartyOnly ? o.ties.length >= 2 : o.ties.length >= 1));
  const edges: SimEdge[] = [];

  for (const o of filtered) {
    const angles = o.ties.map((t) => partyAngle.get(t.party) ?? 0);
    const avgAngle = Math.atan2(
      angles.reduce((s, a) => s + Math.sin(a), 0),
      angles.reduce((s, a) => s + Math.cos(a), 0),
    );
    const seedR = 230 + Math.random() * 60;
    nodes.push({
      id: `org:${o.org.id}`,
      kind: 'org',
      label: o.org.name,
      color: 'oklch(78% 0.01 260)',
      r: Math.min(20, 6 + Math.sqrt(o.totalMembers) * 2.6),
      x: cx + seedR * Math.cos(avgAngle) + (Math.random() - 0.5) * 40,
      y: cy + seedR * Math.sin(avgAngle) + (Math.random() - 0.5) * 40,
      vx: 0,
      vy: 0,
      fixed: false,
      orgId: o.org.id,
      ties: o.ties,
    });
    for (const t of o.ties) {
      edges.push({ source: `party:${t.party}`, target: `org:${o.org.id}`, party: t.party, weight: t.memberCount });
    }
  }

  return { nodes, edges };
}

/** One physics step. Returns the average per-node kinetic energy, used to decide when the layout has settled. */
function tick(nodes: SimNode[], edges: SimEdge[]): number {
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
      const minDist = a.r + b.r + 6;
      const strength = dist < minDist ? 900 : 2600;
      const force = strength / distSq;
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
    const idealLen = 210 / Math.sqrt(e.weight);
    const force = (dist - idealLen) * 0.02;
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
      n.vx += (cx - n.x) * 0.0025;
      n.vy += (cy - n.y) * 0.0025;
      n.vx *= 0.82;
      n.vy *= 0.82;
      n.x += n.vx;
      n.y += n.vy;
      n.x = Math.max(n.r + 4, Math.min(WIDTH - n.r - 4, n.x));
      n.y = Math.max(n.r + 4, Math.min(HEIGHT - n.r - 4, n.y));
      energy += n.vx * n.vx + n.vy * n.vy;
    }
  }
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
  const [activeParty, setActiveParty] = useState<string | null>(null);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [, forceRender] = useState(0);

  const graphRef = useRef<Graph | null>(null);
  const draggingRef = useRef<string | null>(null);
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
      const energy = tick(graph.nodes, graph.edges);
      framesRef.current++;
      forceRender((v) => v + 1);
      if (energy > 0.01 && framesRef.current < 600) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(step);
  }

  useEffect(() => {
    graphRef.current = buildGraph(orgs, parties, crossPartyOnly);
    framesRef.current = 0;
    setActiveParty(null);
    setActiveOrgId(null);
    // Reflect the rebuilt graph immediately rather than waiting for the physics loop's
    // first requestAnimationFrame tick — that tick can lag a beat (or, in a backgrounded/
    // throttled tab, much longer), which left the old node set on screen after toggling.
    forceRender((v) => v + 1);
    runSim();
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
    node.x = x;
    node.y = y;
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
    framesRef.current = 0;
    runSim();
  }

  const graph = graphRef.current;
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const orgCount = graph.nodes.filter((n) => n.kind === 'org').length;
  const activePartyColor = parties.find((p) => p.name === activeParty)?.color;

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
        <div style={{ border: '1px solid oklch(90% 0.006 260)', borderRadius: 14, background: 'white', touchAction: 'none' }}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            style={{ width: '100%', height: 'auto', display: 'block', cursor: 'grab' }}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onClick={() => {
              setActiveParty(null);
              setActiveOrgId(null);
            }}
          >
            {graph.edges.map((e, i) => {
              const s = byId.get(e.source);
              const t = byId.get(e.target);
              if (!s || !t) return null;
              const highlighted = activeParty ? e.party === activeParty : activeOrgId ? t.orgId === activeOrgId : false;
              const dimmed = (activeParty !== null || activeOrgId !== null) && !highlighted;
              return (
                <line
                  key={i}
                  x1={s.x}
                  y1={s.y}
                  x2={t.x}
                  y2={t.y}
                  stroke={highlighted ? s.color : 'oklch(85% 0.006 260)'}
                  strokeWidth={Math.min(7, 1.2 + e.weight * 0.7)}
                  opacity={dimmed ? 0.12 : highlighted ? 0.85 : 0.55}
                />
              );
            })}
            {graph.nodes.map((n) => {
              const isActiveOrg = n.kind === 'org' && n.orgId === activeOrgId;
              const tiedToActiveParty = n.kind === 'org' && activeParty !== null && n.ties?.some((t) => t.party === activeParty);
              const dimmed = (activeParty !== null && n.kind === 'org' && !tiedToActiveParty) || (activeOrgId !== null && n.kind === 'org' && !isActiveOrg);
              const orgFill = isActiveOrg ? 'oklch(45% 0.16 265)' : tiedToActiveParty && activePartyColor ? activePartyColor : 'oklch(78% 0.01 260)';
              const showLabel = isActiveOrg || (n.kind === 'org' && n.r >= 15 && activeParty === null && activeOrgId === null);
              return (
                <g
                  key={n.id}
                  onPointerDown={(e) => handlePointerDown(n.id, e)}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (n.kind === 'party') setActiveParty((p) => (p === n.label ? null : n.label));
                    else setActiveOrgId((id) => (id === n.orgId ? null : (n.orgId ?? null)));
                  }}
                  style={{ cursor: 'pointer' }}
                  opacity={dimmed ? 0.25 : 1}
                >
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={n.r}
                    fill={n.kind === 'party' ? n.color : orgFill}
                    stroke={n.kind === 'party' ? 'white' : isActiveOrg ? 'oklch(35% 0.18 265)' : 'oklch(65% 0.01 260)'}
                    strokeWidth={n.kind === 'party' ? 2 : 1.2}
                  />
                  {n.kind === 'party' && (
                    <text x={n.x} y={n.y} textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700} fill="white">
                      {n.label}
                    </text>
                  )}
                  {showLabel && (
                    <text x={n.x} y={n.y - n.r - 5} textAnchor="middle" fontSize={10} fontWeight={600} fill="oklch(25% 0.01 260)">
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
    </div>
  );
}
