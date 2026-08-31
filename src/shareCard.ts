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
  gradient.addColorStop(0, '#17222a');
  gradient.addColorStop(0.55, '#17191a');
  gradient.addColorStop(1, '#080a0b');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1080, 1440);
  ctx.fillStyle = 'rgba(238,158,71,0.08)';
  ctx.beginPath(); ctx.arc(760, 240, 360, 0, Math.PI * 2); ctx.fill();
  return { canvas, ctx };
}

function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, color = '#F8EAD4', weight = 700): void {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px Inter, "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.fillText(value, x, y);
}

function drawStreetSilhouette(ctx: CanvasRenderingContext2D, level: number): void {
  ctx.fillStyle = '#0A0D0F';
  ctx.fillRect(80, 590, 920, 250);
  const lit = Math.max(1, Math.min(7, level));
  for (let i = 0; i < 7; i += 1) {
    const x = 120 + i * 128;
    ctx.fillStyle = i < lit ? '#F3B05B' : '#24292B';
    ctx.fillRect(x, 650 - (i % 2) * 35, 18, 18);
    if (i < lit) {
      ctx.fillStyle = 'rgba(243,176,91,0.11)';
      ctx.beginPath(); ctx.arc(x + 9, 659 - (i % 2) * 35, 60, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.fillStyle = '#35291F'; ctx.fillRect(520, 510, 40, 330);
  ctx.fillStyle = '#FFC369'; ctx.beginPath(); ctx.arc(540, 505, 14, 0, Math.PI * 2); ctx.fill();
}

export function downloadCampaignShareCard(state: GameState): void {
  const result = baseCanvas();
  if (!result) return;
  const { canvas, ctx } = result;
  text(ctx, 'EMBER STREET', 80, 105, 28, '#C4AE8B', 600);
  text(ctx, '余烬长街', 80, 190, 72);
  text(ctx, state.chapterComplete ? '这条街，还活着。' : `我把最后一盏灯守到了 DAY ${state.day}`, 80, 270, 38, '#F4BD73');
  drawStreetSilhouette(ctx, state.firstLightLevel);
  text(ctx, `DAY ${state.day}`, 80, 940, 30, '#AAA69D', 600);
  text(ctx, `希望 ${state.hope}`, 80, 1010, 48);
  text(ctx, `灯火 Lv.${state.firstLightLevel}`, 80, 1080, 48);
  text(ctx, `幸存者 ${state.survivors.length} 人`, 80, 1150, 48);
  text(ctx, '只有七格，守住最后的灯火。', 80, 1280, 30, '#D7BE98', 500);
  text(ctx, 'Lorenzo-Holmes / Ember-Street', 80, 1360, 20, '#777A76', 500);
  downloadCanvas(canvas, `ember-street-day-${state.day}.png`);
}

export function downloadChallengeShareCard(state: GameState): string {
  const score = challengeScore(state);
  const code = encodeChallenge(state.seed, score);
  const result = baseCanvas();
  if (!result) return code;
  const { canvas, ctx } = result;
  text(ctx, 'EMBER STREET · DAILY', 80, 105, 28, '#C4AE8B', 600);
  text(ctx, '今夜挑战', 80, 205, 72);
  text(ctx, `我的成绩 ${score}`, 80, 285, 42, '#F4BD73');
  drawStreetSilhouette(ctx, 4);
  text(ctx, `成功交付 ${state.stats.served}`, 80, 970, 40);
  text(ctx, `最高压力 ${Math.round(state.stats.peakPressure)}%`, 80, 1040, 40);
  text(ctx, `挑战码 ${code}`, 80, 1130, 28, '#E8C58D', 600);
  text(ctx, '同一个 Seed，你能守得更久吗？', 80, 1260, 30, '#D7BE98', 500);
  text(ctx, localDateKey(), 80, 1360, 20, '#777A76', 500);
  downloadCanvas(canvas, `ember-street-daily-${localDateKey()}.png`);
  return code;
}
