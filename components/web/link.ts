// Where a link in the components leads: to the site's root asking a text, by the param q
// the page reads (site/page.ts), as the location makes an address
// (integrations/location/location.ts). A holon is led to by asking for it, @ and its id; home is
// asking nothing.

import { href as asking } from "../../integrations/location/location.ts";

export const href = (text: string) => asking({ q: text }, "/");

// The link to a holon.
export const hrefTo = (id: string) => href(`@${id}`);
