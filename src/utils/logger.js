import chalk from 'chalk';
import boxen from 'boxen';
import moment from 'moment';
import gradient from 'gradient-string';
import CFonts from 'cfonts';
import { botSocket } from '../lib/socket.js';

const colors = {
    info: chalk.cyanBright,
    success: chalk.greenBright,
    warn: chalk.yellowBright,
    error: chalk.redBright,
    debug: chalk.magentaBright,
    time: chalk.gray,
    dim: chalk.gray,
    context: chalk.black.bgCyan,
    errorContext: chalk.black.bgRedBright,
};

const levelMeta = {
    info: { label: 'INFO', color: colors.info },
    success: { label: 'OK', color: colors.success },
    warn: { label: 'WARN', color: colors.warn },
    error: { label: 'ERROR', color: colors.error },
    debug: { label: 'DEBUG', color: colors.debug },
};

const pill = (text, color = colors.context) => color(` ${text} `);

const banner = () => {
    console.clear();

    // Create Big Text Banner
    CFonts.say('KANATA|BOT', {
        font: 'block',
        align: 'center',
        colors: ['system'],
        background: 'transparent',
        letterSpacing: 1,
        lineHeight: 1,
        space: true,
        maxLength: '0',
        gradient: 'cristal',
        independentGradient: true,
        transitionGradient: true,
    });

    const info = [
        `${chalk.white('Created by')} ${gradient.retro('Roy')}`,
        `${chalk.white('Version   ')} ${chalk.cyan('1.0.0')}`,
        `${chalk.white('Status    ')} ${chalk.greenBright('Online')}`,
        `${chalk.white('Time      ')} ${chalk.gray(moment().format('DD/MM/YYYY HH:mm:ss'))}`,
    ].join('\n');

    console.log(
        boxen(info, {
            padding: 1,
            margin: { top: 0, bottom: 1, left: 0, right: 0 },
            borderStyle: 'round',
            borderColor: 'cyan',
            float: 'center',
            title: chalk.bold.white(' [ System Info ] '),
            titleAlignment: 'center',
        })
    );
};

const isPlainObject = (value) => Object.prototype.toString.call(value) === '[object Object]';

const truncate = (value, max = 220) => {
    if (typeof value !== 'string') return value;
    return value.length > max ? `${value.slice(0, max - 1)}…` : value;
};

const stringifyValue = (value) => {
    if (value instanceof Error) {
        return value.message || value.name;
    }

    if (typeof value === 'string') {
        return value;
    }

    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
        return String(value);
    }

    if (value === null || typeof value === 'undefined') {
        return String(value);
    }

    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
};

const formatErrorDetails = (error) => {
    if (!(error instanceof Error)) return null;

    const stack =
        error.stack
            ?.split('\n')
            .map((line) => line.trim())
            .filter(Boolean) || [];

    const [headline, ...frames] = stack;
    return {
        headline: headline || `${error.name}: ${error.message}`,
        frames: frames.slice(0, 6),
    };
};

const normalizeLogArgs = (primary, secondary) => {
    let context = '';
    let message = '';
    let details = null;

    if (primary instanceof Error) {
        details = formatErrorDetails(primary);
        context = typeof secondary === 'string' ? secondary : '';
        message = details?.headline || primary.message || primary.name;
        return { context, message, details };
    }

    if (typeof secondary === 'string' && isPlainObject(primary)) {
        context = secondary;
        message = stringifyValue(primary);
        return { context, message, details };
    }

    if (typeof secondary === 'string') {
        context = secondary;
    }

    message = stringifyValue(primary);
    return { context, message, details };
};

const printBlock = (time, prefix, ctx, message, details, type) => {
    const baseLine = `${time} ${prefix}${ctx ? ` ${ctx}` : ''} ${message}`;
    console.log(baseLine);

    if (details?.frames?.length) {
        const frameColor = type === 'error' ? colors.error : colors.dim;
        for (const frame of details.frames) {
            console.log(`${colors.time(' '.repeat(11))} ${frameColor(`↳ ${frame}`)}`);
        }
    }
};

