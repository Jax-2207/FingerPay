import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

describe('Phase 0 local and CI configuration', () => {
  it('configures Auth and Firestore emulators on loopback with safe project defaults', () => {
    const firebase = JSON.parse(readFileSync('firebase/firebase.json', 'utf8')) as {
      emulators?: {
        auth?: { host?: string; port?: number };
        firestore?: { host?: string; port?: number };
      };
    };

    expect(firebase.emulators?.auth).toEqual({ host: '127.0.0.1', port: 9099 });
    expect(firebase.emulators?.firestore).toEqual({ host: '127.0.0.1', port: 8080 });
  });

  it('uses least privilege CI without exposing secrets to pull-request jobs', () => {
    const workflow = parse(readFileSync('.github/workflows/ci.yml', 'utf8')) as {
      permissions?: Record<string, string>;
      on?: { pull_request?: unknown; pull_request_target?: unknown };
      jobs?: Record<string, { steps?: Array<{ run?: string; uses?: string }> }>;
    };
    const workflowText = readFileSync('.github/workflows/ci.yml', 'utf8');

    expect(workflow.permissions).toEqual({ contents: 'read' });
    expect(workflow.on?.pull_request).toBeDefined();
    expect(workflow.on?.pull_request_target).toBeUndefined();
    expect(workflowText).not.toMatch(/secrets\./i);

    const steps = Object.values(workflow.jobs ?? {}).flatMap((job) => job.steps ?? []);
    const runCommands = steps.map((step) => step.run ?? '').join('\n');
    expect(runCommands).toContain('pnpm install --frozen-lockfile');
    expect(runCommands).toContain('pnpm lint');
    expect(runCommands).toContain('pnpm typecheck');
    expect(runCommands).toContain('pnpm test');
  });
});
