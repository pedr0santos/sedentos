// Ícones de traço (sem biblioteca externa). Uso: <Icone nome="camera" />
const P = {
  seta: 'M5 12h14M13 6l6 6-6 6',
  voltar: 'M19 12H5M11 18l-6-6 6-6',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  cadeado: 'M5 11h14v10H5zM8 11V8a4 4 0 0 1 8 0v3',
  chave: 'M15 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12.2 11.8L4 20M7 17l2 2M5 19l1.5 1.5',
  check: 'M5 12l5 5 9-10',
  lapis: 'M4 20h4L19 9l-4-4L4 16z',
  relogio: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  busca: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  baixar: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  enviar: 'M12 16V4M7 9l5-5 5 5M5 20h14',
  painel: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  pessoas: 'M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c2 .7 3.2 2.5 3.5 5.2',
  validar: 'M9 11l3 3 8-8M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9',
  copias: 'M8 8h12v12H8zM16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2',
  whatsapp: 'M4 20l1.3-3.9A8 8 0 1 1 8 19zM9 9.5c.3 2 2.5 4.3 4.6 4.8l1.2-1.2 1.7.8-.4 1.6c-3.5.4-7.6-3.7-7.2-7.2l1.6-.4.8 1.7z',
  sair: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  alerta: 'M12 3l10 18H2zM12 10v4M12 17.5v.5',
  calendario: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  fechar: 'M6 6l12 12M18 6L6 18',
  baixo: 'M6 9l6 6 6-6',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  menu: 'M4 7h16M4 12h16M4 17h16',
  conversa: 'M4 5h16v11H9l-5 4z',
  coracao: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z',
  maos: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z',
  estrela: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3l-5.5 2.9 1-6.2L3 9.6l6.2-.9z',
  bolo: 'M4 21h16M5 21v-7h14v7M8 14v-3h8v3M12 11V8M12 5.5v.5M5 17.5c2 1 3-1 4.7 0s3 1 4.6 0 2.7-1 4.7 0',
  rede: 'M14 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM7 19a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM21 19a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM12 7v4M12 11l-6.5 6M12 11l6.5 6',
  transferir: 'M7 7h13M16 3l4 4-4 4M17 17H4M8 13l-4 4 4 4',
  mais: 'M12 5v14M5 12h14',
  lixo: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  usuario: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1-4 4-6 8-6s7 2 8 6',
  direita: 'M9 6l6 6-6 6',
  sino: 'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0',
};

export default function Icone({ nome, tamanho = 18, largura = 2, className = '', titulo }) {
  return (
    <svg
      width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={largura} strokeLinecap="round" strokeLinejoin="round" className={className}
      role={titulo ? 'img' : undefined} aria-label={titulo} aria-hidden={titulo ? undefined : true}
    >
      <path d={P[nome]} />
    </svg>
  );
}
