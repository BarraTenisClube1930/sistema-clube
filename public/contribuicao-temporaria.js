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
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button type="button" onclick="abrirDashboardContribTemp()" style="background:#7c3aed;color:#fff;border:0;padding:7px 12px;border-radius:6px;cursor:pointer;font-weight:600;font-size:12px">📊 Dashboard detalhado</button>
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
            <div style="margin-top:14px;display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap">
              <button type="button" onclick="document.getElementById('ct-mapa-modal').remove();abrirDashboardContribTemp()" style="background:#7c3aed;color:#fff;border:0;padding:8px 14px;border-radius:6px;cursor:pointer;font-weight:600;font-size:13px">📊 Dashboard detalhado</button>
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

  // ---------- DASHBOARD DETALHADO (gráficos SVG) ----------
  function donutSVG(parts, size){
    size = size||220;
    const cx=size/2, cy=size/2, r=size*0.38, rIn=size*0.24;
    const total = parts.reduce((a,p)=>a+p.value,0) || 1;
    let acc = 0;
    const segs = parts.filter(p=>p.value>0).map(p=>{
      const a0 = (acc/total)*Math.PI*2 - Math.PI/2;
      acc += p.value;
      const a1 = (acc/total)*Math.PI*2 - Math.PI/2;
      const large = (a1-a0) > Math.PI ? 1 : 0;
      const x0 = cx + r*Math.cos(a0), y0 = cy + r*Math.sin(a0);
      const x1 = cx + r*Math.cos(a1), y1 = cy + r*Math.sin(a1);
      const xi1 = cx + rIn*Math.cos(a1), yi1 = cy + rIn*Math.sin(a1);
      const xi0 = cx + rIn*Math.cos(a0), yi0 = cy + rIn*Math.sin(a0);
      return `<path d="M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} L ${xi1} ${yi1} A ${rIn} ${rIn} 0 ${large} 0 ${xi0} ${yi0} Z" fill="${p.color}"><title>${p.label}: ${p.value}</title></path>`;
    }).join('');
    return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="display:block">
      ${segs || `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#e5e7eb"/><circle cx="${cx}" cy="${cy}" r="${rIn}" fill="#fff"/>`}
      <text x="${cx}" y="${cy-4}" text-anchor="middle" font-size="20" font-weight="800" fill="#0f2a49">${total}</text>
      <text x="${cx}" y="${cy+14}" text-anchor="middle" font-size="10" fill="#64748b">proprietários</text>
    </svg>`;
  }

  function barsSVG(items, opts){
    opts = opts||{};
    const w = opts.width||520, barH = 22, gap = 8, padL = opts.padL||110, padR = 50, padT = 8;
    const max = Math.max(1, ...items.map(i=>i.value));
    const innerW = w - padL - padR;
    const h = padT + items.length*(barH+gap) + 8;
    const rows = items.map((it,i)=>{
      const y = padT + i*(barH+gap);
      const bw = max ? Math.round((it.value/max)*innerW) : 0;
      return `
        <text x="${padL-8}" y="${y+barH/2+4}" text-anchor="end" font-size="11" fill="#334155">${it.label}</text>
        <rect x="${padL}" y="${y}" width="${bw||1}" height="${barH}" rx="4" fill="${it.color||'#7c3aed'}"/>
        <text x="${padL+bw+6}" y="${y+barH/2+4}" font-size="11" font-weight="700" fill="#0f2a49">${it.value}</text>`;
    }).join('');
    return `<svg viewBox="0 0 ${w} ${h}" width="100%" style="max-width:${w}px;display:block">${rows}</svg>`;
  }

  function abrirDashboard(){
    const old = document.getElementById('ct-dashboard-modal'); if(old) old.remove();
    const props = (window.socios||[]).filter(s=>isPropTipo(s.tipoSocio||s.tipo));
    const total = props.length;
    const counts = {pagando:0, nao_pagando:0, pendente:0, isento:0};
    const formaCount = {boleto:0, pix:0, debito:0, dinheiro:0, outro:0, indef:0};
    const diaCount = {}; for(let d=1; d<=28; d++) diaCount[d]=0;
    let arrecMes = 0, valorMedio = 0, totalValores = 0, somaPagantes = 0;

    props.forEach(s=>{
      const ct = getCT(s)||{};
      const st = ct.status || 'pendente';
      counts[st] = (counts[st]||0)+1;
      const v = (ct.valor!=null && ct.valor!=='') ? Number(ct.valor) : VALOR_PADRAO;
      if(st==='pagando'){ arrecMes += v; somaPagantes++; totalValores += v; }
      const fp = ct.formaPagamento || 'indef';
      if(formaCount[fp]==null) formaCount[fp]=0;
      formaCount[fp]++;
      if(ct.diaCobranca && diaCount[ct.diaCobranca]!=null) diaCount[ct.diaCobranca]++;
    });
    valorMedio = somaPagantes ? (totalValores/somaPagantes) : VALOR_PADRAO;

    // Período
    const dInicio = new Date(INICIO+'T00:00:00');
    const dFim = new Date(dInicio); dFim.setMonth(dFim.getMonth()+PERIODO_MESES);
    const hoje = new Date();
    const mesesDecorridos = Math.max(0, Math.min(PERIODO_MESES,
      (hoje.getFullYear()-dInicio.getFullYear())*12 + (hoje.getMonth()-dInicio.getMonth()) + (hoje.getDate()>=dInicio.getDate()?1:0)
    ));
    const mesesRestantes = Math.max(0, PERIODO_MESES - mesesDecorridos);
    const pctPeriodo = Math.round(mesesDecorridos*100/PERIODO_MESES);

    const arrecAcumulada = arrecMes * mesesDecorridos;
    const arrecProjetada = arrecMes * PERIODO_MESES;
    const arrecRestante = arrecMes * mesesRestantes;
    const potencialTotal = total * VALOR_PADRAO * PERIODO_MESES;
    const eficiencia = potencialTotal ? Math.round((arrecProjetada/potencialTotal)*100) : 0;

    const fmt = n => 'R$ '+Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});

    const donutData = [
      {label:'Pagando',     value:counts.pagando,     color:'#059669'},
      {label:'Não pagando', value:counts.nao_pagando, color:'#dc2626'},
      {label:'Pendentes',   value:counts.pendente,    color:'#d97706'},
      {label:'Isentos',     value:counts.isento,      color:'#6b7280'}
    ];
    const legenda = donutData.map(d=>`
      <div style="display:flex;align-items:center;gap:8px;font-size:12.5px;padding:4px 0">
        <span style="width:14px;height:14px;border-radius:3px;background:${d.color};display:inline-block"></span>
        <span style="flex:1;color:#334155">${d.label}</span>
        <strong style="color:#0f2a49">${d.value}</strong>
        <span style="color:#64748b;min-width:42px;text-align:right">${total?Math.round(d.value*100/total):0}%</span>
      </div>`).join('');

    const formaLabels = {boleto:'Boleto', pix:'PIX', debito:'Débito automático', dinheiro:'Dinheiro/Sec.', outro:'Outro', indef:'Não definida'};
    const formaCores  = {boleto:'#0ea5e9', pix:'#10b981', debito:'#7c3aed', dinheiro:'#f59e0b', outro:'#64748b', indef:'#94a3b8'};
    const formaItens = Object.keys(formaCount).filter(k=>formaCount[k]>0)
      .map(k=>({label:formaLabels[k]||k, value:formaCount[k], color:formaCores[k]||'#7c3aed'}))
      .sort((a,b)=>b.value-a.value);

    const diaItens = Object.keys(diaCount).filter(d=>diaCount[d]>0)
      .map(d=>({label:'Dia '+d, value:diaCount[d], color:'#0f2a49'}))
      .sort((a,b)=>b.value-a.value).slice(0,15);

    const card = (label,val,cor,sub)=>`
      <div style="background:#fff;border:1px solid #e5e7eb;border-top:4px solid ${cor};border-radius:10px;padding:12px">
        <div style="font-size:11px;color:#475569;font-weight:600;text-transform:uppercase;letter-spacing:.3px">${label}</div>
        <div style="font-size:22px;font-weight:800;color:${cor};margin-top:4px;line-height:1.1">${val}</div>
        ${sub?`<div style="font-size:11px;color:#64748b;margin-top:3px">${sub}</div>`:''}
      </div>`;

    const naoPagSocios = props.filter(s=>((getCT(s)||{}).status||'pendente')==='nao_pagando')
      .sort((a,b)=>(a.nome||'').localeCompare(b.nome||''));
    const naoPagLista = naoPagSocios.length ? `
      <div style="margin-top:14px;background:#fff;border:1px solid #fecaca;border-radius:10px;overflow:hidden">
        <div style="padding:10px 14px;background:#fef2f2;border-bottom:1px solid #fecaca;font-weight:700;color:#7f1d1d;font-size:13px">
          ❌ Sócios não pagantes — risco de inadimplência (${naoPagSocios.length})
        </div>
        <div style="max-height:220px;overflow:auto">
          <table style="width:100%;border-collapse:collapse">
            <thead style="background:#fafafa;position:sticky;top:0">
              <tr>
                <th style="padding:8px 12px;text-align:left;font-size:11px;color:#475569">Matrícula</th>
                <th style="padding:8px 12px;text-align:left;font-size:11px;color:#475569">Nome</th>
                <th style="padding:8px 12px;text-align:left;font-size:11px;color:#475569">Telefone</th>
                <th style="padding:8px 12px;text-align:left;font-size:11px;color:#475569">Ação</th>
              </tr>
            </thead>
            <tbody>
              ${naoPagSocios.map(s=>`
                <tr style="border-top:1px solid #f1f5f9">
                  <td style="padding:7px 12px;font-size:12px">#${s.matricula||'—'}</td>
                  <td style="padding:7px 12px;font-size:12px;font-weight:600">${(s.nome||'').replace(/</g,'&lt;')}</td>
                  <td style="padding:7px 12px;font-size:12px">${s.telefone||'—'}</td>
                  <td style="padding:7px 12px"><button type="button" onclick="document.getElementById('ct-dashboard-modal').remove();abrirFicha('${String(s.id).replace(/'/g,"\\'")}')" style="background:#dc2626;color:#fff;border:0;padding:4px 10px;border-radius:5px;cursor:pointer;font-size:11px">Ficha</button></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>` : '';

    const html = `
      <div id="ct-dashboard-modal" style="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10000;display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow:auto">
        <div style="background:#f8fafc;border-radius:14px;max-width:1100px;width:100%;box-shadow:0 25px 70px rgba(0,0,0,.4);margin:auto">
          <div style="padding:18px 22px;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;border-radius:14px 14px 0 0;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
            <div>
              <h3 style="margin:0;font-size:19px;display:flex;align-items:center;gap:8px">📊 Dashboard — Contribuição Temporária</h3>
              <div style="font-size:11.5px;opacity:.92;margin-top:3px">Conselho Deliberativo · Art. 15º · R$ ${VALOR_PADRAO},00 × ${PERIODO_MESES} meses · Início ${INICIO.split('-').reverse().join('/')}</div>
            </div>
            <button onclick="document.getElementById('ct-dashboard-modal').remove()" style="background:rgba(255,255,255,.18);color:#fff;border:0;border-radius:8px;width:34px;height:34px;font-size:20px;cursor:pointer">×</button>
          </div>

          <div style="padding:20px 22px">
            <!-- KPIs -->
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px">
              ${card('Total proprietários', total, '#0f2a49', '')}
              ${card('Arrecadação atual/mês', fmt(arrecMes), '#059669', `${counts.pagando} pagantes`)}
              ${card('Acumulado até hoje', fmt(arrecAcumulada), '#10b981', `${mesesDecorridos} de ${PERIODO_MESES} meses`)}
              ${card('A arrecadar (restante)', fmt(arrecRestante), '#0ea5e9', `${mesesRestantes} meses restantes`)}
              ${card('Projeção total (24m)', fmt(arrecProjetada), '#7c3aed', `Eficiência: ${eficiencia}%`)}
              ${card('Ticket médio', fmt(valorMedio), '#f59e0b', 'entre pagantes')}
            </div>

            <!-- Progresso do período -->
            <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;margin-top:14px">
              <div style="display:flex;justify-content:space-between;font-size:12.5px;font-weight:600;color:#334155;margin-bottom:6px">
                <span>📅 Progresso do período (${PERIODO_MESES} meses)</span>
                <span>${mesesDecorridos}/${PERIODO_MESES} meses · ${pctPeriodo}%</span>
              </div>
              <div style="height:14px;background:#e5e7eb;border-radius:999px;overflow:hidden">
                <div style="height:100%;width:${pctPeriodo}%;background:linear-gradient(90deg,#7c3aed,#a78bfa);transition:width .4s"></div>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:10.5px;color:#64748b;margin-top:5px">
                <span>Início: ${dInicio.toLocaleDateString('pt-BR')}</span>
                <span>Término previsto: ${dFim.toLocaleDateString('pt-BR')}</span>
              </div>
            </div>

            <!-- Gráficos: distribuição + formas -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px">
              <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px">
                <h4 style="margin:0 0 10px;font-size:13px;color:#0f2a49">Distribuição por situação</h4>
                <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">
                  <div>${donutSVG(donutData, 200)}</div>
                  <div style="flex:1;min-width:180px">${legenda}</div>
                </div>
              </div>
              <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px">
                <h4 style="margin:0 0 10px;font-size:13px;color:#0f2a49">Forma de pagamento</h4>
                ${formaItens.length ? barsSVG(formaItens,{padL:140}) : '<div style="font-size:12px;color:#64748b;padding:20px;text-align:center">Sem dados</div>'}
              </div>
            </div>

            <!-- Dias de cobrança -->
            <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px;margin-top:14px">
              <h4 style="margin:0 0 10px;font-size:13px;color:#0f2a49">Melhores dias de cobrança (top 15)</h4>
              ${diaItens.length ? barsSVG(diaItens,{padL:70}) : '<div style="font-size:12px;color:#64748b;padding:20px;text-align:center">Nenhum dia de cobrança definido ainda</div>'}
            </div>

            <!-- Inadimplência -->
            ${naoPagLista}

            <!-- Rodapé -->
            <div style="margin-top:18px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;padding-top:12px;border-top:1px solid #e5e7eb">
              <div style="font-size:11px;color:#64748b">Relatório gerado em ${new Date().toLocaleString('pt-BR')}</div>
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button type="button" onclick="document.getElementById('ct-dashboard-modal').remove();abrirMapeamentoContribTemp()" style="background:#0f2a49;color:#fff;border:0;padding:8px 14px;border-radius:6px;cursor:pointer;font-weight:600;font-size:13px">📋 Ver lista completa</button>
                <button type="button" onclick="window.exportarMapeamentoContribTemp&&window.exportarMapeamentoContribTemp()" style="background:#10b981;color:#fff;border:0;padding:8px 14px;border-radius:6px;cursor:pointer;font-weight:600;font-size:13px">📄 Exportar CSV</button>
                <button type="button" onclick="window.print()" style="background:#475569;color:#fff;border:0;padding:8px 14px;border-radius:6px;cursor:pointer;font-weight:600;font-size:13px">🖨️ Imprimir</button>
                <button type="button" onclick="document.getElementById('ct-dashboard-modal').remove()" style="background:#e5e7eb;color:#374151;border:0;padding:8px 14px;border-radius:6px;cursor:pointer;font-weight:600;font-size:13px">Fechar</button>
              </div>
            </div>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
  }
  window.abrirDashboardContribTemp = abrirDashboard;

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
