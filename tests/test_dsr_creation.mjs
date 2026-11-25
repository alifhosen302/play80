import assert from 'node:assert/strict';

let handler;
globalThis.Deno = {
  serve: fn => { handler = fn; },
  env: { get: key => key === 'SUPABASE_URL' ? 'https://example.invalid' : 'test-only' },
};
await import('../supabase/functions/play80-create-dsr/index.ts');

const input = { email: 'test@example.invalid', username: 'test_dsr', full_name: 'Test Account',
  phone_number: '01700000000', address: 'Test address', pin: '204680', pin_token: 'mock-gate' };
async function run({ allowed, creation = 200, mail = 200, payload = input }) {
  const paths = [];
  globalThis.fetch = async (url, options) => {
    const path = new URL(url).pathname;
    paths.push(path);
    if (path.startsWith('/rest/')) {
      assert.equal(options.headers.Authorization, 'Bearer caller');
      return Response.json(allowed);
    }
    if (path === '/auth/v1/admin/users') {
      const data = JSON.parse(options.body);
      assert.deepEqual(data.app_metadata, { role: 'dsr' });
      assert.equal(data.email_confirm, false);
      return Response.json({}, { status: creation });
    }
    assert.equal(path, '/auth/v1/resend');
    return Response.json({}, { status: mail });
  };
  const response = await handler(new Request('https://example.invalid', {
    method: 'POST', headers: { Authorization: 'Bearer caller' }, body: JSON.stringify(payload),
  }));
  return [response.status, paths.length];
}
assert.deepEqual(await run({ allowed: false }), [403, 1]);
assert.deepEqual(await run({ allowed: true, payload: { ...input, pin: '123' } }), [400, 1]);
assert.deepEqual(await run({ allowed: true, creation: 422 }), [400, 2]);
assert.deepEqual(await run({ allowed: true, mail: 429 }), [201, 3]);
assert.deepEqual(await run({ allowed: true, payload: { ...input, role: 'owner' } }), [201, 3]);
console.log('PASS owner gate, invalid data, duplicate account, mail retry and server-assigned DSR role');
