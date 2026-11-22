'use client';
import Link from 'next/link';
import { useState, type ComponentProps } from 'react';
/** Keep client navigation, but preload destinations only on pointer/keyboard intent. */
export function IntentLink(props: ComponentProps<typeof Link>) {
  const [intent, setIntent] = useState(false);
  return (
    <Link
      {...props}
      prefetch={intent ? null : false}
      onMouseEnter={(event) => {
        setIntent(true);
        props.onMouseEnter?.(event);
      }}
      onFocus={(event) => {
        setIntent(true);
        props.onFocus?.(event);
      }}
    />
  );
}
