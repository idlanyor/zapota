// Stand-in for yt-dlp in tests. argv[2] is the scenario; the rest are the
// real yt-dlp arguments built by src/lib/ytdlp.js.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [scenarioArg, ...args] = process.argv.slice(2);
// "403-once=<file>": the file counts runs across processes.
const [scenario, runsFile] = scenarioArg.split('=');
const outTemplate = args[args.indexOf('-o') + 1];
const outDir = path.dirname(outTemplate);

if (scenario === '403-once' || scenario === '403-always') {
    const runs = existsSync(runsFile) ? readFileSync(runsFile, 'utf8').length : 0;
    appendFileSync(runsFile, 'x');
    if (scenario === '403-always' || runs === 0) {
        process.stderr.write(
            'ERROR: [download] unable to download video data: HTTP Error 403: Forbidden\n'
        );
        process.exit(1);
    }
    const filepath = path.join(outDir, 'abc.mp4');
    writeFileSync(filepath, 'VIDEO');
    process.stdout.write(`${JSON.stringify({ title: 'retried', filepath })}\n`);
    process.exit(0);
}
if (scenario === 'error') {
    process.stderr.write('WARNING: something\nERROR: [youtube] jNQXAC9IVRw: Video unavailable\n');
    process.exit(1);
}
if (scenario === 'filtered') process.exit(0);
if (scenario === 'hang') setTimeout(() => {}, 60_000);
if (scenario === 'escape') {
    process.stdout.write(`${JSON.stringify({ title: 'x', filepath: '/etc/passwd' })}\n`);
    process.exit(0);
}
if (scenario === 'ok') {
    const filepath = path.join(outDir, 'abc.mp4');
    writeFileSync(filepath, 'VIDEO');
    process.stdout.write(
        `${JSON.stringify({ title: 'Me at the zoo', height: 360, duration: 19, filepath })}\n`
    );
}
