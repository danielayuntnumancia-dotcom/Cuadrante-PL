import * as xlsx from 'xlsx';
import { Agente, TurnoImportado } from '../types';

export interface ImportResult {
  turnosImportados: Omit<TurnoImportado, 'id'>[];
  errores: string[];
  mes_anio: string | null;
}

const MESES: Record<string, string> = {
  'ENERO': '01',
  'FEBRERO': '02',
  'MARZO': '03',
  'ABRIL': '04',
  'MAYO': '05',
  'JUNIO': '06',
  'JULIO': '07',
  'AGOSTO': '08',
  'SEPTIEMBRE': '09',
  'OCTUBRE': '10',
  'NOVIEMBRE': '11',
  'DICIEMBRE': '12'
};

export const parseExcelCuadrante = async (file: File, agentesActivos: Agente[]): Promise<ImportResult> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = xlsx.read(data, { type: 'array' });
        
        if (workbook.SheetNames.length === 0) {
          return reject(new Error('El archivo Excel no tiene hojas.'));
        }

        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert to array of arrays
        const rows: any[][] = xlsx.utils.sheet_to_json(worksheet, { header: 1, blankrows: false });
        
        if (rows.length < 3) {
          return reject(new Error('El formato del Excel no parece correcto. Faltan cabeceras.'));
        }

        let mes_anio: string | null = null;
        let startRow = 0;

        // Buscar el mes/año (ej: "SEPTIEMBRE - 2026") y la cabecera de días
        for (let i = 0; i < Math.min(15, rows.length); i++) {
          const rowStr = (rows[i] || []).join(' ').toUpperCase();
          
          // Detectar Mes - Año
          if (!mes_anio) {
            for (const [mesNombre, mesNum] of Object.entries(MESES)) {
              if (rowStr.includes(mesNombre)) {
                // Try to find the year (4 digits)
                const yearMatch = rowStr.match(/\b(20\d{2})\b/);
                if (yearMatch) {
                  mes_anio = `${yearMatch[1]}-${mesNum}`;
                  break;
                }
              }
            }
          }

          // Detectar cabecera de datos (TIP, AGENTE, 1, 2, 3...)
          if (rowStr.includes('TIP') && rowStr.includes('AGENTE')) {
             startRow = i; // Esta es la fila de "TIP", "AGENTE", "1", "2"...
             break;
          }
        }

        if (!mes_anio) {
          return reject(new Error('No se ha podido detectar el Mes y Año en el archivo (Ej: "SEPTIEMBRE - 2026").'));
        }
        
        if (startRow === 0) {
          return reject(new Error('No se ha encontrado la fila de cabecera con "TIP" y "AGENTE".'));
        }

        const headerRowDays = rows[startRow]; // TIP, AGENTE, 1, 2, 3...
        // Data usually starts 2 rows after "TIP, AGENTE" because there is an intermediate row with M,X,J,V,S,D
        let dataStartRow = startRow + 2; 

        // Encontrar los índices de las columnas para cada día
        const dayCols: Record<number, number> = {};
        for (let col = 0; col < headerRowDays.length; col++) {
          const val = String(headerRowDays[col]).trim();
          const dayNum = parseInt(val, 10);
          if (!isNaN(dayNum) && dayNum >= 1 && dayNum <= 31) {
            dayCols[dayNum] = col;
          }
        }

        // Buscar en qué columnas están el TIP y AGENTE
        const colTIP = headerRowDays.findIndex(c => String(c).toUpperCase().trim() === 'TIP');
        const colAgente = headerRowDays.findIndex(c => String(c).toUpperCase().trim() === 'AGENTE');

        if (colTIP === -1 || colAgente === -1) {
           return reject(new Error('No se encontraron las columnas TIP y AGENTE exactas.'));
        }

        const turnosResult: Omit<TurnoImportado, 'id'>[] = [];
        const errores: string[] = [];

        // Leer filas de agentes
        for (let r = dataStartRow; r < rows.length; r++) {
          const row = rows[r];
          if (!row || row.length === 0) continue;

          const tipRaw = String(row[colTIP] || '').trim();
          if (!tipRaw) continue; // Skip empty rows

          // Match tip with agents in system
          const agenteEncontrado = agentesActivos.find(a => 
             a.placa.trim().toLowerCase() === tipRaw.toLowerCase()
          );

          if (!agenteEncontrado) {
             errores.push(`Agente con TIP '${tipRaw}' no encontrado en el sistema.`);
             continue;
          }

          const turnosDelMes: Record<string, string> = {};

          for (const [diaNum, colIdx] of Object.entries(dayCols)) {
             const turnoRaw = String(row[colIdx] || '').trim().toUpperCase();
             if (turnoRaw) {
               // Formatear dia a DD
               const diaStr = diaNum.padStart(2, '0');
               turnosDelMes[diaStr] = turnoRaw;
             }
          }

          if (Object.keys(turnosDelMes).length > 0) {
            turnosResult.push({
               id_agente: agenteEncontrado.id!,
               mes_anio: mes_anio,
               turnos: turnosDelMes
            });
          }
        }

        resolve({
          turnosImportados: turnosResult,
          errores,
          mes_anio
        });

      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => {
      reject(new Error('Error al leer el archivo.'));
    };

    reader.readAsArrayBuffer(file);
  });
};
