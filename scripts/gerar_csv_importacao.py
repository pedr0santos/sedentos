"""Gera base_jovens_importacao.csv a partir da planilha original (Nome, Telefone, Data de nascimento, Foto).
Uso: python3 gerar_csv_importacao.py planilha.xlsx saida.csv [data_referencia AAAA-MM-DD]"""
import sys, csv, re, uuid, datetime, collections, openpyxl

def digits(v):
    if v is None: return ''
    if isinstance(v, float): v = str(int(v))
    s = str(v).strip()
    return '' if s in ('', '-') else re.sub(r'\D', '', s)

def main(src, dst, ref=None):
    hoje = datetime.date.fromisoformat(ref) if ref else datetime.date.today()
    ws = openpyxl.load_workbook(src, data_only=True).active
    regs = []
    for r in ws.iter_rows(min_row=2, values_only=True):
        if not any(r[:4]): continue
        nome = re.sub(r'\s+', ' ', str(r[0] or '')).strip()
        nasc = r[2].date() if hasattr(r[2], 'date') else None
        foto = str(r[3]).strip() if r[3] else ''
        tipo = ('drive' if 'drive.google' in foto else
                'arquivo' if re.search(r'\.(jpe?g|png|heic|webp)$', foto, re.I) else
                'outro' if foto else 'nenhuma')
        regs.append(dict(id=str(uuid.uuid4()), nome=nome, telefone=digits(r[1]),
                         data_nascimento=nasc.isoformat() if nasc else '',
                         foto_origem=foto, tipo_foto=tipo, email='', status='pendente_validacao', _n=nasc))
    tel_c = collections.Counter(x['telefone'] for x in regs if x['telefone'])
    nome_c = collections.Counter(x['nome'].lower() for x in regs)
    for x in regs:
        c = ['EMAIL_AUSENTE']
        if x['tipo_foto'] == 'nenhuma': c.append('FOTO_AUSENTE')
        if x['tipo_foto'] == 'drive': c.append('FOTO_LINK_EXTERNO')
        if x['tipo_foto'] == 'arquivo': c.append('FOTO_ARQUIVO_NAO_ENVIADO')
        t = x['telefone']
        if not t: c.append('TELEFONE_AUSENTE')
        else:
            if tel_c[t] > 1: c.append('TELEFONE_DUPLICADO')
            if not re.fullmatch(r'[1-9]{2}9\d{8}', t): c.append('TELEFONE_FORMATO_INVALIDO')
        if len(x['nome'].split()) < 2: c.append('NOME_INCOMPLETO')
        if x['nome'] == x['nome'].lower(): c.append('NOME_CAIXA_BAIXA')
        if nome_c[x['nome'].lower()] > 1: c.append('POSSIVEL_DUPLICADO')
        n = x.pop('_n')
        if n is None or n > hoje or (hoje.year - n.year - ((hoje.month, hoje.day) < (n.month, n.day))) < 5:
            c.append('NASCIMENTO_INVALIDO')
        x['inconsistencias'] = ';'.join(c)
    cols = ['id','nome','telefone','data_nascimento','foto_origem','tipo_foto','email','status','inconsistencias']
    with open(dst, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=cols); w.writeheader(); w.writerows(regs)
    tot = collections.Counter(k for x in regs for k in x['inconsistencias'].split(';'))
    print(len(regs), 'registros'); [print(f'  {k}: {v}') for k, v in tot.most_common()]

if __name__ == '__main__': main(*sys.argv[1:])
