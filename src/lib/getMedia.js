import { execFile } from 'node:child_process';
import { open } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const probeMedia = async (filePath) => {
    const { stdout } = await execFileAsync('ffprobe', [
        '-v', 'error', '-show_streams', '-show_format', '-of', 'json', filePath,
    ], { timeout: 15000, maxBuffer: 1024 * 1024 });
    const probe = JSON.parse(stdout);
    const streams = probe.streams || [];
    // Album covers are video streams too, but must not turn a song into a video.
    const video = streams.find((stream) => stream.codec_type === 'video' && !stream.disposition?.attached_pic);
    const audio = streams.find((stream) => stream.codec_type === 'audio');
    return {
        video,
        audio,
        format: probe.format?.format_name || '',
        duration: Number(probe.format?.duration || video?.duration || audio?.duration) || 0,
    };
};

export const looksLikeMedia = async (filePath) => {
    const file = await open(filePath, 'r');
    try {
        const bytes = Buffer.alloc(16);
        const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
        const header = bytes.subarray(0, bytesRead);
        const signature = header.toString('ascii');
        return header.subarray(4, 8).toString() === 'ftyp' ||
            header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) ||
            /^OggS|^fLaC|^ID3|^FLV/.test(signature) ||
            (signature.startsWith('RIFF') && /^(WAVE|AVI )$/.test(header.subarray(8, 12).toString())) ||
            (bytesRead >= 2 && header[0] === 0xff && (header[1] & 0xe0) === 0xe0);
    } finally { await file.close(); }
};

/** Keep compatible codecs; convert incompatible streams before inline playback. */
export const prepareMediaForWa = async (inputPath, tempDir, media) => {
    if (media.video) {
        const { video, audio } = media;
        const transcodeVideo = video.codec_name !== 'h264' ||
            !['yuv420p', 'yuvj420p'].includes(video.pix_fmt) ||
            Number(video.level) > 41 || Number(video.width) > 1920 || Number(video.height) > 1920;
        const transcodeAudio = audio && (audio.codec_name !== 'aac' ||
            audio.profile !== 'LC' || Number(audio.channels) > 2 || Number(audio.sample_rate) > 48000);
        const outputPath = path.join(tempDir, 'playable.mp4');
        const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', inputPath,
            '-map', `0:${video.index}`, ...(audio ? ['-map', `0:${audio.index}`] : []), '-sn', '-dn'];
        if (transcodeVideo) {
            args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
                '-profile:v', 'main', '-level:v', '4.1', '-pix_fmt', 'yuv420p',
                '-vf', "scale=w='if(gte(iw,ih),min(1920,iw),min(1080,iw))':h='if(gte(iw,ih),min(1080,ih),min(1920,ih))':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1",
                '-r', '30');
        } else { args.push('-c:v', 'copy'); }
        if (audio) {
            args.push('-c:a', transcodeAudio ? 'aac' : 'copy');
            if (transcodeAudio) args.push('-profile:a', 'aac_low', '-b:a', '128k', '-ac', '2', '-ar', '48000');
        }
        args.push('-tag:v', 'avc1', '-movflags', '+faststart', '-max_muxing_queue_size', '1024', outputPath);
        await execFileAsync('ffmpeg', args, { timeout: 10 * 60 * 1000, maxBuffer: 1024 * 1024 });
        return { path: outputPath, type: 'video', mime: 'video/mp4', ext: 'mp4', duration: media.duration };
    }
    if (media.audio) {
        const { audio } = media;
        if (media.format.split(',').includes('mp3') && audio.codec_name === 'mp3' &&
            Number(audio.channels) <= 2 && Number(audio.sample_rate) <= 48000) {
            return { path: inputPath, type: 'audio', mime: 'audio/mpeg', ext: 'mp3', duration: media.duration };
        }
        const outputPath = path.join(tempDir, 'playable.mp3');
        await execFileAsync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', inputPath,
            '-map', `0:${audio.index}`, '-vn', '-c:a', 'libmp3lame', '-b:a', '192k',
            '-ac', '2', '-ar', '44100', outputPath],
        { timeout: 10 * 60 * 1000, maxBuffer: 1024 * 1024 });
        return { path: outputPath, type: 'audio', mime: 'audio/mpeg', ext: 'mp3', duration: media.duration };
    }
    throw new Error('Stream video/audio tidak ditemukan.');
};
