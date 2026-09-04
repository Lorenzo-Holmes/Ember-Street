// Only included by the offline mini-tool build; no network or native bridge calls.
if (!Object.fromEntries) {
  Object.defineProperty(Object, 'fromEntries', { configurable: true, writable: true,
    value: (entries: Iterable<readonly [PropertyKey, unknown]>) => {
      const object: Record<PropertyKey, unknown> = {};
      for (const [key, value] of entries) Object.defineProperty(object, key, { value, writable: true, enumerable: true, configurable: true });
      return object;
    } });
}
if (!Array.prototype.flatMap) {
  Object.defineProperty(Array.prototype, 'flatMap', { configurable: true, writable: true,
    value: function<T, U>(this: T[], callback: (value: T, index: number, array: T[]) => U | U[], thisArg?: unknown) {
      const result: U[] = [];
      this.forEach((item, index, array) => {
        const mapped = callback.call(thisArg, item, index, array);
        if (Array.isArray(mapped)) mapped.forEach((value) => result.push(value));
        else result.push(mapped);
      });
      return result;
    } });
}
if (!Array.prototype.at) {
  Object.defineProperty(Array.prototype, 'at', { configurable: true, writable: true,
    value: function<T>(this: T[], index: number) {
      const offset = Math.trunc(Number(index)) || 0;
      return this[offset < 0 ? this.length + offset : offset];
    } });
}
if (typeof window.queueMicrotask !== 'function') window.queueMicrotask = (callback) => { Promise.resolve().then(callback); };

const html = document.documentElement;
const supports = (property: string, value: string) => typeof CSS !== 'undefined' && CSS.supports(property, value);
const flex = document.createElement('div');
flex.style.cssText = 'position:absolute;visibility:hidden;display:flex;flex-direction:column;row-gap:1px;';
flex.appendChild(document.createElement('div'));
flex.appendChild(document.createElement('div'));
document.body.appendChild(flex);
const flexGap = flex.scrollHeight === 1;
document.body.removeChild(flex);
html.classList.add('mt-runtime');
html.classList.toggle('mt-no-flex-gap', !flexGap);
html.classList.toggle('mt-no-aspect-ratio', !supports('aspect-ratio', '1 / 1'));

const aspectRatios: Array<[string, number]> = [
  ['.v1-title-book', 2 / 3], ['.v1e-art,.v1n-art,.v1-art-frame', 4 / 3],
  ['.v1-phase-art', 16 / 9], ['.v1-building__art', 16 / 7],
  ['.v1s-portrait,.v1r-mini-art.portrait', 2 / 3], ['.v1r-mini-art.scene', 4 / 3],
];

function updateLayout() {
  document.body.classList.toggle('mt-notebook', Boolean(document.querySelector('.notebook-page')));
  document.body.classList.toggle('mt-dusk', Boolean(document.querySelector('.v6-shell--dusk')));
  document.body.classList.toggle('mt-title', Boolean(document.querySelector('.v1-title-screen')));
  document.body.classList.toggle('mt-dialog-open', Boolean(document.querySelector('.v1-menu-sheet[open]')));
  document.querySelectorAll<HTMLElement>('.v6-topbar').forEach((element) => element.classList.toggle('mt-brand', Boolean(element.querySelector('.v6-topbar__brand'))));
  document.querySelectorAll<HTMLElement>('.notebook-page').forEach((element) => element.classList.toggle('mt-next-nav', Boolean(element.nextElementSibling?.classList.contains('v1-bottom-nav'))));
  if (!supports('aspect-ratio', '1 / 1')) {
    aspectRatios.forEach(([selector, ratio]) => document.querySelectorAll<HTMLElement>(selector).forEach((element) => {
      element.style.height = `${element.getBoundingClientRect().width / ratio}px`;
    }));
  }
  if (!flexGap) document.querySelectorAll<HTMLElement>('#root *').forEach((element) => {
    const computed = getComputedStyle(element);
    if (!/^(inline-)?flex$/.test(computed.display)) return;
    const column = computed.flexDirection.indexOf('column') === 0;
    element.classList.toggle('mt-gap-column', column);
    element.classList.toggle('mt-gap-row', !column);
    element.style.setProperty('--mt-gap', (column ? computed.rowGap || computed.gridRowGap : computed.columnGap || computed.gridColumnGap) || '0px');
  });
}

function updateViewport() {
  html.style.setProperty('--app-height', `${window.innerHeight}px`);
  ['top', 'bottom', 'left', 'right'].forEach((side) => {
    if (!supports('padding-top', 'env(safe-area-inset-top)') && !getComputedStyle(html).getPropertyValue(`--safe-area-inset-${side}`).trim()) {
      html.style.setProperty(`--safe-area-inset-${side}`, '0px');
    }
  });
  updateLayout();
}
let scheduled = false;
const observer = new MutationObserver(() => {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => { scheduled = false; updateLayout(); });
});
observer.observe(document.getElementById('root')!, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
window.addEventListener('resize', updateViewport);
updateViewport();

export {};
