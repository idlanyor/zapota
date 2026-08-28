import { createCanvas, loadImage } from 'canvas';
import { fileURLToPath } from 'node:url';

const WIDTH = 1200;
const HEIGHT = 760;
const BACKDROP_PATH = fileURLToPath(new URL('../assets/ktp-backdrop.png', import.meta.url));

const roundedRect = (ctx, x, y, width, height, radius) => {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
};

const FONT = 'Arial, sans-serif';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const num = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const ratio = (value, max) => {
    const maxValue = num(max);
    if (maxValue <= 0) return 0;
    return clamp(num(value) / maxValue, 0, 1);
};

const dash = (value) => {
    const text = String(value ?? '').trim();
    return text || '-';
};

const fitText = (ctx, input, maxWidth) => {
    let text = dash(input);
    while (text.length && ctx.measureText(text).width > maxWidth) {
        text = text.slice(0, -1);
    }
    if (text !== dash(input)) return `${text}…`;
    return text;
};

const drawCoverImage = (ctx, image, x, y, width, height) => {
    const scale = Math.max(width / image.width, height / image.height);
    const sourceWidth = width / scale;
    const sourceHeight = height / scale;
    const sourceX = (image.width - sourceWidth) / 2;
    const sourceY = (image.height - sourceHeight) / 2;
    ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
};

const drawMeter = (ctx, { x, y, width, value, max, label, fill }) => {
    ctx.fillStyle = '#aebad2';
    ctx.font = `bold 15px ${FONT}`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(label.toUpperCase(), x, y - 10);
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(num(value))}/${num(max)}`, x + width, y - 10);
    ctx.textAlign = 'left';
    roundedRect(ctx, x, y, width, 14, 7);
    ctx.fillStyle = '#1c2749';
    ctx.fill();
    const w = ratio(value, max) * width;
    if (w > 0.5) {
        roundedRect(ctx, x, y, w, 14, 7);
        ctx.fillStyle = fill;
        ctx.fill();
    }
};

const reputationRow = (ctx, x, y, width, label, value, color) => {
    ctx.fillStyle = '#aebad2';
    ctx.font = `15px ${FONT}`;
    ctx.fillText(label, x, y);
    ctx.fillStyle = color;
    ctx.font = `bold 17px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(`${clamp(Math.round(num(value)), -999, 999)}%`, x + width, y);
    ctx.textAlign = 'left';
};

