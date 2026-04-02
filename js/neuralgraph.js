const STYLE_ID = 'radplan-neural-graph-styles';

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .ng-container {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      perspective: 1600px;
      background: transparent;
    }
    .ng-grid-base {
      transform-style: preserve-3d;
      transform-origin: center center;
      will-change: transform;
    }
    .ng-grid-float {
      display: grid;
      transform-style: preserve-3d;
      animation: ngFloating 10s ease-in-out infinite;
      will-change: transform;
    }
    @keyframes ngFloating {
      0%, 100% { transform: translateZ(0px) rotateZ(0deg); }
      50% { transform: translateZ(25px) rotateZ(1.5deg); }
    }
    .ng-iso-cell {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 4px;
      transform-style: preserve-3d;
      transition: all 0.4s cubic-bezier(0.34, 1.5, 0.64, 1);
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      will-change: transform, background-color, border-color;
    }
    .ng-iso-shadow {
      position: absolute;
      inset: -1px;
      background: transparent;
      transition: box-shadow 0.4s;
      transform: translateZ(-1px);
      border-radius: 4px;
      pointer-events: none;
    }
    .ng-day-number {
      position: absolute;
      top: 4px;
      left: 6px;
      font-family: var(--font-mono, monospace);
      font-size: 10px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.2);
      transform: translateZ(1px);
      pointer-events: none;
      user-select: none;
    }
    .ng-duty-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 3px;
      transform: translateZ(2px);
      pointer-events: none;
      width: 100%;
    }
    .ng-emp-label {
      font-family: var(--font-mono, monospace);
      font-size: 10.5px;
      font-weight: 800;
      color: transparent;
      transition: color 0.3s;
      user-select: none;
      letter-spacing: 0.05em;
      line-height: 1;
      text-align: center;
      min-height: 10.5px;
    }
  `;
  document.head.appendChild(style);
}

export class NeuralGraph {
  constructor(container) {
    this.container = container;
    this.cells = new Map();
    this.employees = [];
    this.daysCount = 0;
    this.phase = 'init';
    this.miniMapCanvas = null;
    this.miniMapCtx = null;
    this.pulses = [];
    this.animId = null;
    this.resizeObserver = null;
    this.gridBase = null;
    this.gridFloat = null;
    this.cellSize = 44;
    this.cellGap = 6;
    this.columns = 7;
    
    injectStyles();
    this.buildDOM();
    this.setupResizeObserver();
  }

  buildDOM() {
    this.container.innerHTML = '';
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'ng-container';
    this.gridBase = document.createElement('div');
    this.gridBase.className = 'ng-grid-base';
    this.gridFloat = document.createElement('div');
    this.gridFloat.className = 'ng-grid-float';
    
    this.gridBase.appendChild(this.gridFloat);
    this.wrapper.appendChild(this.gridBase);
    this.container.appendChild(this.wrapper);
  }

  setupResizeObserver() {
    this.resizeObserver = new ResizeObserver(() => {
      this.updateGridScale();
      this.resizeMiniMap();
    });
    this.resizeObserver.observe(this.container);
  }

  updateGridScale() {
    if (!this.daysCount || !this.gridBase) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    
    const rows = Math.ceil(this.daysCount / this.columns);
    const gridW = this.columns * (this.cellSize + this.cellGap) - this.cellGap;
    const gridH = rows * (this.cellSize + this.cellGap) - this.cellGap;
    
    // Exakte trigonometrische Bounding-Box für CSS isometrische Projektion
    // Z-Rotation: -45deg -> cos(45) ≈ 0.7071
    // X-Rotation: 60deg -> cos(60) = 0.5
    const cos45 = 0.7071;
    const cos60 = 0.5;
    
    const boundingW = (gridW + gridH) * cos45;
    const boundingH = (gridW + gridH) * cos45 * cos60;
    
    // Optimales ausnutzen des Platzes (90% Breite, 85% Höhe für Z-Pop Puffer)
    const targetW = w * 0.90;
    const targetH = h * 0.85;
    
    const scaleX = targetW / boundingW;
    const scaleY = targetH / boundingH;
    
    // Minimaler Skalierungsfaktor um Box in Viewport einzupassen
    const scale = Math.min(scaleX, scaleY, 4.0);
    
    this.gridBase.style.transform = `scale(${scale}) rotateX(60deg) rotateZ(-45deg)`;
  }

  initData(daysCount, employees) {
    this.daysCount = daysCount;
    this.employees = employees;
    this.gridFloat.innerHTML = '';
    this.cells.clear();

    const rows = Math.ceil(daysCount / this.columns);
    this.gridFloat.style.gridTemplateColumns = `repeat(${this.columns}, ${this.cellSize}px)`;
    this.gridFloat.style.gridTemplateRows = `repeat(${rows}, ${this.cellSize}px)`;
    this.gridFloat.style.gap = `${this.cellGap}px`;

    for (let d = 1; d <= daysCount; d++) {
      const cell = document.createElement('div');
      cell.className = 'ng-iso-cell';
      
      const shadow = document.createElement('div');
      shadow.className = 'ng-iso-shadow';
      
      const dayLabel = document.createElement('div');
      dayLabel.className = 'ng-day-number';
      dayLabel.textContent = d;

      const dutyWrap = document.createElement('div');
      dutyWrap.className = 'ng-duty-wrap';

      const dLabel = document.createElement('div');
      dLabel.className = 'ng-emp-label ng-emp-d';
      dLabel.textContent = ''; 

      const hgLabel = document.createElement('div');
      hgLabel.className = 'ng-emp-label ng-emp-hg';
      hgLabel.textContent = ''; 
      
      dutyWrap.appendChild(dLabel);
      dutyWrap.appendChild(hgLabel);
      
      cell.appendChild(shadow);
      cell.appendChild(dayLabel);
      cell.appendChild(dutyWrap);
      this.gridFloat.appendChild(cell);
      
      this.cells.set(d, { el: cell, shadow, dLabel, hgLabel });
    }
    this.updateGridScale();
  }

  attachMiniMap(container) {
    container.innerHTML = '';
    this.miniMapCanvas = document.createElement('canvas');
    this.miniMapCanvas.style.width = '100%';
    this.miniMapCanvas.style.height = '100%';
    this.miniMapCanvas.style.display = 'block';
    container.appendChild(this.miniMapCanvas);
    this.miniMapCtx = this.miniMapCanvas.getContext('2d', { alpha: false });
    
    if (this.resizeObserver) {
      this.resizeObserver.observe(container);
    }
    
    this.resizeMiniMap();
    this.startLoop();
  }

  resizeMiniMap() {
    if (!this.miniMapCanvas || !this.miniMapCanvas.parentElement) return;
    const parent = this.miniMapCanvas.parentElement;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    if (w === 0 || h === 0) return;
    
    const dpr = window.devicePixelRatio || 1;
    this.miniMapCanvas.width = w * dpr;
    this.miniMapCanvas.height = h * dpr;
    this.miniMapCtx.scale(dpr, dpr);
  }

  getPhaseColor(alpha = 1) {
    const colors = {
      init: `rgba(14, 165, 233, ${alpha})`,
      greedy: `rgba(245, 158, 11, ${alpha})`,
      hg: `rgba(56, 189, 248, ${alpha})`,
      deep: `rgba(168, 85, 247, ${alpha})`,
      success: `rgba(34, 197, 94, ${alpha})`,
      error: `rgba(239, 68, 68, ${alpha})`
    };
    return colors[this.phase] || colors.init;
  }

  getAbbreviation(empId) {
    if (!empId) return '';
    const parts = empId.split(' ');
    const last = parts.length > 1 ? parts[parts.length - 1] : empId;
    return last.substring(0, 2).toUpperCase();
  }

  pulseCell(dayIdx, empId, isActive, isError = false, dutyType = "D") {
    const cellData = this.cells.get(dayIdx);
    if (!cellData) return;
    
    const { el, shadow, dLabel, hgLabel } = cellData;

    if (empId) {
      if (dutyType === "HG") {
        hgLabel.textContent = this.getAbbreviation(empId);
      } else {
        dLabel.textContent = this.getAbbreviation(empId);
      }
    }

    if (isActive) {
      const color = isError ? this.getPhaseColor(1) : this.getPhaseColor(0.8);
      const shadowColor = isError ? this.getPhaseColor(0.5) : this.getPhaseColor(0.3);
      
      el.style.transform = isError ? 'translateZ(40px) scale(1.08)' : 'translateZ(25px)';
      el.style.background = color;
      el.style.borderColor = color;
      shadow.style.boxShadow = `0 15px 25px ${shadowColor}`;
      if (dutyType === "HG" && hgLabel.textContent) hgLabel.style.color = '#ffffff';
      if (dutyType === "D" && dLabel.textContent) dLabel.style.color = '#ffffff';
    } else {
      el.style.transform = 'translateZ(0px)';
      el.style.background = 'rgba(255, 255, 255, 0.04)';
      el.style.borderColor = 'rgba(255, 255, 255, 0.1)';
      shadow.style.boxShadow = 'none';
      if (dLabel.textContent) dLabel.style.color = '#EF4444'; 
      if (hgLabel.textContent) hgLabel.style.color = '#0EA5E9';
    }
  }

  fireMiniMapPulse(isError = false) {
    this.pulses.push({
      progress: 0,
      color: isError ? 'rgba(239, 68, 68, 1)' : this.getPhaseColor(1),
      speed: 0.04 + Math.random() * 0.04,
      direction: Math.random() > 0.5 ? 1 : -1
    });
  }

  triggerSwap(dayIdx, oldEmpId, newEmpId, dutyType = "D") {
    this.pulseCell(dayIdx, newEmpId, true, false, dutyType);
    this.fireMiniMapPulse();
    
    setTimeout(() => {
      if (this.phase !== 'success') {
        this.pulseCell(dayIdx, newEmpId, false, false, dutyType);
      }
    }, 400);
  }

  triggerAssignment(dayIdx, empId, dutyType = "D") {
    this.pulseCell(dayIdx, empId, true, false, dutyType);
    this.fireMiniMapPulse();
    
    setTimeout(() => {
      if (this.phase !== 'success') {
        this.pulseCell(dayIdx, empId, false, false, dutyType);
      }
    }, 400);
  }

  triggerError(dayIdx, empId, dutyType = "D") {
    const oldPhase = this.phase;
    this.phase = 'error';
    this.pulseCell(dayIdx, empId, true, true, dutyType);
    this.fireMiniMapPulse(true);
    
    setTimeout(() => {
      this.phase = oldPhase;
      this.pulseCell(dayIdx, empId, false, false, dutyType);
    }, 300);
  }

  setPhase(phase) {
    this.phase = phase;
  }

  triggerSuccess(finalAssignments) {
    this.phase = 'success';
    
    if (finalAssignments) {
      for (const [emp, days] of Object.entries(finalAssignments)) {
        for (const [dayStr, data] of Object.entries(days)) {
          const dayIdx = parseInt(dayStr, 10);
          const cellData = this.cells.get(dayIdx);
          if (cellData && data.duty) {
            if (data.duty === "D") cellData.dLabel.textContent = this.getAbbreviation(emp);
            if (data.duty === "HG") cellData.hgLabel.textContent = this.getAbbreviation(emp);
          }
        }
      }
    }

    let delay = 0;
    for (const [dayIdx, cellData] of this.cells.entries()) {
      const hasD = cellData.dLabel.textContent !== '';
      const hasHG = cellData.hgLabel.textContent !== '';
      
      if (hasD || hasHG) {
        setTimeout(() => {
          cellData.el.style.transform = 'translateZ(15px)';
          cellData.el.style.background = this.getPhaseColor(0.8);
          cellData.el.style.borderColor = this.getPhaseColor(1);
          cellData.shadow.style.boxShadow = `0 10px 20px ${this.getPhaseColor(0.4)}`;
          if (hasD) cellData.dLabel.style.color = '#ffffff';
          if (hasHG) cellData.hgLabel.style.color = '#ffffff';
        }, delay);
        delay += 25;
      }
    }
    
    for (let p = 0; p < 15; p++) {
      setTimeout(() => this.fireMiniMapPulse(), p * 60);
    }
  }

  startLoop() {
    if (this.animId) cancelAnimationFrame(this.animId);
    const loop = () => {
      this.renderMiniMap();
      this.animId = requestAnimationFrame(loop);
    };
    this.animId = requestAnimationFrame(loop);
  }

  renderMiniMap() {
    if (!this.miniMapCtx || !this.miniMapCanvas.parentElement) return;
    
    const ctx = this.miniMapCtx;
    const parent = this.miniMapCanvas.parentElement;
    const w = parent.clientWidth;
    const h = parent.clientHeight;

    ctx.fillStyle = '#040A15';
    ctx.fillRect(0, 0, w, h);

    const padX = 30;
    const lineY = h / 2;
    const lineLen = w - padX * 2;

    ctx.beginPath();
    ctx.moveTo(padX, lineY);
    ctx.lineTo(w - padX, lineY);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.stroke();

    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const p = this.pulses[i];
      p.progress += p.speed;

      if (p.progress >= 1) {
        this.pulses.splice(i, 1);
        continue;
      }

      const x = p.direction === 1 
        ? padX + lineLen * p.progress 
        : (w - padX) - lineLen * p.progress;

      ctx.beginPath();
      ctx.arc(x, lineY, 3, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    ctx.beginPath();
    ctx.arc(padX, lineY, 4, 0, Math.PI * 2);
    ctx.arc(w - padX, lineY, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#0F172A';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = this.getPhaseColor(0.8);
    ctx.stroke();
  }

  dispose() {
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.container) this.container.innerHTML = '';
    this.cells.clear();
    this.pulses = [];
  }
}