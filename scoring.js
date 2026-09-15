/* ============================================================
 *  STROOP TEST — Scoring Module (StroopScoring)
 *  ============================================================
 *  Implements: Age corrections, T-score conversion, interference
 *  formula, percentile calculation, qualitative labels, and
 *  clinical interpretation based on the Golden/TEA manual.
 * ============================================================ */

const StroopScoring = (() => {
  'use strict';

  /* ── Age correction table (TEA Ediciones, Golden) ────────── */
  const AGE_CORRECTIONS = [
    { min: 7,  max: 7,  P: 52, C: 40, PC: 26 },
    { min: 8,  max: 8,  P: 46, C: 36, PC: 24 },
    { min: 9,  max: 9,  P: 41, C: 29, PC: 20 },
    { min: 10, max: 10, P: 34, C: 24, PC: 16 },
    { min: 11, max: 11, P: 26, C: 16, PC: 11 },
    { min: 12, max: 12, P: 15, C: 10, PC: 7  },
    { min: 13, max: 13, P: 10, C: 7,  PC: 5  },
    { min: 14, max: 14, P: 5,  C: 0,  PC: 2  },
    { min: 15, max: 15, P: 3,  C: 0,  PC: 0  },
    { min: 16, max: 44, P: 0,  C: 0,  PC: 0  },
    { min: 45, max: 64, P: 8,  C: 4,  PC: 5  },
    { min: 65, max: 80, P: 14, C: 11, PC: 15 }
  ];

  /* ── T-score linear mapping constants ─────────────────────
   *  From TEA baremo:
   *    P:  108 → T50, each +4 PD = +2 T  → slope = 0.5
   *    C:   80 → T50, each +3 PD = +2 T  → slope = 2/3
   *    PC:  45 → T50, each +2 PD = +2 T  → slope = 1.0
   *    INT:  0 → T50, each +2 PD = +2 T  → slope = 1.0
   * ─────────────────────────────────────────────────────────── */
  const T_PARAMS = {
    P:   { mean: 108, slope: 0.5      },  // T = 50 + (PD - 108) * 0.5
    C:   { mean: 80,  slope: 2 / 3    },  // T = 50 + (PD - 80) * 0.6667
    PC:  { mean: 45,  slope: 1.0      },  // T = 50 + (PD - 45)
    INT: { mean: 0,   slope: 1.0      }   // T = 50 + INT
  };

  /* ── Standard normal CDF approximation (Abramowitz & Stegun) ── */
  function normalCDF(z) {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
    const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = z < 0 ? -1 : 1;
    const absZ = Math.abs(z) / Math.sqrt(2);
    const t = 1.0 / (1.0 + p * absZ);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absZ * absZ);
    return Math.round(0.5 * (1.0 + sign * y) * 100);
  }

  /* ── Public API ─────────────────────────────────────────── */
  return {

    /** Returns { P, C, PC } correction values to ADD to raw scores */
    getAgeCorrection(age) {
      const entry = AGE_CORRECTIONS.find(e => age >= e.min && age <= e.max);
      if (!entry) {
        // Out of range — use closest boundary
        if (age < 7)  return { P: 52, C: 40, PC: 26 };
        if (age > 80) return { P: 14, C: 11, PC: 15 };
      }
      return { P: entry.P, C: entry.C, PC: entry.PC };
    },

    /** Apply age correction to raw scores */
    correctByAge(rawP, rawC, rawPC, age) {
      const corr = this.getAgeCorrection(age);
      return {
        P:  rawP  + corr.P,
        C:  rawC  + corr.C,
        PC: rawPC + corr.PC
      };
    },

    /** Calculate predicted PC' = (P × C) / (P + C) */
    calculatePCPrime(corrP, corrC) {
      if (corrP + corrC === 0) return 0;
      return (corrP * corrC) / (corrP + corrC);
    },

    /** Calculate interference = PC - PC' */
    calculateInterference(corrP, corrC, corrPC) {
      return corrPC - this.calculatePCPrime(corrP, corrC);
    },

    /** Convert a corrected raw score to T score (clamped 20–80) */
    rawToT(value, scale) {
      const params = T_PARAMS[scale];
      if (!params) return 50;
      const t = 50 + (value - params.mean) * params.slope;
      return Math.round(Math.min(80, Math.max(20, t)));
    },

    /** Convert T score to percentile via standard normal CDF */
    tToPercentile(t) {
      const z = (t - 50) / 10;
      return normalCDF(z);
    },

    /** Qualitative classification from T score */
    getQualitativeLabel(t) {
      if (t >= 65) return 'Muy Superior';
      if (t >= 56) return 'Superior';
      if (t >= 45) return 'Normal (Medio)';
      if (t >= 36) return 'Inferior';
      return 'Muy Inferior';
    },

    /** CSS class for qualitative classification */
    getQualitativeClass(t) {
      if (t >= 65) return 'score-very-high';
      if (t >= 56) return 'score-high';
      if (t >= 45) return 'score-normal';
      if (t >= 36) return 'score-low';
      return 'score-very-low';
    },

    /**
     * Generate a professional clinical interpretation paragraph in Spanish.
     * Analyzes the pattern of T scores following Golden's manual.
     */
    getClinicalInterpretation(tP, tC, tPC, tInt) {
      const parts = [];

      // 1. Overall efficiency
      const allNormal = tP >= 45 && tC >= 45 && tPC >= 45;
      const allLow = tP < 40 && tC < 40 && tPC < 40;

      if (allNormal && tInt >= 45) {
        parts.push(
          'El rendimiento global del evaluado se sitúa dentro de los límites normales en todas las escalas del test. ' +
          'La velocidad de procesamiento verbal (lectura), la velocidad de denominación cromática y la capacidad de ' +
          'control inhibitorio se encuentran preservadas y son acordes a lo esperado para su grupo de edad.'
        );
      } else if (allLow) {
        parts.push(
          'Se observa un rendimiento significativamente inferior a la media en todas las escalas del test. ' +
          'Este patrón generalizado de bajo rendimiento puede asociarse a enlentecimiento cognitivo difuso, ' +
          'fatiga atencional, o a la presencia de un posible deterioro cognitivo que afecta tanto a la ' +
          'velocidad de procesamiento como al control inhibitorio. Se recomienda complementar con una ' +
          'evaluación neuropsicológica más amplia.'
        );
      }

      // 2. Reading speed (P)
      if (tP < 36) {
        parts.push(
          `La velocidad lectora (P, T=${tP}) se sitúa en un rango Muy Inferior, lo que sugiere una posible ` +
          'dificultad en el procesamiento léxico-verbal o en la automatización de la lectura. ' +
          (tC >= 45 && tPC >= 45
            ? 'Sin embargo, la denominación de colores y la tarea de interferencia se encuentran preservadas, ' +
              'lo cual puede ser compatible con un perfil de dificultad lectora específica (dislexia), donde ' +
              'la ausencia de automatización lectora reduce el efecto de interferencia en la lámina PC.'
            : '')
        );
      } else if (tP < 45 && !allLow) {
        parts.push(
          `La velocidad lectora (P, T=${tP}) se sitúa ligeramente por debajo de la media, indicando un ` +
          'procesamiento verbal algo enlentecido respecto a su grupo normativo.'
        );
      }

      // 3. Color naming (C)
      if (tC < 36 && tP >= 45) {
        parts.push(
          `La velocidad de denominación cromática (C, T=${tC}) es significativamente inferior, mientras que la ` +
          'lectura de palabras se mantiene en rango normal. Esta disociación entre la lectura de palabras y la ' +
          'denominación de colores puede estar asociada a una dificultad en el procesamiento perceptivo-visual ' +
          'o en el acceso al léxico cromático, patrón que en la literatura se ha relacionado con disfunciones ' +
          'del hemisferio derecho.'
        );
      } else if (tC < 45 && !allLow) {
        parts.push(
          `La velocidad de denominación de colores (C, T=${tC}) se sitúa por debajo del promedio, lo que puede ` +
          'indicar una menor eficiencia en el procesamiento perceptivo-visual.'
        );
      }

      // 4. Interference (PC and INT) — the core of the test
      if (tInt < 36 && tP >= 45 && tC >= 45) {
        parts.push(
          `La puntuación de interferencia (INT, T=${tInt}) es marcadamente inferior, a pesar de que las escalas basales ` +
          '(Palabra y Color) se encuentran dentro de la normalidad. Este patrón es el hallazgo más ' +
          'característico de dificultades en el control inhibitorio y las funciones ejecutivas, ' +
          'frecuentemente asociado a disfunción prefrontal. El evaluado muestra una susceptibilidad ' +
          'significativa a la interferencia cognitiva, con dificultad para suprimir la respuesta automática ' +
          'de lectura en favor de la denominación del color de la tinta.'
        );
      } else if (tInt >= 56) {
        parts.push(
          `La puntuación de interferencia (INT, T=${tInt}) indica una resistencia a la interferencia superior ` +
          'a la media. El evaluado demuestra una excelente capacidad de control inhibitorio y flexibilidad ' +
          'cognitiva, suprimiendo eficazmente la tendencia automática a la lectura.'
        );
      } else if (tInt >= 45) {
        parts.push(
          `La resistencia a la interferencia (INT, T=${tInt}) se encuentra dentro del rango normal, indicando ` +
          'una adecuada capacidad de inhibición cognitiva y control atencional.'
        );
      } else if (tInt < 45 && !allLow) {
        parts.push(
          `La resistencia a la interferencia (INT, T=${tInt}) se sitúa por debajo de la media, sugiriendo ` +
          'cierta vulnerabilidad en el control inhibitorio que puede impactar tareas que requieran ' +
          'supresión de respuestas automáticas y flexibilidad atencional.'
        );
      }

      // 5. Inter-scale discrepancies
      const maxT = Math.max(tP, tC, tPC);
      const minT = Math.min(tP, tC, tPC);
      if (maxT - minT >= 10) {
        parts.push(
          `Se observa una discrepancia estadísticamente significativa (≥10 puntos T) entre las escalas ` +
          `basales (diferencia = ${maxT - minT} puntos T), lo que sugiere un perfil cognitivo heterogéneo ` +
          'que merece análisis cualitativo adicional.'
        );
      }

      // 6. Closing recommendation
      parts.push(
        'Estos resultados deben interpretarse en el contexto de la historia clínica completa del evaluado, ' +
        'considerando factores como la motivación, el nivel de fatiga, la medicación actual y el estado ' +
        'emocional durante la evaluación. Se recomienda complementar con pruebas neuropsicológicas adicionales ' +
        'para un perfil cognitivo más completo.'
      );

      return parts.join('\n\n');
    },

    /**
     * Complete scoring pipeline.
     * Takes raw scores + age, returns everything needed for the report.
     */
    calculateAll(rawP, rawC, rawPC, age) {
      // AJUSTE MOTOR COMPENSATORIO (Computerized Administration)
      // Compensates for the mechanical delay of clicking/keyboard vs vocal reading
      const compP = Math.round(rawP * 2.1);
      const compC = Math.round(rawC * 1.7);
      const compPC = Math.round(rawPC * 1.4);

      const corrections = this.getAgeCorrection(age);
      const corrected = this.correctByAge(compP, compC, compPC, age);
      const pcPrime = this.calculatePCPrime(corrected.P, corrected.C);
      const interference = this.calculateInterference(corrected.P, corrected.C, corrected.PC);

      const tP   = this.rawToT(corrected.P, 'P');
      const tC   = this.rawToT(corrected.C, 'C');
      const tPC  = this.rawToT(corrected.PC, 'PC');
      const tInt = this.rawToT(interference, 'INT');
      
      const baseInterpretation = this.getClinicalInterpretation(tP, tC, tPC, tInt);
      const finalInterpretation = baseInterpretation + 
        '\n\n*Nota sobre la administración*: Las puntuaciones directas han sido ajustadas matemáticamente ' +
        'mediante un algoritmo de compensación motora (P×2.1, C×1.7, PC×1.4) para neutralizar el tiempo de ' +
        'latencia mecánico inherente al uso del ratón/teclado, permitiendo su comparación con los baremos vocales de Golden.';

      return {
        raw: { P: compP, C: compC, PC: compPC }, // Return the compensated raw scores
        originalRaw: { P: rawP, C: rawC, PC: rawPC }, // Keep original for reference
        corrections,
        corrected,
        pcPrime:      Math.round(pcPrime * 100) / 100,
        interference:  Math.round(interference * 100) / 100,
        tScores:      { P: tP, C: tC, PC: tPC, INT: tInt },
        percentiles:  {
          P:   this.tToPercentile(tP),
          C:   this.tToPercentile(tC),
          PC:  this.tToPercentile(tPC),
          INT: this.tToPercentile(tInt)
        },
        labels: {
          P:   this.getQualitativeLabel(tP),
          C:   this.getQualitativeLabel(tC),
          PC:  this.getQualitativeLabel(tPC),
          INT: this.getQualitativeLabel(tInt)
        },
        classes: {
          P:   this.getQualitativeClass(tP),
          C:   this.getQualitativeClass(tC),
          PC:  this.getQualitativeClass(tPC),
          INT: this.getQualitativeClass(tInt)
        },
        interpretation: finalInterpretation
      };
    }
  };
})();
