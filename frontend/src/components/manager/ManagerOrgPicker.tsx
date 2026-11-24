import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, ChevronDown, ChevronRight } from "lucide-react";

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

export function ManagerOrgPicker({ organizations, value, onChange }: { organizations: ManagerOrganization[]; value: number[]; onChange: (ids: number[]) => void }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<number[]>([]);
  const [draft, setDraft] = useState<number[]>(value);
  const [menuHeight, setMenuHeight] = useState(360);
  const rootRef = useRef<HTMLDivElement>(null);
  const nodes = useMemo(() => organizationTree(organizations), [organizations]);
  const byId = useMemo(() => new Map(organizations.map((org) => [org.id, org])), [organizations]);
  const selectedNames = value.map((id) => byId.get(id)?.orgName).filter(Boolean).join("、");

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

  function ancestorsOf(id: number): number[] {
    const ancestors: number[] = [];
    let parentId = byId.get(id)?.parentOrgId;
    while (parentId !== null && parentId !== undefined && !ancestors.includes(parentId)) {
      ancestors.push(parentId);
      parentId = byId.get(parentId)?.parentOrgId;
    }
    return ancestors;
  }

  function toggle() {
    if (!open) {
      setDraft(value);
      setExpanded((previous) => [...new Set([...previous, ...nodes.map((node) => node.id), ...value.flatMap(ancestorsOf)])]);
      setMenuHeight(Math.min(360, Math.max(160, window.innerHeight - (rootRef.current?.getBoundingClientRect().bottom ?? 0) - 8)));
    }
    setOpen((previous) => !previous);
  }

  function toggleSelection(id: number) {
    setDraft((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current.filter((item) => !ancestorsOf(item).includes(id)), id]);
  }

  function renderNodes(items: OrgNode[], depth = 0): React.ReactNode {
    return items.map((node) => {
      const inherited = ancestorsOf(node.id).some((id) => draft.includes(id));
      return <div key={node.id}>
        <div className={`manager-org-tree-row ${draft.includes(node.id) ? "selected" : ""}`} style={{ paddingLeft: `${8 + depth * 18}px` }}>
          {node.children.length ? <button type="button" className="manager-org-expand" aria-label={`${expanded.includes(node.id) ? "收起" : "展开"}${node.orgName}`} aria-expanded={expanded.includes(node.id)} onClick={() => setExpanded((previous) => previous.includes(node.id) ? previous.filter((id) => id !== node.id) : [...previous, node.id])}>{expanded.includes(node.id) ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button> : <span className="manager-org-expand-spacer" />}
          <label className="manager-org-option" role="treeitem" aria-level={depth + 1} aria-selected={draft.includes(node.id) || inherited} title={inherited ? "已包含在所选上级组织中" : undefined}>
            <input type="checkbox" checked={draft.includes(node.id) || inherited} disabled={inherited} onChange={() => toggleSelection(node.id)} />
            <Building2 size={15} aria-hidden="true" /><span>{node.orgName}</span>
          </label>
        </div>
        {expanded.includes(node.id) && node.children.length > 0 && renderNodes(node.children, depth + 1)}
      </div>;
    });
  }

  return <div className="manager-org-filter"><span className="manager-org-label">组织</span><div className="manager-org-picker" ref={rootRef}>
    <button type="button" className="manager-org-trigger" aria-label="筛选组织" aria-expanded={open} aria-haspopup="tree" title={selectedNames} disabled={!organizations.length} onClick={toggle}><span>{value.length === 1 ? selectedNames : `已选 ${value.length} 个组织`}</span><ChevronDown size={15} aria-hidden="true" /></button>
    {open && <div className="manager-org-menu" style={{ maxHeight: menuHeight }}>
      <div className="manager-org-tree-scroll" role="tree" aria-label="可查询组织">{renderNodes(nodes)}</div>
      <div className="manager-org-menu-footer"><button type="button" onClick={() => setDraft(nodes.map((node) => node.id))}>全选</button><span>已选 {draft.length} 个</span><button type="button" className="manager-org-apply" disabled={!draft.length} onClick={() => { onChange(draft); setOpen(false); }}>应用</button></div>
    </div>}
  </div></div>;
}
