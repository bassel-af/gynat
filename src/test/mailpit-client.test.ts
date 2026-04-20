import { describe, test, expect } from 'vitest';
import { MailpitClient } from '@/lib/email/test/mailpit-client';

describe('MailpitClient constructor — loopback guard', () => {
  test('accepts http://localhost:8125', () => {
    expect(() => new MailpitClient('http://localhost:8125')).not.toThrow();
  });

  test('accepts http://127.0.0.1:8125', () => {
    expect(() => new MailpitClient('http://127.0.0.1:8125')).not.toThrow();
  });

  test('accepts http://[::1]:8125', () => {
    expect(() => new MailpitClient('http://[::1]:8125')).not.toThrow();
  });

  test('rejects a public hostname', () => {
    expect(() => new MailpitClient('http://mailpit.example.com:8125')).toThrow(
      /loopback/i
    );
  });

  test('rejects 0.0.0.0', () => {
    expect(() => new MailpitClient('http://0.0.0.0:8125')).toThrow(/loopback/i);
  });

  test('rejects a public IPv4 address', () => {
    expect(() => new MailpitClient('http://8.8.8.8:8125')).toThrow(/loopback/i);
  });

  test('rejects a malformed URL', () => {
    expect(() => new MailpitClient('not-a-url')).toThrow();
  });
});