/** Render the fictional RPG player card used by the /ktp command family. */
export const renderKtp = async ({
    name,
    job,
    level,
    exp,
    requiredExp,
    balance,
    hp,
    maxHp,
    gizi,
    kewarasan,
    energi,
    maxEnergi,
    reputasiWarga,
    reputasiPreman,
    reputasiAparat,
    bintangKorupsi,
    avatarBuffer = null,
}) => {
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    // Generated Nusantara backdrop, with a deterministic gradient fallback.
    const base = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    base.addColorStop(0, '#101b3d');
    base.addColorStop(0.55, '#16234f');
    base.addColorStop(1, '#0c1533');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    try {
        const backdrop = await loadImage(BACKDROP_PATH);
        drawCoverImage(ctx, backdrop, 0, 0, WIDTH, HEIGHT);
    } catch {
        for (const [x, y, r, color] of [
            [140, 90, 260, 'rgba(56,189,248,.16)'],
            [1050, 620, 300, 'rgba(250,204,21,.10)'],
            [900, 80, 220, 'rgba(129,140,248,.18)'],
            [320, 700, 240, 'rgba(45,212,191,.12)'],
        ]) {
            const blob = ctx.createRadialGradient(x, y, 0, x, y, r);
            blob.addColorStop(0, color);
            blob.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = blob;
            ctx.fillRect(x - r, y - r, r * 2, r * 2);
        }
    }

    // Header strip
    ctx.save();
    roundedRect(ctx, 41, 41, WIDTH - 82, 84, 27);
    ctx.clip();
    const headerGrad = ctx.createLinearGradient(40, 40, WIDTH - 40, 124);
    headerGrad.addColorStop(0, 'rgba(52,211,153,.22)');
    headerGrad.addColorStop(0.5, 'rgba(56,189,248,.16)');
    headerGrad.addColorStop(1, 'rgba(250,204,21,.20)');
    ctx.fillStyle = headerGrad;
    ctx.fillRect(40, 40, WIDTH - 80, 86);
    ctx.restore();

    ctx.fillStyle = '#e2e8f0';
    ctx.font = `bold 30px ${FONT}`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('KARTU TANDA PLAYER', 76, 88);
    ctx.fillStyle = 'rgba(148,163,184,.85)';
    ctx.font = `13px ${FONT}`;
    ctx.fillText('CHARACTER PROFILE // RPG 2026', 78, 112);

    // Level badge
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(250,204,21,.16)';
    roundedRect(ctx, WIDTH - 266, 62, 190, 44, 22);
    ctx.fill();
    ctx.strokeStyle = 'rgba(250,204,21,.55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#facc15';
    ctx.font = `bold 20px ${FONT}`;
    ctx.fillText(`LEVEL ${clamp(Math.floor(num(level)), 0, 99999)}`, WIDTH - 96, 91);
    ctx.textAlign = 'left';

    // Avatar panel
    const avatarSize = 150;
    roundedRect(ctx, 76, 160, avatarSize, avatarSize, 20);
    ctx.save();
    ctx.clip();
    let avatarImage = null;
    if (avatarBuffer?.length) {
        try {
            avatarImage = await loadImage(avatarBuffer);
        } catch {
            avatarImage = null;
        }
    }
    if (avatarImage) {
        const scale = Math.max(avatarSize / avatarImage.width, avatarSize / avatarImage.height);
        const width = avatarImage.width * scale;
        const height = avatarImage.height * scale;
        ctx.drawImage(avatarImage, 76 + (avatarSize - width) / 2, 160 + (avatarSize - height) / 2, width, height);
    } else {
        ctx.fillStyle = '#24335f';
        ctx.fillRect(76, 160, avatarSize, avatarSize);
        const initial = dash(name).charAt(0).toUpperCase();
        ctx.fillStyle = '#93c5fd';
        ctx.font = `bold 64px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(initial, 76 + avatarSize / 2, 160 + avatarSize / 2);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
    }
    ctx.restore();
    roundedRect(ctx, 76, 160, avatarSize, avatarSize, 20);
    ctx.strokeStyle = 'rgba(148,163,184,.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Identity block
    const infoX = 262;
    ctx.fillStyle = '#f8fafc';
    ctx.font = `bold 30px ${FONT}`;
    ctx.fillText(fitText(ctx, dash(name), 520), infoX, 200);

    ctx.fillStyle = '#94a3b8';
    ctx.font = `15px ${FONT}`;
    ctx.fillText('PROFESI', infoX, 234);
    ctx.fillStyle = '#5eead4';
    ctx.font = `bold 19px ${FONT}`;
    ctx.fillText(fitText(ctx, dash(job), 520), infoX, 258);

    ctx.fillStyle = '#94a3b8';
    ctx.font = `15px ${FONT}`;
    ctx.fillText('SALDO', infoX, 298);
    ctx.fillStyle = '#fde68a';
    ctx.font = `bold 24px ${FONT}`;
    ctx.fillText(
        `Rp ${Math.round(clamp(num(balance), -1_000_000_000_000, 1_000_000_000_000)).toLocaleString('id-ID')}`,
        infoX,
        326
    );

    // Vitals meters (right column)
    const meterX = 720;
    const meterW = 404;
    drawMeter(ctx, { x: meterX, y: 210, width: meterW, value: hp, max: maxHp, label: 'HP', fill: '#f87171' });
    drawMeter(ctx, { x: meterX, y: 270, width: meterW, value: gizi, max: 100, label: 'Gizi', fill: '#4ade80' });
    drawMeter(ctx, {
        x: meterX,
        y: 330,
        width: meterW,
        value: kewarasan,
        max: 100,
        label: 'Kewarasan',
        fill: '#c084fc',
    });
    drawMeter(ctx, {
        x: meterX,
        y: 390,
        width: meterW,
        value: energi,
        max: maxEnergi,
        label: 'Stamina',
        fill: '#fbbf24',
    });
    drawMeter(ctx, {
        x: meterX,
        y: 450,
        width: meterW,
        value: exp,
        max: requiredExp,
        label: 'EXP',
        fill: '#38bdf8',
    });

    // Divider
    ctx.strokeStyle = 'rgba(148,163,184,.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(76, 490);
    ctx.lineTo(WIDTH - 76, 490);
    ctx.stroke();

    // Reputation section
    ctx.fillStyle = '#94a3b8';
    ctx.font = `bold 15px ${FONT}`;
    ctx.fillText('REPUTASI SOSIAL', 76, 522);
    reputationRow(ctx, 76, 560, 280, 'Warga', reputasiWarga, '#4ade80');
    reputationRow(ctx, 76, 592, 280, 'Ormas/Preman', reputasiPreman, '#fb923c');
    reputationRow(ctx, 76, 624, 280, 'Aparat', reputasiAparat, '#60a5fa');

    // Corruption watch
    ctx.fillStyle = '#94a3b8';
    ctx.font = `bold 15px ${FONT}`;
    ctx.fillText('PANTAUAN ANTI-KORUPSI', 470, 522);
    const stars = clamp(Math.floor(num(bintangKorupsi)), 0, 5);
    ctx.fillStyle = stars > 0 ? '#facc15' : 'rgba(148,163,184,.6)';
    ctx.font = `bold 26px ${FONT}`;
    ctx.fillText(stars > 0 ? '★'.repeat(stars) : 'Aman', 470, 564);
    ctx.fillStyle = 'rgba(148,163,184,.75)';
    ctx.font = `13px ${FONT}`;
    ctx.fillText(stars > 0 ? 'Status: dalam pengawasan' : 'Status: bersih', 470, 588);

    // Command hints
    const hints = ['/kerja', '/kopdes', '/tas', '/klaim_mbg'];
    ctx.font = `13px ${FONT}`;
    let hintX = 470;
    for (const hint of hints) {
        const w = ctx.measureText(hint).width + 28;
        ctx.fillStyle = 'rgba(56,189,248,.14)';
        roundedRect(ctx, hintX, 620, w, 30, 15);
        ctx.fill();
        ctx.fillStyle = '#7dd3fc';
        ctx.fillText(hint, hintX + 14, 640);
        hintX += w + 10;
    }

    // Footer disclaimer
    ctx.fillStyle = 'rgba(148,163,184,.9)';
    ctx.font = `bold 14px ${FONT}`;
    ctx.fillText('DOKUMEN GAME • TIDAK BERLAKU SEBAGAI IDENTITAS', 76, 710);

    return canvas.toBuffer('image/png');
};
