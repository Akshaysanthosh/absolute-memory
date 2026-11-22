// Light status fills from @astryxdesign/theme-neutral for Chrome's badge API.
export const badgeColor = {
  success: '#198100',
  pending: '#ffce2f',
  error: '#c9303a',
};

export function statusBadge(status) {
  if (status === 'ready') return { icon: '✓', color: badgeColor.success };
  if (status === 'failed') return { icon: '!', color: badgeColor.error };
  return { icon: '…', color: badgeColor.pending };
}
