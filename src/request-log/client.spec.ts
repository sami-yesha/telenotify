import { parseClient } from './client';

describe('parseClient', () => {
  it('recognizes our SDKs and CLI with their versions', () => {
    expect(parseClient('telenotify-node/0.3.1')).toEqual({ client: 'node', clientDetail: '0.3.1' });
    expect(parseClient('telenotify-python/0.1.0')).toEqual({ client: 'python', clientDetail: '0.1.0' });
    expect(parseClient('telenotify-cli/0.2.0')).toEqual({ client: 'cli', clientDetail: '0.2.0' });
    // CLI 0.1.0 sent no version.
    expect(parseClient('telenotify-cli')).toEqual({ client: 'cli', clientDetail: null });
  });

  it('groups hand-made calls and keeps the tool name', () => {
    expect(parseClient('curl/8.4.0')).toEqual({ client: 'http', clientDetail: 'curl/8.4.0' });
    expect(parseClient('PostmanRuntime/7.39.0')).toEqual({ client: 'http', clientDetail: 'PostmanRuntime/7.39.0' });
  });

  it('keeps the first product token for anything else', () => {
    expect(parseClient('python-requests/2.31.0')).toEqual({ client: 'other', clientDetail: 'python-requests/2.31.0' });
    expect(parseClient('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toEqual({ client: 'other', clientDetail: 'Mozilla/5.0' });
    expect(parseClient(undefined)).toEqual({ client: 'other', clientDetail: null });
    expect(parseClient('x'.repeat(200)).clientDetail).toHaveLength(40);
  });
});
