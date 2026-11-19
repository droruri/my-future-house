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
    <input
      aria-label={label}
      placeholder={label}
      type="number"
      min={1}
      value={cm[k] ?? ''}
      onChange={(e) => setCm({ ...cm, [k]: e.target.value === '' ? undefined : Number(e.target.value) })}
      style={{ width: 56 }}
    />
  );

  return (
    <section aria-label="סוכן ריהוט" style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid #ccc', paddingTop: 8 }}>
      <strong>הוספת פריט</strong>
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="קישור למוצר או תיאור, למשל: ספה תלת מושבית 220×90"
        rows={3}
      />
      <button onClick={onFind} disabled={busy || !input.trim()}>{busy ? 'מחפש…' : 'מצא פריט'}</button>
      {msg && <div role="status">{msg}</div>}
      {draft && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {num('w', 'רוחב')}
          {num('d', 'עומק')}
          {num('h', 'גובה')}
          <button onClick={onDims}>הצג</button>
        </div>
      )}
      {proposal && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div>
            {proposal.name} · {Math.round(proposal.size.w * 100)}×{Math.round(proposal.size.d * 100)}×{Math.round(proposal.size.h * 100)} ס״מ
            {proposal.price !== undefined && ` · ₪${proposal.price}`}
          </div>
          <button onClick={() => { useStore.getState().acceptProposal(); setMsg(null); }}>אישור</button>
          <button onClick={() => { useStore.getState().propose(null); setMsg(null); }}>דחייה</button>
        </div>
      )}
    </section>
  );
}
