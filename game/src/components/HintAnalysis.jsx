import React, { useState } from 'react';

const RULES = [
  'Three hints per move', 'Progressive disclosure', 'One teaching point',
  'Early hints avoid exact notation', 'No redundant hints', 'Dictionary and taxonomy alignment',
  'Clear, short phrasing', 'Relevant to this move', 'Independent principle first',
  'Move-one principle teaches the first tag'
];

export default function HintAnalysis({ puzzle, moveIndex, hintIndex }) {
  const reviews = puzzle?.hintReviews?.moves;
  const initial = reviews?.[moveIndex]?.[hintIndex];
  const currentHint = puzzle?.moveHints?.[moveIndex]?.[hintIndex];
  const currentReview = initial && initial.hint === currentHint;
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState([moveIndex, hintIndex]);
  const [feedback, setFeedback] = useState({});
  const entries = (reviews || []).flatMap((group, m) => group.map((review, h) => ({ ...review, m, h })).filter(review => puzzle?.moveHints?.[m]?.[review.h] === review.hint));
  const selected = entries.findIndex(({ m, h }) => m === position[0] && h === position[1]);
  const review = entries[selected];
  const answer = (id) => feedback[`${position.join('-')}-${id}`] || {};
  const update = (id, values) => {
    const key = `${position.join('-')}-${id}`;
    setFeedback(previous => ({ ...previous, [key]: { ...previous[key], ...values } }));
  };
  const response = (id) => <div className="mt-2">
    <div className="flex gap-2">
      {['Agree', 'Disagree'].map(label => <button key={label} type="button" aria-pressed={answer(id).choice === label} onClick={() => update(id, { choice: label })} className={`rounded px-3 py-1 text-sm ${answer(id).choice === label ? 'bg-yellow-500 text-slate-950' : 'bg-slate-700 text-white hover:bg-slate-600'}`}>{label}</button>)}
    </div>
    {answer(id).choice === 'Disagree' && <textarea aria-label={`Why do you disagree with ${id === 'overall' ? 'the overall grade' : `rule ${id}`}?`} placeholder="Why do you disagree?" value={answer(id).note || ''} onChange={e => update(id, { note: e.target.value })} className="mt-2 w-full rounded border border-slate-500 bg-slate-900 p-2 text-white" rows={2} />}
  </div>;
  const valid = review?.scores?.filter(Number.isFinite) || [];
  const average = valid.length ? Math.round(valid.reduce((sum, value) => sum + value, 0) / valid.length) : null;
  return <div>
    <button type="button" title="Analyze hint" aria-label="Analyze hint" aria-expanded={open} onClick={() => { setPosition([moveIndex, hintIndex]); setOpen(!open); }} className="rounded px-2 text-3xl hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-yellow-400">🔎</button>
    {open && <section aria-label="Hint analysis" className="mt-2 rounded-lg border border-slate-600 bg-slate-900 p-4 text-slate-100">
      {!currentReview ? <p>Analysis is not available for this hint yet.</p> : review && <>
        <div className="flex items-center justify-between gap-3"><strong>Move {review.m + 1} · Hint {review.h + 1}</strong><div className="flex gap-2"><button type="button" disabled={selected <= 0} onClick={() => setPosition([entries[selected - 1].m, entries[selected - 1].h])} className="rounded bg-slate-700 px-3 py-1 disabled:opacity-40">Previous</button><button type="button" disabled={selected >= entries.length - 1} onClick={() => setPosition([entries[selected + 1].m, entries[selected + 1].h])} className="rounded bg-slate-700 px-3 py-1 disabled:opacity-40">Next</button></div></div>
        <p className="mt-3 text-sm">{review.hint}</p>
        {review.position && <details className="mt-2 text-xs text-slate-400"><summary className="cursor-pointer">Position reviewed</summary><p className="mt-1 break-all">FEN: {review.position.fen}</p><p>Move: {review.position.san}</p></details>}
        <p className="mt-3 font-bold">AI grade: {average}%</p>
        <p className="text-xs text-slate-400">Average of applicable rule scores; Editorial scores based on the position before this move.</p>
        {response('overall')}
        <div className="mt-4 space-y-3">{RULES.map((rule, index) => <div key={rule} className="rounded bg-slate-800 p-3"><div className="flex justify-between gap-2"><span>{index + 1}. {rule}</span><strong>{review.scores[index] == null ? 'N/A' : `${review.scores[index]}%`}</strong></div>{review.notes?.[index + 1] && <p className="mt-1 text-sm text-amber-200">{review.notes[index + 1]}</p>}{review.scores[index] != null && response(index + 1)}</div>)}</div>
      </>}
    </section>}
  </div>;
}
