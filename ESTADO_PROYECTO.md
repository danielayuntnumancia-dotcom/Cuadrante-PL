# Estado del Proyecto: Cuadrante PL

**Fecha de actualización:** 19 de agosto de 2026  
**Proyecto Firebase:** `cuadrantepl`  
**URL de producción:** [https://cuadrantepl.web.app](https://cuadrantepl.web.app)

---

## 🏆 Logros de esta Sesión

1. **Horarios de Entrada y Salida Diferenciados:**
   - Matriz modular en *Configuración > General y Tarifas* para configurar horarios según el turno (**Mañana `M`**, **Tarde `T`** y **Noche `N`**) y día de la semana (Lunes a Domingo).
   - Acciones rápidas para copiar a laborables (L-V), fin de semana (S-D) o toda la semana (L-D).
   - Tooltip informativo con horas de jornada en las celdas del cuadrante y botón de autocompletado en el modal de incidencias.

2. **Configuración de Días M/T para Grupos < 4 Agentes:**
   - Matriz interactiva en *Configuración > Vacaciones y Reglas M/T* con conmutadores individuales día a día (`M` o `T`) para grupos pequeños.
   - Presets de asignación rápida (*"Todos M"*, *"Todos T"*, *"L-V (M) / S-D (T)"*, *"L-V (T) / S-D (M)"*).
   - Aplicación estricta en el motor `getTurnoAgente` del cuadrante.

3. **Cómputo Estricto de Agentes Activos y Estados Prevalentes:**
   - Soporte integral para **Baja Médica (`IT`)**, **Comisión de Servicio (`CS`)** y **Excedencia (`EX`)**.
   - Exclusión automática de agentes en estas situaciones del cómputo de 4 agentes para la división 50% M/T, evitando alteraciones o desfases en la plantilla operativa.
   - Prevalencia absoluta de los códigos de ausencia en la cuadrícula con diferenciación cromática (`IT` Rojo, `CS` Púrpura, `EX` Naranja, `V` Amarillo).
   - Soporte para ausencias continuadas / indefinidas hasta reincorporación formal tanto en Cuadrante como en Ficha de Plantilla.

4. **Compilación y Despliegue en Producción:**
   - Compilación limpia con Vite (`npm run build`) con 0 errores y despliegue a Firebase Hosting.

---

## 📌 Próximos Pasos Sugeridos
- Pruebas en producción en [https://cuadrantepl.web.app](https://cuadrantepl.web.app)
- Sincronización de commits en el repositorio de GitHub.

---
*Entorno sincronizado, desplegado en Firebase y listo para pruebas operativas.*
