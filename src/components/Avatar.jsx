import { useEffect, useState } from 'react';
import { urlsAssinadas, urlEmCache } from '../lib/fotos';
import { iniciais } from '../lib/formato';

/** Foto circular (bucket privado → URL assinada). Sem foto, mostra as iniciais. */
export default function Avatar({ caminho, nome, tamanho = 40, preview, borda = true, className = '' }) {
  const [url, setUrl] = useState(() => preview || urlEmCache(caminho));

  useEffect(() => {
    if (preview) { setUrl(preview); return; }
    if (!caminho) { setUrl(null); return; }
    let vivo = true;
    const c = urlEmCache(caminho);
    if (c) setUrl(c);
    else urlsAssinadas([caminho]).then((m) => vivo && setUrl(m[caminho]));
    return () => { vivo = false; };
  }, [caminho, preview]);

  const estilo = { width: tamanho, height: tamanho, fontSize: Math.max(11, tamanho * 0.32) };
  return (
    <div style={estilo}
      className={`relative shrink-0 overflow-hidden rounded-full bg-[#222B3D] ${borda ? 'border border-secondary/35' : ''} ${className}`}>
      {url ? (
        <img src={url} alt={nome ? `Foto de ${nome}` : ''} loading="lazy" decoding="async" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center font-extrabold text-[#9FDCF5]" aria-hidden="true">
          {iniciais(nome)}
        </span>
      )}
    </div>
  );
}
