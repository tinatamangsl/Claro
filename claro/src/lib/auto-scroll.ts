/**
 * Scrolling the page while a drag is in progress.
 *
 * Without this, dragging only works when the grip and its target are on screen
 * together, which on a real screen is almost never: Today's schedule and its
 * action lists are a page apart, so the hour somebody wants is reliably above
 * or below the fold at the moment they pick a task up.
 *
 * **It runs on a frame loop, not on pointer moves.** Holding still at the edge
 * of the screen is the whole gesture, and a stationary pointer fires no
 * `pointermove` at all: driving the scroll from move events means the page
 * stops the instant the user does the one thing they are trying to do.
 *
 * **The top edge starts below the header.** The header is sticky, 65px on a
 * laptop and 89px on a phone, so a fixed 96px band at the top of the viewport
 * is almost entirely covered by it: the place you have to hold to scroll up is
 * a place where nothing can ever be dropped. Below `lg` the spread stacks and
 * the schedule sits a page *above* the action lists, so that band is the only
 * way to reach it, and the drag was unlandable at every width under 1024px —
 * the page scrolled to the top correctly and no hour ever highlighted, because
 * the pointer was resting on the nav the whole time.
 *
 * **The window moves first.** Claro's two-page spread scrolls its pages
 * internally from `lg` up, so the container under the pointer is usually the
 * *actions* column while the target is an hour in the *schedule* column beside
 * it: scrolling what the pointer is over moves the wrong pane and never reveals
 * the target. Only once the window has run out does the inner pane take over.
 */

/** How close to an edge the pointer has to get before the page follows. */
const EDGE = 96;

/**
 * Pixels per frame at the very edge. A stacked page puts 1,300px between the
 * grip and the hour it is heading for, which at the old 14 took nearly three
 * seconds of holding perfectly still against a target that is off screen the
 * whole time. Nobody holds that long without concluding it is broken.
 */
const MAX_STEP = 36;

/**
 * Where the top edge actually begins. The sticky header covers the top of the
 * viewport, so the band is measured from underneath it rather than from zero.
 */
function headerBottom(): number {
  const header = document.querySelector("header");
  if (!header) return 0;
  const style = getComputedStyle(header);
  if (style.position !== "sticky" && style.position !== "fixed") return 0;
  return Math.max(0, header.getBoundingClientRect().bottom);
}

let pointer: { x: number; y: number } | null = null;
let frame: number | null = null;

function scrollableAt(x: number, y: number): HTMLElement | null {
  // Guarded: not every environment the tests run in implements it, and a
  // missing hit-test should mean "no inner scroller", not a thrown drag.
  let node = (document.elementFromPoint?.(x, y) ?? null) as HTMLElement | null;

  while (node && node !== document.body) {
    const style = getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

function step(): void {
  frame = null;
  if (!pointer) return;

  const { x, y } = pointer;
  const top = y - (headerBottom() + EDGE);
  const bottom = y - (window.innerHeight - EDGE);

  /*
   * The depth into the band sets the speed, so easing off slows the page down
   * rather than stopping it dead. The whole band maps onto the whole rate: a
   * divisor picked independently of EDGE silently caps the speed at whatever
   * the arithmetic happens to allow, which is how this ran at less than half
   * of MAX_STEP for its entire life.
   * Nothing near an edge: keep the loop alive, but do not move the page.
   */
  const rate = (depth: number) => (Math.min(depth, EDGE) / EDGE) * MAX_STEP;
  const amount = top < 0 ? -rate(-top) : bottom > 0 ? rate(bottom) : 0;

  if (amount !== 0) {
    const before = window.scrollY;
    window.scrollBy(0, amount);

    if (window.scrollY === before) {
      const scroller = scrollableAt(x, y);
      if (scroller) scroller.scrollTop += amount;
    }
  }

  frame = requestAnimationFrame(step);
}

/** Called on every pointer move during a drag, to keep the loop aimed. */
export function trackPointer(x: number, y: number): void {
  pointer = { x, y };
  if (frame === null) frame = requestAnimationFrame(step);
}

/** Called when the drag ends, however it ends. */
export function stopAutoScroll(): void {
  pointer = null;
  if (frame !== null) cancelAnimationFrame(frame);
  frame = null;
}
