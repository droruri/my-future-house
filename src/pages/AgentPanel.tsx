import { useState } from 'react';
import { requestItem, type ItemDraft } from '../api';
import { completeSize, toProposal } from '../proposal';
import { useStore } from '../store';

/** Item agent: a URL or a description becomes a ghost box the user accepts or rejects. */
export function AgentPanel() {
  const proposal = useStore((s) => s.proposal);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [draft, setDraft] = useState<ItemDraft | null>(null);
  const [cm, setCm] = useState<{ w?: number; d?: number; h?: number }>({});

  const place = (d: ItemDraft, given: { w?: number; d?: number; h?: number }) => {
    const size = completeSize(d, given);
    if (!size) return false;
    const st = useStore.getState();
    st.propose(toProposal(st.house, d, size));
    setDraft(null);
    setCm({});
    return true;
  };

  const onFind = async () => {
    const v = input.trim();
    if (!v || busy) return;
    setBusy(true);
    setMsg(null);
    setDraft(null);
    useStore.getState().propose(null);
    const isUrl = /^https?:\/\//i.test(v);
    const rooms = useStore.getState().house.rooms.map((r) => r.name);
    const r = await requestItem({ ...(isUrl ? { url: v } : { text: v }), rooms });
    setBusy(false);
    if (!r.ok) return setMsg(r.error);
    if (r.status === 'found' && place(r.item, {})) return;
    setDraft(r.item);
    setMsg('לא נמצאו מידות. הזינו אותן בסנטימטרים:');
  };

  const onDims = () => {
    if (draft && !place(draft, { w: (cm.w ?? 0) / 100, d: (cm.d ?? 0) / 100, h: (cm.h ?? 0) / 100 })) setMsg('יש להזין את כל המידות (מספרים חיוביים)');
  };
  const num = (k: 'w' | 'd' | 'h', label: string) => (
    <div className="relative">
      <input
        aria-label={label}
        placeholder={label}
        type="number"
        min={1}
        value={cm[k] ?? ''}
        onChange={(e) => setCm({ ...cm, [k]: e.target.value === '' ? undefined : Number(e.target.value) })}
        className="field min-w-0 pe-9"
      />
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 end-2 flex items-center text-xs text-muted-fg">ס״מ</span>
    </div>
  );

  return (
    <section aria-label="סוכן ריהוט" className="card flex flex-col gap-2 p-4">
      <h2 className="m-0 text-base font-bold">הוספת פריט</h2>
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="קישור למוצר או תיאור, למשל: ספה תלת מושבית 220×90"
        rows={3}
        className="field"
      />
      <button onClick={onFind} disabled={busy || !input.trim()} className="btn btn-primary">
        {busy && <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 animate-spin" fill="none" stroke="currentColor" strokeWidth="3"><circle cx="12" cy="12" r="9" opacity=".25" /><path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" /></svg>}
        {busy ? 'מחפש…' : 'מצא פריט'}
      </button>
      {msg && <div role="status" className="rounded-md bg-warn-bg p-2 text-sm">{msg}</div>}
      {draft && (
        <div className="grid grid-cols-3 gap-2">
          {num('w', 'רוחב')}
          {num('d', 'עומק')}
          {num('h', 'גובה')}
          <button onClick={onDims} className="btn btn-primary col-span-3">הצג</button>
        </div>
      )}
      {proposal && (
        <div className="flex flex-col gap-2">
          <div className="rounded-md bg-info-bg p-2 text-sm text-muted-fg">
            {proposal.name} · {Math.round(proposal.size.w * 100)}×{Math.round(proposal.size.d * 100)}×{Math.round(proposal.size.h * 100)} ס״מ
            {proposal.price !== undefined && ` · ₪${proposal.price}`}
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary flex-1" onClick={() => { useStore.getState().acceptProposal(); setMsg(null); }}>אישור</button>
            <button className="btn btn-ghost flex-1" onClick={() => { useStore.getState().propose(null); setMsg(null); }}>דחייה</button>
          </div>
        </div>
      )}
    </section>
  );
}
