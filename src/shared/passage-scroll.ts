/** Keep a citation visible through late image/font layout changes until the reader takes control. */
export function followPassageLayout(container: HTMLElement, target: () => HTMLElement | null) {
  const win = container.ownerDocument.defaultView!;
  let active = true;
  const align = () => {
    if (!active) return;
    const element = target();
    if (element)
      win.scrollTo({
        top: Math.max(
          0,
          element.getBoundingClientRect().top + win.scrollY - win.innerHeight * 0.28,
        ),
        behavior: 'instant',
      });
  };
  const observer = new win.ResizeObserver(align);
  const inputs = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
  const stop = () => {
    active = false;
    observer.disconnect();
    for (const event of inputs) win.removeEventListener(event, stop);
  };
  observer.observe(container);
  for (const event of inputs) win.addEventListener(event, stop, { passive: true, once: true });
  const frame = win.requestAnimationFrame(align);
  // No fixed timeout: lazy images can load much later in a background tab.
  return () => {
    stop();
    win.cancelAnimationFrame(frame);
  };
}
