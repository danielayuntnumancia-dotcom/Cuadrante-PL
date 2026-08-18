# Estado del Proyecto: Cuadrante PL

**Fecha de actualización:** 18 de agosto de 2026  
**Proyecto Firebase:** `cuadrantepl`  
**URL de producción:** [https://cuadrantepl.web.app](https://cuadrantepl.web.app)

---

## 🏆 Logros de esta Sesión

1. **Gestión de Cambio de Ciclo Policial:**
   - Eliminación del botón redundante de sincronización de Google Calendar.
   - Creación del botón y modal interactivo de *Cambio de Ciclo* para invertir la paridad de semanas (pares/impares) tras el periodo vacacional estival.

2. **División y Rotación de Turnos Mañana / Tarde (M / T):**
   - Implementación del motor de cálculo que divide automáticamente la plantilla de grupos de 4 o más agentes al 50% entre Mañana (`M`) y Tarde (`T`).
   - Rotación semanal automática entre ciclos de trabajo.
   - Botón `ROTAR M/T` en la barra superior para invertir la asignación de turnos.
   - Diferenciación cromática en el cuadrante (Cian para `M` y Ámbar para `T`) y exportación fidedigna a Excel, PDF y Google Sheets.

3. **Subapartados Modulares de Configuración Anual:**
   - **General y Tarifas:** Horarios base y matriz de recargos por horas extraordinarias (diurnas, nocturnas y festivas).
   - **14 Festivos y Días Especiales:** Contador dinámico (`X / 14`), precarga de 14 festivos oficiales y registro de fechas sin servicio ordinario.
   - **Plan de Vacaciones y Reglas M/T:** Asignación de meses de vacaciones por grupo y configuración del umbral de agentes para división.
   - **Vigencias Temporales:** Programación de cambios de cuadrante con fecha de entrada en vigor (*"desde fecha X en adelante"*), protegiendo el histórico previo.

4. **Despliegue Completo en Firebase:**
   - Compilación optimizada con Vite y despliegue exitoso en Firebase Hosting y Cloud Firestore Rules.

---

## 📌 Tareas Pendientes para la Próxima Sesión

1. **Horarios de Entrada y Salida Diferenciados:**
   - Permitir configurar horarios específicos según el turno (Mañana, Tarde o Noche) y en función del día de la semana (de Lunes a Domingo).
2. **Configuración de Días M/T para Grupos < 4 Agentes:**
   - En las reglas de división, permitir elegir qué días concretos estarán asignados a turno de Mañana y cuáles a turno de Tarde para grupos pequeños.
3. **Cómputo Estricto de Agentes Activos y Estados Prevalentes:**
   - El sistema debe determinar si el grupo tiene 4 o más agentes computables excluyendo automáticamente a aquellos en situación de *Comisión de servicio*, *Baja médica* o *Excedencia*.
   - Estos estados deben prevalecer sobre cualquier otro cálculo de turnos hasta que se registre formalmente la reincorporación del agente, evitando alteraciones erróneas en el cuadrante.

---
*Entorno sincronizado, desplegado en Firebase y guardado en GitHub de forma segura.*
