/* =========================================================================
 * BTC — Módulo de Extensão de Auditoria (Fases 1, 3, 4, 5, 6 do plano)
 * Tudo neste arquivo é aditivo: lê o array global `socios` já carregado
 * por app.js. Não substitui nenhuma função existente — só agrega novas.
 *
 * IMPORTANTE: o controle de papel (admin/operador/visitante) deste app é
 * aplicado no cliente. É um controle organizacional, não criptográfico.
 * O backend (server.js) deve ter a palavra final em qualquer operação
 * sensível antes de uma futura exposição pública.
 * ========================================================================= */
(function(){
  'use strict';

  // ---------- helpers genéricos ----------
  function $(id){ return document.getElementById(id); }
  function _esc(s){ return (s==null?'':String(s)).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function _hojeISO(){ return new Date().toISOString().slice(0,10); }
  function _norm(s){
    return (s||'').toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  }
  function _safeAudit(acao, det){ try { registrarAuditoria(acao, det); } catch(e){} }

  // ---------- 1.1 Score de risco ----------
  // Pesos: ver plano. Score 0 = limpo, 100 = altamente suspeito.
  function calcularScoreRisco(s){
    let score = 0;
    const motivos = [];

    // CPF inválido / ausente
    const cpfNum = (s.cpf||'').replace(/\D/g,'');
    if (!cpfNum) { score += 12; motivos.push('Sem CPF'); }
    else if (typeof validarCPF === 'function' && !validarCPF(s.cpf)) {
      score += 18; motivos.push('CPF inválido');
    }

    // Forma de aquisição sem comprovação
    const o = (s.origem||'').toLowerCase();
    if (o === 'adquirido_clube') { score += 18; motivos.push('Adquirido do clube sem recibo'); }
    if (o === 'heranca' && !s.docHeranca) { score += 10; motivos.push('Herança sem documento'); }

    // Valor zerado em compra
    if (o === 'compra' && (!s.valorCompra || Number(s.valorCompra)===0)) {
      score += 12; motivos.push('Compra com valor não informado');
    }

    // Datas inconsistentes
    const dn = s.dataNasc, dc = s.dataCadastro;
    if (dn && dc && new Date(dn) > new Date(dc)) {
      score += 8; motivos.push('Data de nascimento posterior ao cadastro');
    }

    // Dependentes irregulares (pesa muito — núcleo do sistema)
    if (Array.isArray(s.dependentes) && typeof avaliarDependente === 'function') {
      let irr = 0, pend = 0;
      s.dependentes.forEach(d => {
        const av = avaliarDependente(d, s);
        if (av.status === 'irregular') irr++;
        else if (av.status === 'pendente') pend++;
      });
      if (irr) { score += Math.min(40, irr*15); motivos.push(`${irr} dependente(s) irregular(es)`); }
      if (pend) { score += Math.min(15, pend*5); motivos.push(`${pend} dependente(s) pendente(s)`); }
    }

    // Duplicidade detectada (alimentado depois)
    if (s.__duplicado) { score += 20; motivos.push('Possível duplicidade'); }

    if (score > 100) score = 100;
    return { score, motivos };
  }

  function scoreFaixa(n){
    if (n <= 25) return { cor:'#16a34a', bg:'#dcfce7', label:'Baixo' };
    if (n <= 60) return { cor:'#ca8a04', bg:'#fef9c3', label:'Médio' };
    return { cor:'#dc2626', bg:'#fee2e2', label:'Alto' };
  }

  function scoreBadgeHTML(s){
    const r = calcularScoreRisco(s);
    const f = scoreFaixa(r.score);
    return `<span class="risco-badge" style="background:${f.bg};color:${f.cor}" title="${_esc(r.motivos.join(' · ')||'Sem alertas')}">Risco ${r.score} · ${f.label}</span>`;
  }

  // ---------- 1.2 Duplicidade ----------
  function detectarDuplicidades(){
    const grupos = {}; // chave -> [socios]
    const add = (k, s) => { if(!k) return; (grupos[k] = grupos[k] || []).push(s); };
    socios.forEach(s => {
      const cpf = (s.cpf||'').replace(/\D/g,'');
      if (cpf.length === 11) add('cpf:'+cpf, s);
      const nm = _norm(s.nome);
      if (nm && s.dataNasc) add('nm-dn:'+nm+'|'+s.dataNasc, s);
      const tel = (s.tel||s.telefone||'').replace(/\D/g,'');
      if (nm && tel.length>=10) add('nm-tel:'+nm+'|'+tel, s);
    });
    // só grupos com 2+
    const dups = Object.entries(grupos)
      .filter(([_,arr]) => arr.length > 1)
      .map(([k,arr]) => ({ chave:k, socios:[...new Set(arr)] }))
      .filter(g => g.socios.length>1);

    // marca os sócios para o score
    socios.forEach(s => { s.__duplicado = false; });
    const marcados = new Set();
    dups.forEach(g => g.socios.forEach(s => { s.__duplicado = true; marcados.add(s.id); }));
    return dups;
  }

  // ---------- 1.3 Lotes suspeitos ----------
  function detectarLotesSuspeitos(janelaDias=7, minimo=10){
    const porPres = {};
    socios.forEach(s => {
      const p = s.presidente || '—';
      const k = (typeof normPresidenteKey==='function' ? normPresidenteKey(p) : _norm(p));
      const dc = s.dataCadastro || s.dataAdmissao;
      if (!dc) return;
      (porPres[k] = porPres[k] || []).push({ data: new Date(dc), s, presidente: p });
    });
    const lotes = [];
    Object.entries(porPres).forEach(([k, arr]) => {
      arr.sort((a,b)=> a.data - b.data);
      let i = 0;
      while (i < arr.length) {
        let j = i;
        while (j+1 < arr.length && (arr[j+1].data - arr[i].data) <= janelaDias*86400000) j++;
        const tamanho = j - i + 1;
        if (tamanho >= minimo) {
          lotes.push({
            presidente: arr[i].presidente,
            inicio: arr[i].data.toISOString().slice(0,10),
            fim: arr[j].data.toISOString().slice(0,10),
            quantidade: tamanho,
            socios: arr.slice(i, j+1).map(x=>x.s)
          });
          i = j + 1;
        } else i++;
      }
    });
    return lotes.sort((a,b)=> b.quantidade - a.quantidade);
  }

  // ---------- 1.4 Linha do tempo do título ----------
  function linhaDoTempo(s){
    const eventos = [];
    if (s.dataCadastro) eventos.push({ data: s.dataCadastro, tipo:'Cadastro', det:'Sócio cadastrado' });
    if (s.dataAcordo && s.dataAcordo !== s.dataCadastro) eventos.push({ data: s.dataAcordo, tipo:'Acordo', det:'Data do acordo / admissão' });
    (s.transferencias||[]).forEach(t => eventos.push({
      data: t.data, tipo:'Transferência',
      det:`${(t.tipo||'').toUpperCase()} — cedente: ${t.cedente||'—'}`
    }));
    eventos.sort((a,b)=> new Date(a.data) - new Date(b.data));
    // gaps > 5 anos
    for (let i=1; i<eventos.length; i++){
      const g = (new Date(eventos[i].data) - new Date(eventos[i-1].data)) / (365.25*86400000);
      if (g > 5) eventos[i].alerta = `Gap de ${Math.round(g)} anos`;
    }
    return eventos;
  }

  // ---------- 1.5 Valores atípicos ----------
  function valoresAtipicos(){
    const compras = socios.filter(s => (s.origem||'')==='compra' && Number(s.valorCompra)>0);
    if (!compras.length) return [];
    // mediana por década
    const porDec = {};
    compras.forEach(s => {
      const ano = new Date(s.dataCadastro||s.dataAdmissao||0).getFullYear();
      const dec = Math.floor(ano/10)*10;
      (porDec[dec] = porDec[dec] || []).push(Number(s.valorCompra));
    });
    const medianas = {};
    Object.entries(porDec).forEach(([d, arr])=>{
      arr.sort((a,b)=>a-b);
      medianas[d] = arr[Math.floor(arr.length/2)];
    });
    const result = [];
    socios.forEach(s => {
      const o = (s.origem||'').toLowerCase();
      const motivos = [];
      if ((o==='compra' || o==='adquirido_clube') && (!s.valorCompra || Number(s.valorCompra)===0))
        motivos.push('Compra/aquisição sem valor');
      if (o==='heranca' && !s.docHeranca) motivos.push('Herança sem documento');
      if (o==='compra' && Number(s.valorCompra)>0){
        const ano = new Date(s.dataCadastro||s.dataAdmissao||0).getFullYear();
        const dec = Math.floor(ano/10)*10;
        const med = medianas[dec];
        if (med && Number(s.valorCompra) < med*0.3)
          motivos.push(`Valor ${s.valorCompra} muito abaixo da mediana ${med} (década ${dec})`);
      }
      if (motivos.length) result.push({ s, motivos });
    });
    return result;
  }

  // ---------- 3.1/3.2 Normalização ampliada / Limpeza de dados ----------
  function divergenciasCampo(getter){
    const grupos = {};
    socios.forEach(s => {
      const v = (getter(s)||'').toString().trim();
      if (!v) return;
      const k = _norm(v);
      if (!k) return;
      grupos[k] = grupos[k] || { variantes: {}, total: 0, canonico: v };
      grupos[k].variantes[v] = (grupos[k].variantes[v]||0) + 1;
      grupos[k].total++;
      // canonico = grafia mais frequente
      if (grupos[k].variantes[v] > (grupos[k].variantes[grupos[k].canonico]||0))
        grupos[k].canonico = v;
    });
    return Object.values(grupos).filter(g => Object.keys(g.variantes).length > 1);
  }

  function aplicarUnificacaoCampo(campo, canonico){
    const k = _norm(canonico);
    let n = 0;
    socios.forEach(s => {
      const v = (s[campo]||'').toString().trim();
      if (v && _norm(v) === k && v !== canonico) {
        s[campo] = canonico; n++;
      }
    });
    if (n>0) {
      try { saveData(); } catch(e){}
      _safeAudit('LIMPEZA_DADOS', `Campo ${campo} unificado para "${canonico}" em ${n} sócio(s)`);
    }
    renderLimpezaDados();
  }
  window.aplicarUnificacaoCampo = aplicarUnificacaoCampo;

  function renderLimpezaDados(){
    const host = $('limpeza-out'); if (!host) return;
    const campos = [
      { campo:'categoria', label:'Categoria' },
      { campo:'bairro',    label:'Bairro'    },
      { campo:'cidade',    label:'Cidade'    },
      { campo:'origem',    label:'Forma de Aquisição' }
    ];
    let html = '';
    campos.forEach(({campo, label}) => {
      const div = divergenciasCampo(s => s[campo]);
      html += `<div class="section"><div class="section-title">${label}</div>`;
      if (!div.length) html += `<div class="leitura" style="color:#16a34a">Sem divergências detectadas.</div>`;
      else html += div.map(g => {
        const variantes = Object.entries(g.variantes).sort((a,b)=>b[1]-a[1]);
        return `<div class="limpeza-row">
          <div class="limpeza-variantes">${variantes.map(([v,n]) => `<span class="chip${v===g.canonico?' chip-canon':''}">${_esc(v)} <em>×${n}</em></span>`).join(' ')}</div>
          <button class="btn-sm" onclick="aplicarUnificacaoCampo('${_esc(campo)}','${_esc(g.canonico).replace(/'/g,"\\'")}')">Unificar como "${_esc(g.canonico)}"</button>
        </div>`;
      }).join('');
      html += `</div>`;
    });
    // Sócios — apenas detecção (não altera nome automaticamente)
    const dupsNome = divergenciasCampo(s => s.nome).slice(0, 30);
    html += `<div class="section"><div class="section-title">Nomes de Sócios — possíveis grafias divergentes</div>`;
    html += dupsNome.length
      ? `<div class="leitura">Mostrando até 30 grupos. Verifique manualmente se são a mesma pessoa antes de unificar.</div>` +
        dupsNome.map(g => `<div class="limpeza-row"><div>${Object.keys(g.variantes).map(v=>`<span class="chip">${_esc(v)}</span>`).join(' ')}</div></div>`).join('')
      : `<div class="leitura" style="color:#16a34a">Sem grafias divergentes detectadas.</div>`;
    html += `</div>`;
    host.innerHTML = html;
  }

  // ---------- Painel Auditoria+ render ----------
  function renderAuditoriaPlus(){
    const wrap = $('audit-plus-content'); if (!wrap) return;
    detectarDuplicidades(); // marca __duplicado para o score

    // Top 10 sócios mais problemáticos
    const ranked = socios.map(s => ({ s, ...calcularScoreRisco(s) }))
      .filter(x => x.score > 0)
      .sort((a,b) => b.score - a.score)
      .slice(0, 10);

    const top10 = `<div class="section"><div class="section-title">Top 10 — Sócios mais problemáticos</div>` + (
      ranked.length
        ? `<table class="ap-table"><thead><tr><th>#</th><th>Nome</th><th>Mat.</th><th>Score</th><th>Motivos</th><th></th></tr></thead><tbody>${
          ranked.map((r,i) => {
            const f = scoreFaixa(r.score);
            return `<tr><td>${i+1}</td><td>${_esc(r.s.nome||'—')}</td><td>${_esc(r.s.matricula||'')}</td>
              <td><span class="risco-badge" style="background:${f.bg};color:${f.cor}">${r.score}</span></td>
              <td style="font-size:12px">${_esc(r.motivos.join(' · '))}</td>
              <td><button class="btn-sm" onclick="abrirFicha('${_esc(String(r.s.id))}')">Ficha</button></td></tr>`;
          }).join('')
        }</tbody></table>`
        : `<div class="empty">Nenhum sócio com alertas de risco.</div>`
    ) + `</div>`;

    // Duplicidades
    const dups = detectarDuplicidades();
    const dupHtml = `<div class="section"><div class="section-title">🧬 Possíveis Duplicidades (${dups.length})</div>` + (
      dups.length
        ? dups.slice(0, 50).map(g => {
          const tipoChave = g.chave.split(':')[0];
          const lblChave = { cpf:'mesmo CPF','nm-dn':'mesmo nome + nascimento','nm-tel':'mesmo nome + telefone' }[tipoChave] || g.chave;
          return `<div class="dup-group">
            <div class="dup-chave">Critério: <strong>${lblChave}</strong></div>
            <div class="dup-cards">${g.socios.map(s => `
              <div class="dup-card">
                <div><strong>${_esc(s.nome||'—')}</strong> · #${_esc(s.matricula||'')}</div>
                <div class="leitura">CPF: ${_esc(s.cpf||'—')} · Nasc: ${_esc(s.dataNasc||'—')}</div>
                <div class="leitura">Pres.: ${_esc(s.presidente||'—')}</div>
                <button class="btn-sm" onclick="abrirFicha('${_esc(String(s.id))}')">Ficha</button>
              </div>`).join('')}</div>
          </div>`;
        }).join('')
        : `<div class="leitura" style="color:#16a34a">Nenhuma duplicidade detectada.</div>`
    ) + `</div>`;

    // Lotes suspeitos
    const lotes = detectarLotesSuspeitos();
    const lotesHtml = `<div class="section"><div class="section-title">📦 Lotes suspeitos de cadastro (≥10 sócios em 7 dias)</div>` + (
      lotes.length
        ? `<table class="ap-table"><thead><tr><th>Presidente</th><th>Período</th><th>Qtd</th><th></th></tr></thead><tbody>${
          lotes.map((l,i) => `<tr><td>${_esc(l.presidente)}</td><td>${l.inicio} → ${l.fim}</td><td><strong>${l.quantidade}</strong></td>
            <td><button class="btn-sm" onclick="window._verLote(${i})">Ver sócios</button></td></tr>`).join('')
        }</tbody></table><div id="lote-detail" style="margin-top:10px"></div>`
        : `<div class="leitura" style="color:#16a34a">Nenhum lote suspeito detectado.</div>`
    ) + `</div>`;
    window._lotesCache = lotes;
    window._verLote = function(i){
      const l = window._lotesCache[i]; if(!l) return;
      $('lote-detail').innerHTML = `<div class="dup-cards">${l.socios.map(s=>`
        <div class="dup-card"><strong>${_esc(s.nome||'—')}</strong> · #${_esc(s.matricula||'')}<br>
        <span class="leitura">${_esc(s.dataCadastro||'')}</span><br>
        <button class="btn-sm" onclick="abrirFicha('${_esc(String(s.id))}')">Ficha</button></div>`).join('')}</div>`;
    };

    // Valores atípicos
    const at = valoresAtipicos();
    const atHtml = `<div class="section"><div class="section-title">💰 Valores atípicos / sem comprovação</div>` + (
      at.length
        ? `<table class="ap-table"><thead><tr><th>Nome</th><th>Mat.</th><th>Origem</th><th>Valor</th><th>Motivos</th><th></th></tr></thead><tbody>${
          at.slice(0,100).map(({s,motivos}) => `<tr>
            <td>${_esc(s.nome||'—')}</td><td>${_esc(s.matricula||'')}</td>
            <td>${typeof origemLabel==='function'?origemLabel(s.origem):_esc(s.origem||'')}</td>
            <td>${s.valorCompra?'R$ '+s.valorCompra:'—'}</td>
            <td style="font-size:12px">${_esc(motivos.join(' · '))}</td>
            <td><button class="btn-sm" onclick="abrirFicha('${_esc(String(s.id))}')">Ficha</button></td></tr>`).join('')
        }</tbody></table>`
        : `<div class="leitura" style="color:#16a34a">Nenhum valor atípico detectado.</div>`
    ) + `</div>`;

    // Limpeza de Dados
    const limpHtml = `<div class="section-title" style="margin-top:18px">🧹 Limpeza de Dados</div><div id="limpeza-out"></div>`;

    wrap.innerHTML = top10 + dupHtml + lotesHtml + atHtml + limpHtml;
    renderLimpezaDados();
  }
  window.renderAuditoriaPlus = renderAuditoriaPlus;

  // ---------- Sub-aba navigation dentro de Auditoria+ ----------
  function showAuditPlusPane(name){
    document.querySelectorAll('#tab-audit-plus .ap-pane').forEach(p => p.style.display='none');
    document.querySelectorAll('#tab-audit-plus .ap-subtab').forEach(b => b.classList.toggle('active', b.dataset.pane===name));
    const el = $('ap-pane-'+name); if (el) el.style.display='block';
    if (name==='auditoria') renderAuditoriaPlus();
    if (name==='timeline') renderTimelineSelect();
    if (name==='importar') renderImportar();
  }
  window.showAuditPlusPane = showAuditPlusPane;

  // ---------- 1.4 Linha do Tempo (UI) ----------
  function renderTimelineSelect(){
    const sel = $('tl-socio'); if (!sel) return;
    sel.innerHTML = '<option value="">— Selecione um sócio —</option>' +
      [...socios].sort((a,b)=>(a.nome||'').localeCompare(b.nome||''))
      .map(s => `<option value="${_esc(String(s.id))}">${_esc(s.nome||'?')} · #${_esc(s.matricula||'')}</option>`).join('');
    $('tl-out').innerHTML = '';
  }
  window.renderTimelineSocio = function(){
    const id = $('tl-socio').value;
    const s = socios.find(x => String(x.id)===String(id));
    if (!s) { $('tl-out').innerHTML=''; return; }
    const eventos = linhaDoTempo(s);
    if (!eventos.length){ $('tl-out').innerHTML='<div class="empty">Sem eventos registrados.</div>'; return; }
    $('tl-out').innerHTML = `<div class="risco-bar">${scoreBadgeHTML(s)}</div>
      <ol class="timeline">${eventos.map(e => `<li>
        <div class="tl-data">${_esc(e.data)}</div>
        <div class="tl-tipo">${_esc(e.tipo)}</div>
        <div class="tl-det">${_esc(e.det)}</div>
        ${e.alerta?`<div class="tl-alerta">⚠ ${_esc(e.alerta)}</div>`:''}
      </li>`).join('')}</ol>`;
  };

  // ---------- 3.4 Importação CSV ----------
  let _impParsed = null;
  function renderImportar(){
    const out = $('imp-out'); if(!out) return;
    out.innerHTML = `<div class="leitura">Selecione um CSV (separador <code>,</code> ou <code>;</code>) com cabeçalho. Colunas reconhecidas: matricula, nome, cpf, dataNasc, sexo, tel, email, bairro, cidade, presidente, dataCadastro, origem, valorCompra, categoria, tipoSocio, situacao.</div>
      <input type="file" id="imp-file" accept=".csv,text/csv" style="margin:12px 0"/>
      <div id="imp-preview"></div>`;
    $('imp-file').addEventListener('change', _onImpFile);
  }
  function _parseCSV(text){
    const sep = (text.split('\n')[0].split(';').length > text.split('\n')[0].split(',').length) ? ';' : ',';
    const lines = text.replace(/\r/g,'').split('\n').filter(l=>l.trim());
    const cab = lines[0].split(sep).map(c => c.trim().replace(/^"|"$/g,''));
    const rows = lines.slice(1).map(l => {
      const vals = []; let cur = '', q = false;
      for (const ch of l) {
        if (ch === '"') q = !q;
        else if (ch === sep && !q) { vals.push(cur); cur=''; }
        else cur += ch;
      }
      vals.push(cur);
      const obj = {};
      cab.forEach((c,i) => obj[c] = (vals[i]||'').replace(/^"|"$/g,'').trim());
      return obj;
    });
    return { cab, rows };
  }
  function _onImpFile(ev){
    const f = ev.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = e => {
      try {
        const { cab, rows } = _parseCSV(e.target.result);
        _impParsed = rows;
        const conflitos = [];
        const matExistentes = new Set(socios.map(s => String(s.matricula)));
        const cpfExistentes = new Set(socios.map(s => (s.cpf||'').replace(/\D/g,'')).filter(c=>c.length===11));
        rows.forEach((r,i) => {
          if (r.matricula && matExistentes.has(String(r.matricula))) conflitos.push(`Linha ${i+2}: matrícula ${r.matricula} já existe`);
          const c = (r.cpf||'').replace(/\D/g,'');
          if (c.length===11 && cpfExistentes.has(c)) conflitos.push(`Linha ${i+2}: CPF ${r.cpf} já existe`);
        });
        const prev = $('imp-preview');
        prev.innerHTML = `<div class="section"><div class="section-title">Prévia (${rows.length} linhas)</div>
          <div class="leitura">Colunas detectadas: ${cab.map(c=>`<code>${_esc(c)}</code>`).join(', ')}</div>
          <table class="ap-table"><thead><tr>${cab.map(c=>`<th>${_esc(c)}</th>`).join('')}</tr></thead>
          <tbody>${rows.slice(0,20).map(r=>`<tr>${cab.map(c=>`<td>${_esc(r[c]||'')}</td>`).join('')}</tr>`).join('')}</tbody></table>
          ${conflitos.length?`<div class="alert error" style="margin-top:10px">⚠ ${conflitos.length} conflito(s):<ul>${conflitos.slice(0,30).map(c=>`<li>${_esc(c)}</li>`).join('')}</ul></div>`:'<div class="leitura" style="color:#16a34a;margin-top:10px">Nenhum conflito.</div>'}
          <div style="margin-top:14px;display:flex;gap:8px">
            <button class="btn-primary" onclick="window._confirmarImport(false)">Importar ignorando conflitos</button>
            <button class="btn-outline" onclick="window._confirmarImport(true)">Importar substituindo conflitos</button>
          </div></div>`;
      } catch(err){ alert('Erro ao ler CSV: '+err.message); }
    };
    r.readAsText(f, 'utf-8');
  }
  window._confirmarImport = function(substituir){
    if (!_impParsed) return;
    if (!confirm(`Confirma importação de ${_impParsed.length} sócio(s)?`)) return;
    let novos = 0, sub = 0;
    _impParsed.forEach(r => {
      const matStr = String(r.matricula||'');
      const cpfNum = (r.cpf||'').replace(/\D/g,'');
      const idx = socios.findIndex(s =>
        (matStr && String(s.matricula)===matStr) ||
        (cpfNum.length===11 && (s.cpf||'').replace(/\D/g,'')===cpfNum));
      const obj = {
        id: idx>=0 ? socios[idx].id : (Date.now()+Math.random()),
        matricula: r.matricula || '',
        nome: r.nome || '', cpf: r.cpf || '', dataNasc: r.dataNasc || '',
        sexo: r.sexo || '', tel: r.tel || '', telefone: r.tel || '',
        email: r.email || '', bairro: r.bairro || '', cidade: r.cidade || '',
        presidente: typeof canonPresidente==='function' ? canonPresidente(r.presidente||'') : (r.presidente||''),
        dataCadastro: r.dataCadastro || _hojeISO(),
        origem: r.origem || '', valorCompra: r.valorCompra || '',
        categoria: r.categoria || '', tipoSocio: r.tipoSocio || 'contribuinte',
        situacao: r.situacao || 'ativo', dependentes: []
      };
      if (idx>=0) {
        if (substituir) { socios[idx] = { ...socios[idx], ...obj }; sub++; }
      } else { socios.push(obj); novos++; }
    });
    try { saveData(); } catch(e){}
    _safeAudit('IMPORT_CSV', `${novos} novo(s), ${sub} substituído(s)`);
    alert(`Importação concluída.\nNovos: ${novos}\nSubstituídos: ${sub}`);
    _impParsed = null;
    if (typeof renderDashboard==='function') renderDashboard();
    if (typeof renderSocios==='function') renderSocios(true);
    showAuditPlusPane('auditoria');
  };

  // ---------- 5. Relatórios PDF ----------
  function _temPdf(){ return typeof window.jspdf !== 'undefined'; }
  function _docPdf(){ const { jsPDF } = window.jspdf; return new jsPDF(); }
  function _cabecalho(doc, titulo){
    doc.setFontSize(16); doc.setFont('helvetica','bold');
    doc.text('Sistema BTC — Auditoria', 14, 14);
    doc.setFontSize(12); doc.setFont('helvetica','normal');
    doc.text(titulo, 14, 22);
    doc.setFontSize(9); doc.setTextColor(120);
    doc.text('Emitido em ' + new Date().toLocaleString('pt-BR'), 14, 28);
    doc.setTextColor(0); doc.setLineWidth(0.3); doc.line(14, 31, 196, 31);
  }
  function _rodape(doc){
    const n = doc.internal.getNumberOfPages();
    for (let i=1; i<=n; i++){
      doc.setPage(i); doc.setFontSize(8); doc.setTextColor(140);
      doc.text(`Página ${i}/${n} · Sistema BTC`, 105, 290, { align:'center' });
    }
  }

  function relIrregularidades(){
    if (!_temPdf()) return alert('Biblioteca PDF não carregada.');
    const linhas = [];
    socios.forEach(s => {
      (s.dependentes||[]).forEach(d => {
        const av = (typeof avaliarDependente==='function') ? avaliarDependente(d, s) : { status:'', motivos:[] };
        if (av.status==='irregular') linhas.push([
          s.presidente||'—', s.nome||'—', String(s.matricula||''),
          d.nome||'—', d.tipoDep||'—', av.motivos.join('; ')
        ]);
      });
    });
    if (!linhas.length) return alert('Nenhuma irregularidade encontrada.');
    const doc = _docPdf();
    _cabecalho(doc, 'Relatório de Irregularidades — Art. 22');
    doc.autoTable({
      startY: 36,
      head: [['Presidente','Sócio','Mat.','Dependente','Tipo','Motivos (Art. 22)']],
      body: linhas,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [30, 64, 175] }
    });
    _rodape(doc);
    doc.save(`Irregularidades_${_hojeISO()}.pdf`);
    _safeAudit('RELATORIO_PDF', 'Irregularidades por Gestão');
  }
  window.relIrregularidades = relIrregularidades;

  function relSemComprovacao(){
    if (!_temPdf()) return alert('Biblioteca PDF não carregada.');
    const linhas = socios.filter(s => {
      const o=(s.origem||'').toLowerCase();
      return o==='adquirido_clube' || (o==='compra' && !s.valorCompra) || (o==='heranca' && !s.docHeranca);
    }).map(s => [s.matricula||'', s.nome||'—', (typeof origemLabel==='function'?origemLabel(s.origem):s.origem||''), s.presidente||'—', s.dataCadastro||'']);
    if (!linhas.length) return alert('Nenhum sócio sem comprovação.');
    const doc = _docPdf();
    _cabecalho(doc, 'Sócios sem Comprovação Documental');
    doc.autoTable({ startY:36, head:[['Mat.','Nome','Origem','Presidente','Data Cad.']], body: linhas,
      styles:{ fontSize:8 }, headStyles:{ fillColor:[180,83,9] } });
    _rodape(doc);
    doc.save(`SemComprovacao_${_hojeISO()}.pdf`);
    _safeAudit('RELATORIO_PDF', 'Sócios sem Comprovação');
  }
  window.relSemComprovacao = relSemComprovacao;

  function relParecerSocio(){
    const id = prompt('Digite a matrícula do sócio para gerar o parecer:');
    if (!id) return;
    const s = socios.find(x => String(x.matricula)===String(id).trim());
    if (!s) return alert('Sócio não encontrado.');
    if (!_temPdf()) return alert('Biblioteca PDF não carregada.');
    const r = calcularScoreRisco(s);
    const doc = _docPdf();
    _cabecalho(doc, `Parecer Individual — ${s.nome||'—'} (#${s.matricula||''})`);
    let y = 38;
    const linha = (k,v) => { doc.setFont('helvetica','bold'); doc.text(k+':', 14, y); doc.setFont('helvetica','normal'); doc.text(String(v||'—'), 60, y); y+=6; };
    linha('CPF', s.cpf); linha('Nascimento', s.dataNasc);
    linha('Tipo', typeof tipoLabel==='function'?tipoLabel(s.tipoSocio):s.tipoSocio);
    linha('Situação', s.situacao); linha('Presidente', s.presidente);
    linha('Data Cadastro', s.dataCadastro);
    linha('Origem', typeof origemLabel==='function'?origemLabel(s.origem):s.origem);
    y += 4; doc.setFont('helvetica','bold'); doc.text(`Score de Risco: ${r.score}/100`, 14, y); y += 6;
    doc.setFont('helvetica','normal');
    if (r.motivos.length) { doc.text('Alertas:', 14, y); y+=5; r.motivos.forEach(m => { doc.text('• '+m, 18, y); y+=5; }); }
    y += 4;
    if ((s.dependentes||[]).length) {
      doc.autoTable({ startY: y, head:[['Dependente','Tipo','Nasc.','Status','Motivos']],
        body: s.dependentes.map(d => {
          const av = typeof avaliarDependente==='function' ? avaliarDependente(d,s) : { status:'', motivos:[] };
          return [d.nome||'—', d.tipoDep||'—', d.dataNasc||'—', av.status, av.motivos.join('; ')];
        }),
        styles:{ fontSize:8 }, headStyles:{ fillColor:[30,64,175] }
      });
      y = doc.lastAutoTable.finalY + 6;
    }
    if ((s.transferencias||[]).length) {
      doc.autoTable({ startY: y, head:[['Data','Tipo','Cedente','Obs.']],
        body: s.transferencias.map(t => [t.data, t.tipo, t.cedente||'—', t.obs||'']),
        styles:{ fontSize:8 }, headStyles:{ fillColor:[6,95,70] }
      });
    }
    _rodape(doc);
    doc.save(`Parecer_${s.matricula||'socio'}_${_hojeISO()}.pdf`);
    _safeAudit('RELATORIO_PDF', `Parecer individual: ${s.nome}`);
  }
  window.relParecerSocio = relParecerSocio;

  // ---------- 6. UX: Ctrl+K busca global, dark mode, atalhos ----------
  function abrirBuscaGlobal(){
    let ov = $('busca-global'); if (!ov) return;
    ov.style.display = 'flex';
    const inp = $('busca-global-input'); inp.value=''; _renderBuscaGlobal('');
    setTimeout(()=>inp.focus(), 30);
  }
  function fecharBuscaGlobal(){ const ov=$('busca-global'); if(ov) ov.style.display='none'; }
  window.fecharBuscaGlobal = fecharBuscaGlobal;
  function _renderBuscaGlobal(q){
    const out = $('busca-global-results'); if(!out) return;
    if (!q || q.length<2){ out.innerHTML='<div class="leitura">Digite ao menos 2 caracteres…</div>'; return; }
    const nq = _norm(q);
    const cpfQ = q.replace(/\D/g,'');
    const matches = socios.filter(s =>
      _norm(s.nome).includes(nq) ||
      (cpfQ && (s.cpf||'').replace(/\D/g,'').includes(cpfQ)) ||
      String(s.matricula||'').includes(q)
    ).slice(0, 30);
    out.innerHTML = matches.length
      ? matches.map(s => `<div class="bg-item" onclick="abrirFicha('${_esc(String(s.id))}');fecharBuscaGlobal()">
          <div><strong>${_esc(s.nome||'—')}</strong> · #${_esc(s.matricula||'')}</div>
          <div class="leitura">CPF: ${_esc(s.cpf||'—')} · ${_esc(s.presidente||'')}</div></div>`).join('')
      : '<div class="empty">Nada encontrado.</div>';
  }

  function toggleDarkMode(){
    const on = document.body.classList.toggle('dark');
    try { localStorage.setItem('btc_dark', on?'1':'0'); } catch(e){}
  }
  window.toggleDarkMode = toggleDarkMode;

  function navegarSocioFicha(dir){
    if (typeof fichaEditId === 'undefined' || !fichaEditId) return;
    const idx = socios.findIndex(s => String(s.id)===String(fichaEditId));
    if (idx < 0) return;
    const nx = (idx + dir + socios.length) % socios.length;
    if (typeof abrirFicha === 'function') abrirFicha(socios[nx].id);
  }

  // ---------- Init / Hook DOM ----------
  function injetarUI(){
    // botão dark mode + busca global no header
    const hdr = document.querySelector('.hdr');
    if (hdr && !$('btn-dark')) {
      const div = document.createElement('div');
      div.style.cssText = 'display:flex;gap:6px;margin-left:8px';
      div.innerHTML = `
        <button id="btn-busca" class="btn-outline" style="font-size:12px;padding:6px 10px" onclick="document.getElementById('busca-global').style.display='flex';setTimeout(()=>document.getElementById('busca-global-input').focus(),30)" title="Busca global (Ctrl+K)">🔍 Buscar</button>
        <button id="btn-dark" class="btn-outline" style="font-size:12px;padding:6px 10px" onclick="toggleDarkMode()" title="Alternar modo escuro">🌓</button>`;
      hdr.appendChild(div);
    }
    // restaura dark mode
    try { if (localStorage.getItem('btc_dark')==='1') document.body.classList.add('dark'); } catch(e){}

    // adiciona tab Auditoria+ e seu conteúdo
    const tabs = document.querySelector('.tabs');
    if (tabs && !document.querySelector('.tab-btn[data-ext="audit-plus"]')) {
      const b = document.createElement('button');
      b.className = 'tab-btn'; b.dataset.ext = 'audit-plus';
      b.textContent = 'Auditoria+';
      b.onclick = () => abrirAuditPlus();
      tabs.appendChild(b);
    }

    if (!$('tab-audit-plus')) {
      const div = document.createElement('div');
      div.id = 'tab-audit-plus'; div.className = 'content'; div.style.display='none';
      div.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px">
          <h2 style="margin:0">🔍 Auditoria Avançada</h2>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn-outline" onclick="relIrregularidades()" style="font-size:12px">📄 PDF Irregularidades</button>
            <button class="btn-outline" onclick="relSemComprovacao()" style="font-size:12px">📄 PDF Sem Comprovação</button>
            <button class="btn-outline" onclick="relParecerSocio()" style="font-size:12px">📄 Parecer Individual</button>
          </div>
        </div>
        <div class="dash-subtabs">
          <button class="ap-subtab dash-subtab active" data-pane="auditoria" onclick="showAuditPlusPane('auditoria')">Detecção & Limpeza</button>
          <button class="ap-subtab dash-subtab" data-pane="timeline" onclick="showAuditPlusPane('timeline')">Linha do Tempo</button>
          <button class="ap-subtab dash-subtab" data-pane="importar" onclick="showAuditPlusPane('importar')">Importar CSV</button>
        </div>
        <div class="ap-pane" id="ap-pane-auditoria"><div id="audit-plus-content"></div></div>
        <div class="ap-pane" id="ap-pane-timeline" style="display:none">
          <div class="section"><div class="section-title">Linha do Tempo de um Título</div>
            <select id="tl-socio" onchange="renderTimelineSocio()" style="padding:8px;border:1px solid var(--border);border-radius:6px;width:100%;max-width:480px"></select>
            <div id="tl-out" style="margin-top:14px"></div></div>
        </div>
        <div class="ap-pane" id="ap-pane-importar" style="display:none">
          <div class="section"><div class="section-title">Importar planilha CSV</div><div id="imp-out"></div></div>
        </div>`;
      const printArea = $('print-area');
      if (printArea && printArea.parentNode) printArea.parentNode.insertBefore(div, printArea);
      else document.body.appendChild(div);
    }

    // Permissão: só admin vê Auditoria+ e importar
    if (typeof isAdmin === 'function' && !isAdmin()) {
      const t = document.querySelector('.tab-btn[data-ext="audit-plus"]');
      if (t) t.style.display = 'none';
    }

    // overlay busca global
    if (!$('busca-global')) {
      const ov = document.createElement('div');
      ov.id = 'busca-global';
      ov.innerHTML = `<div class="bg-box" onclick="event.stopPropagation()">
          <input id="busca-global-input" placeholder="Buscar por nome, CPF ou matrícula… (Esc para fechar)" oninput="window._bgUpdate(this.value)"/>
          <div id="busca-global-results"></div></div>`;
      ov.onclick = fecharBuscaGlobal;
      document.body.appendChild(ov);
      window._bgUpdate = _renderBuscaGlobal;
    }

    // PDF libs (jspdf-autotable; jspdf já vem do app)
    if (typeof window.jspdf !== 'undefined' && !window.jspdf.jsPDF.API.autoTable) {
      const sc = document.createElement('script');
      sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js';
      document.head.appendChild(sc);
    }
  }

  function abrirAuditPlus(){
    ['cadastro','socios','titulos','carteirinhas','dashboard','auditoria','ficha'].forEach(t=>{
      const el = $('tab-'+t); if (el) el.style.display='none';
    });
    const ext = $('tab-audit-plus'); if (ext) ext.style.display = 'block';
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    const me = document.querySelector('.tab-btn[data-ext="audit-plus"]');
    if (me) me.classList.add('active');
    showAuditPlusPane('auditoria');
  }
  window.abrirAuditPlus = abrirAuditPlus;

  // hooks de teclado
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault(); abrirBuscaGlobal();
    } else if (e.key === 'Escape') {
      fecharBuscaGlobal();
    } else if ($('tab-ficha') && $('tab-ficha').style.display === 'block' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
      if (e.key === 'ArrowRight') navegarSocioFicha(1);
      else if (e.key === 'ArrowLeft') navegarSocioFicha(-1);
    }
  });

  // patch leve em renderSocios para mostrar badge de risco (se existir o card)
  function patchSocios(){
    if (typeof window.renderSocios !== 'function' || window.__patchedSocios) return;
    const orig = window.renderSocios;
    window.renderSocios = function(){
      const r = orig.apply(this, arguments);
      // injeta badge de risco se o nome do sócio aparece em .socio-card
      try {
        document.querySelectorAll('.socio-card[data-id], .card-socio[data-id]').forEach(el => {
          const id = el.getAttribute('data-id');
          const s = socios.find(x => String(x.id)===String(id));
          if (s && !el.querySelector('.risco-badge')) {
            const sc = calcularScoreRisco(s);
            if (sc.score > 25) {
              const span = document.createElement('span');
              span.className = 'risco-badge';
              const f = scoreFaixa(sc.score);
              span.style.cssText = `background:${f.bg};color:${f.cor};margin-left:6px`;
              span.textContent = `Risco ${sc.score}`;
              span.title = sc.motivos.join(' · ');
              el.querySelector('.socio-nome, .nome, h3, h4')?.appendChild(span);
            }
          }
        });
      } catch(e){}
      return r;
    };
    window.__patchedSocios = true;
  }

  // boot
  function boot(){
    injetarUI();
    patchSocios();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // expõe utilitários
  window.calcularScoreRisco = calcularScoreRisco;
  window.scoreBadgeHTML = scoreBadgeHTML;
  window.detectarDuplicidades = detectarDuplicidades;
  window.detectarLotesSuspeitos = detectarLotesSuspeitos;
  window.linhaDoTempoSocio = linhaDoTempo;
  window.valoresAtipicos = valoresAtipicos;
})();
