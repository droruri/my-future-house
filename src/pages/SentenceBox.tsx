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
    <section aria-label="תיקון במשפט" style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid #ccc', paddingTop: 8 }}>
      <strong>{props.title ?? 'שיפוץ במשפט'}</strong>
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={props.placeholder ?? 'למשל: תוריד את הקיר בין המטבח לסלון'}
        rows={3}
      />
      <button onClick={onSend} disabled={busy || !input.trim()}>{busy ? 'חושב…' : 'הצג שינוי'}</button>
      {msg && <div role="alert">{msg}</div>}
      {preview && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <ul style={{ margin: 0, paddingInlineStart: 18 }}>{preview.changes.map((c, i) => <li key={i}>{c}</li>)}</ul>
          <button onClick={() => { onAccept(preview); setInput(''); setMsg(null); }}>אישור</button>
          <button onClick={() => { onPreview(null); setMsg(null); }}>דחייה</button>
        </div>
      )}
    </section>
  );
}
