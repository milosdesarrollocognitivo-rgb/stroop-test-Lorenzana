/* ============================================================
 *  STROOP TEST — Main Application Controller
 *  ============================================================
 *  Manages: screen navigation, stimulus generation, test engine,
 *  data persistence (localStorage + Netlify API), dashboard.
 * ============================================================ */

(() => {
  'use strict';

  /* ─── Constants ─── */
  const COLORS = ['rojo', 'verde', 'azul'];
  const COLOR_HEX = { rojo: '#E53935', verde: '#43A047', azul: '#1E88E5' };
  const WORDS  = { rojo: 'ROJO', verde: 'VERDE', azul: 'AZUL' };
  const KEY_MAP = { r: 'rojo', v: 'verde', a: 'azul' };
  const TEST_DURATION = 45; // seconds
  const PRACTICE_COUNT = 5;
  const CONDITIONS = ['P', 'C', 'PC'];
  const CONDITION_LABELS = { P: 'PALABRA (P)', C: 'COLOR (C)', PC: 'PALABRA-COLOR (PC)' };
  const LOCAL_STORAGE_KEY = 'stroop_results';
  const API_BASE = '/api';

  /* ─── Application State ─── */
  const state = {
    currentScreen: 'screen-home',
    patient: {},
    conditionIndex: 0,       // 0=P, 1=C, 2=PC
    // Per-condition results
    results: {
      P:  { correct: 0, errors: 0, responses: [] },
      C:  { correct: 0, errors: 0, responses: [] },
      PC: { correct: 0, errors: 0, responses: [] }
    },
    // Test engine
    stimuli: [],
    stimulusIdx: 0,
    testRunning: false,
    testTimer: null,
    timeRemaining: TEST_DURATION,
    testStartTime: null,
    stimulusShownAt: null,
    // Practice
    practiceStimuli: [],
    practiceIdx: 0,
    practiceCorrect: 0,
    // Scoring
    scoring: null,
    // Dashboard
    selectedResultId: null
  };

  /* ─── DOM Cache ─── */
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  /* ────────────────────────────────────────────────────────────
   *  SCREEN NAVIGATION
   * ──────────────────────────────────────────────────────────── */
  function showScreen(id) {
    $$('.screen').forEach(s => s.classList.remove('active'));
    const target = $(`#${id}`);
    if (target) {
      target.classList.add('active');
      state.currentScreen = id;
    }
  }

  /* ────────────────────────────────────────────────────────────
   *  STIMULUS GENERATION
   * ──────────────────────────────────────────────────────────── */

  /**
   * Generate an array of stimuli for a given condition.
   * Each stimulus: { word, ink, correctAnswer }
   *   - word: the text displayed (e.g. 'ROJO' or 'XXXX')
   *   - ink: the CSS color of the text
   *   - correctAnswer: 'rojo' | 'verde' | 'azul'
   */
  function generateStimuli(condition, count = 100) {
    const stimuli = [];
    let lastColor = null;
    let lastWord = null;

    for (let i = 0; i < count; i++) {
      let stimulus;
      let attempts = 0;
      do {
        stimulus = createSingleStimulus(condition);
        attempts++;
      } while (
        attempts < 50 &&
        (stimulus.correctAnswer === lastColor ||
         (condition !== 'C' && stimulus.word === lastWord))
      );
      lastColor = stimulus.correctAnswer;
      lastWord = stimulus.word;
      stimuli.push(stimulus);
    }
    return stimuli;
  }

  function createSingleStimulus(condition) {
    const colorIdx = Math.floor(Math.random() * 3);
    const color = COLORS[colorIdx];

    switch (condition) {
      case 'P': {
        // Word reading: word in BLACK ink, answer = the word
        return {
          word: WORDS[color],
          ink: '#212121',
          correctAnswer: color
        };
      }
      case 'C': {
        // Color naming: 'XXXX' in colored ink, answer = the ink color
        return {
          word: 'XXXX',
          ink: COLOR_HEX[color],
          correctAnswer: color
        };
      }
      case 'PC': {
        // Interference: word in INCONGRUENT ink color
        const otherColors = COLORS.filter(c => c !== color);
        const inkColor = otherColors[Math.floor(Math.random() * 2)];
        return {
          word: WORDS[color],
          ink: COLOR_HEX[inkColor],
          correctAnswer: inkColor // answer is INK color, not the word
        };
      }
    }
  }

  /* ────────────────────────────────────────────────────────────
   *  INSTRUCTIONS
   * ──────────────────────────────────────────────────────────── */
  const INSTRUCTIONS = {
    P: {
      title: 'Condición 1: Lectura de Palabras (P)',
      text: `En esta parte de la prueba aparecerán <strong>nombres de colores</strong> escritos en <strong>tinta negra</strong>.<br><br>
        Su tarea es <strong>leer la palabra</strong> lo más rápidamente posible y pulsar el botón correspondiente:<br><br>
        <strong>R</strong> = ROJO &nbsp;&nbsp; <strong>V</strong> = VERDE &nbsp;&nbsp; <strong>A</strong> = AZUL<br><br>
        También puede hacer clic en los botones de color.<br><br>
        Dispone de <strong>45 segundos</strong>. Intente responder al mayor número de palabras posible.<br>
        Si comete un error, continúe con la siguiente palabra.`,
      demoStimuli: [
        { word: 'ROJO', ink: '#212121', label: '→ Pulse R (Rojo)' },
        { word: 'AZUL', ink: '#212121', label: '→ Pulse A (Azul)' },
        { word: 'VERDE', ink: '#212121', label: '→ Pulse V (Verde)' }
      ]
    },
    C: {
      title: 'Condición 2: Denominación de Colores (C)',
      text: `Ahora aparecerán grupos de <strong>"XXXX"</strong> impresos en <strong>colores</strong> (rojo, verde o azul).<br><br>
        Su tarea es <strong>nombrar el color de la tinta</strong> pulsando el botón correspondiente:<br><br>
        <strong>R</strong> = ROJO &nbsp;&nbsp; <strong>V</strong> = VERDE &nbsp;&nbsp; <strong>A</strong> = AZUL<br><br>
        Dispone de <strong>45 segundos</strong>. Responda lo más rápidamente posible.`,
      demoStimuli: [
        { word: 'XXXX', ink: '#E53935', label: '→ Pulse R (Rojo)' },
        { word: 'XXXX', ink: '#1E88E5', label: '→ Pulse A (Azul)' },
        { word: 'XXXX', ink: '#43A047', label: '→ Pulse V (Verde)' }
      ]
    },
    PC: {
      title: 'Condición 3: Palabra-Color (PC) — Interferencia',
      text: `Esta es la parte más difícil. Aparecerán <strong>nombres de colores</strong> escritos en una <strong>tinta de color diferente</strong> al significado de la palabra.<br><br>
        Su tarea es <strong>nombrar el color de la TINTA</strong>, <u>ignorando</u> la palabra escrita.<br><br>
        <strong>R</strong> = ROJO &nbsp;&nbsp; <strong>V</strong> = VERDE &nbsp;&nbsp; <strong>A</strong> = AZUL<br><br>
        Por ejemplo, si ve la palabra "ROJO" escrita en tinta <span style="color:#1E88E5;font-weight:700">azul</span>, debe pulsar <strong>A</strong> (Azul).<br><br>
        Dispone de <strong>45 segundos</strong>. Concéntrese en el color de la tinta.`,
      demoStimuli: [
        { word: 'ROJO', ink: '#1E88E5', label: '→ Pulse A (Azul)' },
        { word: 'VERDE', ink: '#E53935', label: '→ Pulse R (Rojo)' },
        { word: 'AZUL', ink: '#43A047', label: '→ Pulse V (Verde)' }
      ]
    }
  };

  function showInstructions() {
    const cond = CONDITIONS[state.conditionIndex];
    const info = INSTRUCTIONS[cond];

    $('#instructions-title').textContent = info.title;
    $('#instructions-text').innerHTML = info.text;

    // Demo stimuli
    const demoEl = $('#instructions-demo');
    demoEl.innerHTML = '';
    info.demoStimuli.forEach(d => {
      const row = document.createElement('div');
      row.className = 'demo-row';
      row.innerHTML = `<span class="demo-stimulus" style="color:${d.ink}">${d.word}</span>
                        <span class="demo-label">${d.label}</span>`;
      demoEl.appendChild(row);
    });

    // Condition dots
    $$('.dot').forEach((dot, i) => {
      dot.classList.remove('active', 'completed');
      if (i < state.conditionIndex) dot.classList.add('completed');
      if (i === state.conditionIndex) dot.classList.add('active');
    });

    showScreen('screen-instructions');
  }

  /* ────────────────────────────────────────────────────────────
   *  PRACTICE MODE
   * ──────────────────────────────────────────────────────────── */
  function startPractice() {
    const cond = CONDITIONS[state.conditionIndex];
    state.practiceStimuli = generateStimuli(cond, PRACTICE_COUNT);
    state.practiceIdx = 0;
    state.practiceCorrect = 0;

    $('#practice-title').textContent = `PRÁCTICA — ${CONDITION_LABELS[cond]}`;
    $('#practice-count').textContent = '0';
    $('#practice-feedback').textContent = '';
    $('#practice-feedback').className = '';

    showScreen('screen-practice');
    showPracticeStimulus();
  }

  function showPracticeStimulus() {
    if (state.practiceIdx >= PRACTICE_COUNT) {
      // Practice complete — show ready message
      $('#practice-stimulus').textContent = '✓';
      $('#practice-stimulus').style.color = '#43A047';
      $('#practice-feedback').textContent = '¡Práctica completada! Pulse "Comenzar Test" para iniciar.';
      $('#practice-feedback').className = 'feedback-correct';
      $('#btn-start-test').style.display = 'inline-block';
      return;
    }

    const stim = state.practiceStimuli[state.practiceIdx];
    const el = $('#practice-stimulus');
    el.textContent = stim.word;
    el.style.color = stim.ink;
    $('#practice-feedback').textContent = '';
    $('#practice-feedback').className = '';
    $('#btn-start-test').style.display = 'none';
  }

  function handlePracticeResponse(color) {
    if (state.practiceIdx >= PRACTICE_COUNT) return;

    const stim = state.practiceStimuli[state.practiceIdx];
    const correct = (color === stim.correctAnswer);
    const fb = $('#practice-feedback');

    if (correct) {
      fb.textContent = '✓ ¡Correcto!';
      fb.className = 'feedback-correct';
      state.practiceCorrect++;
      state.practiceIdx++;
      $('#practice-count').textContent = state.practiceIdx;
      setTimeout(showPracticeStimulus, 600);
    } else {
      fb.textContent = '✗ Incorrecto — inténtelo de nuevo';
      fb.className = 'feedback-incorrect';
      // Flash the stimulus
      const el = $('#practice-stimulus');
      el.classList.add('shake');
      setTimeout(() => el.classList.remove('shake'), 400);
    }
  }

  /* ────────────────────────────────────────────────────────────
   *  COUNTDOWN (3-2-1)
   * ──────────────────────────────────────────────────────────── */
  function startCountdown() {
    showScreen('screen-countdown');
    let count = 3;
    const el = $('#countdown-number');
    el.textContent = count;

    const interval = setInterval(() => {
      count--;
      if (count > 0) {
        el.textContent = count;
        el.classList.add('countdown-pulse');
        setTimeout(() => el.classList.remove('countdown-pulse'), 300);
      } else {
        clearInterval(interval);
        startTest();
      }
    }, 1000);
  }

  /* ────────────────────────────────────────────────────────────
   *  TEST ENGINE
   * ──────────────────────────────────────────────────────────── */
  function startTest() {
    const cond = CONDITIONS[state.conditionIndex];
    state.stimuli = generateStimuli(cond, 200); // extra in case they go fast
    state.stimulusIdx = 0;
    state.testRunning = true;
    state.timeRemaining = TEST_DURATION;
    state.testStartTime = performance.now();

    // Reset condition results
    state.results[cond] = { correct: 0, errors: 0, responses: [] };

    // Update UI
    $('#test-condition-label').textContent = CONDITION_LABELS[cond];
    $('#test-score').textContent = '0';
    $('#test-errors').textContent = '0';
    updateTimerDisplay(TEST_DURATION);

    showScreen('screen-test');
    showNextStimulus();

    // Start countdown timer
    state.testTimer = setInterval(() => {
      const elapsed = (performance.now() - state.testStartTime) / 1000;
      state.timeRemaining = Math.max(0, TEST_DURATION - elapsed);

      updateTimerDisplay(state.timeRemaining);

      if (state.timeRemaining <= 0) {
        endTest();
      }
    }, 100);
  }

  function updateTimerDisplay(seconds) {
    const display = $('#test-timer');
    display.textContent = Math.ceil(seconds);

    // Timer circle animation
    const circle = $('#timer-circle-fg');
    if (circle) {
      const circumference = 2 * Math.PI * 35;
      const progress = seconds / TEST_DURATION;
      circle.style.strokeDashoffset = circumference * (1 - progress);
    }

    // Warning state
    if (seconds <= 10) {
      display.classList.add('timer-warning');
    } else {
      display.classList.remove('timer-warning');
    }
  }

  function showNextStimulus() {
    if (!state.testRunning) return;
    if (state.stimulusIdx >= state.stimuli.length) {
      // Ran out of stimuli (very fast responder), generate more
      const cond = CONDITIONS[state.conditionIndex];
      state.stimuli = state.stimuli.concat(generateStimuli(cond, 100));
    }

    const stim = state.stimuli[state.stimulusIdx];
    const el = $('#stimulus');
    el.textContent = stim.word;
    el.style.color = stim.ink;
    el.style.opacity = '1';
    state.stimulusShownAt = performance.now();
  }

  function handleTestResponse(color) {
    if (!state.testRunning) return;

    const cond = CONDITIONS[state.conditionIndex];
    const stim = state.stimuli[state.stimulusIdx];
    const rt = performance.now() - state.stimulusShownAt;
    const correct = (color === stim.correctAnswer);

    state.results[cond].responses.push({
      stimulus: stim,
      response: color,
      correct: correct,
      rt: rt
    });

    if (correct) {
      state.results[cond].correct++;
      $('#test-score').textContent = state.results[cond].correct;
    } else {
      state.results[cond].errors++;
      $('#test-errors').textContent = state.results[cond].errors;
    }

    // Brief fade transition
    const el = $('#stimulus');
    el.style.opacity = '0.3';

    state.stimulusIdx++;
    setTimeout(showNextStimulus, 150);
  }

  function endTest() {
    state.testRunning = false;
    clearInterval(state.testTimer);
    state.testTimer = null;

    const cond = CONDITIONS[state.conditionIndex];
    const res = state.results[cond];

    // Show condition done screen
    const text = `<strong>${CONDITION_LABELS[cond]}</strong><br>
      Aciertos: <strong>${res.correct}</strong><br>
      Errores: <strong>${res.errors}</strong><br>
      Total respuestas: <strong>${res.correct + res.errors}</strong>`;
    $('#condition-result-text').innerHTML = text;

    // Update button text
    const isLast = (state.conditionIndex >= CONDITIONS.length - 1);
    $('#btn-next-condition').textContent = isLast ? 'Ver Resultados' : 'Siguiente Condición';

    showScreen('screen-condition-done');
  }

  function nextCondition() {
    state.conditionIndex++;
    if (state.conditionIndex >= CONDITIONS.length) {
      showResults();
    } else {
      showInstructions();
    }
  }

  /* ────────────────────────────────────────────────────────────
   *  RESULTS & SCORING
   * ──────────────────────────────────────────────────────────── */
  function showResults() {
    const rawP  = state.results.P.correct;
    const rawC  = state.results.C.correct;
    const rawPC = state.results.PC.correct;
    const age   = parseInt(state.patient.edad);

    // Calculate all scores using StroopScoring module
    state.scoring = StroopScoring.calculateAll(rawP, rawC, rawPC, age);
    const r = state.scoring;

    // Fill patient info
    $('#results-patient-name').textContent = state.patient.nombre;
    $('#results-patient-age').textContent = `${age} años`;
    $('#results-patient-date').textContent = new Date().toLocaleDateString('es-ES');

    // Fill results table
    const tbody = $('#results-tbody');
    tbody.innerHTML = '';

    const rows = [
      { label: 'Palabra (P)',       raw: r.raw.P,  corr: `+${r.corrections.P}`, corrected: r.corrected.P, t: r.tScores.P, pct: r.percentiles.P, cls: r.labels.P, cssClass: r.classes.P },
      { label: 'Color (C)',         raw: r.raw.C,  corr: `+${r.corrections.C}`, corrected: r.corrected.C, t: r.tScores.C, pct: r.percentiles.C, cls: r.labels.C, cssClass: r.classes.C },
      { label: 'Palabra-Color (PC)',raw: r.raw.PC, corr: `+${r.corrections.PC}`, corrected: r.corrected.PC, t: r.tScores.PC, pct: r.percentiles.PC, cls: r.labels.PC, cssClass: r.classes.PC },
      { label: "PC Estimada (PC')", raw: '—',      corr: '—',                   corrected: r.pcPrime.toFixed(1), t: '—', pct: '—', cls: 'Valor Teórico', cssClass: '' },
      { label: 'Interferencia',     raw: '—',      corr: '—',                   corrected: r.interference.toFixed(1), t: r.tScores.INT, pct: r.percentiles.INT, cls: r.labels.INT, cssClass: r.classes.INT }
    ];

    rows.forEach(row => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="label-cell">${row.label}</td>
        <td>${row.raw}</td>
        <td>${row.corr}</td>
        <td><strong>${row.corrected}</strong></td>
        <td><strong>${row.t}</strong></td>
        <td>${row.pct}</td>
        <td class="${row.cssClass}">${row.cls}</td>`;
      tbody.appendChild(tr);
    });

    // Reaction time summary
    showRTSummary();

    // Render profile chart
    renderProfileChart();

    showScreen('screen-results');

    // Auto-save to localStorage
    saveResult();
  }

  function showRTSummary() {
    const container = $('#rt-summary');
    container.innerHTML = '<h3>Tiempos de Reacción (ms)</h3>';

    const table = document.createElement('table');
    table.className = 'rt-table';
    table.innerHTML = `<thead><tr>
      <th>Condición</th><th>Media</th><th>Mediana</th><th>DE</th><th>Mín</th><th>Máx</th>
    </tr></thead><tbody></tbody>`;

    const tbody = table.querySelector('tbody');

    CONDITIONS.forEach(cond => {
      const rts = state.results[cond].responses
        .filter(r => r.correct)
        .map(r => r.rt);

      if (rts.length === 0) {
        tbody.innerHTML += `<tr><td>${CONDITION_LABELS[cond]}</td><td colspan="5">Sin datos</td></tr>`;
        return;
      }

      const mean = rts.reduce((a, b) => a + b, 0) / rts.length;
      const sorted = [...rts].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const variance = rts.reduce((s, x) => s + Math.pow(x - mean, 2), 0) / rts.length;
      const sd = Math.sqrt(variance);

      tbody.innerHTML += `<tr>
        <td>${CONDITION_LABELS[cond]}</td>
        <td>${Math.round(mean)}</td>
        <td>${Math.round(median)}</td>
        <td>${Math.round(sd)}</td>
        <td>${Math.round(sorted[0])}</td>
        <td>${Math.round(sorted[sorted.length - 1])}</td>
      </tr>`;
    });

    container.appendChild(table);
  }

  function renderProfileChart() {
    const canvas = $('#profile-chart');
    const ctx = canvas.getContext('2d');
    const r = state.scoring;

    // Destroy previous chart if exists
    if (window._stroopChart) {
      window._stroopChart.destroy();
    }

    window._stroopChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Palabra (P)', 'Color (C)', 'Palabra-Color (PC)', 'Interferencia'],
        datasets: [{
          label: 'Puntuación T',
          data: [r.tScores.P, r.tScores.C, r.tScores.PC, r.tScores.INT],
          backgroundColor: [
            'rgba(26, 35, 126, 0.75)',
            'rgba(66, 165, 245, 0.75)',
            'rgba(67, 160, 71, 0.75)',
            'rgba(244, 81, 30, 0.75)'
          ],
          borderColor: [
            '#1a237e', '#42a5f5', '#43a047', '#f4511e'
          ],
          borderWidth: 2,
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            min: 20,
            max: 80,
            ticks: { stepSize: 5 },
            title: { display: true, text: 'Puntuación T' }
          }
        },
        plugins: {
          legend: { display: false },
          annotation: undefined,
          title: {
            display: true,
            text: 'Perfil de Puntuaciones T',
            font: { size: 14, weight: 'bold' }
          }
        }
      },
      plugins: [{
        id: 'normalRange',
        beforeDraw(chart) {
          const { ctx, chartArea, scales } = chart;
          const yStart = scales.y.getPixelForValue(45);
          const yEnd = scales.y.getPixelForValue(55);
          ctx.save();
          ctx.fillStyle = 'rgba(76, 175, 80, 0.1)';
          ctx.fillRect(chartArea.left, yEnd, chartArea.right - chartArea.left, yStart - yEnd);
          // Mean line
          const yMean = scales.y.getPixelForValue(50);
          ctx.strokeStyle = 'rgba(76, 175, 80, 0.6)';
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.moveTo(chartArea.left, yMean);
          ctx.lineTo(chartArea.right, yMean);
          ctx.stroke();
          ctx.restore();
        }
      }]
    });
  }

  /* ────────────────────────────────────────────────────────────
   *  DATA PERSISTENCE
   * ──────────────────────────────────────────────────────────── */

  function buildResultRecord() {
    return {
      id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      patient: { ...state.patient },
      fechaEval: new Date().toISOString(),
      raw: state.scoring.raw,
      corrections: state.scoring.corrections,
      corrected: state.scoring.corrected,
      pcPrime: state.scoring.pcPrime,
      interference: state.scoring.interference,
      tScores: state.scoring.tScores,
      percentiles: state.scoring.percentiles,
      labels: state.scoring.labels,
      interpretation: state.scoring.interpretation,
      reactionTimes: {
        P:  computeRT(state.results.P),
        C:  computeRT(state.results.C),
        PC: computeRT(state.results.PC)
      },
      errors: {
        P:  state.results.P.errors,
        C:  state.results.C.errors,
        PC: state.results.PC.errors
      },
      observations: ''
    };
  }

  function computeRT(condResult) {
    const rts = condResult.responses.filter(r => r.correct).map(r => r.rt);
    if (!rts.length) return { mean: 0, median: 0, sd: 0 };
    const mean = rts.reduce((a, b) => a + b, 0) / rts.length;
    const sorted = [...rts].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const variance = rts.reduce((s, x) => s + Math.pow(x - mean, 2), 0) / rts.length;
    return { mean: Math.round(mean), median: Math.round(median), sd: Math.round(Math.sqrt(variance)) };
  }

  function saveResult() {
    const record = buildResultRecord();

    // Save to localStorage
    const records = loadLocalResults();
    records.unshift(record);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(records));

    // Save to server (Netlify) — fire and forget
    saveToServer(record);

    state.currentRecord = record;
  }

  function loadLocalResults() {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  }

  async function saveToServer(record) {
    try {
      const resp = await fetch(`${API_BASE}/results`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record)
      });
      if (resp.ok) {
        const data = await resp.json();
        // Update local record with server ID
        record.serverId = data.id;
        const records = loadLocalResults();
        const idx = records.findIndex(r => r.id === record.id);
        if (idx >= 0) {
          records[idx].serverId = data.id;
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(records));
        }
        console.log('✓ Resultado guardado en servidor:', data.id);
      }
    } catch (err) {
      console.log('Modo offline — resultado guardado localmente');
    }
  }

  async function loadServerResults() {
    try {
      const resp = await fetch(`${API_BASE}/results`);
      if (resp.ok) return await resp.json();
    } catch { /* offline */ }
    return null;
  }

  async function deleteResult(id, serverId) {
    // Remove from localStorage
    let records = loadLocalResults();
    records = records.filter(r => r.id !== id);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(records));

    // Remove from server
    if (serverId) {
      try {
        await fetch(`${API_BASE}/results/${serverId}`, { method: 'DELETE' });
      } catch { /* ignore */ }
    }
  }

  /* ────────────────────────────────────────────────────────────
   *  DASHBOARD
   * ──────────────────────────────────────────────────────────── */
  async function showDashboard() {
    showScreen('screen-dashboard');

    // Merge local and server data
    let records = loadLocalResults();

    // Try to get server records too
    const serverRecords = await loadServerResults();
    if (serverRecords && serverRecords.length) {
      // Merge: add server records that aren't already local
      const localIds = new Set(records.map(r => r.serverId).filter(Boolean));
      serverRecords.forEach(sr => {
        if (!localIds.has(sr.id)) {
          records.push(sr);
        }
      });
    }

    renderDashboard(records);
  }

  function renderDashboard(records) {
    const tbody = $('#patients-tbody');
    const empty = $('#dashboard-empty');
    const stats = $('#dashboard-stats');

    if (!records || records.length === 0) {
      tbody.innerHTML = '';
      empty.style.display = 'block';
      stats.innerHTML = '<span class="stat-card">Total evaluaciones: 0</span>';
      return;
    }

    empty.style.display = 'none';
    stats.innerHTML = `
      <span class="stat-card">Total evaluaciones: <strong>${records.length}</strong></span>
      <span class="stat-card">Última: <strong>${new Date(records[0].fechaEval).toLocaleDateString('es-ES')}</strong></span>`;

    tbody.innerHTML = records.map(r => {
      const date = new Date(r.fechaEval).toLocaleDateString('es-ES');
      const name = r.patient?.nombre || 'Sin nombre';
      const age = r.patient?.edad || '—';
      return `<tr>
        <td>${name}</td>
        <td>${age}</td>
        <td>${date}</td>
        <td class="${r.labels?.P === 'Muy Inferior' ? 'score-very-low' : ''}">${r.tScores?.P ?? '—'}</td>
        <td class="${r.labels?.C === 'Muy Inferior' ? 'score-very-low' : ''}">${r.tScores?.C ?? '—'}</td>
        <td class="${r.labels?.PC === 'Muy Inferior' ? 'score-very-low' : ''}">${r.tScores?.PC ?? '—'}</td>
        <td class="${r.labels?.INT === 'Muy Inferior' ? 'score-very-low' : ''}">${r.tScores?.INT ?? '—'}</td>
        <td>
          <button class="action-btn btn-view" data-id="${r.id}" title="Ver detalle">📄</button>
          <button class="action-btn btn-delete" data-id="${r.id}" data-server-id="${r.serverId || ''}" title="Eliminar">🗑️</button>
        </td>
      </tr>`;
    }).join('');

    // Attach event listeners
    tbody.querySelectorAll('.btn-view').forEach(btn => {
      btn.addEventListener('click', () => viewResultDetail(btn.dataset.id, records));
    });
    tbody.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('¿Eliminar esta evaluación?')) {
          await deleteResult(btn.dataset.id, btn.dataset.serverId);
          showDashboard();
        }
      });
    });
  }

  function viewResultDetail(id, records) {
    const record = records.find(r => r.id === id);
    if (!record) return;

    state.selectedResultId = id;
    const content = $('#report-detail-content');

    content.innerHTML = `
      <div class="detail-header">
        <h3>${record.patient?.nombre || 'Sin nombre'}</h3>
        <p>Edad: ${record.patient?.edad} años &nbsp;|&nbsp; Fecha: ${new Date(record.fechaEval).toLocaleDateString('es-ES')}</p>
        <p>Evaluador: ${record.patient?.evaluador || '—'} &nbsp;|&nbsp; Motivo: ${record.patient?.motivo || '—'}</p>
      </div>
      <table class="results-detail-table">
        <thead><tr>
          <th>Escala</th><th>PD</th><th>Corr.</th><th>PD Corr.</th><th>T</th><th>Pc</th><th>Clasif.</th>
        </tr></thead>
        <tbody>
          <tr><td>Palabra (P)</td><td>${record.raw.P}</td><td>+${record.corrections.P}</td><td>${record.corrected.P}</td><td><strong>${record.tScores.P}</strong></td><td>${record.percentiles.P}</td><td>${record.labels.P}</td></tr>
          <tr><td>Color (C)</td><td>${record.raw.C}</td><td>+${record.corrections.C}</td><td>${record.corrected.C}</td><td><strong>${record.tScores.C}</strong></td><td>${record.percentiles.C}</td><td>${record.labels.C}</td></tr>
          <tr><td>Palabra-Color (PC)</td><td>${record.raw.PC}</td><td>+${record.corrections.PC}</td><td>${record.corrected.PC}</td><td><strong>${record.tScores.PC}</strong></td><td>${record.percentiles.PC}</td><td>${record.labels.PC}</td></tr>
          <tr><td>PC Estimada (PC')</td><td>—</td><td>—</td><td>${record.pcPrime.toFixed(1)}</td><td>—</td><td>—</td><td>Valor Teórico</td></tr>
          <tr><td>Interferencia</td><td>—</td><td>—</td><td>${record.interference.toFixed(1)}</td><td><strong>${record.tScores.INT}</strong></td><td>${record.percentiles.INT}</td><td>${record.labels.INT}</td></tr>
        </tbody>
      </table>
      <div class="interpretation-box">
        <h4>Interpretación Neuropsicológica</h4>
        <p>${record.interpretation}</p>
      </div>`;

    // Render chart for detail view
    setTimeout(() => {
      renderDetailChart(record);
    }, 100);

    showScreen('screen-report-detail');
  }

  function renderDetailChart(record) {
    const canvas = $('#detail-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (window._detailChart) window._detailChart.destroy();

    window._detailChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['P', 'C', 'PC', 'INT'],
        datasets: [{
          label: 'Puntuación T',
          data: [record.tScores.P, record.tScores.C, record.tScores.PC, record.tScores.INT],
          backgroundColor: ['rgba(26,35,126,0.7)', 'rgba(66,165,245,0.7)', 'rgba(67,160,71,0.7)', 'rgba(244,81,30,0.7)'],
          borderColor: ['#1a237e', '#42a5f5', '#43a047', '#f4511e'],
          borderWidth: 2,
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { min: 20, max: 80, ticks: { stepSize: 10 }, title: { display: true, text: 'T' } }
        },
        plugins: { legend: { display: false } }
      },
      plugins: [{
        id: 'normalRange',
        beforeDraw(chart) {
          const { ctx, chartArea, scales } = chart;
          const yTop = scales.y.getPixelForValue(55);
          const yBot = scales.y.getPixelForValue(45);
          ctx.save();
          ctx.fillStyle = 'rgba(76,175,80,0.1)';
          ctx.fillRect(chartArea.left, yTop, chartArea.right - chartArea.left, yBot - yTop);
          ctx.restore();
        }
      }]
    });
  }

  /* ────────────────────────────────────────────────────────────
   *  PDF REPORT GENERATION
   * ──────────────────────────────────────────────────────────── */
  async function generatePDF() {
    // Render chart to hidden canvas for PDF embedding
    const pdfCanvas = $('#pdf-chart-canvas');
    const pdfCtx = pdfCanvas.getContext('2d');
    pdfCanvas.width = 600;
    pdfCanvas.height = 300;

    if (window._pdfChart) window._pdfChart.destroy();

    await new Promise(resolve => {
      window._pdfChart = new Chart(pdfCtx, {
        type: 'bar',
        data: {
          labels: ['Palabra (P)', 'Color (C)', 'Palabra-Color (PC)', 'Interferencia'],
          datasets: [{
            label: 'Puntuación T',
            data: [state.scoring.tScores.P, state.scoring.tScores.C, state.scoring.tScores.PC, state.scoring.tScores.INT],
            backgroundColor: ['rgba(26,35,126,0.8)', 'rgba(66,165,245,0.8)', 'rgba(67,160,71,0.8)', 'rgba(244,81,30,0.8)'],
            borderColor: ['#1a237e', '#42a5f5', '#43a047', '#f4511e'],
            borderWidth: 2,
            borderRadius: 4
          }]
        },
        options: {
          responsive: false,
          animation: { onComplete: resolve },
          scales: {
            y: { min: 20, max: 80, ticks: { stepSize: 5 }, title: { display: true, text: 'Puntuación T' } }
          },
          plugins: { legend: { display: false }, title: { display: true, text: 'Perfil de Puntuaciones T', font: { size: 14 } } }
        },
        plugins: [{
          id: 'normalRange',
          beforeDraw(chart) {
            const { ctx, chartArea, scales } = chart;
            const yTop = scales.y.getPixelForValue(55);
            const yBot = scales.y.getPixelForValue(45);
            ctx.save();
            ctx.fillStyle = 'rgba(76,175,80,0.15)';
            ctx.fillRect(chartArea.left, yTop, chartArea.right - chartArea.left, yBot - yTop);
            const yMean = scales.y.getPixelForValue(50);
            ctx.strokeStyle = 'rgba(76,175,80,0.5)';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(chartArea.left, yMean);
            ctx.lineTo(chartArea.right, yMean);
            ctx.stroke();
            ctx.restore();
          }
        }]
      });
    });

    const chartImage = pdfCanvas.toDataURL('image/png');
    const observations = $('#observations').value || '';

    // Update record observations
    if (state.currentRecord) {
      state.currentRecord.observations = observations;
      const records = loadLocalResults();
      const idx = records.findIndex(r => r.id === state.currentRecord.id);
      if (idx >= 0) {
        records[idx].observations = observations;
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(records));
      }
    }

    // Generate PDF using StroopReport module
    const patientData = {
      ...state.patient,
      fechaEval: new Date().toLocaleDateString('es-ES')
    };

    StroopReport.generate(patientData, state.scoring, chartImage, observations);
  }

  /* ────────────────────────────────────────────────────────────
   *  SEARCH / FILTER
   * ──────────────────────────────────────────────────────────── */
  function filterDashboard(query) {
    const records = loadLocalResults();
    const filtered = query
      ? records.filter(r => r.patient?.nombre?.toLowerCase().includes(query.toLowerCase()))
      : records;
    renderDashboard(filtered);
  }

  /* ────────────────────────────────────────────────────────────
   *  EVENT LISTENERS
   * ──────────────────────────────────────────────────────────── */
  function initEventListeners() {
    // ── Home screen ──
    $('#btn-new-test').addEventListener('click', () => {
      state.conditionIndex = 0;
      state.results = {
        P:  { correct: 0, errors: 0, responses: [] },
        C:  { correct: 0, errors: 0, responses: [] },
        PC: { correct: 0, errors: 0, responses: [] }
      };
      showScreen('screen-patient');
    });

    $('#btn-dashboard').addEventListener('click', showDashboard);

    // ── Patient form ──
    $('#patient-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const form = e.target;
      state.patient = {
        nombre: form.querySelector('[name="nombre"]').value.trim(),
        edad: form.querySelector('[name="edad"]').value,
        fechaNac: form.querySelector('[name="fechaNac"]').value,
        sexo: form.querySelector('[name="sexo"]').value,
        escolaridad: form.querySelector('[name="escolaridad"]').value.trim(),
        lateralidad: form.querySelector('[name="lateralidad"]').value,
        evaluador: form.querySelector('[name="evaluador"]').value.trim(),
        motivo: form.querySelector('[name="motivo"]').value.trim()
      };
      showInstructions();
    });

    $('#btn-patient-back').addEventListener('click', () => showScreen('screen-home'));

    // ── Instructions ──
    $('#btn-start-practice').addEventListener('click', startPractice);

    // ── Practice responses ──
    $$('#practice-response-buttons .btn-response').forEach(btn => {
      btn.addEventListener('click', () => handlePracticeResponse(btn.dataset.color));
    });

    // ── Start test from practice ──
    $('#btn-start-test').addEventListener('click', startCountdown);

    // ── Test responses ──
    $$('#response-buttons .btn-response').forEach(btn => {
      btn.addEventListener('click', () => handleTestResponse(btn.dataset.color));
    });

    // ── Keyboard input ──
    document.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      if (!KEY_MAP[key]) return;

      const color = KEY_MAP[key];

      if (state.currentScreen === 'screen-test' && state.testRunning) {
        handleTestResponse(color);
        highlightButton(`#btn-resp-${color}`);
      } else if (state.currentScreen === 'screen-practice') {
        handlePracticeResponse(color);
        highlightButton(`#practice-response-buttons .btn-${color === 'rojo' ? 'red' : color === 'verde' ? 'green' : 'blue'}`);
      }
    });

    // ── Condition done ──
    $('#btn-next-condition').addEventListener('click', nextCondition);

    // ── Results ──
    $('#btn-generate-pdf').addEventListener('click', generatePDF);
    $('#btn-new-from-results').addEventListener('click', () => {
      state.conditionIndex = 0;
      showScreen('screen-patient');
    });
    $('#btn-results-home').addEventListener('click', () => showScreen('screen-home'));

    // ── Dashboard ──
    $('#btn-dashboard-back').addEventListener('click', () => showScreen('screen-home'));
    $('#search-patient').addEventListener('input', (e) => filterDashboard(e.target.value));

    // ── Report detail ──
    $('#btn-detail-back').addEventListener('click', showDashboard);
    $('#btn-detail-pdf').addEventListener('click', () => {
      const records = loadLocalResults();
      const record = records.find(r => r.id === state.selectedResultId);
      if (!record) return;

      // Generate PDF for past record
      const patientData = {
        ...record.patient,
        fechaEval: new Date(record.fechaEval).toLocaleDateString('es-ES')
      };

      // Render chart for PDF
      const pdfCanvas = $('#pdf-chart-canvas');
      const pdfCtx = pdfCanvas.getContext('2d');
      pdfCanvas.width = 600;
      pdfCanvas.height = 300;

      if (window._pdfChart) window._pdfChart.destroy();

      new Chart(pdfCtx, {
        type: 'bar',
        data: {
          labels: ['P', 'C', 'PC', 'INT'],
          datasets: [{
            data: [record.tScores.P, record.tScores.C, record.tScores.PC, record.tScores.INT],
            backgroundColor: ['rgba(26,35,126,0.8)', 'rgba(66,165,245,0.8)', 'rgba(67,160,71,0.8)', 'rgba(244,81,30,0.8)'],
            borderColor: ['#1a237e', '#42a5f5', '#43a047', '#f4511e'],
            borderWidth: 2, borderRadius: 4
          }]
        },
        options: {
          responsive: false,
          animation: {
            onComplete: () => {
              const chartImg = pdfCanvas.toDataURL('image/png');
              StroopReport.generate(patientData, record, chartImg, record.observations || '');
            }
          },
          scales: { y: { min: 20, max: 80 } },
          plugins: { legend: { display: false } }
        }
      });
    });
  }

  function highlightButton(selector) {
    const btn = $(selector);
    if (btn) {
      btn.classList.add('pressed');
      setTimeout(() => btn.classList.remove('pressed'), 150);
    }
  }

  /* ────────────────────────────────────────────────────────────
   *  INITIALIZATION
   * ──────────────────────────────────────────────────────────── */
  function init() {
    initEventListeners();
    showScreen('screen-home');
    console.log('🧠 Stroop Test v1.0 — Inicializado');
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
