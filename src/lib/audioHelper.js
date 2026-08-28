import axios from 'axios';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const MAX_AUDIO_BYTES = 80 * 1024 * 1024;
const USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/**
 * Downloads an audio source and re-encodes it as a conventional MP3.
 *
 * Some converter services return a different container/codec while using an
 * .mp3 URL. Sending that URL with a forced audio/mpeg MIME type can produce an
 * audio message that works in one WhatsApp client but not another.
 */
export const downloadAudioForWa = async (url) => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mybot-audio-'));
    const inputPath = path.join(tempDir, 'source-audio');
    const outputPath = path.join(tempDir, 'whatsapp-audio.mp3');

    try {
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 120000,
            maxRedirects: 10,
            maxContentLength: MAX_AUDIO_BYTES,
            maxBodyLength: MAX_AUDIO_BYTES,
            headers: {
                Accept: 'audio/*,*/*;q=0.8',
                Referer: 'https://id.ytmp3.mobi/',
                'User-Agent': USER_AGENT,
            },
        });
        const sourceBuffer = Buffer.from(response.data);

        if (!sourceBuffer.length) throw new Error('File audio hasil unduhan kosong.');
        if (sourceBuffer.length > MAX_AUDIO_BYTES) {
            throw new Error('File audio terlalu besar untuk diproses.');
        }

        await fs.writeFile(inputPath, sourceBuffer);
        await execFileAsync(
            'ffmpeg',
            [
                '-hide_banner',
                '-loglevel',
                'error',
                '-y',
                '-i',
                inputPath,
                '-map',
                '0:a:0',
                '-vn',
                '-c:a',
                'libmp3lame',
                '-b:a',
                '192k',
                '-ar',
                '44100',
                '-ac',
                '2',
                '-id3v2_version',
                '3',
                '-write_id3v1',
                '1',
                outputPath,
            ],
            { timeout: 120000, maxBuffer: 2 * 1024 * 1024 }
        );

        const audioBuffer = await fs.readFile(outputPath);
        if (!audioBuffer.length) throw new Error('Konversi audio menghasilkan file kosong.');
        return audioBuffer;
    } finally {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
};

export default downloadAudioForWa;
