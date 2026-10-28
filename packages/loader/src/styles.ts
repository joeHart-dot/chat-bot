export const css = `
:host { all: initial; }
* { box-sizing: border-box; }
.launcher {
  position: fixed; right: 20px; bottom: 20px; z-index: 2147483000;
  width: 56px; height: 56px; border-radius: 50%; border: 0; cursor: pointer;
  background: var(--w-color, #2563eb); color: #fff;
  box-shadow: 0 4px 16px rgba(0,0,0,.25);
  display: flex; align-items: center; justify-content: center;
}
.launcher:focus-visible { outline: 3px solid #fff; outline-offset: -6px; }
.launcher svg { width: 26px; height: 26px; fill: currentColor; }
.panel {
  position: fixed; right: 20px; bottom: 88px; z-index: 2147483000;
  width: 380px; height: min(600px, calc(100vh - 108px));
  border-radius: 12px; overflow: hidden; background: #fff;
  box-shadow: 0 8px 32px rgba(0,0,0,.28);
}
.panel[hidden] { display: none; }
.panel iframe { width: 100%; height: 100%; border: 0; display: block; }
@media (max-width: 640px) {
  .panel { inset: 0; width: 100%; height: 100%; border-radius: 0; }
  .launcher[aria-expanded="true"] { display: none; }
}
@media (prefers-reduced-motion: no-preference) {
  .launcher { transition: transform .15s; }
  .launcher:hover { transform: scale(1.06); }
}
`;
