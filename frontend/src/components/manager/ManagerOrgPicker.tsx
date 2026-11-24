import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, Check, ChevronDown, ChevronRight } from "lucide-react";

export type ManagerOrganization = { id: number; orgName: string; parentOrgId: number | null };
type OrgNode = ManagerOrganization & { children: OrgNode[] };

function organizationTree(organizations: ManagerOrganization[]): OrgNode[] {
  const byId = new Map(organizations.map((org) => [org.id, { ...org, children: [] as OrgNode[] }]));
  const roots: OrgNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parentOrgId === null ? null : byId.get(node.parentOrgId);
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

export function ManagerOrgPicker({ organizations, value, onChange }: { organizations: ManagerOrganization[]; value: number | null; onChange: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<number[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const nodes = useMemo(() => organizationTree(organizations), [organizations]);
  const current = organizations.find((org) => org.id === value);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", closeEscape); };
  }, [open]);

  function toggle() {
    if (!open) {
      const ancestors: number[] = [];
      let parentId = current?.parentOrgId;
      while (parentId !== null && parentId !== undefined) {
        ancestors.push(parentId);
        parentId = organizations.find((org) => org.id === parentId)?.parentOrgId;
      }
      setExpanded((previous) => [...new Set([...previous, ...nodes.map((node) => node.id), ...ancestors])]);
    }
    setOpen((previous) => !previous);
  }

  function renderNodes(items: OrgNode[], depth = 0): React.ReactNode {
    return items.map((node) => <div key={node.id}>
      <div className={`manager-org-tree-row ${node.id === value ? "selected" : ""}`} style={{ paddingLeft: `${8 + depth * 18}px` }}>
        {node.children.length ? <button type="button" className="manager-org-expand" aria-label={`${expanded.includes(node.id) ? "收起" : "展开"}${node.orgName}`} aria-expanded={expanded.includes(node.id)} onClick={() => setExpanded((previous) => previous.includes(node.id) ? previous.filter((id) => id !== node.id) : [...previous, node.id])}>{expanded.includes(node.id) ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button> : <span className="manager-org-expand-spacer" />}
        <button type="button" className="manager-org-option" role="treeitem" aria-level={depth + 1} aria-selected={node.id === value} onClick={() => { onChange(node.id); setOpen(false); }}><Building2 size={15} aria-hidden="true" /><span>{node.orgName}</span>{node.id === value && <Check size={15} aria-hidden="true" />}</button>
      </div>
      {expanded.includes(node.id) && node.children.length > 0 && renderNodes(node.children, depth + 1)}
    </div>);
  }

  return <div className="manager-org-filter"><span className="manager-org-label">组织</span><div className="manager-org-picker" ref={rootRef}>
    <button type="button" className="manager-org-trigger" aria-label="筛选组织" aria-expanded={open} aria-haspopup="tree" disabled={!current} onClick={toggle}><span>{current?.orgName ?? "加载中"}</span><ChevronDown size={15} aria-hidden="true" /></button>
    {open && <div className="manager-org-menu" role="tree" aria-label="可查询组织">{renderNodes(nodes)}</div>}
  </div></div>;
}
