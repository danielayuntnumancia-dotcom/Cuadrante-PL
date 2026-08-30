# Estado del Proyecto - Cuadrante PL

**Fecha de actualización:** 30 de agosto de 2026  
**Proyecto Firebase:** `cuadrantepl`  
**URL de producción:** [https://cuadrantepl.web.app](https://cuadrantepl.web.app)  

---

## 🏆 Logros de esta Sesión

1. **Sincronización Completa del Entorno:**
   - Descarga e integración de los últimos cambios de GitHub (`git pull`) y actualización de dependencias (`npm install`).

2. **Motor de Cómputo Anual de Días y Horas:**
   - Creación de `src/lib/calculoHoras.ts` con lógica centralizada para clasificar automáticamente entre periodos pasados (**efectivamente realizados**) y futuros (**previstos**) según la fecha actual.
   - Cálculo preciso de horas ordinarias por turno (`M`, `T`, `N`) según la configuración anual, contabilización de horas extraordinarias y desglose de ausencias justificadas (`AP`, `V`, `IT`, `J`).

3. **Nueva Vista e Interfaz: Cómputo Anual (`/computo-anual`):**
   - Creación de `src/pages/ComputoAnual.tsx` e integración en el menú de navegación (`src/App.tsx`).
   - Selector dinámico de año (histórico de años anteriores, año actual y proyección de años futuros).
   - Configuración interactiva de la jornada anual de convenio de referencia (por defecto 1.540h) con balance horario en tiempo real.
   - Tarjetas KPI globales de la plantilla y tabla interactiva con filtros por Grupo, buscador y barras de progreso.
   - Modal de ficha individual por agente con desglose mes a mes (12 meses) de días, horas y distribución de turnos.

4. **Exportaciones de Informes Anuales:**
   - Exportación de la tabla de cómputo anual a **Excel (`.xlsx`)** y **PDF** corporativo apaisado.

5. **Compilación y Despliegue en Producción:**
   - Verificación de tipos TypeScript (`npx tsc --noEmit`) sin errores y despliegue exitoso en Firebase Hosting.

---

## 📌 Tareas Pendientes para la Próxima Sesión

1. **Personalización de Jornada Anual por Agente / Categoría:**
   - Permitir asignar jornadas de referencia específicas por agente si existen reducciones de jornada o acuerdos particulares.
2. **Gráficos Estadísticos Avanzados:**
   - Incorporar gráficos de barras/líneas para la visualización de la carga de trabajo y turnos por mes en la vista de Cómputo Anual.
3. **Gestión de Roles y Permisos:**
   - Limitar la edición de configuraciones y cuadrantes a administradores, manteniendo el modo consulta para agentes.

---
*Entorno sincronizado y guardado de forma segura.*
