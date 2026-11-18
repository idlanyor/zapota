// Stand-in for yt-dlp in tests. argv[2] is the scenario; the rest are the
// real yt-dlp arguments built by src/lib/ytdlp.js.
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const [scenario, ...args] = process.argv.slice(2);
const outTemplate = args[args.indexOf('-o') + 1];
const outDir = path.dirname(outTemplate);

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
