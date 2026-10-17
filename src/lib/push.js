// Notificações push (PWA). Precisa de VITE_VAPID_PUBLIC_KEY e do service worker /sw.js.
import { supabase, demo } from './supabase';

const CHAVE = import.meta.env.VITE_VAPID_PUBLIC_KEY;

export const pushSuportado = () =>
  !demo && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && Boolean(CHAVE);

export const pushEstado = () => (typeof Notification === 'undefined' ? 'indisponivel' : Notification.permission);

function base64ParaBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** Pede permissão, inscreve o aparelho e guarda a inscrição no Supabase. */
export async function ativarPush() {
  if (!pushSuportado()) {
    throw new Error(/iPhone|iPad/.test(navigator.userAgent)
      ? 'No iPhone, instale o site na tela inicial (Compartilhar › Adicionar à Tela de Início) e abra por lá para ativar.'
      : 'Este navegador não aceita notificações push.');
  }
  const permissao = await Notification.requestPermission();
  if (permissao !== 'granted') throw new Error('As notificações foram bloqueadas. Libere nas configurações do navegador.');
  const reg = await navigator.serviceWorker.ready;
  const inscricao = (await reg.pushManager.getSubscription())
    ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ParaBytes(CHAVE) });
  const j = inscricao.toJSON();
  const { error } = await supabase.from('push_inscricoes')
    .upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }, { onConflict: 'endpoint' });
  if (error) throw error;
  return true;
}

export function registrarServiceWorker() {
  if (demo || !('serviceWorker' in navigator) || import.meta.env.DEV) return;
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}
