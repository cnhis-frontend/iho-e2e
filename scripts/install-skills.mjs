import { fileURLToPath } from 'node:url';
import { planSkillInstallation, applySkillInstallation } from '../lib/skill-installation.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const usage = 'node scripts/install-skills.mjs --project <Vue-3-project-path>';
try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') console.log(usage);
  else {
    if (args.length !== 2 || args[0] !== '--project' || !args[1] || args[1].startsWith('--')) {
      throw new Error('An explicit project is required; user-wide installation is not supported. Usage: ' + usage);
    }
    const plan = await planSkillInstallation(args[1], root);
    await applySkillInstallation(plan);
    for (const skill of plan.plans) console.log('Project snapshot ready: ' + skill.path);
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
