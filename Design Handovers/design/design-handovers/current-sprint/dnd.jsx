// Touch-and-mouse compatible drag-to-reorder hook.
// Works with Pointer Events so it handles mouse, pen, and touch uniformly.
//
// Usage: attach onPointerDown={getHandleProps(id).onPointerDown} to the drag handle.
// Container should have className="dnd-container" and each sortable item className="dnd-item" data-dnd-id={id}.
//
// A production implementation should use @dnd-kit/sortable — this is a prototype-scoped stand-in.

const { useRef: useRefDnd, useState: useStateDnd, useCallback: useCallbackDnd } = React;

function useSortable({ ids, onReorder, axis = "y" }) {
  const [dragging, setDragging] = useStateDnd(null); // { id, y, startY, height }
  const [overId, setOverId] = useStateDnd(null);
  const idsRef = useRefDnd(ids);
  idsRef.current = ids;

  const getItemAtPoint = (x, y) => {
    const container = document.querySelector(".dnd-active-container");
    if (!container) return null;
    const items = [...container.querySelectorAll(".dnd-item")];
    for (const item of items) {
      const r = item.getBoundingClientRect();
      if (axis === "y" ? (y >= r.top && y <= r.bottom) : (x >= r.left && x <= r.right)) {
        return item.getAttribute("data-dnd-id");
      }
    }
    return null;
  };

  const onPointerDown = useCallbackDnd((id) => (e) => {
    e.preventDefault();
    const row = e.currentTarget.closest(".dnd-item");
    if (!row) return;
    const container = row.closest(".dnd-container");
    if (container) container.classList.add("dnd-active-container");
    const rect = row.getBoundingClientRect();
    setDragging({ id, y: e.clientY, startY: e.clientY, offsetY: e.clientY - rect.top, height: rect.height, rect });
    setOverId(id);

    const move = (ev) => {
      setDragging(d => d && { ...d, y: ev.clientY });
      const target = getItemAtPoint(ev.clientX, ev.clientY);
      if (target) setOverId(target);
    };
    const up = (ev) => {
      const target = getItemAtPoint(ev.clientX, ev.clientY);
      if (target && target !== id) {
        const arr = [...idsRef.current];
        const from = arr.indexOf(id);
        const to = arr.indexOf(target);
        if (from >= 0 && to >= 0) {
          const [moved] = arr.splice(from, 1);
          arr.splice(to, 0, moved);
          onReorder(arr);
        }
      }
      const cont = document.querySelector(".dnd-active-container");
      if (cont) cont.classList.remove("dnd-active-container");
      setDragging(null);
      setOverId(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }, [onReorder]);

  const getItemProps = (id) => ({
    "data-dnd-id": id,
    className: "dnd-item" +
      (dragging?.id === id ? " dnd-item--dragging" : "") +
      (overId === id && dragging && dragging.id !== id ? " dnd-item--over" : ""),
  });

  const getHandleProps = (id) => ({
    onPointerDown: onPointerDown(id),
    style: { touchAction: "none", cursor: "grab" },
  });

  return { getItemProps, getHandleProps, dragging, overId };
}

Object.assign(window, { useSortable });
