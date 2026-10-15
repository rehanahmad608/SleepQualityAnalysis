import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatusBadge, { STATUS_TONE } from '../components/ui/StatusBadge';
import DataModeBadge from '../components/ui/DataModeBadge';
import MissingDaysBadge from '../components/ui/MissingDaysBadge';
import { getCompletenessTone, getMissingDaysStatus, getModeTone } from '../utils/status';

describe('StatusBadge', () => {
  it('renders semantic tone class, icon and text', () => {
    render(<StatusBadge variant="success">Fresh</StatusBadge>);
    const el = screen.getByText('Fresh');
    expect(el).toHaveClass('badge', 'badge-success');
    expect(el.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('maps legacy variants onto semantic tones', () => {
    expect(STATUS_TONE.demo).toBe('warning');
    expect(STATUS_TONE.import).toBe('info');
    expect(STATUS_TONE.google).toBe('info');
    expect(STATUS_TONE.stale).toBe('warning');
    expect(STATUS_TONE.muted).toBe('neutral');
    render(<StatusBadge variant="demo">DEMO MODE</StatusBadge>);
    expect(screen.getByText('DEMO MODE')).toHaveClass('badge-warning');
  });

  it('can hide the icon and only sets a role when asked', () => {
    render(<StatusBadge variant="neutral" icon={false}>3/14</StatusBadge>);
    const el = screen.getByText('3/14');
    expect(el.querySelector('svg')).toBeNull();
    expect(el).not.toHaveAttribute('role');
  });
});

describe('missing-days status', () => {
  it('is green when nothing is missing', () => {
    expect(getMissingDaysStatus(0, 14)).toEqual({ tone: 'success', label: 'No missing days' });
  });
  it('is amber for partial missing days', () => {
    expect(getMissingDaysStatus(3, 14)).toEqual({ tone: 'warning', label: '3 missing days' });
    expect(getMissingDaysStatus(1, 14).label).toBe('1 missing day');
  });
  it('is red when all required days are missing', () => {
    expect(getMissingDaysStatus(14, 14).tone).toBe('danger');
  });
  it('renders through MissingDaysBadge', () => {
    render(<MissingDaysBadge missing={14} total={14} />);
    expect(screen.getByRole('status')).toHaveClass('badge-danger');
  });
});

describe('mode and completeness tones', () => {
  it('demo is amber, import is info', () => {
    expect(getModeTone('demo')).toBe('warning');
    expect(getModeTone('import')).toBe('info');
  });
  it('google is success only when configured and connected', () => {
    expect(getModeTone('google')).toBe('info');
    expect(getModeTone('google', { configured: true, connected: false })).toBe('info');
    expect(getModeTone('google', { configured: true, connected: true })).toBe('success');
    render(<DataModeBadge mode="google" googleConfigured googleConnected={false} />);
    expect(screen.getByText('GOOGLE MODE')).not.toHaveClass('badge-success');
  });
  it('completeness: 100 green, partial amber, 0 red', () => {
    expect(getCompletenessTone(100)).toBe('success');
    expect(getCompletenessTone(57)).toBe('warning');
    expect(getCompletenessTone(0)).toBe('danger');
  });
});
