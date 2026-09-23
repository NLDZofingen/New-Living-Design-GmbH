/**
 * true, wenn alle Bilder wirklich geladen sind (nicht kaputt, nicht leer).
 * Vercel liefert fuer eine fehlende Datei die index.html mit Status 200; der
 * Browser meldet dann einen Ladefehler, und genau den faengt das hier ab.
 */
export function imagesLoad(sources: string[]): Promise<boolean> {
  return Promise.all(sources.map((src) => new Promise<boolean>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth > 0);
    img.onerror = () => resolve(false);
    img.src = src;
  }))).then((ok) => ok.every(Boolean));
}
