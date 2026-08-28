import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import logger from '../utils/logger.js';

const execFileAsync = promisify(execFile);

const probeCodecs = async (inputPath) => {
    const { stdout } = await execFileAsync(
        'ffprobe',
        [
            '-v',
            'error',
            '-show_entries',
            'stream=codec_name,codec_type',
            '-of',
            'json',
            inputPath,
        ],
        { maxBuffer: 1024 * 1024 }
    );
    const streams = JSON.parse(stdout).streams || [];
    return {
        video: streams.find((stream) => stream.codec_type === 'video')?.codec_name || '',
        audio: streams.find((stream) => stream.codec_type === 'audio')?.codec_name || '',
    };
};

/**
 * Produces an MP4 that can be played by WhatsApp clients.
 * Compatible H.264/AAC input is remuxed; AV1/VP9/HEVC and non-AAC audio are transcoded.
 * @param {Buffer} buffer Raw video buffer.
 * @returns {Promise<Buffer>} WhatsApp-compatible MP4 buffer.
 */
export async function optimizeVideoForWa(buffer) {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'mybot-video-'));
    const inputPath = path.join(tempDir, 'input.mp4');
    const outputPath = path.join(tempDir, 'output.mp4');

    try {
        await writeFile(inputPath, buffer);
        const codecs = await probeCodecs(inputPath);
        if (!codecs.video) throw new Error('Stream video tidak ditemukan');

        const transcodeVideo = codecs.video !== 'h264';
        const transcodeAudio = Boolean(codecs.audio) && codecs.audio !== 'aac';
        const args = ['-y', '-i', inputPath, '-map', '0:v:0', '-map', '0:a:0?'];

        if (transcodeVideo) {
            args.push(
                '-c:v',
                'libx264',
                '-preset',
                'veryfast',
                '-crf',
                '27',
                '-profile:v',
                'main',
                '-level',
                '3.1',
                '-pix_fmt',
                'yuv420p',
                '-vf',
                'scale=trunc(iw/2)*2:trunc(ih/2)*2',
                '-tag:v',
                'avc1'
            );
        } else {
            args.push('-c:v', 'copy');
        }

        if (codecs.audio) {
            args.push(
                '-c:a',
                transcodeAudio ? 'aac' : 'copy',
                ...(transcodeAudio ? ['-b:a', '128k'] : [])
            );
        }

        args.push('-movflags', '+faststart', '-max_muxing_queue_size', '1024', outputPath);

        logger.info(
            `Video codec ${codecs.video}/${codecs.audio || 'no-audio'}; ` +
                `${transcodeVideo || transcodeAudio ? 'transcoding for WhatsApp' : 'faststart remux'}`,
            'VIDEO-HELPER'
        );
        await execFileAsync('ffmpeg', args, { maxBuffer: 10 * 1024 * 1024 });
        return await readFile(outputPath);
    } catch (error) {
        logger.error(`WhatsApp video optimization failed: ${error.message}. Sending raw.`, 'VIDEO-HELPER');
        return buffer;
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
}
