/* ============================================================
 *  STROOP TEST — PDF Report Generator (StroopReport)
 *  ============================================================
 *  Uses jsPDF + jsPDF-AutoTable to generate a professional
 *  clinical neuropsychological report in PDF format.
 * ============================================================ */

const StroopReport = (() => {
  'use strict';

  const NAVY = [26, 35, 126];       // #1a237e
  const DARK_TEXT = [33, 33, 33];    // #212121
  const GRAY_TEXT = [150, 150, 150];
  const LIGHT_LINE = [200, 200, 200];

  return {

    /**
     * Generate and download the PDF report.
     * @param {Object} patientData  - Patient information
     * @param {Object} scoring      - Output of StroopScoring.calculateAll()
     * @param {string} chartImage   - Chart as data URL (PNG)
     * @param {string} observations - Clinical observations text
     */
    generate(patientData, scoring, chartImage, observations) {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF('p', 'mm', 'a4');
      const W = 210, margin = 15, cw = W - 2 * margin;
      let y = 0;

      // ── PAGE 1 ──────────────────────────────────────────────
      y = this._header(doc, W);
      y = this._patientInfo(doc, y + 5, margin, cw, patientData);
      y = this._instrument(doc, y + 5, margin, cw);
      y = this._resultsTable(doc, y + 5, margin, scoring);
      y = this._chart(doc, y + 5, margin, cw, chartImage);

      // ── PAGE 2 (if needed) ──────────────────────────────────
      if (y > 200) { doc.addPage(); y = margin; }
      y = this._interpretation(doc, y + 5, margin, cw, scoring);

      if (observations && observations.trim()) {
        if (y > 240) { doc.addPage(); y = margin; }
        y = this._observations(doc, y + 5, margin, cw, observations);
      }

      // ── FOOTERS on all pages ────────────────────────────────
      const pages = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        this._footer(doc, W, margin, i, pages);
      }

      // ── SAVE ────────────────────────────────────────────────
      const safeName = (patientData.nombre || 'paciente').replace(/\s+/g, '_');
      const date = new Date().toISOString().split('T')[0];
      doc.save(`Informe_Stroop_${safeName}_${date}.pdf`);
    },

    /* ─────────────────────────────────────────────────────────
     *  PRIVATE SECTION RENDERERS
     * ───────────────────────────────────────────────────────── */

    _header(doc, W) {
      const logoWidth = 60;
      const logoHeight = 20;
      const logoX = (W - logoWidth) / 2;
      
      if (typeof LOGO_MILOS_BASE64 !== 'undefined') {
        doc.addImage(LOGO_MILOS_BASE64, 'PNG', logoX, 5, logoWidth, logoHeight);
      }
      
      const currentY = 28;
      
      doc.setFillColor(...NAVY);
      doc.rect(0, currentY, W, 32, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text('STROOP — Test de Colores y Palabras', W / 2, currentY + 13, { align: 'center' });

      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.text('Informe de Resultados Neuropsicológico', W / 2, currentY + 21, { align: 'center' });

      doc.setFontSize(9);
      doc.text('Charles J. Golden — Adaptación TEA Ediciones', W / 2, currentY + 28, { align: 'center' });

      doc.setTextColor(...DARK_TEXT);
      return currentY + 40;
    },

    _patientInfo(doc, y, margin, cw, p) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('DATOS DEL EVALUADO', margin, y);
      doc.setDrawColor(...NAVY);
      doc.setLineWidth(0.6);
      doc.line(margin, y + 1.5, margin + cw, y + 1.5);
      y += 8;

      doc.setFontSize(9);
      const col2 = margin + cw / 2;
      const lh = 5.5;

      const rows = [
        ['Nombre:',      p.nombre || '—',               'Evaluador:',   p.evaluador || '—'],
        ['Edad:',        `${p.edad || '—'} años`,       'Fecha:',       p.fechaEval || new Date().toLocaleDateString('es-ES')],
        ['Fecha Nac.:',  p.fechaNac || '—',             'Escolaridad:', p.escolaridad || '—'],
        ['Sexo:',        p.sexo || '—',                 'Lateralidad:', p.lateralidad || '—']
      ];

      rows.forEach(([l1, v1, l2, v2]) => {
        doc.setFont('helvetica', 'bold');
        doc.text(l1, margin, y);
        doc.setFont('helvetica', 'normal');
        doc.text(String(v1), margin + 23, y);
        doc.setFont('helvetica', 'bold');
        doc.text(l2, col2, y);
        doc.setFont('helvetica', 'normal');
        doc.text(String(v2), col2 + 23, y);
        y += lh;
      });

      if (p.motivo) {
        y += 2;
        doc.setFont('helvetica', 'bold');
        doc.text('Motivo de evaluación:', margin, y);
        y += lh;
        doc.setFont('helvetica', 'normal');
        const lines = doc.splitTextToSize(p.motivo, cw);
        doc.text(lines, margin, y);
        y += lines.length * 4;
      }

      return y;
    },

    _instrument(doc, y, margin, cw) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('INSTRUMENTO UTILIZADO', margin, y);
      doc.setDrawColor(...NAVY);
      doc.line(margin, y + 1.5, margin + cw, y + 1.5);
      y += 8;

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text('STROOP: Test de Colores y Palabras (C.J. Golden, 2020). TEA Ediciones, 6ª edición.', margin, y);
      y += 5;
      doc.text('Evalúa: Velocidad de procesamiento, atención selectiva, flexibilidad cognitiva y control inhibitorio.', margin, y);
      y += 5;
      doc.text('Administración computerizada. Tiempo por condición: 45 segundos.', margin, y);
      return y + 3;
    },

    _resultsTable(doc, y, margin, r) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('RESULTADOS CUANTITATIVOS', margin, y);
      doc.setDrawColor(...NAVY);
      doc.line(margin, y + 1.5, margin + 180, y + 1.5);
      y += 5;

      doc.autoTable({
        startY: y,
        margin: { left: margin, right: margin },
        headStyles: {
          fillColor: NAVY,
          fontSize: 8,
          halign: 'center',
          cellPadding: 3
        },
        bodyStyles: {
          fontSize: 8,
          halign: 'center',
          cellPadding: 2.5
        },
        columnStyles: {
          0: { halign: 'left', fontStyle: 'bold', cellWidth: 38 }
        },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        head: [['Escala', 'PD', 'Corrección', 'PD Corregida', 'Punt. T', 'Percentil', 'Clasificación']],
        body: [
          ['Palabra (P)',       r.raw.P,  `+${r.corrections.P}`, r.corrected.P,           r.tScores.P,   r.percentiles.P,   r.labels.P],
          ['Color (C)',         r.raw.C,  `+${r.corrections.C}`, r.corrected.C,           r.tScores.C,   r.percentiles.C,   r.labels.C],
          ['Palabra-Color (PC)',r.raw.PC, `+${r.corrections.PC}`,r.corrected.PC,          r.tScores.PC,  r.percentiles.PC,  r.labels.PC],
          ["PC Estimada (PC')", '—',      '—',                   r.pcPrime.toFixed(1),    '—',           '—',               'Valor Teórico'],
          ['Interferencia',     '—',      '—',                   r.interference.toFixed(1),r.tScores.INT, r.percentiles.INT, r.labels.INT]
        ]
      });

      return doc.lastAutoTable.finalY;
    },

    _chart(doc, y, margin, cw, chartImage) {
      if (!chartImage) return y;

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('PERFIL DE PUNTUACIONES', margin, y);
      doc.setDrawColor(...NAVY);
      doc.line(margin, y + 1.5, margin + cw, y + 1.5);
      y += 5;

      try {
        doc.addImage(chartImage, 'PNG', margin, y, cw, 60);
        y += 63;
      } catch (e) {
        doc.setFontSize(9);
        doc.text('[Gráfico no disponible]', margin, y + 10);
        y += 15;
      }

      return y;
    },

    _interpretation(doc, y, margin, cw, r) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...DARK_TEXT);
      doc.text('INTERPRETACIÓN NEUROPSICOLÓGICA', margin, y);
      doc.setDrawColor(...NAVY);
      doc.line(margin, y + 1.5, margin + cw, y + 1.5);
      y += 8;

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      const text = r.interpretation || 'Sin interpretación disponible.';
      const lines = doc.splitTextToSize(text, cw);
      doc.text(lines, margin, y);
      y += lines.length * 4.2;

      return y;
    },

    _observations(doc, y, margin, cw, text) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...DARK_TEXT);
      doc.text('OBSERVACIONES CLÍNICAS', margin, y);
      doc.setDrawColor(...NAVY);
      doc.line(margin, y + 1.5, margin + cw, y + 1.5);
      y += 8;

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(text, cw);
      doc.text(lines, margin, y);
      y += lines.length * 4.2;

      return y;
    },

    _footer(doc, W, margin, page, total) {
      const fy = 282;
      doc.setDrawColor(...LIGHT_LINE);
      doc.setLineWidth(0.3);
      doc.line(margin, fy - 6, W - margin, fy - 6);

      doc.setFontSize(7);
      doc.setTextColor(...GRAY_TEXT);
      doc.setFont('helvetica', 'italic');
      doc.text(
        'Este informe ha sido generado de forma automatizada y debe ser interpretado exclusivamente por un profesional cualificado. ' +
        'Los resultados no constituyen un diagnóstico por sí mismos y deben ser integrados con el resto de la evaluación clínica.',
        W / 2, fy - 1.5,
        { align: 'center', maxWidth: W - 2 * margin }
      );
      
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text('Creado y desarrollado por Francisco José Megías Lorenzana', margin, fy + 7, { align: 'left' });
      doc.text(`Página ${page} de ${total}`, W - margin, fy + 7, { align: 'right' });

      doc.setTextColor(...DARK_TEXT);
    }
  };
})();
