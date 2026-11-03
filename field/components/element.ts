// An element of the page, with its class and its text, as every component
// makes them.
export function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const made = document.createElement(tag);
  if (className) made.className = className;
  if (text !== undefined) made.textContent = text;
  return made;
}