const printLine = (segments) => {
    console.log(segments.filter(Boolean).join(' '));
};

const log = (type, primary, secondary = '') => {
    const meta = levelMeta[type] || levelMeta.info;
    const time = colors.time(`[${moment().format('HH:mm:ss')}]`);
    const prefix = meta.color(meta.label.padEnd(5));
    const { context, message, details } = normalizeLogArgs(primary, secondary);
    const ctx = context
        ? type === 'error'
            ? colors.errorContext(` ${context} `)
            : colors.context(` ${context} `)
        : '';
    const output = truncate(type === 'success' ? gradient.summer(message) : message);

    botSocket.emitLog(
        `${context ? `[${context}] ` : ''}${truncate(stringifyValue(primary), 500)}`,
        type
    );
    printBlock(time, prefix, ctx, output, details, type);
};

const chat = ({ chatType = 'CHAT', chatName = '', sender = '', body = '' }) => {
    const time = colors.time(`[${moment().format('HH:mm:ss')}]`);
    const prefix = colors.info('CHAT ');
    const typePill = pill(chatType, chalk.black.bgGreenBright);
    const room = chatName ? pill(truncate(chatName, 28), chalk.black.bgWhite) : '';
    const senderText = sender ? chalk.bold(truncate(sender, 20)) : 'Unknown';
    const bodyText = chalk.white(truncate(body || '<non-text>', 120));

    botSocket.emitLog(
        `[${chatType}] ${chatName ? `${chatName} | ` : ''}${sender}: ${body}`,
        'info'
    );
    printLine([time, prefix, typePill, room, colors.dim(senderText), colors.dim('→'), bodyText]);
};

const command = ({ phase = 'RUN', name = '', sender = '', chat = '', extra = '' }) => {
    const time = colors.time(`[${moment().format('HH:mm:ss')}]`);
    const prefix = colors.debug('CMD  ');
    const phaseColor =
        phase === 'DONE'
            ? chalk.black.bgGreenBright
            : phase === 'FAIL'
              ? chalk.black.bgRedBright
              : chalk.black.bgYellowBright;
    const phasePill = pill(phase, phaseColor);
    const namePill = pill(name || 'unknown', chalk.black.bgMagentaBright);
    const senderText = sender ? colors.dim(truncate(sender, 24)) : '';
    const chatText = chat ? colors.dim(`@ ${truncate(chat, 26)}`) : '';
    const extraText = extra ? truncate(extra, 80) : '';

    botSocket.emitLog(`[CMD:${phase}] ${name} ${sender} ${chat} ${extra}`.trim(), 'debug');
    printLine([time, prefix, phasePill, namePill, senderText, chatText, extraText]);
};

const event = ({ scope = 'SYSTEM', action = '', details = '', level = 'info' }) => {
    const time = colors.time(`[${moment().format('HH:mm:ss')}]`);
    const meta = levelMeta[level] || levelMeta.info;
    const prefix = meta.color(meta.label.padEnd(5));
    const scopeColor =
        level === 'error'
            ? colors.errorContext
            : level === 'warn'
              ? chalk.black.bgYellowBright
              : chalk.black.bgBlueBright;
    const scopePill = pill(scope, scopeColor);
    const actionText = truncate(action, 80);
    const detailText = details ? colors.dim(truncate(details, 100)) : '';

    botSocket.emitLog(`[${scope}] ${action}${details ? ` | ${details}` : ''}`, level);
    printLine([time, prefix, scopePill, actionText, detailText]);
};

const logger = {
    info: (msg, ctx) => log('info', msg, ctx),
    success: (msg, ctx) => log('success', msg, ctx),
    warn: (msg, ctx) => log('warn', msg, ctx),
    error: (msg, ctx) => log('error', msg, ctx),
    debug: (msg, ctx) => log('debug', msg, ctx),
    chat,
    command,
    event,
    banner,
};

export default logger;
