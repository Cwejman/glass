// The page showing it is working: each wait begun is given what ends it, and the page
// shows it is busy while any has lasted a moment, so a quick one shows nothing.

let lasting = 0;

export function working(patience = 150): () => void {
  let said = false;
  const timer = setTimeout(() => {
    said = true;
    document.body.classList.toggle("busy", ++lasting > 0);
  }, patience);
  return () => {
    clearTimeout(timer);
    if (said) document.body.classList.toggle("busy", --lasting > 0);
    said = false;
  };
}
