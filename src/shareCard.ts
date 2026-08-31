import { challengeScore, encodeChallenge, localDateKey } from './game/challenge';
import type { GameState } from './game/types';

function downloadCanvas(canvas: HTMLCanvasElement, filename: string): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }, 'image/png');
}

function baseCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1440;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const gradient = ctx.createLinearGradient(0, 0, 0, 1440);
  gradient.addColorStop(0, '#1D2A32');
  gradient.addColorStop(0.48, '#14191C');
  gradient.addColorStop(1, '#07090A');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1080, 1440);
  ctx.fillStyle = 'rgba(245,176,91,0.08)';
  ctx.beginPath(); ctx.arc(805, 190, 330, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(88,122,139,0.08)';
  ctx.beginPath(); ctx.arc(180, 500, 300, 0, Math.PI * 2); ctx.fill();
  return { canvas, ctx };
}

function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, color = '#F8EAD4', weight = 700): void {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px Inter, "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.fillText(value, x, y);
}

function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill = 'rgba(12,15,17,0.78)'): void {
  ctx.fillStyle = fill;
  ctx.strokeStyle = 'rgba(255,226,178,0.13)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 24);
  ctx.fill();
  ctx.stroke();
}

function drawPerson(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1): void {
  ctx.fillStyle = '#171B1D';
  ctx.beginPath(); ctx.arc(x, y - 16 * scale, 7 * scale, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(x - 6 * scale, y - 8 * scale, 12 * scale, 24 * scale);
}

function drawStreet(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, level: number, people = 0, dawn = false): void {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 20);
  ctx.clip();

  const sky = ctx.createLinearGradient(0, y, 0, y + h);
  sky.addColorStop(0, dawn ? '#344853' : '#12191E');
  sky.addColorStop(0.58, dawn ? '#1C292E' : '#0E1316');
  sky.addColorStop(1, '#080A0B');
  ctx.fillStyle = sky;
  ctx.fillRect(x, y, w, h);

  if (dawn) {
    ctx.fillStyle = 'rgba(255,205,135,0.16)';
    ctx.beginPath(); ctx.arc(x + w * 0.82, y + h * 0.18, w * 0.38, 0, Math.PI * 2); ctx.fill();
  }

  ctx.fillStyle = '#090C0E';
  const skyline = [0.19, 0.28, 0.22, 0.34, 0.2, 0.31, 0.24];
  skyline.forEach((ratio, i) => {
    const bw = w / 7 + 5;
    const bx = x + i * (w / 7) - 2;
    const bh = h * ratio;
    ctx.fillRect(bx, y + h * 0.48 - bh, bw, bh);
  });

  ctx.fillStyle = '#111517';
  ctx.fillRect(x, y + h * 0.48, w, h * 0.37);
  ctx.fillStyle = '#07090A';
  ctx.fillRect(x, y + h * 0.83, w, h * 0.17);
  ctx.strokeStyle = 'rgba(170,149,120,0.2)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, y + h * 0.83); ctx.lineTo(x + w, y + h * 0.83); ctx.stroke();

  const lit = Math.max(1, Math.min(7, level));
  for (let i = 0; i < 7; i += 1) {
    const bx = x + 18 + i * ((w - 42) / 7);
    const by = y + h * 0.58 - (i % 3) * 10;
    const isLit = i < lit;
    ctx.fillStyle = isLit ? '#F3B05B' : '#252B2D';
    ctx.fillRect(bx, by, 12, 12);
    if (isLit) {
      ctx.fillStyle = 'rgba(243,176,91,0.12)';
      ctx.beginPath(); ctx.arc(bx + 6, by + 6, 34, 0, Math.PI * 2); ctx.fill();
    }
  }

  const towerX = x + w * 0.5;
  const towerBase = y + h * 0.83;
  ctx.fillStyle = '#35291F';
  ctx.fillRect(towerX - 12, y + h * 0.23, 24, towerBase - (y + h * 0.23));
  ctx.fillStyle = '#FFC369';
  ctx.beginPath(); ctx.arc(towerX, y + h * 0.21, 9 + level * 0.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = `rgba(255,195,105,${0.06 + level * 0.018})`;
  ctx.beginPath(); ctx.arc(towerX, y + h * 0.21, 38 + level * 6, 0, Math.PI * 2); ctx.fill();

  for (let i = 0; i < Math.min(people, 6); i += 1) {
    drawPerson(ctx, x + 54 + i * Math.max(38, (w - 110) / 6), y + h * 0.77 + (i % 2) * 5, 0.8);
  }

  ctx.restore();
  ctx.strokeStyle = 'rgba(255,226,178,0.12)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 20); ctx.stroke();
}

function stat(ctx: CanvasRenderingContext2D, label: string, value: string, x: number, y: number): void {
  text(ctx, value, x, y, 40, '#F6D39B');
  text(ctx, label, x, y + 34, 20, '#8E938E', 500);
}

export function downloadCampaignShareCard(state: GameState): void {
  const result = baseCanvas();
  if (!result) return;
  const { canvas, ctx } = result;

  text(ctx, 'EMBER STREET', 72, 92, 24, '#B9AA91', 600);
  text(ctx, '余烬长街', 72, 175, 68);
  text(ctx, state.chapterComplete ? '这条街，还活着。' : `我把最后一盏灯守到了 DAY ${state.day}`, 72, 245, 34, '#F4BD73');
  text(ctx, '从一盏灯，到一条重新亮起来的街。', 72, 292, 24, '#AFA99E', 500);

  text(ctx, 'DAY 1', 74, 378, 22, '#767D7A', 700);
  text(ctx, `DAY ${state.day}`, 570, 378, 22, '#E5B978', 700);
  drawStreet(ctx, 70, 405, 450, 410, 1, 0, false);
  drawStreet(ctx, 560, 405, 450, 410, state.firstLightLevel, state.survivors.length, state.chapterComplete);

  panel(ctx, 70, 862, 940, 225);
  stat(ctx, '希望', String(state.hope), 110, 935);
  stat(ctx, '灯火', `Lv.${state.firstLightLevel}`, 385, 935);
  stat(ctx, '幸存者', `${state.survivors.length} 人`, 675, 935);
  stat(ctx, '最高 Combo', `×${state.bestCombo ?? 0}`, 110, 1035);
  stat(ctx, '极限出餐', String(state.extremeServes ?? 0), 385, 1035);
  stat(ctx, '成功交付', String(state.stats.served), 675, 1035);

  panel(ctx, 70, 1130, 940, 150, 'rgba(56,39,26,0.55)');
  text(ctx, '只有七格，守住最后的灯火。', 105, 1190, 32, '#F4C983');
  text(ctx, state.chapterComplete ? '第一章 · 守住第一盏灯 ✓' : `第一章 · DAY ${state.day} / 7`, 105, 1240, 23, '#B8A384', 500);

  text(ctx, 'EMBER STREET · Seven slots. One last light.', 72, 1360, 20, '#737875', 500);
  downloadCanvas(canvas, `ember-street-day-${state.day}.png`);
}

export function downloadChallengeShareCard(state: GameState): string {
  const score = challengeScore(state);
  const code = encodeChallenge(state.seed, score);
  const result = baseCanvas();
  if (!result) return code;
  const { canvas, ctx } = result;

  text(ctx, 'EMBER STREET · DAILY', 72, 92, 24, '#B9AA91', 600);
  text(ctx, '今夜挑战', 72, 180, 68);
  text(ctx, `我的成绩 ${score}`, 72, 245, 36, '#F4BD73');
  text(ctx, '同一个 Seed，同一条七格配给台。', 72, 292, 24, '#AFA99E', 500);

  drawStreet(ctx, 70, 355, 940, 470, 4, Math.min(5, state.stats.served), false);
  ctx.fillStyle = 'rgba(190,54,42,0.08)';
  ctx.fillRect(70, 355, 940, 470);

  panel(ctx, 70, 870, 940, 205);
  stat(ctx, '成功交付', String(state.stats.served), 110, 948);
  stat(ctx, '最高 Combo', `×${state.bestCombo ?? 0}`, 390, 948);
  stat(ctx, '最高压力', `${Math.round(state.stats.peakPressure)}%`, 690, 948);
  text(ctx, `极限出餐 ${state.extremeServes ?? 0}`, 110, 1042, 23, '#B9A88D', 500);

  panel(ctx, 70, 1115, 940, 165, 'rgba(56,39,26,0.58)');
  text(ctx, '挑战码', 105, 1170, 20, '#9F9585', 600);
  text(ctx, code, 105, 1225, 30, '#F2C77F', 700);
  text(ctx, '你能守得更久吗？', 680, 1225, 24, '#D7BE98', 500);

  text(ctx, localDateKey(), 72, 1360, 20, '#737875', 500);
  downloadCanvas(canvas, `ember-street-daily-${localDateKey()}.png`);
  return code;
}
