/**
 * Windows: Expo/Metro node 프로세스 트리 강제 종료
 * Ctrl+C가 안 먹을 때: npm run stop
 */
const { execSync } = require('child_process');

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (e) {
    return e.stdout || '';
  }
}

const out = run('wmic process where "name=\'node.exe\'" get ProcessId,CommandLine /FORMAT:LIST');
const blocks = out.split(/\r?\n\r?\n/).filter((b) => b.includes('ProcessId='));

const patterns = [/expo/i, /metro/i, /@expo\/cli/i, /apps[\\/]mobile/i];
let killed = 0;

for (const block of blocks) {
  const cmd = (block.match(/CommandLine=(.*)/s) || [])[1] || '';
  const pid = (block.match(/ProcessId=(\d+)/) || [])[1];
  if (!pid || !patterns.some((re) => re.test(cmd))) continue;
  try {
    execSync(`taskkill /F /PID ${pid} /T`, { stdio: 'ignore' });
    killed += 1;
  } catch {
    // already dead
  }
}

if (killed > 0) {
  console.log(`Expo 종료 완료 (${killed}개 프로세스)`);
} else {
  console.log('실행 중인 Expo 프로세스 없음');
}
