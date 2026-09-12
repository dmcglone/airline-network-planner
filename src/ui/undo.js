/* ----- undo -----
   The whole airline is one small serialisable object — the 404-route example is
   about 25 KB — so an undo stack can simply be a list of snapshots. Twenty of
   them costs half a megabyte and covers every action in the app at once,
   including ones nobody thought to write an undo for.

   Undo stores the state as it WAS, so undoing is "put that back" rather than
   "work out the inverse" — the version that cannot be subtly wrong.

   Getting that right needs care about when the snapshot is taken. Callers
   mutate `state` and then call rebuild(), so snapshotting inside rebuild()
   captures the change, not the state before it — an early version did exactly
   that and undo became a no-op. Instead we keep `committed`: the state as of
   the last completed build. That is by definition the state before whatever is
   being rebuilt now, so it is what goes on the stack.

   Typing into a number box would otherwise push a snapshot per keystroke, so
   consecutive edits of the same thing coalesce: a label identifies the action,
   and repeating the same label inside a short window replaces the pending
   snapshot instead of stacking a new one. */

const UNDO_MAX = 25;
const UNDO_COALESCE_MS = 900;
let undoStack = [], redoStack = [], undoLast = {label:null, at:0};
let committed = null;                          // state as of the last finished build

const snapshot = () => JSON.stringify(state);
function markCommitted(){ committed = snapshot(); }

function pushUndo(label){
  if(committed === null) return;               // nothing has been committed yet
  if(committed === snapshot()) return;         // rebuild with no actual change
  const now = Date.now();
  const sameRun = label && label === undoLast.label && (now - undoLast.at) < UNDO_COALESCE_MS;
  undoLast = {label, at: now};
  if(sameRun && undoStack.length) return;      // still the same edit; keep the earlier snapshot
  undoStack.push({s: committed, label: label || "change"});
  if(undoStack.length > UNDO_MAX) undoStack.shift();
  redoStack = [];                              // a new action forks the future
  paintUndo();
}

function restore(json){
  state = JSON.parse(json);
  applyStationConfig(state);
  reconcileGeom(state.fleet);
  applyBrand();
  save();
  M = build();
  if(typeof fillSelects === "function") fillSelects();
  draw(); markCommitted(); paintUndo();
}

function doUndo(){
  if(!undoStack.length){ toast("Nothing to undo"); return; }
  const top = undoStack.pop();
  redoStack.push({s: snapshot(), label: top.label});
  undoLast = {label:null, at:0};
  restore(top.s);
  toast(`Undid ${top.label}`);
}

function doRedo(){
  if(!redoStack.length){ toast("Nothing to redo"); return; }
  const top = redoStack.pop();
  undoStack.push({s: snapshot(), label: top.label});
  undoLast = {label:null, at:0};
  restore(top.s);
  toast(`Redid ${top.label}`);
}

function paintUndo(){
  const u = $("#btnUndo"), r = $("#btnRedo");
  if(u){ u.disabled = !undoStack.length;
         u.title = undoStack.length ? `Undo ${undoStack[undoStack.length-1].label}` : "Nothing to undo"; }
  if(r){ r.disabled = !redoStack.length;
         r.title = redoStack.length ? `Redo ${redoStack[redoStack.length-1].label}` : "Nothing to redo"; }
}

document.addEventListener("keydown", e=>{
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
  if(!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
  if(typing && !e.shiftKey) return;            // let the field handle its own undo first
  e.preventDefault();
  e.shiftKey ? doRedo() : doUndo();
});
