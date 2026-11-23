// Where a link in the page leads: to the page asking an expression, as its address
// says it, ?q= and the text, its holons' @ and the language's punctuation left readable.
// A holon is led to by asking for it, @ and its id; home is asking nothing. The page
// keeps its address the same way (site/address.ts).

export const href = (text: string) =>
  text
    ? `?q=${encodeURIComponent(text).replace(/%(40|3A|2C|28|29|7C|2F)/gi, (code) => decodeURIComponent(code))}`
    : "?q=";

// The link to a holon.
export const hrefTo = (id: string) => href(`@${id}`);
