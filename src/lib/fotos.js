import { supabase } from './supabase';

export const BUCKET = 'fotos';
const TAMANHO = 800;          // px
const LIMITE_MB = 0.5;        // ~500 KB

const ehHeic = (f) => /image\/hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name);

/** Converte HEIC (iPhone) para JPG e devolve uma URL para o recorte. */
export async function abrirImagem(arquivo) {
  let f = arquivo;
  if (ehHeic(f)) {
    const { default: heic2any } = await import('heic2any');
    const out = await heic2any({ blob: f, toType: 'image/jpeg', quality: 0.9 });
    f = new File([Array.isArray(out) ? out[0] : out], 'foto.jpg', { type: 'image/jpeg' });
  }
  if (!/^image\/(jpe?g|png|webp)$/i.test(f.type)) {
    throw new Error('Formato não aceito. Use JPG, PNG, HEIC ou WEBP.');
  }
  return URL.createObjectURL(f);
}

function carregar(src) {
  return new Promise((ok, erro) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => erro(new Error('Não foi possível ler a imagem.'));
    img.src = src;
  });
}

/** Recorta (área em px vinda do react-easy-crop), reduz para 800×800 e comprime (~500 KB). */
export async function recortarEComprimir(src, area) {
  const img = await carregar(src);
  const lado = Math.min(TAMANHO, Math.round(area.width));
  const canvas = document.createElement('canvas');
  canvas.width = lado;
  canvas.height = lado;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, lado, lado);
  const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', 0.9));
  const arquivo = new File([blob], 'foto.jpg', { type: 'image/jpeg' });
  const { default: imageCompression } = await import('browser-image-compression');
  return imageCompression(arquivo, {
    maxSizeMB: LIMITE_MB,
    maxWidthOrHeight: TAMANHO,
    fileType: 'image/jpeg',
    useWebWorker: true,
  });
}

/** Envia a foto para a pasta certa e devolve o caminho a gravar em `foto_url`. */
export async function enviarFoto(arquivo, pasta) {
  const caminho = `${pasta}/${Date.now()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(caminho, arquivo, {
    contentType: 'image/jpeg',
    cacheControl: '3600',
    upsert: false,
  });
  if (error) throw error;
  return caminho;
}

export async function apagarFoto(caminho) {
  if (caminho) await supabase.storage.from(BUCKET).remove([caminho]);
}

// ---- URLs assinadas (bucket privado), com cache em memória ----
const cache = new Map(); // caminho → { url, expira }
const VALIDADE = 60 * 60; // 1 hora

export async function urlsAssinadas(caminhos) {
  const agora = Date.now();
  const faltam = [...new Set(caminhos.filter(Boolean))].filter((c) => !(cache.get(c)?.expira > agora + 60_000));
  for (let i = 0; i < faltam.length; i += 100) {
    const lote = faltam.slice(i, i + 100);
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls(lote, VALIDADE);
    for (const d of data ?? []) {
      if (d.signedUrl) cache.set(d.path, { url: d.signedUrl, expira: agora + VALIDADE * 1000 });
    }
  }
  return Object.fromEntries(caminhos.filter(Boolean).map((c) => [c, cache.get(c)?.url ?? null]));
}

export const urlEmCache = (c) => (c ? cache.get(c)?.url ?? null : null);
