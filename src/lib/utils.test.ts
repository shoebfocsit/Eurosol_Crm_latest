import { render, screen } from '@testing-library/react';
import { cn, resolveImageUrl } from '../lib/utils';

describe('cn utility', () => {
  it('joins class names correctly', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('handles conditional classes', () => {
    expect(cn('base', true && 'conditional')).toBe('base conditional');
    expect(cn('base', false && 'conditional')).toBe('base');
  });

  it('merges tailwind classes correctly', () => {
    expect(cn('p-2 p-4')).toBe('p-4');
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });

  it('handles arrays and objects', () => {
    expect(cn(['foo', 'bar'])).toBe('foo bar');
    expect(cn({ foo: true, bar: false })).toBe('foo');
  });
});

describe('resolveImageUrl', () => {
  const origBase = import.meta.env.VITE_API_BASE_URL;
  beforeEach(() => {
    // Ensure the API domain is deterministic for the test.
    (import.meta.env as any).VITE_API_BASE_URL = 'https://api.eurosolservice.com/v1';
  });
  afterAll(() => {
    (import.meta.env as any).VITE_API_BASE_URL = origBase;
  });

  it('returns empty string for empty input', () => {
    expect(resolveImageUrl(undefined)).toBe('');
    expect(resolveImageUrl(null)).toBe('');
  });

  it('keeps absolute URLs unchanged', () => {
    expect(resolveImageUrl('https://cdn.example.com/a.jpg')).toBe('https://cdn.example.com/a.jpg');
    expect(resolveImageUrl('http://x.test/b.png')).toBe('http://x.test/b.png');
  });

  it('prepends API domain to /uploads paths', () => {
    expect(resolveImageUrl('/uploads/foo.jpg')).toBe('https://api.eurosolservice.com/uploads/foo.jpg');
  });

  it('normalizes legacy /local-uploads paths to /uploads on the API domain', () => {
    expect(resolveImageUrl('/local-uploads/projects/abc.jpg')).toBe('https://api.eurosolservice.com/uploads/projects/abc.jpg');
  });

  it('normalizes legacy /public/uploads paths to /uploads on the API domain', () => {
    expect(resolveImageUrl('/public/uploads/foo.jpg')).toBe('https://api.eurosolservice.com/uploads/foo.jpg');
  });

  it('handles relative uploads paths without a leading slash', () => {
    expect(resolveImageUrl('uploads/foo.jpg')).toBe('https://api.eurosolservice.com/uploads/foo.jpg');
    expect(resolveImageUrl('./uploads/foo.jpg')).toBe('https://api.eurosolservice.com/uploads/foo.jpg');
    expect(resolveImageUrl('local-uploads/projects/abc.jpg')).toBe('https://api.eurosolservice.com/uploads/projects/abc.jpg');
  });
});