export function ShowMoreButton({
  total,
  defaultCount,
  expanded,
  onToggle,
  showMoreTemplate,
  showLessLabel,
}: {
  total: number;
  defaultCount: number;
  expanded: boolean;
  onToggle: () => void;
  showMoreTemplate: string;
  showLessLabel: string;
}) {
  if (total <= defaultCount) return null;
  return (
    <button
      onClick={onToggle}
      style={{
        display: 'block',
        margin: '14px auto 0',
        padding: '8px 18px',
        border: '1px solid oklch(85% 0.006 260)',
        borderRadius: 20,
        background: 'white',
        fontSize: 12.5,
        fontWeight: 700,
        color: 'oklch(45% 0.16 265)',
        cursor: 'pointer',
      }}
    >
      {expanded ? showLessLabel : showMoreTemplate.replace('{n}', String(total))}
    </button>
  );
}
