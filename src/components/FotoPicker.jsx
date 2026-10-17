import { lazy, Suspense, useRef, useState, useCallback } from 'react';
import Icone from './Icone';
import { abrirImagem, recortarEComprimir } from '../lib/fotos';

const Cropper = lazy(() => import('react-easy-crop'));

/**
 * Área circular para escolher foto (câmera ou galeria), recortar e comprimir.
 * onChange(arquivoComprimido, urlDePrevia)
 */
export default function FotoPicker({ previa, onChange, erro, tamanho = 136, rotulo = 'Adicionar foto' }) {
  const input = useRef(null);
  const [src, setSrc] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [falha, setFalha] = useState('');

  const escolher = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setFalha('');
    setOcupado(true);
    try {
      setSrc(await abrirImagem(f));
      setZoom(1);
      setCrop({ x: 0, y: 0 });
    } catch (err) {
      setFalha(err.message);
    } finally {
      setOcupado(false);
    }
  };

  const aoRecortar = useCallback((_, px) => setArea(px), []);

  const confirmar = async () => {
    setOcupado(true);
    try {
      const arquivo = await recortarEComprimir(src, area);
      onChange(arquivo, URL.createObjectURL(arquivo));
      URL.revokeObjectURL(src);
      setSrc(null);
    } catch (err) {
      setFalha(err.message || 'Não foi possível preparar a foto.');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => input.current?.click()}
        style={{ width: tamanho, height: tamanho }}
        aria-label={previa ? 'Trocar foto' : rotulo}
        aria-describedby={erro || falha ? 'foto-erro' : undefined}
        className={`group relative flex flex-col items-center justify-center gap-1.5 overflow-hidden rounded-full text-[13px] font-bold transition
          ${previa ? 'p-[3px]' : `border-2 border-dashed ${erro ? 'border-danger/70 bg-danger/5' : 'border-secondary/60 bg-secondary/[0.08]'} text-secondary hover:bg-secondary/15`}`}
        {...(previa ? { style: { width: tamanho, height: tamanho, background: 'var(--gradient)' } } : {})}
      >
        {previa ? (
          <>
            <img src={previa} alt="Prévia da sua foto" className="h-full w-full rounded-full object-cover" />
            <span className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-bg/80 px-2.5 py-1 text-[11px] text-texto">
              <Icone nome="camera" tamanho={13} /> Trocar
            </span>
          </>
        ) : ocupado ? (
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-secondary/30 border-t-secondary" />
        ) : (
          <>
            <Icone nome="camera" tamanho={34} />
            {rotulo}
          </>
        )}
      </button>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
        className="hidden" onChange={escolher} />
      {(erro || falha) ? (
        <span id="foto-erro" className="text-xs font-semibold text-[#FF8A8E]">{falha || erro}</span>
      ) : (
        <span className="text-center text-xs text-muted">Câmera ou galeria. Depois você recorta.</span>
      )}

      {src && (
        <div className="fixed inset-0 z-50 flex flex-col bg-bg/95 backdrop-blur" role="dialog" aria-modal="true" aria-label="Recortar foto">
          <div className="relative flex-1">
            <Suspense fallback={null}>
              <Cropper image={src} crop={crop} zoom={zoom} aspect={1} cropShape="round" showGrid={false}
                onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={aoRecortar} />
            </Suspense>
          </div>
          <div className="mx-auto flex w-full max-w-md flex-col gap-4 p-6 pb-[max(24px,env(safe-area-inset-bottom))]">
            <label className="flex items-center gap-3 text-sm text-muted">
              Zoom
              <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(+e.target.value)}
                className="flex-1 accent-[var(--secondary)]" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" className="btn-secundario" onClick={() => { URL.revokeObjectURL(src); setSrc(null); }}>Cancelar</button>
              <button type="button" className="btn-primario" onClick={confirmar} disabled={ocupado || !area}>
                {ocupado ? 'Preparando…' : 'Usar foto'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
