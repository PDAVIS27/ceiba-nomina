# Ceiba — Nómina para Nicaragua

Plataforma real (no una simulación) para vender nómina a pequeños negocios,
calculada según el **Art. 23 de la Ley 822** y su Reglamento. Incluye:

- Login real con contraseñas encriptadas (nadie puede ver la contraseña de nadie, ni tú).
- Cuenta de **proveedor** (tú): registras negocios clientes, ves casos que requieren
  tu intervención y tienes un simulador para verificar cualquier cálculo a mano.
- Cuenta de **negocio** (tu cliente): agrega colaboradores y corre su propia planilla.
- Base de datos real: lo que se guarda, se queda guardado — no son datos de ejemplo.

No necesitas saber programar para publicarla. Vas a usar solo páginas web
(GitHub y Vercel), sin instalar nada en tu computadora ni usar la terminal.

---

## Antes de empezar

Vas a crear dos cuentas gratuitas:

1. **GitHub** (github.com) — ahí vive el código.
2. **Vercel** (vercel.com) — ahí vive el sitio ya funcionando, con una base de
   datos incluida gratis para empezar.

Ambas se pueden crear con el mismo correo, sin tarjeta de crédito para el plan gratuito.

---

## Paso 1 — Sube el código a GitHub

1. Entra a **github.com**, crea tu cuenta si no tienes.
2. Arriba a la derecha, clic en el **+** → **New repository**.
3. Ponle de nombre `ceiba-nomina`, déjalo en **Private**, clic en **Create repository**.
4. En la página del repositorio recién creado, busca el enlace que dice
   **"uploading an existing file"**.
5. Descomprime el archivo `.zip` que te entregué en tu computadora. Arrastra
   **todo el contenido de la carpeta** (no la carpeta misma, lo de adentro) a esa página.
6. Baja hasta el final y clic en **Commit changes**.

Ya tienes el código en GitHub. No necesitaste ningún comando.

---

## Paso 2 — Crea el proyecto en Vercel

1. Entra a **vercel.com** → **Sign Up** → elige **"Continue with GitHub"**
   (así se conectan automáticamente).
2. Clic en **Add New** → **Project**.
3. Busca `ceiba-nomina` en la lista y clic en **Import**.
4. Vercel va a detectar que es un proyecto Next.js automáticamente. **No le des
   "Deploy" todavía** — primero hay que conectar la base de datos (paso 3).

---

## Paso 3 — Agrega la base de datos (gratis)

1. Todavía en la pantalla de importar el proyecto, o después en el panel del
   proyecto, ve a la pestaña **Storage**.
2. Clic en **Create Database** → elige **Postgres** (o "Neon", es el mismo motor).
3. Sigue el asistente con las opciones por defecto y conéctala a tu proyecto
   `ceiba-nomina`.
4. Esto agrega automáticamente la variable `DATABASE_URL` — no tienes que
   escribirla tú.

---

## Paso 4 — Agrega las dos variables que faltan

En el panel del proyecto, ve a **Settings → Environment Variables** y agrega:

