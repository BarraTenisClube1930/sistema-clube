/* =====================================================================
 * Contribuição Mensal Temporária — Sócios Proprietários
 * (Conselho Deliberativo — Art. 15º — R$ 60,00/mês por 24 meses)
 *
 * Mapeamento de quem está pagando, quem não está e dados de cobrança.
 * Módulo isolado: NÃO altera app.js / auditoria-extra.js / comunicado-conselho.js.
 *
 * Persistência: socio.contribTemp = {
 *   status: 'pagando' | 'nao_pagando' | 'pendente' | 'isento',
 *   dataAdesao: 'YYYY-MM-DD',
 *   diaCobranca: 1..28,
 *   valor: number (default 60),
 *   formaPagamento: string,
 *   obs: string,
 *   atualizadoEm: ISO string,
 *   atualizadoPor: string
 * }
 * ===================================================================== */
(function(){
  'use strict';

  const VALOR_PADRAO = 60;
  const PERIODO_MESES = 24;
  const INICIO = '2026-02-26';

  // ---------- helpers ----------
  function getCT(s){ return (s && s.contribTemp) ? s.contribTemp : null; }
  function statusLabel(st){
    return ({
      pagando:'✅ Pagando',
      nao_pagando:'❌ Não está pagando',
      pendente:'⏳ Pendente de cadastro',
      isento:'➖ Isento / Não se aplica'
    })[st] || '⏳ Pendente de cadastro';
  }
  function statusBadgeColor(st){
    return ({
      pagando:'#059669',
      nao_pagando:'#dc2626',
      pendente:'#d97706',
      isento:'#6b7280'
    })[st] || '#d97706';
  }
  function isPropTipo(t){ return String(t||'').toLowerCase()==='proprietario'; }
  function _user(){
    try { return (typeof currentUser==='function' ? currentUser() : (window.currentUser||'sistema')) || 'sistema'; }
    catch(e){ return 'sistema'; }
  }

  // ---------- HTML do bloco (reaproveitado em cadastro e edição) ----------
  function blocoHTML(prefix, ct){
    ct = ct || {};
    const status        = ct.status || 'pendente';
    const dataAdesao    = ct.dataAdesao || '';
    const diaCobranca   = ct.diaCobranca || '';
    const valor         = (ct.valor!=null && ct.valor!=='') ? ct.valor : VALOR_PADRAO;
    const formaPag      = ct.formaPagamento || '';
    const obs           = ct.obs || '';

    return `
      <div class="ct-bloco" id="ct-bloco-${prefix}" style="margin-top:14px;border:2px solid #f59e0b;border-radius:10px;padding:14px;background:linear-gradient(180deg,#fffbeb 0%,#fef3c7 100%)">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
          <span style="font-size:18px">💰</span>
          <strong style="color:#78350f;font-size:14px">Contribuição Mensal Temporária (Conselho — Art. 15º)</strong>
        </div>
        <div style="font-size:11.5px;color:#78350f;margin-bottom:12px;line-height:1.45">
          R$ ${VALOR_PADRAO},00/mês por ${PERIODO_MESES} meses · Início: 26/02/2026 · Aplicável apenas a Sócios Proprietários.
        </div>

        <div class="grid2" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div class="field">
            <label style="font-weight:600;font-size:12px;color:#78350f">Situação do pagamento</label>
            <select id="${prefix}-ct-status" style="width:100%;padding:8px;border:1px solid #d97706;border-radius:6px;background:#fff">
              <option value="pendente"     ${status==='pendente'?'selected':''}>⏳ Pendente de cadastro</option>
              <option value="pagando"      ${status==='pagando'?'selected':''}>✅ Pagando</option>
              <option value="nao_pagando"  ${status==='nao_pagando'?'selected':''}>❌ Não está pagando</option>
              <option value="isento"       ${status==='isento'?'selected':''}>➖ Isento / Não se aplica</option>
            </select>
          </div>
          <div class="field">
            <label style="font-weight:600;font-size:12px;color:#78350f">Data da adesão / cadastro</label>
            <input id="${prefix}-ct-dataAdesao" type="date" value="${dataAdesao}" style="width:100%;padding:8px;border:1px solid #d97706;border-radius:6px;background:#fff"/>
          </div>
          <div class="field">
            <label style="font-weight:600;font-size:12px;color:#78350f">Melhor dia para cobrança</label>
            <select id="${prefix}-ct-diaCobranca" style="width:100%;padding:8px;border:1px solid #d97706;border-radius:6px;background:#fff">
              <option value="">— escolher —</option>
              ${Array.from({length:28},(_,i)=>i+1).map(d=>`<option value="${d}" ${String(diaCobranca)===String(d)?'selected':''}>Dia ${d}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label style="font-weight:600;font-size:12px;color:#78350f">Valor mensal (R$)</label>
            <input id="${prefix}-ct-valor" type="number" min="0" step="0.01" value="${valor}" style="width:100%;padding:8px;border:1px solid #d97706;border-radius:6px;background:#fff"/>
          </div>
          <div class="field" style="grid-column:1/-1">
            <label style="font-weight:600;font-size:12px;color:#78350f">Forma de pagamento</label>
            <select id="${prefix}-ct-forma" style="width:100%;padding:8px;border:1px solid #d97706;border-radius:6px;background:#fff">
              <option value=""           ${formaPag===''?'selected':''}>— não definida —</option>
              <option value="boleto"     ${formaPag==='boleto'?'selected':''}>Boleto bancário</option>
              <option value="pix"        ${formaPag==='pix'?'selected':''}>PIX</option>
              <option value="debito"     ${formaPag==='debito'?'selected':''}>Débito automático</option>
              <option value="dinheiro"   ${formaPag==='dinheiro'?'selected':''}>Dinheiro / Secretaria</option>
              <option value="outro"      ${formaPag==='outro'?'selected':''}>Outro</option>
            </select>
          </div>
          <div class="field" style="grid-column:1/-1">
            <label style="font-weight:600;font-size:12px;color:#78350f">Observações da cobrança</label>
            <textarea id="${prefix}-ct-obs" rows="2" placeholder="Ex.: cobrar junto com a mensalidade; sócio negocia parcelamento; etc." style="width:100%;padding:8px;border:1px solid #d97706;border-radius:6px;background:#fff;font-family:inherit">${(obs||'').replace(/</g,'&lt;')}</textarea>
          </div>
        </div>
      </div>
    `;
  }

  function lerForm(prefix){
    const g = id => document.getElementById(prefix+'-ct-'+id);
    if(!g('status')) return null;
    const valorRaw = g('valor')?.value;
    return {
      status:        g('status').value || 'pendente',
      dataAdesao:    g('dataAdesao')?.value || '',
      diaCobranca:   g('diaCobranca')?.value ? Number(g('diaCobranca').value) : '',
      valor:         valorRaw==='' || valorRaw==null ? VALOR_PADRAO : Number(valorRaw),
      formaPagamento:g('forma')?.value || '',
      obs:           (g('obs')?.value||'').trim(),
      atualizadoEm:  new Date().toISOString(),
      atualizadoPor: _user()
    };
  }

  // ---------- injeção no formulário de CADASTRO ----------
  function injetarCadastro(){
    const bloco = document.getElementById('bloco-proprietario');
    if(!bloco || document.getElementById('ct-bloco-cad')) return;
    bloco.insertAdjacentHTML('beforeend', blocoHTML('cad', null));
  }
  function limparCadastro(){
    const wrap = document.getElementById('ct-bloco-cad');
    if(wrap) wrap.remove();
    injetarCadastro();
  }

  // ---------- injeção no formulário de EDIÇÃO ----------
  function injetarEdicao(socio){
    if(!isPropTipo(socio?.tipoSocio || socio?.tipo)) return;
    if(document.getElementById('ct-bloco-edit')) return;
    const ancora = document.getElementById('e-cedente') || document.getElementById('e-origem');
    if(!ancora) return;
    // sobe até a section que contém o ancora
    let section = ancora.closest('.section') || ancora.parentElement;
    if(!section) return;
    section.insertAdjacentHTML('afterend',
      `<div class="section" style="margin-top:16px"><div class="section-title">Contribuição Temporária (Conselho)</div>${blocoHTML('edit', getCT(socio))}</div>`
    );
  }

  // ---------- WRAPPERS (sem editar app.js) ----------
  function wrapSalvarSocio(){
    if(typeof window.salvarSocio !== 'function' || window.salvarSocio.__ctWrapped) return;
    const orig = window.salvarSocio;
    const wrapped = async function(){
      const tipo = document.getElementById('f-tipo')?.value;
      let ctData = null;
      if(isPropTipo(tipo)) ctData = lerForm('cad');
      const lenAntes = (window.socios||[]).length;
      const r = await orig.apply(this, arguments);
      // após salvar, o app re-renderiza; achamos o sócio recém-criado e injetamos contribTemp
      try{
        if(ctData && (window.socios||[]).length > lenAntes){
          // último cadastrado por matrícula recente — pega pelo nome+matrícula do form (já resetado),
          // então usamos a maior data de cadastro / último item adicionado
          const arr = window.socios;
          const novo = arr[arr.length-1];
          if(novo && isPropTipo(novo.tipoSocio||novo.tipo)){
            novo.contribTemp = ctData;
            try { await editarSocioNoServidor(novo); } catch(e){ console.warn('CT save fail', e); }
          }
        }
      }catch(e){ console.warn('CT pós-cadastro:', e); }
      limparCadastro();
      return r;
    };
    wrapped.__ctWrapped = true;
    window.salvarSocio = wrapped;
  }

  function wrapSalvarEdicao(){
    if(typeof window.salvarEdicao !== 'function' || window.salvarEdicao.__ctWrapped) return;
    const orig = window.salvarEdicao;
    const wrapped = async function(){
      try{
        const id = window.fichaEditId;
        const s  = (window.socios||[]).find(x=>String(x.id)===String(id));
        if(s && isPropTipo(s.tipoSocio||s.tipo) && document.getElementById('edit-ct-status')){
          s.contribTemp = lerForm('edit');
        }
      }catch(e){ console.warn('CT edição:', e); }
      return orig.apply(this, arguments);
    };
    wrapped.__ctWrapped = true;
    window.salvarEdicao = wrapped;
  }

  function wrapEditarFicha(){
    if(typeof window.editarFicha !== 'function' || window.editarFicha.__ctWrapped) return;
    const orig = window.editarFicha;
    const wrapped = function(id){
      const r = orig.apply(this, arguments);
      try{
        const s = (window.socios||[]).find(x=>String(x.id)===String(id));
        // o HTML do edit é montado de forma síncrona, mas garantimos com timeout
        setTimeout(()=>injetarEdicao(s), 30);
        setTimeout(()=>injetarEdicao(s), 250);
      }catch(e){ console.warn('CT injetar edicao:', e); }
      return r;
    };
    wrapped.__ctWrapped = true;
    window.editarFicha = wrapped;
  }

  // wrap onTipoChange para garantir que o bloco apareça quando o usuário troca p/ proprietário
  function wrapOnTipoChange(){
    if(typeof window.onTipoChange !== 'function' || window.onTipoChange.__ctWrapped) return;
    const orig = window.onTipoChange;
    const wrapped = function(){
      const r = orig.apply(this, arguments);
      try{
        if(document.getElementById('f-tipo')?.value === 'proprietario'){
          injetarCadastro();
        }
      }catch(e){}
      return r;
    };
    wrapped.__ctWrapped = true;
    window.onTipoChange = wrapped;
  }

  // ---------- exibição na FICHA (visualização) ----------
  function fichaViewHTML(s){
    if(!s || !isPropTipo(s.tipoSocio||s.tipo)) return '';
    const ct = getCT(s) || {};
    const st = ct.status || 'pendente';
    return `
      <div class="ct-view-injected" style="margin:14px 0;border-left:5px solid ${statusBadgeColor(st)};background:#fffbeb;padding:12px 14px;border-radius:6px">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <strong style="color:#78350f">💰 Contribuição Temporária (Conselho):</strong>
          <span style="background:${statusBadgeColor(st)};color:#fff;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:600">${statusLabel(st)}</span>
        </div>
        <div style="font-size:12.5px;color:#78350f;margin-top:8px;line-height:1.55">
          ${ct.dataAdesao ? `<div><strong>Adesão:</strong> ${ct.dataAdesao.split('-').reverse().join('/')}</div>`:''}
          ${ct.diaCobranca ? `<div><strong>Melhor dia:</strong> dia ${ct.diaCobranca} de cada mês</div>`:''}
          <div><strong>Valor:</strong> R$ ${(ct.valor!=null?ct.valor:VALOR_PADRAO).toString().replace('.',',')}</div>
          ${ct.formaPagamento ? `<div><strong>Forma:</strong> ${ct.formaPagamento}</div>`:''}
          ${ct.obs ? `<div style="margin-top:4px"><strong>Obs.:</strong> ${ct.obs.replace(/</g,'&lt;')}</div>`:''}
          ${ct.atualizadoEm ? `<div style="margin-top:6px;font-size:11px;color:#92400e">Atualizado em ${new Date(ct.atualizadoEm).toLocaleString('pt-BR')} por ${ct.atualizadoPor||'—'}</div>`:''}
        </div>
      </div>`;
  }

  function aplicarFichaView(s){
    const fv = document.getElementById('ficha-view');
    if(!fv) return;
    fv.querySelectorAll('.ct-view-injected').forEach(n=>n.remove());
    const html = fichaViewHTML(s);
    if(html) fv.insertAdjacentHTML('beforeend', html);
  }

  function wrapRenderFichaView(){
    if(typeof window.renderFichaView !== 'function' || window.renderFichaView.__ctWrapped) return;
    const orig = window.renderFichaView;
    const wrapped = function(s){
      const r = orig.apply(this, arguments);
      try { aplicarFichaView(s); } catch(e){ console.warn('CT ficha view:', e); }
      return r;
    };
    wrapped.__ctWrapped = true;
    window.renderFichaView = wrapped;
  }

  // ---------- card no DASHBOARD ----------
  function renderDashboardCard(){
    const cont = document.getElementById('dash-content');
    if(!cont) return;
    // remove versão antiga
    const old = document.getElementById('ct-dash-card'); if(old) old.remove();
    if(cont.style.display==='none') return;
    const props = (window.socios||[]).filter(s=>isPropTipo(s.tipoSocio||s.tipo));
    if(!props.length) return;
    const counts = {pagando:0, nao_pagando:0, pendente:0, isento:0};
    props.forEach(s=>{ const st=(getCT(s)||{}).status||'pendente'; counts[st]=(counts[st]||0)+1; });
    const total = props.length;
    const pct = n => total ? Math.round(n*100/total) : 0;
    const arrec = counts.pagando * VALOR_PADRAO;
    const naoPagandoSocios = props.filter(s=>((getCT(s)||{}).status||'pendente')==='nao_pagando');
    const pendentesSocios  = props.filter(s=>((getCT(s)||{}).status||'pendente')==='pendente');

    const linhaSocios = (arr, cor) => arr.slice(0,8).map(s=>
      `<span onclick="abrirFicha('${String(s.id).replace(/'/g,"\\'")}')" style="display:inline-block;background:${cor};color:#fff;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:600;margin:2px 3px;cursor:pointer" title="Abrir ficha">#${s.matricula||'—'} ${(s.nome||'').split(' ').slice(0,2).join(' ').replace(/</g,'&lt;')}</span>`
    ).join('') + (arr.length>8?`<span style="font-size:11px;color:#475569;margin-left:6px">+${arr.length-8} outros</span>`:'');

    const card = (label,n,cor,desc)=>`
      <div style="background:#fff;border:1px solid #e5e7eb;border-top:4px solid ${cor};border-radius:10px;padding:12px;text-align:center">
        <div style="font-size:26px;font-weight:800;color:${cor};line-height:1">${n}</div>
        <div style="font-size:11px;color:#475569;margin-top:4px;font-weight:600">${label}</div>
        <div style="font-size:10.5px;color:#64748b;margin-top:2px">${desc}</div>
      </div>`;

    const html = `
      <div id="ct-dash-card" style="margin:18px 0;background:linear-gradient(180deg,#fffbeb 0%,#fef3c7 100%);border:2px solid #f59e0b;border-radius:12px;padding:16px 18px">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px">
          <div>
            <h3 style="margin:0;color:#78350f;font-size:16px">💰 Contribuição Temporária — Conselho (Art. 15º)</h3>
            <div style="font-size:11.5px;color:#92400e;margin-top:2px">R$ ${VALOR_PADRAO},00/mês · ${PERIODO_MESES} meses · Início ${INICIO.split('-').reverse().join('/')} · Apenas Sócios Proprietários</div>
          </div>
          <div style="display:flex;gap:6px">
            <button type="button" onclick="abrirMapeamentoContribTemp()" style="background:#0f2a49;color:#fff;border:0;padding:7px 12px;border-radius:6px;cursor:pointer;font-weight:600;font-size:12px">Ver mapeamento</button>
            <button type="button" onclick="exportarMapeamentoContribTemp()" style="background:#10b981;color:#fff;border:0;padding:7px 12px;border-radius:6px;cursor:pointer;font-weight:600;font-size:12px">📄 CSV</button>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:12px">
          ${card('✅ Pagando', counts.pagando, '#059669', pct(counts.pagando)+'% dos proprietários')}
          ${card('❌ Não pagando', counts.nao_pagando, '#dc2626', pct(counts.nao_pagando)+'% dos proprietários')}
          ${card('⏳ Pendentes', counts.pendente, '#d97706', pct(counts.pendente)+'% dos proprietários')}
          ${card('➖ Isentos', counts.isento, '#6b7280', pct(counts.isento)+'% dos proprietários')}
          ${card('💵 Arrecadação/mês', 'R$ '+arrec.toLocaleString('pt-BR'), '#0f2a49', 'estimada com base em pagantes')}
        </div>
        ${naoPagandoSocios.length?`
          <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:8px 12px;border-radius:6px;margin-bottom:8px">
            <div style="font-size:12px;font-weight:700;color:#7f1d1d;margin-bottom:4px">❌ Não estão pagando (${naoPagandoSocios.length})</div>
            <div>${linhaSocios(naoPagandoSocios,'#dc2626')}</div>
          </div>`:''}
        ${pendentesSocios.length?`
          <div style="background:#fffbeb;border-left:4px solid #d97706;padding:8px 12px;border-radius:6px">
            <div style="font-size:12px;font-weight:700;color:#78350f;margin-bottom:4px">⏳ Pendentes de cadastro (${pendentesSocios.length})</div>
            <div>${linhaSocios(pendentesSocios,'#d97706')}</div>
          </div>`:''}
      </div>`;
    // injeta no topo do dash-content
    cont.insertAdjacentHTML('afterbegin', html);
  }

  function wrapRenderDashboard(){
    if(typeof window.renderDashboard !== 'function' || window.renderDashboard.__ctWrapped) return;
    const orig = window.renderDashboard;
    const wrapped = function(){
      const r = orig.apply(this, arguments);
      try { renderDashboardCard(); } catch(e){ console.warn('CT dash card:', e); }
      return r;
    };
    wrapped.__ctWrapped = true;
    window.renderDashboard = wrapped;
  }

  // ---------- MAPEAMENTO GERAL (modal com lista) ----------
  function abrirMapeamento(){
    const old = document.getElementById('ct-mapa-modal'); if(old) old.remove();
    const props = (window.socios||[]).filter(s=>isPropTipo(s.tipoSocio||s.tipo))
      .sort((a,b)=>Number(a.matricula||0)-Number(b.matricula||0));

    const counts = {pagando:0, nao_pagando:0, pendente:0, isento:0};
    props.forEach(s=>{ const st = (getCT(s)||{}).status || 'pendente'; counts[st] = (counts[st]||0)+1; });

    const linhas = props.map(s=>{
      const ct = getCT(s)||{}; const st = ct.status || 'pendente';
      const cor = statusBadgeColor(st);
      return `
        <tr style="border-bottom:1px solid #f1f5f9">
          <td style="padding:8px 10px;font-size:12.5px">#${s.matricula||'—'}</td>
          <td style="padding:8px 10px;font-size:12.5px;font-weight:600">${(s.nome||'').replace(/</g,'&lt;')}</td>
          <td style="padding:8px 10px"><span style="background:${cor};color:#fff;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600">${statusLabel(st)}</span></td>
          <td style="padding:8px 10px;font-size:12.5px">${ct.diaCobranca?('Dia '+ct.diaCobranca):'—'}</td>
          <td style="padding:8px 10px;font-size:12.5px">${ct.formaPagamento||'—'}</td>
          <td style="padding:8px 10px"><button type="button" onclick="document.getElementById('ct-mapa-modal').remove();abrirFicha('${String(s.id).replace(/'/g,"\\'")}')" style="background:#0f2a49;color:#fff;border:0;padding:5px 10px;border-radius:5px;cursor:pointer;font-size:11px">Abrir ficha</button></td>
        </tr>`;
    }).join('') || `<tr><td colspan="6" style="padding:20px;text-align:center;color:#64748b">Nenhum sócio proprietário cadastrado.</td></tr>`;

    const card = (label,n,cor)=>`<div style="background:#fff;border:1px solid #e5e7eb;border-top:4px solid ${cor};border-radius:8px;padding:10px;text-align:center"><div style="font-size:22px;font-weight:700;color:${cor}">${n}</div><div style="font-size:11px;color:#475569;margin-top:2px">${label}</div></div>`;

    const html = `
      <div id="ct-mapa-modal" style="position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px">
        <div style="background:#fff;border-radius:12px;max-width:900px;width:100%;max-height:92vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.3)">
          <div style="padding:16px 20px;background:linear-gradient(135deg,#92400e,#b45309);color:#fff;border-radius:12px 12px 0 0;display:flex;justify-content:space-between;align-items:center">
            <h3 style="margin:0;font-size:18px">💰 Mapeamento — Contribuição Temporária (Proprietários)</h3>
            <button onclick="document.getElementById('ct-mapa-modal').remove()" style="background:#dc2626;color:#fff;border:0;border-radius:6px;width:32px;height:32px;font-size:18px;cursor:pointer">×</button>
          </div>
          <div style="padding:18px 20px">
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">
              ${card('✅ Pagando', counts.pagando, '#059669')}
              ${card('❌ Não pagando', counts.nao_pagando, '#dc2626')}
              ${card('⏳ Pendentes', counts.pendente, '#d97706')}
              ${card('➖ Isentos', counts.isento, '#6b7280')}
            </div>
            <div style="overflow:auto;border:1px solid #e5e7eb;border-radius:8px">
              <table style="width:100%;border-collapse:collapse">
                <thead style="background:#f8fafc">
                  <tr>
                    <th style="padding:10px;text-align:left;font-size:12px;color:#475569">Matrícula</th>
                    <th style="padding:10px;text-align:left;font-size:12px;color:#475569">Nome</th>
                    <th style="padding:10px;text-align:left;font-size:12px;color:#475569">Situação</th>
                    <th style="padding:10px;text-align:left;font-size:12px;color:#475569">Dia cobrança</th>
                    <th style="padding:10px;text-align:left;font-size:12px;color:#475569">Forma</th>
                    <th style="padding:10px;text-align:left;font-size:12px;color:#475569">Ação</th>
                  </tr>
                </thead>
                <tbody>${linhas}</tbody>
              </table>
            </div>
            <div style="margin-top:14px;display:flex;justify-content:flex-end;gap:8px">
              <button type="button" onclick="window.exportarMapeamentoContribTemp&&window.exportarMapeamentoContribTemp()" style="background:#10b981;color:#fff;border:0;padding:8px 14px;border-radius:6px;cursor:pointer;font-weight:600;font-size:13px">📄 Exportar CSV</button>
              <button type="button" onclick="document.getElementById('ct-mapa-modal').remove()" style="background:#e5e7eb;color:#374151;border:0;padding:8px 14px;border-radius:6px;cursor:pointer;font-weight:600;font-size:13px">Fechar</button>
            </div>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
  }
  window.abrirMapeamentoContribTemp = abrirMapeamento;

  function exportarCSV(){
    const props = (window.socios||[]).filter(s=>isPropTipo(s.tipoSocio||s.tipo))
      .sort((a,b)=>Number(a.matricula||0)-Number(b.matricula||0));
    const rows = [['Matricula','Nome','CPF','Telefone','Situacao Contribuicao','Data Adesao','Dia Cobranca','Valor (R$)','Forma Pagamento','Observacao','Atualizado em','Atualizado por']];
    props.forEach(s=>{
      const ct = getCT(s)||{};
      rows.push([
        s.matricula||'', s.nome||'', s.cpf||'', s.telefone||'',
        statusLabel(ct.status||'pendente').replace(/^[^\w]+/,'').trim(),
        ct.dataAdesao||'', ct.diaCobranca||'', ct.valor!=null?ct.valor:VALOR_PADRAO,
        ct.formaPagamento||'', (ct.obs||'').replace(/[\r\n]+/g,' '),
        ct.atualizadoEm||'', ct.atualizadoPor||''
      ]);
    });
    const csv = rows.map(r=>r.map(v=>{
      const s = String(v==null?'':v); return /[;",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
    }).join(';')).join('\r\n');
    const blob = new Blob(['\ufeff'+csv], {type:'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'contribuicao_temporaria_proprietarios.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 1000);
  }
  window.exportarMapeamentoContribTemp = exportarCSV;

  // ---------- botão no banner do comunicado ----------
  function injetarBotaoNoBanner(){
    const banner = document.getElementById('comunicado-banner');
    if(!banner || banner.querySelector('.ct-mapa-btn')) return;
    const btn = document.createElement('button');
    btn.type='button';
    btn.className='ct-mapa-btn';
    btn.textContent='💰 Ver mapeamento';
    btn.style.cssText='background:#0f2a49;color:#fff;border:0;padding:6px 12px;border-radius:6px;cursor:pointer;font-weight:600;font-size:12.5px;margin-left:6px';
    btn.onclick = abrirMapeamento;
    // tenta colocar antes do botão "Ocultar"
    const acoes = banner.querySelector('.cb-actions') || banner.querySelector('div:last-child') || banner;
    acoes.insertBefore(btn, acoes.firstChild);
  }

  // ---------- bootstrap ----------
  function boot(){
    wrapSalvarSocio();
    wrapSalvarEdicao();
    wrapEditarFicha();
    wrapOnTipoChange();
    wrapRenderFichaView();
    wrapRenderDashboard();
    try{ if(document.getElementById('f-tipo')?.value === 'proprietario') injetarCadastro(); }catch(e){}
    // re-tenta wraps caso o app.js carregue depois
    let tries = 0;
    const t = setInterval(()=>{
      wrapRenderFichaView();
      wrapRenderDashboard();
      wrapSalvarSocio();
      wrapSalvarEdicao();
      wrapEditarFicha();
      wrapOnTipoChange();
      injetarBotaoNoBanner();
      // se já está no dashboard, força um re-render do card
      try{
        const dc = document.getElementById('dash-content');
        if(dc && dc.style.display!=='none' && !document.getElementById('ct-dash-card')) renderDashboardCard();
      }catch(e){}
      if(++tries > 30) clearInterval(t);
    }, 500);
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
