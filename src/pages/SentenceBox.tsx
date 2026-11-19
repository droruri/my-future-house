import { useState } from 'react';
import { requestEdits } from '../api';
import { applyEdits, type House } from '../house';

export type Preview = { house: House; changes: string[] };

/** "Fix with a sentence": a request becomes a previewed change list the user accepts or rejects. */
export function SentenceBox(props: {
  house: House;
  preview: Preview | null;
  onPreview: (p: Preview | null) => void;
  onAccept: (p: Preview) => void;
  title?: string;
  placeholder?: string;
}) {
  const { house, preview, onPreview, onAccept } = props;
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const onSend = async () => {
    const v = input.trim();
    if (!v || busy) return;
    setBusy(true);
    setMsg(null);
    onPreview(null);
    const r = await requestEdits(house, v);
    setBusy(false);
    if (!r.ok) return setMsg(r.error);
    const applied = applyEdits(house, r.edits);
    if (!applied.ok) return setMsg(applied.error);
    onPreview({ house: applied.house, changes: applied.changes });
  };

  return (
    <section aria-label="תיקון במשפט" className="card flex flex-col gap-2 p-4">
      <h2 className="m-0 text-base font-bold">{props.title ?? 'שיפוץ במשפט'}</h2>
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={props.placeholder ?? 'למשל: תוריד את הקיר בין המטבח לסלון'}
        rows={3}
        className="field"
      />
      <button onClick={onSend} disabled={busy || !input.trim()} className="btn btn-primary">
        {busy && <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 animate-spin" fill="none" stroke="currentColor" strokeWidth="3"><circle cx="12" cy="12" r="9" opacity=".25" /><path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" /></svg>}
        {busy ? 'חושב…' : 'הצג שינוי'}
      </button>
      {msg && <div role="alert" className="rounded-md bg-warn-bg p-2 text-sm">{msg}</div>}
      {preview && (
        <div className="flex flex-col gap-2">
          <ul className="m-0 rounded-md bg-info-bg p-2 ps-6 text-sm text-muted-fg">{preview.changes.map((c, i) => <li key={i}>{c}</li>)}</ul>
          <div className="flex gap-2">
            <button className="btn btn-primary flex-1" onClick={() => { onAccept(preview); setInput(''); setMsg(null); }}>אישור</button>
            <button className="btn btn-ghost flex-1" onClick={() => { onPreview(null); setMsg(null); }}>דחייה</button>
          </div>
        </div>
      )}
    </section>
  );
}
