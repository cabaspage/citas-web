# Citas web (iPhone y Android)

Es la misma agenda de la macro, pero como página que se instala en la pantalla de inicio. Usa el mismo Code.gs y el mismo formato de CSV.

## 1. Publicar (una sola vez)
La página necesita una dirección https. Lo más simple y gratis:
- Netlify Drop (app.netlify.com/drop): arrastra la carpeta `citas-web` y te da una dirección. O
- GitHub Pages: sube los archivos a un repositorio y activa Pages.
Deja todos los archivos juntos: index.html, app.js, core.js, sw.js, manifest.webmanifest e iconos.
Cuando cambies algo, sube de nuevo los archivos y cambia `VERSION` en sw.js.

## 2. Instalar en cada teléfono
- iPhone: abre la dirección en Safari > Compartir > "Añadir a pantalla de inicio". Úsala siempre desde ese ícono.
- Android: Chrome > menú > "Instalar app".

## 3. Configurar (en cada teléfono)
1. Primera vez: escribe tu nombre de usuario.
2. Opciones > Conexión a la nube: dirección /exec de tu Apps Script, clave (token) y un nombre de dispositivo distinto por teléfono (ej. Recepcion1, Recepcion2).
3. Con el botón "Copiar enlace para otro dispositivo" se pasan la dirección y la clave al segundo teléfono; solo falta poner su nombre de dispositivo.
4. Opciones > Horario y reglas: horas, intervalo, días cerrados, duración opcional.

## Cómo funciona
- La agenda vive en el teléfono (funciona sin internet). Cada cambio sube una copia completa a la nube cuando hay conexión.
- Cada persona ve solo su agenda; dos personas pueden tener la misma hora.
- El historial archivado sube a la pestaña Historial. Restaurar trae la última copia de ese dispositivo.
- Opciones > Copia en archivo: descarga o carga el CSV (compatible con la macro de Android).

## Importante en iPhone
- Instálala en la pantalla de inicio: Safari borra los datos de sitios que no se usan en ~7 días, pero no los de apps instaladas.
- Mantén el respaldo en la nube activo: es la protección si se pierde o se reinicia el teléfono.
