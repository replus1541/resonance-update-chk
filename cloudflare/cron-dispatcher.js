const DEFAULT_OWNER = 'replus1541';
const DEFAULT_REPO = 'resonance-update-chk';
const DEFAULT_WORKFLOW_ID = 'check-updates.yml';
const DEFAULT_REF = 'main';

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(dispatchWorkflow(env, env.DEFAULT_SOURCES || 'NAVER_LOUNGE,YOUTUBE'));
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/run') {
      return new Response('ok\n', { status: 200 });
    }

    if (env.DISPATCH_SECRET) {
      const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
      if (token !== env.DISPATCH_SECRET) {
        return new Response('unauthorized\n', { status: 401 });
      }
    }

    const sources = url.searchParams.get('sources') || 'NAVER_LOUNGE,YOUTUBE';
    const result = await dispatchWorkflow(env, sources);
    return Response.json(result, { status: result.ok ? 200 : 502 });
  }
};

async function dispatchWorkflow(env, sources) {
  const token = env.GITHUB_TOKEN || env.GH_TOKEN;
  if (!token) return { ok: false, status: 0, error: 'GITHUB_TOKEN is not set' };

  const owner = env.GITHUB_OWNER || env.GH_OWNER || DEFAULT_OWNER;
  const repo = env.GITHUB_REPO || env.GH_REPO || DEFAULT_REPO;
  const workflowId = normalizeWorkflowId(env.GITHUB_WORKFLOW_ID || env.GH_WORKFLOW_ID || DEFAULT_WORKFLOW_ID);
  const ref = env.GITHUB_REF || env.GH_REF || DEFAULT_REF;
  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(workflowId)}/dispatches`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'user-agent': 'resonance-update-chk-cloudflare-cron',
      'x-github-api-version': '2022-11-28'
    },
    body: JSON.stringify({
      ref,
      inputs: {
        sources,
        test_notify: 'false'
      }
    })
  });

  if (response.status === 204) {
    return { ok: true, status: 204 };
  }

  const text = await response.text();
  return {
    ok: false,
    status: response.status,
    body: text.slice(0, 1000)
  };
}

function normalizeWorkflowId(value) {
  return String(value || DEFAULT_WORKFLOW_ID).split('/').filter(Boolean).pop();
}