| Variable | Valor |
|---|---|
| `NEXTAUTH_SECRET` | Un texto largo y aleatorio. Genera uno gratis en [generate-secret.vercel.app/32](https://generate-secret.vercel.app/32) y pégalo aquí. |
| `NEXTAUTH_URL` | La URL de tu sitio. Vercel te la muestra al desplegar, algo como `https://ceiba-nomina.vercel.app` — si todavía no la sabes, pon cualquier valor ahora y **corrígelo después del primer despliegue**. |

---

## Paso 5 — Despliega

1. Ve a la pestaña **Deployments** y clic en **Deploy** (o **Redeploy** si ya
   se había disparado uno).
2. Espera 2-3 minutos. Si algo sale mal, Vercel te muestra el error en rojo —
   cópiamelo y te ayudo a corregirlo.
3. Cuando termine, verás un botón **Visit** — ese es tu sitio, ya en vivo.
4. Si en el Paso 4 pusiste un valor provisional en `NEXTAUTH_URL`, ahora
   reemplázalo por la URL real que te dio Vercel, y dale **Redeploy** una vez más.

---

## Paso 6 — Crea tu cuenta de proveedor

1. Entra a `tu-sitio.vercel.app/setup` (una sola vez — después esta página se
   bloquea sola por seguridad).
2. Crea tu correo y contraseña. Esa es tu cuenta de administrador de Ceiba.
3. Inicia sesión en `/login` con esos mismos datos → entrarás directo al
   **panel de proveedor**.

---

## Paso 7 — Registra tu primer negocio piloto

1. En el panel de proveedor, llena "Registrar negocio" con el nombre del
   negocio y el correo del dueño o encargado de RRHH.
2. Te va a mostrar una contraseña temporal una sola vez — cópiala y envíasela
   a tu cliente por un canal seguro (WhatsApp o llamada, no por correo abierto).
3. Tu cliente entra en `/login` con ese correo y esa contraseña, y llega a su
   propio panel: ahí agrega a sus colaboradores y corre su planilla.

---

## Histórico de provisiones y liquidación al dar de baja

Cada vez que apruebas una planilla, la plataforma guarda cuánto se provisionó
ese período de aguinaldo, vacaciones e indemnización por antigüedad para cada
colaborador (Código del Trabajo, Ley 185). Eso arma un histórico acumulado
que puedes ver entrando al detalle de cualquier colaborador desde
Colaboradores → "Ver →".

**Importante — ahora hay que indicar la fecha de inicio y fin de cada
período** al correr la planilla (tanto la carga desde Excel como el
formulario a mano, en Nómina). La plataforma usa esa fecha de fin para saber
exactamente hasta qué día quedó cubierto cada colaborador, y así puede
**prorratear por día** cualquier tramo suelto entre la última planilla
aprobada y la fecha de baja (o "hoy", si el colaborador sigue activo) — así
nadie pierde los días de un período incompleto. El prorrateo usa la misma
convención de 30 días por mes que ya usa el resto de la nómina para el valor
diario del salario. Cuando aplica, verás una nota en el detalle del
colaborador indicando cuántos días se prorratearon.

*Períodos creados antes de este cambio no tienen fecha de fin guardada — para
esos, la plataforma usa la fecha en que se creó el período como aproximación.
No hace falta corregir nada a mano; simplemente los períodos nuevos van a
quedar más precisos.*

Desde la pantalla de detalle del colaborador puedes:

- **Registrar el pago de aguinaldo** (normalmente en diciembre) y **registrar
  vacaciones tomadas** — ambos reducen el saldo acumulado pendiente.
- **Dar de baja** a un colaborador: eliges la fecha y el tipo de baja
  (renuncia, despido con justa causa, despido sin causa, u otra causa ajena)
  y la plataforma calcula la liquidación en dos bloques, como un comprobante
  de liquidación tradicional — **Ingresos** y **Deducciones**:
  - **Ingresos**: aguinaldo pendiente e indemnización por antigüedad (ambos
    EXENTOS de INSS e IR — Art. 97 y Art. 45 CT, se pagan íntegros), más
    vacaciones pendientes y cualquier **pago pendiente** que agregues
    (opcional, puedes agregar varios a la vez: una quincena que no se
    alcanzó a planillar, un mes adicional, una comisión, etc. — ambos SÍ son
    gravables).
  - **Deducciones**: vacaciones pendientes y todos los pagos pendientes se
    SUMAN en una sola base gravable (el aguinaldo y la indemnización quedan
    fuera, por estar exentos) y el INSS laboral (7%) y el IR (Art. 23, Ley
    822) se calculan UNA sola vez sobre esa base combinada — no una vez por
    concepto — porque en la práctica se pagan juntos en el mismo cheque de
    liquidación. Así también lo hacen los formatos de liquidación reales que
    usan otras empresas.
  - **Neto a recibir** = Total ingresos − Total deducciones.

  Todo el desglose queda en el PDF descargable de la liquidación, con las
  mismas dos secciones.

En cualquier PDF que generes (preplanilla, planilla aprobada, comprobante
individual o liquidación), las columnas y secciones ahora están agrupadas y
rotuladas como **INGRESOS** y **RETENCIONES**, para que sea fácil identificar
de un vistazo qué es lo que gana el colaborador y qué se le está reteniendo.

## Cosas que debes saber antes de vender esto

- **Las tasas de ley pueden cambiar.** Si el INSS, el MHCP o la Asamblea
  Nacional publican una reforma, hay que actualizar `src/lib/payroll.ts` — ese
  archivo es el único lugar donde vive la fórmula. Pídeme ayuda cuando eso pase.
- **Horas extra, comisiones, retroactivos y viáticos ya están automatizados**
  (Código del Trabajo para horas extra, proyección simple para el resto).
  Lo que sigue sin automatizar es el caso de un colaborador con **doble
  empleador** — eso queda fuera del alcance de la nómina de un solo negocio y
  debe resolverse a mano; para eso está la sección de "Casos abiertos" en tu
  panel.
- **La indemnización por antigüedad y la liquidación de baja son una
  aproximación.** Se calculan con la fórmula del Art. 45 CT sobre el salario
  actual del colaborador — no soy abogado ni contador, así que antes de pagar
  una liquidación real, sobre todo una disputada, que la revise un abogado
  laboral o contador nicaragüense.
- **La contraseña temporal se muestra una sola vez en una URL.** Es una
  simplificación para la primera versión — no es ideal para producción a largo
  plazo. Antes de tener muchos clientes, conviene agregar un flujo de invitación
  por correo y cambio de contraseña obligatorio en el primer ingreso.
- **No soy abogado ni contador.** Antes de operar con dinero real de terceros,
  haz que un contador nicaragüense revise la fórmula y las tasas contra la
  normativa vigente. Yo la validé contra un ejemplo de cálculo documentado y
  fuentes públicas, pero esa revisión profesional es tuya, no mía.
- **Protección de datos.** Vas a manejar salarios y datos personales de
  colaboradores de tus clientes. Antes de vender esto formalmente, conviene
  tener claro con cada cliente quién es responsable de esos datos y cómo los
  vas a proteger.

---

## Si algo se rompe

Copia el mensaje de error exacto (de Vercel, del navegador, o de donde
aparezca) y pégamelo — con eso puedo decirte exactamente qué corregir.
