import { defineTheme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral';

/** Neutral paper by day; Deep Black by night. */
export const memoryTheme = defineTheme({
  name: 'am-paper-black',
  extends: neutralTheme,
  tokens: {
    '--color-background-body': ['#FAFAF8', '#000000'],
    '--color-background-surface': ['#FFFFFF', '#0A0A0A'],
    '--color-background-muted': ['#F1F2EF', '#171717'],
    '--color-background-popover': ['#FFFFFF', '#171717'],
    '--color-text-primary': ['#242824', '#FAFAFA'],
    '--color-text-secondary': ['#626A65', '#A3A3A3'],
    '--color-text-disabled': ['#929A95', '#737373'],
    '--color-accent': ['#344F48', '#FAFAFA'],
    '--color-accent-muted': ['#E7EEEA', '#171717'],
    '--color-text-accent': ['#344F48', '#FAFAFA'],
    '--color-on-accent': ['#FFFFFF', '#000000'],
    '--color-border': ['#DDDFDA', '#292929'],
    '--color-overlay-hover': ['#24282408', '#FAFAFA08'],
    '--color-overlay-pressed': ['#24282412', '#FAFAFA14'],
  },
});
