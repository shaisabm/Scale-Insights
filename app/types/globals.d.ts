// Ambient types for the plain browser scripts in src/ (used only by `npm run typecheck`).

// core.js creates the shared namespace that every other script reads.
interface Window {
  SP: any;
}

// Event handlers read element properties straight off `e.target`
// (delegated clicks, checkbox and input changes). Describe that usage here
// rather than casting at every call site.
interface EventTarget {
  closest?(selectors: string): any;
  matches?: Element["matches"];
  dataset?: DOMStringMap;
  checked?: boolean;
  value?: string;
  type?: string;
  name?: string;
}
