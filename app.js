/* Citas – pantallas, almacenamiento local y respaldo en la nube (Apps Script) */
(function () {
  'use strict';
  var C = window.CitasCore;
  var $app = document.getElementById('app');

  // ---------- almacenamiento (siempre protegido: puede fallar en modo privado) ----------
  var mem = {};
  var LS = {
    get: function (k, d) { try { var v = localStorage.getItem('citas.' + k); return v === null ? (k in mem ? mem[k] : d) : v; } catch (e) { return k in mem ? mem[k] : d; } },
    set: function (k, v) { mem[k] = v; try { localStorage.setItem('citas.' + k, v); } catch (e) { /* queda en memoria */ } }
  };
  function getJSON(k, d) { try { return JSON.parse(LS.get(k, '')) || d; } catch (e) { return d; } }

  function csv() { return LS.get('csv', ''); }
  function guardarCsv(nuevo) {
    LS.set('prev', csv());          // una copia de seguridad del estado anterior
    LS.set('csv', nuevo);
    LS.set('dirty', '1');
    sincronizar(false);
  }
  function usuario() { return LS.get('usuario', ''); }
  function cfg() { return C.cfgDe(getJSON('cfg', {})); }
  function nube() { return getJSON('nube', { url: '', token: '', dispositivo: '' }); }
  function nubeLista() { var n = nube(); return !!(n.url && n.token && n.dispositivo); }

  // ---------- utilidades de pantalla ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(sel, root) { return (root || document).querySelector(sel); }
  var toastT;
  function toast(msg) { var t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('on'); }, 3200); }
  function dialogo(titulo, texto, okTxt, cancelTxt, peligro) {
    return new Promise(function (res) {
      var d = $('#dlg');
      d.innerHTML = '<h3>' + esc(titulo) + '</h3><p>' + esc(texto) + '</p><div class="row">' +
        (cancelTxt ? '<button class="btn ghost" value="no">' + esc(cancelTxt) + '</button>' : '') +
        '<button class="btn ' + (peligro ? 'danger' : '') + '" value="si">' + esc(okTxt || 'Aceptar') + '</button></div>';
      d.onclick = function (e) { var b = e.target.closest('button'); if (b) { d.close(); res(b.value === 'si'); } };
      d.oncancel = function () { res(false); };
      if (d.showModal) d.showModal(); else d.setAttribute('open', '');
    });
  }
  function hoyDate() { return new Date(); }
  function isoDe(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function isoADmy(iso) { var p = String(iso).split('-'); return p.length === 3 ? p[2] + '-' + p[1] + '-' + p[0] : ''; }
  function diaTxt(min) { var d = new Date(min * 60000); return ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][d.getDay()] + ' ' + C.fmt(min).substring(0, 10); }
  function rango(c, min, dur) { return C.hora(min) + (c.usarDuracion ? ' a ' + C.hora(min + dur) : ''); }
  function waLink(texto) { return 'https://wa.me/?text=' + encodeURIComponent(texto); }

  // ---------- navegación ----------
  var pila = [];
  function go(vista, args, noPush) {
    if (vista === 'exito') pila = [['home', {}]];
    if (!noPush) { pila.push([vista, args]); try { history.pushState({ n: pila.length }, ''); } catch (e) { } }
    window.scrollTo(0, 0);
    V[vista](args || {});
  }
  function atras() {
    if (pila.length > 1) { pila.pop(); var p = pila[pila.length - 1]; V[p[0]](p[1] || {}); window.scrollTo(0, 0); }
    else { pila = [['home', {}]]; V.home({}); }
  }
  window.addEventListener('popstate', function () { atras(); });
  function inicio() { pila = [['home', {}]]; V.home({}); window.scrollTo(0, 0); }
  function cabecera(titulo, conAtras) {
    return '<header class="top">' + (conAtras ? '<button class="iconbtn" id="bk" aria-label="Volver">‹</button>' : '') +
      '<h1>' + esc(titulo) + '</h1></header>';
  }
  function pintar(html, conAtras, titulo) {
    $app.innerHTML = cabecera(titulo || '', conAtras) + html;
    var b = $('#bk'); if (b) b.onclick = function () { history.length > 1 ? history.back() : atras(); };
  }
  function errorHtml(code) { return '<div class="err">' + esc(C.mensaje(code, cfg())) + '</div>'; }

  var V = {};

  // ---------- primer uso: usuario ----------
  V.setup = function () {
    pintar('<div class="card"><p style="margin-top:0">Escribe tu nombre. Así se identifica tu agenda: las citas de cada persona se llevan por separado, y dos personas pueden tener la misma hora sin estorbarse.</p>' +
      '<label for="u">Tu nombre</label><input id="u" autocomplete="off" autocapitalize="words" maxlength="40" placeholder="Ej. María">' +
      '<div id="e"></div><div style="height:14px"></div><button class="btn" id="ok">Continuar</button></div>', false, 'Bienvenido');
    $('#ok').onclick = function () {
      var v = $('#u').value.trim();
      if (C.validarUsuario(v) !== 'OK') { $('#e').innerHTML = errorHtml('ERROR_USUARIO'); return; }
      LS.set('usuario', C.titulo(v)); inicio();
    };
  };

  // ---------- inicio ----------
  V.home = function () {
    if (!usuario()) return V.setup();
    var c = cfg(), hoy = C.citasDelDia(csv(), c, usuario(), C.aMinutos(C.aDMY(hoyDate()) + ' 0:0'));
    var ahora = Math.floor(Date.now() / 60000), prox = hoy.filter(function (x) { return x.min >= ahora; })[0];
    pintar(
      '<div class="hello"><span>Agenda de</span><b>' + esc(usuario()) + '</b></div>' +
      '<div style="margin-bottom:6px">' + estadoNube() + '</div>' +
      (hoy.length ? '<div class="card"><div class="k">HOY</div><b>' + hoy.length + ' cita' + (hoy.length === 1 ? '' : 's') + '</b>' +
        (prox ? '<div class="k" style="margin-top:2px">Siguiente: ' + esc(C.hora(prox.min)) + ' · ' + esc(prox.cli) + '</div>' : '<div class="k">Ya pasaron las de hoy</div>') + '</div>' : '') +
      '<div class="menu">' +
      '<button class="mbtn" data-g="agendar"><span class="ic">➕</span><span>Agendar cita<small>Nueva cita para un cliente</small></span></button>' +
      '<button class="mbtn" data-g="modificar"><span class="ic">✏️</span><span>Modificar / cancelar<small>Cambiar fecha u hora, o cancelar</small></span></button>' +
      '<button class="mbtn" data-g="cliente"><span class="ic">👤</span><span>Citas por cliente<small>Busca por nombre</small></span></button>' +
      '<button class="mbtn" data-g="dia"><span class="ic">📅</span><span>Citas por día<small>Hoy, mañana u otra fecha</small></span></button>' +
      '<button class="mbtn" data-g="opciones"><span class="ic">⚙️</span><span>Opciones<small>Usuario, respaldo y configuración</small></span></button>' +
      '</div>', false, 'Citas');
    $app.querySelectorAll('[data-g]').forEach(function (b) { b.onclick = function () { go(b.getAttribute('data-g')); }; });
    var ch = $('#chipnube'); if (ch) ch.onclick = function () { sincronizar(true); };
  };
  function estadoNube() {
    if (!nubeLista()) return '<button class="chip off" id="chipnube">☁︎ Sin respaldo en la nube</button>';
    if (LS.get('dirty', '') === '1' || LS.get('histDirty', '') === '1') return '<button class="chip warn" id="chipnube">☁︎ Pendiente de subir · tocar para reintentar</button>';
    var u = LS.get('syncOk', '');
    return '<button class="chip" id="chipnube">☁︎ Respaldado' + (u ? ' · ' + esc(u) : '') + '</button>';
  }

  // ---------- horarios (cuadrícula) ----------
  function bloqueFecha(estado, opts) {
    // devuelve html; después llamar enlazarFecha(estado, opts)
    return '<label for="f">Fecha</label><input type="date" id="f" min="' + isoDe(hoyDate()) + '" value="' + esc(estado.fechaIso || '') + '">' +
      '<div id="grid"></div>';
  }
  function enlazarFecha(estado, opts, alCambiar) {
    function cargar() {
      var g = $('#grid'); estado.slot = null; alCambiar();
      if (!estado.fechaIso) { g.innerHTML = ''; return; }
      var r = C.horarios(csv(), cfg(), usuario(), isoADmy(estado.fechaIso), opts(), new Date());
      if (r.error) { g.innerHTML = errorHtml(r.error); return; }
      estado.dur = r.dur;
      g.innerHTML = '<label>Horarios disponibles</label><div class="grid">' + r.slots.map(function (s, i) {
        return '<button class="slot" data-i="' + i + '">' + esc(s.etiqueta) + '</button>';
      }).join('') + '</div>';
      g.querySelectorAll('.slot').forEach(function (b) {
        b.onclick = function () {
          g.querySelectorAll('.slot').forEach(function (x) { x.classList.remove('sel'); });
          b.classList.add('sel'); estado.slot = r.slots[+b.getAttribute('data-i')]; alCambiar();
        };
      });
    }
    $('#f').onchange = function () { estado.fechaIso = this.value; cargar(); };
    if (estado.fechaIso) cargar();
    return cargar;
  }

  // ---------- agendar ----------
  V.agendar = function () {
    var c = cfg(), st = { fechaIso: '', slot: null, dur: c.duracionDefault };
    var durs = String(c.duraciones).split(/[ ,]+/).map(function (x) { return parseInt(x, 10); }).filter(function (x) { return x >= 5 && x <= 600; });
    if (!durs.length) durs = [c.duracionDefault];
    var recarga;
    pintar('<div class="card">' +
      '<label for="n">Nombre y apellido del cliente</label><input id="n" autocomplete="off" autocapitalize="words" maxlength="40">' +
      '<label for="s">Servicio</label><input id="s" autocomplete="off" maxlength="40" placeholder="Ej. Corte + barba">' +
      (c.usarDuracion ? '<label for="d">Duración</label><select id="d">' + durs.map(function (d) { return '<option value="' + d + '">' + d + ' min</option>'; }).join('') + '</select>' : '') +
      bloqueFecha(st) + '<div id="e"></div><div style="height:14px"></div><button class="btn" id="ok" disabled>Guardar cita</button></div>', true, 'Agendar cita');
    function estadoBtn() { $('#ok').disabled = !st.slot; }
    recarga = enlazarFecha(st, function () { return { dur: c.usarDuracion ? $('#d').value : c.duracionDefault }; }, estadoBtn);
    if (c.usarDuracion) $('#d').onchange = function () { if (st.fechaIso) recarga(); };
    $('#ok').onclick = function () {
      var n = $('#n').value, s = $('#s').value, v = C.validarTexto(n, s);
      if (v !== 'OK') { $('#e').innerHTML = errorHtml(v); return; }
      var r = C.agendar(csv(), c, usuario(), n, s, st.slot.min, c.usarDuracion ? $('#d').value : c.duracionDefault, new Date());
      if (r.error) { $('#e').innerHTML = errorHtml(r.error); if (r.error === 'ERROR_EMPALME') recarga(); return; }
      guardarCsv(r.csv);
      var f = r.fila, ini = C.aMinutos(f[2]);
      go('exito', {
        titulo: 'Cita registrada',
        detalle: f[0] + ' · ' + f[1] + '\n' + diaTxt(ini) + ' · ' + rango(c, ini, +f[3]),
        wa: 'Cita registrada: ' + f[0] + ' - ' + f[1] + '. Día: ' + f[2].substring(0, 10) + ' a las: ' + f[2].substring(11) + ' hrs'
      });
    };
  };

  V.exito = function (a) {
    pintar('<div class="card ok-card"><div class="big">✅</div><h2 style="margin:6px 0">' + esc(a.titulo) + '</h2>' +
      '<p style="white-space:pre-line;color:var(--muted)">' + esc(a.detalle || '') + '</p></div>' +
      '<div class="stack"><a class="btn" id="wa" href="' + esc(waLink(a.wa)) + '" target="_blank" rel="noopener">Enviar por WhatsApp</a>' +
      '<button class="btn ghost" id="fin">Listo</button></div>', false, '');
    $('#fin').onclick = inicio;
  };

  // ---------- selector de cliente (con búsqueda en vivo) ----------
  function selectorCliente(soloFuturas, alElegir) {
    var html = '<div class="card"><label for="q" style="margin-top:0">Buscar cliente</label>' +
      '<input id="q" type="search" autocomplete="off" placeholder="Escribe parte del nombre"><div id="lista" class="list"></div></div>';
    return {
      html: html,
      iniciar: function () {
        function llenar() {
          var r = C.clientes(csv(), usuario(), $('#q').value, soloFuturas, new Date()), L = $('#lista');
          if (r.error) { L.innerHTML = '<div class="empty">' + esc(C.mensaje(r.error, cfg())) + '</div>'; return; }
          L.innerHTML = r.lista.map(function (x, i) { return '<button class="item" data-i="' + i + '"><span class="t">' + esc(x.nombre) + '</span></button>'; }).join('');
          L.querySelectorAll('.item').forEach(function (b) { b.onclick = function () { alElegir(r.lista[+b.getAttribute('data-i')]); }; });
        }
        $('#q').oninput = llenar; llenar();
      }
    };
  }
  function listaCitas(citas, c, onPick) {
    return citas.map(function (x, i) {
      return '<button class="item cita" data-i="' + i + '"><span class="t">' + esc(diaTxt(x.min)) + ' · ' + esc(rango(c, x.min, x.dur)) + '</span><small>' + esc(x.cli) + ' · ' + esc(x.ser) + (c.usarDuracion ? ' · ' + x.dur + ' min' : '') + '</small></button>';
    }).join('');
  }

  // ---------- modificar / cancelar ----------
  V.modificar = function () {
    var s = selectorCliente(true, function (cl) { go('modCitas', { clave: cl.clave, nombre: cl.nombre }); });
    pintar(s.html, true, 'Modificar / cancelar'); s.iniciar();
  };
  V.modCitas = function (a) {
    var c = cfg(), r = C.citasDeCliente(csv(), c, usuario(), a.clave, new Date());
    pintar(r.error ? errorHtml(r.error) : '<div class="k">Citas de ' + esc(a.nombre) + '</div><div class="list">' + listaCitas(r.citas, c) + '</div>', true, 'Elige la cita');
    if (!r.error) $app.querySelectorAll('.item').forEach(function (b) { b.onclick = function () { go('modAccion', { cita: r.citas[+b.getAttribute('data-i')] }); }; });
  };
  V.modAccion = function (a) {
    var c = cfg(), x = a.cita;
    pintar('<div class="card"><b>' + esc(x.cli) + '</b> · ' + esc(x.ser) + '<br><span class="k">' + esc(diaTxt(x.min)) + ' · ' + esc(rango(c, x.min, x.dur)) + '</span></div>' +
      '<div class="stack"><button class="btn" id="m">Cambiar fecha u hora</button><button class="btn danger" id="x">Cancelar cita</button></div>', true, '¿Qué deseas hacer?');
    $('#m').onclick = function () { go('modFecha', { cita: x }); };
    $('#x').onclick = function () {
      dialogo('¿Cancelar esta cita?', x.cli + ' · ' + x.ser + '\n' + diaTxt(x.min) + ' ' + rango(c, x.min, x.dur), 'Sí, cancelar', 'Volver', true).then(function (si) {
        if (!si) return;
        var r = C.cancelar(csv(), usuario(), { id: x.id });
        if (r.error) { toast(C.mensaje(r.error, c)); return; }
        guardarCsv(r.csv);
        go('exito', { titulo: 'Cita cancelada', detalle: x.cli + ' · ' + x.ser + '\n' + diaTxt(x.min),
          wa: 'Cita cancelada: ' + x.cli + ' - ' + x.ser + '. Día: ' + C.fmt(x.min).substring(0, 10) + ' a las: ' + C.hora(x.min) + ' hrs' });
      });
    };
  };
  V.modFecha = function (a) {
    var c = cfg(), x = a.cita, st = { fechaIso: '', slot: null };
    pintar('<div class="card"><b>' + esc(x.cli) + '</b> · ' + esc(x.ser) + '<br><span class="k">Actual: ' + esc(diaTxt(x.min)) + ' · ' + esc(rango(c, x.min, x.dur)) + '</span>' +
      bloqueFecha(st) + '<div id="e"></div><div style="height:14px"></div><button class="btn" id="ok" disabled>Guardar cambio</button></div>', true, 'Nueva fecha y hora');
    enlazarFecha(st, function () { return { propia: { id: x.id } }; }, function () { $('#ok').disabled = !st.slot; });
    $('#ok').onclick = function () {
      var r = C.modificar(csv(), c, usuario(), { id: x.id }, st.slot.min, new Date());
      if (r.error) { $('#e').innerHTML = errorHtml(r.error); return; }
      guardarCsv(r.csv);
      var nueva = C.fmt(st.slot.min);
      go('exito', { titulo: 'Cita modificada', detalle: x.cli + ' · ' + x.ser + '\nNueva: ' + diaTxt(st.slot.min) + ' · ' + rango(c, st.slot.min, r.dur),
        wa: 'Cita modificada: ' + x.cli + ' - ' + x.ser + '. Antes: ' + C.fmt(x.min).substring(0, 10) + ' a las ' + C.hora(x.min) + ' hrs. Nueva fecha: ' + nueva.substring(0, 10) + ' a las: ' + nueva.substring(11) + ' hrs' });
    };
  };

  // ---------- consultas ----------
  V.cliente = function () {
    var s = selectorCliente(false, function (cl) { go('clienteCitas', { clave: cl.clave, nombre: cl.nombre }); });
    pintar(s.html, true, 'Citas por cliente'); s.iniciar();
  };
  V.clienteCitas = function (a) {
    var c = cfg(), r = C.citasDeCliente(csv(), c, usuario(), a.clave, new Date());
    pintar(r.error ? errorHtml(r.error) : '<div class="k">' + r.citas.length + ' cita' + (r.citas.length === 1 ? '' : 's') + ' pendiente' + (r.citas.length === 1 ? '' : 's') + ' de ' + esc(a.nombre) + '</div><div class="list">' +
      r.citas.map(function (x) { return '<div class="item cita"><span class="t">' + esc(diaTxt(x.min)) + ' · ' + esc(rango(c, x.min, x.dur)) + '</span><small>' + esc(x.ser) + (c.usarDuracion ? ' · ' + x.dur + ' min' : '') + '</small></div>'; }).join('') + '</div>', true, a.nombre);
  };
  V.dia = function () {
    var c = cfg();
    pintar('<div class="seg"><button class="btn sec" id="h">Hoy</button><button class="btn sec" id="m">Mañana</button></div>' +
      '<label for="f">Otra fecha</label><input type="date" id="f"><div id="res" style="margin-top:12px"></div>', true, 'Citas por día');
    function ver(date, etiqueta) {
      var base = C.aMinutos(C.aDMY(date) + ' 0:0'), l = C.citasDelDia(csv(), c, usuario(), base);
      $('#res').innerHTML = '<div class="k">' + esc(etiqueta) + ' · ' + l.length + ' cita' + (l.length === 1 ? '' : 's') + '</div>' + (l.length ?
        '<div class="list">' + l.map(function (x) { return '<div class="item cita"><span class="t">' + esc(rango(c, x.min, x.dur)) + ' · ' + esc(x.cli) + '</span><small>' + esc(x.ser) + '</small></div>'; }).join('') + '</div>' :
        '<div class="empty">No hay citas de ' + esc(usuario()) + ' ese día.</div>');
    }
    $('#h').onclick = function () { ver(new Date(), 'Hoy'); };
    $('#m').onclick = function () { var d = new Date(); d.setDate(d.getDate() + 1); ver(d, 'Mañana'); };
    $('#f').onchange = function () { var p = this.value.split('-'); if (p.length === 3) ver(new Date(+p[0], +p[1] - 1, +p[2]), 'El ' + p[2] + '-' + p[1] + '-' + p[0]); };
    ver(new Date(), 'Hoy');
  };

  // ---------- opciones ----------
  V.opciones = function () {
    pintar('<div class="menu">' +
      '<button class="mbtn" data-g="usuarioCambiar"><span class="ic">🙋</span><span>Cambiar usuario<small>Actual: ' + esc(usuario()) + '</small></span></button>' +
      '<button class="mbtn" id="resp"><span class="ic">☁︎</span><span>Respaldar ahora<small>' + (nubeLista() ? 'Sube la copia a la nube' : 'Primero configura la nube') + '</small></span></button>' +
      '<button class="mbtn" id="rest"><span class="ic">♻️</span><span>Restaurar desde la nube<small>Reemplaza la agenda de este dispositivo</small></span></button>' +
      '<button class="mbtn" id="arch"><span class="ic">🗂️</span><span>Archivar citas antiguas<small>Mueve al historial las de hace más de ' + cfg().diasHistorial + ' días</small></span></button>' +
      '<button class="mbtn" data-g="config"><span class="ic">🕘</span><span>Horario y reglas<small>Horas, intervalo, duración, días cerrados</small></span></button>' +
      '<button class="mbtn" data-g="nubeCfg"><span class="ic">🔗</span><span>Conexión a la nube<small>Dirección, clave y nombre del dispositivo</small></span></button>' +
      '<button class="mbtn" data-g="copia"><span class="ic">💾</span><span>Copia en archivo<small>Descargar o cargar un CSV</small></span></button>' +
      '</div><p class="k" style="margin-top:16px">Dispositivo: ' + esc(nube().dispositivo || '—') + ' · Última copia: ' + esc(LS.get('syncOk', '—')) + '</p>', true, 'Opciones');
    $app.querySelectorAll('[data-g]').forEach(function (b) { b.onclick = function () { go(b.getAttribute('data-g')); }; });
    $('#resp').onclick = function () { sincronizar(true); };
    $('#rest').onclick = restaurar;
    $('#arch').onclick = function () { archivarAhora(true); };
  };
  V.usuarioCambiar = function () {
    pintar('<div class="card"><label for="u" style="margin-top:0">Nombre del usuario</label><input id="u" autocomplete="off" autocapitalize="words" maxlength="40" value="' + esc(usuario()) + '"><div id="e"></div>' +
      '<p class="hint">Cada usuario ve solo su propia agenda en este dispositivo.</p><button class="btn" id="ok">Guardar</button></div>', true, 'Cambiar usuario');
    $('#ok').onclick = function () {
      var v = $('#u').value.trim();
      if (C.validarUsuario(v) !== 'OK') { $('#e').innerHTML = errorHtml('ERROR_USUARIO'); return; }
      LS.set('usuario', C.titulo(v)); toast('Usuario: ' + C.titulo(v)); inicio();
    };
  };
  V.config = function () {
    var c = cfg(), cerr = String(c.diasCerrados).split(/[^0-9]+/);
    var dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    pintar('<div class="card">' +
      '<div class="row"><div><label for="hi" style="margin-top:0">Abre (hora)</label><input id="hi" type="number" min="0" max="23" value="' + c.horaInicio + '"></div>' +
      '<div><label for="hf" style="margin-top:0">Cierra (hora)</label><input id="hf" type="number" min="1" max="24" value="' + c.horaFin + '"></div></div>' +
      '<div class="row"><div><label for="iv">Cada cuántos min</label><input id="iv" type="number" min="5" max="240" value="' + c.intervalo + '"></div>' +
      '<div><label for="mg">Margen entre citas</label><input id="mg" type="number" min="0" max="120" value="' + c.margen + '"></div></div>' +
      '<label for="ms">Máximo de meses hacia adelante</label><input id="ms" type="number" min="1" max="36" value="' + c.mesesMax + '">' +
      '<label>Días cerrados</label><div class="days">' + dias.map(function (d, i) { return '<label><input type="checkbox" data-d="' + (i + 1) + '"' + (cerr.indexOf(String(i + 1)) >= 0 ? ' checked' : '') + '>' + d + '</label>'; }).join('') + '</div>' +
      '<label for="ud">Usar duración por cita</label><select id="ud"><option value="NO"' + (c.usarDuracion ? '' : ' selected') + '>No (todas ocupan el intervalo)</option><option value="SI"' + (c.usarDuracion ? ' selected' : '') + '>Sí (elegir al agendar)</option></select>' +
      '<div class="row"><div><label for="dd">Duración por defecto (min)</label><input id="dd" type="number" min="5" max="600" value="' + c.duracionDefault + '"></div>' +
      '<div><label for="dh">Archivar después de (días)</label><input id="dh" type="number" min="1" max="365" value="' + c.diasHistorial + '"></div></div>' +
      '<label for="dl">Duraciones disponibles (separadas por coma)</label><input id="dl" value="' + esc(c.duraciones) + '">' +
      '<div style="height:14px"></div><button class="btn" id="ok">Guardar</button></div>', true, 'Horario y reglas');
    $('#ok').onclick = function () {
      var n = {
        horaInicio: +$('#hi').value, horaFin: +$('#hf').value, intervalo: +$('#iv').value, margen: +$('#mg').value, mesesMax: +$('#ms').value,
        diasCerrados: Array.prototype.map.call($app.querySelectorAll('[data-d]:checked'), function (x) { return x.getAttribute('data-d'); }).join(','),
        usarDuracion: $('#ud').value, duracionDefault: +$('#dd').value, diasHistorial: +$('#dh').value, duraciones: $('#dl').value
      };
      if (!(n.horaFin > n.horaInicio)) { toast('La hora de cierre debe ser mayor que la de apertura'); return; }
      LS.set('cfg', JSON.stringify(n)); toast('Guardado'); atras();
    };
  };
  V.nubeCfg = function () {
    var n = nube();
    pintar('<div class="card"><label for="url" style="margin-top:0">Dirección (termina en /exec)</label><input id="url" autocomplete="off" autocapitalize="off" value="' + esc(n.url) + '">' +
      '<label for="tk">Clave (token)</label><input id="tk" type="password" autocomplete="off" autocapitalize="off" value="' + esc(n.token) + '">' +
      '<label for="dv">Nombre de este dispositivo</label><input id="dv" autocomplete="off" autocapitalize="off" value="' + esc(n.dispositivo) + '" placeholder="Ej. Recepcion1">' +
      '<p class="hint">Sin espacios ni acentos. Cada dispositivo debe tener un nombre distinto.</p><div id="e"></div>' +
      '<div class="stack"><button class="btn" id="ok">Guardar y probar</button><button class="btn sec" id="lk">Copiar enlace para otro dispositivo</button></div></div>', true, 'Conexión a la nube');
    function leer() { return { url: $('#url').value.trim(), token: $('#tk').value.trim(), dispositivo: $('#dv').value.trim() }; }
    $('#ok').onclick = function () {
      var v = leer();
      if (v.url && !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(v.url)) { $('#e').innerHTML = '<div class="err">La dirección debe empezar con https://script.google.com/macros/s/ y terminar en /exec</div>'; return; }
      if (v.dispositivo && !/^[A-Za-z0-9_-]{1,30}$/.test(v.dispositivo)) { $('#e').innerHTML = '<div class="err">El nombre del dispositivo solo puede tener letras, números, guion y guion bajo.</div>'; return; }
      LS.set('nube', JSON.stringify(v));
      if (!(v.url && v.token && v.dispositivo)) { toast('Guardado'); atras(); return; }
      $('#ok').disabled = true; $('#ok').textContent = 'Probando…';
      llamar('ping').then(function (t) {
        if (t.indexOf('PING_OK') === 0) { toast('Conexión correcta'); LS.set('dirty', '1'); sincronizar(false); atras(); }
        else { $('#e').innerHTML = '<div class="err">' + esc(t.indexOf('ERROR_TOKEN') === 0 ? 'La clave no coincide con la del script.' : 'Respuesta inesperada: ' + t.slice(0, 80)) + '</div>'; }
      }).catch(function () { $('#e').innerHTML = '<div class="err">No se pudo conectar. Revisa internet y la dirección.</div>'; })
        .then(function () { var b = $('#ok'); if (b) { b.disabled = false; b.textContent = 'Guardar y probar'; } });
    };
    $('#lk').onclick = function () {
      var v = leer();
      var enlace = location.origin + location.pathname + '#cfg=' + btoa(unescape(encodeURIComponent(JSON.stringify({ u: v.url, t: v.token, d: '' }))));
      var fin = function () { toast('Enlace copiado. Contiene la clave: compártelo solo con tu equipo.'); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(enlace).then(fin, function () { dialogo('Enlace', enlace, 'Cerrar'); });
      else dialogo('Enlace', enlace, 'Cerrar');
    };
  };
  V.copia = function () {
    pintar('<div class="card stack"><p style="margin:0">El archivo tiene el mismo formato que usa la macro de Android: <span class="k">nombre,servicio,inicio,duracion,usuario,id</span></p>' +
      '<button class="btn" id="dl">Descargar copia (CSV)</button><button class="btn sec" id="up">Cargar un CSV (reemplaza la agenda)</button>' +
      '<input type="file" id="fi" accept=".csv,text/csv,text/plain" hidden></div>', true, 'Copia en archivo');
    $('#dl').onclick = function () {
      var b = new Blob([csv() || '\n'], { type: 'text/csv;charset=utf-8' }), a = document.createElement('a');
      a.href = URL.createObjectURL(b); a.download = 'base_datos_citas.csv'; document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    };
    $('#up').onclick = function () { $('#fi').click(); };
    $('#fi').onchange = function () {
      var f = this.files[0]; if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        var t = String(rd.result || ''), validas = C.filas(t).length;
        if (!validas) { toast('El archivo no tiene citas con el formato correcto'); return; }
        dialogo('¿Reemplazar la agenda?', 'Se cargarán ' + validas + ' citas y se reemplazará lo que hay en este dispositivo (antes se guarda un respaldo).', 'Reemplazar', 'Cancelar', true).then(function (si) {
          if (!si) return;
          var limpio = t.replace(/\r/g, '').split('\n').filter(function (x) { return C.campos(x); }).join('\n') + '\n';
          guardarCsv(limpio); toast('Agenda cargada'); inicio();
        });
      };
      rd.readAsText(f);
    };
  };

  // ---------- archivo mensual ----------
  function aplicarArchivo(r) {
    var h = LS.get('hist', '');
    LS.set('hist', h + r.archivadas); LS.set('histDirty', '1');
    LS.set('bak', csv()); guardarCsv(r.activas);
  }
  function archivarAhora(manual) {
    var r = C.archivar(csv(), cfg(), new Date());
    if (!r.n) { if (manual) toast('No hay citas antiguas para archivar'); return; }
    aplicarArchivo(r);
    if (manual) toast(r.n + ' cita' + (r.n === 1 ? '' : 's') + ' archivada' + (r.n === 1 ? '' : 's'));
  }
  function archivoAutomatico() {
    var mes = C.mesActual(new Date());
    if (LS.get('ultimoMes', '') === mes) return;
    var r = C.archivar(csv(), cfg(), new Date());
    if (r.n) aplicarArchivo(r);
    LS.set('ultimoMes', mes);
  }

  // ---------- nube ----------
  function llamar(accion, cuerpo) {
    var n = nube(), ctl = ('AbortController' in window) ? new AbortController() : null, to = setTimeout(function () { if (ctl) ctl.abort(); }, 25000);
    var url = n.url + '?accion=' + accion + '&token=' + encodeURIComponent(n.token) + '&dispositivo=' + encodeURIComponent(n.dispositivo);
    var o = { redirect: 'follow', signal: ctl ? ctl.signal : undefined };
    if (cuerpo !== undefined) { o.method = 'POST'; o.headers = { 'Content-Type': 'text/plain;charset=utf-8' }; o.body = cuerpo; }
    return fetch(url, o).then(function (r) { return r.text(); }).then(function (t) { clearTimeout(to); return t; }, function (e) { clearTimeout(to); throw e; });
  }
  var sincronizando = false;
  function sincronizar(manual) {
    if (!nubeLista()) { if (manual) toast('La nube no está configurada (Opciones > Conexión a la nube)'); return Promise.resolve(false); }
    if (sincronizando) return Promise.resolve(false);
    sincronizando = true;
    var paso = Promise.resolve(true);
    if (manual || LS.get('dirty', '') === '1') {
      paso = llamar('snapshot', csv() || '\n').then(function (t) {
        if (t.indexOf('SYNC_OK') === 0) { LS.set('syncOk', t.split('|')[1] || ''); LS.set('dirty', ''); return true; }
        throw new Error(t);
      });
    }
    return paso.then(function (ok) {
      var h = LS.get('hist', '');
      if (h.indexOf(',') >= 0 && (LS.get('histDirty', '') === '1')) {
        return llamar('historial', h).then(function (t) {
          if (t.indexOf('HIST_OK') === 0) { LS.set('hist', ''); LS.set('histDirty', ''); }
          return true;
        });
      }
      return ok;
    }).then(function () {
      sincronizando = false;
      if (manual) toast('Copia en la nube lista'); refrescarChip(); return true;
    }, function (e) {
      sincronizando = false;
      if (manual) toast(String(e && e.message || '').indexOf('ERROR_TOKEN') === 0 ? 'La clave no coincide con la del script' : 'No se pudo respaldar. Revisa internet y la configuración.');
      refrescarChip(); return false;
    });
  }
  function refrescarChip() {
    var ch = $('#chipnube');
    if (!ch) return;
    ch.outerHTML = estadoNube();
    var n = $('#chipnube'); if (n) n.onclick = function () { sincronizar(true); };
  }
  function restaurar() {
    if (!nubeLista()) { toast('La nube no está configurada'); return; }
    dialogo('¿Restaurar desde la nube?', 'Se reemplazará la agenda de este dispositivo por la última copia guardada en la nube. Antes se guarda un respaldo local.', 'Restaurar', 'Cancelar', true).then(function (si) {
      if (!si) return;
      llamar('restore').then(function (t) {
        if (t.indexOf('RESTORE_OK') !== 0) { toast(t.indexOf('ERROR_SIN_COPIA') === 0 ? 'Aún no hay copia de este dispositivo en la nube' : 'No se pudo restaurar'); return; }
        var cuerpo = t.replace(/^RESTORE_OK\r?\n?/, '');
        LS.set('bak', csv()); LS.set('csv', cuerpo.trim() ? cuerpo : '\n'); LS.set('prev', ''); LS.set('dirty', '1');
        toast('Agenda restaurada'); inicio();
      }, function () { toast('No se pudo conectar'); });
    });
  }

  // ---------- arranque ----------
  function leerEnlaceCfg() {
    var m = /^#cfg=(.+)$/.exec(location.hash || '');
    if (!m) return;
    try {
      var o = JSON.parse(decodeURIComponent(escape(atob(m[1]))));
      var n = nube(); n.url = o.u || n.url; n.token = o.t || n.token; if (o.d) n.dispositivo = o.d;
      LS.set('nube', JSON.stringify(n));
      history.replaceState(null, '', location.pathname);
      setTimeout(function () { toast(n.dispositivo ? 'Configuración cargada' : 'Falta nombre del dispositivo: Opciones > Conexión a la nube'); }, 400);
    } catch (e) { /* enlace inválido */ }
  }
  function arrancar() {
    leerEnlaceCfg();
    archivoAutomatico();
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { }
    inicio();
    sincronizar(false);
    window.addEventListener('online', function () { sincronizar(false); });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') { sincronizar(false); } });
    setInterval(function () { sincronizar(false); }, 5 * 60 * 1000);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () { });
  }
  window.__citas = { go: go, V: V };   // para pruebas
  arrancar();
})();
