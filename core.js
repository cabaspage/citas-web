/* Citas – lógica pura (sin pantalla). Mismas reglas que la macro de Android.
   CSV sin encabezado: nombre,servicio,inicio,duracion,usuario,id   (inicio = dd-MM-yyyy HH:mm) */
(function (root) {
  'use strict';

  var DEF_CFG = {
    horaInicio: 9, horaFin: 18, intervalo: 30, margen: 0, mesesMax: 12,
    diasCerrados: '', usarDuracion: false, duracionDefault: 30,
    duraciones: '30,60,90,120', diasHistorial: 30
  };

  function cfgDe(c) {
    var o = {}, k;
    for (k in DEF_CFG) o[k] = DEF_CFG[k];
    c = c || {};
    for (k in DEF_CFG) if (c[k] !== undefined && c[k] !== null && c[k] !== '') o[k] = c[k];
    ['horaInicio', 'horaFin', 'intervalo', 'margen', 'mesesMax', 'duracionDefault', 'diasHistorial'].forEach(function (n) {
      var v = parseInt(o[n], 10); o[n] = isNaN(v) ? DEF_CFG[n] : v;
    });
    o.usarDuracion = (o.usarDuracion === true || clave(String(o.usarDuracion)) === 'si');
    o.diasCerrados = String(o.diasCerrados || '');
    if (o.intervalo < 1) o.intervalo = 30;
    if (o.duracionDefault < 5 || o.duracionDefault > 600) o.duracionDefault = 30;
    if (o.diasHistorial < 1) o.diasHistorial = 30;
    return o;
  }

  // minúsculas, sin acentos, ñ -> n, espacios simples
  function clave(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function titulo(s) {
    return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase().replace(/(^|[ \-'])(\p{L})/gu, function (m, a, b) {
      return a + b.toUpperCase();
    });
  }

  var PN = /^\p{L}+(['\-]\p{L}+)*( +\p{L}+(['\-]\p{L}+)*)*$/u;
  var TOK = "([\\p{L}\\p{N}]+(['\\-+/.][\\p{L}\\p{N}]+)*|\\+)";
  var PS = new RegExp('^' + TOK + '( +' + TOK + ')*$', 'u');

  function validarNombre(n) { n = String(n || '').trim(); return n.length > 0 && n.length <= 40 && PN.test(n); }
  function validarServicio(s) { s = String(s || '').trim(); return s.length > 0 && s.length <= 40 && PS.test(s); }
  function validarTexto(nombre, servicio) {
    if (!validarNombre(nombre)) return 'ERROR_NOMBRE';
    if (!validarServicio(servicio)) return 'ERROR_SERVICIO';
    return 'OK';
  }
  function validarUsuario(u) { return validarNombre(u) ? 'OK' : 'ERROR_USUARIO'; }

  // ---------- fechas (minutos desde 1970, hora local) ----------
  function aMinutos(txt) {
    var m = /^\s*(\d{1,2})-(\d{1,2})-(\d{4}) +(\d{1,2}):(\d{1,2})\s*$/.exec(String(txt || ''));
    if (!m) return -1;
    var d = +m[1], mo = +m[2], y = +m[3], h = +m[4], mi = +m[5];
    if (mo < 1 || mo > 12 || d < 1 || h > 23 || mi > 59) return -1;
    var dt = new Date(y, mo - 1, d, h, mi, 0, 0);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return -1;
    return Math.floor(dt.getTime() / 60000);
  }
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function fmt(min) {
    var d = new Date(min * 60000);
    return p2(d.getDate()) + '-' + p2(d.getMonth() + 1) + '-' + d.getFullYear() + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  }
  function hora(min) { return fmt(min).substring(11); }
  function ahoraMin(now) { return Math.floor((now ? now.getTime() : Date.now()) / 60000); }
  function inicioDia(now) { var d = now ? new Date(now.getTime()) : new Date(); d.setHours(0, 0, 0, 0); return Math.floor(d.getTime() / 60000); }
  function mismoDia(a, b) { var x = new Date(a * 60000), y = new Date(b * 60000); return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate(); }
  function diaCerrado(dow, cerrados) { // dow estilo Java: 1=domingo ... 7=sábado
    var l = String(cerrados || '').split(/[^0-9]+/);
    for (var i = 0; i < l.length; i++) if (l[i] !== '' && parseInt(l[i], 10) === dow) return true;
    return false;
  }
  function dowJava(min) { return new Date(min * 60000).getDay() + 1; }
  function aDMY(date) { return p2(date.getDate()) + '-' + p2(date.getMonth() + 1) + '-' + date.getFullYear(); }

  // ---------- CSV ----------
  function lineas(csv) { return String(csv || '').replace(/\r/g, '').split('\n'); }
  function campos(l) {
    if (l == null || String(l).trim() === '') return null;
    var p = String(l).split(',');
    if (p.length < 6) return null;
    return p.map(function (x) { return x.trim(); });
  }
  function normLinea(l) { var p = campos(l); return p ? p.join(',') : String(l).trim(); }
  function durDe(p, def) { var d = parseInt(p[3], 10); return (d >= 5 && d <= 600) ? d : def; }
  function solapa(s1, d1, s2, d2, margen) { return s1 < s2 + d2 + margen && s2 < s1 + d1 + margen; }
  function nuevoId() {
    var a = 'abcdefghijklmnopqrstuvwxyz0123456789', s = Date.now().toString(36);
    for (var i = 0; i < 4; i++) s += a.charAt(Math.floor(Math.random() * a.length));
    return s;
  }
  function filas(csv) { // [{i, p, ini, dur}] válidas
    var out = [], ls = lineas(csv);
    for (var i = 0; i < ls.length; i++) {
      var p = campos(ls[i]); if (!p) continue;
      out.push({ i: i, p: p, ini: aMinutos(p[2]) });
    }
    return out;
  }
  function aCsv(arr) { // arr de líneas ya normalizadas
    var s = arr.filter(function (x) { return String(x).trim() !== ''; }).join('\n');
    return s ? s + '\n' : '\n';
  }

  function revisarFecha(m, dur, c, now) {
    var ahora = ahoraMin(now);
    if (m < ahora) return 'ERROR_FECHA_PASADA';
    var lim = now ? new Date(now.getTime()) : new Date();
    lim.setMonth(lim.getMonth() + c.mesesMax);
    if (m > Math.floor(lim.getTime() / 60000)) return 'ERROR_FECHA_LEJANA';
    if (diaCerrado(dowJava(m), c.diasCerrados)) return 'ERROR_DIA_CERRADO';
    var d = new Date(m * 60000), mdd = d.getHours() * 60 + d.getMinutes();
    if (mdd < c.horaInicio * 60 || mdd + dur > c.horaFin * 60) return 'ERROR_HORARIO';
    if (c.intervalo > 0 && mdd % c.intervalo !== 0) return 'ERROR_INTERVALO';
    return '';
  }

  // ---------- horarios ----------
  // opts: { propia: {cli, ser, min} | null, dur }
  function horarios(csv, cfg, usuario, fechaDMY, opts, now) {
    var c = cfgDe(cfg), uk = clave(usuario);
    opts = opts || {};
    if (!uk) return { error: 'ERROR_FATAL_USUARIO' };
    var dur = c.usarDuracion ? parseInt(opts.dur, 10) : c.duracionDefault;
    if (isNaN(dur)) dur = c.duracionDefault;
    if (dur < 5 || dur > 600) return { error: 'ERROR_DURACION' };
    var fs = filas(csv), propia = -1, minPropia = -1;
    if (opts.propia) {
      var f0 = ubicar(csv, uk, opts.propia);
      if (!f0) return { error: 'ERROR_FATAL_NO_ENCONTRADA' };
      propia = f0.i; minPropia = f0.ini;
      dur = durDe(f0.p, c.duracionDefault);
    }
    var base = aMinutos(fechaDMY + ' 0:0');
    if (base < 0) return { error: 'ERROR_FECHA' };
    if (base < inicioDia(now)) return { error: 'ERROR_FECHA_PASADA' };
    var lim = now ? new Date(now.getTime()) : new Date(); lim.setMonth(lim.getMonth() + c.mesesMax);
    if (base > Math.floor(lim.getTime() / 60000)) return { error: 'ERROR_FECHA_LEJANA' };
    if (diaCerrado(dowJava(base), c.diasCerrados)) return { error: 'ERROR_DIA_CERRADO' };
    var oc = [];
    fs.forEach(function (f) {
      if (f.i === propia || clave(f.p[4]) !== uk || f.ini < 0 || Math.abs(f.ini - base) > 2 * 1440) return;
      oc.push([f.ini, durDe(f.p, c.duracionDefault)]);
    });
    var ahora = ahoraMin(now), out = [], d0 = new Date(base * 60000);
    for (var t = c.horaInicio * 60; t + dur <= c.horaFin * 60; t += c.intervalo) {
      var slot = Math.floor(new Date(d0.getFullYear(), d0.getMonth(), d0.getDate(), Math.floor(t / 60), t % 60).getTime() / 60000);
      if (slot < ahora || slot === minPropia) continue;
      var ocupado = oc.some(function (o) { return solapa(slot, dur, o[0], o[1], c.margen); });
      if (ocupado) continue;
      var h1 = p2(Math.floor(t / 60)) + ':' + p2(t % 60), f2 = t + dur;
      out.push({ min: slot, hora: h1, etiqueta: c.usarDuracion ? h1 + ' a ' + p2(Math.floor(f2 / 60)) + ':' + p2(f2 % 60) : h1 });
    }
    if (!out.length) return { error: 'ERROR_SIN_HORARIOS' };
    return { slots: out, dur: dur };
  }

  // ---------- operaciones (devuelven {csv, ...} o {error}) ----------
  function agendar(csv, cfg, usuario, nombre, servicio, minutos, dur, now) {
    var c = cfgDe(cfg), uk = clave(usuario);
    if (!uk) return { error: 'ERROR_FATAL_USUARIO' };
    nombre = String(nombre || '').trim(); servicio = String(servicio || '').trim().replace(/ +/g, ' ');
    if (!validarNombre(nombre) || !validarServicio(servicio)) return { error: 'ERROR_FATAL_FORMATO' };
    if (!validarNombre(usuario)) return { error: 'ERROR_FATAL_USUARIO' };
    var d = c.usarDuracion ? parseInt(dur, 10) : c.duracionDefault;
    if (isNaN(d) || d < 5 || d > 600) return { error: 'ERROR_DURACION' };
    if (!(minutos >= 0)) return { error: 'ERROR_FECHA' };
    var e = revisarFecha(minutos, d, c, now);
    if (e) return { error: e };
    var fs = filas(csv);
    for (var i = 0; i < fs.length; i++) {
      var f = fs[i];
      if (clave(f.p[4]) !== uk || f.ini < 0) continue;
      if (solapa(minutos, d, f.ini, durDe(f.p, c.duracionDefault), c.margen)) return { error: 'ERROR_EMPALME' };
    }
    var fila = [titulo(nombre), servicio, fmt(minutos), d, titulo(usuario), nuevoId()];
    var ls = lineas(csv).filter(function (x) { return x.trim() !== ''; }).map(normLinea);
    ls.push(fila.join(','));
    return { csv: aCsv(ls), fila: fila, dur: d };
  }

  function buscarFila(csv, uk, cli, ser, min) {
    var fs = filas(csv);
    for (var i = 0; i < fs.length; i++) {
      var f = fs[i];
      if (clave(f.p[4]) === uk && clave(f.p[0]) === cli && clave(f.p[1]) === ser && f.ini === min) return f;
    }
    return null;
  }

  // cita = {id} (preferido) o {cli, ser, min}
  function ubicar(csv, uk, cita) {
    var fs = filas(csv);
    for (var i = 0; i < fs.length; i++) {
      var f = fs[i];
      if (clave(f.p[4]) !== uk) continue;
      if (cita.id) { if (f.p[5] === cita.id) return f; }
      else if (clave(f.p[0]) === clave(cita.cli) && clave(f.p[1]) === clave(cita.ser) && f.ini === cita.min) return f;
    }
    return null;
  }

  function modificar(csv, cfg, usuario, cita, nuevaMin, now) {
    var c = cfgDe(cfg), uk = clave(usuario);
    if (!uk) return { error: 'ERROR_FATAL_USUARIO' };
    var f = ubicar(csv, uk, cita);
    if (!f) return { error: 'ERROR_FATAL_NO_ENCONTRADA' };
    var dur = durDe(f.p, c.duracionDefault);
    if (!(nuevaMin >= 0)) return { error: 'ERROR_FECHA' };
    var e = revisarFecha(nuevaMin, dur, c, now);
    if (e) return { error: e };
    if (nuevaMin === f.ini) return { error: 'ERROR_MISMA_FECHA' };
    var fs = filas(csv);
    for (var i = 0; i < fs.length; i++) {
      var g = fs[i];
      if (g.i === f.i || clave(g.p[4]) !== uk || g.ini < 0) continue;
      if (solapa(nuevaMin, dur, g.ini, durDe(g.p, c.duracionDefault), c.margen)) return { error: 'ERROR_EMPALME' };
    }
    var ls = lineas(csv), out = [];
    for (var j = 0; j < ls.length; j++) {
      if (ls[j].trim() === '') continue;
      if (j === f.i) { var q = f.p.slice(); q[2] = fmt(nuevaMin); out.push(q.join(',')); }
      else out.push(normLinea(ls[j]));
    }
    return { csv: aCsv(out), antes: f.ini, fila: f.p, dur: dur };
  }

  function cancelar(csv, usuario, cita) {
    var uk = clave(usuario);
    if (!uk) return { error: 'ERROR_FATAL_USUARIO' };
    var f = ubicar(csv, uk, cita);
    if (!f) return { error: 'ERROR_FATAL_NO_ENCONTRADA' };
    var ls = lineas(csv), out = [];
    for (var j = 0; j < ls.length; j++) { if (j === f.i || ls[j].trim() === '') continue; out.push(normLinea(ls[j])); }
    return { csv: aCsv(out), fila: f.p, ini: f.ini };
  }

  // ---------- consultas ----------
  function clientes(csv, usuario, filtro, soloFuturas, now) {
    var uk = clave(usuario), fk = clave(filtro), ahora = ahoraMin(now), vistos = {}, nombres = [];
    if (!uk) return { error: 'ERROR_FATAL_USUARIO' };
    if (!String(csv || '').trim()) return { error: 'ERROR_ARCHIVO_VACIO' };
    filas(csv).forEach(function (f) {
      if (clave(f.p[4]) !== uk || !f.p[0]) return;
      if (soloFuturas && (f.ini < 0 || f.ini < ahora)) return;
      var k = clave(f.p[0]);
      if (fk && k.indexOf(fk) < 0) return;
      if (!vistos[k]) { vistos[k] = 1; nombres.push({ clave: k, nombre: titulo(f.p[0]) }); }
    });
    if (!nombres.length) return { error: fk ? 'ERROR_SIN_COINCIDENCIAS' : (soloFuturas ? 'ERROR_SIN_CLIENTES' : 'ERROR_ARCHIVO_VACIO') };
    nombres.sort(function (a, b) { return a.nombre < b.nombre ? -1 : (a.nombre > b.nombre ? 1 : 0); });
    return { lista: nombres };
  }

  function citasDeCliente(csv, cfg, usuario, claveCli, now) {
    var c = cfgDe(cfg), uk = clave(usuario), ahora = ahoraMin(now), existe = false, out = [];
    if (!uk) return { error: 'ERROR_FATAL_USUARIO' };
    if (!String(csv || '').trim()) return { error: 'ERROR_ARCHIVO_VACIO' };
    filas(csv).forEach(function (f) {
      if (clave(f.p[4]) !== uk || clave(f.p[0]) !== claveCli) return;
      existe = true;
      if (f.ini >= 0 && f.ini >= ahora) out.push({ id: f.p[5], cli: f.p[0], ser: f.p[1], min: f.ini, dur: durDe(f.p, c.duracionDefault) });
    });
    if (!existe) return { error: 'ERROR_CLIENTE_NO_EXISTE' };
    if (!out.length) return { error: 'ERROR_SIN_CITAS' };
    out.sort(function (a, b) { return a.min - b.min; });
    return { citas: out };
  }

  function citasDelDia(csv, cfg, usuario, base) {
    var c = cfgDe(cfg), uk = clave(usuario), out = [];
    filas(csv).forEach(function (f) {
      if (clave(f.p[4]) !== uk || f.ini < 0 || !mismoDia(f.ini, base)) return;
      out.push({ id: f.p[5], cli: f.p[0], ser: f.p[1], min: f.ini, dur: durDe(f.p, c.duracionDefault) });
    });
    out.sort(function (a, b) { return a.min - b.min; });
    return out;
  }

  // ---------- archivo ----------
  function archivar(csv, cfg, now) {
    var c = cfgDe(cfg);
    if (!String(csv || '').trim()) return { n: 0 };
    var corte = inicioDia(now) - c.diasHistorial * 1440, act = [], arch = [];
    lineas(csv).forEach(function (l) {
      if (l.trim() === '') return;
      var p = campos(l), m = p ? aMinutos(p[2]) : -1;
      if (p && m >= 0 && m < corte) arch.push(normLinea(l)); else act.push(normLinea(l));
    });
    if (!arch.length) return { n: 0 };
    return { n: arch.length, activas: aCsv(act), archivadas: aCsv(arch) };
  }
  function mesActual(now) { var d = now || new Date(); return d.getFullYear() + '-' + p2(d.getMonth() + 1); }

  // ---------- mensajes ----------
  function mensaje(code, cfg) {
    var c = cfgDe(cfg);
    var M = {
      ERROR_NOMBRE: 'El nombre solo puede tener letras, espacios, guion o apóstrofe (máximo 40 caracteres).',
      ERROR_SERVICIO: 'El servicio solo puede tener letras, números, espacios y los signos - \' + / . (máximo 40 caracteres). No uses comas.',
      ERROR_USUARIO: 'El usuario solo puede tener letras, espacios, guion o apóstrofe (máximo 40 caracteres).',
      ERROR_SIN_HORARIOS: 'No hay horarios disponibles para esa fecha. Elige otra.',
      ERROR_FECHA_PASADA: 'No puedes elegir una fecha u hora que ya pasó.',
      ERROR_FECHA_LEJANA: 'La fecha es demasiado lejana (máximo ' + c.mesesMax + ' meses).',
      ERROR_DIA_CERRADO: 'Ese día el negocio está cerrado. Elige otra fecha.',
      ERROR_FECHA: 'No se pudo leer la fecha u hora seleccionada.',
      ERROR_HORARIO: 'La cita debe quedar entre las ' + c.horaInicio + ':00 y las ' + c.horaFin + ':00 hrs (considerando su duración).',
      ERROR_INTERVALO: 'Las citas deben empezar cada ' + c.intervalo + ' minutos.',
      ERROR_DURACION: 'La duración de la cita no es válida.',
      ERROR_EMPALME: 'Ya tienes una cita en ese horario. Elige otro.',
      ERROR_MISMA_FECHA: 'La nueva fecha y hora es la misma que la actual. Elige otra.',
      ERROR_SIN_COINCIDENCIAS: 'No hay clientes que coincidan con lo que escribiste.',
      ERROR_SIN_CLIENTES: 'No hay clientes con citas pendientes en esta agenda.',
      ERROR_SIN_CITAS: 'Este cliente no tiene citas pendientes.',
      ERROR_CLIENTE_NO_EXISTE: 'El cliente no existe en esta agenda.',
      ERROR_ARCHIVO_VACIO: 'No hay citas registradas en esta agenda.',
      ERROR_FATAL_USUARIO: 'Falta definir el usuario. Entra a Opciones > Cambiar usuario.',
      ERROR_FATAL_NO_ENCONTRADA: 'La cita ya no existe (pudo haber cambiado). Vuelve a intentarlo.',
      ERROR_FATAL_FORMATO: 'Los datos de la cita no tienen un formato válido.'
    };
    return M[code] || ('Ocurrió un error (' + code + ').');
  }

  var api = {
    DEF_CFG: DEF_CFG, cfgDe: cfgDe, clave: clave, titulo: titulo, validarNombre: validarNombre, validarServicio: validarServicio,
    validarTexto: validarTexto, validarUsuario: validarUsuario, aMinutos: aMinutos, fmt: fmt, hora: hora, aDMY: aDMY,
    mismoDia: mismoDia, inicioDia: inicioDia, diaCerrado: diaCerrado, horarios: horarios, agendar: agendar,
    modificar: modificar, cancelar: cancelar, clientes: clientes, citasDeCliente: citasDeCliente,
    citasDelDia: citasDelDia, archivar: archivar, mesActual: mesActual, mensaje: mensaje, filas: filas,
    campos: campos, buscarFila: buscarFila, solapa: solapa, durDe: durDe
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CitasCore = api;
})(typeof self !== 'undefined' ? self : this);
